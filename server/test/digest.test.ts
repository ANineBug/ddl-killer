import assert from 'node:assert/strict';
import { test } from 'node:test';

import { maybeSendDigests } from '../src/digest.ts';
import { classWith, setup } from './helpers.ts';

test('邮件提醒：打开了的人，早上 7 点收到两天内要交的作业，一天只发一次', async () => {
  const s = await setup();
  const { tokens: [a, b], classId } = await classWith(s, 3);
  const due = (h: number) => new Date(s.ctx.now().getTime() + h * 3600_000).toISOString();
  await s.call('POST', `/classes/${classId}/homework`, a, { title: '明天交的', dueKind: 'at', due: due(40), submit: '纸质', source: '群通知' });
  await s.call('POST', `/classes/${classId}/homework`, a, { title: '下周交的', dueKind: 'at', due: due(24 * 6), submit: '纸质', source: '群通知' });
  assert.equal((await s.call('PATCH', '/me', b, { emailDigest: true })).data.emailDigest, true);
  assert.equal((await s.call('GET', '/me', b)).data.emailDigest, true);

  // setup 的时间是北京时间 10 点，不到点不发
  const before = s.mails.length;
  assert.equal(await maybeSendDigests(s.ctx), 0);
  // 拨到第二天早上 7 点
  s.tick(21 * 3600_000);
  assert.equal(await maybeSendDigests(s.ctx), 1);
  const mail = s.mails.at(-1)!;
  assert.equal(s.mails.length, before + 1);
  assert.ok(mail.text.includes('明天交的'));
  assert.ok(!mail.text.includes('下周交的'));
  // 同一天再调一次不会重复发
  s.tick(10 * 60_000);
  assert.equal(await maybeSendDigests(s.ctx), 0);
  await s.close();
});
