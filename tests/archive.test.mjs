import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';

const { isArchived, completionStats, AUTO_ARCHIVE_DAYS } = await loadTs('src/data/archive.ts');
const { TBD_DUE } = await loadTs('src/data/format.ts');

const DAY = 86_400_000;
// 2026-11-12 周四中午（中国时间）
const now = new Date('2026-11-12T04:00:00Z');
const daysAgo = (n) => new Date(now.getTime() - n * DAY);
const hw = (extra = {}) => ({ id: 'h', courseId: 'c1', title: 'x', due: daysAgo(1), uploadedAt: daysAgo(10), done: false, ...extra });

test('完成了、截止过了一周才自动归档', () => {
  assert.equal(isArchived(hw({ done: true, due: daysAgo(AUTO_ARCHIVE_DAYS - 1) }), now), false);
  assert.equal(isArchived(hw({ done: true, due: daysAgo(AUTO_ARCHIVE_DAYS + 1) }), now), true);
  // 没完成的、截止待定的不自动归档
  assert.equal(isArchived(hw({ done: false, due: daysAgo(30) }), now), false);
  assert.equal(isArchived(hw({ done: true, due: TBD_DUE }), now), false);
  // 与我无关的也算收尾了
  assert.equal(isArchived(hw({ ignored: true, due: daysAgo(30) }), now), true);
});

test('自己归档的马上归档；移回的不再自动归档', () => {
  assert.equal(isArchived(hw({ done: true, archived: true }), now), true);
  assert.equal(isArchived(hw({ done: true, due: daysAgo(60), archived: false }), now), false);
});

test('完成记录：总数、按时率、最忙的一周、每门课、每天的格子', () => {
  const items = [
    // 按时交的：截止前完成
    hw({ id: 'a', courseId: 'c1', done: true, due: daysAgo(1), doneAt: daysAgo(2) }),
    hw({ id: 'b', courseId: 'c1', done: true, due: daysAgo(3), doneAt: daysAgo(3.1) }),
    // 晚交的
    hw({ id: 'c', courseId: 'c2', done: true, due: daysAgo(9), doneAt: daysAgo(8) }),
    // 以前完成、没记时间的：按截止那天算，不进按时率
    hw({ id: 'd', courseId: 'c1', done: true, due: daysAgo(9) }),
    // 没完成的不算
    hw({ id: 'e', courseId: 'c2', done: false }),
  ];
  const s = completionStats(items, now);
  assert.equal(s.total, 4);
  assert.equal(s.onTime, 2 / 3);
  assert.deepEqual(s.perCourse, [{ courseId: 'c1', count: 3 }, { courseId: 'c2', count: 1 }]);
  // 这周（周一 11-9 起）完成了 a、b；上周完成了 c、d，一样多时取先遇到的
  assert.equal(s.busiestWeek.count, 2);
  // 格子：15 列，每列 7 天，加起来就是完成数
  assert.equal(s.grid.length, 15);
  assert.ok(s.grid.every((w) => w.length === 7));
  assert.equal(s.grid.flat().reduce((a, b) => a + b, 0), 4);
  // 最右边一列是这周：周二（11-10）完成了 a，周一（11-9）完成了 b
  assert.deepEqual(s.grid[14].slice(0, 4), [1, 1, 0, 0]);
});

test('什么都没完成时不出错', () => {
  const s = completionStats([], now);
  assert.equal(s.total, 0);
  assert.equal(s.onTime, null);
  assert.equal(s.busiestWeek, null);
});
