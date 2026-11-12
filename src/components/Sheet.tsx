import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

// 从底部弹出的一张卡：背后变暗，点暗处或者返回键收起。内容太长可以在里面滚动
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    y.setValue(1);
    Animated.timing(y, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [visible, y]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20,18,24,0.32)' }]} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          {
            // 暮色主题的卡片是半透明的，弹层要用不透明的底色
            backgroundColor: theme.bg[1] ?? theme.bg[0],
            paddingBottom: insets.bottom + 20,
            transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 480] }) }],
          },
        ]}>
        <View style={[styles.grab, { backgroundColor: theme.line }]} />
        {title ? (
          <Txt variant="title" style={{ fontSize: 17, marginBottom: 12 }}>
            {title}
          </Txt>
        ) : null}
        <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 14 },
});
