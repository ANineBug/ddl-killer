import { Platform } from 'react-native';

export type Theme = {
  dark: boolean;
  // 背景：一个颜色是纯色，多个颜色是从左上到右下的渐变
  bg: string[];
  card: string;
  cardEdge: string;
  // 卡片是否用毛玻璃
  glass: boolean;
  text: string;
  sub: string;
  faint: string;
  line: string;
  accent: string;
  accentSoft: string;
  urgent: string;
  // 底部标签栏和输入框的底色
  surface: string;
  // 课表色块的几种低饱和色
  courseHues: string[];
};

// 固定使用傍晚的暮色主题：紫灰渐变背景、毛玻璃卡片
export const theme: Theme = {
  dark: true,
  bg: ['#2c2e40', '#3b3448', '#4a3d4a'],
  card: 'rgba(255,255,255,0.07)',
  cardEdge: 'rgba(255,255,255,0.08)',
  glass: true,
  text: '#eeeaf2',
  sub: '#a49eae',
  faint: '#6f6879',
  line: 'rgba(255,255,255,0.08)',
  accent: '#a3b0c4',
  accentSoft: 'rgba(163,176,196,0.16)',
  urgent: '#f0a088',
  surface: 'rgba(44,40,58,0.82)',
  courseHues: ['#8fa3b8', '#9bb0a0', '#c4a389', '#a99bb8', '#c2b58f'],
};

// 背景色调随时间极慢地漂移：清晨偏冷偏亮，傍晚偏暖，深夜更沉。
// 都在暮色范围内，文字对比度不受影响；每分钟只变一点，用的时候察觉不到。
const tintKeyframes: { hour: number; bg: [string, string, string] }[] = [
  { hour: 2, bg: ['#212436', '#2b293b', '#353040'] },
  { hour: 7, bg: ['#2b3244', '#36394c', '#41404f'] },
  { hour: 12, bg: ['#2d3043', '#393649', '#463e4c'] },
  { hour: 17.5, bg: ['#2c2e40', '#3d3448', '#4f3e4b'] },
  { hour: 22, bg: ['#25283b', '#302d41', '#3c3445'] },
];

function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

export function backdropAt(date: Date): string[] {
  const h = date.getHours() + date.getMinutes() / 60;
  const n = tintKeyframes.length;
  for (let i = 0; i < n; i++) {
    const from = tintKeyframes[i];
    const to = tintKeyframes[(i + 1) % n];
    const end = to.hour > from.hour ? to.hour : to.hour + 24;
    const hh = h < from.hour ? h + 24 : h;
    if (hh >= from.hour && hh < end) {
      const t = (hh - from.hour) / (end - from.hour);
      return from.bg.map((c, k) => mixHex(c, to.bg[k], t));
    }
  }
  return theme.bg;
}

export type Phase = 'day' | 'dusk' | 'night';

// 首页标题随时间换一句话：16:30 前是白天，16:30–19:00 是傍晚，之后到早上 6:00 是夜晚
export function phaseAt(date: Date): Phase {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 6 && h < 16.5) return 'day';
  if (h >= 16.5 && h < 19) return 'dusk';
  return 'night';
}

export const greeting: Record<Phase, string> = {
  day: '今天',
  dusk: '傍晚好',
  night: '夜深了',
};

export function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// 标题用宋体，正文用系统黑体
export const fonts = {
  serif: Platform.select({
    web: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", STSong, serif',
    default: 'serif',
  }),
};
