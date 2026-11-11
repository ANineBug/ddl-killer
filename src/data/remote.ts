// 手机上的数据和服务器数据之间的转换

import type { RemoteClass, RemoteHomework } from '@/api/types';

import { TBD_DUE } from './format';
import type { Course, Homework, Session, SubmitMethod, Weekday, WeekRange } from './types';

// 服务器作业在手机上的编号：加个 s 前缀，和本地演示作业的编号分开
export const localHomeworkId = (serverId: number) => `s${serverId}`;

// 服务器作业 → 手机上的作业。"我完成了没有"、自己设的提醒只存在手机上，从旧的那份里接着用
export function fromRemote(r: RemoteHomework, courseId: string, previous?: Homework): Homework {
  const due = r.dueKind === 'tbd' || !r.due ? TBD_DUE : new Date(r.due);
  const confirmed = r.me?.confirmed ?? null;
  return {
    id: localHomeworkId(r.id),
    courseId,
    title: r.title,
    detail: r.detail,
    due,
    submit: r.submit as SubmitMethod,
    uploader: r.uploader.nickname,
    uploadedAt: new Date(r.createdAt),
    reactions: { confirm: r.confirms.current + r.confirms.old, thumbs: r.reactions.thumbs, cry: r.reactions.cry },
    myReactions: [...(confirmed ? (['confirm'] as const) : []), ...((r.me?.reactions ?? []) as ('thumbs' | 'cry')[])],
    done: previous?.done ?? false,
    hasPhoto: false,
    reminders: previous?.reminders,
    mine: r.me?.isUploader ?? false,
    possibleDuplicates: r.possibleDuplicates.length ? r.possibleDuplicates.map(localHomeworkId) : undefined,
    dupVote: previous?.dupVote,
    remote: {
      id: r.id,
      classId: r.classId,
      state: r.state,
      dueKind: r.dueKind,
      version: r.version,
      confirmedOld: confirmed === 'old',
      remindReady: r.remindReady,
      postponed: r.postponed,
      uploaderCount: r.uploaderCount,
      openProposals: r.openProposals,
      source: r.source,
      optional: r.optional,
      groupWork: r.groupWork,
    },
  };
}

// 手机上的课 → 导入接口要的样子。只发课程安排，不发别的
export function courseForServer(c: Course) {
  return {
    name: c.name,
    teacher: c.teacher === '未填写' ? '' : c.teacher,
    jxbId: c.source?.classId || undefined,
    sessions: c.sessions.map((s) => ({
      weekday: s.weekday,
      from: s.from,
      to: s.to,
      location: s.location,
      weeks: s.weeks ?? c.weeks,
    })),
  };
}

// [1,2,3,5,7,9,10] → 1-3 周、5-9 周（单）、10 周：把具体周数还原成区间，课表和周次显示都用区间
export function weeksToRanges(weeks: number[]): WeekRange[] {
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const out: WeekRange[] = [];
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i];
    // 先试连续的周，再试隔一周的（单双周）
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j > i) {
      out.push({ from: start, to: sorted[j], rule: 'all' });
      i = j + 1;
      continue;
    }
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 2) j++;
    if (j > i) out.push({ from: start, to: sorted[j], rule: start % 2 === 1 ? 'odd' : 'even' });
    else out.push({ from: start, to: start, rule: 'all' });
    i = j + 1;
  }
  return out;
}

// 搜索到的教学班 → 手机课表里的一门课
export function courseFromClass(c: RemoteClass, id: string, hue: number): Course {
  const sessions: Session[] = c.slots.map((s) => ({
    weekday: s.weekday as Weekday,
    from: s.from,
    to: s.to,
    location: s.room,
    weeks: weeksToRanges(s.weeks),
  }));
  return {
    id,
    name: c.name,
    teacher: c.teacher || '未填写',
    sessions,
    weeks: weeksToRanges(c.slots.flatMap((s) => s.weeks)),
    source: { school: 'swufe', term: c.term },
    serverClassId: c.id,
    hue,
    members: c.members,
  };
}

// 还没导入过课表时，按日期猜现在是哪个学期：8 月到次年 1 月是第 1 学期，2 到 7 月是第 2 学期
export function guessTerm(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 8) return `${y}-${y + 1}学年第1学期`;
  if (m === 1) return `${y - 1}-${y}学年第1学期`;
  return `${y - 1}-${y}学年第2学期`;
}
