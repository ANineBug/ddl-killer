import assert from 'node:assert/strict';
import { test } from 'node:test';

import { physics, probability, setup, TERM } from './helpers.ts';

test('两个人导入同一门课（时间 + 教室相同）认成同一个班，教室写法不同也一样', async () => {
  const s = await setup();
  const a = await s.login('a@qq.com');
  const b = await s.login('b@qq.com');
  const ra = await s.call('POST', '/me/import', a, { term: TERM, courses: [probability, physics] });
  assert.equal(ra.status, 200);
  assert.equal(ra.data.courses[0].created, true);
  const variant = {
    ...probability,
    name: '【调】概率论与数理统计B▲',
    sessions: probability.sessions.map((x) => ({ ...x, location: x.location.replace('G101', ' G101') })),
  };
  const rb = await s.call('POST', '/me/import', b, { term: TERM, courses: [variant] });
  assert.equal(rb.data.courses[0].created, false);
  assert.equal(rb.data.courses[0].classId, ra.data.courses[0].classId);
  const cls = await s.call('GET', `/classes/${ra.data.courses[0].classId}`);
  assert.equal(cls.data.members, 2);
  await s.close();
});

test('只看时间 + 教室：课名写法不一样（比如少了几个字）也认成同一个班', async () => {
  const s = await setup();
  const a = await s.login('a@qq.com');
  const b = await s.login('b@qq.com');
  const ra = await s.call('POST', '/me/import', a, { term: TERM, courses: [probability] });
  const rb = await s.call('POST', '/me/import', b, { term: TERM, courses: [{ ...probability, name: '概率论与数理统计' }] });
  assert.equal(rb.data.courses[0].classId, ra.data.courses[0].classId);
  await s.close();
});

test('同一时间同一教室，但单双周错开的，是两个班', async () => {
  const s = await setup();
  const a = await s.login('a@qq.com');
  const b = await s.login('b@qq.com');
  const odd = { name: '体育', teacher: '甲', sessions: [{ weekday: 2, from: 3, to: 4, location: '体育馆 A', weeks: [{ from: 1, to: 16, rule: 'odd' }] }] };
  const even = { ...odd, sessions: [{ ...odd.sessions[0], weeks: [{ from: 1, to: 16, rule: 'even' }] }] };
  const ra = await s.call('POST', '/me/import', a, { term: TERM, courses: [odd] });
  const rb = await s.call('POST', '/me/import', b, { term: TERM, courses: [even] });
  assert.notEqual(ra.data.courses[0].classId, rb.data.courses[0].classId);
  await s.close();
});

test('只在讲座场地上的课，要老师也一样才认成一个班', async () => {
  const s = await setup();
  const a = await s.login('a@qq.com');
  const b = await s.login('b@qq.com');
  const c = await s.login('c@qq.com');
  const lecture = (teacher: string) => ({
    name: '形势与政策',
    teacher,
    sessions: [{ weekday: 4, from: 11, to: 12, location: '讲座场地', weeks: [{ from: 6, to: 6, rule: 'all' }] }],
  });
  const ra = await s.call('POST', '/me/import', a, { term: TERM, courses: [lecture('甲')] });
  const rb = await s.call('POST', '/me/import', b, { term: TERM, courses: [lecture('甲')] });
  const rc = await s.call('POST', '/me/import', c, { term: TERM, courses: [lecture('乙')] });
  assert.equal(ra.data.courses[0].classId, rb.data.courses[0].classId);
  assert.notEqual(ra.data.courses[0].classId, rc.data.courses[0].classId);
  await s.close();
});

test('带教务教学班 id 的按 id 认；id 不同的合班课不会被认成一个', async () => {
  const s = await setup();
  const a = await s.login('a@qq.com');
  const b = await s.login('b@qq.com');
  const c = await s.login('c@qq.com');
  const ra = await s.call('POST', '/me/import', a, { term: TERM, courses: [{ ...probability, jxbId: 'AAA' }] });
  const rb = await s.call('POST', '/me/import', b, { term: TERM, courses: [probability] });
  const rc = await s.call('POST', '/me/import', c, { term: TERM, courses: [{ ...probability, jxbId: 'BBB' }] });
  assert.equal(ra.data.courses[0].classId, rb.data.courses[0].classId);
  assert.notEqual(ra.data.courses[0].classId, rc.data.courses[0].classId);
  await s.close();
});

