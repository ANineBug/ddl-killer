import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { RefreshControl } from 'react-native-gesture-handler';
import Reanimated, { Easing as REasing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/components/haptic';
import { SwipeRow } from '@/components/SwipeRow';
import { TabScreen } from '@/components/TabScreen';
import { TabScrollView } from '@/components/TabScroll';
import { useToast } from '@/components/Toast';
import { Card, Chip, Press, Section, Txt } from '@/components/ui';
import { dayDiff, formatDue, formatToday, isTbd, isUrgent } from '@/data/format';
import { errorText, useOnline } from '@/data/online';
import { useStore } from '@/data/store';
import { Homework } from '@/data/types';
import { greeting, phaseAt } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const groups = [
  { title: '今天', test: (d: number) => d <= 0 },
  { title: '明天', test: (d: number) => d === 1 },
  { title: '这周', test: (d: number) => d >= 2 && d <= 6 },
  { title: '以后', test: (d: number) => d >= 7 },
];

export default function HomeworkScreen() {
  const { theme } = useTheme();
  const { homework, courses } = useStore();
  const insets = useSafeAreaInsets();
  const [showDone, setShowDone] = useState(false);
  const online = useOnline();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);

  // 下拉刷新：重新认班、重新拉作业
  function refresh() {
    setRefreshing(true);
    online
      .refresh()
      .catch((e) => toast(errorText(e)))
      .finally(() => setRefreshing(false));
  }

  const pending = useMemo(
    () => homework.filter((h) => !h.done && !h.ignored).sort((a, b) => a.due.getTime() - b.due.getTime()),
    [homework],
  );
  // 完成了的和「与我无关」的都收在下面
  const done = homework.filter((h) => h.done || h.ignored);
  const ignoredCount = homework.filter((h) => h.ignored && !h.done).length;
  const next = pending[0];

  // 可能重复的几条叠成一叠：最早传的那条在最上面，其余的收在它后面，列表里不再单独出现
  const { behind, hidden } = useMemo(() => {
    const byId = new Map(pending.map((h) => [h.id, h]));
    const behind = new Map<string, Homework[]>();
    const hidden = new Set<string>();
    for (const h of pending) {
      if (hidden.has(h.id) || behind.has(h.id)) continue;
      const group = [h, ...(h.possibleDuplicates ?? []).flatMap((id) => byId.get(id) ?? [])];
      if (group.length < 2) continue;
      group.sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());
      const [front, ...rest] = group;
      behind.set(front.id, rest);
      rest.forEach((r) => hidden.add(r.id));
    }
    return { behind, hidden };
  }, [pending]);
  const visible = pending.filter((h) => !hidden.has(h.id));

  return (
    <TabScreen index={0}>
      <TabScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.sub} colors={[theme.accent]} />}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={styles.header}>
          <View>
            <Txt variant="caption" tone="sub">
              {formatToday()}
            </Txt>
            <Txt variant="display" style={{ marginTop: 4 }}>
              {greeting[phaseAt(new Date())]}
            </Txt>
          </View>
          <Press onPress={() => router.push('/upload')} style={[styles.add, { borderColor: theme.line }]}>
            <Ionicons name="add" size={22} color={theme.text} />
          </Press>
        </View>

        <Txt variant="sub" tone="sub" style={{ marginTop: 10 }}>
          {next ? (
            <>
              还有 {visible.length} 项待完成，最近的在
              <Txt variant="sub" tone={isUrgent(next.due) ? 'urgent' : 'text'} style={{ fontWeight: '600' }}>
                {' '}
                {formatDue(next.due)}
              </Txt>
            </>
          ) : courses.length ? (
            '全部完成了'
          ) : (
            '课表还是空的'
          )}
        </Txt>

        {/* 刚装好、课表还是空的：先引导去导入课表，有了课才有作业 */}
        {courses.length === 0 ? (
          <Card style={{ marginTop: 22, padding: 28, alignItems: 'center' }}>
            <Txt variant="title">先把课表放进来</Txt>
            <Txt variant="sub" tone="sub" style={{ marginTop: 8, textAlign: 'center' }}>
              导入课表后，同班同学传的作业会自动出现在这里
            </Txt>
            <Press onPress={() => router.push('/import/swufe')} style={[styles.start, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
              <Ionicons name="download-outline" size={16} color={theme.accent} />
              <Txt variant="sub" tone="accent" style={{ marginLeft: 4 }}>
                从教务导入
              </Txt>
            </Press>
            <Press onPress={() => router.push('/join-class')} style={[styles.start, { borderColor: theme.line, backgroundColor: theme.card }]}>
              <Ionicons name="add" size={16} color={theme.text} />
              <Txt variant="sub" style={{ marginLeft: 4 }}>
                搜索加入
              </Txt>
            </Press>
          </Card>
        ) : (
          pending.length === 0 && (
            <Card style={{ marginTop: 22, padding: 28, alignItems: 'center' }}>
              <Txt variant="title">没有待完成的作业</Txt>
              <Txt variant="sub" tone="sub" style={{ marginTop: 8 }}>
                好好休息一下吧
              </Txt>
            </Card>
          )
        )}

        {groups.map((g) => {
          const items = visible.filter((h) => g.test(dayDiff(h.due)));
          if (items.length === 0) return null;
          return (
            <Section key={g.title} title={g.title}>
              <HomeworkList items={items} behind={behind} />
            </Section>
          );
        })}

        {done.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <DoneToggle count={done.length} label={ignoredCount ? '已完成或与我无关' : '已完成'} open={showDone} onPress={() => setShowDone((v) => !v)} />
            {showDone && <HomeworkList items={done} />}
          </View>
        )}
      </TabScrollView>
    </TabScreen>
  );
}

