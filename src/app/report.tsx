import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CalendarPicker } from '@/components/CalendarPicker';
import { haptic } from '@/components/haptic';
import { TimePicker } from '@/components/TimePicker';
import { useToast } from '@/components/Toast';
import { Card, Chip, ChipGroup, closeModal, Field, ModalScreen, Press, PrimaryButton, Txt } from '@/components/ui';
import { formatDue, hhmm, isTbd } from '@/data/format';
import { errorText, useOnline } from '@/data/online';
import { useStore } from '@/data/store';
import type { Homework } from '@/data/types';
import { useTheme } from '@/theme/useTheme';

type Kind = 'correct' | 'update' | 'duplicate';

const KINDS: { kind: Kind; title: string; hint: string }[] = [
  { kind: 'correct', title: '内容不对', hint: '传的同学写错了，比如题号、截止时间、提交方式' },
  { kind: 'update', title: '老师改了', hint: '老师后来改了要求或时间，或者说不用交了' },
  { kind: 'duplicate', title: '重复了', hint: '和另一条是同一个作业' },
];

const methods = ['纸质', '学习通', '邮箱', '其他'];

// 「有问题」：提一个修改，大家同意了（或者上传的同学采纳了）才生效。不会直接改掉别人传的内容
export default function Report() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { homework } = useStore();
  const item = homework.find((h) => h.id === id);
  const [kind, setKind] = useState<Kind | null>(null);

  if (!item?.remote) {
    return (
      <ModalScreen title="有问题">
        <Txt tone="sub">这条作业不见了</Txt>
      </ModalScreen>
    );
  }
  if (!kind) return <PickKind onPick={setKind} />;
  if (kind === 'duplicate') return <PickDuplicate item={item} />;
  return <EditProposal item={item} kind={kind} />;
}

function PickKind({ onPick }: { onPick: (k: Kind) => void }) {
  const { theme } = useTheme();
  return (
    <ModalScreen title="有问题">
      <Txt variant="sub" tone="sub" style={{ lineHeight: 21 }}>
        提出来以后，班里同学投票；同意的人够了就改过来。上传的同学也可以直接采纳。
      </Txt>
      <View style={{ gap: 10, marginTop: 18 }}>
        {KINDS.map((k) => (
          <Press key={k.kind} onPress={() => onPick(k.kind)}>
            <Card style={styles.kind}>
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: '600' }}>{k.title}</Txt>
                <Txt variant="caption" tone="sub" style={{ marginTop: 4 }}>
                  {k.hint}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.faint} />
            </Card>
          </Press>
        ))}
      </View>
    </ModalScreen>
  );
}

