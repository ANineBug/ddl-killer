import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptic } from '@/components/haptic';
import { useToast } from '@/components/Toast';
import { Card, ModalScreen, Press, Section, Txt } from '@/components/ui';
import { completionStats, finishedAt, isArchived } from '@/data/archive';
import { formatDue, isTbd } from '@/data/format';
import { useStore } from '@/data/store';
import { Homework } from '@/data/types';
import { withAlpha } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

// 「我的 → 完成记录」：上面是这学期的小结（完成多少、按时率、最忙的一周、每天完成量、每门课），
// 下面是归档的作业，按月份分组。点一条能看作业内容，右边「移回」放回首页
export default function Archive() {
  const { theme } = useTheme();
  const { homework, courseById, setArchived } = useStore();
  const toast = useToast();
  const now = useMemo(() => new Date(), []);
  const stats = useMemo(() => completionStats(homework, now), [homework, now]);
  const archived = useMemo(
    () => homework.filter((h) => isArchived(h, now)).sort((a, b) => finishedAt(b).getTime() - finishedAt(a).getTime()),
    [homework, now],
  );

  // 按完成的月份分组
  const months: [string, Homework[]][] = [];
  for (const h of archived) {
    const d = finishedAt(h);
    const key = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
    const last = months.at(-1);
    if (last?.[0] === key) last[1].push(h);
    else months.push([key, [h]]);
  }

  const courseName = (h: Homework) => courseById(h.courseId)?.name ?? h.courseName ?? '已删除的课';
  const hueOf = (courseId: string) => {
    const c = courseById(courseId);
    return c ? theme.courseHues[c.hue % theme.courseHues.length] : theme.faint;
  };
  const maxCourse = Math.max(1, ...stats.perCourse.map((c) => c.count));
  const maxDay = Math.max(1, ...stats.grid.flat());

  function moveBack(h: Homework) {
    haptic.select();
    setArchived({ [h.id]: false });
    toast(`「${h.title}」已移回首页的已完成`, { label: '撤销', onPress: () => setArchived({ [h.id]: h.archived }) });
  }

  return (
    <ModalScreen title="完成记录">
      {/* 三个数字 */}
      <View style={styles.stats}>
        <Stat value={String(stats.total)} label="完成的作业" />
        <Stat value={stats.onTime === null ? '—' : `${Math.round(stats.onTime * 100)}%`} label="按时交" />
        <Stat
          value={stats.busiestWeek ? `${stats.busiestWeek.monday.getMonth() + 1}/${stats.busiestWeek.monday.getDate()}` : '—'}
          extra={stats.busiestWeek ? `${stats.busiestWeek.count} 项` : undefined}
          label="最忙的一周"
        />
      </View>

      {/* 最近 15 周每天完成几项：一列一周，颜色越深完成越多 */}
      <Section title="每天完成">
        <Card style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <View style={{ gap: 4, marginRight: 2 }}>
              {WEEKDAYS.map((w, i) => (
                <Txt key={w} variant="caption" tone="faint" style={[styles.wd, i % 2 === 1 && { opacity: 0 }]}>
                  {w}
                </Txt>
              ))}
            </View>
            {stats.grid.map((week, wi) => (
              <View key={wi} style={{ flex: 1, gap: 4 }}>
                {week.map((n, di) => (
                  <View
                    key={di}
                    style={[styles.cell, { backgroundColor: n === 0 ? theme.line : withAlpha(theme.accent, 0.25 + 0.75 * (n / maxDay)) }]}
                  />
                ))}
              </View>
            ))}
          </View>
          <Txt variant="caption" tone="faint" style={{ marginTop: 8 }}>
            最近 15 周，最右边一列是这周
          </Txt>
        </Card>
      </Section>

      {stats.perCourse.length > 0 && (
        <Section title="每门课">
          <Card style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
            {stats.perCourse.map((c) => {
              const course = courseById(c.courseId);
              const name = course?.name ?? homework.find((h) => h.courseId === c.courseId)?.courseName ?? '已删除的课';
              return (
                <View key={c.courseId} style={styles.courseRow}>
                  <Txt variant="sub" numberOfLines={1} style={{ width: 104 }}>
                    {name}
                  </Txt>
                  <View style={[styles.barBg, { backgroundColor: theme.line }]}>
                    <View style={[styles.bar, { width: `${(c.count / maxCourse) * 100}%`, backgroundColor: hueOf(c.courseId) }]} />
                  </View>
                  <Txt variant="caption" tone="sub" style={{ width: 26, textAlign: 'right' }}>
                    {c.count}
                  </Txt>
                </View>
              );
            })}
          </Card>
        </Section>
      )}

      {archived.length === 0 ? (
        <Section title="归档">
          <Card style={{ padding: 18 }}>
            <Txt variant="sub" tone="sub" style={{ lineHeight: 20 }}>
              还没有归档的作业。完成的作业截止过了一周会自动搬到这里；也可以在首页「已完成」里点「全部归档」，或者把一条往左划。
            </Txt>
          </Card>
        </Section>
      ) : (
        months.map(([month, items]) => (
          <Section key={month} title={`${month} · ${items.length} 项`}>
            <Card>
              {items.map((h, i) => (
                <Press
                  key={h.id}
                  onPress={() => router.push(`/homework/${h.id}`)}
                  style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }]}>
                  <View style={[styles.dot, { backgroundColor: hueOf(h.courseId) }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt numberOfLines={1}>{h.title}</Txt>
                    <Txt variant="caption" tone="sub" numberOfLines={1}>
                      {courseName(h)} · {isTbd(h.due) ? '截止待定' : `${formatDue(h.due, true)} 截止`}
                      {h.ignored && !h.done ? ' · 与我无关' : ''}
                    </Txt>
                  </View>
                  <Press onPress={() => moveBack(h)} hitSlop={8} style={[styles.back, { borderColor: theme.line }]}>
                    <Txt variant="caption" tone="sub">
                      移回
                    </Txt>
                  </Press>
                </Press>
              ))}
            </Card>
          </Section>
        ))
      )}
    </ModalScreen>
  );
}

// extra：数字后面跟一个小字，比如最忙的一周那周完成了几项
function Stat({ value, extra, label }: { value: string; extra?: string; label: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: theme.card, borderColor: theme.glass ? theme.cardEdge : theme.line }]}>
      <Txt numberOfLines={1}>
        <Txt variant="title" style={{ fontSize: 22 }}>
          {value}
        </Txt>
        {extra ? (
          <Txt variant="caption" tone="sub">
            {'  '}
            {extra}
          </Txt>
        ) : null}
      </Txt>
      <Txt variant="caption" tone="sub" numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12 },
  wd: { height: 12, lineHeight: 12, fontSize: 9 },
  cell: { height: 12, borderRadius: 3 },
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  barBg: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  back: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
});