// "已完成 N 项"：数字变多时跳一下、闪一下强调色，让人看到作业归档到了这里
function DoneToggle({ count, label, open, onPress }: { count: number; label: string; open: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const pop = useRef(new Animated.Value(1)).current;
  const prev = useRef(count);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (count > prev.current) {
      setFlash(true);
      pop.setValue(1.25);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: Platform.OS !== 'web' }).start();
      const id = setTimeout(() => setFlash(false), 700);
      prev.current = count;
      return () => clearTimeout(id);
    }
    prev.current = count;
  }, [count, pop]);

  return (
    <Press onPress={onPress} style={styles.doneToggle}>
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Txt variant="caption" tone={flash ? 'accent' : 'sub'} style={flash && { fontWeight: '700' }}>
          {label} {count} 项
        </Txt>
      </Animated.View>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={theme.sub} />
    </Press>
  );
}

// 普通作业连在一张卡片里；遇到一叠可能重复的，就把它单独拿出来成一叠，前后的作业各自成卡
function HomeworkList({ items, behind }: { items: Homework[]; behind?: Map<string, Homework[]> }) {
  type Part = { kind: 'card'; items: Homework[] } | { kind: 'stack'; front: Homework; others: Homework[] };
  const parts: Part[] = [];
  for (const h of items) {
    const others = behind?.get(h.id);
    const last = parts.at(-1);
    if (others) parts.push({ kind: 'stack', front: h, others });
    else if (last?.kind === 'card') last.items.push(h);
    else parts.push({ kind: 'card', items: [h] });
  }
  return (
    <View style={{ gap: 10 }}>
      {parts.map((p) =>
        p.kind === 'card' ? (
          <Card key={p.items[0].id}>
            {p.items.map((h, i) => (
              <HomeworkRow key={h.id} item={h} last={i === p.items.length - 1} />
            ))}
          </Card>
        ) : (
          <DuplicateStack key={p.front.id} front={p.front} others={p.others} />
        ),
      )}
    </View>
  );
}

const STACK_EASE = REasing.bezier(0.2, 0.8, 0.2, 1);

