# 交接说明：课表一键导入

写给接手「课表一键导入」的同学（GPT）。前端界面和数据层已经做好，导入功能只需要接到现有的数据结构上。下面是做这块时需要知道、需要小心的地方。

---

## 1. 项目概况

- **是什么**：西南财经大学（成都）学生用的作业聚合和 DDL 提醒 app。同学上传作业，同一教学班的人都能看到。目前只做安卓，只打 arm64。
- **现状**：纯前端，没有后端。数据存在手机本地（AsyncStorage），演示数据在 `src/data/mock.ts`。
- **仓库**：`ANineBug/homework-app`（私有），主分支 `main`。
- **技术栈**：Expo SDK 58、React Native 0.88、React 19.3、TypeScript、Expo Router（路由在 `src/app/`，`@/` 指向 `src/`）。

### 必须遵守（来自 `AGENTS.md`）

- 装依赖一律用 `npx expo install <包名>`，不要用 `npm install`，否则版本可能和 SDK 不兼容。
- **不要手动创建或修改 `android/`、`ios/` 目录**。项目用 CNG（自动生成原生工程），原生配置写在 `app.json` 或 config plugin 里。
- 改完跑 `npx tsc --noEmit`，必须零错误。
- ⚠️ `npx expo lint` 在这个项目里会**自动安装 eslint 并改动 `package.json`**。如果跑了，不要把这部分改动提交上去（或者先和项目负责人确认要不要引入 eslint）。

---

## 2. 目录结构

```
src/
  app/                    路由（每个文件就是一个页面）
    _layout.tsx           根布局：Store → Theme → Toast → 导航
    (tabs)/_layout.tsx    底部三个标签 + 左右滑动翻页（别轻易动，见第 7 节）
    (tabs)/index.tsx      作业首页
    (tabs)/timetable.tsx  课表（周视图）
    (tabs)/me.tsx         我的
    add-course.tsx        添加 / 编辑课程（带 ?id= 就是编辑）
    upload.tsx            上传 / 编辑作业（带 ?id= 就是编辑）
    course/[id].tsx       课程详情（编辑、删除入口）
    homework/[id].tsx     作业详情
  components/ui.tsx       通用组件：ModalScreen、Chip、ChipGroup、Field、PrimaryButton、Txt、Card、Press…
  components/Toast.tsx    底部提示条：toast(文字, { label: '撤销', onPress })
  components/haptic.ts    触感反馈：haptic.light() / select() / success()
  data/types.ts           数据类型 ← 导入结果要对上这里
  data/store.tsx          全局数据和所有修改方法，自动保存
  data/format.ts          日期、节次、周次的格式化，currentWeek()
  theme/tokens.ts         两套主题的颜色和字体
```

---

## 3. 导入结果要对上的数据结构

在 `src/data/types.ts`：

```ts
type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;          // 1 = 周一 … 7 = 周日

type Session = {
  weekday: Weekday;
  from: number;          // 第几节开始，1–12
  to: number;            // 第几节结束（含），1–12
  location: string;      // 格式："教学楼 教室"，中间一个半角空格，例如 "通博楼 B101"
};

type Course = {
  id: string;
  name: string;
  teacher: string;       // 没有老师就填 '未填写'
  sessions: Session[];   // 一门课可以有多个上课时间
  weeks: { from: number; to: number; rule: 'all' | 'odd' | 'even' };
  hue: number;           // 课表色块颜色序号，store 自动分配
  members: number;       // 教学班人数（演示用），store 自动填
};
```

导入时**只需要产出** `NewCourse = Omit<Course, 'id' | 'hue' | 'members'>`。

### ⚠️ 需要特别注意的几点

