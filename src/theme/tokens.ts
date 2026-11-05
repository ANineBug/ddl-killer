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
