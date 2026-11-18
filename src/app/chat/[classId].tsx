import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatMessage } from '@/api/types';
import { ChatBubble, ChatInput } from '@/components/Chat';
import { haptic } from '@/components/haptic';
import { useToast } from '@/components/Toast';
import { Backdrop, closeModal, Press, Txt } from '@/components/ui';
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
            <ChatBubble key={m.id} m={m} mine={m.user.id === me} />
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
          <ChatInput value={text} onChange={setText} onSend={sendNow} canSend={!busy && (!!text.trim() || !!sharing)} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  composer: { paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  sharing: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
});
