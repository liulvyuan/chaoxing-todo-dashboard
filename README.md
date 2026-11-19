# 学习通待办看板（Chaoxing Todo Dashboard）

把超星学习通（泛雅）里的待办一次性拉到本地，用一个静态 HTML 看板展示：**未交作业、待考考试、进行中的课堂活动**。不用每天翻课程页，也不依赖任何第三方服务。

- 零第三方依赖：只用 Node.js 内置模块（`node:fs`、`node:http`、`node:crypto`、内置 `fetch`）
- 纯本地运行：账号密码、抓取结果、生成的页面都只在你自己的电脑上
- 只读：只抓页面状态，不会替你做作业、签到、考试、发讨论
- 两种看法：静态 `report.html`，或 `127.0.0.1:7788` 的本地服务，每 30 分钟自动刷新

## 快速开始

要求 Node.js 18+（内置 `fetch` 和 `getSetCookie`）。

```bash
# 1. 配置账号
copy config.example.json config.json    # Windows
cp config.example.json config.json      # macOS / Linux
# 然后编辑 config.json 填入 uname / password

# 2. 抓一次，生成 report.html
node study-tracker.js

# 3. 起本地看板（每 30 分钟自动刷新，浏览器自动打开）
node server.js
```

Windows 上也可以直接双击 `start.bat`（常驻看板）或 `refresh.bat`（抓一次并打开报告）。

不想把密码写进文件时，用环境变量：

```bash
set CX_USER=你的手机号
set CX_PASSWORD=你的密码
node study-tracker.js
```

## 配置项

| 字段 | 说明 |
| --- | --- |
| `uname` | 学习通账号（一般是手机号） |
| `password` | 学习通密码 |
| `filter` | `active` 时跳过“师生服务”这类不产生待办的课程 |
| `showDiscussion` | 设为 `true` 才抓讨论区话题（默认关闭） |

`filter.json` 是看板上“从某月起”的筛选状态，由页面按钮写入，可不管。

## 它抓了哪些接口

| 内容 | 接口 |
| --- | --- |
| 登录 | `passport2.chaoxing.com/fanyalogin`（密码用超星前端固定的 AES-128-CBC 加密后提交） |
| 课程列表 | `mooc1-api.chaoxing.com/mycourse/backclazzdata` |
| 票据参数 | `mooc1.chaoxing.com/visit/stucoursemiddle`（从中取 `enc` / `cpi` / `openc` / `fid`） |
| 作业 | `mooc1.chaoxing.com/work/getAllWork` |
| 考试 | `mooc1.chaoxing.com/exam-ans/exam/test` |
| 讨论 | `mooc1.chaoxing.com/mooc-ans/bbscircle/grouptopic` |
| 课堂活动 | `mobilelearn.chaoxing.com/widget/pcpick/stu/index` |

所有接口都返回 HTML，解析靠正则（`parseWorks` / `parseExams` / `parseDiscussions` / `parseActivities`），因为超星页面有新旧两套结构，代码里两种 `li` 布局都兼容。单次全量抓取约 20 秒。

## 目录结构

```
study-tracker.js   主程序：登录 → 课程列表 → 逐课抓取 → 解析 → 写 data.json + report.html
lib/chaoxing.js    接口层：登录加密、Cookie 管理、上面几类接口
render.js          把 data.json 渲染成自包含的 HTML 看板
server.js          本地服务：127.0.0.1:7788，定时刷新，提供 /refresh、/setfilter
start.bat          起看板
refresh.bat        抓一次并打开 report.html
config.example.json 配置模板
```

产物：`data.json`（原始结构化结果）、`report.html`（看板）。

`node study-tracker.js --render-only` 可以不重新抓取，仅用现有 `data.json` 重建看板。

## 已知限制

- 接口是网页端逆向解析，超星改版会导致某些字段失效，此时对应区块会显示为空而不是报错
- 作业/考试状态为空但能点“查看”的页面，按已提交处理
- 讨论区“我是否回复”靠头像 uid 匹配，折叠的回复可能判断为“不确定”
- 未处理验证码、二次验证、滑块等风控场景

## 免责声明

本项目仅供个人学习与效率工具研究。账号密码只存在你本机的 `config.json`（已在 `.gitignore` 中）。请遵守超星及所在院校的使用条款，使用风险自负。

## License

MIT，见 [LICENSE](LICENSE)。
