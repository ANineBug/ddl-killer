import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { RemoteChange, RemoteDetail, RemoteProposal } from '@/api/types';
import { haptic } from '@/components/haptic';
import { useToast } from '@/components/Toast';
import { Card, Chip, Press, Txt } from '@/components/ui';
import { formatAgo } from '@/data/format';
import { fieldName, fieldValue, PROPOSAL_KIND, PROPOSAL_STATUS } from '@/data/labels';
import { errorText, useOnline } from '@/data/online';
import { localHomeworkId } from '@/data/remote';
import { useStore } from '@/data/store';
import type { Homework } from '@/data/types';
import { useTheme } from '@/theme/useTheme';

// 作业详情里和"大家"有关的部分：进行中的提议、可能重复的作业、改动记录。只有服务器上的作业才有
export function HomeworkCommunity({ item, detail, reload }: { item: Homework; detail: RemoteDetail | null; reload: () => void }) {
  const { homework } = useStore();
  const { theme } = useTheme();
  const sep = [styles.sep, { borderTopColor: theme.line }];
  if (!detail) {
    return <ActivityIndicator style={{ marginTop: 24 }} />;
  }
  const open = detail.proposals.filter((p) => p.status === 'open' && (p.homeworkId === detail.id || p.kind === 'duplicate'));
  const closed = detail.proposals.filter((p) => p.status !== 'open' && p.homeworkId === detail.id).slice(0, 5);
  const titleOf = (serverId: number | null) => {
    if (serverId === null) return '';
    return homework.find((h) => h.id === localHomeworkId(serverId))?.title ?? detail.mergedFrom.find((m) => m.id === serverId)?.title ?? `第 ${serverId} 条`;
  };
  const duplicates = item.possibleDuplicates ?? [];

  return (
    <>
      {open.length > 0 && (
        <Block title="大家的提议">
          {open.map((p) => (
            <ProposalCard key={p.id} item={item} detail={detail} p={p} titleOf={titleOf} reload={reload} />
          ))}
        </Block>
      )}

      {(duplicates.length > 0 || detail.mergedFrom.length > 0) && (
        <Block title="可能与这条作业重复的作业">
          <Card>
            {duplicates.map((id, i) => {
              const h = homework.find((x) => x.id === id);
              return (
                <Press key={id} onPress={() => router.push(`/homework/${id}`)} style={[styles.line, i > 0 && sep]}>
                  <Txt variant="sub" style={{ flex: 1 }} numberOfLines={1}>
                    {h?.title ?? '另一条作业'}
                  </Txt>
                  <Txt variant="caption" tone="faint">
                    {h ? `${h.uploader} 上传 ›` : '›'}
                  </Txt>
                </Press>
              );
            })}
            {detail.mergedFrom.length > 0 && (
              <View style={[styles.line, duplicates.length > 0 && sep]}>
                <Txt variant="caption" tone="sub">
                  已合并 {detail.mergedFrom.length} 条：{detail.mergedFrom.map((m) => `「${m.title}」`).join('')}
                </Txt>
              </View>
            )}
          </Card>
        </Block>
      )}

      {detail.history.length > 0 && (
        <Block title="改动记录">
          <Card>
            {[...detail.history].reverse().map((c, i) => (
              <ChangeRow key={c.id} change={c} first={i === 0} sep={sep} />
            ))}
          </Card>
        </Block>
      )}

      {closed.length > 0 && (
        <Block title="结束了的提议">
          {closed.map((p) => (
            <ProposalCard key={p.id} item={item} detail={detail} p={p} titleOf={titleOf} reload={reload} />
          ))}
        </Block>
      )}
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 26 }}>
      <Txt variant="caption" tone="sub" style={{ marginBottom: 8, marginLeft: 4 }}>
        {title}
      </Txt>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

const num = (n: number) => String(Math.round(n * 10) / 10);

