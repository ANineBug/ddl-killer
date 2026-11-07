import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/components/haptic';
import SchoolBrowser from '@/components/SchoolBrowser';
import type { SchoolBrowserHandle } from '@/components/SchoolBrowser.types';
import { useToast } from '@/components/Toast';
import { Backdrop, Card, Chip, closeModal, Field, Press, PrimaryButton, Txt } from '@/components/ui';
import { formatSession, formatWeeks } from '@/data/format';
import { sameTeachingClass, sessionWeeks, validMonday } from '@/data/schedule';
import { useStore } from '@/data/store';
import { CAMPUS_ENTRY, captureVpnPrefix, grabScheduleScript, isSchedulePage, parseBrowserMessage, SCHEDULE_PATH, stageHint, VPN_ENTRY, VPN_PREFIX } from '@/lib/swufe/browser';
import { coursesFromApi, coursesFromHtml, type ScheduleResult } from '@/lib/swufe/parser';
import { useTheme } from '@/theme/useTheme';

export default function SwufeImportScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { courses, importCourses, timetable } = useStore();
  const browser = useRef<SchoolBrowserHandle>(null);
  const [mode, setMode] = useState<'vpn' | 'campus'>('vpn');
  const [session, setSession] = useState(0);
  const [href, setHref] = useState(VPN_ENTRY);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ScheduleResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [start, setStart] = useState('');
  const prefix = useRef(VPN_PREFIX);
  const request = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const submitted = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);

  function cancelRead() {
    clearTimeout(timer.current);
    request.current = null;
    setBusy(false);
  }

  function showPreview(result: ScheduleResult) {
    cancelRead();
    setError('');
    setStart(timetable.starts[result.term] ?? '');
    setSelected(new Set(result.courses.map((c) => c.id)));
    setPreview(result);
  }

  function onMessage(raw: string, page: string) {
    const message = parseBrowserMessage(raw, page);
    if (!message) return;
    if (message.type === 'probe') {
      setHref(message.href);
      setReady(isSchedulePage(message.href) && message.hasTable === true);
      const captured = captureVpnPrefix(message.href);
      if (captured) prefix.current = captured;
      return;
    }
    if (!request.current || message.requestId !== request.current) return;
    cancelRead();
    if (message.type === 'error') { setError(typeof message.message === 'string' ? message.message : '读取失败，请重新查询'); return; }
    if (message.type !== 'schedule' || !isSchedulePage(message.href)) {
      setError('请打开“个人课表查询”并查询后再读取');
      return;
    }
    try {
      const result = message.source === 'api' && typeof message.term === 'string'
        ? coursesFromApi(message.data, message.term)
        : typeof message.html === 'string' ? coursesFromHtml(message.html) : null;
      if (!result) throw new Error('未收到有效课表，请重新查询后读取');
      showPreview(result);
    } catch (e) { setError(e instanceof Error ? e.message : '课表解析失败'); }
  }

  function reset(nextMode = mode) {
    cancelRead();
    setMode(nextMode);
    setReady(false);
    setPreview(null);
    setError('');
    prefix.current = VPN_PREFIX;
    setHref(nextMode === 'vpn' ? VPN_ENTRY : CAMPUS_ENTRY);
    setSession((n) => n + 1);
  }

  function read() {
    if (busy || request.current) return;
    if (!browser.current) { setError('网页正在打开，请稍后重试'); return; }
    setError('');
    const id = `${Date.now()}-${session}`;
    request.current = id;
    setBusy(true);
    timer.current = setTimeout(() => {
      if (request.current !== id) return;
      cancelRead();
      setError('读取超时，请重新查询课表后重试');
    }, 10000);
    browser.current?.inject(grabScheduleScript(id));
  }

  async function confirm() {
    if (!preview || !selected.size || submitted.current) return;
    const date = start.trim();
    if (date && !validMonday(date)) { setError('请输入有效的第一周周一日期，例如 2026-09-07'); return; }
    submitted.current = true;
    setBusy(true);
    setError('');
    let receipt: Awaited<ReturnType<typeof importCourses>>;
    try {
      receipt = await importCourses(preview.courses.filter((c) => selected.has(c.id)), preview.term, date || undefined);
    } catch {
      submitted.current = false;
      if (mounted.current) {
        setBusy(false);
        setError('保存失败，原课表没有改变。请检查手机存储空间后重试');
      }
      return;
    }
    haptic.success();
    if (mounted.current) {
      if (router.canGoBack()) router.back();
      else router.replace('/timetable');
    }
    toast(`新增 ${receipt.added} 门，更新 ${receipt.updated} 门课程`, { label: '撤销', onPress: receipt.undo });
  }

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <Backdrop />
      <View style={styles.header}>
        <Press disabled={busy} onPress={preview ? () => { setPreview(null); setError(''); } : closeModal} hitSlop={12} accessibilityLabel={preview ? '返回教务网页' : '关闭导入'}>
          <Ionicons name={preview ? 'chevron-back' : 'close'} size={24} color={theme.text} />
        </Press>
        <Txt variant="title" style={{ flex: 1 }}>{preview ? '确认课表' : '从教务导入'}</Txt>
        {!preview && Platform.OS !== 'web' && <>
          <Chip label="校外" active={mode === 'vpn'} onPress={() => mode !== 'vpn' && reset('vpn')} />
          <Chip label="校内" active={mode === 'campus'} onPress={() => mode !== 'campus' && reset('campus')} />
        </>}
      </View>

      {!!error && <View style={[styles.notice, { backgroundColor: theme.accentSoft }]}><Txt variant="sub" tone="urgent">{error}</Txt></View>}

      {preview && <>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
          <Txt variant="label">{preview.term}</Txt>
          <Txt variant="sub" tone="sub">同一教学班的多个上课安排共用一份作业。导入会更新已识别的课程，保留现有课程和作业。</Txt>
          {preview.courses.some((c) => !c.source?.classId) &&
            <Txt variant="caption" tone="sub">部分课程尚未确认教学班，只作为本地课程保存。若已在教务页面，请返回后重新点“查询”再读取。</Txt>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="全选" onPress={() => setSelected(new Set(preview.courses.map((c) => c.id)))} />
            <Chip label="全不选" onPress={() => setSelected(new Set())} />
          </View>
          {preview.courses.map((course) => {
            const checked = selected.has(course.id);
            const existing = courses.some((c) => sameTeachingClass(c, course));
            return <Card key={course.id}>
              <Press accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => {
                haptic.select();
                setSelected((old) => { const next = new Set(old); if (next.has(course.id)) next.delete(course.id); else next.add(course.id); return next; });
              }} style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={21} color={checked ? theme.accent : theme.faint} />
                  <Txt variant="label" style={{ flex: 1 }}>{course.name}</Txt>
                  <Txt variant="caption" tone={existing ? 'accent' : 'sub'}>{existing ? '更新' : '新增'}</Txt>
                </View>
                <Txt variant="caption" tone="sub" style={{ marginTop: 7 }}>{course.teacher} · {course.source?.classId ? '教学班已识别' : '教学班待确认'}</Txt>
                {course.sessions.map((s, i) => <Txt key={i} variant="caption" tone="sub" style={{ marginTop: 6 }}>
                  {formatSession(s)} · {formatWeeks(sessionWeeks(course, s))} · {s.location || '地点未填写'}
                </Txt>)}
              </Press>
            </Card>;
          })}
          <Field label="第一周的周一日期（可选）" placeholder="YYYY-MM-DD" value={start} onChangeText={setStart} autoCapitalize="none" />
          <Txt variant="caption" tone="sub">填写后自动计算当前周；不填写时可手动查看周次。</Txt>
        </ScrollView>
        <View style={{ padding: 20, paddingBottom: insets.bottom + 16 }}>
          <PrimaryButton label={busy ? '正在保存…' : `导入所选 ${selected.size} 门课程`} onPress={confirm} disabled={!selected.size || busy} />
        </View>
      </>}
      {/* 预览时保留浏览器实例，返回修改学期无需重新登录。 */}
      <View style={{ flex: preview ? 0 : 1, display: preview ? 'none' : 'flex' }}>
        {Platform.OS !== 'web' && <View style={styles.notice}>
          <Txt variant="sub" tone="sub">{stageHint(href, ready)}</Txt>
          <Txt variant="caption" tone="faint" style={{ marginTop: 5 }}>账号密码只在学校网页输入，课表在本机处理。</Txt>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
            <Press onPress={() => reset()}><Txt variant="caption" tone="accent">清除会话并重新登录</Txt></Press>
            {!!error && <Press onPress={() => { setError(''); browser.current?.reload(); }}><Txt variant="caption" tone="accent">重试加载</Txt></Press>}
            {/\/xtgl\/index_initMenu|\/kbcx\//i.test(href) && <Press onPress={() => {
              const url = mode === 'vpn' ? prefix.current + SCHEDULE_PATH : 'http://jwxt.swufe.edu.cn' + SCHEDULE_PATH;
              browser.current?.inject(`location.href=${JSON.stringify(url)};true;`);
            }}><Txt variant="caption" tone="accent">打开课表查询</Txt></Press>}
          </View>
        </View>}
        <SchoolBrowser key={`${mode}-${session}`} ref={browser} entry={mode === 'vpn' ? VPN_ENTRY : CAMPUS_ENTRY}
          onMessage={onMessage} onError={setError}
          onNavigate={(page) => { cancelRead(); setHref(page); setReady(false); }}
          onHtml={(html) => { try { showPreview(coursesFromHtml(html)); } catch (e) { setError(e instanceof Error ? e.message : '课表解析失败'); } }} />
        {Platform.OS !== 'web' && <View style={{ padding: 16, paddingBottom: insets.bottom + 12 }}>
          <PrimaryButton label={busy ? '正在读取…' : '读取课表并预览'} onPress={read} disabled={busy} />
        </View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  notice: { paddingHorizontal: 20, paddingVertical: 12 },
});
