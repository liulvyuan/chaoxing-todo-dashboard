const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, exec } = require('node:child_process');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 7788);
const INTERVAL_MS = Number(process.env.INTERVAL_MIN || 30) * 60 * 1000;
const FILTER_PATH = path.join(ROOT, 'filter.json');

function readFilter() {
  try {
    return JSON.parse(fs.readFileSync(FILTER_PATH, 'utf8')).fromMonth || '';
  } catch (e) { return ''; }
}

function writeFilter(month) {
  fs.writeFileSync(FILTER_PATH, JSON.stringify({ fromMonth: month }), 'utf8');
}

let running = false;

function refresh(cb) {
  if (running) {
    if (cb) cb('busy');
    return;
  }
  running = true;
  const started = Date.now();
  const p = spawn(process.execPath, [path.join(ROOT, 'study-tracker.js')], { cwd: ROOT });
  let out = '';
  p.stdout.on('data', d => { out += d.toString(); process.stdout.write(d); });
  p.stderr.on('data', d => { out += d.toString(); process.stderr.write(d); });
  p.on('close', code => {
    running = false;
    console.log(`[refresh] 完成 code=${code} 用时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (cb) cb(code === 0 ? 'ok' : 'fail');
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const f = path.join(ROOT, 'report.html');
    if (fs.existsSync(f)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(f));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<meta charset="utf-8"><p>首次抓取中，请稍候刷新…</p>');
    }
    return;
  }
  if (url.pathname === '/data.json') {
    const f = path.join(ROOT, 'data.json');
    if (fs.existsSync(f)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(f));
    } else {
      res.writeHead(404); res.end('{}');
    }
    return;
  }
  if (url.pathname === '/getfilter') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ fromMonth: readFilter() }));
    return;
  }
  if (url.pathname === '/setfilter') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const j = JSON.parse(body || '{}');
        const m = String(j.month || '');
        if (m === '' || /^\d{4}-\d{2}$/.test(m)) {
          writeFilter(m);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: true, fromMonth: m }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: false, msg: 'bad month' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: false, msg: 'bad json' }));
      }
    });
    return;
  }
  if (url.pathname === '/refresh') {
    refresh(s => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ result: s }));
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log('看板已在运行，直接打开浏览器');
    exec(`start "" http://127.0.0.1:${PORT}`, { shell: 'cmd.exe' });
    setTimeout(() => process.exit(0), 1200);
    return;
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`看板已启动：http://127.0.0.1:${PORT}`);
  console.log(`每 ${INTERVAL_MS / 60000} 分钟自动刷新一次数据`);
  if (!process.env.NO_OPEN) {
    exec(`start "" http://127.0.0.1:${PORT}`, { shell: 'cmd.exe' });
  }
  refresh();
  setInterval(() => refresh(), INTERVAL_MS);
});
