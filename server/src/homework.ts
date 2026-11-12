import { z } from 'zod';

import { attachmentsFor } from './attachments.ts';
import { userRef } from './avatar.ts';
import { classWeights, requireMember } from './classes.ts';
import { type Ctx, forbidden, HttpError, notFound, type User } from './context.ts';
import type { Db } from './db.ts';
import { DAILY_UPLOADS, NEWBIE_DAILY_UPLOADS, POINTS, threshold, type ThresholdKind } from './rules.ts';

// ---------- 输入 ----------

const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), '时间格式不对')
  .transform((s) => new Date(s));

const fields = {
  title: z.string().trim().min(1, '标题不能为空').max(60),
  detail: z.string().trim().max(1000),
  dueKind: z.enum(['at', 'next_class', 'tbd']),
  due: isoDate.nullable(),
  submit: z.string().trim().min(1).max(20),
  source: z.enum(['课堂口头', '学习通', '群通知']),
  optional: z.boolean(),
  groupWork: z.boolean(),
};

export const HomeworkIn = z
  .object({
    ...fields,
    detail: fields.detail.default(''),
    due: fields.due.optional(),
    optional: fields.optional.default(false),
    groupWork: fields.groupWork.default(false),
  })
  .refine((v) => v.dueKind === 'tbd' || v.due, { message: '要填截止时间', path: ['due'] });

