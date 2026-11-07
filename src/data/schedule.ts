import type { Course, Session, WeekRange } from './types';

export function normalizeWeeks(value: unknown): WeekRange[] {
  const values = Array.isArray(value) ? value : [value];
  const out: WeekRange[] = [];
  for (const v of values) {
    if (!v || typeof v !== 'object') continue;
    const { from, to, rule } = v as WeekRange;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > 60) continue;
    if (rule !== 'all' && rule !== 'odd' && rule !== 'even') continue;
    if (!out.some((w) => w.from === from && w.to === to && w.rule === rule)) out.push({ from, to, rule });
  }
  return out.sort((a, b) => a.from - b.from || a.to - b.to || a.rule.localeCompare(b.rule));
}

// 兼容已安装版本的单区间 weeks；保留原 id，已有作业不需要重新关联。
export function migrateCourse(course: Course): Course {
  const weeks = normalizeWeeks(course.weeks);
  return {
    ...course,
    weeks,
    sessions: course.sessions.map((s) => ({ ...s, weeks: s.weeks ? normalizeWeeks(s.weeks) : weeks })),
  };
}

export function sessionWeeks(course: Course, session: Session): WeekRange[] {
  return session.weeks ?? course.weeks;
}

export function inWeek(weeks: WeekRange[], week: number) {
  return weeks.some((w) => week >= w.from && week <= w.to &&
    (w.rule === 'odd' ? week % 2 === 1 : w.rule === 'even' ? week % 2 === 0 : true));
}

export function courseWeeks(sessions: Session[]) {
  return normalizeWeeks(sessions.flatMap((s) => s.weeks ?? []));
}

export function sameTeachingClass(a: Course, b: Course) {
  if (a.source?.classId && b.source?.classId) {
    return a.source.school === b.source.school && a.source.term === b.source.term && a.source.classId === b.source.classId;
  }
  // 没有学校编号时只认相同的本地标识，不用课名、教室猜测跨用户身份。
  return a.id === b.id;
}

export function mergeImportedCourses(current: Course[], incoming: Course[]) {
  const courses = [...current];
  const added: string[] = [];
  const previous: Course[] = [];
  const applied: Course[] = [];
  for (const item of incoming) {
    const index = courses.findIndex((c) => sameTeachingClass(c, item));
    if (index >= 0) {
      const old = courses[index];
      if (!previous.some((c) => c.id === old.id) && !added.includes(old.id)) previous.push(old);
      const updated = { ...item, id: old.id, hue: old.hue, members: old.members };
      courses[index] = updated;
      applied.push(updated);
    } else {
      const created = { ...item, hue: courses.length % 5 };
      courses.push(created);
      added.push(created.id);
      applied.push(created);
    }
  }
  return { courses, added, previous, applied };
}

export function validMonday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.getDay() === 1 &&
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === value;
}

export function weekFromStart(start: string | undefined, now = new Date()): number | undefined {
  if (!start || !validMonday(start)) return undefined;
  const [year, month, day] = start.split('-').map(Number);
  const days = (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(year, month - 1, day)) / 86400000;
  return Math.floor(days / 7) + 1;
}
