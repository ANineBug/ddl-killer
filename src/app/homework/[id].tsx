import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, closeModal, ModalScreen, Press, PrimaryButton, Txt } from '@/components/ui';
import { formatAgo, formatDue, formatRemaining, isUrgent } from '@/data/format';
import { useStore } from '@/data/store';
import { ReactionKey } from '@/data/types';
import { useTheme } from '@/theme/ThemeProvider';

const reactions: { key: ReactionKey; emoji: string; label?: string }[] = [
  { key: 'confirm', emoji: '✅', label: '我也收到了' },
  { key: 'thumbs', emoji: '👍' },
  { key: 'cry', emoji: '😭' },
];

export default function HomeworkDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { homework, courseById, toggleDone, toggleReaction } = useStore();
  const item = homework.find((h) => h.id === id);

  if (!item) {
    return (
      <ModalScreen>
        <Txt tone="sub">这条作业不见了</Txt>
      </ModalScreen>
    );
  }

  const course = courseById(item.courseId);
  const urgent = !item.done && isUrgent(item.due);

  return (
    <ModalScreen
      footer={
        <PrimaryButton
          label={item.done ? '已完成 · 点击撤销' : '标记为已完成'}
          onPress={() => {
            toggleDone(item.id);
            if (!item.done) closeModal();
          }}
        />
      }>
      <Press onPress={() => course && router.push(`/course/${course.id}`)}>
        <Txt variant="caption" tone="sub">
          {course?.name} · {course?.teacher} ›
        </Txt>
      </Press>
      <Txt variant="display" style={{ fontSize: 28, marginTop: 6 }}>
        {item.title}
      </Txt>

      <View style={styles.dueRow}>
        <Txt variant="title" tone={urgent ? 'urgent' : 'text'}>
          {formatDue(item.due)}
        </Txt>
        <View style={[styles.pill, { backgroundColor: urgent ? 'transparent' : theme.accentSoft, borderColor: urgent ? theme.urgent : 'transparent' }]}>
          <Txt variant="caption" tone={urgent ? 'urgent' : 'accent'} style={{ fontWeight: '600' }}>
            {formatRemaining(item.due)}
          </Txt>
        </View>
      </View>

      <Card style={{ marginTop: 20 }}>
        <InfoRow icon="paper-plane-outline" label="提交方式" value={item.submit} />
        <InfoRow icon="location-outline" label="上课地点" value={course?.sessions[0]?.location ?? '—'} />
        <InfoRow icon="person-outline" label="上传" value={`${item.uploader} · ${formatAgo(item.uploadedAt)}`} last />
      </Card>

      {item.detail ? (
        <Card style={{ marginTop: 14, padding: 16 }}>
          <Txt variant="caption" tone="sub" style={{ marginBottom: 8 }}>
            要求
          </Txt>
          <Txt style={{ lineHeight: 23 }}>{item.detail}</Txt>
        </Card>
      ) : null}

      {item.hasPhoto && (
        <View style={[styles.photo, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name="image-outline" size={26} color={theme.accent} />
          <Txt variant="caption" tone="accent" style={{ marginTop: 6 }}>
            黑板照片（演示）
          </Txt>
        </View>
      )}

      <View style={styles.reactions}>
        {reactions.map((r) => {
          const mine = item.myReactions.includes(r.key);
          return (
            <Press
              key={r.key}
              onPress={() => toggleReaction(item.id, r.key)}
              style={[
                styles.reaction,
                { borderColor: mine ? theme.accent : theme.line, backgroundColor: mine ? theme.accentSoft : 'transparent' },
              ]}>
              <Txt variant="sub">{r.emoji}</Txt>
              {r.label && (
                <Txt variant="sub" tone={mine ? 'accent' : 'sub'}>
                  {r.label}
                </Txt>
              )}
              <Txt variant="sub" tone={mine ? 'accent' : 'sub'} style={{ fontWeight: '600' }}>
                {item.reactions[r.key]}
              </Txt>
            </Press>
          );
        })}
      </View>
      <Txt variant="caption" tone="faint" style={{ marginTop: 10 }}>
        确认的同学越多，这条作业越可信
      </Txt>
    </ModalScreen>
  );
}

function InfoRow({
  icon,
  label,
  value,
  last,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  last?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.info, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line }]}>
      <Ionicons name={icon} size={16} color={theme.sub} />
      <Txt variant="sub" tone="sub" style={{ marginLeft: 10, width: 64 }}>
        {label}
      </Txt>
      <Txt variant="sub" style={{ flex: 1, textAlign: 'right' }}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  info: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  photo: { marginTop: 14, height: 150, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
});
