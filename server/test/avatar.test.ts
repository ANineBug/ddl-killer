import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classWith, setup } from './helpers.ts';

// 最小的合法 PNG 文件头，后面随便补点内容凑大小
const png = (size = 64) => {
  const b = new Uint8Array(size);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b;
};

async function put(s: Awaited<ReturnType<typeof setup>>, token: string, body: Uint8Array<ArrayBuffer>, type = 'image/png') {
  const res = await s.app.request('/v1/me/avatar', {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': type },
    body,
  });
  return { status: res.status, data: (await res.json()) as any };
}

test('上传头像：返回带版本号的地址，能取回原图；换一次版本号加一', async () => {
  const s = await setup();
  const t = await s.login('a@qq.com');
  assert.equal((await s.call('GET', '/me', t)).data.avatar, null);

  const r1 = await put(s, t, png());
  assert.equal(r1.status, 200);
  assert.match(r1.data.avatar, /^\/v1\/avatars\/\d+\?v=1$/);
  const img = await s.app.request(r1.data.avatar);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal((await img.arrayBuffer()).byteLength, 64);

  const r2 = await put(s, t, png(100));
  assert.match(r2.data.avatar, /\?v=2$/);
  assert.equal((await s.call('GET', '/me', t)).data.avatar, r2.data.avatar);

  await s.app.request('/v1/me/avatar', { method: 'DELETE', headers: { authorization: `Bearer ${t}` } });
  assert.equal((await s.call('GET', '/me', t)).data.avatar, null);
  await s.close();
});

test('头像超过 2MB、不是图片、没登录，都拒绝', async () => {
  const s = await setup();
  const t = await s.login('a@qq.com');
  assert.equal((await put(s, t, png(2 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await put(s, t, png(2 * 1024 * 1024))).status, 200);
  const fake = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
  const r = await put(s, t, fake, 'image/png');
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'bad_image');
  const anon = await s.app.request('/v1/me/avatar', { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png() });
  assert.equal(anon.status, 401);
  await s.close();
});

test('作业、聊天、排行榜里的人都带头像地址', async () => {
  const s = await setup();
  const { tokens: [a], classId } = await classWith(s, 2);
  const url = (await put(s, a, png())).data.avatar;
  const hw = await s.call('POST', `/classes/${classId}/homework`, a, { title: 'x', dueKind: 'tbd', submit: '纸质', source: '群通知' });
  assert.equal(hw.data.uploader.avatar, url);
  const msg = await s.call('POST', `/classes/${classId}/messages`, a, { text: '你好' });
  assert.equal(msg.data.user.avatar, url);
  const board = await s.call('GET', `/classes/${classId}/board`);
  assert.ok(board.data.board.some((r: any) => r.user.avatar === url));
  await s.close();
});
