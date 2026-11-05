import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Press, Section, Txt } from '@/components/ui';
import { useStore } from '@/data/store';
import { fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function MeScreen() {
  const { theme } = useTheme();
  const { profile, setProfile, homework } = useStore();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.nickname);
  const [remind, setRemind] = useState({ day: true, hours: true, quiet: true });

  const uploaded = homework.filter((h) => h.uploader === profile.nickname).length;
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
    <ScrollView
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

      <Section title="提醒">
        <Card>
          <ToggleRow label="截止前 1 天提醒" value={remind.day} onChange={(v) => setRemind({ ...remind, day: v })} />
          <ToggleRow label="截止前 3 小时提醒" value={remind.hours} onChange={(v) => setRemind({ ...remind, hours: v })} />
          <ToggleRow
            label="夜间免打扰 23:00–7:00"
            value={remind.quiet}
            onChange={(v) => setRemind({ ...remind, quiet: v })}
            last
          />
        </Card>
      </Section>

      <Section title="第二期">
        <Card style={{ padding: 16 }}>
          <Txt variant="sub" tone="sub" style={{ lineHeight: 20 }}>
            贡献值、签到、排行榜、打赏、聊天气泡、小论坛，正在路上。
          </Txt>
        </Card>
      </Section>

      <Txt variant="caption" tone="faint" style={{ textAlign: 'center', marginTop: 26 }}>
        版本 0.1 · 当前为演示数据
      </Txt>
    </ScrollView>
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
});
