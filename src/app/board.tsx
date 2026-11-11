import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { BoardRow, GlobalBoard } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { Card, Chip, ChipGroup, ModalScreen, Txt } from '@/components/ui';
import { errorText, useOnline } from '@/data/online';
import { useStore } from '@/data/store';
import { useTheme } from '@/theme/useTheme';

// 排行榜。班级榜：这个班这学期的贡献值，决定档位和投票权重；总榜：所有班加起来，只是看看谁对社区贡献最大
export default function Board() {
  const params = useLocalSearchParams<{ classId?: string }>();
  const { courses } = useStore();
  const online = useOnline();
  const classes = courses.filter((c) => c.serverClassId);
  const [tab, setTab] = useState<'class' | 'global'>(params.classId || classes.length ? 'class' : 'global');
  const [classId, setClassId] = useState<number | undefined>(params.classId ? Number(params.classId) : classes[0]?.serverClassId);
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [global, setGlobal] = useState<GlobalBoard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    if (tab === 'class') {
      if (!classId) return;
      setRows(null);
      online.classBoard(classId).then(setRows).catch((e) => setError(errorText(e)));
    } else {
      setGlobal(null);
      online.globalBoard().then(setGlobal).catch((e) => setError(errorText(e)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, classId]);

  const me = online.account?.user.id;

  return (
    <ModalScreen title="贡献榜">
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="班级榜" active={tab === 'class'} onPress={() => setTab('class')} />
        <Chip label="总榜" active={tab === 'global'} onPress={() => setTab('global')} />
      </View>
      <Txt variant="caption" tone="sub" style={{ marginTop: 12, lineHeight: 19 }}>
        {tab === 'class'
          ? '传的作业被确认 +10，纠错被采纳 +5，更新被采纳 +3，自己传的被别人纠错 −5。分数决定在这个班的档位：教务导入的直接是同学，手动加入的攒到 20 分成为同学；60 分热心同学，120 分靠谱同学。档位越高，投票越有分量。'
          : '所有班、所有学期加起来，看看谁为大家做的最多。只是看看，不影响投票。'}
      </Txt>

      {tab === 'class' && classes.length > 1 && (
        <ChipGroup label="哪个班">
          {classes.map((c) => (
            <Chip key={c.id} label={c.name} active={classId === c.serverClassId} onPress={() => setClassId(c.serverClassId)} />
          ))}
        </ChipGroup>
      )}

      {error ? (
        <Txt variant="caption" tone="urgent" style={{ marginTop: 18 }}>
          {error}
        </Txt>
      ) : tab === 'class' ? (
        !classId ? (
          <Txt tone="faint" style={{ marginTop: 22 }}>
            加入教学班以后才有班级榜
          </Txt>
        ) : !rows ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : (
          <Card style={{ marginTop: 18 }}>
            {rows.map((r, i) => (
              <Row key={r.user.id} rank={i + 1} user={r.user} sub={r.tierName} score={r.score} me={r.user.id === me} first={i === 0} />
            ))}
          </Card>
        )
      ) : !global ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <>
          {global.top.length === 0 ? (
            <Txt tone="faint" style={{ marginTop: 22 }}>
              还没有人得分，传一条作业被确认就能上榜
            </Txt>
          ) : (
            <Card style={{ marginTop: 18 }}>
              {global.top.map((r, i) => (
                <Row key={r.user.id} rank={r.rank} user={r.user} score={r.score} me={r.user.id === me} first={i === 0} />
              ))}
            </Card>
          )}
          {global.me && (
            <Txt variant="caption" tone="sub" style={{ marginTop: 12, textAlign: 'center' }}>
              我一共 {global.me.score} 分{global.me.rank ? `，排第 ${global.me.rank} 名` : '，还没上榜'}
            </Txt>
          )}
        </>
      )}
    </ModalScreen>
  );
}

function Row({ rank, user, sub, score, me, first }: { rank: number; user: BoardRow['user']; sub?: string; score: number; me: boolean; first: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }, me && { backgroundColor: theme.accentSoft }]}>
      <Txt variant="sub" tone={rank <= 3 ? 'accent' : 'faint'} style={{ width: 26, fontWeight: '700' }}>
        {rank}
      </Txt>
      <Avatar user={user} size={30} />
      <View style={{ flex: 1 }}>
        <Txt variant="sub" numberOfLines={1}>
          {user.nickname}
          {me ? '（我）' : ''}
        </Txt>
        {sub ? (
          <Txt variant="caption" tone="faint">
            {sub}
          </Txt>
        ) : null}
      </View>
      <Txt variant="sub" style={{ fontWeight: '600' }}>
        {score}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
});
