import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Press, Section, Txt } from '@/components/ui';
import { dayDiff, formatDue, formatToday, isUrgent } from '@/data/format';
import { useStore } from '@/data/store';
import { Homework } from '@/data/types';
import { useTheme } from '@/theme/useTheme';
import { greeting, phaseAt } from '@/theme/tokens';

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
          <Press onPress={() => setShowDone((v) => !v)} style={styles.doneToggle}>
            <Txt variant="caption" tone="sub">
              已完成 {done.length} 项
            </Txt>
            <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={14} color={theme.sub} />
          </Press>
          {showDone && <HomeworkList items={done} />}
        </View>
      )}
    </ScrollView>
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

function HomeworkRow({ item, last }: { item: Homework; last: boolean }) {
  const { theme } = useTheme();
  const { courseById, toggleDone } = useStore();
  const course = courseById(item.courseId);
  const urgent = !item.done && isUrgent(item.due);

  return (
    <Press
      onPress={() => router.push(`/homework/${item.id}`)}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line }]}>
      <Press onPress={() => toggleDone(item.id)} hitSlop={10} style={{ paddingRight: 12 }}>
        <View
          style={[
            styles.check,
            { borderColor: item.done ? theme.accent : theme.faint, backgroundColor: item.done ? theme.accent : 'transparent' },
          ]}>
          {item.done && <Ionicons name="checkmark" size={13} color={theme.dark ? '#16161a' : '#ffffff'} />}
        </View>
      </Press>
      <View style={{ flex: 1 }}>
        <Txt
          numberOfLines={1}
          tone={item.done ? 'sub' : 'text'}
          style={item.done && { textDecorationLine: 'line-through' }}>
          {item.title}
        </Txt>
        <Txt variant="caption" tone="sub" numberOfLines={1} style={{ marginTop: 3 }}>
          {course?.name} ·{' '}
          <Txt variant="caption" tone={urgent ? 'urgent' : 'sub'} style={urgent && { fontWeight: '700' }}>
            {formatDue(item.due)} 截止
          </Txt>
        </Txt>
      </View>
      <View style={styles.meta}>
        <Ionicons name="checkmark-done" size={13} color={theme.faint} />
        <Txt variant="caption" tone="faint" style={{ marginLeft: 3 }}>
          {item.reactions.confirm}
        </Txt>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  add: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  doneToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10, marginLeft: 4 },
});
