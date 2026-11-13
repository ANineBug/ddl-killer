import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Card, ModalScreen, Txt } from '@/components/ui';
import { validTime } from '@/data/periods';
import { useStore } from '@/data/store';
import { useTheme } from '@/theme/useTheme';

const PERIODS = Array.from({ length: 12 }, (_, i) => i + 1);

// "8:20" "820" "0820" 都认成 08:20；认不出来返回 null
function normalize(raw: string): string | null {
  const t = raw.trim().replace('：', ':');
  if (!t) return '';
  const m = /^(\d{1,2}):?(\d{2})$/.exec(t);
  if (!m) return null;
  const v = `${m[1].padStart(2, '0')}:${m[2]}`;
  return validTime(v) ? v : null;
}

// 每节课几点上课：自己填，选填。只用来算上传作业时「下次课前」的提醒时间
export default function ClassTimes() {
  const { theme } = useTheme();
  const { settings, setSettings } = useStore();
  const saved = settings.periodTimes ?? {};
  const [draft, setDraft] = useState<Record<number, string>>(() => ({ ...saved }));
  const [bad, setBad] = useState<number | null>(null);

  function commit(p: number) {
    const v = normalize(draft[p] ?? '');
    if (v === null) {
      setBad(p);
      return;
    }
    setBad(null);
    const next = { ...(settings.periodTimes ?? {}) };
    if (v) next[p] = v;
    else delete next[p];
    setDraft((d) => ({ ...d, [p]: v }));
    setSettings({ periodTimes: next });
  }

  return (
    <ModalScreen title="每节课几点上课">
      <Txt variant="sub" tone="sub" style={{ lineHeight: 21 }}>
        选填。只用在一个地方：上传作业选「下次课前」时，按这里的时间提醒。没填的那一节，按当天早上 7 点提醒。
      </Txt>
      <Card style={{ marginTop: 18 }}>
        {PERIODS.map((p, i) => (
          <View key={p} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }]}>
            <Txt variant="sub" style={{ flex: 1 }}>
              第 {p} 节
            </Txt>
            <TextInput
              value={draft[p] ?? ''}
              onChangeText={(v) => setDraft((d) => ({ ...d, [p]: v }))}
              onBlur={() => commit(p)}
              onSubmitEditing={() => commit(p)}
              placeholder="比如 08:20"
              placeholderTextColor={theme.faint}
              maxLength={5}
              keyboardType="numbers-and-punctuation"
              style={[styles.input, { color: theme.text, borderColor: bad === p ? theme.urgent : theme.line }]}
            />
          </View>
        ))}
      </Card>
      {bad !== null && (
        <Txt variant="caption" tone="urgent" style={{ marginTop: 10, marginLeft: 4 }}>
          第 {bad} 节的时间写成 08:20 这样
        </Txt>
      )}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  input: { width: 96, height: 36, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, textAlign: 'center', fontSize: 15 },
});
