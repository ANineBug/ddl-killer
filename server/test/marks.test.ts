import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classWith, inDays, setup } from './helpers.ts';

const hw = (s: Awaited<ReturnType<typeof setup>>, title: string) => ({ title, dueKind: 'at', due: inDays(s, 3), submit: '学习通', source: '课堂口头' });

test('个人状态：存了以后换设备拿得回来；只有自己看得到；要登录', async () => {
  const s = await setup();
  const { tokens: [a, b], classId } = await classWith(s, 2);
  const id = (await s.call('POST', `/classes/${classId}/homework`, a, hw(s, '一'))).data.id;
  assert.equal((await s.call('GET', '/me/marks')).status, 401);

  const now = s.ctx.now().toISOString();
  const mark = {
    homeworkId: id,
    done: true,
    doneAt: now,
    ignored: false,
    archived: null,
    reminders: [{ kind: 'before', minutes: 60 }, { kind: 'at', at: now }],
    updatedAt: now,
  };
  const r = await s.call('POST', '/me/marks', b, { marks: [mark] });
  assert.equal(r.status, 200);
  assert.equal(r.data.saved, 1);

  const got = (await s.call('GET', '/me/marks', b)).data.marks;
  assert.equal(got.length, 1);
  assert.equal(got[0].homeworkId, id);
  assert.equal(got[0].done, true);
  assert.equal(got[0].doneAt, now);
  assert.deepEqual(got[0].reminders, mark.reminders);
  assert.equal((await s.call('GET', '/me/marks', a)).data.marks.length, 0);
  await s.close();
});

test('个人状态：旧的不覆盖新的；设备时间在未来的按现在算；不存在的作业跳过；格式不对不收', async () => {
  const s = await setup();
  const { tokens: [a], classId } = await classWith(s, 2);
  const id = (await s.call('POST', `/classes/${classId}/homework`, a, hw(s, '二'))).data.id;
  const t = (ms: number) => new Date(s.ctx.now().getTime() + ms).toISOString();
  const base = { homeworkId: id, doneAt: null, ignored: false, archived: null, reminders: null };

  await s.call('POST', '/me/marks', a, { marks: [{ ...base, done: true, updatedAt: t(-1000) }] });
  // 另一台设备上更早的操作（取消完成），晚到了：不覆盖
  const old = await s.call('POST', '/me/marks', a, { marks: [{ ...base, done: false, updatedAt: t(-5000) }] });
  assert.equal(old.data.saved, 0);
  assert.equal((await s.call('GET', '/me/marks', a)).data.marks[0].done, true);

  // 时间跑到一小时以后的设备：按服务器现在的时间存
  await s.call('POST', '/me/marks', a, { marks: [{ ...base, done: false, ignored: true, updatedAt: t(3600_000) }] });
  const m = (await s.call('GET', '/me/marks', a)).data.marks[0];
  assert.equal(m.ignored, true);
  assert.equal(m.updatedAt, s.ctx.now().toISOString());

  assert.equal((await s.call('POST', '/me/marks', a, { marks: [{ ...base, homeworkId: 999999, done: true, updatedAt: t(0) }] })).data.saved, 0);
  assert.equal((await s.call('POST', '/me/marks', a, { marks: [{ ...base, done: 'yes', updatedAt: t(0) }] })).status, 400);
  assert.equal((await s.call('POST', '/me/marks', a, { marks: [{ ...base, done: true, reminders: [{ kind: 'at', at: '明天' }], updatedAt: t(0) }] })).status, 400);
  await s.close();
});
