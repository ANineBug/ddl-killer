import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Animated, Easing, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/components/haptic';
import { TabScreen } from '@/components/TabScreen';
import { Press, Txt } from '@/components/ui';
import { currentWeek, isoWeekday, weekdayNames } from '@/data/format';
import { useStore } from '@/data/store';
import { Course } from '@/data/types';
import { withAlpha } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const MAX_PERIODS = 12;
const MIN_PERIODS = 8;
const ROW = 46;
const TIME_COL = 22;
const PAD = 20;
const MAX_W = 480;
const BLOCK_FONT_SCALE = 1.2;

// "通博楼 B101" 只取教室号 "B101"；色块空间有限，统一只放教室号，完整地点在课程详情里
function roomOf(location: string) {
  const space = location.indexOf(' ');
  return space > 0 ? location.slice(space + 1) : location;
}

function inWeek(c: Course, week: number) {
  const { from, to, rule } = c.weeks;
  if (week < from || week > to) return false;
  if (rule === 'odd') return week % 2 === 1;
  if (rule === 'even') return week % 2 === 0;
  return true;
}

export default function TimetableScreen() {
  const { theme } = useTheme();
  const { courses } = useStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [week, setWeek] = useState(currentWeek());
  const slide = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  const visible = courses.filter((c) => inWeek(c, week));
  // 平时只显示周一到周五；有周末的课时才把周六、周日加进来
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 5 || visible.some((c) => c.sessions.some((s) => s.weekday === d)));
  const gridW = Math.min(width - PAD * 2, MAX_W);
  const colW = (gridW - TIME_COL) / days.length;
  const today = isoWeekday(new Date());
  const todayCol = week === currentWeek() ? days.indexOf(today) : -1;
  // 只画到这周最晚有课的那一节，至少画到第 8 节，后面空着的不画
  const periods = Math.min(
    MAX_PERIODS,
    Math.max(MIN_PERIODS, ...visible.flatMap((c) => c.sessions.map((s) => s.to))),
  );

  // 翻周时，课表从翻动的方向滑进来
  function changeWeek(dir: 1 | -1) {
    const next = Math.min(20, Math.max(1, week + dir));
    if (next === week) return;
    haptic.select();
    setWeek(next);
    slide.setValue(24 * dir);
    fade.setValue(0);
    const config = { duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' };
    Animated.parallel([Animated.timing(slide, { ...config, toValue: 0 }), Animated.timing(fade, { ...config, toValue: 1 })]).start();
  }

  return (
    <TabScreen index={1}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: PAD, paddingBottom: 130 }}>
        <View style={{ width: gridW, alignSelf: 'center' }}>
          <View style={styles.header}>
            <View>
              <Txt variant="caption" tone="sub">
                {week === currentWeek() ? '本周' : week < currentWeek() ? '已经过去' : '提前看看'}
              </Txt>
              <Txt variant="display" style={{ marginTop: 4 }}>
                课表
              </Txt>
            </View>
            <Press onPress={() => router.push('/add-course')} style={[styles.round, { borderColor: theme.line }]}>
              <Ionicons name="add" size={22} color={theme.text} />
            </Press>
          </View>

          <View style={styles.weekRow}>
            <Press onPress={() => changeWeek(-1)} hitSlop={10}>
              <Ionicons name="chevron-back" size={18} color={theme.sub} />
            </Press>
            <Press onPress={() => week !== currentWeek() && setWeek(currentWeek())}>
              <Txt variant="label" style={{ marginHorizontal: 14 }}>
                第 {week} 周
              </Txt>
            </Press>
            <Press onPress={() => changeWeek(1)} hitSlop={10}>
              <Ionicons name="chevron-forward" size={18} color={theme.sub} />
            </Press>
          </View>

          <Animated.View style={{ opacity: fade, transform: [{ translateX: slide }] }}>
            <View style={{ flexDirection: 'row', marginLeft: TIME_COL, marginBottom: 6 }}>
              {days.map((d, i) => (
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
                  .filter((s) => days.includes(s.weekday))
                  .map((s) => {
                    const hue = theme.courseHues[c.hue % theme.courseHues.length];
                    const span = s.to - s.from + 1;
                    return (
                      <Press
                        key={`${c.id}-${s.weekday}-${s.from}`}
                        onPress={() => router.push(`/course/${c.id}`)}
                        style={[
                          styles.block,
                          {
                            left: TIME_COL + days.indexOf(s.weekday) * colW + 2,
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
                            numberOfLines={span === 1 ? 1 : 3}
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
                            {c.teacher}
                          </Txt>
                        )}
                      </Press>
                    );
                  }),
              )}
            </View>
          </Animated.View>

          <Txt variant="caption" tone="faint" style={{ marginTop: 18, textAlign: 'center' }}>
            课表导入还在研究中，目前请点右上角手动添加
          </Txt>
        </View>
      </ScrollView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  round: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 14 },
  dayPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  todayCol: { position: 'absolute', top: 0, bottom: 0, borderRadius: 10 },
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
    borderLeftWidth: 3,
    paddingHorizontal: 5,
    paddingVertical: 5,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
});