// 改动：只写要改的字段。cancel 表示"老师说这个作业取消了"
export const ChangesIn = z
  .object({ ...fields, cancel: z.literal(true) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, '没有要改的内容');

export const ProposalIn = z.object({
  kind: z.enum(['correct', 'update', 'duplicate', 'unduplicate']),
  changes: ChangesIn.optional(),
  targetId: z.number().int().optional(),
  reason: z.string().trim().max(200).default(''),
});

type Changes = z.infer<typeof ChangesIn>;

// ---------- 数据库里的一行 ----------

type HwRow = {
  id: number;
  class_id: number;
  uploader_id: number;
  uploader_name: string;
  uploader_avatar: number;
  title: string;
  detail: string;
  due_kind: 'at' | 'next_class' | 'tbd';
  due: Date | null;
  submit: string;
  source: string;
  optional: boolean;
  group_work: boolean;
  status: 'active' | 'cancelled' | 'merged' | 'deleted';
  merged_into: number | null;
  postponed: boolean;
  version: number;
  confirmed_at: Date | null;
  remind_ready: boolean;
  created_at: Date;
  updated_at: Date;
};

type ProposalRow = {
  id: number;
  homework_id: number;
  proposer_id: number;
  kind: 'correct' | 'update' | 'duplicate' | 'unduplicate';
  changes: Record<string, unknown> | null;
  target_id: number | null;
  reason: string;
  status: string;
  applied_via: string | null;
  applied_version: number | null;
  points_at: Date | null;
  created_at: Date;
};

const HW_COLS = `h.*, u.nickname uploader_name, u.avatar_version uploader_avatar`;

async function loadHw(db: Db, id: number, lock = false) {
  // 投票、确认、采纳都会先锁住这条作业，两个人同时操作也只会一个一个算门槛
  if (lock) await db.query('select id from homework where id = $1 for update', [id]);
  const h = await db.one<HwRow>(`select ${HW_COLS} from homework h join users u on u.id = h.uploader_id where h.id = $1`, [id]);
  if (!h || h.status === 'deleted') throw notFound('作业');
  return h;
}

async function loadProposal(db: Db, id: number) {
  const p = await db.one<ProposalRow>('select * from proposals where id = $1', [id]);
  if (!p) throw notFound('提议');
  return p;
}

const isClosed = (h: HwRow, now: Date) => h.due !== null && h.due < now;

// 中国时间的今天零点，"每天最多传几条"按这个算
function dayStart(now: Date) {
  const offset = 8 * 3600_000;
  return new Date(Math.floor((now.getTime() + offset) / 86_400_000) * 86_400_000 - offset);
}

// ---------- 给 app 的样子 ----------

export type HomeworkState = 'pending' | 'confirmed' | 'disputed' | 'cancelled' | 'closed' | 'merged';

function stateOf(h: HwRow, disputed: boolean, now: Date): HomeworkState {
  if (h.status === 'merged') return 'merged';
  if (h.status === 'cancelled') return 'cancelled';
  if (isClosed(h, now)) return 'closed';
  if (disputed) return 'disputed';
  return h.confirmed_at ? 'confirmed' : 'pending';
}

async function views(db: Db, rows: HwRow[], userId: number | null, now: Date) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const conf = await db.query<{ homework_id: number; current: number; total: number }>(
    `select c.homework_id, count(*) filter (where c.version = h.version)::int current, count(*)::int total
     from confirmations c join homework h on h.id = c.homework_id where c.homework_id = any($1::int[]) group by c.homework_id`,
    [ids],
  );
  const reacts = await db.query<{ homework_id: number; kind: string; n: number }>(
    'select homework_id, kind, count(*)::int n from reactions where homework_id = any($1::int[]) group by homework_id, kind',
    [ids],
  );
  const open = await db.query<ProposalRow>(
    `select * from proposals where status = 'open' and (homework_id = any($1::int[]) or target_id = any($1::int[]))`,
    [ids],
  );
  const merged = await db.query<{ merged_into: number; n: number }>(
    `select merged_into, count(*)::int n from homework where status = 'merged' and merged_into = any($1::int[]) group by merged_into`,
    [ids],
  );
  const files = await attachmentsFor(db, ids);
  const mine = userId
    ? {
        conf: await db.query<{ homework_id: number; version: number }>(
          'select homework_id, version from confirmations where user_id = $1 and homework_id = any($2::int[])',
          [userId, ids],
        ),
        reacts: await db.query<{ homework_id: number; kind: string }>(
          'select homework_id, kind from reactions where user_id = $1 and homework_id = any($2::int[])',
          [userId, ids],
        ),
      }
    : null;

  return rows.map((h) => {
    const c = conf.find((x) => x.homework_id === h.id);
    const changes = open.filter((p) => p.homework_id === h.id && (p.kind === 'correct' || p.kind === 'update'));
    const dups = open
      .filter((p) => p.kind === 'duplicate' && (p.homework_id === h.id || p.target_id === h.id))
      .map((p) => (p.homework_id === h.id ? p.target_id! : p.homework_id));
    // 有争议的时候按最早的时间提醒：宁可早提醒，不能漏
    const proposedDues = changes
      .map((p) => (typeof p.changes?.due === 'string' ? new Date(p.changes.due) : null))
      .filter((d): d is Date => d !== null);
    const dues = [h.due, ...proposedDues].filter((d): d is Date => d !== null);
    const earliestDue = dues.length ? new Date(Math.min(...dues.map((d) => d.getTime()))) : null;
    const mergedCount = merged.find((m) => m.merged_into === h.id)?.n ?? 0;
    const myConf = mine?.conf.find((x) => x.homework_id === h.id);
    return {
      id: h.id,
      classId: h.class_id,
      title: h.title,
      detail: h.detail,
      dueKind: h.due_kind,
      due: h.due,
      earliestDue,
      submit: h.submit,
      source: h.source,
      optional: h.optional,
      groupWork: h.group_work,
      attachments: files.get(h.id) ?? [],
      state: stateOf(h, changes.length > 0, now),
      postponed: h.postponed,
      mergedInto: h.merged_into,
      version: h.version,
      remindReady: h.remind_ready,
      uploader: userRef(h.uploader_id, h.uploader_name, h.uploader_avatar),
      // 合并进来的重复作业也算"上传过"的人
      uploaderCount: 1 + mergedCount,
      confirms: { current: c?.current ?? 0, old: (c?.total ?? 0) - (c?.current ?? 0) },
      reactions: {
        thumbs: reacts.find((r) => r.homework_id === h.id && r.kind === 'thumbs')?.n ?? 0,
        cry: reacts.find((r) => r.homework_id === h.id && r.kind === 'cry')?.n ?? 0,
      },
      openProposals: changes.length,
      possibleDuplicates: [...new Set(dups)],
      createdAt: h.created_at,
      updatedAt: h.updated_at,
      me: mine
        ? {
            isUploader: h.uploader_id === userId,
            // old：确认的是修改前的版本，app 上显示「此作业已修改过，该确认是修改前的确认」
            confirmed: myConf ? (myConf.version === h.version ? 'current' : 'old') : null,
            reactions: mine.reacts.filter((r) => r.homework_id === h.id).map((r) => r.kind),
          }
        : null,
    };
  });
}

