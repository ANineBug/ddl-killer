import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classWith, inDays, probability, setup, TERM } from './helpers.ts';

const hw = (s: Awaited<ReturnType<typeof setup>>, title = '第三章习题', days = 3) => ({
  title,
  dueKind: 'at',
  due: inDays(s, days),
  submit: '学习通',
  source: '课堂口头',
});

const score = async (s: Awaited<ReturnType<typeof setup>>, classId: number, token: string) => {
  const me = await s.call('GET', '/me', token);
  return me.data.classes.find((c: any) => c.id === classId).myScore as number;
};

test('上传 → 别人确认够门槛 → 已确认，上传者 +10；自己不能确认自己的', async () => {
  const s = await setup();
  const { tokens: [a, b, c], classId } = await classWith(s, 6); // 6 人，确认门槛 2
  const up = await s.call('POST', `/classes/${classId}/homework`, a, hw(s));
  assert.equal(up.status, 201);
  assert.equal(up.data.state, 'pending');
  assert.equal(up.data.remindReady, true);
  const id = up.data.id;

  assert.equal((await s.call('POST', `/homework/${id}/confirm`, a)).status, 400);
  assert.equal((await s.call('POST', `/homework/${id}/confirm`, b)).data.state, 'pending');
  const done = await s.call('POST', `/homework/${id}/confirm`, c);
  assert.equal(done.data.state, 'confirmed');
  assert.equal(done.data.confirms.current, 2);
  assert.equal(await score(s, classId, a), 10);

  // 确认之后上传者不能再自己改、自己删
  assert.equal((await s.call('PATCH', `/homework/${id}`, a, { title: '改个名' })).status, 403);
  assert.equal((await s.call('DELETE', `/homework/${id}`, a)).status, 403);
  await s.close();
});

test('确认前上传者可以自己改；改过之后，之前的确认标成"修改前的确认"', async () => {
  const s = await setup();
  const { tokens: [a, b], classId } = await classWith(s, 6);
  const id = (await s.call('POST', `/classes/${classId}/homework`, a, hw(s))).data.id;
  await s.call('POST', `/homework/${id}/confirm`, b);
  const edited = await s.call('PATCH', `/homework/${id}`, a, { title: '第三章习题 1-10' });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.version, 2);
  const seen = await s.call('GET', `/homework/${id}`, b);
  assert.equal(seen.data.me.confirmed, 'old');
  assert.deepEqual(seen.data.confirms, { current: 0, old: 1 });
  assert.equal(seen.data.history[0].changes.title.to, '第三章习题 1-10');
  await s.close();
});

test('纠错被上传者采纳：马上生效，但要等别人确认新版本才加减分', async () => {
  const s = await setup();
  const { tokens: [a, b, c, d, e, f], classId } = await classWith(s, 6);
  const id = (await s.call('POST', `/classes/${classId}/homework`, a, hw(s))).data.id;
  await s.call('POST', `/homework/${id}/confirm`, b);
  await s.call('POST', `/homework/${id}/confirm`, c);
  assert.equal(await score(s, classId, a), 10);

  const p = await s.call('POST', `/homework/${id}/proposals`, d, { kind: 'correct', changes: { title: '第四章习题' }, reason: '老师说的是第四章' });
  assert.equal(p.status, 201);
  assert.equal((await s.call('GET', `/homework/${id}`)).data.state, 'disputed');
  // 上传者不能投票，只能采纳
  assert.equal((await s.call('POST', `/proposals/${p.data.id}/vote`, a, { agree: true })).data.error, 'use_adopt');
  assert.equal((await s.call('POST', `/proposals/${p.data.id}/adopt`, a)).data.status, 'applied');

  const after = await s.call('GET', `/homework/${id}`, b);
  assert.equal(after.data.title, '第四章习题');
  assert.equal(after.data.state, 'confirmed');
  assert.equal(after.data.me.confirmed, 'old');
  assert.equal(await score(s, classId, d), 0);

  await s.call('POST', `/homework/${id}/confirm`, e);
  assert.equal(await score(s, classId, d), 0);
  await s.call('POST', `/homework/${id}/confirm`, f);
  assert.equal(await score(s, classId, d), 5);
  assert.equal(await score(s, classId, a), 5);
  await s.close();
});

