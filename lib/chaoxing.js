// 超星学习通（Chaoxing / 超星泛雅）最小客户端
// 仅使用 Node 内置模块：crypto、https、fetch(Node18+)

const crypto = require('node:crypto');

const AES_KEY = 'u2oh6Vu^HWe4_AES'; // 超星前端固定 AES-128-CBC key/iv

function encryptPassword(password) {
  const key = Buffer.from(AES_KEY, 'utf8');
  const iv = Buffer.from(AES_KEY, 'utf8');
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  let out = cipher.update(password, 'utf8', 'base64');
  out += cipher.final('base64');
  return out;
}

class CookieJar {
  constructor() { this.map = new Map(); }
  addFromResponse(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const pair = c.split(';')[0];
      const idx = pair.indexOf('=');
      if (idx > 0) this.map.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  get(name) { return this.map.get(name); }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

class Chaoxing {
  constructor(opts = {}) {
    this.jar = opts.jar || new CookieJar();
    this.uid = null;
    this.name = null;
  }

  async req(url, { method = 'GET', body, headers = {}, redirect = 'follow' } = {}) {
    const h = {
      'User-Agent': UA,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      ...headers,
    };
    const cookie = this.jar.header();
    if (cookie) h['Cookie'] = cookie;
    const res = await fetch(url, { method, headers: h, body, redirect });
    this.jar.addFromResponse(res);
    return res;
  }

  async login(uname, password) {
    // 1. 先访问登录页拿初始 cookie
    await this.req('https://passport2.chaoxing.com/login?fid=&newversion=true&refer=https%3A%2F%2Fi.chaoxing.com');
    // 2. 提交登录
    const form = new URLSearchParams({
      uname,
      password: encryptPassword(password),
      fid: '-1',
      refer: 'https%3A%2F%2Fi.chaoxing.com',
      t: 'true',
      forbidotherlogin: '0',
      validate: '',
    });
    const res = await this.req('https://passport2.chaoxing.com/fanyalogin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: form.toString(),
    });
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch { return { ok: false, raw: txt.slice(0, 300) }; }
    if (json.status === true) {
      this.uid = this.jar.get('_uid');
      return { ok: true, url: json.url || '' };
    }
    return { ok: false, msg: json.msg || json.message || JSON.stringify(json).slice(0, 300) };
  }

  // 课程列表
  async getCourses() {
    const res = await this.req('https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1');
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch { return { ok: false, raw: txt.slice(0, 300) }; }
    const list = [];
    for (const ch of json.channelList || []) {
      const c = ch.content && ch.content.course;
      if (!c || !c.data) continue;
      for (const d of c.data) {
        list.push({
          courseId: String(d.id),
          classId: String(ch.content.id || d.classid || ''),
          name: d.name || ch.content.name || '',
          teacher: d.teacherfactor || '',
        });
      }
    }
    return { ok: true, courses: list };
  }

  // 课程中页：解析模块所需票据（enc/cpi/openc/fid）
  async getCourseParams(courseId, classId) {
    const url = `https://mooc1.chaoxing.com/visit/stucoursemiddle?courseid=${courseId}&clazzid=${classId}&vc=1&cpi=0`;
    const res = await this.req(url);
    const html = await res.text();
    return {
      enc: (html.match(/enc=([a-f0-9]{32})/) || [])[1] || '',
      cpi: (html.match(/cpi=(\d+)/) || [])[1] || '',
      openc: (html.match(/openc=([a-f0-9]+)/) || [])[1] || '',
      fid: (html.match(/fid=(\d+)/) || [])[1] || '',
    };
  }

  // 作业列表
  async getWorks(courseId, classId, p) {
    const url = `https://mooc1.chaoxing.com/work/getAllWork?classId=${classId}&courseId=${courseId}&isdisplaytable=2&mooc=1&ut=s&enc=${p.enc}&cpi=${p.cpi}&openc=${p.openc}`;
    const res = await this.req(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    return await res.text();
  }

  // 考试
  async getExams(courseId, classId, p) {
    const url = `https://mooc1.chaoxing.com/exam-ans/exam/test?classId=${classId}&courseId=${courseId}&ut=s&enc=${p.enc}&cpi=${p.cpi}&openc=${p.openc}`;
    const res = await this.req(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    return await res.text();
  }

  // 讨论
  async getDiscussions(courseId, classId, p) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/bbscircle/grouptopic?courseId=${courseId}&clazzid=${classId}&showChooseClazzId=${classId}&ut=s&enc=${p.enc}&cpi=${p.cpi}&openc=${p.openc}`;
    const res = await this.req(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    return await res.text();
  }

  // 课堂活动（随堂练习/签到/讨论/投票/分组任务）
  async getActivities(courseId, classId, fid) {
    const url = `https://mobilelearn.chaoxing.com/widget/pcpick/stu/index?courseId=${courseId}&jclassId=${classId}&fid=${fid}`;
    const res = await this.req(url);
    return await res.text();
  }
}

module.exports = { Chaoxing, encryptPassword, CookieJar, UA };
