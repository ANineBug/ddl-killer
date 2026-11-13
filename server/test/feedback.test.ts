import assert from 'node:assert/strict';
import { test } from 'node:test';

import { setup } from './helpers.ts';

test('反馈：登录才能发，存库并发邮件给开发者；邮件里不带反馈人的邮箱', async () => {
  const s = await setup();
  assert.equal((await s.call('POST', '/feedback', undefined, { kind: 'bug', text: '课表打不开' })).status, 401);
  const t = await s.login('fb@qq.com');
  const r = await s.call('POST', '/feedback', t, { kind: 'bug', text: '  课表打不开  ', contact: 'QQ 12345', appVersion: '1.0.2', platform: 'android' });
  assert.equal(r.status, 201);
  const mail = s.mails.at(-1)!;
  assert.equal(mail.to, 'dev@example.com');
  assert.match(mail.subject, /问题/);
  assert.match(mail.text, /课表打不开/);
  assert.match(mail.text, /QQ 12345/);
  assert.match(mail.text, /1\.0\.2/);
  assert.doesNotMatch(mail.text, /fb@qq\.com/);
  const row = await s.db.one<{ text: string }>('select text from feedback where id = $1', [r.data.id]);
  assert.equal(row!.text, '课表打不开');
  await s.close();
});

test('反馈：空的、太长的、类型不对的不收；一天最多 5 条', async () => {
  const s = await setup();
  const t = await s.login('fb2@qq.com');
  assert.equal((await s.call('POST', '/feedback', t, { kind: 'bug', text: '   ' })).status, 400);
  assert.equal((await s.call('POST', '/feedback', t, { kind: 'bug', text: '字'.repeat(1001) })).status, 400);
  assert.equal((await s.call('POST', '/feedback', t, { kind: 'praise', text: '好用' })).status, 400);
  for (let i = 0; i < 5; i++) assert.equal((await s.call('POST', '/feedback', t, { kind: 'idea', text: `建议 ${i}` })).status, 201);
  const sixth = await s.call('POST', '/feedback', t, { kind: 'idea', text: '再来一条' });
  assert.equal(sixth.status, 429);
  s.tick(86_400_000 + 1000);
  assert.equal((await s.call('POST', '/feedback', t, { kind: 'idea', text: '第二天' })).status, 201);
  await s.close();
});
