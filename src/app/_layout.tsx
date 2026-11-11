import { DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/Toast';
import { Backdrop } from '@/components/ui';
import { OnlineSync } from '@/data/online';
import { StoreProvider } from '@/data/store';
import { ThemeProvider } from '@/theme/useTheme';

// 导航自带的底色设为透明，让我们自己的主题背景透出来
const navigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent', card: 'transparent' },
};

export default function RootLayout() {
  return (
    // 手势库要求最外层有这个根视图，左右翻页的手势才能和页面滚动协同
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StoreProvider>
        {/* 和服务器同步作业；不画任何东西 */}
        <OnlineSync />
        <ThemeProvider>
          <ToastProvider>
            <NavigationThemeProvider value={navigationTheme}>
              <View style={{ flex: 1 }}>
                <Backdrop />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="homework/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="course/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="upload" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="add-course" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="import/swufe" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="login" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="join-class" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                </Stack>
              </View>
            </NavigationThemeProvider>
          </ToastProvider>
        </ThemeProvider>
      </StoreProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
