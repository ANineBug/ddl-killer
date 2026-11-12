import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PASSWORD, setup } from './helpers.ts';

test('注册要验证码和密码；以后用密码登录，Gmail 的点和 + 后缀算同一个邮箱', async () => {
  const s = await setup();
  const t1 = await s.login('a.b+test@gmail.com');
  const r = await s.call('POST', '/auth/login', undefined, { email: 'ab@gmail.com', password: PASSWORD });
  assert.equal(r.status, 200);
  const me1 = await s.call('GET', '/me', t1);
  const me2 = await s.call('GET', '/me', r.data.token);
  assert.equal(me1.data.id, me2.data.id);
  // 返回里不带邮箱
  assert.equal(me1.data.email, undefined);
  // 登录不发邮件
  assert.equal(s.mails.length, 1);
  await s.close();
});

test('密码太弱不让注册，验证码不会被用掉', async () => {
  const s = await setup();
  const code = await s.sendCode('2@qq.com');
  for (const pw of ['abc123', '12345678', 'abcdefgh']) {
    const r = await s.call('POST', '/auth/register', undefined, { email: '2@qq.com', code, password: pw });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'bad_password');
  }
  assert.equal((await s.call('POST', '/auth/register', undefined, { email: '2@qq.com', code, password: PASSWORD })).status, 200);
  await s.close();
});

test('已经注册过的邮箱不能再注册；没注册过的不能找回密码', async () => {
  const s = await setup();
  await s.login('3@qq.com');
  s.tick(61_000);
  const again = await s.call('POST', '/auth/code', undefined, { email: '3@qq.com', purpose: 'register' });
  assert.equal(again.status, 409);
  assert.equal(again.data.error, 'already_registered');
  const reset = await s.call('POST', '/auth/code', undefined, { email: 'nobody@qq.com', purpose: 'reset' });
  assert.equal(reset.status, 404);
  await s.close();
});

test('密码错了不给登录；错太多次先锁 15 分钟', async () => {
  const s = await setup();
  await s.login('4@qq.com');
  const wrong = await s.call('POST', '/auth/login', undefined, { email: '4@qq.com', password: 'wrong1234' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.data.error, 'bad_login');
  // 不存在的邮箱也是同一句话，猜不出谁注册过
  const nobody = await s.call('POST', '/auth/login', undefined, { email: 'nobody@qq.com', password: 'wrong1234' });
  assert.equal(nobody.data.message, wrong.data.message);

  for (let i = 0; i < 9; i++) await s.call('POST', '/auth/login', undefined, { email: '4@qq.com', password: 'wrong1234' });
  const locked = await s.call('POST', '/auth/login', undefined, { email: '4@qq.com', password: PASSWORD });
  assert.equal(locked.status, 429);
  s.tick(15 * 60_000 + 1000);
  assert.equal((await s.call('POST', '/auth/login', undefined, { email: '4@qq.com', password: PASSWORD })).status, 200);
  await s.close();
});

test('找回密码：验证码 + 新密码，旧密码失效，别的设备被登出', async () => {
  const s = await setup();
  const old = await s.login('5@qq.com');
  s.tick(61_000);
  const code = await s.sendCode('5@qq.com', 'reset');
  assert.match(s.mails.at(-1)!.text, /重置/);
  const r = await s.call('POST', '/auth/reset', undefined, { email: '5@qq.com', code, password: 'newpass99' });
  assert.equal(r.status, 200);
  assert.equal((await s.call('GET', '/me', old)).status, 401);
  assert.equal((await s.call('GET', '/me', r.data.token)).status, 200);
  assert.equal((await s.call('POST', '/auth/login', undefined, { email: '5@qq.com', password: PASSWORD })).status, 400);
  assert.equal((await s.call('POST', '/auth/login', undefined, { email: '5@qq.com', password: 'newpass99' })).status, 200);
  await s.close();
});

test('注册用的验证码不能拿去重置密码', async () => {
  const s = await setup();
  await s.login('6@qq.com');
  s.tick(61_000);
  // 别人拿到了一个「注册」码（比如对一个已注册的邮箱发不出来，这里直接造一个没注册的）
  const code = await s.sendCode('7@qq.com', 'register');
  const r = await s.call('POST', '/auth/reset', undefined, { email: '7@qq.com', code, password: 'newpass99' });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'bad_code');
  await s.close();
});

test('以前用验证码登录、没有密码的老账号：密码登录会提示去设密码，注册或找回都能补上', async () => {
  const s = await setup();
  const t = await s.login('8@qq.com');
  const id = (await s.call('GET', '/me', t)).data.id;
  await s.db.query('update users set password_hash = null where id = $1', [id]);

  const r = await s.call('POST', '/auth/login', undefined, { email: '8@qq.com', password: PASSWORD });
  assert.equal(r.data.error, 'no_password');

  s.tick(61_000);
  const code = await s.sendCode('8@qq.com', 'register');
  const reg = await s.call('POST', '/auth/register', undefined, { email: '8@qq.com', code, password: 'another12' });
  assert.equal(reg.status, 200);
  assert.equal(reg.data.created, false);
  assert.equal((await s.call('GET', '/me', reg.data.token)).data.id, id);
  await s.close();
});

test('不在白名单的邮箱直接拒绝', async () => {
  const s = await setup();
  const r = await s.call('POST', '/auth/code', undefined, { email: 'x@outlook.com', purpose: 'register' });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'bad_email');
  await s.close();
});

test('60 秒内不能重发；验证码 10 分钟过期；输错 5 次作废', async () => {
  const s = await setup();
  const code = await s.sendCode('1@qq.com');
  const again = await s.call('POST', '/auth/code', undefined, { email: '1@qq.com', purpose: 'register' });
  assert.equal(again.status, 429);
  assert.equal(again.data.error, 'resend_wait');

  const wrong = code === '000000' ? '111111' : '000000';
  const reg = (c: string) => s.call('POST', '/auth/register', undefined, { email: '1@qq.com', code: c, password: PASSWORD });
  for (let i = 0; i < 5; i++) assert.equal((await reg(wrong)).status, 400);
  // 输错 5 次以后，正确的码也不行了
  assert.equal((await reg(code)).status, 400);

  s.tick(61_000);
  const code2 = await s.sendCode('1@qq.com');
  s.tick(11 * 60_000);
  assert.equal((await reg(code2)).status, 400);
  await s.close();
});

test('同一个 IP 一小时最多发 10 次码', async () => {
  const s = await setup();
  for (let i = 0; i < 10; i++) {
    assert.equal((await s.call('POST', '/auth/code', undefined, { email: `${i}@163.com`, purpose: 'register' })).status, 200);
  }
  const r = await s.call('POST', '/auth/code', undefined, { email: 'x@163.com', purpose: 'register' });
  assert.equal(r.status, 429);
  s.tick(3601_000);
  assert.equal((await s.call('POST', '/auth/code', undefined, { email: 'x@163.com', purpose: 'register' })).status, 200);
  await s.close();
});

test('退出登录后凭证失效', async () => {
  const s = await setup();
  const t = await s.login('9@qq.com');
  await s.call('POST', '/auth/logout', t);
  assert.equal((await s.call('GET', '/me', t)).status, 401);
  await s.close();
});
