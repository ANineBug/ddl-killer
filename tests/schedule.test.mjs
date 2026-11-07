import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';

const { coursesFromHtml, coursesFromApi, parseWeeks } = await loadTs('src/lib/swufe/parser.ts');
const { inWeek, sessionWeeks, migrateCourse, mergeImportedCourses, weekFromStart, validMonday } = await loadTs('src/data/schedule.ts');
const html = fs.readFileSync(new URL('./fixtures/swufe.html', import.meta.url), 'utf8');
const expected = JSON.parse(fs.readFileSync(new URL('./fixtures/expected.json', import.meta.url), 'utf8'));
const parsed = coursesFromHtml(html);
const term = '2026-2027学年第1学期';
const item = (overrides = {}) => ({ jxb_id: 'class-A', jxbmc: '教学班A', kch: 'MATH001', kcmc: '概率论与数理统计B',
  xqj: '1', jcs: '6-7', zcd: '1-17周', xm: '老师甲', cdmc: '经世楼G901', xnm: '2026', xqm: '3', ...overrides });
const api = (rows) => coursesFromApi({ kbList: rows }, term);

test('真实脱敏样本：11 个课名、16 个上课安排、20 个周段，不重复解析 table2', () => {
  assert.equal(parsed.term, term);
  assert.equal(new Set(parsed.courses.map((c) => c.name)).size, 11);
  assert.equal(parsed.courses.reduce((n, c) => n + c.sessions.length, 0), 16);
  assert.equal(parsed.courses.reduce((n, c) => n + c.sessions.reduce((m, s) => m + s.weeks.length, 0), 0), 20);
  assert.equal(parsed.courses.length, 13);
  assert.equal(new Set(parsed.courses.map((c) => c.id)).size, 13);
});

test('逐项对照原样本标准答案，仅纠正原答案遗漏的单周标记和地点空格', () => {
  const actual = parsed.courses.flatMap((c) => c.sessions.map((s) => ({
    name: c.name, teacher: s.teacher, room: s.location.replace(/\s/g, ''), credit: c.credit, note: c.note,
    weekday: s.weekday, from: s.from, to: s.to,
    weeks: s.weeks.map((w) => `${w.from}-${w.to}${w.rule === 'odd' ? '单' : w.rule === 'even' ? '双' : ''}`),
  })));
  const wanted = expected.courses.flatMap((c) => c.sessions.map((s) => ({
    name: c.name, teacher: c.teacher, room: c.room.replace(/\s/g, ''), credit: c.credit, note: c.note,
    weekday: s.weekday, from: s.from, to: s.to,
    weeks: c.name === '形势与政策III' ? ['7-13单'] : s.weeks,
  })));
  const sort = (rows) => rows.map((r) => JSON.stringify(r)).sort();
  assert.deepEqual(sort(actual), sort(wanted));
});

test('周一、周五的概率论只有一门课、两个安排', () => {
  const c = parsed.courses.filter((c) => c.name === '概率论与数理统计B');
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].sessions.map((s) => [s.weekday, s.from, s.to]), [[1, 6, 7], [5, 5, 6]]);
  assert.equal(c[0].source.classId, undefined);
});

test('调课的同一教学班不会因为教室不同拆成两门；各安排只在自己的周次显示', () => {
  const course = parsed.courses.find((c) => c.name === '数字政府与社会');
  assert.ok(course.source.classId);
  const at = (week) => course.sessions.filter((s) => inWeek(sessionWeeks(course, s), week)).map((s) => s.weekday);
  assert.deepEqual(at(5), [4]);
  assert.deepEqual(at(6), [2]);
  assert.deepEqual(at(7), [4]);
  const career = parsed.courses.find((c) => c.name === '大学生职业生涯规划与创业基础');
  assert.equal(career.sessions.filter((s) => inWeek(s.weeks, 3))[0].location, '实践场地');
  assert.equal(career.sessions.filter((s) => inWeek(s.weeks, 4))[0].location, '经世楼 C902');
});

test('单双周、多周段、单周数字和中文标点均保留', () => {
  assert.deepEqual(parseWeeks('(4-4节)7-13周(单)'), [{ from: 7, to: 13, rule: 'odd' }]);
  assert.deepEqual(parseWeeks('第1-5周，7-17周（双）'), [{ from: 1, to: 5, rule: 'all' }, { from: 7, to: 17, rule: 'even' }]);
  assert.equal(inWeek(parsed.courses.find((c) => c.name === '形势与政策III').weeks, 8), false);
  assert.equal(inWeek(parsed.courses.find((c) => c.name === '形势与政策III').weeks, 9), true);
  assert.deepEqual(parseWeeks('3、7'), [{ from: 3, to: 3, rule: 'all' }, { from: 7, to: 7, rule: 'all' }]);
  assert.deepEqual(parseWeeks('第3节1-17周'), [{ from: 1, to: 17, rule: 'all' }]);
});

