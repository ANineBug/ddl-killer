import { Platform } from 'react-native';

export type Phase = 'day' | 'dusk' | 'night';

export type Theme = {
  phase: Phase;
  dark: boolean;
  // 背景：一个颜色是纯色，多个颜色是从左上到右下的渐变
  bg: string[];
  // 揭晓动画边缘的过渡色，取背景的中间色
  bgMid: string;
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

const courseHues = ['#8fa3b8', '#9bb0a0', '#c4a389', '#a99bb8', '#c2b58f'];

export const themes: Record<Phase, Theme> = {
  day: {
    phase: 'day',
    dark: false,
    bg: ['#f7f6f3'],
    bgMid: '#f7f6f3',
    card: '#ffffff',
    cardEdge: 'transparent',
    glass: false,
    text: '#1c1c1e',
    sub: '#8a8a8e',
    faint: '#c9c8c4',
    line: '#ecebe7',
    accent: '#7f95ab',
    accentSoft: 'rgba(127,149,171,0.14)',
    urgent: '#b5523b',
    surface: 'rgba(255,255,255,0.86)',
    courseHues,
  },
  dusk: {
    phase: 'dusk',
    dark: true,
    bg: ['#2c2e40', '#3b3448', '#4a3d4a'],
    bgMid: '#3b3448',
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
    courseHues,
  },
  night: {
    phase: 'night',
    dark: true,
    bg: ['#141a23'],
    bgMid: '#141a23',
    card: '#1c2430',
    cardEdge: 'transparent',
    glass: false,
    text: '#e4e9f0',
    sub: '#7f8b9b',
    faint: '#4a5566',
    line: '#283242',
    accent: '#8aa3bd',
    accentSoft: 'rgba(138,163,189,0.14)',
    urgent: '#e48a70',
    surface: 'rgba(24,31,42,0.88)',
    courseHues,
  },
};

// 16:30 前是白天，16:30–19:00 是傍晚，之后到早上 6:00 是夜晚
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

export const phaseName: Record<Phase, string> = {
  day: '白天',
  dusk: '傍晚',
  night: '夜晚',
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
