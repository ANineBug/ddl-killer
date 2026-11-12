import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { haptic } from '@/components/haptic';
import { useToast } from '@/components/Toast';
import { closeModal, Field, ModalScreen, Press, PrimaryButton, Txt } from '@/components/ui';
import { errorText, useOnline } from '@/data/online';
import { useTheme } from '@/theme/useTheme';

// 三个样子共用一页：
//   登录      邮箱 + 密码
//   注册      邮箱 → 发验证码 → 验证码 + 设密码
//   找回密码  邮箱 → 发验证码 → 验证码 + 新密码
type Mode = 'login' | 'register' | 'reset';

const TITLE: Record<Mode, string> = { login: '登录', register: '注册', reset: '找回密码' };
const HEADLINE: Record<Mode, string> = { login: '用邮箱登录', register: '注册账号', reset: '重设密码' };

// 和服务器的规则一样，提前在手机上提示，免得填完才被打回来
function passwordHint(pw: string) {
  if (!pw) return '';
  if (pw.length < 8) return '至少 8 位';
  if (pw.length > 64) return '最多 64 位';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return '要同时有字母和数字';
  return '';
}

export default function Login() {
  const { theme } = useTheme();
  const online = useOnline();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 重发倒计时
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  function switchTo(m: Mode) {
    setMode(m);
    setError('');
    setCode('');
    setPassword('');
    setSentTo('');
  }

  const mail = email.trim();
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail);
  const needCode = mode !== 'login';
  const hint = needCode ? passwordHint(password) : '';
  const ready = emailOk && password.length > 0 && !hint && (!needCode || (sentTo === mail && code.length === 6));

  async function sendCode() {
    if (busy || wait > 0 || !emailOk || mode === 'login') return;
    setBusy(true);
    setError('');
    try {
      await online.requestCode(mail, mode);
      haptic.light();
      setSentTo(mail);
      setWait(60);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (busy || !ready) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await online.login(mail, password);
        toast('已登录');
      } else if (mode === 'register') {
        const res = await online.register(mail, code, password);
        toast(res.created ? `注册好了，你现在叫「${res.user.nickname}」，可以在「我的」里改` : '密码设好了，已登录');
      } else {
        await online.resetPassword(mail, code, password);
        toast('密码改好了，别的手机上的登录已经退出');
      }
      haptic.success();
      closeModal();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const button = busy ? '请稍等…' : mode === 'login' ? '登录' : mode === 'register' ? '注册并登录' : '改好密码并登录';

  return (
    <ModalScreen title={TITLE[mode]} footer={<PrimaryButton label={button} onPress={submit} disabled={!ready || busy} />}>
      <Txt variant="display" style={{ fontSize: 26 }}>
        {HEADLINE[mode]}
      </Txt>
      <Txt variant="sub" tone="sub" style={{ marginTop: 8, lineHeight: 21 }}>
        {mode === 'login'
          ? '还没有账号的话，先注册一个。'
          : mode === 'register'
            ? '注册要先验证邮箱，以后登录只用邮箱和密码。目前支持 QQ 邮箱、163 邮箱和 Gmail。'
            : '往注册时的邮箱发一个验证码，填上就能设新密码。'}
        {'\n'}我们只用邮箱认人，不要学号和姓名。
      </Txt>

      <Field
        label="邮箱"
        placeholder="比如 12345@qq.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        inputMode="email"
        autoComplete="email"
      />

      {needCode && (
        <>
          <Field
            label="验证码"
            placeholder={sentTo === mail && mail ? '邮件里的 6 位数字' : '先点下面「发送验证码」'}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginHorizontal: 4 }}>
            <Txt variant="caption" tone="faint">
              {sentTo === mail && mail ? '没收到的话，看看垃圾邮件' : ''}
            </Txt>
            <Press onPress={sendCode} disabled={wait > 0 || !emailOk || busy} hitSlop={8}>
              <Txt variant="caption" tone={wait > 0 || !emailOk ? 'faint' : 'accent'}>
                {wait > 0 ? `${wait} 秒后可重发` : sentTo === mail && mail ? '重新发送' : '发送验证码'}
              </Txt>
            </Press>
          </View>
        </>
      )}

      <View>
        <Field
          label={mode === 'login' ? '密码' : mode === 'register' ? '设一个密码' : '新密码'}
          placeholder={mode === 'login' ? '' : '至少 8 位，字母和数字都要有'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPw}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          onSubmitEditing={submit}
          style={{ paddingRight: 48 }}
        />
        <Press onPress={() => setShowPw((v) => !v)} hitSlop={10} style={{ position: 'absolute', right: 14, bottom: 13 }}>
          <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.sub} />
        </Press>
      </View>
      {hint ? (
        <Txt variant="caption" tone="faint" style={{ marginTop: 8, marginLeft: 4 }}>
          {hint}
        </Txt>
      ) : null}

      {error ? (
        <Txt variant="caption" tone="urgent" style={{ marginTop: 14, marginLeft: 4 }}>
          {error}
        </Txt>
      ) : null}

      {/* 三个样子之间来回切 */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, marginHorizontal: 4 }}>
        {mode === 'login' ? (
          <>
            <Press onPress={() => switchTo('register')} hitSlop={8}>
              <Txt variant="sub" tone="accent">
                注册新账号
              </Txt>
            </Press>
            <Press onPress={() => switchTo('reset')} hitSlop={8}>
              <Txt variant="sub" tone="sub">
                忘记密码
              </Txt>
            </Press>
          </>
        ) : (
          <Press onPress={() => switchTo('login')} hitSlop={8}>
            <Txt variant="sub" tone="accent">
              {mode === 'register' ? '已经有账号了，去登录' : '想起来了，去登录'}
            </Txt>
          </Press>
        )}
      </View>
    </ModalScreen>
  );
}