// ---------- 查看 ----------

export async function listHomework(ctx: Ctx, classId: number, user: User | null) {
  const now = ctx.now();
  // 截止超过 30 天的不再返回，列表不会越来越长
  const rows = await ctx.db.query<HwRow>(
    `select ${HW_COLS} from homework h join users u on u.id = h.uploader_id
     where h.class_id = $1 and h.status in ('active', 'cancelled') and (h.due is null or h.due > $2)
     order by h.due nulls last, h.id`,
    [classId, new Date(now.getTime() - 30 * 86_400_000)],
  );
  return views(ctx.db, rows, user?.id ?? null, now);
}

export async function getHomework(ctx: Ctx, id: number, user: User | null) {
  const now = ctx.now();
  const db = ctx.db;
  await sweep(ctx);
  const h = await loadHw(db, id);
  const [view] = await views(db, [h], user?.id ?? null, now);
  const history = await db.query<{ id: number; user_id: number; nickname: string; avatar_version: number; proposal_id: number | null; changes: unknown; created_at: Date }>(
    `select c.id, c.user_id, u.nickname, u.avatar_version, c.proposal_id, c.changes, c.created_at
     from homework_changes c join users u on u.id = c.user_id where c.homework_id = $1 order by c.id`,
    [id],
  );
  const proposals = await db.query<ProposalRow & { nickname: string; avatar_version: number }>(
    `select p.*, u.nickname, u.avatar_version from proposals p join users u on u.id = p.proposer_id
     where p.homework_id = $1 or (p.target_id = $1 and p.kind = 'duplicate') order by p.id desc limit 30`,
    [id],
  );
  const { map, size } = await classWeights(db, h.class_id);
  const votes = proposals.length
    ? await db.query<{ proposal_id: number; user_id: number; agree: boolean }>(
        'select proposal_id, user_id, agree from proposal_votes where proposal_id = any($1::int[])',
        [proposals.map((p) => p.id)],
      )
    : [];
  const mergedFrom = await db.query<{ id: number; title: string }>(
    `select id, title from homework where merged_into = $1 and status = 'merged' order by id`,
    [id],
  );
  return {
    ...view,
    // 「此作业的改动」：原 → 现，谁改的
    history: history.map((c) => ({
      id: c.id,
      by: userRef(c.user_id, c.nickname, c.avatar_version),
      proposalId: c.proposal_id,
      changes: c.changes,
      at: c.created_at,
    })),
    proposals: await Promise.all(
      proposals.map(async (p) => {
        const hw = p.homework_id === id ? h : await loadHw(db, p.homework_id).catch(() => h);
        const vs = votes.filter((v) => v.proposal_id === p.id);
        const tally = tallyVotes(p, hw, vs, map);
        return {
          id: p.id,
          homeworkId: p.homework_id,
          kind: p.kind,
          changes: p.changes,
          targetId: p.target_id,
          reason: p.reason,
          status: p.status,
          appliedVia: p.applied_via,
          proposer: userRef(p.proposer_id, p.nickname, p.avatar_version),
          agree: tally.agree,
          disagree: tally.disagree,
          threshold: threshold(thresholdKind(p, hw), size),
          myVote: user ? (vs.find((v) => v.user_id === user.id)?.agree ?? null) : null,
          createdAt: p.created_at,
        };
      }),
    ),
    // 「已合并 N 条」
    mergedFrom,
  };
}

// ---------- 上传、上传者自己改和删 ----------

