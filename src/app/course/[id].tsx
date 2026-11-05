import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card, ModalScreen, Press, Section, Txt } from '@/components/ui';
import { formatDue, formatSession, formatWeeks, isUrgent } from '@/data/format';
import { useStore } from '@/data/store';
import { useTheme } from '@/theme/ThemeProvider';

export default function CourseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { courseById, homework } = useStore();
  const course = courseById(id);

  if (!course) {
    return (
      <ModalScreen>
        <Txt tone="sub">没有找到这门课</Txt>
      </ModalScreen>
    );
  }

  const items = homework.filter((h) => h.courseId === course.id).sort((a, b) => b.due.getTime() - a.due.getTime());
  const hue = theme.courseHues[course.hue % theme.courseHues.length];

  return (
    <ModalScreen>
      <View style={[styles.mark, { backgroundColor: hue }]} />
      <Txt variant="display" style={{ fontSize: 26, marginTop: 12 }}>
        {course.name}
      </Txt>
      <Txt variant="sub" tone="sub" style={{ marginTop: 6 }}>
        {course.teacher} · {formatWeeks(course.weeks)} · {course.members} 位同学已加入
      </Txt>

      <Section title="上课时间">
        <Card>
          {course.sessions.map((s, i) => (
            <View
              key={i}
              style={[styles.row, i < course.sessions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line }]}>
              <Txt variant="sub">{formatSession(s)}</Txt>
              <Txt variant="sub" tone="sub">
                {s.location}
              </Txt>
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
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  mark: { width: 28, height: 4, borderRadius: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
});