1. **地点格式**：课表色块只显示空格**后面**的部分（`roomOf()`），课程详情显示完整地点。所以一定要是「楼名 + 空格 + 教室」。教务系统里如果是 `通博楼B101`、`通博楼-B101` 之类的写法，要先规整。已知的真实教学楼：通博楼、弘远楼、实验楼。（「格致楼」是假的；「致知园」是宿舍，不是教学楼。）
2. **周次表达不了不连续的情况**：现在的模型只支持「从第几周到第几周 + 每周 / 单周 / 双周」。教务系统里常见 `1-8,10-16周` 这种跳周写法，**现有结构存不下**。可选做法：
   - a. 拆成多条 Course（同名同老师，各自的周次），最省事，但同一门课会在课程列表里出现两次；
   - b. 把 `weeks` 扩展成 `number[]`（具体是哪几周）。这样更准确，但要同时改 `timetable.tsx` 的 `inWeek()`、`format.ts` 的 `formatWeeks()`、`add-course.tsx` 的周次选择，还要处理已保存数据的兼容（见第 5 节）。
   - **请先和项目负责人确认选哪种**，不要擅自改数据结构。
3. **节次范围 1–12**：课表固定画 12 节。如果教务系统有第 13 节或「中午」这类节次，需要规整，或者先和负责人确认。
4. **节次时间没有存**：app 里目前只有「第几节」，没有具体时刻（负责人说过先不加）。参考的作息：第 1 节 08:00–08:50，第 2 节 09:00–09:50，第 3 节 10:10–11:00，第 4 节 11:10–12:00，第 5 节 13:30–14:20，第 6 节 14:30–15:20，第 7 节 15:40–16:30，第 8 节 16:40–17:30，第 9 节 18:30–19:20（来自截图，未核实）。
5. **当前周是写死的**：`format.ts` 的 `currentWeek()` 固定返回 10（演示用）。如果导入时能拿到学期开始日期，可以顺手把它改成真实计算，但要单独说明。

---

## 4. 怎么把导入的课写进去

`src/data/store.tsx` 里已有的方法：

| 方法 | 作用 |
|---|---|
| `addCourse(c)` | 添加一门课。**会做教学班匹配**：第一个上课时间的星期、开始节次、地点（不分大小写）都一样，就当作已有的课，不重复添加。返回 `{ course, matched }` |
| `updateCourse(id, c)` | 修改 |
| `removeCourse(id)` / `restoreCourse(removed)` | 删除（连带这门课的作业）/ 撤销删除 |
| `resetDemo()` | 清空，回到演示数据 |

建议**新增一个批量方法**，比如 `importCourses(list: NewCourse[], mode: 'replace' | 'merge')`：

- 一次 `setCourses` 写完，不要循环调用 `addCourse`。`addCourse` 读的是闭包里的 `courses`，循环调用时后一次看不到前一次加的课，匹配和颜色分配都会出错。
- `replace`（清空后导入）会连带删掉旧课的作业，要想清楚，最好让用户确认，或者提供撤销。
- 颜色 `hue` 按顺序分配（现在是 `courses.length % 5`），保证相邻的课颜色不同。
- 别忘了加到 `StoreValue` 类型和 `useMemo` 的 value 里。

**不要直接读写 AsyncStorage**。改 store 的 state 就会自动保存（300ms 防抖）。

---

## 5. 本地保存的细节

- key 是 `store.v1`，内容为 `{ courses, homework, profile, settings }`，整体 JSON。
- 日期存成 ISO 字符串，读回时用正则 `^\d{4}-\d{2}-\d{2}T…Z$` 自动转回 `Date`。**新增的字段如果是日期，必须用 `Date` 对象存**，不要存成别的格式的字符串，否则读回来不会还原。
- 如果要**改数据结构**（比如上面的 `weeks` 改成数组），已经装了 app 的人手机里存的是旧格式。要么读取时做兼容转换，要么把 key 升级成 `store.v2` 并写迁移。不能直接改类型了事。
- 主题选择单独存在 `theme.name`。

---

## 6. 导入入口和界面（已经留好位置）