test('更新靠投票通过：当场生效、当场加分；往后推截止时间门槛更高', async () => {
  const s = await setup();
  const { tokens: [a, b, c, d, e], classId } = await classWith(s, 6); // 更新门槛 2，往后推门槛 3
  const id = (await s.call('POST', `/classes/${classId}/homework`, a, hw(s, '论文', 3))).data.id;
  const later = inDays(s, 7);
  const p = await s.call('POST', `/homework/${id}/proposals`, b, { kind: 'update', changes: { due: later } });
  const open = await s.call('GET', `/homework/${id}`);
  // 有争议时按最早的时间提醒
  assert.equal(open.data.earliestDue, open.data.due);
  const prop = open.data.proposals[0];
  assert.equal(prop.threshold, 3);

  assert.equal((await s.call('POST', `/proposals/${p.data.id}/vote`, c, { agree: true })).data.status, 'open');
  assert.equal((await s.call('POST', `/proposals/${p.data.id}/vote`, d, { agree: true })).data.status, 'open');
  assert.equal((await s.call('POST', `/proposals/${p.data.id}/vote`, e, { agree: true })).data.status, 'applied');

  const after = await s.call('GET', `/homework/${id}`);
  assert.equal(after.data.due, later);
  assert.equal(after.data.postponed, true);
  assert.equal(after.data.history[0].by.id, (await s.call('GET', '/me', b)).data.id);
  assert.equal(await score(s, classId, b), 3);
  assert.equal(await score(s, classId, a), 0);
  await s.close();
});

test('反对够门槛就否决；每人每条作业同时只有一条提议；截止后提议自动结束', async () => {
  const s = await setup();
  const { tokens: [a, b, c, d], classId } = await classWith(s, 6);
  const id = (await s.call('POST', `/classes/${classId}/homework`, a, hw(s, '小测', 1))).data.id;
  const p = await s.call('POST', `/homework/${id}/proposals`, b, { kind: 'correct', changes: { submit: '纸质' } });
  assert.equal((await s.call('POST', `/homework/${id}/proposals`, b, { kind: 'correct', changes: { submit: '邮箱' } })).status, 409);
  await s.call('POST', `/proposals/${p.data.id}/vote`, c, { agree: false });
  assert.equal((await s.call('POST', `/proposals/${p.data.id}/vote`, d, { agree: false })).data.status, 'rejected');
  assert.equal(await score(s, classId, b), 0);

  const p2 = await s.call('POST', `/homework/${id}/proposals`, b, { kind: 'correct', changes: { submit: '邮箱' } });
  assert.equal(p2.status, 201);
  s.tick(2 * 86_400_000);
  const late = await s.call('POST', `/proposals/${p2.data.id}/vote`, c, { agree: true });
  assert.equal(late.data.error, 'closed');
  const detail = await s.call('GET', `/homework/${id}`);
  assert.equal(detail.data.state, 'closed');
  assert.equal(detail.data.proposals.find((x: any) => x.id === p2.data.id).status, 'expired');
  await s.close();
});