export async function createHomework(ctx: Ctx, user: User, classId: number, input: z.infer<typeof HomeworkIn>) {
  const now = ctx.now();
  return ctx.db.tx(async (db) => {
    await requireMember(db, classId, user.id);
    const { map } = await classWeights(db, classId);
    const me = map.get(user.id)!;
    const today = dayStart(now);
    const total = await db.one<{ n: number }>(
      'select count(*)::int n from homework where uploader_id = $1 and created_at >= $2',
      [user.id, today],
    );
    if ((total?.n ?? 0) >= DAILY_UPLOADS) throw new HttpError(429, 'too_many', '今天传得太多了，明天再来');
    if (me.weight === 0) {
      const here = await db.one<{ n: number }>(
        'select count(*)::int n from homework where uploader_id = $1 and class_id = $2 and created_at >= $3',
        [user.id, classId, today],
      );
      if ((here?.n ?? 0) >= NEWBIE_DAILY_UPLOADS) {
        throw new HttpError(429, 'newbie_limit', `新同学每个班每天最多传 ${NEWBIE_DAILY_UPLOADS} 条，攒够贡献值后就不限了`);
      }
    }
    const row = await db.one<{ id: number }>(
      `insert into homework (class_id, uploader_id, title, detail, due_kind, due, submit, source, optional, group_work,
         remind_ready, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12) returning id`,
      [
        classId,
        user.id,
        input.title,
        input.detail,
        input.dueKind,
        input.dueKind === 'tbd' ? null : input.due,
        input.submit,
        input.source,
        input.optional,
        input.groupWork,
        // 新同学传的，要等一个正式成员确认后才推提醒
        me.weight > 0,
        now,
      ],
    );
    const h = await loadHw(db, row!.id);
    return (await views(db, [h], user.id, now))[0];
  });
}

// 把一组改动写进作业：版本号加一，记下"原 → 现"。返回新版本号
async function applyChanges(db: Db, h: HwRow, changes: Changes, userId: number, proposalId: number | null, now: Date) {
  const next = {
    title: changes.title ?? h.title,
    detail: changes.detail ?? h.detail,
    due_kind: changes.dueKind ?? (changes.due && h.due_kind === 'tbd' ? 'at' : h.due_kind),
    due: changes.due !== undefined ? changes.due : h.due,
    submit: changes.submit ?? h.submit,
    source: changes.source ?? h.source,
    optional: changes.optional ?? h.optional,
    group_work: changes.groupWork ?? h.group_work,
    status: changes.cancel ? 'cancelled' : h.status,
  };
  if (next.due_kind === 'tbd') next.due = null;
  if (next.due_kind !== 'tbd' && !next.due) throw new HttpError(400, 'bad_input', '要填截止时间');

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const show = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
  for (const [k, v] of Object.entries(next)) {
    const old = h[k as keyof HwRow];
    if (show(old) !== show(v)) diff[k] = { from: show(old), to: show(v) };
  }
  if (Object.keys(diff).length === 0) throw new HttpError(400, 'no_change', '和现在的内容一样，没有要改的');

  const postponed = h.postponed || (h.due !== null && (next.due === null || next.due > h.due));
  await db.query(
    `update homework set title = $2, detail = $3, due_kind = $4, due = $5, submit = $6, source = $7, optional = $8,
       group_work = $9, status = $10, postponed = $11, version = version + 1, updated_at = $12 where id = $1`,
    [h.id, next.title, next.detail, next.due_kind, next.due, next.submit, next.source, next.optional, next.group_work, next.status, postponed, now],
  );
  await db.query(
    'insert into homework_changes (homework_id, proposal_id, user_id, changes, created_at) values ($1, $2, $3, $4, $5)',
    [h.id, proposalId, userId, JSON.stringify(diff), now],
  );
  return h.version + 1;
}