test('缺少括号节次时使用单节或单元格跨度，不把周次误当成节次', () => {
  const single = coursesFromHtml(html.replaceAll('(4-4节)7-13周(单)', '第4节7-13周(单)'));
  assert.equal(single.courses.find((c) => c.name === '形势与政策III').sessions[0].from, 4);
  const fallback = coursesFromHtml(html.replaceAll('(4-4节)7-13周(单)', '7-13周(单)'));
  assert.equal(fallback.courses.find((c) => c.name === '形势与政策III').sessions[0].to, 4);
});

test('未知周次和不完整课表报错，不默认为全学期，也不提交部分课程', () => {
  for (const input of ['', '待定', '0-17', '7-2', '1-99', '1-5、未知']) assert.throws(() => parseWeeks(input));
  assert.throws(() => coursesFromHtml('<form><input type="password" /></form>'));
  assert.throws(() => coursesFromHtml(html.replaceAll('(4-4节)7-13周(单)', '(4-4节)待定')));
});

test('原始接口的教学班 ID 关联多个时间、地点、教师，周次仍归属各安排', () => {
  const result = api([item(), item({ xqj: '5', jcs: '5-6' }), item({ xqj: '3', jcs: '1-2', zcd: '6周', xm: '老师乙', cdmc: '讲座场地' })]);
  assert.equal(result.courses.length, 1);
  assert.equal(result.courses[0].sessions.length, 3);
  assert.equal(result.courses[0].source.className, '教学班A');
  assert.equal(result.courses[0].sessions.find((s) => s.weekday === 3).teacher, '老师乙');
});

test('同名同老师同教室，不同教学班 ID 不能合并', () => {
  assert.equal(api([item(), item({ jxb_id: 'class-B' })]).courses.length, 2);
});

test('原始接口检查学期、星期、节次和空结果', () => {
  for (const row of [item({ xnm: '2025' }), item({ xqm: '12' }), item({ xqj: '8' }), item({ jcs: '0-2' }), item({ jcs: '31-32' })]) assert.throws(() => api([row]));
  assert.throws(() => api([]));
  assert.throws(() => coursesFromApi({ message: 'not logged in' }, term));
});

test('无编号课程只赋本地身份，不伪造教学班编号', () => {
  const result = api([item({ jxb_id: '' })]);
  assert.equal(result.courses[0].source.classId, undefined);
});

test('重复导入不增加课程，更新调课时保留本地 ID、配色和原作业的引用', () => {
  const original = { ...api([item()]).courses[0], id: 'existing-course', hue: 4, members: 25 };
  const homework = { courseId: original.id, title: '作业' };
  const incoming = api([item({ xqj: '5', jcs: '1-2', cdmc: '新教室' })]).courses;
  const merged = mergeImportedCourses([original], incoming);
  assert.equal(merged.courses.length, 1);
  assert.equal(merged.added.length, 0);
  assert.equal(merged.previous.length, 1);
  assert.equal(merged.courses[0].id, homework.courseId);
  assert.equal(merged.courses[0].hue, 4);
  assert.equal(merged.courses[0].sessions[0].location, '新教室');
});

test('不同学期相同教学班编号分开保存，已有课程不被删除', () => {
  const a = api([item()]).courses[0];
  const b = coursesFromApi({ kbList: [item({ xnm: '2027' })] }, '2027-2028学年第1学期').courses[0];
  assert.notEqual(a.id, b.id);
  assert.equal(mergeImportedCourses([a], [b]).courses.length, 2);
});

test('重复 HTML 导入稳定；没有教学班证据时不与新接口 ID 强行合并', () => {
  const repeated = coursesFromHtml(html).courses;
  assert.equal(mergeImportedCourses(parsed.courses, repeated).added.length, 0);
  const local = parsed.courses.find((c) => c.name === '概率论与数理统计B');
  assert.equal(mergeImportedCourses([local], api([item()]).courses).courses.length, 2);
});

test('旧版单周次数据迁移保留 ID、配色、课程字段，为每个安排补周次', () => {
  const old = { ...parsed.courses[0], id: 'old', weeks: { from: 1, to: 16, rule: 'all' },
    sessions: [{ weekday: 1, from: 1, to: 2, location: '教室' }] };
  const migrated = migrateCourse(old);
  assert.equal(migrated.id, old.id);
  assert.deepEqual(migrated.weeks, [old.weeks]);
  assert.deepEqual(migrated.sessions[0].weeks, [old.weeks]);
});

test('当前周按本地日历计算，跨夏令时不漂移；拒绝不存在的日期', () => {
  assert.equal(validMonday('2026-09-07'), true);
  assert.equal(validMonday('2026-09-08'), false);
  assert.equal(validMonday('2026-02-30'), false);
  assert.equal(weekFromStart('2026-09-07', new Date(2026, 10, 6)), 9);
  assert.equal(weekFromStart(undefined), undefined);
});
