import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { CalendarPicker } from '@/components/CalendarPicker';
import { TimePicker } from '@/components/TimePicker';
import { useToast } from '@/components/Toast';
import { Chip, ChipGroup, closeModal, Field, ModalScreen, Press, PrimaryButton, Txt } from '@/components/ui';
import { dayDiff, isoWeekday, weekdayNames } from '@/data/format';
import { useStore } from '@/data/store';
import { SubmitMethod } from '@/data/types';
import { useTheme } from '@/theme/useTheme';

const times = ['08:00', '12:00', '18:00', '23:59'];
const methods: SubmitMethod[] = ['纸质', '学习通', '邮箱', '其他'];

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
  const { courses, addHomework, courseById } = useStore();
  const toast = useToast();

  const [courseId, setCourseId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => dayFromToday(1));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [time, setTime] = useState('23:59');
  const [timeOpen, setTimeOpen] = useState(false);
  const [submit, setSubmit] = useState<SubmitMethod>('学习通');
  const [detail, setDetail] = useState('');
  const [hasPhoto, setHasPhoto] = useState(false);

  const ready = courseId !== null && title.trim().length > 0;
  const quickDays = nextDays();
  // 选的日期不在最近 7 天里，就是自定义的日期
  const customDate = dayDiff(date) > 6;
  const customTime = !times.includes(time);

  function publish() {
    if (!courseId) return;
    const due = new Date(date);
    const [h, m] = time.split(':').map(Number);
    due.setHours(h, m, 0, 0);
    addHomework({ courseId, title: title.trim(), detail: detail.trim(), due, submit, hasPhoto });
    closeModal();
    const course = courseById(courseId);
    toast(`已发布，同课的 ${course?.members ?? 0} 位同学都能看到了`);
  }

  return (
    <ModalScreen title="上传作业" footer={<PrimaryButton label="发布" onPress={publish} disabled={!ready} />}>
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

      <Field label="要求（可选）" placeholder="页码、题号、格式要求……" value={detail} onChangeText={setDetail} multiline />

      <Press
        onPress={() => setHasPhoto((v) => !v)}
        style={[styles.photo, { borderColor: hasPhoto ? theme.accent : theme.line, backgroundColor: hasPhoto ? theme.accentSoft : 'transparent' }]}>
        <Ionicons name={hasPhoto ? 'image' : 'camera-outline'} size={20} color={hasPhoto ? theme.accent : theme.sub} />
        <Txt variant="sub" tone={hasPhoto ? 'accent' : 'sub'} style={{ marginLeft: 8 }}>
          {hasPhoto ? '已添加 1 张照片（演示）' : '拍黑板 / 拍 PPT'}
        </Txt>
      </Press>
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
