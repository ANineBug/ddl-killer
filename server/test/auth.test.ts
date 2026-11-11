import assert from 'node:assert/strict';
import { test } from 'node:test';

import { setup } from './helpers.ts';

test('邮箱验证码登录：第一次自动注册，第二次是同一个账号', async () => {
  const s = await setup();
  const t1 = await s.login('a.b+test@gmail.com');
  s.tick(61_000);
  const t2 = await s.login('ab@gmail.com');
  const me1 = await s.call('GET', '/me', t1);
  const me2 = await s.call('GET', '/me', t2);
  assert.equal(me1.status, 200);
  assert.equal(me1.data.id, me2.data.id);
  // 返回里不带邮箱
  assert.equal(me1.data.email, undefined);
  await s.close();
});

test('不在白名单的邮箱直接拒绝', async () => {
  const s = await setup();
  const r = await s.call('POST', '/auth/code', undefined, { email: 'x@outlook.com' });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'bad_email');
  await s.close();
});

test('60 秒内不能重发；验证码 10 分钟过期；输错 5 次作废', async () => {
  const s = await setup();
  assert.equal((await s.call('POST', '/auth/code', undefined, { email: '1@qq.com' })).status, 200);
  const again = await s.call('POST', '/auth/code', undefined, { email: '1@qq.com' });
  assert.equal(again.status, 429);
  assert.equal(again.data.error, 'resend_wait');

  const code = /验证码是 (\d{6})/.exec(s.mails.at(-1)!.text)![1];
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) {
    assert.equal((await s.call('POST', '/auth/verify', undefined, { email: '1@qq.com', code: wrong })).status, 400);
  }
  // 输错 5 次以后，正确的码也不行了
  assert.equal((await s.call('POST', '/auth/verify', undefined, { email: '1@qq.com', code })).status, 400);

  s.tick(61_000);
  await s.call('POST', '/auth/code', undefined, { email: '1@qq.com' });
  const code2 = /验证码是 (\d{6})/.exec(s.mails.at(-1)!.text)![1];
  s.tick(11 * 60_000);
  assert.equal((await s.call('POST', '/auth/verify', undefined, { email: '1@qq.com', code: code2 })).status, 400);
  await s.close();
});

test('同一个 IP 一小时最多发 10 次码', async () => {
  const s = await setup();
  for (let i = 0; i < 10; i++) {
    assert.equal((await s.call('POST', '/auth/code', undefined, { email: `${i}@163.com` })).status, 200);
  }
  const r = await s.call('POST', '/auth/code', undefined, { email: 'x@163.com' });
  assert.equal(r.status, 429);
  s.tick(3601_000);
  assert.equal((await s.call('POST', '/auth/code', undefined, { email: 'x@163.com' })).status, 200);
  await s.close();
});

test('退出登录后凭证失效', async () => {
  const s = await setup();
  const t = await s.login('9@qq.com');
  await s.call('POST', '/auth/logout', t);
  assert.equal((await s.call('GET', '/me', t)).status, 401);
  await s.close();
});
