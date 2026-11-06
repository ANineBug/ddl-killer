import Svg, { Circle, Path } from 'react-native-svg';

import { ReactionKey } from '@/data/types';

// 自己画的三个回应图标，线条风格，颜色跟着主题走。选中时实心一点
export function ReactionIcon({ kind, color, fill, active, size = 18 }: {
  kind: ReactionKey;
  color: string;
  // 选中时的浅底色
  fill: string;
  active: boolean;
  size?: number;
}) {
  const stroke = { stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (kind === 'confirm') {
    // 圆圈里一个勾；选中时圆圈填满，勾变成反白
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={9.5} {...stroke} fill={active ? color : 'none'} />
        <Path d="M8 12.3l2.7 2.7L16 9.6" {...stroke} stroke={active ? fill : color} strokeWidth={2} />
      </Svg>
    );
  }

  if (kind === 'thumbs') {
    // 竖起的大拇指：左边是袖口，右边是手
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M3.5 10.5h3v10h-3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" {...stroke} fill={active ? color : 'none'} />
        <Path
          d="M6.5 10.5l3.6-6.6a1.9 1.9 0 0 1 3.5 1.3L12.8 9h5.6a2 2 0 0 1 1.95 2.45l-1.6 7.1a2.5 2.5 0 0 1-2.45 1.95H6.5"
          {...stroke}
          fill={active ? fill : 'none'}
        />
      </Svg>
    );
  }

  // 哭脸：眯起来的眼睛、往下撇的嘴，两边各挂一滴眼泪
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.5} {...stroke} fill={active ? fill : 'none'} />
      <Path d="M6.9 10.2q1.5-1.7 3 0M14.1 10.2q1.5-1.7 3 0" {...stroke} />
      <Path d="M10.2 17.1q1.8-1.7 3.6 0" {...stroke} />
      <Path d="M8.4 12.2c-.75 1.3-1.15 2.3-1.15 2.95a1.15 1.15 0 0 0 2.3 0c0-.65-.4-1.65-1.15-2.95z" fill={color} />
      <Path d="M15.6 12.2c-.75 1.3-1.15 2.3-1.15 2.95a1.15 1.15 0 0 0 2.3 0c0-.65-.4-1.65-1.15-2.95z" fill={color} />
    </Svg>
  );
}