- **课表空状态**：`timetable.tsx` 里 `courses.length === 0` 时，格子中间显示「课表还是空的 / 一键导入还在路上，先手动添加吧」和「添加课程」按钮。导入按钮放这里最合适，文案也要相应改掉。
- **课表右上角**：现在只有一个「+」（添加课程）。有课以后想重新导入，需要一个入口，可以放这里，比如长按或加第二个按钮。
- 课表底部还有一行字「课表导入还在研究中，目前请点右上角手动添加」，做完记得改掉。

### 界面风格（负责人很在意）

- **安静、内敛、小清新**。默认主题「纸页」：暖白底 `#faf9f5`，陶土红强调色 `#c2603e`，标题用宋体（`fonts.serif`），正文用系统字体。另有深色主题「暮色」。**颜色一律从 `useTheme().theme` 取，不要写死**。
- **不要用 emoji**，图标用 `@expo/vector-icons` 的 Ionicons，或者自己画的 SVG（`react-native-svg` 已装好）。
- 弹出页统一用 `ModalScreen`；选项用 `Chip` / `ChipGroup`；主按钮用 `PrimaryButton`；提示用 `toast`；点击加 `haptic`。
- 可以撤销的操作优先用「先做、给撤销」，少用「确定吗？」弹窗。
- 代码注释用中文，写清楚**为什么**这样做。
- 建议流程：登录 → 读取 → **预览列表（可以勾选、能看出哪些课已经在课表里）** → 确认导入 → toast 提示「已导入 N 门课」。

---

## 7. 容易踩坑、别弄坏的地方

- **底部标签的左右滑动**（`(tabs)/_layout.tsx`）：三页并排跟手滑，点标签时淡入。里面用 `router.prefetch` 预加载三页，并且「动画结束后才切路由」，这是为了绕开网页端的一个动画中断问题。在课表页加横向手势（比如左右滑动翻周）会和它冲突，要先和负责人商量。
- **WebView 登录**：如果用 `react-native-webview`，它是原生模块。装了以后**必须重新打 APK**才能在手机上用，而且**网页预览里跑不了**。最好给网页预览留一个假数据入口，方便调界面。
- **账号安全**：用户的教务账号和密码只能在学校自己的登录页里输入。app 不要读取、保存或上传密码，cookie 也不要持久化到我们自己的存储里。
- **网页预览的两个假问题**：
  - 预览面板收起时浏览器会暂停动画（requestAnimationFrame 不跑），看起来像动画卡住，其实不是 bug。
  - 控制台会报 `Received false for a non-boolean attribute collapsable`，这是动画组件包 SVG 时在网页端的警告，手机上没有，可以忽略。
- **ReminderCard 的默认提醒**来自「我的」里的开关（`settings.remindDay / remindHours`），不要再写死。

---

## 8. 跑起来和打包

```bash
npm --prefix homework-app run web -- --port 8081   # 网页预览（在 workplace1 目录下）
npx tsc --noEmit                                   # 类型检查（在 homework-app 目录下）
```

- **打包 APK**：GitHub 仓库 → Actions →「打包安卓 APK」→ Run workflow，跑完在页面底部的 Artifacts 下载。流程是 `expo prebuild` 加 `gradlew assembleRelease`，只打 arm64。推送 `v` 开头的 tag 会自动发 Release。
- **签名**：目前用的是模板自带的调试签名，正式发布前要换成自己的签名密钥，并放在 GitHub Secrets 里。**不要把密钥提交进仓库**。
- **提交**：提交信息用中文，一句话说清改了什么。改动范围大的话，先开分支或者先和负责人确认。

---

## 9. 不确定就问

以下几件事请先和负责人（NineBug）确认，再动手：
- 跳周的周次怎么存（第 3 节第 2 点）
- 导入时是覆盖还是合并，旧课的作业怎么处理
- 是否要改数据结构，或者新增依赖
