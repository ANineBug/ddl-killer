const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const networkSecurityXml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain>jwxt.swufe.edu.cn</domain>
  </domain-config>
</network-security-config>
`;

// 由 prebuild 生成原生配置，只为学校的 HTTP 教务站点放行明文。
module.exports = function withSwufeCleartext(config) {
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android application 节点不存在');
    application.$['android:networkSecurityConfig'] = '@xml/swufe_network_security_config';
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'swufe_network_security_config.xml'), networkSecurityXml);
    // 开发包仍需通过局域网 HTTP 连接 Metro；资源覆盖只对 debug 构建生效。
    const debugDir = path.join(mod.modRequest.platformProjectRoot, 'app/src/debug/res/xml');
    await fs.mkdir(debugDir, { recursive: true });
    await fs.writeFile(path.join(debugDir, 'swufe_network_security_config.xml'),
      '<?xml version="1.0" encoding="utf-8"?><network-security-config><base-config cleartextTrafficPermitted="true" /></network-security-config>\n');
    return mod;
  }]);
};
