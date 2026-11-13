// 算出接下来要弹哪些提醒、几点弹。只是计算，不碰手机的通知系统，方便单独测试

import { formatDue, isTbd } from './format';
import type { Course, Homework, Reminder, Settings } from './types';

// 默认提醒来自"我的 → 提醒"里的两个开关
export function defaultReminders(settings: Settings): Reminder[] {
  return [
    ...(settings.remindDay ? [{ kind: 'before' as const, minutes: 1440 }] : []),
    ...(settings.remindHours ? [{ kind: 'before' as const, minutes: 180 }] : []),
  ];
}

export const reminderAt = (r: Reminder, due: Date) => (r.kind === 'at' ? r.at : new Date(due.getTime() - r.minutes * 60000));

export type PlannedReminder = { key: string; at: Date; title: string; body: string; homeworkId: string };

// 一次最多排这么多条、这么远。安卓对一个 app 能排的闹钟数量有上限，太远的下次打开 app 再排
const LIMIT = 60;
const HORIZON_MS = 30 * 86_400_000;

// 夜间免打扰：落在 23:00–7:00 的提醒挪到前一晚 22:30，宁可早一点，不能半夜吵人也不能漏掉。
// 如果挪完已经过去了（比如现在就是深夜），改到早上 7:00；7:00 已经截止了就还按原时间
function avoidNight(at: Date, due: Date, now: Date) {
  const h = at.getHours();
  if (h >= 7 && h < 23) return at;
  const earlier = new Date(at);
  if (h < 7) earlier.setDate(earlier.getDate() - 1);
  earlier.setHours(22, 30, 0, 0);
  if (earlier > now) return earlier;
  const morning = new Date(at);
  if (h >= 23) morning.setDate(morning.getDate() + 1);
  morning.setHours(7, 0, 0, 0);
  return morning < due ? morning : at;
}

const LEFT = (minutes: number) => (minutes >= 1440 ? `还有 ${Math.round(minutes / 1440)} 天截止` : minutes >= 60 ? `还有 ${Math.round(minutes / 60)} 小时截止` : `还有 ${minutes} 分钟截止`);

export function planReminders(homework: Homework[], courses: Course[], settings: Settings, now = new Date()): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const h of homework) {
    if (h.done || h.ignored) continue;
    const r = h.remote;
    if (r && (r.state === 'cancelled' || r.state === 'merged' || r.state === 'closed')) continue;
    // 新同学传的、还没有正式成员确认过的，先不推
    if (r && !r.remindReady) continue;
    if (isTbd(h.due)) continue;
    // 有人提议改时间、还在投票：按最早的那个时间提醒
    const due = r?.earliestDue && r.earliestDue < h.due ? r.earliestDue : h.due;
    if (due <= now) continue;
    const disputed = due.getTime() !== h.due.getTime();
    const course = courses.find((c) => c.id === h.courseId)?.name ?? '';
    for (const rem of h.reminders ?? defaultReminders(settings)) {
      const raw = reminderAt(rem, due);
      if (raw <= now || raw >= due) continue;
      const at = settings.quietNight ? avoidNight(raw, due, now) : raw;
      if (at <= now || at.getTime() - now.getTime() > HORIZON_MS) continue;
      const lead = rem.kind === 'before' ? LEFT(rem.minutes) : '别忘了';
      out.push({
        key: `${h.id}:${at.getTime()}`,
        at,
        homeworkId: h.id,
        title: `${h.title} · ${lead}`,
        body: `${course ? `${course} · ` : ''}${formatDue(due)} 截止${disputed ? '（截止时间有人提议修改，先按最早的提醒）' : ''}`,
      });
    }
  }
  // 同一条作业挪到同一时刻的只留一条
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)))
    .slice(0, LIMIT);
}
