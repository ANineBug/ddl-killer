import { useState } from 'react';

import { useToast } from '@/components/Toast';
import { Chip, ChipGroup, closeModal, Field, ModalScreen, PrimaryButton, Txt } from '@/components/ui';
import { weekdayNames } from '@/data/format';
import { useStore } from '@/data/store';
import { Weekday, WeekRule } from '@/data/types';

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

export default function AddCourse() {
  const { addCourse } = useStore();
  const toast = useToast();

  const [name, setName] = useState('');
  const [teacher, setTeacher] = useState('');
  const [weekday, setWeekday] = useState<Weekday>(1);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(2);
  const [building, setBuilding] = useState('通博楼');
  const [room, setRoom] = useState('');
  const [weeks, setWeeks] = useState(weekPresets[0]);
  const [rule, setRule] = useState<WeekRule>('all');

  const ready = name.trim().length > 0 && room.trim().length > 0;

  function submit() {
    const location = building === '其他' ? room.trim() : `${building} ${room.trim().toUpperCase()}`;
    const { course, matched } = addCourse({
      name: name.trim(),
      teacher: teacher.trim() || '未填写',
      sessions: [{ weekday, from, to, location }],
      weeks: { from: weeks.from, to: weeks.to, rule },
    });
    closeModal();
    toast(matched ? `找到了！已加入「${course.name}」，${course.members} 位同学在这里` : '已创建，你是第一个添加这门课的同学');
  }

  return (
    <ModalScreen title="添加课程" footer={<PrimaryButton label="添加" onPress={submit} disabled={!ready} />}>
      <Txt variant="caption" tone="faint">
        演示版：时间和地点完全一样，就算同一个教学班。试试填「周一 1-2 节 · 通博楼 B101」。
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
        {weekPresets.map((w) => (
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