// 一叠可能重复的作业。收起时底下露出两层卡尾；点一下，后面那几条滑出来摊开，
// 下面让大家投「是重复 / 不是重复」。摊开以后再点某一条，才是打开详情
function DuplicateStack({ front, others }: { front: Homework; others: Homework[] }) {
  const { theme } = useTheme();
  const { voteDuplicate } = useStore();
  const toast = useToast();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const p = useSharedValue(0);
  const drawerH = useSharedValue(0);

  function toggle(next: boolean) {
    haptic.light();
    setOpen(next);
    p.value = withTiming(next ? 1 : 0, { duration: 380, easing: STACK_EASE });
  }

  function vote(agree: boolean) {
    haptic.select();
    // 服务器上的作业：投到服务器，够人数就真的合并了
    if (front.remote) {
      if (!online.loggedIn) {
        toast('登录后才能投票', { label: '登录', onPress: () => router.push('/login') });
        return;
      }
      online
        .voteDuplicate(front, agree)
        .then((status) => {
          voteDuplicate(front.id, agree);
          toast(status === 'applied' ? '同意的人够了，已经合并成一条' : status === 'rejected' ? '大家觉得不是重复' : agree ? '已投「是重复」' : '已投「不是重复」');
          setTimeout(() => toggle(false), 350);
        })
        .catch((e) => toast(errorText(e)));
      return;
    }
    const undo = front.dupVote === agree;
    voteDuplicate(front.id, agree);
    if (undo) return;
    toast(agree ? '已投「是重复」，同意的人够了就会合并成一条' : '已投「不是重复」');
    setTimeout(() => toggle(false), 350);
  }

  const tails = useAnimatedStyle(() => ({ height: 12 * (1 - p.value), opacity: 1 - p.value }));
  const drawer = useAnimatedStyle(() => ({ height: drawerH.value * p.value }));
  const slide = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * -28 }] }));
  const edge = { borderColor: theme.cardEdge };

  return (
    <View>
      <Card>
        <HomeworkRow item={front} last badge={`可能重复 · ${others.length + 1}`} onOpen={open ? undefined : () => toggle(true)} />
      </Card>
      {/* 卡尾画在卡片下面、不和卡片重叠：暮色主题的卡片是半透明的，叠在一起会透出来 */}
      <Reanimated.View pointerEvents="none" style={[styles.tails, tails]}>
        <View style={[styles.tail, edge, { width: '93%', backgroundColor: theme.stack[0] }]} />
        <View style={[styles.tail, edge, { width: '86%', backgroundColor: theme.stack[1] }]} />
      </Reanimated.View>
      <Reanimated.View style={[{ overflow: 'hidden' }, drawer]}>
        {/* 外面那层的高度从 0 慢慢拉开到这里的实际高度 */}
        <Reanimated.View style={slide} onLayout={(e) => { drawerH.value = e.nativeEvent.layout.height; }}>
          <View style={{ height: 8 }} />
          <Card>
            {others.map((h, i) => (
              <HomeworkRow key={h.id} item={h} last={i === others.length - 1} />
            ))}
          </Card>
          <View style={styles.dupActions}>
            <Press onPress={() => toggle(false)} hitSlop={8} style={styles.collapse}>
              <Ionicons name="chevron-up" size={14} color={theme.faint} />
              <Txt variant="caption" tone="faint">
                收起
              </Txt>
            </Press>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="是重复" active={front.dupVote === true} onPress={() => vote(true)} />
              <Chip label="不是重复" active={front.dupVote === false} onPress={() => vote(false)} />
            </View>
          </View>
        </Reanimated.View>
      </Reanimated.View>
    </View>
  );
}

