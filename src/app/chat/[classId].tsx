import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatMessage } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { haptic } from '@/components/haptic';
import { useToast } from '@/components/Toast';
import { Backdrop, closeModal, Press, Txt } from '@/components/ui';
import { formatDue, hhmm, isTbd } from '@/data/format';
import { errorText, useOnline } from '@/data/online';
import { localHomeworkId } from '@/data/remote';
import { useStore } from '@/data/store';
import { useTheme } from '@/theme/useTheme';

// 班级聊天室：只有文字，可以带一张作业卡片。每 4 秒拉一次新消息
export default function Chat() {
  const { classId, share } = useLocalSearchParams<{ classId: string; share?: string }>();
  const id = Number(classId);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { courses, homework } = useStore();
  const online = useOnline();
  const toast = useToast();
  const course = courses.find((c) => c.serverClassId === id);
  const [list, setList] = useState<ChatMessage[]>([]);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sharing, setSharing] = useState<number | null>(share ? Number(share) : null);
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const last = useRef(0);
  const me = online.account?.user.id;

  function append(items: ChatMessage[]) {
    if (!items.length) return;
    last.current = items[items.length - 1].id;
    setList((old) => [...old, ...items.filter((m) => !old.some((x) => x.id === m.id))]);
  }

  useEffect(() => {
    if (!online.loggedIn) return;
    let alive = true;
    online
      .messages(id)
      .then((m) => alive && append(m))
      .catch((e) => alive && setError(errorText(e)));
    const timer = setInterval(() => {
      online
        .messages(id, last.current)
        .then((m) => alive && append(m))
        .catch(() => {});
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, online.loggedIn]);

  async function sendNow() {
    const body = text.trim();
    if (busy || (!body && !sharing)) return;
    setBusy(true);
    try {
      const m = await online.send(id, body, sharing ?? undefined);
      haptic.light();
      append([m]);
      setText('');
      setSharing(null);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const shared = sharing ? homework.find((h) => h.id === localHomeworkId(sharing)) : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: theme.line }]}>
        <Press onPress={closeModal} hitSlop={12} style={styles.icon}>
          <Ionicons name="close" size={22} color={theme.sub} />
        </Press>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Txt variant="label" numberOfLines={1}>
            {course?.name ?? '班级聊天'}
          </Txt>
          <Txt variant="caption" tone="faint">
            只有这个教学班的同学能看到
          </Txt>
        </View>
        <Press onPress={() => router.push(`/board?classId=${id}`)} hitSlop={12} style={styles.icon}>
          <Ionicons name="podium-outline" size={20} color={theme.sub} />
        </Press>
      </View>

      {!online.loggedIn ? (
        <View style={styles.center}>
          <Txt tone="sub">登录后才能看和发消息</Txt>
          <Press onPress={() => router.push('/login')} style={{ marginTop: 10 }}>
            <Txt tone="accent">去登录 ›</Txt>
          </Press>
        </View>
      ) : (
        <ScrollView
          ref={scroll}
          contentContainerStyle={{ padding: 16, gap: 14 }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled">
          {error ? (
            <Txt variant="caption" tone="urgent" style={{ textAlign: 'center' }}>
              {error}
            </Txt>
          ) : list.length === 0 ? (
            <Txt variant="caption" tone="faint" style={{ textAlign: 'center', marginTop: 40 }}>
              还没有人说话，问问作业的事吧
            </Txt>
          ) : null}
          {list.map((m) => (
            <Bubble key={m.id} m={m} mine={m.user.id === me} />
          ))}
        </ScrollView>
      )}

      {online.loggedIn && !error && (
        <View style={[styles.composer, { paddingBottom: insets.bottom + 10, borderTopColor: theme.line, backgroundColor: theme.surface }]}>
          {sharing && (
            <View style={[styles.sharing, { borderColor: theme.line }]}>
              <Ionicons name="document-text-outline" size={14} color={theme.sub} />
              <Txt variant="caption" tone="sub" numberOfLines={1} style={{ flex: 1 }}>
                分享作业：{shared?.title ?? `第 ${sharing} 条`}
              </Txt>
              <Press onPress={() => setSharing(null)} hitSlop={8}>
                <Ionicons name="close" size={14} color={theme.faint} />
              </Press>
            </View>
          )}
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="说点什么…"
              placeholderTextColor={theme.faint}
              maxLength={500}
              multiline
              style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.line }]}
            />
            <Press
              onPress={sendNow}
              disabled={busy || (!text.trim() && !sharing)}
              style={[styles.send, { backgroundColor: theme.text, opacity: busy || (!text.trim() && !sharing) ? 0.3 : 1 }]}>
              <Ionicons name="arrow-up" size={18} color={theme.onText} />
            </Press>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, mine }: { m: ChatMessage; mine: boolean }) {
  const { theme } = useTheme();
  const { homework } = useStore();
  const online = useOnline();
  const local = m.homework ? homework.find((h) => h.id === localHomeworkId(m.homework!.id)) : undefined;
  const due = m.homework?.due ? new Date(m.homework.due) : null;
  return (
    <View style={[styles.msg, mine && { flexDirection: 'row-reverse' }]}>
      {!mine && <Avatar user={m.user} size={30} />}
      <View style={{ maxWidth: '78%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {!mine && (
          <Txt variant="caption" tone="faint" style={{ marginBottom: 3 }}>
            {m.user.nickname} · {m.user.tierName}
          </Txt>
        )}
        <View style={[styles.bubble, { backgroundColor: mine ? theme.accentSoft : theme.card, borderColor: mine ? 'transparent' : theme.cardEdge }]}>
          {m.text ? <Txt style={{ lineHeight: 21 }}>{m.text}</Txt> : null}
          {m.homework && (
            <Press
              onPress={() => local && router.push(`/homework/${local.id}`)}
              style={[styles.card, { borderColor: theme.line, marginTop: m.text ? 8 : 0 }]}>
              <Txt variant="sub" numberOfLines={1} style={{ fontWeight: '600' }}>
                {m.homework.title}
              </Txt>
              <Txt variant="caption" tone="sub" style={{ marginTop: 2 }}>
                {!due || isTbd(due) ? '截止待定' : `${formatDue(due)} 截止`}
              </Txt>
              {/* 在聊天里发现作业写错了，直接从这里提修改 */}
              {local && online.loggedIn && (
                <Press onPress={() => router.push(`/report?id=${local.id}`)} hitSlop={6} style={{ marginTop: 6 }}>
                  <Txt variant="caption" tone="accent">
                    发起纠错 ›
                  </Txt>
                </Press>
              )}
            </Press>
          )}
        </View>
        <Txt variant="caption" tone="faint" style={{ marginTop: 3, fontSize: 10 }}>
          {hhmm(new Date(m.createdAt))}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  msg: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bubble: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 9 },
  card: { borderWidth: 1, borderRadius: 12, padding: 10, minWidth: 180 },
  composer: { paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  sharing: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
