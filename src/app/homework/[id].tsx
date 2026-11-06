import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ComponentProps, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { haptic } from '@/components/haptic';
import { ReactionIcon } from '@/components/ReactionIcon';
import { ReminderCard } from '@/components/ReminderCard';
import { useToast } from '@/components/Toast';
import { Card, closeModal, ModalScreen, Press, PrimaryButton, Txt } from '@/components/ui';
import { formatAgo, formatDue, formatRemaining, isUrgent } from '@/data/format';
import { useStore } from '@/data/store';
import { ReactionKey } from '@/data/types';
import { useTheme } from '@/theme/useTheme';

const reactions: { key: ReactionKey; label?: string }[] = [{ key: 'confirm', label: '对的对的' }, { key: 'thumbs' }, { key: 'cry' }];

export default function HomeworkDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { homework, courseById, toggleDone, toggleReaction } = useStore();
  const toast = useToast();
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
            if (item.done) return;
            haptic.success();
            closeModal();
            toast(`「${item.title}」已完成`, { label: '撤销', onPress: () => toggleDone(item.id) });
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

      {!item.done && <ReminderCard item={item} />}

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
        {reactions.map((r) => (
          <ReactionChip
            key={r.key}
            kind={r.key}
            label={r.label}
            count={item.reactions[r.key]}
            mine={item.myReactions.includes(r.key)}
            onPress={() => toggleReaction(item.id, r.key)}
          />
        ))}
      </View>
      <Txt variant="caption" tone="faint" style={{ marginTop: 10 }}>
        确认的同学越多，这条作业越可信
      </Txt>
    </ModalScreen>
  );
}

// 点一下轻轻弹起来，像 Discord 的表情回应
function ReactionChip({
  kind,
  label,
  count,
  mine,
  onPress,
}: {
  kind: ReactionKey;
  label?: string;
  count: number;
  mine: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  function press() {
    haptic.select();
    onPress();
    scale.setValue(mine ? 0.92 : 1.18);
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: Platform.OS !== 'web' }).start();
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Press
        onPress={press}
        style={[
          styles.reaction,
          { borderColor: mine ? theme.accent : theme.line, backgroundColor: mine ? theme.accentSoft : 'transparent' },
        ]}>
        <ReactionIcon kind={kind} active={mine} color={mine ? theme.accent : theme.sub} fill={mine ? theme.accentSoft : 'transparent'} />
        {label && (
          <Txt variant="sub" tone={mine ? 'accent' : 'sub'}>
            {label}
          </Txt>
        )}
        <Txt variant="sub" tone={mine ? 'accent' : 'sub'} style={{ fontWeight: '600' }}>
          {count}
        </Txt>
      </Press>
    </Animated.View>
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
