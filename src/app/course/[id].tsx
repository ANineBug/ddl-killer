import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptic } from '@/components/haptic';
import { useToast } from '@/components/Toast';
import { Card, closeModal, ModalScreen, Press, Section, Txt } from '@/components/ui';
import { formatDue, formatSession, formatWeeks, isUrgent } from '@/data/format';
import { useStore } from '@/data/store';
import { sessionWeeks } from '@/data/schedule';
import { useTheme } from '@/theme/useTheme';

export default function CourseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { courseById, homework, removeCourse, restoreCourse } = useStore();
  const toast = useToast();
  // 删除后页面还在往下收起，这段时间里继续显示删之前的内容
  const found = courseById(id);
  const [last, setLast] = useState({ id, course: found });
  if (last.id !== id || (found && found !== last.course)) setLast({ id, course: found });
  const course = found ?? (last.id === id ? last.course : undefined);

  if (!course) {
    return (
      <ModalScreen>
        <Txt tone="sub">没有找到这门课</Txt>
      </ModalScreen>
    );
  }

  const items = homework.filter((h) => h.courseId === course.id).sort((a, b) => b.due.getTime() - a.due.getTime());
  const hue = theme.courseHues[course.hue % theme.courseHues.length];

  function remove() {
    if (!course) return;
    haptic.light();
    const removed = removeCourse(course.id);
    closeModal();
    if (!removed) return;
    const extra = removed.homework.length ? `和 ${removed.homework.length} 条作业` : '';
    toast(`已删除「${course.name}」${extra}`, { label: '撤销', onPress: () => restoreCourse(removed) });
  }

  return (
    <ModalScreen>
      <View style={[styles.mark, { backgroundColor: hue }]} />
      <Txt variant="display" style={{ fontSize: 26, marginTop: 12 }}>
        {course.name}
      </Txt>
      <Txt variant="sub" tone="sub" style={{ marginTop: 6 }}>
        {course.teacher} · {formatWeeks(course.weeks)}{course.members > 0 ? ` · ${course.members} 位同学已加入` : ''}
      </Txt>
      {!!course.source && <Txt variant="caption" tone="sub" style={{ marginTop: 8 }}>
        {course.source.term} · {course.source.classId ? '教学班已识别' : '本地课程 · 教学班待确认'}
        {course.source.className ? ` · ${course.source.className}` : ''}
      </Txt>}

      <Section title="上课时间">
        <Card>
          {course.sessions.map((s, i) => (
            <View
              key={i}
              style={[styles.row, i < course.sessions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line }]}>
              <View style={{ flex: 1, gap: 5 }}>
                <Txt variant="sub">{formatSession(s)} · {formatWeeks(sessionWeeks(course, s))}</Txt>
                <Txt variant="caption" tone="sub">{s.location || '地点未填写'} · {s.teacher || course.teacher}</Txt>
              </View>
            </View>
          ))}
        </Card>
      </Section>

      <Section title={`这门课的作业 · ${items.length}`}>
        {items.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <Txt variant="sub" tone="sub">
              还没有同学上传，你可以做第一个
            </Txt>
          </Card>
        ) : (
          <Card>
            {items.map((h, i) => (
              <Press
                key={h.id}
                onPress={() => router.push(`/homework/${h.id}`)}
                style={[styles.row, i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line }]}>
                <Txt tone={h.done ? 'sub' : 'text'} style={h.done && { textDecorationLine: 'line-through' }}>
                  {h.title}
                </Txt>
                <Txt variant="caption" tone={!h.done && isUrgent(h.due) ? 'urgent' : 'sub'}>
                  {formatDue(h.due)}
                </Txt>
              </Press>
            ))}
          </Card>
        )}
      </Section>

      <View style={styles.actions}>
        <Press onPress={() => router.push(`/add-course?id=${course.id}`)} style={[styles.action, { borderColor: theme.line }]}>
          <Ionicons name="create-outline" size={16} color={theme.sub} />
          <Txt variant="sub" tone="sub">
            编辑课程
          </Txt>
        </Press>
        <Press onPress={remove} style={[styles.action, { borderColor: theme.line }]}>
          <Ionicons name="trash-outline" size={16} color={theme.urgent} />
          <Txt variant="sub" tone="urgent">
            从课表删除
          </Txt>
        </Press>
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  mark: { width: 28, height: 4, borderRadius: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 28 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 999, borderWidth: 1 },
});
