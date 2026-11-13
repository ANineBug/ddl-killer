# DDL斩

西南财经大学同学一起记作业的安卓 App。一个人上传，同一个教学班的同学都能看到，按截止时间提醒，别再错过 DDL。

- 官网和下载：<https://ninebug.xyz>
- 安装包：[最新 Release](https://github.com/ANineBug/ddl-killer/releases/latest)（仅支持 arm64 安卓手机）

## 能做什么

- **课表**：在 app 里登录教务网页，一键导入课表；同课的同学自动进同一个教学班
- **作业**：上传作业（截止时间、提交方式、附件），同学确认、纠错、标记重复；完成后自动归档
- **提醒**：手机本地按截止时间提醒，夜间免打扰；可选每天早上的邮件摘要
- **班级**：班级聊天室、贡献榜（总榜 / 月榜 / 周榜）
- **账号**：邮箱 + 密码注册（QQ、163、Gmail），只存邮箱，不要学号和真实姓名

## 仓库里有什么

```
src/              App（Expo + React Native，Expo Router）
  app/            页面：(tabs)/ 作业、课表、我的；homework/ course/ upload chat/ board 等
  components/     通用组件
  data/           本地数据、和服务器同步、提醒
  api/            和后端说话的唯一出口
  lib/swufe/      教务课表解析和网页桥接
  theme/          配色和字体（纸页 / 暮色两个主题）
tests/            App 的测试（脱敏的课表样本、数据和提醒逻辑）
server/           后端（Node + Hono + PostgreSQL），说明见 server/README.md
site/             官网（纯静态页面）
assets/brand/     标志源文件和生成图标的脚本
plugins/          Expo 配置插件
docs/             部署、交接、课表导入说明，业务逻辑思维导图
.github/workflows/ 打包安卓 APK、发布 Release
```

## 本机跑起来

```bash
# 后端：http://localhost:8787 ，本机用 PGlite，不用装数据库；验证码打印在终端里
cd server && npm install && npm run dev

# App：另开一个终端，在仓库根目录
npm install
npx expo start      # 按 w 在浏览器里打开，或者用开发版 App 扫码
```

测试：根目录 `npm test` 跑 App 的测试，`server/` 里 `npm test` 跑后端的测试。

## 发布

- **服务器**：步骤和更新命令见 [docs/DEPLOY.md](docs/DEPLOY.md)
- **安装包**：改 `app.json` 里的 `version` 和 `versionCode`，推一个 `v` 开头的标签，在 Actions 里运行「打包安卓 APK」选这个标签。打完自动发 Release，官网的下载按钮总是指向最新一版
- 正式签名的密钥不在仓库里，由项目负责人保管

## 设计

安静、内敛、简洁。标题用宋体，正文用黑体。两个主题：默认「纸页」（暖白纸色、陶土色点缀），「暮色」（紫灰渐变、半透明卡片）。临期作业用砖红。
