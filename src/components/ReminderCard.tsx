import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptic } from '@/components/haptic';
import { Card, Chip, Press, Txt } from '@/components/ui';
import { dayDiff, formatDue, isoWeekday, weekdayNames } from '@/data/format';
import { useStore } from '@/data/store';
import { Homework, Reminder } from '@/data/types';
import { useTheme } from '@/theme/useTheme';

// 和"我的 → 提醒"里的默认设置一致
export const DEFAULT_REMINDERS: Reminder[] = [
  { kind: 'before', minutes: 1440 },
  { kind: 'before', minutes: 180 },
];

const presets = [
  { minutes: 1440, label: '前 1 天' },
  { minutes: 180, label: '前 3 小时' },
  { minutes: 60, label: '前 1 小时' },
  { minutes: 30, label: '前 30 分钟' },
];
const customTimes = ['08:00', '12:00', '18:00', '21:00', '23:00'];

export const reminderAt = (r: Reminder, due: Date) =>
  r.kind === 'at' ? r.at : new Date(due.getTime() - r.minutes * 60000);

function atTime(dayOffset: number, time: string) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

// 作业详情里的"提醒我"：常用的几个点选，也能加一个具体时间
export function ReminderCard({ item }: { item: Homework }) {
  const { theme } = useTheme();
  const { setReminders } = useStore();
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState(0);
  const [time, setTime] = useState('21:00');

  const now = Date.now();
  const custom = item.reminders !== undefined;
  const list = item.reminders ?? DEFAULT_REMINDERS;
  const hasBefore = (m: number) => list.some((r) => r.kind === 'before' && r.minutes === m);
  const customAts = list
    .filter((r): r is Extract<Reminder, { kind: 'at' }> => r.kind === 'at')
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const upcoming = list
    .map((r) => reminderAt(r, item.due))
    .filter((d) => d.getTime() > now)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const lastDay = Math.max(0, Math.min(6, dayDiff(item.due)));
  const days = Array.from({ length: lastDay + 1 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return { offset: i, label: i === 0 ? '今天' : i === 1 ? '明天' : weekdayNames[isoWeekday(d)] };
  });
  const validAt = (d: number, t: string) => {
    const at = atTime(d, t).getTime();
    return at > now && at < item.due.getTime();
  };
  const timeOk = (t: string) => validAt(day, t);

  // 打开时直接选中第一个还来得及的日期和时间，深夜打开不会一片灰
  function openPicker() {
    const firstDay = days.find((d) => customTimes.some((t) => validAt(d.offset, t)));
    if (!firstDay) return;
    const preferred = validAt(firstDay.offset, '21:00') ? '21:00' : customTimes.find((t) => validAt(firstDay.offset, t))!;
    setDay(firstDay.offset);
    setTime(preferred);
    setPicking(true);
  }

  function togglePreset(minutes: number) {
    haptic.select();
    const next = hasBefore(minutes)
      ? list.filter((r) => !(r.kind === 'before' && r.minutes === minutes))
      : [...list, { kind: 'before' as const, minutes }];
    setReminders(item.id, next);
  }

  function removeAt(at: Date) {
    haptic.select();
    setReminders(
      item.id,
      list.filter((r) => !(r.kind === 'at' && r.at.getTime() === at.getTime())),
    );
  }

  function addCustom() {
    const at = atTime(day, time);
    if (!timeOk(time)) return;
    haptic.light();
    if (!customAts.some((r) => r.at.getTime() === at.getTime())) {
      setReminders(item.id, [...list, { kind: 'at', at }]);
    }
    setPicking(false);
  }

  return (
    <Card style={{ marginTop: 14, padding: 16 }}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="notifications-outline" size={16} color={theme.sub} />
          <Txt variant="sub" tone="sub" style={{ marginLeft: 8 }}>
            提醒我
          </Txt>
        </View>
        {custom && (
          <Press onPress={() => setReminders(item.id, undefined)} hitSlop={8}>
            <Txt variant="caption" tone="accent">
              恢复默认
            </Txt>
          </Press>
        )}
      </View>

      <View style={styles.chips}>
        {presets.map((p) => {
          const passed = reminderAt({ kind: 'before', minutes: p.minutes }, item.due).getTime() <= now;
          if (passed) {
            return (
              <View key={p.minutes} style={[styles.passed, { borderColor: theme.line }]}>
                <Txt variant="sub" tone="faint">
                  {p.label} · 已过
                </Txt>
              </View>
            );
          }
          return <Chip key={p.minutes} label={p.label} active={hasBefore(p.minutes)} onPress={() => togglePreset(p.minutes)} />;
        })}
        {customAts.map((r) => (
          <Press
            key={r.at.getTime()}
            onPress={() => removeAt(r.at)}
            style={[styles.customChip, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
            <Txt variant="sub" tone="accent" style={{ fontWeight: '600' }}>
              {formatDue(r.at)}
            </Txt>
            <Ionicons name="close" size={13} color={theme.accent} style={{ marginLeft: 4 }} />
          </Press>
        ))}
        {!picking && (
          <Press onPress={openPicker} style={[styles.addChip, { borderColor: theme.line }]}>
            <Ionicons name="add" size={14} color={theme.sub} />
            <Txt variant="sub" tone="sub" style={{ marginLeft: 2 }}>
              自定义时间
            </Txt>
          </Press>
        )}
      </View>

      {picking && (
        <View style={[styles.picker, { borderTopColor: theme.line }]}>
          <View style={styles.chips}>
            {days.map((d) => (
              <Chip
                key={d.offset}
                label={d.label}
                active={day === d.offset}
                onPress={() => {
                  setDay(d.offset);
                  if (!validAt(d.offset, time)) {
                    const t = customTimes.find((x) => validAt(d.offset, x));
                    if (t) setTime(t);
                  }
                }}
              />
            ))}
          </View>
          <View style={styles.chips}>
            {customTimes.map((t) =>
              timeOk(t) ? (
                <Chip key={t} label={t} active={time === t} onPress={() => setTime(t)} />
              ) : (
                <View key={t} style={[styles.passed, { borderColor: theme.line }]}>
                  <Txt variant="sub" tone="faint">
                    {t}
                  </Txt>
                </View>
              ),
            )}
          </View>
          <View style={styles.pickerActions}>
            <Press onPress={() => setPicking(false)} hitSlop={8}>
              <Txt variant="sub" tone="sub">
                取消
              </Txt>
            </Press>
            <Press
              onPress={addCustom}
              style={[styles.addButton, { backgroundColor: timeOk(time) ? theme.text : theme.line }]}>
              <Txt variant="label" style={{ color: timeOk(time) ? theme.onText : theme.faint }}>
                添加
              </Txt>
            </Press>
          </View>
        </View>
      )}

      <Txt variant="caption" tone="faint" style={{ marginTop: 12 }}>
        {upcoming ? `下一次提醒：${formatDue(upcoming)}` : '没有待发的提醒'}
        {custom ? '' : ' · 跟随默认设置'}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  passed: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed' },
  customChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  addChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed' },
  picker: { marginTop: 14, paddingTop: 2, borderTopWidth: StyleSheet.hairlineWidth },
  pickerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 18, marginTop: 14 },
  addButton: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
});
