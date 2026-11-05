import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { ComponentRef, createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { Phase, phaseAt, Theme, themes, withAlpha } from './tokens';

export type ThemeMode = 'auto' | Phase;

type ThemeContextValue = {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  // 弹出页面（上传、添加课程）打开时暂停自动切换，避免用户输入时界面变色
  holdSwitch: () => () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const SWEEP_MS = 3000;
const REVEAL_PAUSE_MS = 1000;
const IDLE_MS = 4000;
const CHECK_EVERY_MS = 10000;
// 揭晓边缘的柔和过渡带高度
const BAND = 140;
const LAST_PHASE_KEY = 'theme.lastPhase';
const MODE_KEY = 'theme.mode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase | null>(null);
  const [mode, setModeState] = useState<ThemeMode>('auto');
  const [snapshot, setSnapshot] = useState<{ uri: string; target: Phase } | null>(null);

  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const sweep = useRef(new Animated.Value(0)).current;
  const phaseRef = useRef<Phase | null>(null);
  const busyRef = useRef(false);
  // 动画进行中又要求切换时，记下最新的目标，等这一段放完再切过去
  const pendingRef = useRef<Phase | null>(null);
  const goToRef = useRef<(target: Phase) => void>(() => {});
  const lastTouchRef = useRef(0);
  const holdsRef = useRef(0);

  phaseRef.current = phase;

  const finish = useCallback(() => {
    busyRef.current = false;
    const next = pendingRef.current;
    pendingRef.current = null;
    if (next && next !== phaseRef.current) goToRef.current(next);
  }, []);

  // 截下当前画面盖在最上面，底下换成新主题，再把截图从上往下揭开
  const goTo = useCallback(
    async (target: Phase) => {
      if (busyRef.current) {
        pendingRef.current = target;
        return;
      }
      if (phaseRef.current === target) return;
      busyRef.current = true;
      try {
        const uri = await captureRef(rootRef, {
          format: 'png',
          quality: 1,
          result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
        });
        setSnapshot({ uri, target });
      } catch {
        phaseRef.current = target;
        setPhase(target);
        finish();
      }
    },
    [finish],
  );
  goToRef.current = goTo;

  const startSweep = useCallback(() => {
    if (!snapshot) return;
    phaseRef.current = snapshot.target;
    setPhase(snapshot.target);
    sweep.setValue(0);
    Animated.timing(sweep, {
      toValue: 1,
      duration: SWEEP_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      setSnapshot(null);
      finish();
    });
  }, [snapshot, sweep, finish]);

  // 启动时先显示上次看到的主题，停顿一下再揭晓现在的主题
  useEffect(() => {
    (async () => {
      const [savedPhase, savedMode] = await Promise.all([
        AsyncStorage.getItem(LAST_PHASE_KEY),
        AsyncStorage.getItem(MODE_KEY),
      ]);
      const startMode = (savedMode as ThemeMode) || 'auto';
      const target = startMode === 'auto' ? phaseAt(new Date()) : startMode;
      setModeState(startMode);
      if (savedPhase && savedPhase !== target) {
        setPhase(savedPhase as Phase);
        setTimeout(() => goTo(target), REVEAL_PAUSE_MS);
      } else {
        setPhase(target);
      }
    })();
  }, [goTo]);

  useEffect(() => {
    if (phase) AsyncStorage.setItem(LAST_PHASE_KEY, phase);
  }, [phase]);

  // 正在使用时到点：等用户停手、没有打开弹出页面，再切换
  useEffect(() => {
    if (mode !== 'auto') return;
    const id = setInterval(() => {
      const target = phaseAt(new Date());
      const idle = Date.now() - lastTouchRef.current > IDLE_MS;
      if (target !== phaseRef.current && idle && holdsRef.current === 0) goTo(target);
    }, CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [mode, goTo]);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      AsyncStorage.setItem(MODE_KEY, next);
      goTo(next === 'auto' ? phaseAt(new Date()) : next);
    },
    [goTo],
  );

  const holdSwitch = useCallback(() => {
    holdsRef.current += 1;
    return () => {
      holdsRef.current -= 1;
    };
  }, []);

  if (!phase) return <View style={{ flex: 1, backgroundColor: themes.day.bg[0] }} />;

  const theme = themes[phase];
  const edge = sweep.interpolate({ inputRange: [0, 1], outputRange: [-BAND, height] });
  const counterEdge = Animated.multiply(edge, -1);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, holdSwitch }}>
      <View
        ref={rootRef}
        collapsable={false}
        style={{ flex: 1 }}
        onTouchStart={() => (lastTouchRef.current = Date.now())}>
        {children}
      </View>
      {snapshot && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[styles.oldScreen, { height: height + BAND, transform: [{ translateY: edge }] }]}>
            <Animated.Image
              source={{ uri: snapshot.uri }}
              onLoad={startSweep}
              style={{ width, height, transform: [{ translateY: counterEdge }] }}
            />
            <LinearGradient
              colors={[themes[snapshot.target].bgMid, withAlpha(themes[snapshot.target].bgMid, 0)]}
              style={[styles.band, { height: BAND }]}
            />
          </Animated.View>
        </View>
      )}
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 需要在 ThemeProvider 里使用');
  return ctx;
}

// 在弹出页面里调用，打开期间不自动切换主题
export function useHoldThemeSwitch() {
  const { holdSwitch } = useTheme();
  useEffect(() => holdSwitch(), [holdSwitch]);
}

const styles = StyleSheet.create({
  oldScreen: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, left: 0, right: 0 },
});