// 还没人确认之前，上传者可以自己改、自己删；确认之后就只能走「有问题」
export async function editHomework(ctx: Ctx, user: User, id: number, changes: Changes) {
  const now = ctx.now();
  return ctx.db.tx(async (db) => {
    const h = await loadHw(db, id, true);
    if (h.uploader_id !== user.id) throw forbidden('只有上传的人能直接修改');
    if (h.confirmed_at) throw forbidden('已经有同学确认过了，要改请点「有问题」发起提议');
    if (changes.cancel) throw new HttpError(400, 'bad_input', '还没人确认的作业，传错了直接删掉就好');
    await applyChanges(db, h, changes, user.id, null, now);
    return (await views(db, [await loadHw(db, id)], user.id, now))[0];
  });
}

export async function deleteHomework(ctx: Ctx, user: User, id: number) {
  return ctx.db.tx(async (db) => {
    const h = await loadHw(db, id, true);
    if (h.uploader_id !== user.id) throw forbidden('只有上传的人能删除');
    if (h.confirmed_at) throw forbidden('已经有同学确认过了，不能删除；作业取消了请点「有问题」→「老师改了」');
    await db.query(`update homework set status = 'deleted', updated_at = $2 where id = $1`, [id, ctx.now()]);
    return { deleted: true };
  });
}

// ---------- 确认与表情 ----------

async function addPoints(db: Db, userId: number, classId: number, delta: number, reason: string, homeworkId: number, proposalId: number | null, now: Date) {
  await db.query(
    'insert into points (user_id, class_id, delta, reason, homework_id, proposal_id, created_at) values ($1, $2, $3, $4, $5, $6, $7)',
    [userId, classId, delta, reason, homeworkId, proposalId, now],
  );
}

// 提议生效后的加减分。自己纠正自己不加也不扣
async function awardProposal(db: Db, p: ProposalRow, h: HwRow, now: Date) {
  if (p.proposer_id !== h.uploader_id) {
    if (p.kind === 'correct') {
      await addPoints(db, p.proposer_id, h.class_id, POINTS.correctionAdopted, 'correction', h.id, p.id, now);
      await addPoints(db, h.uploader_id, h.class_id, POINTS.corrected, 'corrected', h.id, p.id, now);
    } else if (p.kind === 'update') {
      await addPoints(db, p.proposer_id, h.class_id, POINTS.updateAdopted, 'update', h.id, p.id, now);
    }
  }
  await db.query('update proposals set points_at = $2 where id = $1', [p.id, now]);
}

// 每次有人确认后检查三件事：
// 1. 新同学传的作业，有正式成员确认过了，开始推提醒
// 2. 别人的确认权重够了门槛 → 作业变成已确认，上传者 +10
// 3. 上传者自己采纳的提议，要等别人确认改过之后的版本够了门槛才发分，防止自己人互相刷分
async function evaluateConfirm(db: Db, h: HwRow, now: Date) {
  const { map, size } = await classWeights(db, h.class_id);
  const need = threshold('confirm', size);
  const confs = await db.query<{ user_id: number; version: number }>(
    'select user_id, version from confirmations where homework_id = $1',
    [h.id],
  );
  const weightOf = (uid: number) => map.get(uid)?.weight ?? 0;
  const others = confs.filter((c) => c.user_id !== h.uploader_id);

  if (!h.remind_ready && others.some((c) => weightOf(c.user_id) > 0)) {
    await db.query('update homework set remind_ready = true where id = $1', [h.id]);
  }
  if (!h.confirmed_at) {
    const w = others.reduce((s, c) => s + weightOf(c.user_id), 0);
    if (w >= need) {
      await db.query('update homework set confirmed_at = $2 where id = $1', [h.id, now]);
      await addPoints(db, h.uploader_id, h.class_id, POINTS.uploadConfirmed, 'upload_confirmed', h.id, null, now);
    }
  }
  const waiting = await db.query<ProposalRow>(
    `select * from proposals where homework_id = $1 and status = 'applied' and applied_via = 'adopt' and points_at is null`,
    [h.id],
  );
  for (const p of waiting) {
    const w = others
      .filter((c) => c.version >= p.applied_version! && c.user_id !== p.proposer_id)
      .reduce((s, c) => s + weightOf(c.user_id), 0);
    if (w >= need) await awardProposal(db, p, h, now);
  }
}

