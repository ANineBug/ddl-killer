import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useToast } from '@/components/Toast';
import { Chip, ChipGroup, closeModal, Field, ModalScreen, PrimaryButton, Txt } from '@/components/ui';
import { weekdayNames } from '@/data/format';
import { useStore } from '@/data/store';
import { Course, Weekday, WeekRule } from '@/data/types';

const buildings = ['通博楼', '弘远楼', '实验楼', '其他'];
const weekPresets = [
  { label: '1-16 周', from: 1, to: 16 },
  { label: '1-8 周', from: 1, to: 8 },
  { label: '9-16 周', from: 9, to: 16 },
];
const rules: { label: string; value: WeekRule }[] = [
  { label: '每周', value: 'all' },
  { label: '单周', value: 'odd' },
  { label: '双周', value: 'even' },
];

// "通博楼 B101" 拆成教学楼和教室；不是列表里的楼就算"其他"，整段当作地点
function splitLocation(location: string) {
  const space = location.indexOf(' ');
  const b = space > 0 ? location.slice(0, space) : '';
  if (buildings.includes(b) && b !== '其他') return { building: b, room: location.slice(space + 1) };
  return { building: '其他', room: location };
}

// 编辑时原来的周次不在预设里，就临时加一个选项
function weeksOptions(editing?: Course) {
  if (!editing) return weekPresets;
  const { from, to } = editing.weeks;
  if (weekPresets.some((w) => w.from === from && w.to === to)) return weekPresets;
  return [...weekPresets, { label: `${from}-${to} 周`, from, to }];
}

export default function AddCourse() {
  const { addCourse, updateCourse, courseById } = useStore();
  const toast = useToast();
  // 带着 id 打开就是编辑已有的课程
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = id ? courseById(id) : undefined;
  const first = editing?.sessions[0];
  const place = first ? splitLocation(first.location) : { building: '通博楼', room: '' };
  const presets = weeksOptions(editing);

  const [name, setName] = useState(editing?.name ?? '');
  const [teacher, setTeacher] = useState(editing && editing.teacher !== '未填写' ? editing.teacher : '');
  const [weekday, setWeekday] = useState<Weekday>(first?.weekday ?? 1);
  const [from, setFrom] = useState(first?.from ?? 1);
  const [to, setTo] = useState(first?.to ?? 2);
  const [building, setBuilding] = useState(place.building);
  const [room, setRoom] = useState(place.room);
  const [weeks, setWeeks] = useState(
    () => presets.find((w) => editing && w.from === editing.weeks.from && w.to === editing.weeks.to) ?? presets[0],
  );
  const [rule, setRule] = useState<WeekRule>(editing?.weeks.rule ?? 'all');

  const ready = name.trim().length > 0 && room.trim().length > 0;

  function submit() {
    const location = building === '其他' ? room.trim() : `${building} ${room.trim().toUpperCase()}`;
    const data = {
      name: name.trim(),
      teacher: teacher.trim() || '未填写',
      sessions: [{ weekday, from, to, location }],
      weeks: { from: weeks.from, to: weeks.to, rule },
    };
    closeModal();
    if (editing) {
      // 只改第一个上课时间，其余的时间段原样保留
      updateCourse(editing.id, { ...data, sessions: [data.sessions[0], ...editing.sessions.slice(1)] });
      toast('已保存修改');
      return;
    }
    const { course, matched } = addCourse(data);
    toast(matched ? `找到了！已加入「${course.name}」，${course.members} 位同学在这里` : '已创建，你是第一个添加这门课的同学');
  }

  return (
    <ModalScreen
      title={editing ? '编辑课程' : '添加课程'}
      footer={<PrimaryButton label={editing ? '保存' : '添加'} onPress={submit} disabled={!ready} />}>
      <Txt variant="caption" tone="faint">
        {editing && first
          ? editing.sessions.length > 1
            ? `这门课有 ${editing.sessions.length} 个上课时间，这里改的是第一个（${weekdayNames[first.weekday]} ${first.from}-${first.to} 节），其余的保持不变。`
            : '修改后课表会马上更新。'
          : '演示版：时间和地点完全一样，就算同一个教学班。试试填「周一 1-2 节 · 通博楼 B101」。'}
      </Txt>

      <Field label="课程名称" placeholder="比如：概率论与数理统计" value={name} onChangeText={setName} />
      <Field label="教师" placeholder="比如：张老师" value={teacher} onChangeText={setTeacher} />

      <ChipGroup label="星期">
        {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d) => (
          <Chip key={d} label={weekdayNames[d]} active={weekday === d} onPress={() => setWeekday(d)} />
        ))}
      </ChipGroup>

      <ChipGroup label="从第几节">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
          <Chip
            key={n}
            label={String(n)}
            active={from === n}
            onPress={() => {
              setFrom(n);
              if (to < n) setTo(n);
            }}
          />
        ))}
      </ChipGroup>
      <ChipGroup label="到第几节">
        {Array.from({ length: 12 }, (_, i) => i + 1)
          .filter((n) => n >= from)
          .map((n) => (
            <Chip key={n} label={String(n)} active={to === n} onPress={() => setTo(n)} />
          ))}
      </ChipGroup>

      <ChipGroup label="教学楼">
        {buildings.map((b) => (
          <Chip key={b} label={b} active={building === b} onPress={() => setBuilding(b)} />
        ))}
      </ChipGroup>
      <Field
        label={building === '其他' ? '上课地点' : '教室'}
        placeholder={building === '其他' ? '比如：体育馆' : '比如：B101'}
        value={room}
        onChangeText={setRoom}
        autoCapitalize="characters"
      />

      <ChipGroup label="周次">
        {presets.map((w) => (
          <Chip key={w.label} label={w.label} active={weeks.label === w.label} onPress={() => setWeeks(w)} />
        ))}
      </ChipGroup>
      <ChipGroup label="单双周">
        {rules.map((r) => (
          <Chip key={r.value} label={r.label} active={rule === r.value} onPress={() => setRule(r.value)} />
        ))}
      </ChipGroup>
    </ModalScreen>
  );
}
