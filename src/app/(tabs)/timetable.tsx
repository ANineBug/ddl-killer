import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press, Txt } from '@/components/ui';
import { currentWeek, isoWeekday } from '@/data/format';
import { useStore } from '@/data/store';
import { Course } from '@/data/types';
import { useTheme } from '@/theme/useTheme';
import { withAlpha } from '@/theme/tokens';

const DAYS = ['一', '二', '三', '四', '五'];
const PERIODS = 12;
const ROW = 46;
const TIME_COL = 22;
const PAD = 20;

function inWeek(c: Course, week: number) {
  const { from, to, rule } = c.weeks;
  if (week < from || week > to) return false;
  if (rule === 'odd') return week % 2 === 1;
  if (rule === 'even') return week % 2 === 0;
  return true;
}

export default function TimetableScreen() {
  const { theme } = useTheme();
  const { courses } = useStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [week, setWeek] = useState(currentWeek());

  const colW = (Math.min(width, 520) - PAD * 2 - TIME_COL) / DAYS.length;
  const today = isoWeekday(new Date());
  const visible = courses.filter((c) => inWeek(c, week));

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: PAD, paddingBottom: 130 }}>
      <View style={styles.header}>
        <View>
          <Txt variant="caption" tone="sub">
            {week === currentWeek() ? '本周' : week < currentWeek() ? '已经过去' : '提前看看'}
          </Txt>
          <Txt variant="display" style={{ marginTop: 4 }}>
            课表
          </Txt>
        </View>
        <Press onPress={() => router.push('/add-course')} style={[styles.round, { borderColor: theme.line }]}>
          <Ionicons name="add" size={22} color={theme.text} />
        </Press>
      </View>

      <View style={styles.weekRow}>
        <Press onPress={() => setWeek((w) => Math.max(1, w - 1))} hitSlop={10}>
          <Ionicons name="chevron-back" size={18} color={theme.sub} />
        </Press>
        <Txt variant="label" style={{ marginHorizontal: 14 }}>
          第 {week} 周
        </Txt>
        <Press onPress={() => setWeek((w) => Math.min(20, w + 1))} hitSlop={10}>
          <Ionicons name="chevron-forward" size={18} color={theme.sub} />
        </Press>
      </View>

      <View style={{ flexDirection: 'row', marginLeft: TIME_COL, marginBottom: 6 }}>
        {DAYS.map((d, i) => {
          const isToday = week === currentWeek() && today === i + 1;
          return (
            <View key={d} style={{ width: colW, alignItems: 'center' }}>
              <View style={[styles.dayPill, isToday && { backgroundColor: theme.accentSoft }]}>
                <Txt variant="caption" tone={isToday ? 'accent' : 'sub'} style={isToday && { fontWeight: '700' }}>
                  周{d}
                </Txt>
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ height: PERIODS * ROW }}>
        {Array.from({ length: PERIODS }, (_, i) => (
          <View key={i} style={[styles.periodRow, { top: i * ROW, height: ROW, borderTopColor: theme.line }]}>
            <Txt variant="caption" tone="faint" style={{ width: TIME_COL }}>
              {i + 1}
            </Txt>
          </View>
        ))}

        {visible.flatMap((c) =>
          c.sessions
            .filter((s) => s.weekday <= DAYS.length)
            .map((s) => {
              const hue = theme.courseHues[c.hue % theme.courseHues.length];
              return (
                <Press
                  key={`${c.id}-${s.weekday}-${s.from}`}
                  onPress={() => router.push(`/course/${c.id}`)}
                  style={[
                    styles.block,
                    {
                      left: TIME_COL + (s.weekday - 1) * colW + 2,
                      top: (s.from - 1) * ROW + 2,
                      width: colW - 4,
                      height: (s.to - s.from + 1) * ROW - 4,
                      backgroundColor: withAlpha(hue, theme.dark ? 0.26 : 0.2),
                      borderLeftColor: hue,
                    },
                  ]}>
                  <Txt style={{ fontSize: 11.5, fontWeight: '600', lineHeight: 15 }} numberOfLines={3}>
                    {c.name}
                  </Txt>
                  <Txt variant="caption" tone="sub" style={{ fontSize: 10, marginTop: 3 }} numberOfLines={2}>
                    {s.location}
                  </Txt>
                </Press>
              );
            }),
        )}
      </View>

      <Txt variant="caption" tone="faint" style={{ marginTop: 18, textAlign: 'center' }}>
        课表导入还在研究中，目前请点右上角手动添加
      </Txt>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  round: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 14 },
  dayPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  periodRow: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
  block: { position: 'absolute', borderRadius: 8, borderLeftWidth: 3, paddingHorizontal: 5, paddingVertical: 5, overflow: 'hidden' },
});
