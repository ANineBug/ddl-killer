import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView, BlurView } from 'expo-blur';
import { TabList, Tabs, TabSlot, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { ComponentProps, ComponentRef, Ref, RefObject, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

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

// 底部悬浮的胶囊标签栏，背后是毛玻璃
function TabBar({ blurTarget }: { blurTarget: RefObject<ComponentRef<typeof View> | null> }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
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

function TabButton({ isFocused, label, icon, iconActive, ...props }: TabButtonProps) {
  const { theme } = useTheme();
  const color = isFocused ? theme.text : theme.faint;
  return (
    <Pressable {...props} style={styles.button}>
      <Ionicons name={isFocused ? iconActive : icon} size={22} color={color} />
      <Text style={{ fontSize: 11, marginTop: 2, color, fontWeight: isFocused ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  barWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    width: 260,
    height: 62,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  button: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
