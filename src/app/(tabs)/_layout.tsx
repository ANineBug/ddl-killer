import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView, BlurView } from 'expo-blur';
import { router, usePathname } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { ComponentProps, ComponentRef, ReactNode, Ref, RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureStateManager, usePanGesture } from 'react-native-gesture-handler';
import Reanimated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/components/haptic';
import { markSwipeNavigation } from '@/components/TabScreen';
import { PagerGestureContext } from '@/components/TabScroll';
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
        <PagerGestureContext.Provider value={pager.gesture}>
          {/* pan-y：网页上仍然允许浏览器自己处理上下滚动 */}
          <GestureDetector gesture={pager.gesture} touchAction="pan-y">
            <View style={{ flex: 1, overflow: 'hidden' }}>
              {/* 三页并排摆好：每页的位置 = 自己的序号 × 屏幕宽 + 整体的滑动距离 */}
              <TabSlot
                style={{ flex: 1 }}
                detachInactiveScreens={false}
                renderFn={(descriptor) => {
                  const i = Math.max(0, tabs.findIndex((t) => t.name === descriptor.route.name));
                  return (
                    <PagerPage key={descriptor.route.key} i={i} x={pager.x} width={width}>
                      {descriptor.render()}
                    </PagerPage>
                  );
                }}
              />
            </View>
          </GestureDetector>
        </PagerGestureContext.Provider>
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
// 点底部标签切换时不走这里，直接跳到那一页，由 TabScreen 做淡入。
//
// 用的是 gesture-handler 的手势，并且和页面的上下滚动"同时识别"（见 TabScrollView）：
// 安卓原生滚动一旦开始会独占这次触摸，老的 PanResponder 就再也收不到消息，
// 表现为"往下滑过以后不松手，再横着滑翻不了页"。
// 方向由我们自己判断：手指还在上下走，就把起点挪到当前位置；
// 从某个位置开始明显横着走了，才从那一刻接管成翻页。
//
// 手势回调和页面位置都跑在界面线程上（Reanimated 的 worklet）：手指移动 → 页面位置，
// 中间不经过 JS 线程，JS 忙的时候也不会掉帧。只有震动、切换路由这些才回到 JS 去做
function useSwipePager(width: number) {
  const pathname = usePathname();
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.href === pathname),
  );
  // 整排页面的横向位置；在第 i 页时是 -i × 屏幕宽
  const x = useSharedValue(-index * width);
  // 界面线程上要用到的当前页和屏幕宽
  const indexSV = useSharedValue(index);
  const widthSV = useSharedValue(width);
  // 这一次触摸的状态：从哪里开始算横向距离、是否已经接管成翻页
  const anchorX = useSharedValue(0);
  const anchorY = useSharedValue(0);
  const engaged = useSharedValue(false);
  // 滑动切过去的那一页：位置已经由滑动动画带到了，不需要再跳
  const swipedTo = useRef<number | null>(null);

  useLayoutEffect(() => {
    indexSV.value = index;
    widthSV.value = width;
    if (swipedTo.current === index) {
      swipedTo.current = null;
      return;
    }
    cancelAnimation(x);
    x.value = -index * width;
  }, [index, width, x, indexSV, widthSV]);

  // 松手决定翻页时在 JS 这边做的事：震动、标记"这次是滑过来的"、底部选中块先滑过去
  function onSwipeCommit(next: number) {
    haptic.select();
    swipedTo.current = next;
    markSwipeNavigation();
    moveIndicator?.(next);
  }
  function goTo(next: number) {
    router.navigate(tabs[next].href);
  }

  const gesture = usePanGesture({
    // 什么时候开始翻页由我们自己决定（下面 onTouchesMove 里），不按默认的移动距离激活
    manualActivation: true,
    onTouchesDown: (e) => {
      'worklet';
      const t = e.allTouches[0];
      if (!t) return;
      anchorX.value = t.absoluteX;
      anchorY.value = t.absoluteY;
      engaged.value = false;
    },
    onTouchesMove: (e) => {
      'worklet';
      const t = e.allTouches[0];
      if (!t || engaged.value || e.numberOfTouches !== 1) return;
      const dx = t.absoluteX - anchorX.value;
      const dy = t.absoluteY - anchorY.value;
      // 这一段主要在上下走：还在滚动页面，把起点挪到这里，之后的横向距离从这里重新算
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
        anchorX.value = t.absoluteX;
        anchorY.value = t.absoluteY;
        return;
      }
      // 从起点开始明显横着走了：接管成翻页
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        engaged.value = true;
        anchorX.value = t.absoluteX;
        cancelAnimation(x);
        GestureStateManager.activate(e.handlerTag);
      }
    },
    onUpdate: (e) => {
      'worklet';
      if (!engaged.value) return;
      const dx = e.absoluteX - anchorX.value;
      const i = indexSV.value;
      // 第一页再往右、最后一页再往左时，只给一点阻力感
      const atEdge = (dx > 0 && i === 0) || (dx < 0 && i === tabs.length - 1);
      x.value = -i * widthSV.value + dx * (atEdge ? 0.2 : 1);
    },
    onDeactivate: (e) => {
      'worklet';
      if (!engaged.value) return;
      engaged.value = false;
      const i = indexSV.value;
      const w = widthSV.value;
      const dx = e.absoluteX - anchorX.value;
      // 速度单位是"点 / 秒"
      const vx = e.velocityX;
      const next = i + (dx < 0 ? 1 : -1);
      const farEnough = Math.abs(dx) > w * 0.3 || (Math.abs(vx) > 400 && Math.abs(dx) > 20);
      if (e.canceled || !farEnough || next < 0 || next >= tabs.length) {
        x.value = withTiming(-i * w, { duration: 240, easing: Easing.out(Easing.cubic) });
        return;
      }
      scheduleOnRN(onSwipeCommit, next);
      // 页面滑到位以后再真正切换路由
      x.value = withTiming(-next * w, { duration: 260, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(goTo, next);
      });
    },
    onFinalize: () => {
      'worklet';
      if (!engaged.value) return;
      engaged.value = false;
      x.value = withTiming(-indexSV.value * widthSV.value, { duration: 240, easing: Easing.out(Easing.cubic) });
    },
  });

  return { x, gesture };
}

// 一页的外框：横向位置 = 自己的序号 × 屏幕宽 + 整体的滑动距离，在界面线程上算
function PagerPage({ i, x, width, children }: { i: number; x: SharedValue<number>; width: number; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value + i * width }] }));
  return <Reanimated.View style={[StyleSheet.absoluteFill, style]}>{children}</Reanimated.View>;
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
