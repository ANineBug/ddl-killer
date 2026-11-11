import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MyClass } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { haptic } from '@/components/haptic';
import { useToast } from '@/components/Toast';
import { TabScreen } from '@/components/TabScreen';
import { TabScrollView } from '@/components/TabScroll';
import { Card, Press, Section, Txt } from '@/components/ui';
import { errorText, useOnline } from '@/data/online';
import { useStore } from '@/data/store';
import { fonts, ThemeName, themeNames, themes } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const TIER_NAMES = { newbie: '新同学', member: '同学', helper: '热心同学', trusted: '靠谱同学' } as const;

export default function MeScreen() {
  const { theme } = useTheme();
  const { profile, setProfile, homework, settings, setSettings } = useStore();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.nickname);
  const online = useOnline();
  const toast = useToast();
  // 登录了就用服务器上的昵称
  const nickname = online.account?.user.nickname ?? profile.nickname;
  const [mine, setMine] = useState<MyClass[] | null>(null);
  const [uploading, setUploading] = useState(false);

  // 登录后拉一次"我在每个班的档位和贡献值"
  const token = online.account?.token;
  useEffect(() => {
    if (!token) return setMine(null);
    online
      .me()
      .then((m) => setMine(m.classes))
      .catch(() => setMine([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // 换头像：选一张图、裁成正方形，压到 512 像素的 JPG 再传，一般只有几十 KB
  async function pickAvatar() {
    if (uploading) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      const ctx = ImageManipulator.manipulate(asset.uri);
      if ((asset.width ?? 0) > 512) ctx.resize({ width: 512 });
      const image = await ctx.renderAsync();
      const out = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
      await online.setAvatar(out.uri, 'image/jpeg');
      haptic.success();
      toast('头像换好了');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setUploading(false);
    }
  }

  const uploaded = homework.filter((h) => h.mine).length;
  const confirmed = homework.filter((h) => h.myReactions.includes('confirm')).length;
  const pending = homework.filter((h) => !h.done).length;
  const hue = theme.courseHues[profile.avatarHue % theme.courseHues.length];

  function saveName() {
    const name = draft.trim();
    setEditing(false);
    if (!name || name === nickname) {
      setDraft(nickname);
      return;
    }
    setProfile({ nickname: name });
    if (online.loggedIn) {
      online.rename(name).catch((e) => {
        toast(errorText(e));
        setDraft(nickname);
      });
    }
  }

  return (
    <TabScreen index={2}>
      <TabScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled">
        <Txt variant="display">我的</Txt>

        <Card style={styles.profile}>
          {online.account ? (
            // 登录后点头像换图片；游客点头像只换颜色
            <Press onPress={pickAvatar}>
              <Avatar user={online.account.user} size={56} />
              <View style={[styles.camera, { backgroundColor: theme.text }]}>
                {uploading ? <ActivityIndicator size="small" color={theme.onText} /> : <Ionicons name="camera" size={11} color={theme.onText} />}
              </View>
            </Press>
          ) : (
            <Press
              onPress={() => setProfile({ avatarHue: profile.avatarHue + 1 })}
              style={[styles.avatar, { backgroundColor: hue }]}>
              <Txt style={{ fontFamily: fonts.serif, fontSize: 24, color: '#ffffff', fontWeight: '600' }}>
                {nickname.slice(0, 1)}
              </Txt>
            </Press>
          )}
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
              <Press
                onPress={() => {
                  setDraft(nickname);
                  setEditing(true);
                }}
                style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Txt variant="title">{nickname}</Txt>
                <Ionicons name="pencil" size={14} color={theme.faint} style={{ marginLeft: 8 }} />
              </Press>
            )}
            <Txt variant="caption" tone="sub" style={{ marginTop: 4 }}>
              {online.loggedIn ? '点头像换图片，点名字改昵称' : '游客 · 只能看，登录后才能上传和确认'}
            </Txt>
          </View>
          {!online.loggedIn && (
            <Press onPress={() => router.push('/login')} style={[styles.login, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
              <Txt variant="sub" tone="accent" style={{ fontWeight: '600' }}>
                登录
              </Txt>
            </Press>
          )}
        </Card>

        <View style={styles.stats}>
          <Stat value={pending} label="待完成" />
          <Stat value={uploaded} label="我上传的" />
          <Stat value={confirmed} label="我确认的" />
        </View>

        <Section title="外观">
          <View style={styles.themes}>
            {/* 纸页是默认主题，排在前面 */}
            {(['paper', 'dusk'] as ThemeName[]).map((n) => (
              <ThemeOption key={n} name={n} />
            ))}
          </View>
        </Section>

        {online.loggedIn && (
          <Section title="我的贡献">
            <Card>
              {mine === null ? (
                <ActivityIndicator style={{ padding: 16 }} />
              ) : mine.length === 0 ? (
                <Txt variant="sub" tone="sub" style={{ padding: 16 }}>
                  导入课表或加入教学班以后，这里显示你在每个班的档位
                </Txt>
              ) : (
                mine.map((c, i) => (
                  <Press
                    key={c.id}
                    onPress={() => router.push(`/board?classId=${c.id}`)}
                    style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }]}>
                    <Txt variant="sub" numberOfLines={1} style={{ flex: 1 }}>
                      {c.name}
                    </Txt>
                    <Txt variant="caption" tone="sub">
                      {TIER_NAMES[c.myTier]} · {c.myScore} 分 ›
                    </Txt>
                  </Press>
                ))
              )}
            </Card>
            <Press onPress={() => router.push('/board')} hitSlop={8} style={{ marginTop: 8, marginLeft: 4 }}>
              <Txt variant="caption" tone="accent">
                看总榜 ›
              </Txt>
            </Press>
          </Section>
        )}

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
          <Press onPress={() => router.push('/reminder-notice')} hitSlop={8} style={{ marginTop: 8, marginLeft: 4 }}>
            <Txt variant="caption" tone="accent">
              提醒可能不准时，以下内容你需要知道 ›
            </Txt>
          </Press>
          <Press onPress={() => router.push('/class-times')} hitSlop={8} style={{ marginTop: 8, marginLeft: 4 }}>
            <Txt variant="caption" tone="accent">
              每节课几点上课（选填）›
            </Txt>
          </Press>
        </Section>

        <Txt variant="caption" tone="faint" style={{ textAlign: 'center', marginTop: 26 }}>
          {online.loggedIn ? '版本 0.1 · 作业和服务器同步，完成状态和提醒只存在这台手机上' : '版本 0.1 · 数据保存在这台手机上'}
        </Txt>
        {online.loggedIn && (
          <Press
            hitSlop={8}
            style={{ alignSelf: 'center', marginTop: 10 }}
            onPress={() => {
              haptic.select();
              online.logout().then(() => toast('已退出登录'));
            }}>
            <Txt variant="caption" tone="faint" style={{ textDecorationLine: 'underline' }}>
              退出登录
            </Txt>
          </Press>
        )}
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
  camera: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16 },
  login: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, borderWidth: 1, marginLeft: 10 },
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
