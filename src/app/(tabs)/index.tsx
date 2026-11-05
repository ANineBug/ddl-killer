import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/components/haptic';
import { TabScreen } from '@/components/TabScreen';
import { useToast } from '@/components/Toast';
import { Card, Press, Section, Txt } from '@/components/ui';
import { dayDiff, formatDue, formatToday, isUrgent } from '@/data/format';
import { useStore } from '@/data/store';
import { Homework } from '@/data/types';
import { greeting, phaseAt } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const groups = [
  { title: '今天', test: (d: number) => d <= 0 },
  { title: '明天', test: (d: number) => d === 1 },
  { title: '这周', test: (d: number) => d >= 2 && d <= 6 },
  { title: '以后', test: (d: number) => d >= 7 },
];

export default function HomeworkScreen() {
  const { theme } = useTheme();
  const { homework } = useStore();
  const insets = useSafeAreaInsets();
  const [showDone, setShowDone] = useState(false);

  const pending = useMemo(
    () => homework.filter((h) => !h.done).sort((a, b) => a.due.getTime() - b.due.getTime()),
    [homework],
  );
  const done = homework.filter((h) => h.done);
  const next = pending[0];

  return (
    <TabScreen index={0}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={styles.header}>
          <View>
            <Txt variant="caption" tone="sub">
              {formatToday()}
            </Txt>
            <Txt variant="display" style={{ marginTop: 4 }}>
              {greeting[phaseAt(new Date())]}
            </Txt>
          </View>
          <Press onPress={() => router.push('/upload')} style={[styles.add, { borderColor: theme.line }]}>
            <Ionicons name="add" size={22} color={theme.text} />
          </Press>
        </View>

        <Txt variant="sub" tone="sub" style={{ marginTop: 10 }}>
          {next ? (
            <>
              还有 {pending.length} 项待完成，最近的在
              <Txt variant="sub" tone={isUrgent(next.due) ? 'urgent' : 'text'} style={{ fontWeight: '600' }}>
                {' '}
                {formatDue(next.due)}
              </Txt>
            </>
          ) : (
            '全部完成了'
          )}
        </Txt>

        {pending.length === 0 && (
          <Card style={{ marginTop: 22, padding: 28, alignItems: 'center' }}>
            <Txt variant="title">没有待完成的作业</Txt>
            <Txt variant="sub" tone="sub" style={{ marginTop: 8 }}>
              好好休息一下吧
            </Txt>
          </Card>
        )}

        {groups.map((g) => {
          const items = pending.filter((h) => g.test(dayDiff(h.due)));
          if (items.length === 0) return null;
          return (
            <Section key={g.title} title={g.title}>
              <HomeworkList items={items} />
            </Section>
          );
        })}

        {done.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <DoneToggle count={done.length} open={showDone} onPress={() => setShowDone((v) => !v)} />
            {showDone && <HomeworkList items={done} />}
          </View>
        )}
      </ScrollView>
    </TabScreen>
  );
}

// "已完成 N 项"：数字变多时跳一下、闪一下强调色，让人看到作业归档到了这里
function DoneToggle({ count, open, onPress }: { count: number; open: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const pop = useRef(new Animated.Value(1)).current;
  const prev = useRef(count);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (count > prev.current) {
      setFlash(true);
      pop.setValue(1.25);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: Platform.OS !== 'web' }).start();
      const id = setTimeout(() => setFlash(false), 700);
      prev.current = count;
      return () => clearTimeout(id);
    }
    prev.current = count;
  }, [count, pop]);

  return (
    <Press onPress={onPress} style={styles.doneToggle}>
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Txt variant="caption" tone={flash ? 'accent' : 'sub'} style={flash && { fontWeight: '700' }}>
          已完成 {count} 项
        </Txt>
      </Animated.View>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={theme.sub} />
    </Press>
  );
}

function HomeworkList({ items }: { items: Homework[] }) {
  return (
    <Card>
      {items.map((h, i) => (
        <HomeworkRow key={h.id} item={h} last={i === items.length - 1} />
      ))}
    </Card>
  );
}

