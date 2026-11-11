// 每一节课几点开始。来自之前的作息截图，第 1–9 节对得上截图；第 10–12 节是按间隔推的，还没核实
import { inWeek, sessionWeeks, weekFromStart } from './schedule';
import type { Course } from './types';

export const PERIOD_START: Record<number, string> = {
  1: '08:00',
  2: '09:00',
  3: '10:10',
  4: '11:10',
  5: '13:30',
  6: '14:30',
  7: '15:40',
  8: '16:40',
  9: '18:30',
  10: '19:30',
  11: '20:30',
  12: '21:30',
};

const isoWeekday = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay());

// 「下次课前」：这门课下一次上课的开始时间。
// 知道第一周周一是哪天，就按周次算（单双周、跳周都对）；不知道就只看星期几
export function nextClassTime(course: Course, termStart: string | undefined, now = new Date()): Date | null {
  for (let i = 0; i < 70; i++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + i);
    const week = weekFromStart(termStart, day);
    const candidates = course.sessions
      .filter((s) => s.weekday === isoWeekday(day))
      .filter((s) => week === undefined || inWeek(sessionWeeks(course, s), week))
      .map((s) => {
        const [h, m] = (PERIOD_START[s.from] ?? '08:00').split(':').map(Number);
        const at = new Date(day);
        at.setHours(h, m, 0, 0);
        return at;
      })
      .filter((at) => at > now)
      .sort((a, b) => a.getTime() - b.getTime());
    if (candidates.length) return candidates[0];
  }
  return null;
}