// 完成一项作业有两种方式：
// 点小圈：打勾 → 标题划线 → 这一行收起归档 → 提示可以撤销
// 左右划走：整行跟着手指滑出去 → 收起归档 → 提示可以撤销。已完成的作业划走是恢复成未完成
// badge：标题后面的小标签；onOpen：点这一行时做什么，不给就是打开详情
function HomeworkRow({ item, last, badge, onOpen }: { item: Homework; last: boolean; badge?: string; onOpen?: () => void }) {
  const { theme } = useTheme();
  const { courseById, toggleDone } = useStore();
  const toast = useToast();
  const course = courseById(item.courseId);
  const urgent = !item.done && isUrgent(item.due);
  // 服务器作业在截止时间后面跟几个小字：有争议、已延期、几个人传了……
  const r = item.remote;
  const tags = r
    ? [
        r.state === 'disputed' && '有争议',
        r.state === 'cancelled' && '已取消',
        r.postponed && r.state !== 'cancelled' && '已延期',
        r.state === 'pending' && r.uploaderCount > 1 && `${r.uploaderCount} 人上传`,
        r.optional && '选做',
        item.ignored && '与我无关',
      ].filter((x): x is string => !!x)
    : item.ignored
      ? ['与我无关']
      : [];

  const [completing, setCompleting] = useState(false);
  const [rowH, setRowH] = useState(0);
  const [titleW, setTitleW] = useState(0);
  const check = useRef(new Animated.Value(item.done ? 1 : 0)).current;
  const strike = useRef(new Animated.Value(0)).current;
  const collapse = useRef(new Animated.Value(1)).current;
  // 网页上划完松手会紧跟着触发一次点击，用它挡掉，免得划走的同时又打开了详情
  const swipedAt = useRef(0);

  // 整行已经划出去了，这里只负责把空出来的位置收起来，再真正改状态
  function swipeCommit() {
    if (completing) return;
    setCompleting(true);
    Animated.timing(collapse, { toValue: 0, duration: 240, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start(() => {
      toggleDone(item.id);
      if (item.done) {
        haptic.select();
        return;
      }
      haptic.success();
      toast(`「${item.title}」已完成`, { label: '撤销', onPress: () => toggleDone(item.id) });
    });
  }

  function complete() {
    if (completing) return;
    if (item.done) {
      haptic.select();
      toggleDone(item.id);
      return;
    }
    haptic.light();
    setCompleting(true);
    Animated.sequence([
      Animated.timing(check, { toValue: 1, duration: 260, easing: Easing.back(2), useNativeDriver: false }),
      Animated.timing(strike, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.delay(320),
      Animated.timing(collapse, { toValue: 0, duration: 280, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
    ]).start(() => {
      haptic.success();
      toggleDone(item.id);
      toast(`「${item.title}」已完成`, { label: '撤销', onPress: () => toggleDone(item.id) });
    });
  }

  const checkInk = theme.dark ? '#16161a' : '#ffffff';

  return (
    <Animated.View
      onLayout={(e) => !completing && setRowH(e.nativeEvent.layout.height)}
      style={completing && rowH ? { height: collapse.interpolate({ inputRange: [0, 1], outputRange: [0, rowH] }), opacity: collapse, overflow: 'hidden' } : undefined}>
      <SwipeRow
        label={item.done ? '恢复' : '完成'}
        icon={item.done ? 'arrow-undo' : 'checkmark'}
        onCommit={swipeCommit}
        onSwipe={() => { swipedAt.current = Date.now(); }}>
      <Press
        onPress={() => {
          if (Date.now() - swipedAt.current < 350) return;
          if (onOpen) onOpen();
          else router.push(`/homework/${item.id}`);
        }}
        style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line }]}>
        <Press onPress={complete} hitSlop={10} style={{ paddingRight: 12 }}>
          <View style={[styles.check, { borderColor: item.done || completing ? theme.accent : theme.faint }]}>
            <Animated.View
              style={[styles.checkFill, { backgroundColor: theme.accent, opacity: check, transform: [{ scale: check }] }]}
            />
            <Animated.View style={{ opacity: check.interpolate({ inputRange: [0.4, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }}>
              <Ionicons name="checkmark" size={13} color={checkInk} />
            </Animated.View>
          </View>
        </Press>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Animated.View
            onLayout={(e) => setTitleW(e.nativeEvent.layout.width)}
            style={{ flexShrink: 1, opacity: strike.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }}>
            <Txt
              numberOfLines={1}
              tone={item.done ? 'sub' : 'text'}
              style={item.done && { textDecorationLine: 'line-through' }}>
              {item.title}
            </Txt>
            <Animated.View
              style={[
                styles.strike,
                { backgroundColor: theme.text, width: strike.interpolate({ inputRange: [0, 1], outputRange: [0, titleW] }) },
              ]}
            />
          </Animated.View>
          {badge && (
            <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="copy-outline" size={10} color={theme.accent} />
              <Txt variant="caption" tone="accent" style={{ fontSize: 11 }}>
                {badge}
              </Txt>
            </View>
          )}
          </View>
          {/* 课名太长时只截课名，截止时间永远完整显示 */}
          <View style={{ flexDirection: 'row', marginTop: 3 }}>
            <Txt variant="caption" tone="sub" numberOfLines={1} style={{ flexShrink: 1 }}>
              {course?.name} ·{' '}
            </Txt>
            <Txt variant="caption" tone={urgent ? 'urgent' : 'sub'} numberOfLines={1} style={[{ flexShrink: 0 }, urgent && { fontWeight: '700' }]}>
              {isTbd(item.due) ? '截止待定' : `${formatDue(item.due, true)} 截止`}
            </Txt>
            {tags.length > 0 && (
              <Txt variant="caption" tone={item.remote?.state === 'disputed' ? 'urgent' : 'faint'} numberOfLines={1} style={{ flexShrink: 0 }}>
                {' · '}
                {tags.join(' · ')}
              </Txt>
            )}
          </View>
        </View>
        <View style={styles.meta}>
          {item.reminders && !item.done && (
            <Ionicons name="notifications" size={12} color={theme.accent} style={{ marginRight: 8 }} />
          )}
          <Ionicons name="checkmark-done" size={13} color={theme.faint} />
          <Txt variant="caption" tone="faint" style={{ marginLeft: 3 }}>
            {item.reactions.confirm}
          </Txt>
        </View>
      </Press>
      </SwipeRow>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  add: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  start: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingHorizontal: 18, height: 40, borderRadius: 999, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkFill: { position: 'absolute', top: -1.5, left: -1.5, width: 22, height: 22, borderRadius: 11 },
  strike: { position: 'absolute', left: 0, top: '52%', height: 1.5, borderRadius: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, marginLeft: 6, flexShrink: 0 },
  tails: { alignItems: 'center', overflow: 'hidden' },
  tail: { height: 6, borderWidth: StyleSheet.hairlineWidth, borderTopWidth: 0, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  dupActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, paddingHorizontal: 4 },
  collapse: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  doneToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10, marginLeft: 4 },
});
