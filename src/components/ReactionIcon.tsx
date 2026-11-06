import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { ReactionKey } from '@/data/types';
import { useTheme } from '@/theme/useTheme';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);

// 勾的总长度（两段线加起来），用来做"一笔画出来"的效果
const CHECK_LEN = 11.5;
// 每道眼泪的长度
const TEAR_LEN = 5;

const duration: Record<ReactionKey, number> = { confirm: 520, thumbs: 560, cry: 1100 };

// 自己画的三个回应图标，线条风格，颜色跟着主题走。
// 平时是静止的；点亮的那一下才动：勾一笔画出来、大拇指往上翘一下、T_T 的眼泪流下来
export function ReactionIcon({ kind, color, fill, active, size = 18 }: {
  kind: ReactionKey;
  color: string;
  // 选中时的浅底色
  fill: string;
  active: boolean;
  size?: number;
}) {
  const { theme } = useTheme();
  // 动画进度：0 是刚点亮，1 是动完（平时一直停在 1）
  const p = useRef(new Animated.Value(1)).current;
  const wasActive = useRef(active);

  useEffect(() => {
    if (active && !wasActive.current) {
      p.setValue(0);
      // SVG 的线条属性不能交给原生驱动，这里用 JS 驱动，图标很小，开销可以忽略
      Animated.timing(p, { toValue: 1, duration: duration[kind], easing: Easing.linear, useNativeDriver: false }).start();
    }
    wasActive.current = active;
  }, [active, kind, p]);

  const stroke = { stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (kind === 'confirm') {
    // 圆圈先轻轻鼓一下并填满，勾再从左往右一笔画出来；选中时勾用和按钮文字一样的反白色
    const pop = p.interpolate({ inputRange: [0, 0.3, 0.55, 1], outputRange: [0.75, 1.12, 0.97, 1] });
    const draw = p.interpolate({
      inputRange: [0, 0.25, 0.8],
      outputRange: [CHECK_LEN, CHECK_LEN, 0],
      easing: Easing.out(Easing.cubic),
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9.5} {...stroke} fill={active ? color : 'none'} />
          <APath
            d="M8 12.3l2.7 2.7L16 9.6"
            {...stroke}
            stroke={active ? theme.onText : color}
            strokeWidth={2}
            strokeDasharray={[CHECK_LEN, CHECK_LEN]}
            strokeDashoffset={draw}
          />
        </Svg>
      </Animated.View>
    );
  }

  if (kind === 'thumbs') {
    // 以手腕为轴往上翘一下再落回来，同时轻轻抬起
    const rotate = p.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: ['0deg', '-22deg', '6deg', '0deg'] });
    const lift = p.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, -2, 0] });
    return (
      <Animated.View style={{ transformOrigin: '25% 85%', transform: [{ translateY: lift }, { rotate }] }}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M3.5 10.5h3v10h-3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" {...stroke} fill={active ? color : 'none'} />
          <Path
            d="M6.5 10.5l3.6-6.6a1.9 1.9 0 0 1 3.5 1.3L12.8 9h5.6a2 2 0 0 1 1.95 2.45l-1.6 7.1a2.5 2.5 0 0 1-2.45 1.95H6.5"
            {...stroke}
            fill={active ? fill : 'none'}
          />
        </Svg>
      </Animated.View>
    );
  }

  // 哭脸，像 T_T：眼睛是两道横线，眼泪是竖线。
  // 点亮时眼泪从眼睛下面重新流出来，流到底各掉下一滴，右边那滴晚一点
  const tear = p.interpolate({
    inputRange: [0, 0.4],
    outputRange: [TEAR_LEN, 0],
    easing: Easing.out(Easing.quad),
    extrapolate: 'clamp',
  });
  const dropY = (start: number) =>
    p.interpolate({ inputRange: [start, 1], outputRange: [17.4, 22], easing: Easing.in(Easing.quad), extrapolate: 'clamp' });
  const dropOpacity = (start: number) =>
    p.interpolate({ inputRange: [0, start, start + 0.05, 0.9, 1], outputRange: [0, 0, 1, 1, 0], extrapolate: 'clamp' });

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.5} {...stroke} fill={active ? fill : 'none'} />
      <Path d="M6.2 9.6h4.6M13.2 9.6h4.6" {...stroke} />
      <APath d="M8.5 11.6v5" {...stroke} strokeDasharray={[TEAR_LEN, TEAR_LEN]} strokeDashoffset={tear} />
      <APath d="M15.5 11.6v5" {...stroke} strokeDasharray={[TEAR_LEN, TEAR_LEN]} strokeDashoffset={tear} />
      <ACircle cx={8.5} cy={dropY(0.4)} r={1.05} fill={color} opacity={dropOpacity(0.4)} />
      <ACircle cx={15.5} cy={dropY(0.5)} r={1.05} fill={color} opacity={dropOpacity(0.5)} />
    </Svg>
  );
}
