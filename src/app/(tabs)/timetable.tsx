import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Reanimated, { cancelAnimation, Easing, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '@/components/haptic';
import { TabScreen } from '@/components/TabScreen';
import { TabScrollView } from '@/components/TabScroll';
import { Chip, Field, Press, Txt } from '@/components/ui';
import { isoWeekday, weekdayNames } from '@/data/format';
import { inWeek, sessionWeeks, validMonday, weekFromStart } from '@/data/schedule';
import { useStore } from '@/data/store';
import type { Course } from '@/data/types';
import { type Theme, withAlpha } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const PERIODS = 12;
const ROW = 46;
const TIME_COL = 22;
const PAD = 20;
const MAX_W = 480;
const BLOCK_FONT_SCALE = 1.2;
// 星期那一行的高度（含下面的间距）
const HEAD_H = 30;
const DAYS = [1, 2, 3, 4, 5, 6, 7];

// "通博楼 B101" 只取教室号 "B101"；色块空间有限，统一只放教室号，完整地点在课程详情里
function roomOf(location: string) {
  const space = location.indexOf(' ');
  return space > 0 ? location.slice(space + 1) : location;
}

export default function TimetableScreen() {
  const { timetable } = useStore();
  // 切换学期或修改开学日期时重新选择默认周，避免沿用另一个学期的页面状态。
  return <TimetableContent key={`${timetable.term ?? 'manual'}-${timetable.term ? timetable.starts[timetable.term] ?? '' : ''}`} />;
}

function TimetableContent() {
  const { theme } = useTheme();
  const { courses: allCourses, timetable, setTimetable } = useStore();
  const courses = allCourses.filter((c) => timetable.term ? c.source?.term === timetable.term : !c.source);
  // 删空当前学期后仍保留切换入口，已有手动课程不会因此变得无法访问。
  const terms = [...new Set([...allCourses.flatMap((c) => c.source ? [c.source.term] : []), ...(timetable.term ? [timetable.term] : [])])];
  const start = timetable.term ? timetable.starts[timetable.term] : undefined;
  const actualWeek = weekFromStart(start);
  const maxWeek = Math.max(20, ...courses.flatMap((c) => c.weeks.map((w) => w.to)));
  const current = Math.max(1, Math.min(maxWeek, actualWeek ?? (timetable.term ? 1 : 10)));
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [week, setWeek] = useState(current);
  const [editingStart, setEditingStart] = useState(false);
  const [draftStart, setDraftStart] = useState(start ?? '');

  // 一周七天都显示，周末没课也留着位置
  const gridW = Math.min(width - PAD * 2, MAX_W);
  const colW = (gridW - TIME_COL) / DAYS.length;
  // 1–12 节全部画出来
  const periods = Math.max(PERIODS, ...courses.flatMap((c) => c.sessions.map((s) => s.to)));

  // 左右滑动翻周：每一周是一页，第 k 周的页面摆在 k × 页宽 的位置，pos 是现在看到哪儿。
  // 位置只跟"第几周"有关，所以翻过去以后不需要把页面挪回原位，也就不会闪
  const pos = useSharedValue(week * gridW);
  const startPos = useSharedValue(0);
  const widthSV = useSharedValue(gridW);
  const maxWeekSV = useSharedValue(maxWeek);
  // 网页上划完松手会紧跟着触发一次点击，用它挡掉，免得翻周的同时又点开了课程
  const swipedAt = useRef(0);

  useLayoutEffect(() => {
    widthSV.value = gridW;
    maxWeekSV.value = maxWeek;
    cancelAnimation(pos);
    pos.value = week * gridW;
    // 只在页宽或总周数变了的时候重新对齐；翻周时 pos 已经由动画带到位
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridW, maxWeek]);

  const tick = () => haptic.select();
  const markSwipe = () => { swipedAt.current = Date.now(); };
  const slideTo = (target: number) => {
    'worklet';
    pos.value = withTiming(target * widthSV.value, { duration: 260, easing: Easing.out(Easing.cubic) });
  };

  // 点箭头翻一周
  function changeWeek(dir: 1 | -1) {
    const next = Math.min(maxWeek, Math.max(1, week + dir));
    if (next === week) return;
    haptic.select();
    setWeek(next);
    pos.value = withTiming(next * gridW, { duration: 260, easing: Easing.out(Easing.cubic) });
  }
  // 点"第 N 周"直接回到当前周；可能隔了很多周，不做滑动
  function backToCurrent() {
    setWeek(current);
    cancelAnimation(pos);
    pos.value = current * gridW;
  }

  const pan = usePanGesture({
    // 横向走出 14 点才开始；先竖着走了 10 点就放弃，交给页面滚动
    activeOffsetX: [-14, 14],
    failOffsetY: [-10, 10],
    onActivate: () => {
      'worklet';
      cancelAnimation(pos);
      startPos.value = pos.value;
      scheduleOnRN(markSwipe);
    },
    onUpdate: (e) => {
      'worklet';
      const w = widthSV.value;
      const min = w;
      const max = maxWeekSV.value * w;
      let p = startPos.value - e.translationX;
      // 第一周再往前、最后一周再往后，只给一点阻力感
      if (p < min) p = min - (min - p) * 0.2;
      if (p > max) p = max + (p - max) * 0.2;
      pos.value = p;
    },
    onDeactivate: (e) => {
      'worklet';
      scheduleOnRN(markSwipe);
      const w = widthSV.value;
      const base = Math.round(startPos.value / w);
      const tx = e.translationX;
      const far = Math.abs(tx) > w * 0.25 || (Math.abs(e.velocityX) > 400 && Math.abs(tx) > 20);
      let target = !e.canceled && far ? base + (tx < 0 ? 1 : -1) : base;
      target = Math.min(maxWeekSV.value, Math.max(1, target));
      if (target !== base) {
        scheduleOnRN(tick);
        // 页面位置只看 pos，所以可以马上把"第几周"改掉，标题立刻跟上
        scheduleOnRN(setWeek, target);
      }
      slideTo(target);
    },
  });

  // 只画当前周和左右各一周，够滑动时露出来就行
  const pages = [week - 1, week, week + 1].filter((k) => k >= 1 && k <= maxWeek);

  return (
    <TabScreen index={1}>
      <TabScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: PAD, paddingBottom: 130 }}>
        <View style={{ width: gridW, alignSelf: 'center' }}>
          <View style={styles.header}>
            <View>
              <Txt variant="caption" tone="sub">
                {actualWeek === undefined ? '按周查看' : week === actualWeek ? '本周' : week < actualWeek ? '已经过去' : '提前看看'}
              </Txt>
              <Txt variant="display" style={{ marginTop: 4 }}>
                课表
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Press accessibilityLabel="从教务导入课表" onPress={() => router.push('/import/swufe')} style={[styles.round, { borderColor: theme.line }]}>
                <Ionicons name="download-outline" size={20} color={theme.text} />
              </Press>
              <Press accessibilityLabel="搜索加入教学班" onPress={() => router.push('/join-class')} style={[styles.round, { borderColor: theme.line }]}>
                <Ionicons name="add" size={22} color={theme.text} />
              </Press>
            </View>
          </View>

          {terms.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {terms.map((term) => <Chip key={term} label={term} active={timetable.term === term} onPress={() => setTimetable({ term })} />)}
            <Chip label="未分学期" active={!timetable.term} onPress={() => setTimetable({ term: undefined })} />
          </View>}

          {!!timetable.term && <>
            <Press onPress={() => setEditingStart((v) => !v)} style={{ marginTop: 12 }}>
              <Txt variant="caption" tone="accent">{start ? `第一周周一：${start} · 修改` : '设置第一周日期，自动计算当前周'}</Txt>
            </Press>
            {editingStart && <>
              <Field label="第一周的周一" placeholder="YYYY-MM-DD" value={draftStart} onChangeText={setDraftStart} />
              <Chip label="保存日期" active={validMonday(draftStart)} onPress={() => {
                if (timetable.term && validMonday(draftStart)) setTimetable({ starts: { ...timetable.starts, [timetable.term]: draftStart } });
              }} />
              {!!draftStart && !validMonday(draftStart) && <Txt variant="caption" tone="urgent">请填写有效的周一日期</Txt>}
            </>}
          </>}

          <View style={styles.weekRow}>
            <Press onPress={() => changeWeek(-1)} hitSlop={10}>
              <Ionicons name="chevron-back" size={18} color={theme.sub} />
            </Press>
            <Press onPress={backToCurrent}>
              <Txt variant="label" style={{ marginHorizontal: 14 }}>
                第 {week} 周
              </Txt>
            </Press>
            <Press onPress={() => changeWeek(1)} hitSlop={10}>
              <Ionicons name="chevron-forward" size={18} color={theme.sub} />
            </Press>
          </View>

          {/* pan-y：网页上仍然让浏览器自己处理上下滚动 */}
          <GestureDetector gesture={pan} touchAction="pan-y">
            <View style={{ height: HEAD_H + periods * ROW, overflow: 'hidden' }}>
              {pages.map((k) => (
                <WeekPage key={k} week={k} pos={pos} width={gridW}>
                  <WeekGrid
                    week={k}
                    courses={courses}
                    todayCol={actualWeek === k ? DAYS.indexOf(isoWeekday(new Date())) : -1}
                    colW={colW}
                    periods={periods}
                    theme={theme}
                    canPress={() => Date.now() - swipedAt.current > 350}
                  />
                </WeekPage>
              ))}

              {/* 一门课都没有的时候：格子照常画，中间放一句提示和添加按钮 */}
              {courses.length === 0 && (
                <View style={[styles.empty, { left: TIME_COL }]} pointerEvents="box-none">
                  <Txt variant="sub" tone="sub">
                    课表还是空的
                  </Txt>
                  <Txt variant="caption" tone="faint" style={{ marginTop: 6 }}>
                    从教务导入，或搜索加入同学已经导入的班
                  </Txt>
                  <Press onPress={() => router.push('/import/swufe')} style={[styles.emptyButton, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
                    <Ionicons name="download-outline" size={16} color={theme.accent} />
                    <Txt variant="sub" tone="accent" style={{ marginLeft: 4 }}>从教务导入</Txt>
                  </Press>
                  <Press
                    onPress={() => router.push('/join-class')}
                    style={[styles.emptyButton, { borderColor: theme.line, backgroundColor: theme.card }]}>
                    <Ionicons name="add" size={16} color={theme.text} />
                    <Txt variant="sub" style={{ marginLeft: 4 }}>
                      搜索加入
                    </Txt>
                  </Press>
                </View>
              )}
            </View>
          </GestureDetector>

          {courses.length > 0 && (
            <Txt variant="caption" tone="faint" style={{ marginTop: 18, textAlign: 'center' }}>
              {timetable.term ? '同一课程的多个课块共用课程详情和作业' : '右上角可从教务导入课表，或搜索加入教学班'}
            </Txt>
          )}
        </View>
      </TabScrollView>
    </TabScreen>
  );
}

// 一周的页面：横向位置 = 第几周 × 页宽 − 现在看到哪儿，在界面线程上算
function WeekPage({ week, pos, width, children }: { week: number; pos: SharedValue<number>; width: number; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: week * width - pos.value }] }));
  return <Reanimated.View style={[StyleSheet.absoluteFill, style]}>{children}</Reanimated.View>;
}

