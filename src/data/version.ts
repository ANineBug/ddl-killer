// 版本比较和「一天最多提醒一次」：纯计算，方便单独测试

// "1.0.10" 比 "1.0.9" 新；位数不够的当 0
export function isNewer(latest: string, current: string) {
  const a = latest.split('.').map((x) => Number.parseInt(x, 10) || 0);
  const b = current.split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

// 本地日期，比如 "2026-11-19"，用来记「今天提醒过了」
export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 自动检查：今天还没提醒过才提醒
export const canPromptToday = (lastPromptDay: string | null, now: Date) => lastPromptDay !== dayKey(now);

// Release 说明的第一行是「安卓 APK，仅支持 arm64……」，提示框里不用再显示
export function releaseNotes(body: string) {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('安卓 APK'))
    .join('\n');
}
