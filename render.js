const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function isPendingWork(w) {
  const s = (w.status || '').replace(/\s/g, '');
  const href = w.href || '';
  if (/未交|未提交|未完成|待提交|待完成|待做|已过期/.test(s)) return true;
  if (/已完成|已提交|已交|已批阅|待批阅|已批改|待评分/.test(s)) return false;
  // 状态为空时按链接判断：能进入「查看作业」说明已提交
  if (/viewWork|selectWorkQuestionYiPiYue|evaluation/.test(href)) return false;
  if (/selectWorkQuestion/.test(href)) return true;
  if (/开始答题|去完成|开始作答|做作业|作答/.test(w.btn || '')) return true;
  return false;
}

function isPendingExam(e) {
  const s = (e.status || '').replace(/\s/g, '');
  const href = e.href || '';
  if (/未参加|未完成|待参加|去考试/.test(s)) return true;
  if (/已完成|已参加|已提交|已交卷|已结束|待批阅|待评分|待批改/.test(s)) return false;
  if (/exam\/test\/start|exam-ans\/exam\/test\?/.test(href) || /开始考试|去考试/.test(e.btn || '')) return true;
  return !s; // 无状态时按待办处理
}

function fmt(d) {
  return d ? new Date(d).toLocaleString('zh-CN', { hour12: false }) : '';
}

function readSavedMonth() {
  try {
    return JSON.parse(require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'filter.json'), 'utf8')).fromMonth || '';
  } catch (e) { return ''; }
}

