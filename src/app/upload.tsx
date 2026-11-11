import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { CalendarPicker } from '@/components/CalendarPicker';
import { TimePicker } from '@/components/TimePicker';
import { useToast } from '@/components/Toast';
import { Chip, ChipGroup, closeModal, Field, ModalScreen, Press, PrimaryButton, Txt } from '@/components/ui';
import { dayDiff, hhmm, isoWeekday, weekdayNames } from '@/data/format';
import { errorText, useOnline } from '@/data/online';
import { useStore } from '@/data/store';
import { SubmitMethod } from '@/data/types';
import { useTheme } from '@/theme/useTheme';

const times = ['08:00', '12:00', '18:00', '23:59'];
const methods: SubmitMethod[] = ['纸质', '学习通', '邮箱', '其他'];
// 作业是从哪听来的，方便大家判断靠不靠谱
const sources = ['课堂口头', '学习通', '群通知'];

function dayFromToday(offset: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function nextDays() {
  return Array.from({ length: 7 }, (_, i) => {
    const date = dayFromToday(i);
    const label = i === 0 ? '今天' : i === 1 ? '明天' : weekdayNames[isoWeekday(date)];
    return { offset: i, label, date };
  });
}

export default function Upload() {
  const { theme } = useTheme();
  const { courses: allCourses, homework, addHomework, updateHomework, courseById, timetable } = useStore();
  const toast = useToast();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  // 带着 id 打开就是编辑自己上传过的作业，表单先填好原来的内容
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = homework.find((h) => h.id === id && h.mine);
  const courses = allCourses.filter((c) => c.id === editing?.courseId || (timetable.term ? c.source?.term === timetable.term : !c.source));

  const [courseId, setCourseId] = useState<string | null>(editing?.courseId ?? null);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [date, setDate] = useState(() => {
    if (!editing) return dayFromToday(1);
    const d = new Date(editing.due);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [time, setTime] = useState(editing ? hhmm(editing.due) : '23:59');
  const [timeOpen, setTimeOpen] = useState(false);
  const [submit, setSubmit] = useState<SubmitMethod>(editing?.submit ?? '学习通');
  const [detail, setDetail] = useState(editing?.detail ?? '');
  const [hasPhoto, setHasPhoto] = useState(editing?.hasPhoto ?? false);
  const [source, setSource] = useState(editing?.remote?.source ?? '课堂口头');
  const course = courseId ? courseById(courseId) : undefined;
  // 这门课已经接上服务器了：发布到班里，要先登录
  const shared = !!course?.serverClassId;
  const needLogin = shared && !online.loggedIn;

  const ready = courseId !== null && title.trim().length > 0;
  const quickDays = nextDays();
  // 选的日期不在最近 7 天里，就是自定义的日期
  const customDate = dayDiff(date) > 6;
  const customTime = !times.includes(time);

  async function publish() {
    if (!courseId || busy) return;
    const due = new Date(date);
    const [h, m] = time.split(':').map(Number);
    due.setHours(h, m, 0, 0);
    const data = { courseId, title: title.trim(), detail: detail.trim(), due, submit, hasPhoto };
    if (shared) {
      // 先等服务器收下再关页面；被拒绝（比如新同学今天传满了）就留在这里，内容不丢
      setBusy(true);
      try {
        const payload = { title: data.title, detail: data.detail, due, submit, source };
        if (editing?.remote) await online.edit(editing, { ...payload, dueKind: 'at', due: due.toISOString() });
        else await online.upload(course!.serverClassId!, payload);
        closeModal();
        toast(editing ? '已保存修改' : '已发布，班里的同学都能看到了');
      } catch (e) {
        toast(errorText(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    closeModal();
    if (editing) {
      updateHomework(editing.id, data);
      toast('已保存修改');
      return;
    }
    addHomework(data);
    toast(course?.source ? '已保存在本机，联网共享功能尚未接入' : `已发布，同课的 ${course?.members ?? 0} 位同学都能看到了`);
  }

  return (
    <ModalScreen
      title={editing ? '编辑作业' : '上传作业'}
      footer={
        needLogin ? (
          <PrimaryButton label="登录后发布" onPress={() => router.push('/login')} />
        ) : (
          <PrimaryButton label={busy ? '发布中…' : editing ? '保存' : '发布'} onPress={publish} disabled={!ready || busy} />
        )
      }>
      {courses.length === 0 && (
        <Txt variant="caption" tone="faint">
          课表里还没有课，先去「课表」添加课程，才能给它上传作业。
        </Txt>
      )}
      <ChipGroup label="哪门课">
        {courses.map((c) => (
          <Chip key={c.id} label={c.name} active={courseId === c.id} onPress={() => setCourseId(c.id)} />
        ))}
      </ChipGroup>

      <Field label="作业标题" placeholder="比如：习题 3.2" value={title} onChangeText={setTitle} />

      <ChipGroup label="截止日期">
        {quickDays.map((d) => (
          <Chip
            key={d.offset}
            label={d.label}
            active={dayDiff(date) === d.offset}
            onPress={() => {
              setDate(d.date);
              setCalendarOpen(false);
            }}
          />
        ))}
        <Chip
          label={customDate ? `${date.getMonth() + 1} 月 ${date.getDate()} 日` : '自定义'}
          active={customDate || calendarOpen}
          onPress={() => setCalendarOpen((v) => !v)}
        />
      </ChipGroup>
      {calendarOpen && (
        <CalendarPicker
          value={date}
          onChange={(d) => {
            setDate(d);
            // 选到最近 7 天里的日子时，上面对应的按钮会亮起，月历就可以收起来了
            if (dayDiff(d) <= 6) setCalendarOpen(false);
          }}
        />
      )}
      <ChipGroup label="截止时间">
        {times.map((t) => (
          <Chip
            key={t}
            label={t}
            active={time === t}
            onPress={() => {
              setTime(t);
              setTimeOpen(false);
            }}
          />
        ))}
        <Chip label={customTime ? time : '自定义'} active={customTime || timeOpen} onPress={() => setTimeOpen((v) => !v)} />
      </ChipGroup>
      {timeOpen && <TimePicker value={time} onChange={setTime} />}

      <ChipGroup label="提交方式">
        {methods.map((m) => (
          <Chip key={m} label={m} active={submit === m} onPress={() => setSubmit(m)} />
        ))}
      </ChipGroup>

      {shared && (
        <ChipGroup label="从哪知道的">
          {sources.map((x) => (
            <Chip key={x} label={x} active={source === x} onPress={() => setSource(x)} />
          ))}
        </ChipGroup>
      )}

      <Field label="要求（可选）" placeholder="页码、题号、格式要求……" value={detail} onChangeText={setDetail} multiline />

      {/* 照片这一版还不上传，接上服务器的课先不显示，免得以为传上去了 */}
      {!shared && (
      <Press
        onPress={() => setHasPhoto((v) => !v)}
        style={[styles.photo, { borderColor: hasPhoto ? theme.accent : theme.line, backgroundColor: hasPhoto ? theme.accentSoft : 'transparent' }]}>
        <Ionicons name={hasPhoto ? 'image' : 'camera-outline'} size={20} color={hasPhoto ? theme.accent : theme.sub} />
        <Txt variant="sub" tone={hasPhoto ? 'accent' : 'sub'} style={{ marginLeft: 8 }}>
          {hasPhoto ? '已添加 1 张照片（演示）' : '拍黑板 / 拍 PPT'}
        </Txt>
      </Press>
      )}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  photo: {
    marginTop: 22,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
