import { isTbd } from './format';
import type { Homework } from './types';

// 已完成作业的归档。
// 什么时候算归档：
//   自己点过「归档」或者左滑归档的 → 归档（archived = true）
//   从归档里「移回」的 → 不再自动归档（archived = false）
//   都没动过的 → 完成了（或者标了与我无关），而且截止已经过去一周，自动归档
// 归档的作业只是不在首页显示了，内容一直留在手机上，随时能点开看

export const AUTO_ARCHIVE_DAYS = 7;
const DAY = 86_400_000;

export const isFinished = (h: Homework) => h.done || !!h.ignored;

export function isArchived(h: Homework, now: Date) {
  if (h.archived !== undefined) return h.archived;
  return isFinished(h) && !isTbd(h.due) && now.getTime() - h.due.getTime() > AUTO_ARCHIVE_DAYS * DAY;
}

// 中国时间那一天的零点，按天、按周统计用
function dayKey(d: Date) {
  const offset = 8 * 3600_000;
  return Math.floor((d.getTime() + offset) / DAY);
}

// 完成时间：以前完成的作业没记时间，就当是截止那天完成的
export const finishedAt = (h: Homework) => h.doneAt ?? (isTbd(h.due) ? h.uploadedAt : h.due);

export type CompletionStats = {
  total: number;
  // 按时交的比例（0–1）；记录了完成时间、而且有明确截止时间的才算，没有就是 null
  onTime: number | null;
  // 完成最多的那一周：周一的日期和那周完成几条
  busiestWeek: { monday: Date; count: number } | null;
  // 每门课完成几条，多的在前
  perCourse: { courseId: string; count: number }[];
  // 最近 weeks 周每天完成几条：一列一周（周一到周日），最右边一列是这周
  grid: number[][];
};

export function completionStats(homework: Homework[], now: Date, weeks = 15): CompletionStats {
  const done = homework.filter((h) => h.done);
  const timed = done.filter((h) => h.doneAt && !isTbd(h.due));
  const onTime = timed.length ? timed.filter((h) => h.doneAt!.getTime() <= h.due.getTime()).length / timed.length : null;

  const perDay = new Map<number, number>();
  for (const h of done) {
    const k = dayKey(finishedAt(h));
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }

  // 1970-01-01 是周四，往后数 3 天到周一
  const mondayOf = (k: number) => k - ((k + 3) % 7);
  const perWeek = new Map<number, number>();
  for (const [k, n] of perDay) perWeek.set(mondayOf(k), (perWeek.get(mondayOf(k)) ?? 0) + n);
  let busiestWeek: CompletionStats['busiestWeek'] = null;
  for (const [monday, count] of perWeek) {
    if (!busiestWeek || count > busiestWeek.count) busiestWeek = { monday: new Date(monday * DAY - 8 * 3600_000), count };
  }

  const courses = new Map<string, number>();
  for (const h of done) courses.set(h.courseId, (courses.get(h.courseId) ?? 0) + 1);
  const perCourse = [...courses].map(([courseId, count]) => ({ courseId, count })).sort((a, b) => b.count - a.count);

  const thisMonday = mondayOf(dayKey(now));
  const grid = Array.from({ length: weeks }, (_, w) => {
    const monday = thisMonday - (weeks - 1 - w) * 7;
    return Array.from({ length: 7 }, (_, d) => perDay.get(monday + d) ?? 0);
  });

  return { total: done.length, onTime, busiestWeek, perCourse, grid };
}
