import assert from 'node:assert/strict';
import { test } from 'node:test';

import { githubLatest } from '../src/release.ts';
import { setup } from './helpers.ts';

test('最新版本接口：不用登录；返回版本号、说明和下载地址', async () => {
  const s = await setup();
  const r = await s.call('GET', '/app/latest');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { version: '9.9.9', notes: '测试版本', url: 'https://example.com/ddl-killer.apk' });
  await s.close();
});

test('从 GitHub 读最新 Release：去掉 v、找 ddl-killer.apk、缓存起来；GitHub 出错时返回空', async () => {
  let calls = 0;
  const fake = (async () => {
    calls++;

    return Response.json({
      tag_name: 'v1.2.3',
      body: '更新说明',
      assets: [
        { name: 'ddl-killer-abc-1.apk', browser_download_url: 'https://x/other.apk' },
        { name: 'ddl-killer.apk', browser_download_url: 'https://x/ddl-killer.apk' },
      ],
    });
  }) as typeof fetch;
  const latest = githubLatest(fake);
  assert.deepEqual(await latest(), { version: '1.2.3', notes: '更新说明', url: 'https://x/ddl-killer.apk' });
  await latest();
  assert.equal(calls, 1);

  const broken = githubLatest((async () => new Response('no', { status: 500 })) as typeof fetch);
  const orig = console.error;
  console.error = () => {};
  assert.equal(await broken(), null);
  console.error = orig;
});
