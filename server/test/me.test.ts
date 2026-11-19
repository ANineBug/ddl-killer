import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classWith, setup } from './helpers.ts';

test('我的信息：带上是不是管理员、每学期第一周；第一周可以存，格式不对不收', async () => {
  const s = await setup();
  const t = await s.login('me@qq.com');
  const me = await s.call('GET', '/me', t);
  assert.equal(me.data.isAdmin, false);
  assert.deepEqual(me.data.termStarts, {});

  const starts = { '2026-2027学年第1学期': '2026-09-07' };
  assert.equal((await s.call('PATCH', '/me', t, { termStarts: starts })).status, 200);
  assert.deepEqual((await s.call('GET', '/me', t)).data.termStarts, starts);
  assert.equal((await s.call('PATCH', '/me', t, { termStarts: { x: '9月7日' } })).status, 400);
  // 只改昵称时第一周不动
  await s.call('PATCH', '/me', t, { nickname: '新名字' });
  assert.deepEqual((await s.call('GET', '/me', t)).data.termStarts, starts);
  await s.close();
});

test('换设备登录：我的信息里带着加入的每个班和完整的上课时间，够重新画出课表', async () => {
  const s = await setup();
  const { tokens: [a], classId } = await classWith(s, 2);
  const me = await s.call('GET', '/me', a);
  const c = me.data.classes.find((x: any) => x.id === classId);
  assert.ok(c.term && c.name);
  assert.ok(['import', 'manual'].includes(c.via));
  assert.ok(c.slots.length > 0);
  for (const slot of c.slots) {
    assert.ok(slot.weekday >= 1 && slot.weekday <= 7);
    assert.ok(slot.from <= slot.to);
    assert.ok(Array.isArray(slot.weeks) && slot.weeks.length > 0);
  }
  await s.close();
});

test('管理员：列出被降级的账号，恢复以后就不在列表里；不是管理员看不了', async () => {
  const s = await setup();
  const admin = await s.login('admin@qq.com');
  const bad = await s.login('bad@qq.com');
  await s.db.query("update users set is_admin = true where email = 'admin@qq.com'");
  assert.equal((await s.call('GET', '/me', admin)).data.isAdmin, true);
  assert.equal((await s.call('GET', '/admin/users', bad)).status, 403);

  const badId = (await s.call('GET', '/me', bad)).data.id;
  await s.call('POST', `/admin/users/${badId}/demote`, admin, { demoted: true });
  const list = await s.call('GET', '/admin/users', admin);
  assert.deepEqual(list.data.users.map((u: any) => u.id), [badId]);
  await s.call('POST', `/admin/users/${badId}/demote`, admin, { demoted: false });
  assert.equal((await s.call('GET', '/admin/users', admin)).data.users.length, 0);
  await s.close();
});