export async function confirmHomework(ctx: Ctx, user: User, id: number) {
  const now = ctx.now();
  return ctx.db.tx(async (db) => {
    const h = await loadHw(db, id, true);
    await requireMember(db, h.class_id, user.id);
    if (h.uploader_id === user.id) throw new HttpError(400, 'own_homework', '不能确认自己传的作业');
    if (h.status !== 'active') throw new HttpError(400, 'inactive', '这条作业已经取消或合并了');
    await db.query(
      `insert into confirmations (homework_id, user_id, version, created_at) values ($1, $2, $3, $4)
       on conflict (homework_id, user_id) do update set version = excluded.version, created_at = excluded.created_at`,
      [id, user.id, h.version, now],
    );
    await evaluateConfirm(db, h, now);
    return (await views(db, [await loadHw(db, id)], user.id, now))[0];
  });
}

// 取消确认只是撤回自己的一票，已经确认的状态和发过的分不收回
export async function unconfirmHomework(ctx: Ctx, user: User, id: number) {
  await ctx.db.query('delete from confirmations where homework_id = $1 and user_id = $2', [id, user.id]);
  const h = await loadHw(ctx.db, id);
  return (await views(ctx.db, [h], user.id, ctx.now()))[0];
}

export async function setReaction(ctx: Ctx, user: User, id: number, kind: 'thumbs' | 'cry', on: boolean) {
  const h = await loadHw(ctx.db, id);
  await requireMember(ctx.db, h.class_id, user.id);
  if (on) {
    await ctx.db.query(
      'insert into reactions (homework_id, user_id, kind, created_at) values ($1, $2, $3, $4) on conflict do nothing',
      [id, user.id, kind, ctx.now()],
    );
  } else {
    await ctx.db.query('delete from reactions where homework_id = $1 and user_id = $2 and kind = $3', [id, user.id, kind]);
  }
  return (await views(ctx.db, [h], user.id, ctx.now()))[0];
}

// ---------- 提议：纠错 / 更新 / 重复 / 不是重复 ----------

// 这条提议要用哪一档门槛：往后推截止时间、改成待定、取消作业，门槛更高
function thresholdKind(p: Pick<ProposalRow, 'kind' | 'changes'>, h: HwRow): ThresholdKind {
  if (p.kind === 'duplicate' || p.kind === 'unduplicate') return 'duplicate';
  const ch = p.changes ?? {};
  if (ch.cancel) return 'postpone';
  if (ch.dueKind === 'tbd' && h.due_kind !== 'tbd') return 'postpone';
  if (typeof ch.due === 'string' && h.due && new Date(ch.due) > h.due) return 'postpone';
  return 'change';
}

// 赞成和反对各自的权重。提议人自己那票不算；纠错和更新的上传者走"采纳"，也不算票
function tallyVotes(p: ProposalRow, h: HwRow, votes: { user_id: number; agree: boolean }[], map: Map<number, { weight: number }>) {
  let agree = 0;
  let disagree = 0;
  for (const v of votes) {
    if (v.user_id === p.proposer_id) continue;
    if ((p.kind === 'correct' || p.kind === 'update') && v.user_id === h.uploader_id) continue;
    const w = map.get(v.user_id)?.weight ?? 0;
    if (v.agree) agree += w;
    else disagree += w;
  }
  return { agree, disagree };
}

async function closeProposal(db: Db, id: number, status: string, now: Date, extra: { via?: string; version?: number } = {}) {
  await db.query(
    'update proposals set status = $2, closed_at = $3, applied_via = $4, applied_version = $5 where id = $1',
    [id, status, now, extra.via ?? null, extra.version ?? null],
  );
}

