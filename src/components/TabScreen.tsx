import { useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';

// 记住上一个标签的位置，用来判断新页面从左边还是右边滑进来
let lastIndex = 0;

// 标签页的外框：点底部标签切过来时，从切换方向轻轻滑入并淡入
export function TabScreen({ index, children }: { index: number; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const offset = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      const dir = Math.sign(index - lastIndex);
      lastIndex = index;
      if (dir === 0) return;
      opacity.setValue(0);
      offset.setValue(18 * dir);
      const config = { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' };
      Animated.parallel([Animated.timing(opacity, { ...config, toValue: 1 }), Animated.timing(offset, config)]).start();
    }, [index, opacity, offset]),
  );

  return <Animated.View style={{ flex: 1, opacity, transform: [{ translateX: offset }] }}>{children}</Animated.View>;
}
