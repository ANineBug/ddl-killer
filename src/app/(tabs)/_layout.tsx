import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView, BlurView } from 'expo-blur';
import { router, usePathname } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { ComponentProps, ComponentRef, Ref, RefObject, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/components/haptic';
import { useTheme } from '@/theme/useTheme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const tabs: { name: string; href: '/' | '/timetable' | '/me'; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', href: '/', label: '作业', icon: 'document-text-outline', iconActive: 'document-text' },
  { name: 'timetable', href: '/timetable', label: '课表', icon: 'calendar-clear-outline', iconActive: 'calendar-clear' },
  { name: 'me', href: '/me', label: '我的', icon: 'person-circle-outline', iconActive: 'person-circle' },
];

export default function TabsLayout() {
  const blurTarget = useRef<ComponentRef<typeof View> | null>(null);
  const swipe = useSwipeTabs();
  return (
    <Tabs style={{ flex: 1 }}>
      <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
        <Animated.View {...swipe.handlers} style={{ flex: 1, transform: [{ translateX: swipe.drag }] }}>
          <TabSlot style={{ flex: 1 }} />
        </Animated.View>
      </BlurTargetView>
      <TabBar blurTarget={blurTarget} />
      <TabList style={{ display: 'none' }}>
        {tabs.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} />
        ))}
      </TabList>
    </Tabs>
  );
}

// 左右滑动切换标签：页面先跟着手指轻轻动，滑得够远或够快就切到相邻页面，
// 新页面由 TabScreen 从滑动方向滑进来；明显偏上下的滑动留给页面滚动
function useSwipeTabs() {
  const pathname = usePathname();
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.href === pathname),
  );
  const indexRef = useRef(index);
  indexRef.current = index;
  const drag = useRef(new Animated.Value(0)).current;
  // 一次滑动最多切一页；网页上同一次松手可能被处理两次
  const switchedRef = useRef(false);

  const responder = useMemo(() => {
    const settle = () =>
      Animated.spring(drag, { toValue: 0, friction: 9, tension: 120, useNativeDriver: Platform.OS !== 'web' }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        switchedRef.current = false;
      },
      onPanResponderMove: (_, g) => {
        const i = indexRef.current;
        // 已经是第一页还往右滑、或最后一页还往左滑时，只给一点阻力感
        const atEdge = (g.dx > 0 && i === 0) || (g.dx < 0 && i === tabs.length - 1);
        drag.setValue(g.dx * (atEdge ? 0.12 : 0.35));
      },
      onPanResponderRelease: (_, g) => {
        if (switchedRef.current) return;
        const next = indexRef.current + (g.dx < 0 ? 1 : -1);
        const farEnough = Math.abs(g.dx) > 70 || (Math.abs(g.vx) > 0.5 && Math.abs(g.dx) > 25);
        if (farEnough && next >= 0 && next < tabs.length) {
          switchedRef.current = true;
          haptic.select();
          drag.setValue(0);
          router.navigate(tabs[next].href);
        } else {
          settle();
        }
      },
      onPanResponderTerminate: settle,
    });
  }, [drag]);

  return { drag, handlers: responder.panHandlers };
}

// 底部悬浮的胶囊标签栏，背后是毛玻璃；选中项下面有一块底色跟着滑过去
function TabBar({ blurTarget }: { blurTarget: RefObject<ComponentRef<typeof View> | null> }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const active = Math.max(
    0,
    tabs.findIndex((t) => t.href === pathname),
  );
  const slide = useRef(new Animated.Value(active)).current;

  useEffect(() => {
    Animated.spring(slide, { toValue: active, friction: 9, tension: 110, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [active, slide]);

  return (
    <View pointerEvents="box-none" style={[styles.barWrap, { bottom: insets.bottom + 14 }]}>
      <View style={[styles.bar, { borderColor: theme.line }]}>
        <BlurView
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={40}
          tint={theme.dark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface }]}
        />
        <Animated.View
          style={[
            styles.indicator,
            { backgroundColor: theme.accentSoft, transform: [{ translateX: Animated.multiply(slide, TAB_W) }] },
          ]}
        />
        {tabs.map((t) => (
          <TabTrigger key={t.name} name={t.name} asChild>
            <TabButton label={t.label} icon={t.icon} iconActive={t.iconActive} />
          </TabTrigger>
        ))}
      </View>
    </View>
  );
}

type TabButtonProps = TabTriggerSlotProps & { ref?: Ref<ComponentRef<typeof View>>; label: string; icon: IconName; iconActive: IconName };

function TabButton({ isFocused, label, icon, iconActive, onPress, ...props }: TabButtonProps) {
  const { theme } = useTheme();
  const color = isFocused ? theme.text : theme.faint;
  const pop = useRef(new Animated.Value(1)).current;

  // 选中时图标轻轻弹一下
  useEffect(() => {
    if (!isFocused) return;
    pop.setValue(0.8);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 180, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [isFocused, pop]);

  return (
    <Pressable
      {...props}
      onPress={(e) => {
        if (!isFocused) haptic.select();
        onPress?.(e);
      }}
      style={styles.button}>
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Ionicons name={isFocused ? iconActive : icon} size={22} color={color} />
      </Animated.View>
      <Text style={{ fontSize: 11, marginTop: 2, color, fontWeight: isFocused ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

const BAR_W = 260;
const TAB_W = BAR_W / 3;
const INDICATOR_W = 70;

const styles = StyleSheet.create({
  indicator: {
    position: 'absolute',
    top: 7,
    left: (TAB_W - INDICATOR_W) / 2,
    width: INDICATOR_W,
    height: 48,
    borderRadius: 999,
  },
  barWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    width: BAR_W,
    height: 62,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  button: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
