import { DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/Toast';
import { Backdrop } from '@/components/ui';
import { StoreProvider } from '@/data/store';
import { ThemeProvider } from '@/theme/useTheme';

// 导航自带的底色设为透明，让我们自己的主题背景透出来
const navigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent', card: 'transparent' },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
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
                </Stack>
              </View>
            </NavigationThemeProvider>
          </ToastProvider>
        </ThemeProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
