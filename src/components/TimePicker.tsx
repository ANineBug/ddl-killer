import { StyleSheet, View } from 'react-native';

import { haptic } from '@/components/haptic';
import { Press, Txt } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 10, 15, 20, 30, 40, 45, 50, 59];

const pad = (n: number) => String(n).padStart(2, '0');

// 小时间盘：上面选小时（0–23 点，6 个一行），下面选分钟。和月历用同一种外框
export function TimePicker({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const { theme } = useTheme();
  const [h, m] = value.split(':').map(Number);

  function pick(hour: number, minute: number) {
    haptic.select();
    onChange(`${pad(hour)}:${pad(minute)}`);
  }

  return (
    <View style={[styles.box, { borderColor: theme.line, backgroundColor: theme.card }]}>
      <Txt variant="caption" tone="faint" style={styles.label}>
        时
      </Txt>
      <View style={styles.grid}>
        {HOURS.map((hour) => (
          <Cell key={hour} text={pad(hour)} selected={hour === h} onPress={() => pick(hour, m)} width={`${100 / 6}%`} />
        ))}
      </View>

      <View style={[styles.divider, { backgroundColor: theme.line }]} />

      <Txt variant="caption" tone="faint" style={styles.label}>
        分
      </Txt>
      <View style={styles.grid}>
        {MINUTES.map((minute) => (
          <Cell key={minute} text={pad(minute)} selected={minute === m} onPress={() => pick(h, minute)} width={`${100 / 6}%`} />
        ))}
      </View>
    </View>
  );
}

function Cell({ text, selected, onPress, width }: { text: string; selected: boolean; onPress: () => void; width: `${number}%` }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.cell, { width }]}>
      <Press onPress={onPress} style={[styles.pill, selected && { backgroundColor: theme.accent }]}>
        <Txt variant="sub" tone="text" style={[{ fontVariant: ['tabular-nums'] }, selected && { color: theme.onText, fontWeight: '700' }]}>
          {text}
        </Txt>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  label: { marginLeft: 6, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { height: 38, alignItems: 'center', justifyContent: 'center' },
  pill: { width: 44, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10, marginHorizontal: 4 },
});
