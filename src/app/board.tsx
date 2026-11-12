import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import type { BoardRow, GlobalBoard, MyClass, Tier, UserRef } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { haptic } from '@/components/haptic';
import { Sheet } from '@/components/Sheet';
import { Card, ModalScreen, Press, Txt } from '@/components/ui';
import { TIER_NAMES } from '@/data/labels';
import { errorText, useOnline } from '@/data/online';
import { useStore } from '@/data/store';
import { useTheme } from '@/theme/useTheme';

// 贡献榜。
//   班级榜：这个班这学期的贡献值，决定档位和投票权重
//   总分榜：所有班加起来，分总榜、月榜、周榜，只是看看谁为大家做得最多，不影响投票
// 样子：顶上分段开关切两个榜；前三名站领奖台，第四名往后是列表；积分规则收在标题旁的小问号里
type Tab = 'class' | 'all';
type Period = 'all' | 'month' | 'week';
const PERIODS: [Period, string][] = [
  ['all', '总榜'],
  ['month', '月榜'],
  ['week', '周榜'],
];
const TIERS: [Tier, string][] = [
  ['newbie', '手动加入'],
  ['member', '导入 / 20 分'],
  ['helper', '60 分'],
  ['trusted', '120 分'],
];
// 领奖台的金银铜
const MEDAL = ['#c9a24a', '#9aa3ad', '#b5835a'];

type Entry = { rank: number; user: UserRef; score: number; sub?: string };