test('自己纠正自己（已确认之后）：要别人同意，不加分也不扣分', async () => {
  const s = await setup();
  const { tokens: [a, b, c, d, e], classId } = await classWith(s, 6);
  const id = (await s.call('POST', `/classes/${classId}/homework`, a, hw(s))).data.id;
  // 还没人确认时，自己传的直接改
  assert.equal((await s.call('POST', `/homework/${id}/proposals`, a, { kind: 'correct', changes: { title: 'x' } })).data.error, 'edit_directly');
  await s.call('POST', `/homework/${id}/confirm`, b);
  await s.call('POST', `/homework/${id}/confirm`, c);
  const p = await s.call('POST', `/homework/${id}/proposals`, a, { kind: 'correct', changes: { title: '第三章习题（订正）' } });
  assert.equal((await s.call('POST', `/proposals/${p.data.id}/adopt`, a)).data.error, 'own_proposal');
  await s.call('POST', `/proposals/${p.data.id}/vote`, d, { agree: true });
  assert.equal((await s.call('POST', `/proposals/${p.data.id}/vote`, e, { agree: true })).data.status, 'applied');
  assert.equal(await score(s, classId, a), 10);
  await s.close();
});

test('新同学：每班每天限传 3 条；正式成员确认之前不推提醒；权重 0', async () => {
  const s = await setup();
  const { tokens: [a, b, c], classId } = await classWith(s, 6);
  const n = await s.login('newbie@163.com');
  await s.call('POST', `/classes/${classId}/join`, n);
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const r = await s.call('POST', `/classes/${classId}/homework`, n, hw(s, `作业${i}`));
    assert.equal(r.status, 201);
    assert.equal(r.data.remindReady, false);
    ids.push(r.data.id);
  }
  const fourth = await s.call('POST', `/classes/${classId}/homework`, n, hw(s, '作业3'));
  assert.equal(fourth.data.error, 'newbie_limit');
  s.tick(86_400_000);
  assert.equal((await s.call('POST', `/classes/${classId}/homework`, n, hw(s, '作业3'))).status, 201);

  // 新同学的确认没有权重，也不会让作业开始推提醒
  const id = (await s.call('POST', `/classes/${classId}/homework`, a, hw(s, '别人的'))).data.id;
  const n2 = await s.login('newbie2@163.com');
  await s.call('POST', `/classes/${classId}/join`, n2);
  await s.call('POST', `/homework/${ids[0]}/confirm`, n2);
  assert.equal((await s.call('GET', `/homework/${ids[0]}`)).data.remindReady, false);
  await s.call('POST', `/homework/${ids[0]}/confirm`, b);
  assert.equal((await s.call('GET', `/homework/${ids[0]}`)).data.remindReady, true);

  // 新同学被确认够门槛也加分，攒到 20 分就是同学
  await s.call('POST', `/homework/${ids[0]}/confirm`, c);
  await s.call('POST', `/homework/${ids[1]}/confirm`, b);
  await s.call('POST', `/homework/${ids[1]}/confirm`, c);
  const me = await s.call('GET', '/me', n);
  const cls = me.data.classes.find((x: any) => x.id === classId);
  assert.equal(cls.myScore, 20);
  assert.equal(cls.myTier, 'member');
  assert.ok(id);
  await s.close();
});

test('重复：投票合并，留下先传的；列表里只剩一条，标"已合并 1 条"；可以再拆回来', async () => {
  const s = await setup();
  const { tokens: [a, b, c, d], classId } = await classWith(s, 6); // 重复门槛 2
  const first = (await s.call('POST', `/classes/${classId}/homework`, a, hw(s, '第三章习题'))).data.id;
  s.tick(60_000);
  const second = (await s.call('POST', `/classes/${classId}/homework`, b, hw(s, '三章课后题'))).data.id;

  const p = await s.call('POST', `/homework/${second}/proposals`, c, { kind: 'duplicate', targetId: first });
  const list = await s.call('GET', `/classes/${classId}/homework`);
  assert.deepEqual(list.data.homework.find((h: any) => h.id === first).possibleDuplicates, [second]);

  await s.call('POST', `/proposals/${p.data.id}/vote`, d, { agree: true });
  assert.equal((await s.call('POST', `/proposals/${p.data.id}/vote`, a, { agree: true })).data.status, 'applied');
  const merged = await s.call('GET', `/classes/${classId}/homework`);
  assert.deepEqual(merged.data.homework.map((h: any) => h.id), [first]);
  const kept = await s.call('GET', `/homework/${first}`);
  assert.equal(kept.data.uploaderCount, 2);
  assert.equal(kept.data.mergedFrom.length, 1);

  const un = await s.call('POST', `/homework/${second}/proposals`, b, { kind: 'unduplicate' });
  await s.call('POST', `/proposals/${un.data.id}/vote`, c, { agree: true });
  assert.equal((await s.call('POST', `/proposals/${un.data.id}/vote`, d, { agree: true })).data.status, 'applied');
  assert.equal((await s.call('GET', `/classes/${classId}/homework`)).data.homework.length, 2);
  await s.close();
});