function renderReport(courses, myUid) {
  // 汇总所有未完成任务为扁平数据，交给前端按起始月份筛选渲染
  const items = [];
  for (const co of courses) {
    for (const w of (co.works || []).filter(isPendingWork)) {
      items.push({ c: co.name, type: 'work', t: w.title, s: w.status, e: w.end, sc: w.score });
    }
    for (const ex of (co.exams || []).filter(isPendingExam)) {
      items.push({ c: co.name, type: 'exam', t: ex.title, s: ex.status, e: ex.end });
    }
    for (const a of (co.activities || [])) {
      items.push({ c: co.name, type: 'act', t: a.title, s: a.status, e: '', tag: a.type });
    }
  }
  const dataJson = JSON.stringify(items).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<title>学习通待办看板</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:28px;background:#f4f5f7;font:15px/1.55 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#222}
h1{font-size:22px;margin:0 0 6px}
.sub{color:#777;font-size:13px;margin-bottom:14px}
.filter{background:#fff;border-radius:10px;padding:12px 18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.07);display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:14px}
.filter select{padding:5px 10px;border:1px solid #d9dce1;border-radius:6px;font-size:14px;background:#fff;color:#222}
.filter button{padding:5px 14px;border:1px solid #d9dce1;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;color:#555}
.filter button:hover{border-color:#1A6FD8;color:#1A6FD8}
.filter .hint{color:#999;font-size:12px}
.stats{display:flex;gap:14px;margin-bottom:22px;flex-wrap:wrap}
.stat{background:#fff;border-radius:10px;padding:14px 22px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
.stat b{display:block;font-size:26px;color:#d4380d}
.stat span{color:#666;font-size:13px}
.card{background:#fff;border-radius:10px;padding:16px 20px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
.card header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;padding-bottom:10px;margin-bottom:10px}
.card h3{margin:0;font-size:16px}
.count{color:#d4380d;font-size:13px}
h4{margin:14px 0 6px;font-size:14px;color:#444;font-weight:600}
h4 em{font-style:normal;color:#d4380d}
ul{margin:0;padding-left:18px}
li{margin:7px 0;list-style:none}
.t{color:#222}
.m{color:#999;font-size:12px;margin-left:10px}
.bd{display:inline-block;font-size:12px;padding:1px 8px;border-radius:10px;margin-right:8px}
.bd.over{background:#ffece8;color:#d4380d;font-weight:600}
.bd.today{background:#fff1b8;color:#a37f00;font-weight:600}
.bd.soon{background:#ffe9c7;color:#c26a00;font-weight:600}
.bd.ok{background:#eaf3ff;color:#1A6FD8}
.bd.none{background:#eee;color:#888}
.tag{display:inline-block;background:#eaf3ff;color:#1A6FD8;font-size:12px;padding:1px 6px;border-radius:3px;margin-right:8px}
.empty{text-align:center;color:#999;padding:60px 0}
footer{margin-top:26px;color:#aaa;font-size:12px;line-height:1.8}
</style></head>
<body>
<h1>学习通待办看板</h1>
<div class="sub">更新时间：${fmt(Date.now())}</div>
<div class="filter">
  <span>只看从</span>
  <select id="fromSel"></select>
  <span>开始截止的任务</span>
  <button id="allBtn">显示全部</button>
  <span class="hint" id="note"></span>
</div>
<div class="stats">
  <div class="stat"><b id="nWork">0</b><span>待交作业</span></div>
  <div class="stat"><b id="nExam">0</b><span>待考考试</span></div>
  <div class="stat"><b id="nAct">0</b><span>课堂活动/随堂练习</span></div>
</div>
<div id="cards"></div>
<footer>
数据来源：学习通网页版各课程「作业」「考试」「任务」模块。<br>
账号 uid：${esc(myUid || '未获取')} ｜ 仅供个人查看
</footer>
<script>
var DATA = ${dataJson};
var SAVED_MONTH = ${JSON.stringify(readSavedMonth())};

function esc2(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function pdate(e) { return e ? new Date(e.replace(' ', 'T')) : null; }

// 截止日期标记：已过期 / 今天截止 / 剩N天
function badge(e) {
  var d = pdate(e);
  if (!d || isNaN(d)) return '<span class="bd none">无截止时间</span>';
  var now = new Date();
  if (now > d) {
    var ex = Math.ceil((now - d) / 86400000);
    return '<span class="bd over">已过期' + (ex > 0 ? ex + '天' : '') + '</span>';
  }
  var days = Math.ceil((d - now) / 86400000);
  if (days <= 0) return '<span class="bd today">今天截止</span>';
  if (days <= 3) return '<span class="bd soon">剩' + days + '天</span>';
  return '<span class="bd ok">剩' + days + '天</span>';
}

// 从数据中出现的最早年月到当前月生成选项
function buildOptions() {
  var months = [];
  for (var i = 0; i < DATA.length; i++) {
    var it = DATA[i];
    if (it.e && it.e.length >= 7) months.push(it.e.slice(0, 7));
  }
  var now = new Date();
  var cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  months.push(cur);
  months.sort();
  var min = months[0], max = months[months.length - 1];
  if (min > cur) { min = cur; max = cur; }
  var opts = [''];
  var p = min.split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
  while (opts.length < 240) {
    var s = y + '-' + String(m).padStart(2, '0');
    opts.push(s);
    if (s === max) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  var html = '<option value="">全部时间</option>';
  for (var j = 1; j < opts.length; j++) {
    html += '<option value="' + opts[j] + '">' + opts[j] + '</option>';
  }
  document.getElementById('fromSel').innerHTML = html;
}

function render(fromStr) {
  var from = fromStr ? new Date(fromStr + '-01T00:00:00') : null;
  var shown = [];
  for (var i = 0; i < DATA.length; i++) {
    var it = DATA[i];
    if (!from || !it.e) { shown.push(it); continue; }
    var d = pdate(it.e);
    if (d && !isNaN(d) && d >= from) shown.push(it);
  }
  var nw = 0, ne = 0, na = 0;
  var groups = [], idx = {};
  for (var k = 0; k < shown.length; k++) {
    var s2 = shown[k];
    if (s2.type === 'work') nw++;
    else if (s2.type === 'exam') ne++;
    else na++;
    if (!(s2.c in idx)) { idx[s2.c] = groups.length; groups.push({ c: s2.c, items: [] }); }
    groups[idx[s2.c]].items.push(s2);
  }
  document.getElementById('nWork').textContent = nw;
  document.getElementById('nExam').textContent = ne;
  document.getElementById('nAct').textContent = na;
  document.getElementById('note').textContent = '当前显示 ' + shown.length + ' 项（全部 ' + DATA.length + ' 项）';

  var html = '';
  for (var g = 0; g < groups.length; g++) {
    var gr = groups[g];
    gr.items.sort(function (a, b) {
      var da = pdate(a.e), db = pdate(b.e);
      if (!da || isNaN(da)) return 1;
      if (!db || isNaN(db)) return -1;
      return da - db;
    });
    var cnt = { work: 0, exam: 0, act: 0 };
    var li = { work: '', exam: '', act: '' };
    for (var q = 0; q < gr.items.length; q++) {
      var it2 = gr.items[q];
      var meta = (it2.s ? esc2(it2.s) + ' · ' : '') + (it2.e ? '截止 ' + esc2(it2.e) : '无截止时间') + (it2.sc ? ' · ' + esc2(it2.sc) : '');
      if (it2.type === 'work') {
        li.work += '<li>' + badge(it2.e) + '<span class="t">' + esc2(it2.t) + '</span><span class="m">' + meta + '</span></li>';
      } else if (it2.type === 'exam') {
        li.exam += '<li>' + badge(it2.e) + '<span class="t">' + esc2(it2.t) + '</span><span class="m">' + meta + '</span></li>';
      } else {
        li.act += '<li><span class="tag">' + esc2(it2.tag || '活动') + '</span><span class="t">' + esc2(it2.t) + '</span><span class="m">' + (it2.s ? esc2(it2.s) : '进行中') + '</span></li>';
      }
      cnt[it2.type]++;
    }
    var blocks = '';
    if (li.work) blocks += '<h4>待交作业 <em>' + cnt.work + '</em></h4><ul>' + li.work + '</ul>';
    if (li.exam) blocks += '<h4>待考考试 <em>' + cnt.exam + '</em></h4><ul>' + li.exam + '</ul>';
    if (li.act) blocks += '<h4>课堂活动/随堂练习 <em>' + cnt.act + '</em></h4><ul>' + li.act + '</ul>';
    html += '<section class="card"><header><h3>' + esc2(gr.c) + '</h3><span class="count">' + gr.items.length + ' 项待办</span></header>' + blocks + '</section>';
  }
  if (!html) html = '<div class="empty">该时间范围内没有待办事项</div>';
  document.getElementById('cards').innerHTML = html;
}

var sel = document.getElementById('fromSel');
buildOptions();

// 持久化：服务端 filter.json 为主（跨浏览器、跨刷新），localStorage 兜底
function persist(v) {
  try { localStorage.setItem('fromMonth', v); } catch (e) {}
  try {
    fetch('http://127.0.0.1:7788/setfilter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: v })
    }).catch(function () {});
  } catch (e) {}
}

function apply(v) {
  sel.value = v;
  render(v);
}

var initial = SAVED_MONTH;
try {
  var ls = localStorage.getItem('fromMonth');
  if (ls !== null && ls !== '') initial = ls;
} catch (e) {}
apply(initial);
try {
  fetch('http://127.0.0.1:7788/getfilter')
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var sv = (j && typeof j.fromMonth === 'string') ? j.fromMonth : '';
      if (sv !== initial) {
        if (sv) { apply(sv); }        // 服务器有更新的选择，以服务器为准
        else { persist(initial); }    // 服务器为空而本地有旧选择，把旧选择迁移到服务器
      }
    })
    .catch(function () {});
} catch (e) {}

sel.addEventListener('change', function () {
  persist(sel.value);
  render(sel.value);
});
document.getElementById('allBtn').addEventListener('click', function () {
  persist('');
  apply('');
});
</script>
</body></html>`;
}

module.exports = { renderReport, isPendingWork, isPendingExam };