export default function Board() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ classId?: string }>();
  const { courses } = useStore();
  const online = useOnline();
  const classes = courses.filter((c) => c.serverClassId);
  const [tab, setTab] = useState<Tab>(params.classId || classes.length ? 'class' : 'all');
  const [classId, setClassId] = useState<number | undefined>(params.classId ? Number(params.classId) : classes[0]?.serverClassId);
  const [period, setPeriod] = useState<Period>('all');
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [global, setGlobal] = useState<GlobalBoard | null>(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<'class' | 'rules' | null>(null);
  // 我在每个班的分数和档位：选择器和班级列表里显示
  const [mine, setMine] = useState<Map<number, MyClass>>(new Map());

  useEffect(() => {
    if (!online.loggedIn) return;
    online
      .me()
      .then((m) => setMine(new Map(m.classes.map((c) => [c.id, c]))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online.loggedIn]);

  useEffect(() => {
    setError('');
    if (tab === 'class') {
      if (!classId) return;
      setRows(null);
      online.classBoard(classId).then(setRows).catch((e) => setError(errorText(e)));
    } else {
      setGlobal(null);
      online.globalBoard(period).then(setGlobal).catch((e) => setError(errorText(e)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, classId, period]);

  const me = online.account?.user.id;
  const current = classes.find((c) => c.serverClassId === classId);
  const myHere = classId ? mine.get(classId) : undefined;

  const entries: Entry[] | null =
    tab === 'class'
      ? rows && rows.map((r, i) => ({ rank: i + 1, user: r.user, score: r.score, sub: r.tierName }))
      : global && global.top.map((r) => ({ rank: r.rank, user: r.user, score: r.score }));
  const loading = !error && (tab === 'class' ? !!classId && !rows : !global);

  return (
    <ModalScreen>
      <View style={styles.titleRow}>
        <Txt variant="title">贡献榜</Txt>
        <Press onPress={() => setSheet('rules')} hitSlop={10} style={[styles.help, { borderColor: theme.faint }]}>
          <Txt variant="caption" tone="sub" style={{ fontSize: 12, lineHeight: 14 }}>
            ?
          </Txt>
        </Press>
      </View>

      <Segmented value={tab} onChange={setTab} />

      {tab === 'class' ? (
        classes.length === 0 ? null : (
          <Press onPress={() => setSheet('class')} style={[styles.picker, { borderColor: theme.glass ? theme.cardEdge : theme.line, backgroundColor: theme.card }]}>
            <Txt variant="label" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>
              {current?.name ?? '选一个班'}
            </Txt>
            {myHere ? (
              <Txt variant="caption" tone="sub">
                我 {myHere.myScore} 分
              </Txt>
            ) : null}
            <Ionicons name="chevron-down" size={15} color={theme.sub} />
          </Press>
        )
      ) : (
        <View style={styles.periods}>
          {PERIODS.map(([p, label]) => (
            <Press key={p} onPress={() => setPeriod(p)} hitSlop={6} style={[styles.period, period === p && { borderBottomColor: theme.accent }]}>
              <Txt variant="sub" tone={period === p ? 'text' : 'faint'} style={period === p && { fontWeight: '600' }}>
                {label}
              </Txt>
            </Press>
          ))}
        </View>
      )}

      {error ? (
        <Txt variant="caption" tone="urgent" style={{ marginTop: 18 }}>
          {error}
        </Txt>
      ) : tab === 'class' && !classId ? (
        <Txt tone="faint" style={{ marginTop: 22 }}>
          加入教学班以后才有班级榜
        </Txt>
      ) : loading || !entries ? (
        <ActivityIndicator style={{ marginTop: 28 }} />
      ) : !entries.some((e) => e.score > 0) ? (
        // 还没人得分：不站领奖台，班级榜照样列出班里的人
        <>
          <Txt tone="faint" style={{ marginTop: 22 }}>
            {tab === 'class' ? '班里还没人得分，传一条作业被确认就能上榜' : `${PERIODS.find(([p]) => p === period)![1]}还没有人得分`}
          </Txt>
          {entries.length > 0 && (
            <Card style={{ marginTop: 14 }}>
              {entries.map((e, i) => (
                <Row key={e.user.id} entry={e} me={e.user.id === me} first={i === 0} />
              ))}
            </Card>
          )}
        </>
      ) : (
        <>
          <Podium top={entries.slice(0, 3)} me={me} />
          {entries.length > 3 && (
            <Card style={{ marginTop: 14 }}>
              {entries.slice(3).map((e, i) => (
                <Row key={e.user.id} entry={e} me={e.user.id === me} first={i === 0} />
              ))}
            </Card>
          )}
          {tab === 'all' && global?.me && (
            <Txt variant="caption" tone="sub" style={{ marginTop: 12, textAlign: 'center' }}>
              我在{PERIODS.find(([p]) => p === period)![1]}一共 {global.me.score} 分{global.me.rank ? `，排第 ${global.me.rank} 名` : '，还没上榜'}
            </Txt>
          )}
        </>
      )}

      {/* 选班：每个班旁边写着我在那个班的档位和分数 */}
      <Sheet visible={sheet === 'class'} onClose={() => setSheet(null)} title="选择班级">
        <Card>
          {classes.map((c, i) => {
            const m = mine.get(c.serverClassId!);
            const on = c.serverClassId === classId;
            return (
              <Press
                key={c.id}
                onPress={() => {
                  haptic.select();
                  setClassId(c.serverClassId);
                  setSheet(null);
                }}
                style={[styles.sheetRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }]}>
                <Txt numberOfLines={1} tone={on ? 'accent' : 'text'} style={[{ flex: 1 }, on && { fontWeight: '600' }]}>
                  {c.name}
                </Txt>
                {m ? (
                  <Txt variant="caption" tone="sub">
                    {TIER_NAMES[m.myTier]} · {m.myScore} 分
                  </Txt>
                ) : null}
              </Press>
            );
          })}
        </Card>
      </Sheet>

      <Sheet visible={sheet === 'rules'} onClose={() => setSheet(null)} title="积分怎么算">
        <Rules tier={tab === 'class' ? myHere?.myTier : undefined} />
      </Sheet>
    </ModalScreen>
  );
}

// 1 的分段开关：白色滑块左右滑
function Segmented({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  const { theme } = useTheme();
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(value === 'all' ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: value === 'all' ? 1 : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [value, x]);
  const half = Math.max(0, (w - 6) / 2);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[styles.seg, { backgroundColor: theme.line }]}>
      {w > 0 && (
        <Animated.View
          style={[
            styles.thumb,
            { width: half, backgroundColor: theme.dark ? theme.bg[2] ?? theme.card : theme.card, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, half] }) }] },
          ]}
        />
      )}
      {(
        [
          ['class', '班级榜'],
          ['all', '总分榜'],
        ] as [Tab, string][]
      ).map(([t, label]) => (
        <Press
          key={t}
          onPress={() => {
            if (t !== value) haptic.select();
            onChange(t);
          }}
          style={styles.segBtn}>
          <Txt variant="sub" tone={value === t ? 'text' : 'sub'} style={value === t && { fontWeight: '600' }}>
            {label}
          </Txt>
        </Press>
      ))}
    </View>
  );
}