test('导入时多余的字段（学号、姓名）不会存下来', async () => {
  const s = await setup();
  const a = await s.login('a@qq.com');
  const r = await s.call('POST', '/me/import', a, { term: TERM, sid: '42000000', student: '张三', courses: [{ ...probability, sid: '1' }] });
  assert.equal(r.status, 200);
  const dump = JSON.stringify(await s.db.query('select * from classes')) + JSON.stringify(await s.db.query('select * from class_slots'));
  assert.ok(!dump.includes('42000000') && !dump.includes('张三'));
  await s.close();
});

test('游客只查对应的班，不建班、不算人数', async () => {
  const s = await setup();
  const guest = await s.call('POST', '/classes/resolve', undefined, { term: TERM, courses: [probability] });
  assert.equal(guest.data.courses[0].classId, null);
  assert.equal((await s.db.query('select * from classes')).length, 0);
  const a = await s.login('a@qq.com');
  const ra = await s.call('POST', '/me/import', a, { term: TERM, courses: [probability] });
  const again = await s.call('POST', '/classes/resolve', undefined, { term: TERM, courses: [probability] });
  assert.equal(again.data.courses[0].classId, ra.data.courses[0].classId);
  // 游客看得到作业列表
  assert.equal((await s.call('GET', `/classes/${ra.data.courses[0].classId}/homework`)).status, 200);
  await s.close();
});

test('手动加入：只能加已有的班；时间冲突的不能加；手动加入的是新同学', async () => {
  const s = await setup();
  const a = await s.login('a@qq.com');
  const b = await s.login('b@qq.com');
  const ra = await s.call('POST', '/me/import', a, { term: TERM, courses: [probability, physics] });
  const probId = ra.data.courses[0].classId;
  const physId = ra.data.courses[1].classId;

  const found = await s.call('GET', `/classes/search?term=${encodeURIComponent(TERM)}&q=${encodeURIComponent('概率')}`);
  assert.equal(found.data.classes.length, 1);
  assert.equal(found.data.classes[0].id, probId);

  // b 的课表里周三 10-12 节已经有一门别的课
  const other = { name: '线性代数', teacher: '丙', sessions: [{ weekday: 3, from: 11, to: 12, location: '通博楼 B101', weeks: [{ from: 1, to: 17, rule: 'all' }] }] };
  await s.call('POST', '/me/import', b, { term: TERM, courses: [other] });
  const conflict = await s.call('POST', `/classes/${physId}/join`, b);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.error, 'time_conflict');

  assert.equal((await s.call('POST', `/classes/${probId}/join`, b)).status, 200);
  const me = await s.call('GET', '/me', b);
  const joined = me.data.classes.find((c: any) => c.id === probId);
  assert.equal(joined.via, 'manual');
  assert.equal(joined.myTier, 'newbie');
  // 新同学不算班级人数
  assert.equal((await s.call('GET', `/classes/${probId}`)).data.members, 1);
  await s.close();
});

test('重新导入：退掉的课自动退出，和导入冲突的手动班也退出', async () => {
  const s = await setup();
  const a = await s.login('a@qq.com');
  const b = await s.login('b@qq.com');
  const ra = await s.call('POST', '/me/import', a, { term: TERM, courses: [probability, physics] });
  const physId = ra.data.courses[1].classId;
  await s.call('POST', '/me/import', b, { term: TERM, courses: [probability] });
  await s.call('POST', `/classes/${physId}/join`, b);
  assert.equal((await s.call('GET', '/me', b)).data.classes.length, 2);

  const other = { name: '线性代数', teacher: '丙', sessions: [{ weekday: 3, from: 10, to: 11, location: '通博楼 B101', weeks: [{ from: 1, to: 17, rule: 'all' }] }] };
  await s.call('POST', '/me/import', b, { term: TERM, courses: [other] });
  const names = (await s.call('GET', '/me', b)).data.classes.map((c: any) => c.name).sort();
  assert.deepEqual(names, ['线性代数']);
  await s.close();
});
