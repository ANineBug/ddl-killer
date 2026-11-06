import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { ReactionKey } from '@/data/types';
import { useTheme } from '@/theme/useTheme';

const APath = Animated.createAnimatedComponent(Path);
const ALine = Animated.createAnimatedComponent(Line);

// 勾的总长度（两段线加起来），用来做"一笔画出来"的效果
const CHECK_LEN = 11.5;

const duration: Record<ReactionKey, number> = { confirm: 520, thumbs: 560, cry: 1340 };

// 自己画的三个回应图标，线条风格，颜色跟着主题走。
// 平时是静止的；点亮的那一下才动：勾一笔画出来、大拇指往上翘一下、小乌云下一阵雨
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

  // 哭：一朵垂头丧气的小乌云在下雨，"心里下雨了"。
  // 点亮时云朵往下一沉、左右晃一晃，三道雨点错开落两轮
  const unit = size / 24;
  const sink = p.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [0, 0.8 * unit, 0.4 * unit, 0] });
  const sway = p.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: ['0deg', '-3deg', '2deg', '0deg'] });
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={StyleSheet.absoluteFill}>
        {RAIN.map((r, i) => {
          const { y, opacity } = rainFrames(p, i);
          return (
            <ALine
              key={i}
              x1={r.x}
              x2={r.x}
              y1={Animated.add(y, r.y)}
              y2={Animated.add(y, r.y + 2.4)}
              {...stroke}
              opacity={opacity}
            />
          );
        })}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: '50% 42%', transform: [{ translateY: sink }, { rotate: sway }] }]}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M7.2 15a3.7 3.7 0 0 1-.5-7.36A5.2 5.2 0 0 1 16.6 6.4a4.3 4.3 0 0 1 .7 8.6z" {...stroke} fill={active ? fill : 'none'} />
          <Circle cx={10} cy={11.4} r={0.95} fill={color} />
          <Circle cx={14.2} cy={11.4} r={0.95} fill={color} />
        </Svg>
      </Animated.View>
    </View>
  );
}

// 三道雨点的位置：中间那道低一点，错落一些
const RAIN = [
  { x: 8.4, y: 17.6 },
  { x: 12.2, y: 18.6 },
  { x: 16, y: 17.6 },
];

// 每道雨点在整段动画里的节奏：从上面出现、往下落、消失，再落一轮，最后停在原位。
// 三道依次晚 120ms 开始
function rainFrames(p: Animated.Value, i: number) {
  const total = duration.cry;
  const start = (i * 120) / total;
  const span = 1100 / total;
  const at = (t: number) => start + t * span;
  const y = p.interpolate({
    inputRange: [at(0), at(0.5), at(0.51), at(1)],
    outputRange: [-2, 3, -2, 0],
    extrapolate: 'clamp',
  });
  const opacity = p.interpolate({
    inputRange: [at(0), at(0.2), at(0.5), at(0.51), at(0.7), at(1)],
    outputRange: [0, 1, 0, 0, 1, 1],
    extrapolate: 'clamp',
  });
  return { y, opacity };
}
