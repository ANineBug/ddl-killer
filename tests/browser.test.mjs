import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';

const { INSTALL_BRIDGE_JS, grabScheduleScript, isSchedulePage, isSchoolPage, captureVpnPrefix, parseBrowserMessage, VPN_PREFIX } = await loadTs('src/lib/swufe/browser.ts');

function context() {
  const messages = [];
  const year = { value: '2026' };
  const semester = { value: '3' };
  const table = { textContent: '2026-2027学年第1学期', querySelector: () => ({}), outerHTML: '<div id="table1">schedule only</div>' };
  class XHR {
    listeners = {};
    status = 200;
    responseType = '';
    open() {}
    send() {}
    addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }
    reply(data) { this.responseText = JSON.stringify(data); for (const fn of this.listeners.load ?? []) fn(); for (const fn of this.listeners.loadend ?? []) fn(); }
  }
  const window = { ReactNativeWebView: { postMessage: (s) => messages.push(JSON.parse(s)) } };
  const ctx = vm.createContext({ window, XMLHttpRequest: XHR, URL,
    location: { href: VPN_PREFIX + '/kbcx/xskbcx_cxXskbcxIndex.html', pathname: new URL(VPN_PREFIX + '/kbcx/xskbcx_cxXskbcxIndex.html').pathname, origin: 'https://webvpn.swufe.edu.cn' },
    document: { getElementById: (id) => ({ xnm: year, xqm: semester, table1: table })[id] },
  });
  vm.runInContext(INSTALL_BRIDGE_JS, ctx);
  const query = () => { const xhr = new XHR(); xhr.open('POST', VPN_PREFIX + '/kbcx/xskbcx_cxXsgrkb.html'); xhr.send(); return xhr; };
  const read = () => { vm.runInContext(grabScheduleScript('request-A'), ctx); return messages.at(-1); };
  return { ctx, window, query, read, semester, table, XHR };
}

test('仅接受学校域名及真正课表路径，URL 子串不能冒充学校', () => {
  assert.equal(isSchoolPage('https://webvpn.swufe.edu.cn.attacker.test/'), false);
  assert.equal(isSchoolPage('https://webvpn.swufe.edu.cn@attacker.test/'), false);
  assert.equal(isSchoolPage('javascript:alert(1)'), false);
  assert.equal(isSchedulePage(VPN_PREFIX + '/kbcx/xskbcx_cxXskbcxIndex.html'), true);
  assert.equal(isSchedulePage('https://authserver.swufe.edu.cn/kbcx/xskbcx_cxXskbcxIndex.html'), false);
  assert.equal(captureVpnPrefix(VPN_PREFIX + '/xtgl/index_initMenu.html'), VPN_PREFIX);
});

test('只缓存课表白名单字段，不保存学生信息、cookie、密码、其他接口或请求体', () => {
  const c = context();
  const login = new c.XHR(); login.open('POST', 'https://webvpn.swufe.edu.cn/authserver/login'); login.send('password=secret'); login.reply({ kbList: [{ kcmc: '不应捕获' }] });
  assert.equal(c.window.__swufeSchedule, undefined);
  c.query().reply({ xsxx: { XH: 'private-id', XM: 'private-name' }, cookie: 'secret', kbList: [{ jxb_id: 'A', kcmc: '课程', password: 'secret', token: 'secret' }] });
  const captured = JSON.parse(JSON.stringify(c.window.__swufeSchedule));
  assert.deepEqual(captured.data, { kbList: [{ jxb_id: 'A', kcmc: '课程' }] });
  assert.equal(c.read().source, 'api');
});

test('查询尚未完成时不能读取旧表，完成后才可读取', () => {
  const c = context(); const xhr = c.query();
  assert.equal(c.read().type, 'error');
  xhr.reply({ kbList: [{ kcmc: '课程' }] });
  assert.equal(c.read().source, 'api');
});

