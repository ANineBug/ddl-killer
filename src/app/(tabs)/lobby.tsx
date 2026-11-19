import { router, useFocusEffect } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatMessage } from '@/api/types';
import { useMessageAdmin } from '@/components/AdminSheet';
import { ChatBubble, ChatInput } from '@/components/Chat';
import { haptic } from '@/components/haptic';
import { TabScreen } from '@/components/TabScreen';
import { useToast } from '@/components/Toast';
import { Press, Txt } from '@/components/ui';
import { errorText, useOnline } from '@/data/online';
import { useTheme } from '@/theme/useTheme';

// 底部悬浮标签栏占的高度：离底 14 + 栏高 62。输入框要放在它上面
const TAB_BAR_SPACE = 14 + 62 + 10;

// 总聊天室：全校登录的同学都能看、能发，只有文字。停在这一页的时候每 4 秒拉一次新消息
export default function LobbyScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const toast = useToast();
  const [list, setList] = useState<ChatMessage[]>([]);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // 键盘弹出来时标签栏被盖住了，输入框直接贴着键盘，不用再给标签栏留位置
  const [keyboard, setKeyboard] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const last = useRef(0);
  const me = online.account?.user.id;
  const admin = useMessageAdmin({
    isAdmin: online.isAdmin,
    me,
    deleteMessage: online.adminDeleteMessage,
    demote: online.adminDemote,
    onDeleted: (id) => setList((old) => old.filter((x) => x.id !== id)),
  });

  function append(items: ChatMessage[]) {
    if (!items.length) return;
    last.current = items[items.length - 1].id;
    setList((old) => [...old, ...items.filter((m) => !old.some((x) => x.id === m.id))]);
  }

  // 换了账号或退出登录，清空重新拉
  useEffect(() => {
    setList([]);
    setError('');
    last.current = 0;
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      if (!online.loggedIn) return;
      let alive = true;
      const pull = () =>
        online
          .lobbyMessages(last.current || undefined)
          .then((m) => {
            if (!alive) return;
            setError('');
            append(m);
          })
          .catch((e) => alive && last.current === 0 && setError(errorText(e)));
      pull();
      const timer = setInterval(pull, 4000);
      return () => {
        alive = false;
        clearInterval(timer);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [online.loggedIn, me]),
  );

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  async function sendNow() {
    const body = text.trim();
    if (busy || !body) return;
    setBusy(true);
    try {
      const m = await online.lobbySend(body);
      haptic.light();
      append([m]);
      setText('');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <TabScreen index={2}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={[styles.header, { paddingTop: insets.top + 20, borderBottomColor: theme.line }]}>
          <Txt variant="caption" tone="sub">
            全校同学都能看到
          </Txt>
          <Txt variant="display" style={{ marginTop: 4 }}>
            总聊天室
          </Txt>
        </View>

        {!online.loggedIn ? (
          <View style={[styles.center, { paddingBottom: insets.bottom + TAB_BAR_SPACE }]}>
            <Txt tone="sub">登录后才能看和发消息</Txt>
            <Press onPress={() => router.push('/login')} style={[styles.login, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
              <Txt variant="sub" tone="accent" style={{ fontWeight: '600' }}>
                去登录
              </Txt>
            </Press>
          </View>
        ) : (
          <>
            <ScrollView
              ref={scroll}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, gap: 14 }}
              onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
              keyboardShouldPersistTaps="handled">
              {error ? (
                <Txt variant="caption" tone="urgent" style={{ textAlign: 'center', marginTop: 40 }}>
                  {error}
                </Txt>
              ) : list.length === 0 ? (
                <Txt variant="caption" tone="faint" style={{ textAlign: 'center', marginTop: 40 }}>
                  还没有人说话，打个招呼吧
                </Txt>
              ) : null}
              {list.map((m) => (
                <ChatBubble key={m.id} m={m} mine={m.user.id === me} onLongPress={admin.onLongPress(m)} />
              ))}
            </ScrollView>
            <View
              style={[
                styles.composer,
                { paddingBottom: keyboard ? 10 : insets.bottom + TAB_BAR_SPACE, borderTopColor: theme.line },
              ]}>
              <ChatInput value={text} onChange={setText} onSend={sendNow} canSend={!busy && !!text.trim()} />
            </View>
          </>
        )}
        {admin.sheet}
      </KeyboardAvoidingView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  login: { marginTop: 14, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  composer: { paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
