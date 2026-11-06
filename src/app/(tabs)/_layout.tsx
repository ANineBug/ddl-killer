import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView, BlurView } from 'expo-blur';
import { router, usePathname } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { ComponentProps, ComponentRef, Ref, RefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/components/haptic';
import { markSwipeNavigation } from '@/components/TabScreen';
import { useTheme } from '@/theme/useTheme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const tabs: { name: string; href: '/' | '/timetable' | '/me'; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', href: '/', label: '作业', icon: 'document-text-outline', iconActive: 'document-text' },
  { name: 'timetable', href: '/timetable', label: '课表', icon: 'calendar-clear-outline', iconActive: 'calendar-clear' },
  { name: 'me', href: '/me', label: '我的', icon: 'person-circle-outline', iconActive: 'person-circle' },
];

export default function TabsLayout() {
  const blurTarget = useRef<ComponentRef<typeof View> | null>(null);
  const { width } = useWindowDimensions();
  const pager = useSwipePager(width);
  // 路由默认只在打开过某一页后才把它加载出来；滑动时要能看到旁边那页，所以一开始就把三页都预加载好
  useEffect(() => {
    tabs.forEach((t) => router.prefetch(t.href));
  }, []);
  return (
    <Tabs style={{ flex: 1 }}>
      <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
        <View {...pager.handlers} style={{ flex: 1, overflow: 'hidden' }}>
          {/* 三页并排摆好：每页的位置 = 自己的序号 × 屏幕宽 + 整体的滑动距离 */}
          <TabSlot
            style={{ flex: 1 }}
            detachInactiveScreens={false}
            renderFn={(descriptor) => {
              const i = Math.max(0, tabs.findIndex((t) => t.name === descriptor.route.name));
              return (
                <Animated.View
                  key={descriptor.route.key}
                  style={[StyleSheet.absoluteFill, { transform: [{ translateX: Animated.add(pager.x, i * width) }] }]}>
                  {descriptor.render()}
                </Animated.View>
              );
            }}
          />
        </View>
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

// 手指左右滑：三页连在一起跟着手指走，旁边那页同时滑进来，松手后滑到底或者弹回去。
// 点底部标签切换时不走这里，直接跳到那一页，由 TabScreen 做淡入
function useSwipePager(width: number) {
  const pathname = usePathname();
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.href === pathname),
  );
  const indexRef = useRef(index);
  indexRef.current = index;
  const widthRef = useRef(width);
  widthRef.current = width;
  // 整排页面的横向位置；在第 i 页时是 -i × 屏幕宽
  const x = useRef(new Animated.Value(-index * width)).current;
  // 滑动切过去的那一页：位置已经由滑动动画带到了，不需要再跳
  const swipedTo = useRef<number | null>(null);
  // 网页上同一次松手可能触发两次，只处理第一次
  const released = useRef(false);

  useLayoutEffect(() => {
    if (swipedTo.current === index) {
      swipedTo.current = null;
      return;
    }
    x.stopAnimation();
    x.setValue(-index * width);
  }, [index, width, x]);

  const responder = useMemo(() => {
    const native = Platform.OS !== 'web';
    const base = () => -indexRef.current * widthRef.current;
    const settle = () => Animated.spring(x, { toValue: base(), friction: 10, tension: 90, useNativeDriver: native }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        released.current = false;
        x.stopAnimation();
      },
      onPanResponderMove: (_, g) => {
        const i = indexRef.current;
        // 第一页再往右、最后一页再往左时，只给一点阻力感
        const atEdge = (g.dx > 0 && i === 0) || (g.dx < 0 && i === tabs.length - 1);
        x.setValue(base() + g.dx * (atEdge ? 0.2 : 1));
      },
      onPanResponderRelease: (_, g) => {
        if (released.current) return;
        released.current = true;
        const next = indexRef.current + (g.dx < 0 ? 1 : -1);
        const farEnough = Math.abs(g.dx) > widthRef.current * 0.3 || (Math.abs(g.vx) > 0.4 && Math.abs(g.dx) > 20);
        if (farEnough && next >= 0 && next < tabs.length) {
          haptic.select();
          swipedTo.current = next;
          markSwipeNavigation();
          // 底部的选中块马上跟过去；页面滑到位以后再真正切换路由。
          // 如果滑动途中就切换，网页上重新渲染会打断这段动画
          moveIndicator?.(next);
          Animated.timing(x, {
            toValue: -next * widthRef.current,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: native,
          }).start(() => router.navigate(tabs[next].href));
        } else {
          settle();
        }
      },
      onPanResponderTerminate: settle,
    });
  }, [x]);

  return { x, handlers: responder.panHandlers };
}

// 滑动松手时，让底部标签栏的选中块不用等页面切换完就先滑过去
let moveIndicator: ((index: number) => void) | null = null;

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

  useEffect(() => {
    moveIndicator = (i) =>
      Animated.spring(slide, { toValue: i, friction: 9, tension: 110, useNativeDriver: Platform.OS !== 'web' }).start();
    return () => {
      moveIndicator = null;
    };
  }, [slide]);

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
