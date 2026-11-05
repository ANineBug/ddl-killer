import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  ComponentRef,
  createContext,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { Phase, phaseAt, Theme, themes, withAlpha } from './tokens';

export type ThemeMode = 'auto' | Phase;

type ViewRef = RefObject<ComponentRef<typeof View> | null>;
type Rect = { x: number; y: number; width: number; height: number };
type Snapshot = { target: Phase; from: string; to?: string; cards: Rect[] };

type ThemeContextValue = {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  // 弹出页面（上传、添加课程）打开时暂停自动切换，避免用户输入时界面变色
  holdSwitch: () => () => void;
  // 卡片登记自己的位置，组合过渡时逐张翻过去
  registerCard: (ref: ViewRef) => () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// 主题过渡方式：
// layered 背景整体渐变，卡片从上往下依次翻过去
// fade    全屏一起渐变
// sweep   整屏从上往下揭开
const TRANSITION: 'layered' | 'fade' | 'sweep' = 'layered';
const DURATION_MS = 3000;
const REVEAL_PAUSE_MS = 1000;
const IDLE_MS = 4000;
const CHECK_EVERY_MS = 10000;
// sweep 揭晓边缘的柔和过渡带高度
const BAND = 140;
// layered 里每张卡片翻过去占总时长的比例，以及第一张开始的时间点
const CARD_SPAN = 0.35;
const CARD_START = 0.1;
const CARD_STAGGER = 0.5;
const LAST_PHASE_KEY = 'theme.lastPhase';
const MODE_KEY = 'theme.mode';

const ease = Easing.inOut(Easing.cubic);

// 把"慢-快-慢"的缓动曲线采样成多段折线，原生动画驱动也能用
function eased(start: number, end: number, from: number, to: number, steps = 12) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    inputRange.push(start + (end - start) * t);
    outputRange.push(from + (to - from) * ease(t));
  }
  return { inputRange, outputRange, extrapolate: 'clamp' as const };
}

const captureOptions = {
  format: 'png' as const,
  quality: 1,
  result: Platform.OS === 'web' ? ('data-uri' as const) : ('tmpfile' as const),
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase | null>(null);
  const [mode, setModeState] = useState<ThemeMode>('auto');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const phaseRef = useRef<Phase | null>(null);
  const busyRef = useRef(false);
  // 动画进行中又要求切换时，记下最新的目标，等这一段放完再切过去
  const pendingRef = useRef<Phase | null>(null);
  const goToRef = useRef<(target: Phase) => void>(() => {});
  const lastTouchRef = useRef(0);
  const holdsRef = useRef(0);
  const cardsRef = useRef(new Set<ViewRef>());
  // 旧画面的截图可能触发多次 onLoad，只处理第一次
  const coveredRef = useRef(false);

  phaseRef.current = phase;

  const finish = useCallback(() => {
    busyRef.current = false;
    const next = pendingRef.current;
    pendingRef.current = null;
    if (next && next !== phaseRef.current) goToRef.current(next);
  }, []);

  const animate = useCallback(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      // 总进度匀速走，背景和每张卡片各自在 eased() 里做缓动
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      setSnapshot(null);
      finish();
    });
  }, [progress, finish]);

  // 量出屏幕上看得见的卡片位置
  const measureCards = useCallback(async () => {
    const rects = await Promise.all(
      [...cardsRef.current].map(
        (ref) =>
          new Promise<Rect | null>((resolve) => {
            const node = ref.current;
            if (!node) return resolve(null);
            node.measureInWindow((x, y, w, h) => resolve(w > 0 && h > 0 ? { x, y, width: w, height: h } : null));
          }),
      ),
    );
    return rects.filter((r): r is Rect => r !== null && r.y + r.height > 0 && r.y < height);
  }, [height]);

  // 第一步：截下当前画面盖在最上面
  const goTo = useCallback(
    async (target: Phase) => {
      if (busyRef.current) {
        pendingRef.current = target;
        return;
      }
      if (phaseRef.current === target) return;
      busyRef.current = true;
      try {
        const cards = TRANSITION === 'layered' ? await measureCards() : [];
        const from = await captureRef(rootRef, captureOptions);
        coveredRef.current = false;
        // 上一次过渡结束时进度停在 1，不归零的话旧画面一盖上就是透明的
        progress.setValue(0);
        setSnapshot({ target, from, cards });
      } catch {
        phaseRef.current = target;
        setPhase(target);
        finish();
      }
    },
    [finish, measureCards, progress],
  );
  goToRef.current = goTo;

  // 第二步：旧画面盖好以后，底下换成新主题；组合过渡还要再截一张新画面给卡片用
  const onCovered = useCallback(async () => {
    if (!snapshot || coveredRef.current) return;
    coveredRef.current = true;
    phaseRef.current = snapshot.target;
    setPhase(snapshot.target);
    if (TRANSITION !== 'layered' || snapshot.cards.length === 0) {
      animate();
      return;
    }
    try {
      await new Promise((r) => setTimeout(r, 80));
      const to = await captureRef(rootRef, captureOptions);
      setSnapshot((s) => (s ? { ...s, to } : s));
      animate();
    } catch {
      setSnapshot((s) => (s ? { ...s, cards: [] } : s));
      animate();
    }
  }, [snapshot, animate]);

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

  const registerCard = useCallback((ref: ViewRef) => {
    cardsRef.current.add(ref);
    return () => {
      cardsRef.current.delete(ref);
    };
  }, []);

  if (!phase) return <View style={{ flex: 1, backgroundColor: themes.day.bg[0] }} />;

  const theme = themes[phase];

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, holdSwitch, registerCard }}>
      <View
        ref={rootRef}
        collapsable={false}
        style={{ flex: 1 }}
        onTouchStart={() => (lastTouchRef.current = Date.now())}>
        {children}
      </View>
      {snapshot && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {TRANSITION === 'sweep' ? (
            <SweepOverlay snapshot={snapshot} progress={progress} width={width} height={height} onLoad={onCovered} />
          ) : (
            <>
              <Animated.Image
                source={{ uri: snapshot.from }}
                onLoad={onCovered}
                style={{ width, height, opacity: progress.interpolate(eased(0, 1, 1, 0)) }}
              />
              {snapshot.to &&
                snapshot.cards.map((rect, i) => (
                  <CardFlip key={i} rect={rect} snapshot={snapshot} progress={progress} width={width} height={height} />
                ))}
            </>
          )}
        </View>
      )}
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
    </ThemeContext.Provider>
  );
}

