export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type WeekRange = { from: number; to: number; rule: WeekRule };

export type Session = {
  weekday: Weekday;
  // 第几节到第几节，比如 1–2 节
  from: number;
  to: number;
  location: string;
  // 周次属于这次上课，避免把调课的周次套到其他时间或地点上。
  weeks?: WeekRange[];
  teacher?: string;
};

export type WeekRule = 'all' | 'odd' | 'even';

export type Course = {
  id: string;
  name: string;
  teacher: string;
  sessions: Session[];
  weeks: WeekRange[];
  source?: {
    school: 'swufe';
    term: string;
    classId?: string;
    className?: string;
    courseCode?: string;
  };
  credit?: string;
  note?: string;
  // 服务器上对应的教学班编号。导入课表或手动加入后才有；有了它，这门课的作业就从服务器同步
  serverClassId?: number;
  // 手动搜索加入的班（不是教务导入的）
  manual?: boolean;
  // 课表色块用第几种颜色
  hue: number;
  // 已加入这个教学班的同学数（演示数据）
  members: number;
};

export type SubmitMethod = '纸质' | '学习通' | '邮箱' | '其他';

export type ReactionKey = 'confirm' | 'thumbs' | 'cry';

// 提醒：截止前多少分钟，或者某个具体时间
export type Reminder = { kind: 'before'; minutes: number } | { kind: 'at'; at: Date };

export type Homework = {
  id: string;
  courseId: string;
  title: string;
  detail: string;
  due: Date;
  submit: SubmitMethod;
  uploader: string;
  uploadedAt: Date;
  reactions: Record<ReactionKey, number>;
  myReactions: ReactionKey[];
  done: boolean;
  hasPhoto: boolean;
  // 没设置就跟随"我的 → 提醒"里的默认提醒
  reminders?: Reminder[];
  // 是不是我自己上传的；只有自己上传的才能编辑和删除
  mine?: boolean;
  // 有人点了「重复了」、还在投票：可能和哪几条是同一份作业。列表里会叠成一叠
  possibleDuplicates?: string[];
  // 我对"是不是重复"投的票：true 是重复，false 不是，没投过为空
  dupVote?: boolean;
  // 「与我无关」：比如选了别的题目的小组，这条不再出现在待完成里，也不提醒。只存在手机上
  ignored?: boolean;
  // 从服务器同步来的作业才有：服务器上的编号、状态等。没有就是只存在这台手机上的（演示数据）
  remote?: RemoteInfo;
};

export type RemoteInfo = {
  id: number;
  classId: number;
  state: 'pending' | 'confirmed' | 'disputed' | 'cancelled' | 'closed' | 'merged';
  dueKind: 'at' | 'next_class' | 'tbd';
  // 有人提议改截止时间、还在投票时，几个时间里最早的那个；提醒按它算
  earliestDue?: Date;
  version: number;
  // 我确认过，但确认的是修改前的版本
  confirmedOld: boolean;
  remindReady: boolean;
  postponed: boolean;
  uploaderCount: number;
  openProposals: number;
  source: string;
  optional: boolean;
  groupWork: boolean;
};

export type Profile = {
  nickname: string;
  avatarHue: number;
};

// "我的 → 提醒"里的设置
export type Settings = {
  remindDay: boolean;
  remindHours: boolean;
  quietNight: boolean;
  // 每节课几点开始，自己填的，选填。{ 1: '08:20', … }。只用来算「下次课前」的提醒时间
  periodTimes?: Record<number, string>;
};

export type TimetableSettings = {
  term?: string;
  // 仅保存日期，不作为 UTC 时间解析，避免时区改变后周数偏移。
  starts: Record<string, string>;
};