async function applyProposal(db: Db, p: ProposalRow, h: HwRow, via: 'adopt' | 'vote', now: Date) {
  if (p.kind === 'correct' || p.kind === 'update') {
    const changes = ChangesIn.parse(p.changes);
    const version = await applyChanges(db, h, changes, p.proposer_id, p.id, now);
    await closeProposal(db, p.id, 'applied', now, { via, version });
    // 投票通过本身就是别人的确认，当场发分；上传者采纳的要等别人确认新版本（见 evaluateConfirm）
    if (via === 'vote') await awardProposal(db, { ...p, applied_version: version }, h, now);
    return;
  }
  if (p.kind === 'duplicate') {
    const other = await loadHw(db, p.target_id!, true);
    // 留下先传的那条，后传的合并进去
    const [keep, drop] =
      h.created_at < other.created_at || (h.created_at.getTime() === other.created_at.getTime() && h.id < other.id) ? [h, other] : [other, h];
    await db.query(`update homework set status = 'merged', merged_into = $2, updated_at = $3 where id = $1`, [drop.id, keep.id, now]);
    // 之前合并进被合并那条的，也一起指向留下的这条
    await db.query(`update homework set merged_into = $2 where merged_into = $1 and status = 'merged'`, [drop.id, keep.id]);
    await closeProposal(db, p.id, 'applied', now, { via });
    // 这两条之间别的"重复"提议已经没意义了
    await db.query(
      `update proposals set status = 'withdrawn', closed_at = $3 where status = 'open' and kind = 'duplicate'
       and ((homework_id = $1 and target_id = $2) or (homework_id = $2 and target_id = $1))`,
      [h.id, other.id, now],
    );
    await db.query('update proposals set points_at = $2 where id = $1', [p.id, now]);
    return;
  }
  // 不是重复：拆回来，恢复成单独的一条
  await db.query(`update homework set status = 'active', merged_into = null, updated_at = $2 where id = $1`, [h.id, now]);
  await closeProposal(db, p.id, 'applied', now, { via });
  await db.query('update proposals set points_at = $2 where id = $1', [p.id, now]);
}

async function evaluateProposal(db: Db, p: ProposalRow, h: HwRow, now: Date) {
  const { map, size } = await classWeights(db, h.class_id);
  const votes = await db.query<{ user_id: number; agree: boolean }>(
    'select user_id, agree from proposal_votes where proposal_id = $1',
    [p.id],
  );
  const { agree, disagree } = tallyVotes(p, h, votes, map);
  const need = threshold(thresholdKind(p, h), size);
  if (agree >= need) await applyProposal(db, p, h, 'vote', now);
  else if (disagree >= need) await closeProposal(db, p.id, 'rejected', now);
}