function ProposalCard({
  item,
  detail,
  p,
  titleOf,
  reload,
}: {
  item: Homework;
  detail: RemoteDetail;
  p: RemoteProposal;
  titleOf: (id: number | null) => string;
  reload: () => void;
}) {
  const online = useOnline();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const me = online.account?.user.id;
  const isOpen = p.status === 'open';
  const mineProposal = p.proposer.id === me;
  const canAdopt = isOpen && item.mine && !mineProposal && (p.kind === 'correct' || p.kind === 'update');

  async function run(fn: () => Promise<unknown>, done?: string) {
    if (busy) return;
    if (!online.loggedIn) {
      toast('登录后才能投票', { label: '登录', onPress: () => router.push('/login') });
      return;
    }
    setBusy(true);
    haptic.select();
    try {
      await fn();
      if (done) toast(done);
      reload();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // 提议要改的地方：「截止时间：周五 23:59 → 下周一 23:59」
  const lines =
    p.kind === 'correct' || p.kind === 'update'
      ? Object.entries(p.changes ?? {}).map(([k, v]) => {
          if (k === 'cancel') return '作业取消了';
          // 进行中的和现在的内容比；结束了的作业可能已经改过，只说当时提议改成什么
          if (!isOpen) return `${fieldName(k)}改成 ${fieldValue(k, v)}`;
          const current = (detail as unknown as Record<string, unknown>)[k];
          return `${fieldName(k)}：${fieldValue(k, current)} → ${fieldValue(k, v)}`;
        })
      : p.kind === 'duplicate'
        ? [`「${titleOf(p.homeworkId)}」和「${titleOf(p.targetId)}」是同一个作业`]
        : [`「${titleOf(p.homeworkId)}」不是重复，拆回来单独一条`];

  return (
    <Card style={{ padding: 14, opacity: isOpen ? 1 : 0.6 }}>
      <View style={styles.head}>
        <Txt variant="sub" style={{ fontWeight: '600' }}>
          {PROPOSAL_KIND[p.kind]}
        </Txt>
        <Txt variant="caption" tone={isOpen ? 'accent' : 'faint'}>
          {p.status === 'applied' && p.appliedVia === 'adopt' ? '上传的同学采纳了' : PROPOSAL_STATUS[p.status]}
        </Txt>
      </View>
      {lines.map((l, i) => (
        <Txt key={i} variant="sub" style={{ marginTop: 6, lineHeight: 20 }}>
          {l}
        </Txt>
      ))}
      {p.reason ? (
        <Txt variant="caption" tone="sub" style={{ marginTop: 6 }}>
          「{p.reason}」
        </Txt>
      ) : null}
      <Txt variant="caption" tone="faint" style={{ marginTop: 8 }}>
        {p.proposer.nickname} 提的 · {formatAgo(new Date(p.createdAt))} · 同意 {num(p.agree)} / 反对 {num(p.disagree)} · 够 {p.threshold} 就生效
      </Txt>

      {isOpen && (
        <View style={styles.actions}>
          {mineProposal ? (
            <Chip label={busy ? '…' : '撤回'} onPress={() => run(() => online.withdraw(item, p.id), '已撤回')} />
          ) : canAdopt ? (
            <>
              <Txt variant="caption" tone="sub" style={{ flex: 1 }}>
                你传的作业，同意就采纳
              </Txt>
              <Chip label={busy ? '…' : '采纳'} active onPress={() => run(() => online.adopt(item, p.id), '已采纳，作业已经改好了')} />
            </>
          ) : (
            <>
              <Chip label="同意" active={p.myVote === true} onPress={() => run(() => online.vote(item, p.id, true))} />
              <Chip label="反对" active={p.myVote === false} onPress={() => run(() => online.vote(item, p.id, false))} />
            </>
          )}
        </View>
      )}
    </Card>
  );
}

function ChangeRow({ change, first, sep }: { change: RemoteChange; first: boolean; sep: object[] }) {
  return (
    <View style={[styles.change, !first && sep]}>
      {Object.entries(change.changes).map(([k, v]) => (
        <Txt key={k} variant="sub" style={{ lineHeight: 20 }}>
          {fieldName(k)}：{fieldValue(k, v.from)} → {fieldValue(k, v.to)}
        </Txt>
      ))}
      <Txt variant="caption" tone="faint" style={{ marginTop: 4 }}>
        {change.by.nickname} {change.proposalId ? '的提议生效' : '改的'} · {formatAgo(new Date(change.at))}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  change: { paddingVertical: 12, paddingHorizontal: 16 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth },
});
