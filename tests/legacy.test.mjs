import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';

const { dropDemo } = await loadTs('src/data/legacy.ts');

const course = (id, extra = {}) => ({ id, name: id, teacher: '', sessions: [], weeks: [], hue: 0, members: 0, ...extra });
const hw = (id, courseId, extra = {}) => ({ id, courseId, title: id, ...extra });

test('旧版本留下的演示课和演示作业会被清掉', () => {
  const { courses, homework } = dropDemo(
    [course('prob'), course('micro'), course('c-1700000000000-0', { source: { term: '2026-2027-1' } })],
    [hw('h1', 'prob'), hw('h6', 'prob'), hw('h-1700000000000-1', 'c-1700000000000-0')],
  );
  assert.deepEqual(courses.map((c) => c.id), ['c-1700000000000-0']);
  assert.deepEqual(homework.map((h) => h.id), ['h-1700000000000-1']);
});

test('自己挂在演示课下面的作业跟着演示课一起清掉', () => {
  const { homework } = dropDemo([course('eng')], [hw('h-1700000000000-2', 'eng')]);
  assert.deepEqual(homework, []);
});

test('导入过或连了服务器的课，就算编号撞上也不动', () => {
  const imported = course('py', { source: { term: '2026-2027-1' } });
  const linked = course('acct', { serverClassId: 7 });
  const { courses, homework } = dropDemo([imported, linked], [hw('s12', 'acct', { remote: { id: 12 } }), hw('h-1', 'py')]);
  assert.deepEqual(courses, [imported, linked]);
  assert.deepEqual(homework.map((h) => h.id), ['s12', 'h-1']);
});

test('没有演示数据时原样返回', () => {
  const c = [course('c-1')];
  const h = [hw('h-9', 'c-1')];
  assert.deepEqual(dropDemo(c, h), { courses: c, homework: h });
});
