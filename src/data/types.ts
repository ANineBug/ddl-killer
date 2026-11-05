export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Session = {
  weekday: Weekday;
  // 第几节到第几节，比如 1–2 节
  from: number;
  to: number;
  location: string;
};

export type WeekRule = 'all' | 'odd' | 'even';

export type Course = {
  id: string;
  name: string;
  teacher: string;
  sessions: Session[];
  weeks: { from: number; to: number; rule: WeekRule };
  // 课表色块用第几种颜色
  hue: number;
  // 已加入这个教学班的同学数（演示数据）
  members: number;
};

export type SubmitMethod = '纸质' | '学习通' | '邮箱' | '其他';

export type ReactionKey = 'confirm' | 'thumbs' | 'cry';

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
};

export type Profile = {
  nickname: string;
  avatarHue: number;
};
