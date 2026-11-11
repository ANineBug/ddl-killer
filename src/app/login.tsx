import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { haptic } from '@/components/haptic';
import { useToast } from '@/components/Toast';
import { closeModal, Field, ModalScreen, Press, PrimaryButton, Txt } from '@/components/ui';
import { errorText, useOnline } from '@/data/online';

// 邮箱验证码登录。第一次用这个邮箱就是注册，不需要密码
export default function Login() {
  const online = useOnline();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 重发倒计时
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send() {
    if (busy || wait > 0) return;
    setBusy(true);
    setError('');
    try {
      await online.requestCode(email.trim());
      haptic.light();
      setSent(true);
      setWait(60);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await online.login(email.trim(), code.trim());
      haptic.success();
      closeModal();
      toast(res.created ? `注册好了，你现在叫「${res.user.nickname}」，可以在「我的」里改` : '已登录');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <ModalScreen
      title="登录"
      footer={
        sent ? (
          <PrimaryButton label={busy ? '登录中…' : '登录'} onPress={submit} disabled={code.trim().length !== 6 || busy} />
        ) : (
          <PrimaryButton label={busy ? '发送中…' : '发送验证码'} onPress={send} disabled={!emailOk || busy} />
        )
      }>
      <Txt variant="display" style={{ fontSize: 26 }}>
        用邮箱登录
      </Txt>
      <Txt variant="sub" tone="sub" style={{ marginTop: 8, lineHeight: 21 }}>
        第一次用就是注册，不用设密码。目前支持 QQ 邮箱、163 邮箱和 Gmail。{'\n'}
        我们只用邮箱认人，不要学号和姓名。
      </Txt>

      <Field
        label="邮箱"
        placeholder="比如 12345@qq.com"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (sent) setSent(false);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        inputMode="email"
      />

      {sent && (
        <>
          <Field
            label="验证码"
            placeholder="邮件里的 6 位数字"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            inputMode="numeric"
            autoFocus
            maxLength={6}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginHorizontal: 4 }}>
            <Txt variant="caption" tone="faint">
              没收到的话，看看垃圾邮件
            </Txt>
            <Press onPress={send} disabled={wait > 0} hitSlop={8}>
              <Txt variant="caption" tone={wait > 0 ? 'faint' : 'accent'}>
                {wait > 0 ? `${wait} 秒后可重发` : '重新发送'}
              </Txt>
            </Press>
          </View>
        </>
      )}

      {error ? (
        <Txt variant="caption" tone="urgent" style={{ marginTop: 14, marginLeft: 4 }}>
          {error}
        </Txt>
      ) : null}
    </ModalScreen>
  );
}
