import type { Course, Homework } from './types';

// 1.0.0 及以前，第一次打开会塞一份演示课表和演示作业。现在不要了：
// 读出旧数据时把它们清掉，挂在演示课下面的作业也一起清掉。
// 只认当时写死的编号，而且必须是没导入过、没连服务器的课，同学自己的课和作业不会被误删
const DEMO_COURSES = new Set(['prob', 'micro', 'acct', 'eng', 'py']);
const DEMO_HOMEWORK = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7']);

export function dropDemo(courses: Course[], homework: Homework[]) {
  const isDemoCourse = (c: Course) => DEMO_COURSES.has(c.id) && !c.source && !c.serverClassId;
  const gone = new Set(courses.filter(isDemoCourse).map((c) => c.id));
  return {
    courses: courses.filter((c) => !gone.has(c.id)),
    homework: homework.filter((h) => h.remote || (!DEMO_HOMEWORK.has(h.id) && !gone.has(h.courseId))),
  };
}
