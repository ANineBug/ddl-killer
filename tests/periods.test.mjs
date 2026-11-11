import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';

const { nextClass } = await loadTs('src/data/periods.ts');

const course = {
  id: 'c1',
  name: '概率论',
  teacher: '王老师',
  weeks: [{ from: 1, to: 17, rule: 'all' }],
  sessions: [
    { weekday: 1, from: 6, to: 7, location: '经世楼G901' },
    { weekday: 5, from: 5, to: 6, location: '经世楼G901' },
  ],
  hue: 0,
  members: 0,
};
// 2026-11-11 是周三
const wed = new Date(2026, 10, 11, 10, 0);

test('没填上课时间：按那天早上 7 点算，并告诉界面是没填的', () => {
  const n = nextClass(course, undefined, {}, wed);
  assert.equal(n.period, 5);
  assert.equal(n.known, false);
  assert.equal(n.at.getTime(), new Date(2026, 10, 13, 7, 0).getTime());
});

test('填了就按填的时间；当天的课已经开始了就找下一次', () => {
  const n = nextClass(course, undefined, { 5: '14:25', 6: '13:30' }, wed);
  assert.equal(n.known, true);
  assert.equal(n.at.getTime(), new Date(2026, 10, 13, 14, 25).getTime());
  const fri = new Date(2026, 10, 13, 15, 0);
  const after = nextClass(course, undefined, { 5: '14:25', 6: '13:30' }, fri);
  assert.equal(after.at.getTime(), new Date(2026, 10, 16, 13, 30).getTime());
});
