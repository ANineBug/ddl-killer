import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';

const { mergeMark } = await loadTs('src/data/marks.ts');

const t = (min) => new Date(Date.UTC(2026, 10, 19, 8, min));
const hw = (extra = {}) => ({ id: 's1', courseId: 'c', title: 'x', done: false, remote: { id: 1 }, ...extra });
const mark = (extra = {}) => ({ homeworkId: 1, done: true, doneAt: t(5), ignored: false, archived: null, reminders: null, updatedAt: t(5), ...extra });

test('服务器上有状态：换设备时用服务器的', () => {
  const r = mergeMark(hw(), mark());
  assert.equal(r.done, true);
  assert.equal(r.doneAt.getTime(), t(5).getTime());
  assert.equal(r.markPending, false);
});

test('本机改得更晚、还没存上：留本机的', () => {
  const local = hw({ done: false, markedAt: t(9), markPending: true });
  assert.equal(mergeMark(local, mark()).done, false);
});

test('本机改得更早（比如另一台设备后来又改了）：用服务器的', () => {
  const local = hw({ done: false, markedAt: t(1), markPending: true });
  assert.equal(mergeMark(local, mark()).done, true);
});

test('老版本打的勾，服务器上没有：标成待上传，时间用打勾的时间', () => {
  const r = mergeMark(hw({ done: true, doneAt: t(2) }), undefined);
  assert.equal(r.markPending, true);
  assert.equal(r.markedAt.getTime(), t(2).getTime());
});

test('什么状态都没有、服务器上也没有：不动；只在手机上的作业：不动', () => {
  const plain = hw();
  assert.equal(mergeMark(plain, undefined), plain);
  const local = { id: 'h1', done: true };
  assert.equal(mergeMark(local, mark()), local);
});

test('服务器上的空值变回本机的「没设置」', () => {
  const r = mergeMark(hw({ ignored: true, archived: true, reminders: [{ kind: 'before', minutes: 60 }], markedAt: t(1) }), mark({ done: false, doneAt: null }));
  assert.equal(r.ignored, undefined);
  assert.equal(r.archived, undefined);
  assert.equal(r.reminders, undefined);
  assert.equal(r.doneAt, undefined);
});
