import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useToast } from '@/components/Toast';
import { Chip, ChipGroup, closeModal, Field, ModalScreen, PrimaryButton, Txt } from '@/components/ui';
import { formatSession, weekdayNames } from '@/data/format';
import { courseWeeks, sessionWeeks } from '@/data/schedule';
import { useStore } from '@/data/store';
import type { Course, Session, Weekday } from '@/data/types';
import { parseWeeks, weeksToText } from '@/lib/swufe/parser';

const buildings = ['通博楼', '弘远楼', '实验楼', '经世楼', '颐德楼', '其他'];

function splitLocation(location: string) {
  const space = location.indexOf(' ');
  const building = space > 0 ? location.slice(0, space) : '';
  if (buildings.includes(building) && building !== '其他') return { building, room: location.slice(space + 1) };
  return { building: '其他', room: location };
}

export default function AddCourse() {
  const { courseById } = useStore();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = id ? courseById(id) : undefined;
  const [sessionIndex, setSessionIndex] = useState(0);
  return <CourseForm key={`${id ?? 'new'}-${sessionIndex}`} editing={editing} index={sessionIndex} selectSession={setSessionIndex} />;
}

function CourseForm({ editing, index, selectSession }: { editing?: Course; index: number; selectSession: (i: number) => void }) {
  const { addCourse, updateCourse, setTimetable } = useStore();
  const toast = useToast();
  const first = editing?.sessions[index];
  const place = first ? splitLocation(first.location) : { building: '通博楼', room: '' };
  const [name, setName] = useState(editing?.name ?? '');
  const [teacher, setTeacher] = useState(first?.teacher ?? editing?.teacher ?? '');
  const [weekday, setWeekday] = useState<Weekday>(first?.weekday ?? 1);
  const [from, setFrom] = useState(first?.from ?? 1);
  const [to, setTo] = useState(first?.to ?? 2);
  const [building, setBuilding] = useState(place.building);
  const [room, setRoom] = useState(place.room);
  const [weeksText, setWeeksText] = useState(first && editing ? weeksToText(sessionWeeks(editing, first)) : '1-16');
  let weeks: Session['weeks'] = [];
  let weekError = '';
  try { weeks = parseWeeks(weeksText); } catch (e) { weekError = e instanceof Error ? e.message : '周次格式错误'; }
  const ready = name.trim().length > 0 && room.trim().length > 0 && !weekError;

  function submit() {
    if (!ready) return;
    const location = building === '其他' ? room.trim() : `${building} ${room.trim().toUpperCase()}`;
    const session: Session = { weekday, from, to, location, weeks, teacher: teacher.trim() || '未填写' };
    const sessions = editing ? editing.sessions.map((s, i) => i === index ? session : s) : [session];
    if (editing && index === editing.sessions.length) sessions.push(session);
    const data = { name: name.trim(), teacher: [...new Set(sessions.map((s) => s.teacher || editing?.teacher || '未填写'))].join('、'),
      sessions, weeks: courseWeeks(sessions) };
    if (editing) {
      // 编辑安排保留学校的教学班身份，作业仍关联原来的课程 id。
      updateCourse(editing.id, { ...editing, ...data });
      toast('已保存修改');
    } else {
      const { matched } = addCourse(data);
      setTimetable({ term: undefined });
      toast(matched ? '这门课程已在课表中' : '已添加本地课程');
    }
    closeModal();
  }

  return (
    <ModalScreen title={editing ? '编辑课程' : '添加课程'} footer={<PrimaryButton label={editing ? '保存' : '添加'} onPress={submit} disabled={!ready} />}>
      {editing ? <>
        <Txt variant="caption" tone="faint">每次编辑一个上课安排，其他时间、周次和教室保持不变。</Txt>
        <ChipGroup label="选择上课安排">
          {editing.sessions.map((s, i) => <Chip key={i} label={`${formatSession(s)} · ${i + 1}`} active={index === i} onPress={() => selectSession(i)} />)}
          <Chip label="增加上课安排" active={index === editing.sessions.length} onPress={() => selectSession(editing.sessions.length)} />
        </ChipGroup>
      </> : <Txt variant="caption" tone="faint">手动添加的课程保存在本机，也可以从课表页导入教务课表。</Txt>}
      <Field label="课程名称" placeholder="比如：概率论与数理统计" value={name} onChangeText={setName} />
      <Field label="本次上课教师" placeholder="比如：张老师" value={teacher} onChangeText={setTeacher} />
      <ChipGroup label="星期">
        {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d) => <Chip key={d} label={weekdayNames[d]} active={weekday === d} onPress={() => setWeekday(d)} />)}
      </ChipGroup>
      <ChipGroup label="从第几节">
        {Array.from({ length: Math.max(12, first?.to ?? 12) }, (_, i) => i + 1).map((n) => <Chip key={n} label={String(n)} active={from === n}
          onPress={() => { setFrom(n); if (to < n) setTo(n); }} />)}
      </ChipGroup>
      <ChipGroup label="到第几节">
        {Array.from({ length: Math.max(12, first?.to ?? 12) }, (_, i) => i + 1).filter((n) => n >= from)
          .map((n) => <Chip key={n} label={String(n)} active={to === n} onPress={() => setTo(n)} />)}
      </ChipGroup>
      <ChipGroup label="教学楼">
        {buildings.map((b) => <Chip key={b} label={b} active={building === b} onPress={() => setBuilding(b)} />)}
      </ChipGroup>
      <Field label={building === '其他' ? '上课地点' : '教室'} placeholder={building === '其他' ? '比如：体育馆' : '比如：B101'}
        value={room} onChangeText={setRoom} autoCapitalize="characters" />
      <ChipGroup label="周次预设">
        {['1-16', '1-8', '9-16', '1-17单', '1-16双'].map((w) => <Chip key={w} label={`${w}周`} active={weeksText === w} onPress={() => setWeeksText(w)} />)}
      </ChipGroup>
      <Field label="上课周次" placeholder="例如：1-5、7-17；7-13单；3、7" value={weeksText} onChangeText={setWeeksText} />
      <Txt variant="caption" tone={weekError ? 'urgent' : 'faint'} style={{ marginTop: 8 }}>{weekError || '支持多段周次和单双周，例如“1-5、7-17”或“7-13单”。'}</Txt>
    </ModalScreen>
  );
}
