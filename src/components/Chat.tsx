import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import type { ChatMessage } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { Press, Txt } from '@/components/ui';
import { formatDue, hhmm, isTbd } from '@/data/format';
import { useOnline } from '@/data/online';
import { localHomeworkId } from '@/data/remote';
import { useStore } from '@/data/store';
import { useTheme } from '@/theme/useTheme';

// 班级聊天和总聊天室共用的两块：一条消息气泡、底部的输入框

// 一条消息：别人的在左边，带昵称（班级聊天还带档位）；自己的在右边。都带头像
export function ChatBubble({ m, mine }: { m: ChatMessage; mine: boolean }) {
  const { theme } = useTheme();
  const { homework } = useStore();
  const online = useOnline();
  const local = m.homework ? homework.find((h) => h.id === localHomeworkId(m.homework!.id)) : undefined;
  const due = m.homework?.due ? new Date(m.homework.due) : null;
  return (
    <View style={[styles.msg, mine && { flexDirection: 'row-reverse' }]}>
      <Avatar user={m.user} size={30} />
      <View style={{ maxWidth: '78%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {!mine && (
          <Txt variant="caption" tone="faint" style={{ marginBottom: 3 }}>
            {m.user.tierName ? `${m.user.nickname} · ${m.user.tierName}` : m.user.nickname}
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

// 输入框 + 发送按钮
export function ChatInput({ value, onChange, onSend, canSend }: { value: string; onChange: (t: string) => void; onSend: () => void; canSend: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={styles.inputRow}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="说点什么…"
        placeholderTextColor={theme.faint}
        maxLength={500}
        multiline
        // 网页上多行输入框默认两行高，这里压成一行，打字多了再长高
        {...(Platform.OS === 'web' ? { numberOfLines: 1 } : {})}
        style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.line }]}
      />
      <Press onPress={onSend} disabled={!canSend} style={[styles.send, { backgroundColor: theme.text, opacity: canSend ? 1 : 0.3 }]}>
        <Ionicons name="arrow-up" size={18} color={theme.onText} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  msg: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bubble: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 9 },
  card: { borderWidth: 1, borderRadius: 12, padding: 10, minWidth: 180 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, outlineWidth: 0 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