// 一张卡片的位置上：先盖着旧卡片，到了它的时间点，新卡片从上往下揭开
function CardFlip({
  rect,
  snapshot,
  progress,
  width,
  height,
}: {
  rect: Rect;
  snapshot: Snapshot;
  progress: Animated.Value;
  width: number;
  height: number;
}) {
  const start = CARD_START + Math.min(Math.max(rect.y / height, 0), 1) * CARD_STAGGER;
  const end = start + CARD_SPAN;
  const clip = { position: 'absolute' as const, left: rect.x, top: rect.y, width: rect.width, height: rect.height, overflow: 'hidden' as const, borderRadius: 18 };
  const crop = { position: 'absolute' as const, left: -rect.x, top: -rect.y, width, height };

  return (
    <>
      <View style={clip}>
        <Animated.Image source={{ uri: snapshot.from }} style={crop} />
      </View>
      <View style={clip}>
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: rect.width,
            height: rect.height,
            overflow: 'hidden',
            transform: [{ translateY: progress.interpolate(eased(start, end, -rect.height, 0)) }],
          }}>
          <Animated.Image
            source={{ uri: snapshot.to }}
            style={[crop, { transform: [{ translateY: progress.interpolate(eased(start, end, rect.height, 0)) }] }]}
          />
        </Animated.View>
      </View>
    </>
  );
}

function SweepOverlay({
  snapshot,
  progress,
  width,
  height,
  onLoad,
}: {
  snapshot: Snapshot;
  progress: Animated.Value;
  width: number;
  height: number;
  onLoad: () => void;
}) {
  const edge = progress.interpolate(eased(0, 1, -BAND, height));
  const bgMid = themes[snapshot.target].bgMid;
  return (
    <Animated.View style={[styles.oldScreen, { height: height + BAND, transform: [{ translateY: edge }] }]}>
      <Animated.Image
        source={{ uri: snapshot.from }}
        onLoad={onLoad}
        style={{ width, height, transform: [{ translateY: Animated.multiply(edge, -1) }] }}
      />
      <LinearGradient colors={[bgMid, withAlpha(bgMid, 0)]} style={[styles.band, { height: BAND }]} />
    </Animated.View>
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

export function useRegisterCard(ref: ViewRef) {
  const { registerCard } = useTheme();
  useEffect(() => registerCard(ref), [registerCard, ref]);
}

const styles = StyleSheet.create({
  oldScreen: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, left: 0, right: 0 },
});
