import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classWith, inDays, setup } from './helpers.ts';

type S = Awaited<ReturnType<typeof setup>>;

// 各种格式最开头的几个字节，后面补零凑大小
const file = (head: number[] | string, size = 64) => {
  const b = new Uint8Array(size);
  b.set(typeof head === 'string' ? [...Buffer.from(head)] : head);
  return b;
};
const png = (size = 64) => file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], size);
const pdf = () => file('%PDF-1.7\n');
// docx：zip 文件头，里面有 word/ 文件夹
const docx = () => {
  const b = file([0x50, 0x4b, 0x03, 0x04], 200);
  b.set([...Buffer.from('word/document.xml')], 30);
  return b;
};
const zip = () => file([0x50, 0x4b, 0x03, 0x04], 200);

async function attach(s: S, token: string, homeworkId: number, body: Uint8Array<ArrayBuffer>, name = '题目.png') {
  const res = await s.app.request(`/v1/homework/${homeworkId}/attachments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name) },
    body,
  });
  return { status: res.status, data: (await res.json()) as any };
}

async function homework(s: S) {
  const { tokens, classId } = await classWith(s, 3);
  const r = await s.call('POST', `/classes/${classId}/homework`, tokens[0], {
    title: '第三章习题',
    dueKind: 'at',
    due: inDays(s, 3),
    submit: '学习通',
    source: '课堂口头',
  });
  return { tokens, classId, id: r.data.id as number };
}

test('传图片、PDF、Word：作业里能看到，按地址能下载，图片和 PDF 直接打开、Word 下载', async () => {
  const s = await setup();
  const { tokens, classId, id } = await homework(s);
  const a = await attach(s, tokens[0], id, png(), '黑板.png');
  const b = await attach(s, tokens[0], id, pdf(), '讲义');
  const c = await attach(s, tokens[0], id, docx(), '模板.docx');
  assert.equal(a.status, 201);
  assert.equal(b.data.name, '讲义.pdf');
  assert.equal(c.data.mime, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  const list = await s.call('GET', `/classes/${classId}/homework`);
  assert.deepEqual(list.data.homework[0].attachments.map((x: any) => x.name), ['黑板.png', '讲义.pdf', '模板.docx']);

  const img = await s.app.request(a.data.url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.match(img.headers.get('content-disposition')!, /^inline/);
  const word = await s.app.request(c.data.url);
  assert.match(word.headers.get('content-disposition')!, /^attachment; filename\*=UTF-8''%E6%A8%A1%E6%9D%BF\.docx$/);
  await s.close();
});

test('不认的格式、普通压缩包、超过 10MB 都不收', async () => {
  const s = await setup();
  const { tokens, id } = await homework(s);
  assert.equal((await attach(s, tokens[0], id, file('hello world'))).data.error, 'bad_file');
  assert.equal((await attach(s, tokens[0], id, zip(), 'a.docx')).data.error, 'bad_file');
  const big = await attach(s, tokens[0], id, png(10 * 1024 * 1024 + 1));
  assert.equal(big.status, 413);
  assert.equal((await attach(s, tokens[0], id, png(10 * 1024 * 1024))).status, 201);
  await s.close();
});

test('一条作业最多 6 个附件', async () => {
  const s = await setup();
  const { tokens, id } = await homework(s);
  for (let i = 0; i < 6; i++) assert.equal((await attach(s, tokens[0], id, png())).status, 201);
  const r = await attach(s, tokens[0], id, png());
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'too_many');
  await s.close();
});

test('只有上传的人能加、删；有人确认以后就不能再改', async () => {
  const s = await setup();
  const { tokens, id } = await homework(s);
  assert.equal((await attach(s, tokens[1], id, png())).status, 403);
  const a = await attach(s, tokens[0], id, png());
  const del = (t: string) => s.call('DELETE', `/attachments/${a.data.id}`, t);
  assert.equal((await del(tokens[1])).status, 403);

  // 两个同学确认，作业变成已确认
  await s.call('POST', `/homework/${id}/confirm`, tokens[1]);
  await s.call('POST', `/homework/${id}/confirm`, tokens[2]);
  assert.equal((await del(tokens[0])).status, 403);
  assert.equal((await attach(s, tokens[0], id, png())).status, 403);
  await s.close();
});

test('删掉附件、删掉作业以后，下载地址就失效了', async () => {
  const s = await setup();
  const { tokens, id } = await homework(s);
  const a = await attach(s, tokens[0], id, png());
  const b = await attach(s, tokens[0], id, pdf());
  assert.equal((await s.call('DELETE', `/attachments/${a.data.id}`, tokens[0])).status, 200);
  assert.equal((await s.app.request(a.data.url)).status, 404);
  assert.equal((await s.app.request(b.data.url)).status, 200);
  await s.call('DELETE', `/homework/${id}`, tokens[0]);
  assert.equal((await s.app.request(b.data.url)).status, 404);
  await s.close();
});
