import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ComponentProps, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import type { RemoteDetail } from '@/api/types';
import { haptic } from '@/components/haptic';
import { HomeworkCommunity } from '@/components/HomeworkCommunity';
import { ReactionIcon } from '@/components/ReactionIcon';
import { ReminderCard } from '@/components/ReminderCard';
import { useToast } from '@/components/Toast';
import { Card, closeModal, ModalScreen, Press, PrimaryButton, Txt } from '@/components/ui';
import { formatAgo, formatDue, formatRemaining, isUrgent } from '@/data/format';
import { errorText, useOnline } from '@/data/online';
import { useStore } from '@/data/store';
import { RemoteInfo, ReactionKey } from '@/data/types';
import { useTheme } from '@/theme/useTheme';

const reactions: ReactionKey[] = ['confirm', 'thumbs', 'cry'];

const STATE_LABEL: Record<RemoteInfo['state'], string> = {
  pending: '待确认',
  confirmed: '已确认',
  disputed: '有争议',
  cancelled: '已取消',
  closed: '已截止',
  merged: '已合并',
};

export default function HomeworkDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { homework, courseById, toggleDone, toggleIgnored, toggleReaction, removeHomework, restoreHomework } = useStore();
  const toast = useToast();
  const online = useOnline();
  // 删除后页面还在往下收起，这段时间里继续显示删之前的内容
  const found = homework.find((h) => h.id === id);
  const [last, setLast] = useState({ id, item: found });
  if (last.id !== id || (found && found !== last.item)) setLast({ id, item: found });
  const item = found ?? (last.id === id ? last.item : undefined);

  // 服务器上的作业：打开时拉一次详情（提议、改动记录）。作业改了版本，或者自己投了票，再拉一次
  const [detail, setDetail] = useState<RemoteDetail | null>(null);
  const [tick, setTick] = useState(0);
  const remoteId = item?.remote?.id;
  const version = item?.remote?.version;
  useEffect(() => {
    if (!item?.remote) return;
    let alive = true;
    online
      .detail(item)
      .then((d) => alive && setDetail(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // 只跟着这几样重新拉，别的变化（比如完成状态）不用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteId, version, tick]);

  if (!item) {
    return (
      <ModalScreen>
        <Txt tone="sub">这条作业不见了</Txt>
      </ModalScreen>
    );
  }

  const course = courseById(item.courseId);
  const urgent = !item.done && isUrgent(item.due);

  // 服务器上的作业：确认和回应要登录，结果以服务器为准
  function react(r: ReactionKey) {
    if (!item) return;
    if (!item.remote) return toggleReaction(item.id, r);
    if (!online.loggedIn) {
      toast('登录后才能确认和回应', { label: '登录', onPress: () => router.push('/login') });
      return;
    }
    online.react(item, r).catch((e) => toast(errorText(e)));
  }

  const state = item.remote?.state;
  const canEdit = !!item.mine && (!item.remote || state === 'pending');
  const canReport = !!item.remote && state !== 'closed' && state !== 'cancelled' && state !== 'merged' && !canEdit;

  function remove() {
    if (!item) return;
    haptic.light();
    if (item.remote) {
      // 服务器上删了就没法撤销，所以不给"撤销"
      const title = item.title;
      online
        .remove(item)
        .then(() => {
          closeModal();
          toast(`已删除「${title}」`);
        })
        .catch((e) => toast(errorText(e)));
      return;
    }
    const removed = removeHomework(item.id);
    closeModal();
    if (removed) toast(`已删除「${removed.title}」`, { label: '撤销', onPress: () => restoreHomework(removed) });
  }

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

      {item.remote && (
        <View style={styles.states}>
          <View style={[styles.state, { borderColor: item.remote.state === 'disputed' ? theme.urgent : theme.line }]}>
            <Txt variant="caption" tone={item.remote.state === 'disputed' ? 'urgent' : item.remote.state === 'confirmed' ? 'accent' : 'sub'}>
              {item.remote.state === 'pending' && item.remote.uploaderCount > 1 ? `${item.remote.uploaderCount} 人上传 · 待确认` : STATE_LABEL[item.remote.state]}
            </Txt>
          </View>
          {item.remote.postponed && (
            <View style={[styles.state, { borderColor: theme.line }]}>
              <Txt variant="caption" tone="sub">已延期</Txt>
            </View>
          )}
          {item.remote.optional && (
            <View style={[styles.state, { borderColor: theme.line }]}>
              <Txt variant="caption" tone="sub">选做（非必做）</Txt>
            </View>
          )}
          {item.remote.groupWork && (
            <View style={[styles.state, { borderColor: theme.line }]}>
              <Txt variant="caption" tone="sub">小组作业</Txt>
            </View>
          )}
        </View>
      )}

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
        <InfoRow icon="location-outline" label="上课地点" value={[...new Set(course?.sessions.map((s) => s.location).filter(Boolean) ?? [])].join('、') || '—'} />
        {item.remote && <InfoRow icon="megaphone-outline" label="来源" value={item.remote.source} />}
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

      <View style={styles.reactions}>
        {reactions.map((r) => (
          <ReactionChip
            key={r}
            kind={r}
            count={item.reactions[r]}
            mine={item.myReactions.includes(r)}
            onPress={() => react(r)}
          />
        ))}
      </View>
      <Txt variant="caption" tone="faint" style={{ marginTop: 10 }}>
        {item.remote?.confirmedOld ? '此作业已修改过，该确认是修改前的确认，可以再确认一次' : '确认的同学越多，这条作业越可信'}
      </Txt>

      {/* 自己传的、还没人确认的可以直接改和删；别的有问题走「有问题」提议，大家同意了才改 */}
      <View style={styles.actions}>
        {canEdit && (
          <>
            <Action icon="create-outline" label="编辑" onPress={() => router.push(`/upload?id=${item.id}`)} />
            <Action icon="trash-outline" label="删除" danger onPress={remove} />
          </>
        )}
        {canReport && (
          <Action
            icon="flag-outline"
            label="有问题"
            onPress={() =>
              online.loggedIn ? router.push(`/report?id=${item.id}`) : toast('登录后才能提出修改', { label: '登录', onPress: () => router.push('/login') })
            }
          />
        )}
        <Action
          icon={item.ignored ? 'eye-outline' : 'eye-off-outline'}
          label={item.ignored ? '和我有关' : '与我无关'}
          onPress={() => {
            haptic.select();
            toggleIgnored(item.id);
            if (item.ignored) return;
            closeModal();
            toast(`「${item.title}」与我无关，不再提醒`, { label: '撤销', onPress: () => toggleIgnored(item.id) });
          }}
        />
      </View>

      {item.remote && <HomeworkCommunity item={item} detail={detail} reload={() => setTick((t) => t + 1)} />}
    </ModalScreen>
  );
}

function Action({ icon, label, onPress, danger }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; danger?: boolean }) {
  const { theme } = useTheme();
  return (
    <Press onPress={onPress} style={[styles.action, { borderColor: theme.line }]}>
      <Ionicons name={icon} size={16} color={danger ? theme.urgent : theme.sub} />
      <Txt variant="sub" tone={danger ? 'urgent' : 'sub'}>
        {label}
      </Txt>
    </Press>
  );
}

// 点一下轻轻弹起来，像 Discord 的表情回应
function ReactionChip({
  kind,
  count,
  mine,
  onPress,
}: {
  kind: ReactionKey;
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
        <ReactionIcon size={19} kind={kind} active={mine} color={mine ? theme.accent : theme.sub} fill={mine ? theme.accentSoft : 'transparent'} />
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
  states: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  state: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  info: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24 },
  action: { flexGrow: 1, minWidth: '30%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 999, borderWidth: 1 },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
});
