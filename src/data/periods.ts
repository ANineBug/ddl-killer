// 每节课几点开始，学校的作息我们不写死，由每个人在「我的 → 每节课几点上课」里自己填（选填）。
// 没填的那一节，「下次课前」按当天早上 7 点算：宁可早提醒，不能晚
import { inWeek, sessionWeeks, weekFromStart } from './schedule';
import type { Course } from './types';

export const FALLBACK_TIME = '07:00';

export const validTime = (t: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t.trim());

const isoWeekday = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay());

// 「下次课前」：这门课下一次上课的开始时间。
// 知道第一周周一是哪天，就按周次算（单双周、跳周都对）；不知道就只看星期几
// 这门课下一次上课：哪天、第几节、按几点算；known 表示那一节的时间是自己填过的
export function nextClass(
  course: Course,
  termStart: string | undefined,
  times: Record<number, string> = {},
  now = new Date(),
): { at: Date; period: number; known: boolean } | null {
  for (let i = 0; i < 70; i++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + i);
    const week = weekFromStart(termStart, day);
    const candidates = course.sessions
      .filter((s) => s.weekday === isoWeekday(day))
      .filter((s) => week === undefined || inWeek(sessionWeeks(course, s), week))
      .map((s) => {
        const set = times[s.from];
        const known = !!set && validTime(set);
        const [h, m] = (known ? set : FALLBACK_TIME).split(':').map(Number);
        const at = new Date(day);
        at.setHours(h, m, 0, 0);
        return { at, period: s.from, known };
      })
      .filter((c) => c.at > now)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    if (candidates.length) return candidates[0];
  }
  return null;
}
