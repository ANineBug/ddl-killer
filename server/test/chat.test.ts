import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classWith, inDays, setup } from './helpers.ts';

test('聊天：游客和外人看不了；5 秒一条；可以带作业卡片；轮询只拿新的', async () => {
  const s = await setup();
  const { tokens: [a, b], classId } = await classWith(s, 3);
  assert.equal((await s.call('GET', `/classes/${classId}/messages`)).status, 401);
  const out = await s.login('out@qq.com');
  assert.equal((await s.call('GET', `/classes/${classId}/messages`, out)).status, 403);

  const m1 = await s.call('POST', `/classes/${classId}/messages`, a, { text: '第三章交纸质还是学习通？' });
  assert.equal(m1.status, 201);
  assert.equal(m1.data.user.tierName, '同学');
  const fast = await s.call('POST', `/classes/${classId}/messages`, a, { text: '有人知道吗' });
  assert.equal(fast.status, 429);
  s.tick(5000);
  assert.equal((await s.call('POST', `/classes/${classId}/messages`, a, { text: '有人知道吗' })).status, 201);

  const hwId = (await s.call('POST', `/classes/${classId}/homework`, b, { title: '第三章', dueKind: 'at', due: inDays(s, 2), submit: '学习通', source: '学习通' })).data.id;
  const card = await s.call('POST', `/classes/${classId}/messages`, b, { text: '在这', homeworkId: hwId });
  assert.equal(card.data.homework.title, '第三章');

  const all = await s.call('GET', `/classes/${classId}/messages`, b);
  assert.equal(all.data.messages.length, 3);
  const newer = await s.call('GET', `/classes/${classId}/messages?after=${m1.data.id}`, b);
  assert.equal(newer.data.messages.length, 2);
  await s.close();
});

test('排行榜：班级榜看这个班的分，总榜前 50 加自己的名次', async () => {
  const s = await setup();
  const { tokens: [a, b, c], classId } = await classWith(s, 6);
  const id = (await s.call('POST', `/classes/${classId}/homework`, a, { title: 'x', dueKind: 'tbd', submit: '纸质', source: '群通知' })).data.id;
  await s.call('POST', `/homework/${id}/confirm`, b);
  await s.call('POST', `/homework/${id}/confirm`, c);

  const board = await s.call('GET', `/classes/${classId}/board`);
  assert.equal(board.data.board[0].score, 10);
  assert.equal(board.data.board.length, 6);

  const g = await s.call('GET', '/board', a);
  assert.equal(g.data.top.length, 1);
  assert.deepEqual(g.data.me, { score: 10, rank: 1 });
  const gb = await s.call('GET', '/board', b);
  assert.deepEqual(gb.data.me, { score: 0, rank: null });
  await s.close();
});

test('总分榜分总榜、月榜、周榜：周一 0 点、每月 1 号 0 点（中国时间）重新算', async () => {
  const s = await setup(); // 2026-09-14 周一上午 10 点（中国时间）
  const { tokens: [a, b, c], classId } = await classWith(s, 6);
  const id = (await s.call('POST', `/classes/${classId}/homework`, a, { title: 'x', dueKind: 'tbd', submit: '纸质', source: '群通知' })).data.id;
  await s.call('POST', `/homework/${id}/confirm`, b);
  await s.call('POST', `/homework/${id}/confirm`, c);
  const scores = async () =>
    Object.fromEntries(
      await Promise.all(
        ['all', 'month', 'week'].map(async (p) => [p, (await s.call('GET', `/board?period=${p}`, a)).data.me.score]),
      ),
    );

  assert.deepEqual(await scores(), { all: 10, month: 10, week: 10 });
  s.tick(7 * 86_400_000); // 下周一：周榜清零，月榜还在
  assert.deepEqual(await scores(), { all: 10, month: 10, week: 0 });
  s.tick(17 * 86_400_000); // 10 月 8 日：月榜也清零，总榜一直在
  assert.deepEqual(await scores(), { all: 10, month: 0, week: 0 });
  // 不认识的 period 当总榜
  assert.equal((await s.call('GET', '/board?period=year', a)).data.period, 'all');
  await s.close();
});

test('总聊天室：登录才能看和发；不分班，谁都能看到；和班级聊天共用 5 秒间隔；不显示档位', async () => {
  const s = await setup();
  const { tokens: [a], classId } = await classWith(s, 2);
  const out = await s.login('lobby@qq.com');
  assert.equal((await s.call('GET', '/lobby/messages')).status, 401);
  assert.equal((await s.call('POST', '/lobby/messages', undefined, { text: '大家好' })).status, 401);

  const m1 = await s.call('POST', '/lobby/messages', out, { text: '  大家好  ' });
  assert.equal(m1.status, 201);
  assert.equal(m1.data.text, '大家好');
  assert.equal(m1.data.user.tierName, null);
  assert.equal((await s.call('POST', '/lobby/messages', out, { text: '   ' })).status, 400);
  assert.equal((await s.call('POST', '/lobby/messages', out, { text: '字'.repeat(501) })).status, 400);

  // 在班里刚发过，大厅里也要等 5 秒
  assert.equal((await s.call('POST', `/classes/${classId}/messages`, a, { text: '班里' })).status, 201);
  assert.equal((await s.call('POST', '/lobby/messages', a, { text: '大厅' })).status, 429);
  s.tick(5000);
  const m2 = await s.call('POST', '/lobby/messages', a, { text: '大厅' });
  assert.equal(m2.status, 201);

  // 大厅只有大厅的消息，班里的消息不会混进来，反过来也一样
  const lobby = await s.call('GET', '/lobby/messages', out);
  assert.deepEqual(lobby.data.messages.map((m: any) => m.text), ['大家好', '大厅']);
  assert.equal((await s.call('GET', `/lobby/messages?after=${m1.data.id}`, out)).data.messages.length, 1);
  const cls = await s.call('GET', `/classes/${classId}/messages`, a);
  assert.deepEqual(cls.data.messages.map((m: any) => m.text), ['班里']);
  await s.close();
});

test('总聊天室：被降级的账号只能看不能发；管理员删的消息看不到', async () => {
  const s = await setup();
  const admin = await s.login('admin@qq.com');
  const bad = await s.login('bad@qq.com');
  await s.db.query("update users set is_admin = true where email = 'admin@qq.com'");
  const msg = await s.call('POST', '/lobby/messages', bad, { text: '广告' });
  const badId = (await s.call('GET', '/me', bad)).data.id;
  assert.equal((await s.call('DELETE', `/admin/messages/${msg.data.id}`, admin)).status, 200);
  assert.equal((await s.call('GET', '/lobby/messages', admin)).data.messages.length, 0);
  assert.equal((await s.call('POST', `/admin/users/${badId}/demote`, admin, { demoted: true })).status, 200);
  s.tick(5000);
  const muted = await s.call('POST', '/lobby/messages', bad, { text: '再来' });
  assert.equal(muted.status, 403);
  assert.equal((await s.call('GET', '/lobby/messages', bad)).status, 200);
  await s.close();
});
