const fs = require('node:fs');
const path = require('node:path');
const { Chaoxing } = require('./lib/chaoxing');

const ROOT = path.resolve(__dirname);
const CONFIG_PATH = path.join(ROOT, 'config.json');

// 优先读环境变量，其次 config.json；两者都没有就报错
function loadConfig() {
  let cfg = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
    catch (e) { throw new Error('config.json 不是合法 JSON'); }
  }
  const envUser = process.env.CX_USER || process.env.CHAOXING_USER;
  const envPass = process.env.CX_PASSWORD || process.env.CHAOXING_PASSWORD;
  const merged = { ...cfg, uname: envUser || cfg.uname, password: envPass || cfg.password };
  if (!merged.uname || !merged.password) {
    throw new Error('缺少账号密码：复制 config.example.json 为 config.json 填写，或设置环境变量 CX_USER / CX_PASSWORD');
  }
  return merged;
}

function decodeEntities(s = '') {
  return s.replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(s = '') {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// ---------- 作业 ----------
function parseWorks(html) {
  const items = [];
  // 作业项 li 有两种结构：老版 <li class="lookLi" style="padding:30px 0">、
  // 新版待做作业 <li style="padding:30px 0">（无 lookLi，标题是 inspectTask 链接）
  const blocks = html.split(/<li\s+(?:class="[^"]*"\s*)?style="padding:30px 0"[^>]*>/).slice(1);
  for (const b of blocks) {
    if (!b.includes('作业状态')) continue;
    const tm = b.match(/<a\s+href="([^"]*)"[^>]*title="([^"]*)"/) || b.match(/class="inspectTask"[^>]*title="([^"]*)"/) || b.match(/title="([^"]{2,200})"/);
    if (!tm) continue;
    const title = stripTags(tm[2] || tm[1] || '');
    const href = decodeEntities(tm[1] || '');
    const workId = (b.match(/workId=(\d+)/) || b.match(/data="(\d+)"/) || [])[1] || '';
    const start = stripTags((b.match(/开始时间：<\/span>([^<]*)</) || [])[1] || '');
    const end = stripTags((b.match(/截止时间：<\/span>([^<]*)</) || [])[1] || '');
    const status = stripTags((b.match(/作业状态：<\/span>[\s\S]{0,600}?<strong>([\s\S]{0,120}?)<\/strong>/) || [])[1] || '');
    const btn = stripTags((b.match(/class="Btn_(?:blue|red)_1[^"]*"[^>]*>\s*<span>([^<]*)</) || [])[1] || '');
    const score = (b.match(/class="fl">\s*([\d.]+\s*分)/) || [])[1] || '';
    items.push({ title, workId, href, btn, start, end, status, score: score.trim() });
  }
  return items;
}

// ---------- 考试 ----------
function parseExams(html) {
  const items = [];
  const blocks = html.split(/<li\s+class="lookLi"|<li\s+class="examLi"/).slice(1);
  for (const b of blocks) {
    const tm = b.match(/<a[^>]+title="([^"]{2,200})"[^>]*>/);
    if (!tm) continue;
    const title = stripTags(tm[1]);
    if (/^(首页|资料|通知|作业|考试|讨论|统计|任务|直播课)/.test(title)) continue;

    const timeRange = stripTags((b.match(/考试时间：<\/span>([^<]*)</) || [])[1] || '');
    let start = '', end = '';
    if (timeRange.includes('至')) {
      const parts = timeRange.split('至');
      start = parts[0].trim();
      end = parts[1].trim();
    } else {
      start = stripTags((b.match(/开始时间：<\/span>([^<]*)</) || [])[1] || '');
      end = stripTags((b.match(/(?:截止|结束)时间：<\/span>([^<]*)</) || [])[1] || '');
    }
    const status = stripTags((b.match(/考试状态：<\/span>([\s\S]{0,800}?)<\/span>/) || [])[1] || '');
    const href = decodeEntities((b.match(/<a[^>]+href="([^"]+)"/) || [])[1] || '');
    const btn = stripTags((b.match(/class="Btn_blue_1[^"]*"[^>]*>\s*<span>([^<]*)</) || [])[1] || '');
    items.push({ title, start, end, status, href, btn });
  }
  return items;
}

// ---------- 讨论 ----------
function parseDiscussions(html, myUid) {
  const items = [];
  const blocks = html.split(/<div\s+class="content1118"\s+id="topic_/).slice(1);
  for (const b of blocks) {
    const topicId = (b.match(/^(\d+)/) || [])[1] || '';
    const t = b.match(/<h3[^>]*>([\s\S]{0,400}?)<\/h3>/);
    if (!t) continue;
    const title = stripTags(t[1]);
    const author = stripTags((b.match(/<span\s+class="name">([^<]*)</) || [])[1] || '');
    const time = stripTags((b.match(/<span\s+class="danwei">([^<]*)</) || [])[1] || '');

    // 回复总数
    const replyTotal = Number((b.match(/查看全部（\s*(\d+)\s*条）/) || [])[1] || 0);
    const visibleReplies = (b.match(/class="replyCt"/g) || []).length;

    // 我是否回复：匹配自己的头像 uid
    let mine = false;
    if (myUid) {
      const re = new RegExp('photo\\.chaoxing\\.com/p/' + myUid + '_');
      if (re.test(b)) mine = true;
      if (new RegExp('/u/[\\d/]+/' + myUid).test(b)) mine = true;
    }
    items.push({
      topicId, title, author, time,
      replyTotal: Math.max(replyTotal, visibleReplies),
      visibleReplies,
      replied: mine,
      // 折叠且未见自己回复时无法确定
      uncertain: !mine && replyTotal > visibleReplies,
    });
  }
  return items;
}

// ---------- 课堂活动（随堂练习/签到/讨论/投票/分组任务） ----------
function parseActivities(html) {
  const start = [];
  const finished = [];
  // 进行中区段 / 已结束区段
  const idxEnd = html.indexOf('已结束(');
  const activePart = idxEnd > 0 ? html.slice(0, idxEnd) : html;
  const endPart = idxEnd > 0 ? html.slice(idxEnd) : '';
  const puid = (html.match(/id="puid"\s+value="(\d+)"/) || [])[1] || '';

  const collect = (part, bucket) => {
    const blocks = part.split(/<div\s+class="Mct"/).slice(1);
    for (const b of blocks) {
      const m = b.match(/activeDetail\s*\(\s*(\d+)\s*,\s*(\d+)/);
      const type = stripTags((b.match(/<dd[^>]*>([^<]*)</) || [])[1] || '');
      const tm = b.match(/<div\s+class="Mct_center[^>]*>\s*<a[^>]*>([\s\S]{0,200}?)<\/a>/);
      const title = tm ? stripTags(tm[1]) : '';
      const status = stripTags((b.match(/<p\s+class="fr pzt"><[^>]*>([^<]*)</) || [])[1] || '');
      if (!title) continue;
      bucket.push({
        activeId: m ? m[1] : '',
        appType: m ? m[2] : '',
        type,
        title,
        status,
      });
    }
  };
  collect(activePart, start);
  collect(endPart, finished);
  return { puid, ongoing: start, finished };
}

async function main() {
  const cfg = loadConfig();

  // 只重建看板：node study-tracker.js --render-only
  if (process.argv.includes('--render-only')) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
    const { renderReport } = require('./render');
    fs.writeFileSync(path.join(ROOT, 'report.html'), renderReport(d.courses, d.myUid), 'utf8');
    console.log('已用现有 data.json 重建：' + path.join(ROOT, 'report.html'));
    return;
  }

  const client = new Chaoxing();

  console.log('[1/4] 登录中...');
  const login = await client.login(cfg.uname, cfg.password);
  if (!login.ok) {
    console.error('登录失败:', login.msg || login.raw || '');
    process.exit(1);
  }
  console.log('登录成功');

  console.log('[2/4] 获取课程列表...');
  const cr = await client.getCourses();
  if (!cr.ok) {
    console.error('获取课程失败:', cr.raw);
    process.exit(1);
  }
  let courses = cr.courses;
  if (cfg.filter === 'active') courses = courses.filter(x => !/师生服务/.test(x.name));
  console.log(`共 ${courses.length} 门课程`);

  console.log('[3/4] 抓取各课程数据...');
  const results = [];
  let myUid = '';
  const showDiscussion = cfg.showDiscussion === true;

  for (let i = 0; i < courses.length; i++) {
    const co = courses[i];
    process.stdout.write(`  (${i + 1}/${courses.length}) ${co.name} ... `);
    try {
      const p = await client.getCourseParams(co.courseId, co.classId);
      if (!p.enc) { console.log('跳过（无票据参数）'); continue; }

      const worksHtml = await client.getWorks(co.courseId, co.classId, p).catch(() => '');
      const examsHtml = await client.getExams(co.courseId, co.classId, p).catch(() => '');
      const discHtml = showDiscussion ? await client.getDiscussions(co.courseId, co.classId, p).catch(() => '') : '';
      const actHtml = await client.getActivities(co.courseId, co.classId, p.fid).catch(() => '');

      const acts = parseActivities(actHtml);
      if (!myUid && acts.puid) myUid = acts.puid;

      const works = parseWorks(worksHtml);
      const exams = parseExams(examsHtml);
      const discussions = showDiscussion ? parseDiscussions(discHtml, myUid) : [];

      results.push({
        courseId: co.courseId,
        classId: co.classId,
        name: co.name,
        teacher: co.teacher,
        works, exams, discussions,
        activities: acts.ongoing,
        activitiesFinished: acts.finished.length,
      });
      console.log(`作业${works.length} 考试${exams.length} 讨论${discussions.length} 活动${acts.ongoing.length}`);
    } catch (e) {
      console.log('失败:', e.message);
    }
  }

  fs.writeFileSync(path.join(ROOT, 'data.json'), JSON.stringify({ updatedAt: new Date().toISOString(), myUid, courses: results }, null, 2), 'utf8');

  console.log('[4/4] 生成看板...');
  const { renderReport } = require('./render');
  fs.writeFileSync(path.join(ROOT, 'report.html'), renderReport(results, myUid), 'utf8');
  console.log('完成：' + path.join(ROOT, 'report.html'));
}

main().catch(e => {
  console.error('出错:', e.message);
  process.exit(1);
});
