import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.mjs';

const { isNewer, dayKey, canPromptToday, releaseNotes } = await loadTs('src/data/version.ts');

test('版本比较：按数字比，不按字符串比', () => {
  assert.equal(isNewer('1.0.4', '1.0.3'), true);
  assert.equal(isNewer('1.0.10', '1.0.9'), true);
  assert.equal(isNewer('1.1', '1.0.9'), true);
  assert.equal(isNewer('1.0.3', '1.0.3'), false);
  assert.equal(isNewer('1.0.2', '1.0.3'), false);
  assert.equal(isNewer('1.0', '1.0.0'), false);
});

test('一天最多自动提醒一次：按本地日期算', () => {
  const morning = new Date(2026, 10, 19, 8, 0);
  const night = new Date(2026, 10, 19, 23, 30);
  const tomorrow = new Date(2026, 10, 20, 0, 5);
  assert.equal(dayKey(morning), '2026-11-19');
  assert.equal(canPromptToday(null, morning), true);
  assert.equal(canPromptToday(dayKey(morning), night), false);
  assert.equal(canPromptToday(dayKey(night), tomorrow), true);
});

test('更新说明去掉第一行的安装包说明和空行', () => {
  assert.equal(releaseNotes('安卓 APK，仅支持 arm64。可以直接覆盖安装。\n\n- 新增总聊天室\n- 修了一个 bug\n'), '- 新增总聊天室\n- 修了一个 bug');
});
