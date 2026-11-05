import { theme } from './tokens';

// 主题固定为暮色；保留这个入口，各页面统一从这里取颜色
export function useTheme() {
  return { theme };
}
