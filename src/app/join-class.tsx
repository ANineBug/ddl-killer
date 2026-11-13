import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { RemoteClass } from '@/api/types';
import { haptic } from '@/components/haptic';
import { useToast } from '@/components/Toast';
import { Card, closeModal, Field, ModalScreen, Press, Txt } from '@/components/ui';
import { formatSession, formatWeeks } from '@/data/format';
import { errorText, useOnline } from '@/data/online';
import { guessTerm, weeksToRanges } from '@/data/remote';
import { useStore } from '@/data/store';
import type { Weekday } from '@/data/types';
import { useTheme } from '@/theme/useTheme';

// 手动加课 = 搜索已有的教学班加入。教学班只能由教务导入建出来，这里不能新建
export default function JoinClass() {
  const { theme } = useTheme();
  const { courses, timetable } = useStore();
  const online = useOnline();
  const toast = useToast();
  const term = timetable.term ?? guessTerm();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<RemoteClass[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState<number | null>(null);
  const seq = useRef(0);

  // 停止输入 300 毫秒后再搜；只认最后一次的结果，免得慢的旧请求盖掉新的
  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setResults(null);
      setError('');
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(() => {
      setLoading(true);
      online
        .search(term, text)
        .then((r) => n === seq.current && (setResults(r.classes), setError('')))
        .catch((e) => n === seq.current && setError(errorText(e)))
        .finally(() => n === seq.current && setLoading(false));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, term]);

  async function join(c: RemoteClass) {
    if (joining) return;
    setJoining(c.id);
    setError('');
    try {
      await online.join(c);
      haptic.success();
      closeModal();
      toast(online.loggedIn ? `已加入「${c.name}」` : `已把「${c.name}」加进课表。登录后才算正式加入，才能上传和确认`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setJoining(null);
    }
  }

  const joined = new Set(courses.map((c) => c.serverClassId).filter(Boolean));

  return (
    <ModalScreen title="加入教学班">
      <Txt variant="sub" tone="sub" style={{ lineHeight: 21 }}>
        搜课名或老师，加入已经有的教学班。教学班是同学们从教务导入课表时建出来的，搜不到说明班里还没人导入过。
      </Txt>
      <Field label={term} placeholder="比如：概率论、乙老师" value={q} onChangeText={setQ} autoFocus autoCorrect={false} />

      {loading && <ActivityIndicator style={{ marginTop: 20 }} color={theme.sub} />}
      {error ? (
        <Txt variant="caption" tone="urgent" style={{ marginTop: 14, marginLeft: 4 }}>
          {error}
        </Txt>
      ) : null}

      {results && !loading && results.length === 0 && (
        <View style={{ marginTop: 22, alignItems: 'center' }}>
          <Txt tone="sub">没有找到这门课</Txt>
          <Press onPress={() => router.replace('/import/swufe')} style={{ marginTop: 10 }}>
            <Txt variant="caption" tone="accent">
              从教务导入我的课表 ›
            </Txt>
          </Press>
        </View>
      )}

      {results && results.length > 0 && (
        <Card style={{ marginTop: 18 }}>
          {results.map((c, i) => {
            const mine = joined.has(c.id);
            return (
              <View key={c.id} style={[styles.row, i < results.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line }]}>
                <View style={{ flex: 1 }}>
                  <Txt numberOfLines={1}>{c.name}</Txt>
                  <Txt variant="caption" tone="sub" style={{ marginTop: 3 }}>
                    {[c.teacher || '老师未填写', `${c.members} 人`].join(' · ')}
                  </Txt>
                  {c.slots.map((s, k) => (
                    <Txt key={k} variant="caption" tone="faint" style={{ marginTop: 2 }} numberOfLines={1}>
                      {formatSession({ weekday: s.weekday as Weekday, from: s.from, to: s.to, location: s.room })} · {s.room || '地点未定'} · {formatWeeks(weeksToRanges(s.weeks))}
                    </Txt>
                  ))}
                </View>
                {mine ? (
                  <View style={styles.done}>
                    <Ionicons name="checkmark" size={14} color={theme.faint} />
                    <Txt variant="caption" tone="faint">
                      已在课表
                    </Txt>
                  </View>
                ) : (
                  <Press onPress={() => join(c)} style={[styles.join, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
                    {joining === c.id ? (
                      <ActivityIndicator size="small" color={theme.accent} />
                    ) : (
                      <Txt variant="sub" tone="accent" style={{ fontWeight: '600' }}>
                        加入
                      </Txt>
                    )}
                  </Press>
                )}
              </View>
            );
          })}
        </Card>
      )}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  join: { minWidth: 64, height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  done: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