function EditProposal({ item, kind }: { item: Homework; kind: 'correct' | 'update' }) {
  const online = useOnline();
  const toast = useToast();
  const tbdNow = isTbd(item.due);
  const [title, setTitle] = useState(item.title);
  const [detail, setDetail] = useState(item.detail);
  const [submit, setSubmit] = useState<string>(item.submit);
  const [tbd, setTbd] = useState(tbdNow);
  const [date, setDate] = useState(() => {
    const d = new Date(tbdNow ? Date.now() + 86_400_000 : item.due);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [time, setTime] = useState(tbdNow ? '23:59' : hhmm(item.due));
  const [pickDue, setPickDue] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const due = new Date(date);
  const [h, m] = time.split(':').map(Number);
  due.setHours(h, m, 0, 0);

  // 只把真正改了的字段发上去
  const changes: Record<string, unknown> = {};
  if (cancel) changes.cancel = true;
  else {
    if (title.trim() && title.trim() !== item.title) changes.title = title.trim();
    if (detail.trim() !== item.detail) changes.detail = detail.trim();
    if (submit !== item.submit) changes.submit = submit;
    if (tbd && !tbdNow) changes.dueKind = 'tbd';
    // 表单只精确到分钟，原来的时间可能带秒，按分钟比才不会把没改的时间当成改了
    const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
    if (!tbd && (tbdNow || minute(due) !== minute(item.due))) {
      changes.dueKind = 'at';
      changes.due = due.toISOString();
    }
  }
  const empty = Object.keys(changes).length === 0;

  async function send() {
    if (busy || empty) return;
    setBusy(true);
    try {
      await online.propose(item, { kind, changes, reason: reason.trim() });
      haptic.success();
      closeModal();
      toast(item.mine ? '已提出，等同学们同意' : '已提出，上传的同学采纳或者同意的人够了就会改过来');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalScreen
      title={kind === 'correct' ? '内容不对' : '老师改了'}
      footer={<PrimaryButton label={busy ? '提交中…' : empty ? '改一下上面的内容' : '提出修改'} onPress={send} disabled={empty || busy} />}>
      <Txt variant="sub" tone="sub" style={{ lineHeight: 21 }}>
        把不对的地方改成正确的，只会提交改了的部分。
      </Txt>

      {kind === 'update' && (
        <ChipGroup label="老师是不是说不用交了">
          <Chip label="还要交，只是改了" active={!cancel} onPress={() => setCancel(false)} />
          <Chip label="作业取消了" active={cancel} onPress={() => setCancel(true)} />
        </ChipGroup>
      )}

      {!cancel && (
        <>
          <Field label="标题" value={title} onChangeText={setTitle} />
          <ChipGroup label="截止时间">
            <Chip label={tbd ? '具体时间' : formatDue(due)} active={!tbd} onPress={() => (tbd ? setTbd(false) : setPickDue((v) => !v))} />
            <Chip label="待定" active={tbd} onPress={() => setTbd(true)} />
          </ChipGroup>
          {!tbd && pickDue && (
            <>
              <CalendarPicker value={date} onChange={setDate} />
              <TimePicker value={time} onChange={setTime} />
            </>
          )}
          <ChipGroup label="提交方式">
            {methods.map((x) => (
              <Chip key={x} label={x} active={submit === x} onPress={() => setSubmit(x)} />
            ))}
          </ChipGroup>
          <Field label="要求" value={detail} onChangeText={setDetail} multiline />
        </>
      )}

      <Field label="说明（可选）" placeholder="比如：老师在群里说的 / 学习通上写的是第四章" value={reason} onChangeText={setReason} maxLength={200} />
    </ModalScreen>
  );
}

function PickDuplicate({ item }: { item: Homework }) {
  const { theme } = useTheme();
  const { homework } = useStore();
  const online = useOnline();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // 同一门课里别的、还在进行中的作业
  const others = homework.filter(
    (h) => h.id !== item.id && h.courseId === item.courseId && h.remote && h.remote.state !== 'merged' && h.remote.state !== 'cancelled',
  );

  async function pick(other: Homework) {
    if (busy) return;
    setBusy(true);
    try {
      await online.propose(item, { kind: 'duplicate', targetId: other.remote!.id });
      haptic.success();
      closeModal();
      toast('已提出，同意的人够了就合并成一条');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalScreen title="和哪一条重复">
      <Txt variant="sub" tone="sub" style={{ lineHeight: 21 }}>
        选出和「{item.title}」是同一个作业的那一条。合并后保留先传的那条。
      </Txt>
      {others.length === 0 ? (
        <Txt tone="faint" style={{ marginTop: 22 }}>
          这门课没有别的作业
        </Txt>
      ) : (
        <Card style={{ marginTop: 18 }}>
          {others.map((h, i) => (
            <Press key={h.id} onPress={() => pick(h)} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }]}>
              <View style={{ flex: 1 }}>
                <Txt numberOfLines={1}>{h.title}</Txt>
                <Txt variant="caption" tone="sub" style={{ marginTop: 3 }}>
                  {h.uploader} 上传 · {isTbd(h.due) ? '截止待定' : `${formatDue(h.due, true)} 截止`}
                </Txt>
              </View>
              <Txt variant="sub" tone="accent">
                是这条
              </Txt>
            </Press>
          ))}
        </Card>
      )}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16 },
  kind: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
