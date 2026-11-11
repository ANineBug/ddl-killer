import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CalendarPicker } from '@/components/CalendarPicker';
import { TimePicker } from '@/components/TimePicker';
import { useToast } from '@/components/Toast';
import { Chip, ChipGroup, closeModal, Field, ModalScreen, Press, PrimaryButton, Txt } from '@/components/ui';
import { dayDiff, formatDue, hhmm, isoWeekday, isTbd, weekdayNames } from '@/data/format';
import { errorText, useOnline } from '@/data/online';
import { nextClassTime } from '@/data/periods';
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
  const [source, setSource] = useState(editing?.remote?.source ?? '课堂口头');
  // 截止方式：具体时间 / 下次课前（按课表算出下次上课的时间）/ 待定
  const [dueKind, setDueKind] = useState<'at' | 'next_class' | 'tbd'>(editing?.remote?.dueKind ?? 'at');
  const [optional, setOptional] = useState(editing?.remote?.optional ?? false);
  const [groupWork, setGroupWork] = useState(editing?.remote?.groupWork ?? false);
  const course = courseId ? courseById(courseId) : undefined;
  // 这门课已经接上服务器了：发布到班里，要先登录
  const shared = !!course?.serverClassId;
  const needLogin = shared && !online.loggedIn;
  const nextClass = course ? nextClassTime(course, course.source ? timetable.starts[course.source.term] : undefined) : null;
  // 这门课已经有人传过的、还没截止的作业：发布前先看一眼，免得重复传
  const existing = shared && !editing ? homework.filter((h) => h.courseId === courseId && h.remote && h.remote.state !== 'closed' && h.remote.state !== 'cancelled') : [];

  const ready = courseId !== null && title.trim().length > 0 && !(dueKind === 'next_class' && !nextClass);
  const quickDays = nextDays();
  // 选的日期不在最近 7 天里，就是自定义的日期
  const customDate = dayDiff(date) > 6;
  const customTime = !times.includes(time);

  async function publish() {
    if (!courseId || busy) return;
    let due = new Date(date);
    const [h, m] = time.split(':').map(Number);
    due.setHours(h, m, 0, 0);
    if (dueKind === 'next_class' && nextClass) due = nextClass;
    const data = { courseId, title: title.trim(), detail: detail.trim(), due, submit, hasPhoto: false };
    if (shared) {
      // 先等服务器收下再关页面；被拒绝（比如新同学今天传满了）就留在这里，内容不丢
      setBusy(true);
      try {
        const payload = { title: data.title, detail: data.detail, dueKind, due: dueKind === 'tbd' ? null : due, submit, source, optional, groupWork };
        if (editing?.remote) await online.edit(editing, { ...payload, due: payload.due ? payload.due.toISOString() : null });
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

      {existing.length > 0 && (
        <View style={[styles.existing, { borderColor: theme.line }]}>
          <Txt variant="caption" tone="sub" style={{ marginBottom: 6 }}>
            这门课已经有人传了这些，是同一个的话就不用再传了
          </Txt>
          {existing.slice(0, 5).map((h) => (
            <Press key={h.id} onPress={() => router.push(`/homework/${h.id}`)} style={styles.existingRow}>
              <Txt variant="sub" numberOfLines={1} style={{ flex: 1 }}>
                {h.title}
              </Txt>
              <Txt variant="caption" tone="faint">
                {isTbd(h.due) ? '待定' : formatDue(h.due, true)} ›
              </Txt>
            </Press>
          ))}
        </View>
      )}

      {shared && (
        <ChipGroup label="什么时候截止">
          <Chip label="具体时间" active={dueKind === 'at'} onPress={() => setDueKind('at')} />
          <Chip label="下次课前" active={dueKind === 'next_class'} onPress={() => setDueKind('next_class')} />
          <Chip label="待定" active={dueKind === 'tbd'} onPress={() => setDueKind('tbd')} />
        </ChipGroup>
      )}
      {shared && dueKind === 'next_class' && (
        <Txt variant="caption" tone={nextClass ? 'sub' : 'urgent'} style={{ marginTop: 8, marginLeft: 4 }}>
          {nextClass ? `下次上课：${formatDue(nextClass)}，按这个时间提醒` : '课表里找不到这门课接下来的上课时间，请选具体时间'}
        </Txt>
      )}
      {shared && dueKind === 'tbd' && (
        <Txt variant="caption" tone="sub" style={{ marginTop: 8, marginLeft: 4 }}>
          老师还没说什么时候交。定下来以后，谁知道了点「有问题 → 老师改了」补上
        </Txt>
      )}

      {(!shared || dueKind === 'at') && (
      <>
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
      </>
      )}

      <ChipGroup label="提交方式">
        {methods.map((m) => (
          <Chip key={m} label={m} active={submit === m} onPress={() => setSubmit(m)} />
        ))}
      </ChipGroup>

      {shared && (
        <ChipGroup label="标签">
          <Chip label="选做（非必做）" active={optional} onPress={() => setOptional((v) => !v)} />
          <Chip label="小组作业" active={groupWork} onPress={() => setGroupWork((v) => !v)} />
        </ChipGroup>
      )}

      {shared && (
        <ChipGroup label="从哪知道的">
          {sources.map((x) => (
            <Chip key={x} label={x} active={source === x} onPress={() => setSource(x)} />
          ))}
        </ChipGroup>
      )}

      <Field label="要求（可选）" placeholder="页码、题号、格式要求……" value={detail} onChangeText={setDetail} multiline />

    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  existing: { marginTop: 18, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 12 },
  existingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
});