// 某一周的课表：上面一行星期，下面是 1–12 节的格子和课程色块
function WeekGrid({ week, courses, todayCol, colW, periods, theme, canPress }: {
  week: number;
  courses: Course[];
  todayCol: number;
  colW: number;
  periods: number;
  theme: Theme;
  canPress: () => boolean;
}) {
  const visible = courses.filter((c) => c.sessions.some((s) => inWeek(sessionWeeks(c, s), week)));
  return (
    <>
      <View style={{ flexDirection: 'row', marginLeft: TIME_COL, height: HEAD_H - 6, marginBottom: 6, alignItems: 'center' }}>
        {DAYS.map((d, i) => (
          <View key={d} style={{ width: colW, alignItems: 'center' }}>
            <View style={[styles.dayPill, i === todayCol && { backgroundColor: theme.accentSoft }]}>
              <Txt variant="caption" tone={i === todayCol ? 'accent' : 'sub'} style={i === todayCol && { fontWeight: '700' }}>
                {weekdayNames[d]}
              </Txt>
            </View>
          </View>
        ))}
      </View>

      <View style={{ height: periods * ROW }}>
        {todayCol >= 0 && (
          <View
            style={[
              styles.todayCol,
              { left: TIME_COL + todayCol * colW, width: colW, backgroundColor: withAlpha(theme.accent, 0.06) },
            ]}
          />
        )}

        {Array.from({ length: periods }, (_, i) => (
          <View key={i} style={[styles.periodRow, { top: i * ROW, height: ROW, borderTopColor: theme.grid }]}>
            <Txt variant="caption" tone="faint" style={{ width: TIME_COL }}>
              {i + 1}
            </Txt>
          </View>
        ))}

        {visible.flatMap((c) =>
          c.sessions
            .filter((s) => DAYS.includes(s.weekday) && inWeek(sessionWeeks(c, s), week))
            .map((s, index) => {
              const hue = theme.courseHues[c.hue % theme.courseHues.length];
              const span = s.to - s.from + 1;
              // 七天都显示后色块变窄，课名按色块高度能放几行就放几行
              const nameLines = span === 1 ? 1 : Math.floor((span * ROW - 14 - 16 - (span >= 3 ? 12 : 0)) / 15);
              return (
                <Press
                  key={`${c.id}-${index}-${s.weekday}-${s.from}`}
                  onPress={() => canPress() && router.push(`/course/${c.id}`)}
                  style={[
                    styles.block,
                    {
                      left: TIME_COL + DAYS.indexOf(s.weekday) * colW + 2,
                      top: (s.from - 1) * ROW + 2,
                      width: colW - 4,
                      height: span * ROW - 4,
                      backgroundColor: withAlpha(hue, theme.blockAlpha),
                      borderLeftColor: hue,
                    },
                  ]}>
                  {/* 按色块高度决定显示多少：一节只放课名，两节加教室号，三节以上再加老师。
                      手机系统字体调大时文字会跟着放大，限制倍数免得撑破色块 */}
                  <View>
                    <Txt
                      maxFontSizeMultiplier={BLOCK_FONT_SCALE}
                      numberOfLines={nameLines}
                      style={{ fontSize: 11.5, lineHeight: 15, fontWeight: '600' }}>
                      {c.name}
                    </Txt>
                    {span >= 2 && (
                      <Txt
                        variant="caption"
                        tone="sub"
                        maxFontSizeMultiplier={BLOCK_FONT_SCALE}
                        numberOfLines={1}
                        style={{ fontSize: 10, lineHeight: 13, marginTop: 3 }}>
                        {roomOf(s.location)}
                      </Txt>
                    )}
                  </View>
                  {span >= 3 && (
                    <Txt
                      variant="caption"
                      tone="sub"
                      maxFontSizeMultiplier={BLOCK_FONT_SCALE}
                      numberOfLines={1}
                      style={{ fontSize: 9.5, lineHeight: 12, opacity: 0.8 }}>
                      {s.teacher || c.teacher}
                    </Txt>
                  )}
                </Press>
              );
            }),
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  round: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 14 },
  dayPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999 },
  todayCol: { position: 'absolute', top: 0, bottom: 0, borderRadius: 10 },
  empty: { position: 'absolute', right: 0, top: HEAD_H + 3 * ROW, alignItems: 'center' },
  emptyButton: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 18, height: 40, borderRadius: 999, borderWidth: 1 },
  // 横线淡到几乎看不见，只起对齐作用
  periodRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 4,
  },
  block: {
    position: 'absolute',
    borderRadius: 8,
    borderLeftWidth: 2.5,
    paddingHorizontal: 3,
    paddingVertical: 5,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
});
