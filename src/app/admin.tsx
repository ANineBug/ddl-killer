import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { UserRef } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { useToast } from '@/components/Toast';
import { Card, ModalScreen, Press, Txt } from '@/components/ui';
import { errorText, useOnline } from '@/data/online';
import { useTheme } from '@/theme/useTheme';

// 管理员：被降级的账号，一个个恢复。降级是在聊天里长按消息、或者作业详情的「管理」里做的
export default function AdminScreen() {
  const { theme } = useTheme();
  const online = useOnline();
  const toast = useToast();
  const [users, setUsers] = useState<UserRef[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    if (!online.isAdmin) return;
    online
      .adminDemotedUsers()
      .then(setUsers)
      .catch((e) => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online.isAdmin]);

  async function restore(u: UserRef) {
    if (busy) return;
    setBusy(u.id);
    try {
      await online.adminDemote(u.id, false);
      setUsers((list) => list?.filter((x) => x.id !== u.id) ?? null);
      toast(`已恢复「${u.nickname}」`);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ModalScreen title="管理">
      {!online.isAdmin ? (
        <Txt tone="sub">只有管理员能看这一页</Txt>
      ) : (
        <>
          <Card style={{ padding: 16 }}>
            <Txt style={{ fontWeight: '600' }}>怎么管理</Txt>
            <Txt variant="sub" tone="sub" style={styles.p}>
              {'· 聊天里长按一条消息：删除这条消息，或把发消息的人降为新同学\n· 作业详情里点「管理」：删除这条作业，或把上传者降为新同学'}
            </Txt>
          </Card>

          <Txt variant="caption" tone="sub" style={{ marginTop: 22, marginBottom: 8, marginLeft: 4 }}>
            被降级的账号
          </Txt>
          <Card>
            {error ? (
              <Txt variant="sub" tone="urgent" style={{ padding: 16 }}>
                {error}
              </Txt>
            ) : users === null ? (
              <ActivityIndicator style={{ padding: 16 }} />
            ) : users.length === 0 ? (
              <Txt variant="sub" tone="sub" style={{ padding: 16 }}>
                没有被降级的账号
              </Txt>
            ) : (
              users.map((u, i) => (
                <View key={u.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }]}>
                  <Avatar user={u} size={30} />
                  <Txt variant="sub" numberOfLines={1} style={{ flex: 1 }}>
                    {u.nickname}
                  </Txt>
                  <Press onPress={() => restore(u)} style={[styles.button, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
                    {busy === u.id ? (
                      <ActivityIndicator size="small" color={theme.accent} />
                    ) : (
                      <Txt variant="caption" tone="accent" style={{ fontWeight: '600' }}>
                        恢复
                      </Txt>
                    )}
                  </Press>
                </View>
              ))
            )}
          </Card>
        </>
      )}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  p: { lineHeight: 22, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16 },
  button: { paddingHorizontal: 14, height: 30, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minWidth: 58 },
});
