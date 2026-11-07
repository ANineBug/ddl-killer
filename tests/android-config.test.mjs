import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { XML } = require('expo/config-plugins');
const withSwufeCleartext = require('../plugins/withSwufeCleartext.js');

test('原生插件生成有效 XML：正式包精确放行教务域名，开发包可连接 Metro，manifest 引用正确', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'homework-network-'));
  t.after(async () => {
    // 仅清理本测试刚创建的临时目录，确认目标没有逃出临时根目录。
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('homework-network-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const config = withSwufeCleartext({ name: 'network-test', slug: 'network-test' });
  const modRequest = { platformProjectRoot: root };
  await config.mods.android.dangerous({ ...config, modRequest, modResults: {} });
  const manifest = await config.mods.android.manifest({ ...config, modRequest,
    modResults: { manifest: { application: [{ $: {} }] } } });
  const reference = manifest.modResults.manifest.application[0].$['android:networkSecurityConfig'];
  assert.equal(reference, '@xml/swufe_network_security_config');
  const read = (variant) => XML.readXMLAsync({ path: path.join(root, 'app/src', variant, 'res/xml/swufe_network_security_config.xml') });
  const release = (await read('main'))['network-security-config'];
  assert.equal(release['base-config'][0].$.cleartextTrafficPermitted, 'false');
  assert.equal(release['domain-config'].length, 1);
  assert.equal(release['domain-config'][0].$.cleartextTrafficPermitted, 'true');
  const domains = release['domain-config'][0].domain;
  assert.equal(domains.length, 1);
  assert.equal(domains[0]._, 'jwxt.swufe.edu.cn');
  // Android release lint 要求显式声明，不能依赖平台默认值。
  assert.equal(domains[0].$.includeSubdomains, 'false');
  const debug = (await read('debug'))['network-security-config'];
  assert.equal(debug['base-config'][0].$.cleartextTrafficPermitted, 'true');
});
