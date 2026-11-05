import { Course, Homework } from './types';

// 截止时间都相对"现在"来算，演示时总有今晚截止的作业
function dayAt(offsetDays: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600 * 1000);
}

export const mockCourses: Course[] = [
  {
    id: 'prob',
    name: '概率论与数理统计',
    teacher: '张老师',
    sessions: [
      { weekday: 1, from: 1, to: 2, location: '通博楼 B101' },
      { weekday: 3, from: 3, to: 4, location: '通博楼 B101' },
    ],
    weeks: { from: 1, to: 16, rule: 'all' },
    hue: 0,
    members: 47,
  },
  {
    id: 'micro',
    name: '中级微观经济学',
    teacher: '李老师',
    sessions: [{ weekday: 2, from: 3, to: 5, location: '通博楼 C205' }],
    weeks: { from: 1, to: 16, rule: 'all' },
    hue: 1,
    members: 62,
  },
  {
    id: 'acct',
    name: '会计学原理',
    teacher: '王老师',
    sessions: [{ weekday: 4, from: 1, to: 2, location: '通博楼 A304' }],
    weeks: { from: 1, to: 16, rule: 'all' },
    hue: 2,
    members: 38,
  },
  {
    id: 'eng',
    name: '大学英语（四）',
    teacher: 'Ms. Chen',
    sessions: [
      { weekday: 2, from: 1, to: 2, location: '弘远楼 210' },
      { weekday: 5, from: 3, to: 4, location: '弘远楼 210' },
    ],
    weeks: { from: 1, to: 16, rule: 'all' },
    hue: 3,
    members: 29,
  },
  {
    id: 'py',
    name: 'Python 程序设计',
    teacher: '刘老师',
    sessions: [{ weekday: 3, from: 6, to: 8, location: '实验楼 402 机房' }],
    weeks: { from: 3, to: 14, rule: 'all' },
    hue: 4,
    members: 41,
  },
];

export const mockHomework: Homework[] = [
  {
    id: 'h1',
    courseId: 'prob',
    title: '习题 3.2',
    detail: '课本第 87 页 3、5、7、12 题，写清楚推导过程。周三课前交给课代表。',
    due: dayAt(0, 23, 59),
    submit: '纸质',
    uploader: '小林',
    uploadedAt: hoursAgo(26),
    reactions: { confirm: 18, thumbs: 2, cry: 9 },
    myReactions: [],
    done: false,
    hasPhoto: true,
  },
  {
    id: 'h2',
    courseId: 'micro',
    title: 'Problem Set 4',
    detail: '第 6 章消费者理论，共 5 题。手写拍照提交，注意第 4 题要画图。',
    due: dayAt(1, 14, 0),
    submit: '学习通',
    uploader: '阿哲',
    uploadedAt: hoursAgo(50),
    reactions: { confirm: 21, thumbs: 4, cry: 12 },
    myReactions: ['confirm'],
    done: false,
    hasPhoto: false,
  },
  {
    id: 'h3',
    courseId: 'eng',
    title: 'Unit 6 议论文',
    detail: '题目：Should universities require attendance? 不少于 200 词。',
    due: dayAt(2, 18, 0),
    submit: '学习通',
    uploader: 'Yuki',
    uploadedAt: hoursAgo(20),
    reactions: { confirm: 9, thumbs: 1, cry: 3 },
    myReactions: [],
    done: false,
    hasPhoto: false,
  },
  {
    id: 'h4',
    courseId: 'acct',
    title: '第四章案例分析',
    detail: '分组完成，每组交一份 Word，文件名：组号-案例四。',
    due: dayAt(4, 12, 0),
    submit: '邮箱',
    uploader: '小林',
    uploadedAt: hoursAgo(8),
    reactions: { confirm: 5, thumbs: 0, cry: 1 },
    myReactions: [],
    done: false,
    hasPhoto: true,
  },
  {
    id: 'h5',
    courseId: 'py',
    title: '实验三：文件读写',
    detail: '完成实验指导书上的三个练习，代码和截图打包上传。',
    due: dayAt(9, 23, 59),
    submit: '学习通',
    uploader: '大橙子',
    uploadedAt: hoursAgo(3),
    reactions: { confirm: 12, thumbs: 3, cry: 0 },
    myReactions: [],
    done: false,
    hasPhoto: false,
  },
  {
    id: 'h6',
    courseId: 'prob',
    title: '随堂小测订正',
    detail: '把小测错题订正在作业本上。',
    due: dayAt(-1, 18, 0),
    submit: '纸质',
    uploader: '小林',
    uploadedAt: hoursAgo(72),
    reactions: { confirm: 15, thumbs: 0, cry: 2 },
    myReactions: ['confirm'],
    done: true,
    hasPhoto: false,
  },
];
