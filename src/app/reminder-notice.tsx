import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, View } from 'react-native';

import { haptic } from '@/components/haptic';
import { useToast } from '@/components/Toast';
import { Card, ModalScreen, Press, Txt } from '@/components/ui';
import { api } from '@/api/client';
import { errorText, useOnline } from '@/data/online';
import { askExactAlarm, ensurePermission, exactAlarmGranted, notifySupported, sendTest } from '@/lib/notify';
import { useTheme } from '@/theme/useTheme';

// 用大白话讲清楚：为什么手机上的提醒可能不准时，以及两个解决办法（可以都开）
export default function ReminderNotice() {
  const { theme } = useTheme();
  const online = useOnline();
  const toast = useToast();
  const [email, setEmail] = useState<boolean | null>(null);
  // 手机上两项权限现在的状态；网页上为空
  const [perm, setPerm] = useState<{ notify: boolean; exact: boolean } | null>(null);

  async function refreshPerm() {
    if (!notifySupported) return;
    setPerm({ notify: await ensurePermission(false), exact: await exactAlarmGranted() });
  }
  useEffect(() => {
    refreshPerm().catch(() => {});
  }, []);

  async function test() {
    if (!notifySupported) {
      toast('网页预览里不能发通知，要在手机上试');
      return;
    }
    if (!(await ensurePermission(true))) {
      toast('通知权限被关了，先在系统设置里打开', { label: '去设置', onPress: () => Linking.openSettings() });
      refreshPerm();
      return;
    }
    await sendTest();
    haptic.success();
    toast('10 秒后弹一条测试提醒，可以锁屏或者切到别的 app 等等看');
    refreshPerm();
  }

  async function allowExact() {
    try {
      await askExactAlarm();
    } finally {
      refreshPerm();
    }
  }

  useEffect(() => {
    if (!online.loggedIn) return;
    api<{ emailDigest: boolean }>('/me')
      .then((m) => setEmail(m.emailDigest))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online.loggedIn]);

  async function toggleEmail(v: boolean) {
    if (!online.loggedIn) {
      toast('登录后才能开邮件提醒', { label: '登录', onPress: () => router.push('/login') });
      return;
    }
    haptic.select();
    setEmail(v);
    try {
      await api('/me', { method: 'PATCH', body: { emailDigest: v } });
      toast(v ? '开好了，每天早上 7 点发到你登录用的邮箱' : '已关掉邮件提醒');
    } catch (e) {
      setEmail(!v);
      toast(errorText(e));
    }
  }

  return (
    <ModalScreen title="关于提醒">
      <Txt variant="display" style={{ fontSize: 24, lineHeight: 34 }}>
        提醒可能不准时，以下内容你需要知道
      </Txt>
      <Txt variant="sub" tone="sub" style={styles.p}>
        作业提醒是手机自己到点弹出来的。安卓手机为了省电，会在你关掉 app 以后限制它在后台运行，国产手机管得尤其严。被限制的时候，提醒可能晚到，甚至不来。
      </Txt>
      <Txt variant="sub" tone="sub" style={styles.p}>
        这不是 app 能单方面解决的，需要你在手机上放开一下。下面两个办法可以都用上。
      </Txt>

      <Card style={styles.card}>
        <Txt style={{ fontWeight: '600' }}>办法一：让 app 能在后台待着</Txt>
        <Txt variant="sub" tone="sub" style={styles.p}>
          在系统设置里找到这个 app，打开「自启动」，把「电池 / 耗电管理」设成「不限制」。不同品牌叫法不一样：
        </Txt>
        <Txt variant="caption" tone="sub" style={{ lineHeight: 20, marginTop: 6 }}>
          小米：省电策略 → 无限制{'\n'}华为、荣耀：应用启动管理 → 改成手动管理，三个开关都打开{'\n'}OPPO、一加、vivo：耗电管理 → 允许后台运行、允许自启动
        </Txt>
        <Press onPress={() => Linking.openSettings()} style={[styles.button, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
          <Txt variant="sub" tone="accent" style={{ fontWeight: '600' }}>
            打开这个 app 的系统设置
          </Txt>
        </Press>

        {perm && (
          <View style={{ marginTop: 14, gap: 8 }}>
            <PermRow label="通知" ok={perm.notify} hint="关了就完全收不到提醒" onFix={() => Linking.openSettings()} />
            <PermRow label="准点提醒（闹钟和提醒）" ok={perm.exact} hint="没开的话，提醒可能晚几分钟" onFix={allowExact} />
          </View>
        )}
        <Press onPress={test} style={[styles.button, { borderColor: theme.line }]}>
          <Txt variant="sub" tone="sub" style={{ fontWeight: '600' }}>
            发一条测试提醒
          </Txt>
        </Press>
      </Card>

      <Card style={styles.card}>
        <View style={styles.row}>
          <Txt style={{ fontWeight: '600', flex: 1 }}>办法二：邮件提醒</Txt>
          <Switch
            value={!!email}
            onValueChange={toggleEmail}
            trackColor={{ true: theme.accent, false: theme.line }}
            thumbColor="#ffffff"
            // 网页版的开关打开时默认是青绿色圆点，和「我的」里一样统一成白色
            {...(Platform.OS === 'web' ? { activeThumbColor: '#ffffff' } : {})}
          />
        </View>
        <Txt variant="sub" tone="sub" style={styles.p}>
          每天早上 7 点，把两天内要交的作业发一封邮件到你登录用的邮箱。邮件不受手机省电影响，最稳。
        </Txt>
        <Txt variant="caption" tone="sub" style={{ lineHeight: 20, marginTop: 6 }}>
          用 QQ 邮箱的话，在微信里绑定 QQ 邮箱提醒，来信时微信会通知你，等于把提醒放进了微信。
        </Txt>
        {!online.loggedIn && (
          <Txt variant="caption" tone="faint" style={{ marginTop: 8 }}>
            邮件提醒要先登录
          </Txt>
        )}
      </Card>
    </ModalScreen>
  );
}

function PermRow({ label, ok, hint, onFix }: { label: string; ok: boolean; hint: string; onFix: () => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Txt variant="sub">{label}</Txt>
        {!ok && (
          <Txt variant="caption" tone="faint">
            {hint}
          </Txt>
        )}
      </View>
      {ok ? (
        <Txt variant="caption" tone="sub">
          已允许
        </Txt>
      ) : (
        <Press onPress={onFix} hitSlop={8}>
          <Txt variant="caption" tone="accent">
            去允许 ›
          </Txt>
        </Press>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  p: { marginTop: 10, lineHeight: 22 },
  card: { marginTop: 16, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  button: { marginTop: 14, height: 42, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
