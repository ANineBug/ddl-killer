import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ChatMessage } from '@/api/types';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Press, Txt } from '@/components/ui';
import { errorText } from '@/data/online';
import { useTheme } from '@/theme/useTheme';

// 管理员的操作面板：先列出能做什么，点了以后再确认一次才真的执行。只有管理员能看到
export type AdminAction = {
  label: string;
  // 确认那一步的说明：做了会怎样、能不能撤回
  confirm: string;
  run: () => Promise<unknown>;
  done: string;
};

export function AdminSheet({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title: string; actions: AdminAction[] }) {
  const { theme } = useTheme();
  const toast = useToast();
  const [picked, setPicked] = useState<AdminAction | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) setPicked(null);
  }, [visible]);

  async function go() {
    if (!picked || busy) return;
    setBusy(true);
    try {
      await picked.run();
      toast(picked.done);
      onClose();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={picked ? picked.label : title}>
      {picked ? (
        <View>
          <Txt variant="sub" tone="sub" style={{ lineHeight: 22 }}>
            {picked.confirm}
          </Txt>
          <Press onPress={go} style={[styles.confirm, { backgroundColor: theme.urgent, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color="#ffffff" /> : <Txt style={{ color: '#ffffff', fontWeight: '600' }}>确认</Txt>}
          </Press>
          <Press onPress={() => setPicked(null)} style={styles.cancel}>
            <Txt variant="sub" tone="sub">
              返回
            </Txt>
          </Press>
        </View>
      ) : (
        <View style={[styles.list, { borderColor: theme.line }]}>
          {actions.map((a, i) => (
            <Press key={a.label} onPress={() => setPicked(a)} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }]}>
              <Txt variant="sub" tone="urgent">
                {a.label}
              </Txt>
            </Press>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden' },
  row: { paddingVertical: 14, paddingHorizontal: 16 },
  confirm: { marginTop: 18, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  cancel: { marginTop: 6, height: 40, alignItems: 'center', justifyContent: 'center' },
});

// 聊天里的管理：长按一条消息 → 删这条消息 / 把发消息的人降为新同学。返回给气泡用的长按回调和面板本身
export function useMessageAdmin({
  isAdmin,
  me,
  deleteMessage,
  demote,
  onDeleted,
}: {
  isAdmin: boolean;
  me: number | undefined;
  deleteMessage: (id: number) => Promise<unknown>;
  demote: (userId: number, demoted: boolean) => Promise<unknown>;
  onDeleted: (id: number) => void;
}) {
  const [target, setTarget] = useState<ChatMessage | null>(null);
  const actions: AdminAction[] = target
    ? [
        {
          label: '删除这条消息',
          confirm: `删掉「${target.user.nickname}」的这条消息，所有人都看不到了。`,
          run: async () => {
            await deleteMessage(target.id);
            onDeleted(target.id);
          },
          done: '消息已删除',
        },
        ...(target.user.id !== me
          ? [
              {
                label: `把「${target.user.nickname}」降为新同学`,
                confirm: '降级以后：在所有班里都按新同学算（确认和投票不计数、每天最多传 3 条），也不能在总聊天室发言。可以在「我的 → 管理 → 被降级的账号」里恢复。',
                run: () => demote(target.user.id, true),
                done: `已把「${target.user.nickname}」降为新同学`,
              },
            ]
          : []),
      ]
    : [];
  return {
    onLongPress: (m: ChatMessage) => (isAdmin ? () => setTarget(m) : undefined),
    sheet: <AdminSheet visible={!!target} onClose={() => setTarget(null)} title="管理这条消息" actions={actions} />,
  };
}
