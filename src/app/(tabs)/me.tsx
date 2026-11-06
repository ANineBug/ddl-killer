import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/components/haptic';
import { TabScreen } from '@/components/TabScreen';
import { TabScrollView } from '@/components/TabScroll';
import { Card, Press, Section, Txt } from '@/components/ui';
import { useStore } from '@/data/store';
import { fonts, ThemeName, themeNames, themes } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function MeScreen() {
  const { theme } = useTheme();
  const { profile, setProfile, homework, settings, setSettings, resetDemo } = useStore();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.nickname);
  const [confirmReset, setConfirmReset] = useState(false);

  const uploaded = homework.filter((h) => h.mine).length;
  const confirmed = homework.filter((h) => h.myReactions.includes('confirm')).length;
  const pending = homework.filter((h) => !h.done).length;
  const hue = theme.courseHues[profile.avatarHue % theme.courseHues.length];

  function saveName() {
    const name = draft.trim();
    if (name) setProfile({ nickname: name });
    else setDraft(profile.nickname);
    setEditing(false);
  }

  return (
    <TabScreen index={2}>
      <TabScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled">
        <Txt variant="display">我的</Txt>

        <Card style={styles.profile}>
          <Press
            onPress={() => setProfile({ avatarHue: profile.avatarHue + 1 })}
            style={[styles.avatar, { backgroundColor: hue }]}>
            <Txt style={{ fontFamily: fonts.serif, fontSize: 24, color: '#ffffff', fontWeight: '600' }}>
              {profile.nickname.slice(0, 1)}
            </Txt>
          </Press>
          <View style={{ flex: 1, marginLeft: 14 }}>
            {editing ? (
              <TextInput
                autoFocus
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={saveName}
                onBlur={saveName}
                maxLength={12}
                style={[styles.nameInput, { color: theme.text, borderBottomColor: theme.accent }]}
              />
            ) : (
              <Press onPress={() => setEditing(true)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Txt variant="title">{profile.nickname}</Txt>
                <Ionicons name="pencil" size={14} color={theme.faint} style={{ marginLeft: 8 }} />
              </Press>
            )}
            <Txt variant="caption" tone="sub" style={{ marginTop: 4 }}>
              游客模式 · 点头像换颜色，点名字改昵称
            </Txt>
          </View>
        </Card>

        <View style={styles.stats}>
          <Stat value={pending} label="待完成" />
          <Stat value={uploaded} label="我上传的" />
          <Stat value={confirmed} label="我确认的" />
        </View>

        <Section title="外观">
          <View style={styles.themes}>
            {(['dusk', 'paper'] as ThemeName[]).map((n) => (
              <ThemeOption key={n} name={n} />
            ))}
          </View>
        </Section>

        <Section title="提醒">
          <Card>
            <ToggleRow label="截止前 1 天提醒" value={settings.remindDay} onChange={(v) => setSettings({ remindDay: v })} />
            <ToggleRow label="截止前 3 小时提醒" value={settings.remindHours} onChange={(v) => setSettings({ remindHours: v })} />
            <ToggleRow
              label="夜间免打扰 23:00–7:00"
              value={settings.quietNight}
              onChange={(v) => setSettings({ quietNight: v })}
              last
            />
          </Card>
          <Txt variant="caption" tone="faint" style={{ marginTop: 8, marginLeft: 4 }}>
            每条作业默认按这里提醒，也可以在作业详情里单独调整
          </Txt>
        </Section>

        <Section title="第二期">
          <Card style={{ padding: 16 }}>
            <Txt variant="sub" tone="sub" style={{ lineHeight: 20 }}>
              贡献值、签到、排行榜、打赏、聊天气泡、小论坛，正在路上。
            </Txt>
          </Card>
        </Section>

        <Txt variant="caption" tone="faint" style={{ textAlign: 'center', marginTop: 26 }}>
          版本 0.1 · 数据保存在这台手机上
        </Txt>
        {/* 点一次变成确认文字，3 秒内再点一次才真正重置 */}
        <Press
          hitSlop={8}
          style={{ alignSelf: 'center', marginTop: 10 }}
          onPress={() => {
            if (!confirmReset) {
              haptic.select();
              setConfirmReset(true);
              setTimeout(() => setConfirmReset(false), 3000);
              return;
            }
            haptic.success();
            setConfirmReset(false);
            resetDemo();
            setDraft('游客');
          }}>
          <Txt variant="caption" tone={confirmReset ? 'urgent' : 'faint'} style={{ textDecorationLine: 'underline' }}>
            {confirmReset ? '再点一次，清空我的数据并恢复演示数据' : '恢复演示数据'}
          </Txt>
        </Press>
      </TabScrollView>
    </TabScreen>
  );
}

// 一张小样：用这个主题自己的颜色画一个缩小的作业卡片，看一眼就知道长什么样
function ThemeOption({ name }: { name: ThemeName }) {
  const { theme: current, name: currentName, setName } = useTheme();
  const t = themes[name];
  const active = currentName === name;
  return (
    <Press
      onPress={() => {
        if (active) return;
        haptic.select();
        setName(name);
      }}
      style={[styles.themeOption, { borderColor: active ? current.accent : current.line }]}>
      <View style={[styles.swatch, { backgroundColor: t.bg[t.bg.length - 1] }]}>
        <View style={[styles.swatchCard, { backgroundColor: t.dark ? '#3f3a4c' : t.card, borderColor: t.cardEdge }]}>
          <View style={[styles.swatchDot, { borderColor: t.accent }]} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={[styles.swatchLine, { backgroundColor: t.text, width: '70%' }]} />
            <View style={[styles.swatchLine, { backgroundColor: t.urgent, width: '45%', opacity: 0.8 }]} />
          </View>
        </View>
      </View>
      <View style={styles.themeLabel}>
        <Txt variant="sub" tone={active ? 'text' : 'sub'} style={active && { fontWeight: '600' }}>
          {themeNames[name]}
        </Txt>
        {active && <Ionicons name="checkmark-circle" size={16} color={current.accent} />}
      </View>
    </Press>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Card style={styles.stat}>
      <Txt style={{ fontFamily: fonts.serif, fontSize: 24, fontWeight: '600' }}>{value}</Txt>
      <Txt variant="caption" tone="sub" style={{ marginTop: 2 }}>
        {label}
      </Txt>
    </Card>
  );
}

function ToggleRow({ label, value, onChange, last }: { label: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.toggle, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line }]}>
      <Txt variant="sub">{label}</Txt>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.line, true: theme.accent }}
        thumbColor="#ffffff"
        // 网页版的开关打开时默认是青绿色圆点，这里统一成白色
        {...(Platform.OS === 'web' ? { activeThumbColor: '#ffffff' } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', padding: 16, marginTop: 20 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  nameInput: { fontSize: 20, fontWeight: '600', borderBottomWidth: 1, paddingVertical: 2 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 12 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 16 },
  themes: { flexDirection: 'row', gap: 12 },
  themeOption: { flex: 1, borderRadius: 18, borderWidth: 1.5, overflow: 'hidden' },
  swatch: { height: 84, padding: 12, justifyContent: 'center' },
  swatchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  swatchDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  swatchLine: { height: 5, borderRadius: 3 },
  themeLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
});