export async function createProposal(ctx: Ctx, user: User, homeworkId: number, input: z.infer<typeof ProposalIn>) {
  const now = ctx.now();
  return ctx.db.tx(async (db) => {
    const h = await loadHw(db, homeworkId, true);
    await requireMember(db, h.class_id, user.id);
    if (isClosed(h, now)) throw new HttpError(400, 'closed', '已经截止了，不能再提');

    let changes: Changes | null = null;
    let targetId: number | null = null;
    if (input.kind === 'correct' || input.kind === 'update') {
      if (h.status !== 'active') throw new HttpError(400, 'inactive', '这条作业已经取消或合并了');
      if (!input.changes) throw new HttpError(400, 'bad_input', '要写清楚改成什么');
      if (h.uploader_id === user.id && !h.confirmed_at) {
        throw new HttpError(400, 'edit_directly', '还没人确认，自己传的可以直接修改');
      }
      changes = input.changes;
    } else if (input.kind === 'duplicate') {
      if (h.status !== 'active') throw new HttpError(400, 'inactive', '这条作业已经取消或合并了');
      if (!input.targetId || input.targetId === h.id) throw new HttpError(400, 'bad_input', '要选和哪一条重复');
      const other = await loadHw(db, input.targetId);
      if (other.class_id !== h.class_id || other.status !== 'active') throw new HttpError(400, 'bad_input', '只能和同一个班里的作业比');
      targetId = other.id;
    } else {
      if (h.status !== 'merged' || !h.merged_into) throw new HttpError(400, 'bad_input', '这条作业没有被合并');
      targetId = h.merged_into;
    }

    const mine = await db.one(`select 1 from proposals where homework_id = $1 and proposer_id = $2 and status = 'open'`, [h.id, user.id]);
    if (mine) throw new HttpError(409, 'already_open', '你对这条作业已经有一条进行中的提议了');

    const row = await db.one<{ id: number }>(
      `insert into proposals (homework_id, proposer_id, kind, changes, target_id, reason, created_at)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [h.id, user.id, input.kind, changes ? JSON.stringify(changes) : null, targetId, input.reason, now],
    );
    // 存 JSON 时日期变成了字符串，后面的比较都按读回来的样子算
    return { id: row!.id };
  });
}

// 调用前先跑一次 sweep：过期要在事务外写进去，否则下面抛错时事务回滚，"已过期"也跟着被撤销
async function openProposalFor(db: Db, proposalId: number) {
  const p = await loadProposal(db, proposalId);
  const h = await loadHw(db, p.homework_id, true);
  if (p.status === 'expired') throw new HttpError(400, 'closed', '已经截止了，提议自动结束');
  if (p.status !== 'open') throw new HttpError(400, 'not_open', '这条提议已经结束了');
  return { p, h };
}

export async function voteProposal(ctx: Ctx, user: User, proposalId: number, agree: boolean) {
  const now = ctx.now();
  await sweep(ctx);
  return ctx.db.tx(async (db) => {
    const { p, h } = await openProposalFor(db, proposalId);
    await requireMember(db, h.class_id, user.id);
    if (p.proposer_id === user.id) throw new HttpError(400, 'own_proposal', '不能给自己的提议投票');
    if ((p.kind === 'correct' || p.kind === 'update') && h.uploader_id === user.id) {
      throw new HttpError(400, 'use_adopt', '这是你传的作业，同意的话点「采纳」');
    }
    await db.query(
      `insert into proposal_votes (proposal_id, user_id, agree, created_at) values ($1, $2, $3, $4)
       on conflict (proposal_id, user_id) do update set agree = excluded.agree, created_at = excluded.created_at`,
      [p.id, user.id, agree, now],
    );
    await evaluateProposal(db, p, h, now);
    return (await loadProposal(db, p.id)).status;
  });
}

// 上传者同意别人的纠错或更新：马上生效
export async function adoptProposal(ctx: Ctx, user: User, proposalId: number) {
  const now = ctx.now();
  await sweep(ctx);
  return ctx.db.tx(async (db) => {
    const { p, h } = await openProposalFor(db, proposalId);
    if (p.kind !== 'correct' && p.kind !== 'update') throw new HttpError(400, 'bad_input', '重复类的提议只能靠大家投票');
    if (h.uploader_id !== user.id) throw forbidden('只有上传的人能采纳');
    if (p.proposer_id === user.id) throw new HttpError(400, 'own_proposal', '自己的提议需要别人同意');
    await applyProposal(db, p, h, 'adopt', now);
    return 'applied';
  });
}

export async function withdrawProposal(ctx: Ctx, user: User, proposalId: number) {
  return ctx.db.tx(async (db) => {
    const p = await loadProposal(db, proposalId);
    if (p.proposer_id !== user.id) throw forbidden('只能撤回自己的提议');
    if (p.status !== 'open') throw new HttpError(400, 'not_open', '这条提议已经结束了');
    await closeProposal(db, p.id, 'withdrawn', ctx.now());
    return 'withdrawn';
  });
}

// 定时跑：截止时间过了还没结果的提议自动结束
export async function sweep(ctx: Ctx) {
  const now = ctx.now();
  await ctx.db.query(
    `update proposals p set status = 'expired', closed_at = $1 from homework h
     where p.homework_id = h.id and p.status = 'open' and h.due is not null and h.due < $1`,
    [now],
  );
}

// 管理员删作业
export async function adminDeleteHomework(ctx: Ctx, id: number) {
  await ctx.db.query(`update homework set status = 'deleted', updated_at = $2 where id = $1`, [id, ctx.now()]);
}
