import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { Theme, ThemeName, themes } from './tokens';

const THEME_KEY = 'theme.name';

type ThemeContextValue = { theme: Theme; name: ThemeName; setName: (name: ThemeName) => void };

const ThemeContext = createContext<ThemeContextValue>({ theme: themes.paper, name: 'paper', setName: () => {} });

// 用户在"我的 → 外观"里选的主题，选了就记住；切换时直接换，不做动画
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setNameState] = useState<ThemeName>('paper');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((saved) => {
        if (saved === 'dusk' || saved === 'paper') setNameState(saved);
      })
      .finally(() => setReady(true));
  }, []);

  const setName = useCallback((next: ThemeName) => {
    setNameState(next);
    AsyncStorage.setItem(THEME_KEY, next);
  }, []);

  const theme = themes[name];

  // 根视图的底色跟着主题，避免切换页面时露出另一种颜色
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.bg[0]);
  }, [theme]);

  // 读到保存的主题之前先不画界面，免得先闪一下暮色再变成纸页
  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ theme, name, setName }}>
      {children}
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