test('重复合并保护先传的：后传的收回确认分、再扣 3 分；确认转给先传的，够了就 +10；拆回来退还', async () => {
  const s = await setup();
  const { tokens: [a, b, c, d, e], classId } = await classWith(s, 6); // 确认、重复门槛都是 2
  const first = (await s.call('POST', `/classes/${classId}/homework`, a, hw(s, '第三章习题'))).data.id;
  s.tick(60_000);
  const second = (await s.call('POST', `/classes/${classId}/homework`, b, hw(s, '三章课后题'))).data.id;

  // 后传的那条先被两个人确认了，b 拿到 10 分；先传的那条只有 e 确认过
  await s.call('POST', `/homework/${second}/confirm`, c);
  await s.call('POST', `/homework/${second}/confirm`, d);
  await s.call('POST', `/homework/${first}/confirm`, e);
  assert.equal(await score(s, classId, b), 10);
  assert.equal(await score(s, classId, a), 0);

  const p = await s.call('POST', `/homework/${second}/proposals`, c, { kind: 'duplicate', targetId: first });
  await s.call('POST', `/proposals/${p.data.id}/vote`, d, { agree: true });
  assert.equal((await s.call('POST', `/proposals/${p.data.id}/vote`, e, { agree: true })).data.status, 'applied');

  // b：10 分收回，再扣 3；a：c、d 的确认转过来，加上 e 的够了门槛，+10
  assert.equal(await score(s, classId, b), -3);
  assert.equal(await score(s, classId, a), 10);
  const kept = await s.call('GET', `/homework/${first}`, a);
  assert.equal(kept.data.state, 'confirmed');
  assert.equal(kept.data.confirms.current, 3);

  // 大家觉得其实不是重复：拆回来，b 扣掉的都退回，a 已经拿到的分不动
  const un = await s.call('POST', `/homework/${second}/proposals`, b, { kind: 'unduplicate' });
  await s.call('POST', `/proposals/${un.data.id}/vote`, c, { agree: true });
  assert.equal((await s.call('POST', `/proposals/${un.data.id}/vote`, d, { agree: true })).data.status, 'applied');
  assert.equal(await score(s, classId, b), 10);
  assert.equal(await score(s, classId, a), 10);
  await s.close();
});

test('不是班里的人不能传、不能确认；游客不能传', async () => {
  const s = await setup();
  const { tokens: [a], classId } = await classWith(s, 2);
  const id = (await s.call('POST', `/classes/${classId}/homework`, a, hw(s))).data.id;
  const outsider = await s.login('out@qq.com');
  assert.equal((await s.call('POST', `/classes/${classId}/homework`, outsider, hw(s))).status, 403);
  assert.equal((await s.call('POST', `/homework/${id}/confirm`, outsider)).status, 403);
  assert.equal((await s.call('POST', `/classes/${classId}/homework`, undefined, hw(s))).status, 401);
  assert.equal((await s.call('POST', `/classes/${classId}/homework`, a, { ...hw(s), due: undefined })).status, 400);
  const tbd = await s.call('POST', `/classes/${classId}/homework`, a, { ...hw(s), dueKind: 'tbd', due: undefined });
  assert.equal(tbd.status, 201);
  assert.equal(tbd.data.due, null);
  assert.ok(TERM && probability);
  await s.close();
});