// 3 的领奖台：第二、第一、第三从左到右，第一名最高
function Podium({ top, me }: { top: Entry[]; me?: number }) {
  const { theme } = useTheme();
  const order = [top[1], top[0], top[2]];
  const heights = [46, 64, 34];
  return (
    <View style={styles.podium}>
      {order.map((e, i) => {
        const place = [2, 1, 3][i];
        if (!e) return <View key={place} style={{ flex: i === 1 ? 1.15 : 1 }} />;
        const isMe = e.user.id === me;
        return (
          <View key={place} style={{ flex: i === 1 ? 1.15 : 1, alignItems: 'center' }}>
            <View style={[styles.podAvatar, { borderColor: isMe ? theme.accent : 'transparent' }]}>
              <Avatar user={e.user} size={place === 1 ? 52 : 42} />
            </View>
            <Txt variant="sub" numberOfLines={1} tone={isMe ? 'accent' : 'text'} style={{ marginTop: 4, maxWidth: '100%', fontWeight: isMe ? '600' : '400' }}>
              {isMe ? '我' : e.user.nickname}
            </Txt>
            <Txt variant="caption" tone="sub">
              {e.score} 分{e.sub ? ` · ${e.sub}` : ''}
            </Txt>
            <View style={[styles.step, { height: heights[i], backgroundColor: MEDAL[place - 1] }]}>
              <Txt variant="title" style={{ color: '#fff', fontSize: 18 }}>
                {place}
              </Txt>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Row({ entry, me, first }: { entry: Entry; me: boolean; first: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }, me && { backgroundColor: theme.accentSoft }]}>
      <Txt variant="sub" tone="faint" style={{ width: 26, fontWeight: '700' }}>
        {entry.rank}
      </Txt>
      <Avatar user={entry.user} size={30} />
      <View style={{ flex: 1 }}>
        <Txt variant="sub" numberOfLines={1}>
          {entry.user.nickname}
          {me ? '（我）' : ''}
        </Txt>
        {entry.sub ? (
          <Txt variant="caption" tone="faint">
            {entry.sub}
          </Txt>
        ) : null}
      </View>
      <Txt variant="sub" style={{ fontWeight: '600' }}>
        {entry.score}
      </Txt>
    </View>
  );
}

// 积分规则：怎么加减分、四个档位（看班级榜时我所在的档位亮起来）
function Rules({ tier }: { tier?: Tier }) {
  const { theme } = useTheme();
  const rule = (pts: string, text: string, negative = false) => (
    <View style={styles.rule}>
      <Txt variant="label" tone={negative ? 'sub' : 'accent'} style={{ width: 36, textAlign: 'right' }}>
        {pts}
      </Txt>
      <Txt variant="sub">{text}</Txt>
    </View>
  );
  return (
    <View>
      {rule('+10', '你传的作业被同学确认')}
      {rule('+5', '你提的纠错被采纳')}
      {rule('+3', '你提的更新被采纳')}
      {rule('−5', '你传的作业被别人纠错', true)}
      <Txt variant="caption" tone="sub" style={{ marginTop: 14, marginBottom: 8 }}>
        班级榜的分数决定你在这个班的档位，档位越高投票越有分量
      </Txt>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {TIERS.map(([t, when]) => {
          const on = t === tier;
          return (
            <View key={t} style={[styles.tier, { borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.accentSoft : theme.card }]}>
              <Txt variant="caption" tone={on ? 'accent' : 'text'} style={{ fontWeight: '600' }}>
                {TIER_NAMES[t]}
              </Txt>
              <Txt variant="caption" tone="faint" style={{ fontSize: 10 }}>
                {when}
              </Txt>
            </View>
          );
        })}
      </View>
      <Txt variant="caption" tone="faint" style={{ marginTop: 12, lineHeight: 18 }}>
        每个班、每个学期分开算。从教务导入课表的直接是「同学」，手动搜索加入的攒到 20 分成为同学。总分榜把所有班加起来，周榜每周一、月榜每月 1 号重新算，只是看看，不影响投票。
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  help: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3, marginTop: 14 },
  thumb: { position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: 9, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  periods: { flexDirection: 'row', gap: 18, marginTop: 14, marginLeft: 2 },
  period: { paddingBottom: 4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 22 },
  podAvatar: { borderWidth: 2, borderRadius: 999, padding: 1 },
  step: { alignSelf: 'stretch', marginTop: 6, borderTopLeftRadius: 10, borderTopRightRadius: 10, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14 },
  rule: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 5 },
  tier: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingVertical: 7 },
});
