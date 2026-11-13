import { Ionicons } from '@expo/vector-icons';
import { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Reanimated, { Easing, interpolate, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '@/components/haptic';
import { Txt } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// 滑过这一行宽度的多少算数
const COMMIT_RATIO = 0.3;

// 可以左右划走的一行：内容跟着手指走，露出来的地方显示"松手会发生什么"。
// 往左往右默认一样；给了 leftward 的话，往左划换成另一件事（比如已完成的作业：往右恢复、往左归档）。
// 滑过三成宽度（或者快速甩一下）松手才生效，否则弹回去。
// 手指先上下动的话算滚动页面，这个手势自动让路
export function SwipeRow({ label, icon, onCommit, leftward, onSwipe, children }: {
  label: string;
  icon: IconName;
  // 划走的动画结束后调用
  onCommit: () => void;
  // 往左划时做的另一件事；不给就和往右一样
  leftward?: { label: string; icon: IconName; onCommit: () => void };
  // 开始划和松手时各调用一次；网页上用它挡掉松手后误触发的点击
  onSwipe?: () => void;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  // 已经滑过生效线：过线的那一下震一下，让手指知道"现在松手就算数"
  const armed = useSharedValue(false);
  const gone = useSharedValue(false);

  const tick = () => haptic.select();
  const commit = (dir: number) => (dir < 0 && leftward ? leftward.onCommit() : onCommit());
  const swiped = () => onSwipe?.();

  const pan = usePanGesture({
    // 横向走出 14 点才开始；先竖着走了 10 点就放弃，交给页面滚动
    activeOffsetX: [-14, 14],
    failOffsetY: [-10, 10],
    onActivate: () => {
      'worklet';
      scheduleOnRN(swiped);
    },
    onUpdate: (e) => {
      'worklet';
      if (gone.value) return;
      x.value = e.translationX;
      const now = Math.abs(e.translationX) > width.value * COMMIT_RATIO;
      if (now !== armed.value) {
        armed.value = now;
        if (now) scheduleOnRN(tick);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      if (gone.value) return;
      scheduleOnRN(swiped);
      const tx = e.translationX;
      const flick = Math.abs(e.velocityX) > 700 && Math.abs(tx) > 30 && Math.sign(e.velocityX) === Math.sign(tx);
      armed.value = false;
      if (!e.canceled && (Math.abs(tx) > width.value * COMMIT_RATIO || flick)) {
        gone.value = true;
        x.value = withTiming(Math.sign(tx) * width.value, { duration: 180, easing: Easing.out(Easing.quad) }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(commit, Math.sign(tx));
        });
      } else {
        x.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      }
    },
  });

  const content = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}>
      <Hint side="left" x={x} width={width} armed={armed} label={label} icon={icon} color={theme.accent} bg={theme.accentSoft} />
      {/* 内容往左走，露出右边这条 */}
      <Hint side="right" x={x} width={width} armed={armed} label={leftward?.label ?? label} icon={leftward?.icon ?? icon} color={theme.accent} bg={theme.accentSoft} />
      {/* pan-y：网页上仍然让浏览器自己处理上下滚动 */}
      <GestureDetector gesture={pan} touchAction="pan-y">
        <Reanimated.View style={content}>{children}</Reanimated.View>
      </GestureDetector>
    </View>
  );
}

// 内容划开后露出来的那一条：只占"已经露出来"的宽度，所以半透明的卡片下面也不会透出来
function Hint({ side, x, width, armed, label, icon, color, bg }: {
  side: 'left' | 'right';
  x: SharedValue<number>;
  width: SharedValue<number>;
  armed: SharedValue<boolean>;
  label: string;
  icon: IconName;
  color: string;
  bg: string;
}) {
  const strip = useAnimatedStyle(() => ({ width: Math.max(0, side === 'left' ? x.value : -x.value) }));
  const inner = useAnimatedStyle(() => {
    const shown = Math.abs(x.value);
    return {
      opacity: interpolate(shown, [12, width.value * COMMIT_RATIO], [0, 1], 'clamp'),
      transform: [{ scale: withTiming(armed.value ? 1.12 : 0.92, { duration: 120 }) }],
    };
  });
  return (
    <Reanimated.View style={[styles.strip, side === 'left' ? { left: 0 } : { right: 0 }, { backgroundColor: bg }, strip]}>
      <Reanimated.View style={[styles.hint, side === 'left' ? { left: 18 } : { right: 18 }, inner]}>
        <Ionicons name={icon} size={16} color={color} />
        <Txt variant="label" tone="accent" numberOfLines={1}>
          {label}
        </Txt>
      </Reanimated.View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  strip: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden', justifyContent: 'center' },
  hint: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6 },
});
