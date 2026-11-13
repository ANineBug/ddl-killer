import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView, BlurView } from 'expo-blur';
import { usePathname } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { ComponentProps, ComponentRef, Ref, RefObject, useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
  return (
    <Tabs style={{ flex: 1 }}>
      {/* 页面之间只能点底部标签切换；左右滑动留给页面自己用（作业卡片划走、课表翻周） */}
      <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
        <TabSlot style={{ flex: 1 }} />
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
