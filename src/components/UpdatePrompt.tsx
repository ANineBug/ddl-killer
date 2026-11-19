import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, StyleSheet, View } from 'react-native';

import { api } from '@/api/client';
import { Press, Txt } from '@/components/ui';
import { canPromptToday, dayKey, isNewer, releaseNotes } from '@/data/version';
import { fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import appJson from '../../app.json';

// 新版本提醒：安卓 app 打开、回到前台时问一下服务器最新版本，比自己新就弹一个框，一天最多弹一次。
// 「我的 → 检查更新」可以手动查，不受一天一次的限制。网页版永远是最新的，不用查

export const APP_VERSION: string = appJson.expo.version;
export const canUpdate = Platform.OS === 'android';

const PROMPT_KEY = 'ddl.updatePromptDay';
type Latest = { version: string | null; notes: string; url: string | null };

// 手动检查用：组件挂上以后把「打开提示框」交给这里
let show: ((l: Latest) => void) | null = null;

async function fetchLatest() {
  return api<Latest>('/app/latest');
}

// 手动检查：有新版本就弹框，返回 true；已经是最新返回 false
export async function checkForUpdate() {
  const latest = await fetchLatest();
  if (latest.version && latest.url && isNewer(latest.version, APP_VERSION)) {
    show?.(latest);
    return true;
  }
  return false;
}

export function UpdatePrompt() {
  const { theme } = useTheme();
  const [latest, setLatest] = useState<Latest | null>(null);
  const checking = useRef(false);

  useEffect(() => {
    show = setLatest;
    if (!canUpdate) return;
    async function auto() {
      if (checking.current) return;
      checking.current = true;
      try {
        const last = await AsyncStorage.getItem(PROMPT_KEY).catch(() => null);
        if (!canPromptToday(last, new Date())) return;
        const l = await fetchLatest();
        if (!l.version || !l.url || !isNewer(l.version, APP_VERSION)) return;
        await AsyncStorage.setItem(PROMPT_KEY, dayKey(new Date())).catch(() => {});
        setLatest(l);
      } catch {
        // 没网、服务器没开：下次再说
      } finally {
        checking.current = false;
      }
    }
    auto();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && auto());
    return () => {
      sub.remove();
      show = null;
    };
  }, []);

  if (!latest) return null;
  const notes = releaseNotes(latest.notes);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setLatest(null)}>
      <View style={styles.dim}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardEdge }]}>
          <Txt variant="caption" tone="sub">
            你现在是 {APP_VERSION}
          </Txt>
          <Txt style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: '600', marginTop: 4 }}>有新版本 {latest.version}</Txt>
          {notes ? (
            <Txt variant="sub" tone="sub" style={{ marginTop: 12, lineHeight: 22 }}>
              {notes}
            </Txt>
          ) : null}
          <Txt variant="caption" tone="faint" style={{ marginTop: 12 }}>
            下载后直接安装，会覆盖旧版本，数据不丢
          </Txt>
          <Press
            onPress={() => {
              if (latest.url) Linking.openURL(latest.url);
              setLatest(null);
            }}
            style={[styles.primary, { backgroundColor: theme.text }]}>
            <Txt style={{ color: theme.onText, fontWeight: '600' }}>下载新版本</Txt>
          </Press>
          <Press onPress={() => setLatest(null)} style={styles.later}>
            <Txt variant="sub" tone="sub">
              以后再说
            </Txt>
          </Press>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 360, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 22 },
  primary: { marginTop: 18, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  later: { marginTop: 6, height: 40, alignItems: 'center', justifyContent: 'center' },
});
