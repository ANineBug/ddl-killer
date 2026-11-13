# 后端

作业聚合 app 的服务器部分。TypeScript 写的接口，数据存在 PostgreSQL。

- 运行：Node 22.18 以上，直接跑 `.ts`，不需要编译
- 接口框架：[Hono](https://hono.dev/)
- 数据库：服务器上用 PostgreSQL；本机开发和测试用 [PGlite](https://pglite.dev/)（PostgreSQL 编译成的 WebAssembly 版），不用另装数据库，SQL 完全一样

## 跑起来

```bash
cd server
npm install
npm run dev        # 本机启动，http://localhost:8787/v1/health ，数据存在 server/.data/
npm test           # 跑全部测试（每个测试一个全新的内存数据库）
npm run typecheck  # 类型检查
```

本机没配邮件服务时，验证码会直接打印在终端里。

## 目录

```
migrations/001_init.sql   所有表。改表结构就新加 002_xxx.sql，不要改已经上线的文件
src/rules.ts              规则里的数字和纯计算：档位、门槛、分值、频率限制、邮箱白名单、课名教室规整
src/auth.ts               账号：验证码注册、密码登录、验证码找回密码
src/classes.ts            导入课表、认班、搜班、加入退出、每个人在班里的权重
src/homework.ts           作业、确认、表情、提议（纠错/更新/重复/不是重复）、加减分
src/chat.ts               班级聊天
src/board.ts              班级榜、总榜
src/app.ts                所有接口的地址
src/index.ts              启动入口，读环境变量
test/                     测试，按业务场景写的，可以当规则说明看
```

## 规则是怎么落地的

规则本身见业务思维导图（仓库里的 `docs/business-map.html`）。这里只记实现上的选择。

**认班（教学班怎么确定）**：教务页面只有调过课的课才带教学班 id，所以主要靠"时间 + 教室"认：

1. 带了教务教学班 id 的，按 id 认
2. 否则，同一学期，在同一间教室、同一个星期几的同样几节、而且有重叠的周上课，就是同一个班。课表里同一时间同一间教室只会有一门课，所以不比课名
3. 讲座场地、实践场地、线上这类不是真教室。一门课只要有一次在真教室上，就按真教室认；所有上课时间都在这种地方的，才用课名 + 老师 + 时间来认
4. 两边都有教务 id 但 id 不同，一定是两个班

**只收课程安排**：导入接口只接收学期、课名、老师、上课时间地点和周次，其他字段（学号、姓名）在进数据库前就丢掉了，有测试专门检查。

**门槛**：班级人数只算有权重的人（新同学不算）。门槛 = 人数 × 比例向上取整，再夹在上下限之间：

| 什么事 | 比例 | 最少 | 最多 |
|---|---|---|---|
| 确认作业 | 10% | 2 | 5 |
| 纠错、更新 | 10% | 2 | 5 |
| 截止时间往后推、改成待定、取消作业 | 15% | 3 | 8 |
| 重复、不是重复 | 5% | 2 | 3 |

**谁的票算数**：提议人自己那票不算。纠错和更新，上传者不投票，同意就点"采纳"，马上生效。重复类的提议没有"采纳"，只能投票。反对的权重先够门槛就否决。

**加分的时机**：

- 上传的作业，别人的确认够门槛 → 上传者 +10
- 纠错或更新靠投票通过 → 当场发分（纠错：提议人 +5、上传者 −5；更新：提议人 +3）
- 上传者自己采纳的 → 马上生效，但要等别人确认"改过之后的版本"够门槛才发分。防止自己的小号传、大号纠错、小号采纳来刷分
- 自己纠正自己：不加不减
- 合并重复：保留先传的那条。后传的上传者 −3，那条被确认拿到的 +10 也收回；拆回「不是重复」时这两笔都撤掉

**有争议时的提醒**：作业上有进行中的纠错或更新时，返回的 `earliestDue` 是现在的截止时间和提议里的截止时间中最早的那个，手机按它提醒。

**截止后**：作业过了截止时间，进行中的提议自动结束（每分钟扫一次，投票时也会先扫）。

## 接口一览

都以 `/v1` 开头。要登录的接口在请求头带 `Authorization: Bearer <凭证>`。出错时返回 `{ error: 代码, message: 给用户看的中文 }`。

| 方法 | 地址 | 谁能用 | 做什么 |
|---|---|---|---|
| POST | `/auth/code` | 所有人 | 发验证码 `{ email, purpose: 'register' \| 'reset' }`；注册时邮箱已有密码回 409，找回时邮箱没注册回 404 |
| POST | `/auth/register` | 所有人 | 注册 `{ email, code, password }`，返回凭证。密码 8–64 位，字母数字都要有 |
| POST | `/auth/login` | 所有人 | 登录 `{ email, password }`，返回凭证。同一邮箱 15 分钟错 10 次、同一 IP 错 30 次先锁住 |
| POST | `/auth/reset` | 所有人 | 找回密码 `{ email, code, password }`，返回新凭证；别的设备全部登出 |
| POST | `/auth/logout` | 登录 | 退出 |
| GET / PATCH | `/me` | 登录 | 我的信息和加入的班 / 改昵称 |
| POST | `/feedback` | 登录 | 意见反馈（问题 / 建议 / 其他），每人每天最多 5 条 |
| POST | `/me/import` | 登录 | 导入教务课表 `{ term, courses }` |
| PUT / DELETE | `/me/avatar` | 登录 | 上传头像（请求体就是图片，JPG/PNG/WebP，最大 2MB）/ 删掉头像 |
| GET | `/avatars/:id?v=` | 所有人 | 取头像图片。返回里的每个人都带 `avatar` 地址，没传过是 `null` |
| POST | `/classes/resolve` | 所有人 | 游客用：课表对应哪些已有的班（不建班、不加入） |
| GET | `/classes/search?term=&q=` | 所有人 | 按课名或老师搜班 |
| GET | `/classes/:id` | 所有人 | 班级信息 |
| POST / DELETE | `/classes/:id/join` | 登录 | 手动加入 / 退出 |
| GET | `/classes/:id/homework` | 所有人 | 作业列表 |
| POST | `/classes/:id/homework` | 班里的人 | 上传 |
| GET | `/homework/:id` | 所有人 | 详情，含改动记录、提议、合并进来的条目 |
| PATCH / DELETE | `/homework/:id` | 上传者，没人确认前 | 直接改 / 删 |
| POST | `/homework/:id/attachments` | 上传者，没人确认前 | 加附件：请求体就是文件，`X-File-Name` 头放 URL 编码的文件名。图片 / PDF / docx，每个最大 10MB，一条最多 6 个 |
| DELETE | `/attachments/:key` | 上传者，没人确认前 | 删附件 |
| GET | `/files/:key` | 所有人 | 下载附件。图片和 PDF 直接打开，Word 下载 |
| POST / DELETE | `/homework/:id/confirm` | 班里的人 | 确认 / 撤回确认 |
| PUT / DELETE | `/homework/:id/reactions/thumbs` 或 `cry` | 班里的人 | 赞 / 下雨 |
| POST | `/homework/:id/proposals` | 班里的人 | 「有问题」：`{ kind, changes?, targetId?, reason }`。重复合并时留下先传的；后传的确认分收回、再扣 3 分，确认转给先传的；拆回来全部退还 |
| POST | `/proposals/:id/vote` | 班里的人 | 投票 `{ agree }` |
| POST | `/proposals/:id/adopt` | 上传者 | 采纳 |
| POST | `/proposals/:id/withdraw` | 提议人 | 撤回 |
| GET | `/classes/:id/board` | 所有人 | 班级榜 |
| GET | `/board?period=…`（all / month / week） | 所有人 | 总分榜：总榜 / 月榜（每月 1 号起）/ 周榜（每周一起），登录了会带上自己的名次 |
| GET / POST | `/classes/:id/messages` | 班里的人 | 聊天：`?after=` 拿新消息、`?before=` 翻历史 / 发消息 `{ text, homeworkId? }` |
| DELETE | `/admin/messages/:id`、`/admin/homework/:id` | 管理员 | 删消息、删作业 |
| POST | `/admin/users/:id/demote` | 管理员 | 降级账号 `{ demoted }` |

第一个管理员要在数据库里手动设：`update users set is_admin = true where email = '你的邮箱';`

## 部署到服务器（还没做，步骤先记下）

需要你自己准备的：

1. **一台日本的服务器**：1 核 1G 就够试点用，Ubuntu 24.04。要选到大陆线路好的（比如带 CN2 线路的），买之前最好先用测速工具从成都测一下延迟
2. **一个域名**：两个地方要用。app 正式包默认只允许 https，所以接口要有域名和证书；Resend 也要求用自己的域名当发件人
3. **Resend 账号**：在 Resend 里添加域名，按提示加几条 DNS 记录验证，然后拿到 API Key

服务器上要装的：Node 24、PostgreSQL、[Caddy](https://caddyserver.com/)。Caddy 负责 https 证书（自动申请和续期），把请求转给本机 8787 端口。

环境变量（写在 `server/.env`，不要提交进仓库）：

```
NODE_ENV=production
DATABASE_URL=postgres://用户名:密码@localhost:5432/homework
SECRET=一串随机的长字符串
RESEND_API_KEY=re_xxx
MAIL_FROM=作业提醒 <noreply@你的域名>
FEEDBACK_TO=开发者收反馈的邮箱（选填，不填就只存数据库）
PORT=8787
```

## 还没做的

- **app 接上后端**：登录页、导入后归班、作业同步、确认和提议的界面、聊天、排行榜。现在 app 还是纯本地数据
- **每日邮件摘要**和"截止时间改了"的通知
- **聊天实时推送**：现在是 app 隔几秒拉一次新消息，人多了再换成长连接
- **管理后台界面**：现在只有接口
