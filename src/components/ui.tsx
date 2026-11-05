import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import {
  Pressable,
  PressableProps,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHoldThemeSwitch, useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

export function Backdrop() {
  const { theme } = useTheme();
  if (theme.bg.length > 1) {
    return (
      <LinearGradient
        colors={theme.bg as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    );
  }
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg[0] }]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.cardEdge, borderWidth: theme.glass ? StyleSheet.hairlineWidth : 0 },
        style,
      ]}>
      {children}
    </View>
  );
}

type Variant = 'display' | 'title' | 'body' | 'label' | 'sub' | 'caption';

const variantStyle: Record<Variant, object> = {
  display: { fontFamily: fonts.serif, fontSize: 32, fontWeight: '600', letterSpacing: 1 },
  title: { fontFamily: fonts.serif, fontSize: 21, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600' },
  sub: { fontSize: 13 },
  caption: { fontSize: 12, letterSpacing: 0.3 },
};

export function Txt({
  variant = 'body',
  tone = 'text',
  style,
  ...props
}: TextProps & { variant?: Variant; tone?: 'text' | 'sub' | 'faint' | 'accent' | 'urgent' }) {
  const { theme } = useTheme();
  return <Text {...props} style={[variantStyle[variant], { color: theme[tone] }, style]} />;
}

export function Press({ style, ...props }: PressableProps & { style?: StyleProp<ViewStyle> }) {
  return <Pressable {...props} style={({ pressed }) => [style, pressed && { opacity: 0.55 }]} />;
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { theme } = useTheme();
  return (
    <Press
      onPress={onPress}
      style={[
        styles.chip,
        active
          ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
          : { backgroundColor: 'transparent', borderColor: theme.line },
      ]}>
      <Txt variant="sub" tone={active ? 'accent' : 'sub'} style={active && { fontWeight: '600' }}>
        {label}
      </Txt>
    </Press>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Txt variant="caption" tone="sub" style={{ marginBottom: 10, marginLeft: 4 }}>
        {title}
      </Txt>
      {children}
    </View>
  );
}

// 关闭弹出页面；如果是直接打开的（没有上一页），回到首页
export function closeModal() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

// 弹出页面的统一外框：顶部关闭按钮 + 标题，内容可滚动，底部可放主按钮
export function ModalScreen({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  useHoldThemeSwitch();
  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
        <Press onPress={closeModal} hitSlop={12} style={styles.close}>
          <Ionicons name="close" size={22} color={theme.sub} />
        </Press>
        {title ? <Txt variant="label">{title}</Txt> : null}
        <View style={styles.close} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={{ padding: 20, paddingBottom: insets.bottom + 16 }}>{footer}</View> : null}
    </View>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ marginTop: 22 }}>
      <Txt variant="caption" tone="sub" style={{ marginBottom: 8, marginLeft: 4 }}>
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={theme.faint}
        {...props}
        style={[
          styles.field,
          { backgroundColor: theme.card, borderColor: theme.glass ? theme.cardEdge : theme.line, color: theme.text },
          props.multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
          style,
        ]}
      />
    </View>
  );
}

export function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Txt variant="caption" tone="sub" style={{ marginBottom: 10, marginLeft: 4 }}>
        {label}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { theme } = useTheme();
  return (
    <Press
      onPress={disabled ? undefined : onPress}
      style={[styles.primary, { backgroundColor: theme.text, opacity: disabled ? 0.3 : 1 }]}>
      <Text style={{ color: theme.dark ? '#16161a' : '#ffffff', fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, overflow: 'hidden' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 4 },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  primary: { height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  // outlineWidth 去掉网页版输入框的浏览器默认焦点框，手机上没有这个框
  field: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, outlineWidth: 0 },
});
