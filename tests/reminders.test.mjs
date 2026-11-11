import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';

const { planReminders } = await loadTs('src/data/reminders.ts');

// 都用本地时间构造，换时区跑结果也一样
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m);
const now = at(11, 10);
const settings = { remindDay: true, remindHours: true, quietNight: true };
const courses = [{ id: 'c1', name: '概率论' }];
const hw = (over = {}) => ({
  id: 'h1',
  courseId: 'c1',
  title: '习题 3.2',
  detail: '',
  due: at(13, 18),
  submit: '纸质',
  uploader: '小林',
  uploadedAt: now,
  reactions: { confirm: 0, thumbs: 0, cry: 0 },
  myReactions: [],
  done: false,
  hasPhoto: false,
  ...over,
});
const times = (plan) => plan.map((p) => p.at.getTime());

test('默认：截止前 1 天和前 3 小时各一条，标题写清还剩多久', () => {
  const plan = planReminders([hw()], courses, settings, now);
  assert.deepEqual(times(plan), [at(12, 18).getTime(), at(13, 15).getTime()]);
  assert.match(plan[0].title, /还有 1 天截止/);
  assert.match(plan[1].title, /还有 3 小时截止/);
  assert.match(plan[1].body, /^概率论 · /);
});

test('夜间免打扰：落在 23:00–7:00 的挪到前一晚 22:30', () => {
  const plan = planReminders([hw({ due: at(13, 8) })], courses, settings, now);
  // 前 1 天 = 12 日 08:00（不动）；前 3 小时 = 13 日 05:00 → 12 日 22:30
  assert.deepEqual(times(plan), [at(12, 8).getTime(), at(12, 22, 30).getTime()]);
  const off = planReminders([hw({ due: at(13, 8) })], courses, { ...settings, quietNight: false }, now);
  assert.deepEqual(times(off), [at(12, 8).getTime(), at(13, 5).getTime()]);
});

test('完成了、与我无关、截止待定、已取消、新同学传的还没确认：都不提醒', () => {
  const remote = (over) => ({ id: 1, classId: 1, state: 'pending', dueKind: 'at', version: 1, confirmedOld: false, remindReady: true, postponed: false, uploaderCount: 1, openProposals: 0, source: '群通知', optional: false, groupWork: false, ...over });
  const list = [
    hw({ id: 'a', done: true }),
    hw({ id: 'b', ignored: true }),
    hw({ id: 'c', due: new Date('2099-12-31T15:59:00Z') }),
    hw({ id: 'd', remote: remote({ state: 'cancelled' }) }),
    hw({ id: 'e', remote: remote({ remindReady: false }) }),
    hw({ id: 'f', remote: remote({}) }),
  ];
  const ids = new Set(planReminders(list, courses, settings, now).map((p) => p.homeworkId));
  assert.deepEqual([...ids], ['f']);
});

test('有争议：有人提议提前截止，按最早的时间提醒，并说明原因', () => {
  const remote = { id: 1, classId: 1, state: 'disputed', dueKind: 'at', earliestDue: at(12, 18), version: 1, confirmedOld: false, remindReady: true, postponed: false, uploaderCount: 1, openProposals: 1, source: '群通知', optional: false, groupWork: false };
  const plan = planReminders([hw({ remote })], courses, settings, now);
  assert.deepEqual(times(plan), [at(11, 18).getTime(), at(12, 15).getTime()]);
  assert.match(plan[0].body, /有人提议修改/);
});

test('自己设的提醒代替默认；已经过去的不排', () => {
  const plan = planReminders([hw({ reminders: [{ kind: 'at', at: at(12, 21) }, { kind: 'before', minutes: 60 * 24 * 5 }] })], courses, settings, now);
  assert.deepEqual(times(plan), [at(12, 21).getTime()]);
});