test('乱序响应不会覆盖新查询结果；旧请求结束不会误清新请求的等待状态', () => {
  const c = context(); const old = c.query(); const latest = c.query();
  old.reply({ kbList: [{ kcmc: '旧查询' }] });
  assert.equal(c.read().type, 'error');
  latest.reply({ kbList: [{ kcmc: '新查询' }] });
  assert.equal(c.read().data.kbList[0].kcmc, '新查询');
});

test('切换学期后必须先查询，不能读取上学期表格或缓存', () => {
  const c = context(); c.query().reply({ kbList: [{ kcmc: '旧学期' }] });
  c.semester.value = '12';
  assert.equal(c.read().type, 'error');
  c.table.textContent = '2026-2027学年第2学期';
  assert.equal(c.read().source, 'html');
});

test('没捕获接口时只读取 table1，不读取整个文档或登录表单', () => {
  const c = context();
  const message = c.read();
  assert.equal(message.source, 'html');
  assert.equal(message.html, c.table.outerHTML);
  assert.equal(message.requestId, 'request-A');
});

test('重复注入不会给接口安装多层监听', () => {
  const c = context();
  const send = c.XHR.prototype.send;
  vm.runInContext(INSTALL_BRIDGE_JS, c.ctx);
  assert.equal(c.XHR.prototype.send, send);
});

test('安卓 WebMessageListener 只回报 sourceOrigin 时，接受真实课表探针和读取结果', () => {
  const c = context();
  const href = VPN_PREFIX + '/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151&layout=default';
  const probe = { type: 'probe', href, hasTable: true };
  const accepted = parseBrowserMessage(JSON.stringify(probe), 'https://webvpn.swufe.edu.cn');
  assert.deepEqual(accepted, probe);
  assert.equal(isSchedulePage(accepted.href) && accepted.hasTable, true);
  c.query().reply({ kbList: [{ jxb_id: 'class-A', kcmc: '课程' }] });
  const response = c.read();
  assert.equal(parseBrowserMessage(JSON.stringify(response), 'https://webvpn.swufe.edu.cn/').source, 'api');
  assert.equal(parseBrowserMessage(JSON.stringify(response), 'https://webvpn.swufe.edu.cn/').requestId, 'request-A');
});

test('兼容旧版完整 URL 消息源及校内 HTTP，不把 origin 当作课表路径', () => {
  const href = 'http://jwxt.swufe.edu.cn/kbcx/xskbcx_cxXskbcxIndex.html?gnmkdm=N2151';
  const raw = JSON.stringify({ type: 'probe', href, hasTable: true });
  for (const source of [href, 'http://jwxt.swufe.edu.cn', 'http://jwxt.swufe.edu.cn/']) {
    assert.equal(parseBrowserMessage(raw, source).href, href);
  }
});

test('同源判断仍拦截外站、跨学校子域、不同端口/协议、伪造凭据和无效消息', () => {
  const href = VPN_PREFIX + '/kbcx/xskbcx_cxXskbcxIndex.html';
  const raw = JSON.stringify({ type: 'probe', href, hasTable: true });
  for (const source of ['https://webvpn.swufe.edu.cn.attacker.test', 'https://attacker.test',
    'https://authserver.swufe.edu.cn', 'http://webvpn.swufe.edu.cn', 'https://webvpn.swufe.edu.cn:8443',
    'https://user:password@webvpn.swufe.edu.cn']) assert.equal(parseBrowserMessage(raw, source), null);
  for (const value of ['null', '[]', '{}', 'not-json', JSON.stringify({ href: 'https://attacker.test/' }),
    JSON.stringify({ href: 'https://user:password@webvpn.swufe.edu.cn/' })]) {
    assert.equal(parseBrowserMessage(value, 'https://webvpn.swufe.edu.cn'), null);
  }
});

test('主动读取未就绪页面返回提示，安卓源形式的错误消息也能送达', () => {
  const c = context();
  c.table.querySelector = () => null;
  const message = parseBrowserMessage(JSON.stringify(c.read()), 'https://webvpn.swufe.edu.cn');
  assert.equal(message.type, 'error');
  assert.match(message.message, /请先查询课表/);
  assert.equal(message.requestId, 'request-A');
});