// 完成一项作业：小圈打勾 → 标题划线 → 这一行收起归档 → 提示可以撤销
function HomeworkRow({ item, last }: { item: Homework; last: boolean }) {
  const { theme } = useTheme();
  const { courseById, toggleDone } = useStore();
  const toast = useToast();
  const course = courseById(item.courseId);
  const urgent = !item.done && isUrgent(item.due);

  const [completing, setCompleting] = useState(false);
  const [rowH, setRowH] = useState(0);
  const [titleW, setTitleW] = useState(0);
  const check = useRef(new Animated.Value(item.done ? 1 : 0)).current;
  const strike = useRef(new Animated.Value(0)).current;
  const collapse = useRef(new Animated.Value(1)).current;

  function complete() {
    if (completing) return;
    if (item.done) {
      haptic.select();
      toggleDone(item.id);
      return;
    }
    haptic.light();
    setCompleting(true);
    Animated.sequence([
      Animated.timing(check, { toValue: 1, duration: 260, easing: Easing.back(2), useNativeDriver: false }),
      Animated.timing(strike, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.delay(320),
      Animated.timing(collapse, { toValue: 0, duration: 280, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
    ]).start(() => {
      haptic.success();
      toggleDone(item.id);
      toast(`「${item.title}」已完成`, { label: '撤销', onPress: () => toggleDone(item.id) });
    });
  }

  const checkInk = theme.dark ? '#16161a' : '#ffffff';

  return (
    <Animated.View
      onLayout={(e) => !completing && setRowH(e.nativeEvent.layout.height)}
      style={completing && rowH ? { height: collapse.interpolate({ inputRange: [0, 1], outputRange: [0, rowH] }), opacity: collapse, overflow: 'hidden' } : undefined}>
      <Press
        onPress={() => router.push(`/homework/${item.id}`)}
        style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line }]}>
        <Press onPress={complete} hitSlop={10} style={{ paddingRight: 12 }}>
          <View style={[styles.check, { borderColor: item.done || completing ? theme.accent : theme.faint }]}>
            <Animated.View
              style={[styles.checkFill, { backgroundColor: theme.accent, opacity: check, transform: [{ scale: check }] }]}
            />
            <Animated.View style={{ opacity: check.interpolate({ inputRange: [0.4, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }}>
              <Ionicons name="checkmark" size={13} color={checkInk} />
            </Animated.View>
          </View>
        </Press>
        <View style={{ flex: 1 }}>
          <Animated.View
            onLayout={(e) => setTitleW(e.nativeEvent.layout.width)}
            style={{ alignSelf: 'flex-start', maxWidth: '100%', opacity: strike.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }}>
            <Txt
              numberOfLines={1}
              tone={item.done ? 'sub' : 'text'}
              style={item.done && { textDecorationLine: 'line-through' }}>
              {item.title}
            </Txt>
            <Animated.View
              style={[
                styles.strike,
                { backgroundColor: theme.text, width: strike.interpolate({ inputRange: [0, 1], outputRange: [0, titleW] }) },
              ]}
            />
          </Animated.View>
          <Txt variant="caption" tone="sub" numberOfLines={1} style={{ marginTop: 3 }}>
            {course?.name} ·{' '}
            <Txt variant="caption" tone={urgent ? 'urgent' : 'sub'} style={urgent && { fontWeight: '700' }}>
              {formatDue(item.due)} 截止
            </Txt>
          </Txt>
        </View>
        <View style={styles.meta}>
          {item.reminders && !item.done && (
            <Ionicons name="notifications" size={12} color={theme.accent} style={{ marginRight: 8 }} />
          )}
          <Ionicons name="checkmark-done" size={13} color={theme.faint} />
          <Txt variant="caption" tone="faint" style={{ marginLeft: 3 }}>
            {item.reactions.confirm}
          </Txt>
        </View>
      </Press>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  add: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkFill: { position: 'absolute', top: -1.5, left: -1.5, width: 22, height: 22, borderRadius: 11 },
  strike: { position: 'absolute', left: 0, top: '52%', height: 1.5, borderRadius: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  doneToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10, marginLeft: 4 },
});
