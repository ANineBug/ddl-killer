import { Session, WeekRule } from './types';

export const weekdayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dayDiff(d: Date, from = new Date()) {
  return Math.round((startOfDay(d).getTime() - startOfDay(from).getTime()) / 86400000);
}

// 1 = 周一 … 7 = 周日
export const isoWeekday = (d: Date) => ((d.getDay() + 6) % 7) + 1;

export function formatDue(d: Date) {
  const diff = dayDiff(d);
  if (diff === 0) return `${d.getHours() >= 18 ? '今晚' : '今天'} ${hhmm(d)}`;
  if (diff === 1) return `明天 ${hhmm(d)}`;
  if (diff === -1) return `昨天 ${hhmm(d)}`;
  if (diff > 1 && diff < 7) return `${weekdayNames[isoWeekday(d)]} ${hhmm(d)}`;
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${hhmm(d)}`;
}

export function formatRemaining(d: Date) {
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return '已截止';
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `还剩 ${Math.max(1, Math.floor(ms / 60000))} 分钟`;
  if (h < 48) return `还剩 ${h} 小时`;
  return `还剩 ${Math.floor(h / 24)} 天`;
}

export const isUrgent = (d: Date) => {
  const ms = d.getTime() - Date.now();
  return ms > 0 && ms < 24 * 3600000;
};

export function formatAgo(d: Date) {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export const formatSession = (s: Session) => `${weekdayNames[s.weekday]} ${s.from}-${s.to} 节`;

const ruleName: Record<WeekRule, string> = { all: '', odd: '（单周）', even: '（双周）' };
export const formatWeeks = (w: { from: number; to: number; rule: WeekRule }) =>
  `第 ${w.from}-${w.to} 周${ruleName[w.rule]}`;

// 演示用：假设本学期已经上到第 10 周
const DEMO_CURRENT_WEEK = 10;
export function currentWeek() {
  return DEMO_CURRENT_WEEK;
}

export function formatToday(d = new Date()) {
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${weekdayNames[isoWeekday(d)]}`;
}
