import { router } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { useToast } from '@/components/Toast';
import { Chip, ChipGroup, closeModal, Field, ModalScreen, PrimaryButton, Txt } from '@/components/ui';
import { errorText, useOnline } from '@/data/online';
import appJson from '../../app.json';

type Kind = 'bug' | 'idea' | 'other';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'bug', label: '遇到问题' },
  { value: 'idea', label: '功能建议' },
  { value: 'other', label: '其他' },
];

// 意见反馈：直接发给开发者。版本号和系统自动带上，不带邮箱；想要回复的自己留联系方式
export default function Feedback() {
  const online = useOnline();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('bug');
  const [text, setText] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || !text.trim()) return;
    setBusy(true);
    try {
      await online.feedback({ kind, text: text.trim(), contact: contact.trim(), appVersion: appJson.expo.version, platform: Platform.OS });
      closeModal();
      toast('收到了，谢谢你');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalScreen
      title="意见反馈"
      footer={
        online.loggedIn ? (
          <PrimaryButton label={busy ? '发送中…' : '发送'} onPress={submit} disabled={!text.trim() || busy} />
        ) : (
          <PrimaryButton label="登录后反馈" onPress={() => router.push('/login')} />
        )
      }>
      <ChipGroup label="类型">
        {KINDS.map((k) => (
          <Chip key={k.value} label={k.label} active={kind === k.value} onPress={() => setKind(k.value)} />
        ))}
      </ChipGroup>
      <Field
        label="想说的"
        placeholder={kind === 'bug' ? '在哪个页面、做了什么、出了什么问题' : kind === 'idea' ? '希望加什么、改什么' : '随便说说'}
        value={text}
        onChangeText={setText}
        maxLength={1000}
        multiline
      />
      <Field label="联系方式（可选）" placeholder="QQ、微信或邮箱，需要回复时用" value={contact} onChangeText={setContact} maxLength={60} />
      <Txt variant="caption" tone="faint" style={{ marginTop: 10, marginLeft: 4 }}>
        会附上 app 版本和手机系统，不会附上你的登录邮箱
      </Txt>
    </ModalScreen>
  );
}
