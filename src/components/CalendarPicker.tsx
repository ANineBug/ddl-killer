import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptic } from '@/components/haptic';
import { Press, Txt } from '@/components/ui';
import { dayDiff } from '@/data/format';
import { useTheme } from '@/theme/useTheme';

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// 小月历：左右翻月，点哪天选哪天；今天圈出来，选不了的日子置灰。
// 默认只能选今天以后（交作业用）；allowPast 打开后能往前翻，only 可以再限定哪些日子能点（比如只能点周一）
export function CalendarPicker({ value, onChange, allowPast, only, initialMonth }: {
  value: Date | null;
  // 还没选的时候先翻到哪个月，不给就是这个月
  initialMonth?: Date;
  onChange: (date: Date) => void;
  allowPast?: boolean;
  only?: (date: Date) => boolean;
}) {
  const { theme } = useTheme();
  const today = new Date();
  const [month, setMonth] = useState(() => {
    const at = value ?? initialMonth ?? today;
    return new Date(at.getFullYear(), at.getMonth(), 1);
  });

  const isCurrentMonth = !allowPast && month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  // 周一开头：算出这个月 1 号前面要空几格
  const lead = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];

  function shift(delta: number) {
    haptic.select();
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  return (
    <View style={[styles.box, { borderColor: theme.line, backgroundColor: theme.card }]}>
      <View style={styles.header}>
        <Press onPress={() => !isCurrentMonth && shift(-1)} hitSlop={10} style={{ opacity: isCurrentMonth ? 0.25 : 1 }}>
          <Ionicons name="chevron-back" size={18} color={theme.sub} />
        </Press>
        <Txt variant="label">
          {month.getFullYear()} 年 {month.getMonth() + 1} 月
        </Txt>
        <Press onPress={() => shift(1)} hitSlop={10}>
          <Ionicons name="chevron-forward" size={18} color={theme.sub} />
        </Press>
      </View>

      <View style={styles.grid}>
        {WEEK.map((w) => (
          <View key={w} style={styles.cell}>
            <Txt variant="caption" tone="faint">
              {w}
            </Txt>
          </View>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={`blank-${i}`} style={styles.cell} />;
          const past = (!allowPast && dayDiff(d, today) < 0) || (only ? !only(d) : false);
          const selected = !!value && sameDay(d, value);
          const isToday = sameDay(d, today);
          return (
            <View key={d.getDate()} style={styles.cell}>
              <Press
                onPress={() => {
                  if (past) return;
                  haptic.select();
                  onChange(d);
                }}
                style={[
                  styles.day,
                  selected && { backgroundColor: theme.accent },
                  !selected && isToday && { borderWidth: 1, borderColor: theme.accent },
                ]}>
                <Txt
                  variant="sub"
                  tone={past ? 'faint' : isToday && !selected ? 'accent' : 'text'}
                  style={[selected && { color: theme.onText, fontWeight: '700' }]}>
                  {d.getDate()}
                </Txt>
              </Press>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 38, alignItems: 'center', justifyContent: 'center' },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
