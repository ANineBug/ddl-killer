import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/useTheme';

type ToastAction = { label: string; onPress: () => void };
type ShowToast = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<ShowToast>(() => {});

// 屏幕下方短暂出现的一句话；带"撤销"之类的按钮时多停留一会儿
export function ToastProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const native = Platform.OS !== 'web';

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: native }).start(() => setToast(null));
  }, [anim, native]);

  const show = useCallback<ShowToast>(
    (message, action) => {
      clearTimeout(timer.current);
      setToast({ message, action });
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, friction: 8, tension: 90, useNativeDriver: native }).start();
      timer.current = setTimeout(hide, action ? 3500 : 2200);
    },
    [anim, hide, native],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents={toast.action ? 'box-none' : 'none'}
          style={[
            styles.toast,
            {
              bottom: insets.bottom + 92,
              backgroundColor: theme.text,
              opacity: anim,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            },
          ]}>
          <Text style={{ color: '#1c1a24', fontSize: 14 }}>{toast.message}</Text>
          {toast.action && (
            <Pressable
              hitSlop={10}
              onPress={() => {
                toast.action?.onPress();
                hide();
              }}>
              <Text style={{ color: '#6a5f86', fontSize: 14, fontWeight: '700', marginLeft: 14 }}>{toast.action.label}</Text>
            </Pressable>
          )}
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
});
