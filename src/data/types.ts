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
};

export type TimetableSettings = {
  term?: string;
  // 仅保存日期，不作为 UTC 时间解析，避免时区改变后周数偏移。
  starts: Record<string, string>;
};
