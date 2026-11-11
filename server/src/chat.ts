import { z } from 'zod';

import { userRef } from './avatar.ts';
import { classWeights, requireMember } from './classes.ts';
import { type Ctx, HttpError, notFound, type User } from './context.ts';
import type { Db } from './db.ts';
import { CHAT_INTERVAL_MS, TIER_NAMES } from './rules.ts';

// 每个教学班一个聊天室：只有文字，可以带一张作业卡片。游客不能看也不能发

export const MessageIn = z.object({
  text: z.string().trim().max(500).default(''),
  homeworkId: z.number().int().optional(),
});

type MsgRow = {
  id: number;
  user_id: number;
  nickname: string;
  avatar_version: number;
  text: string;
  homework_id: number | null;
  hw_title: string | null;
  hw_due: Date | null;
  created_at: Date;
};

const SELECT = `select m.id, m.user_id, u.nickname, u.avatar_version, m.text, m.homework_id, h.title hw_title, h.due hw_due, m.created_at
  from messages m join users u on u.id = m.user_id left join homework h on h.id = m.homework_id`;

// 注意传进来的 db：在事务里调用时必须用事务的 db，否则会在事务外再开一次查询（PGlite 上会互相等死）
async function shape(db: Db, classId: number, rows: MsgRow[]) {
  const { map } = await classWeights(db, classId);
  return rows.map((m) => {
    const tier = map.get(m.user_id)?.tier ?? 'newbie';
    return {
      id: m.id,
      user: { ...userRef(m.user_id, m.nickname, m.avatar_version), tier, tierName: TIER_NAMES[tier] },
      text: m.text,
      homework: m.homework_id ? { id: m.homework_id, title: m.hw_title, due: m.hw_due } : null,
      createdAt: m.created_at,
    };
  });
}

// after：只要比这条新的（轮询用）；before：比这条旧的（往上翻历史用）。都不给就是最新 50 条
export async function listMessages(ctx: Ctx, user: User, classId: number, opts: { after?: number; before?: number }) {
  await requireMember(ctx.db, classId, user.id);
  let rows: MsgRow[];
  if (opts.after !== undefined) {
    rows = await ctx.db.query<MsgRow>(`${SELECT} where m.class_id = $1 and m.deleted_at is null and m.id > $2 order by m.id limit 100`, [
      classId,
      opts.after,
    ]);
  } else {
    rows = await ctx.db.query<MsgRow>(
      `${SELECT} where m.class_id = $1 and m.deleted_at is null and m.id < $2 order by m.id desc limit 50`,
      [classId, opts.before ?? 2_147_483_647],
    );
    rows.reverse();
  }
  return shape(ctx.db, classId, rows);
}

export async function sendMessage(ctx: Ctx, user: User, classId: number, input: z.infer<typeof MessageIn>) {
  const now = ctx.now();
  return ctx.db.tx(async (db) => {
    await requireMember(db, classId, user.id);
    if (!input.text && !input.homeworkId) throw new HttpError(400, 'empty', '说点什么吧');
    const last = await db.one<{ created_at: Date }>(
      'select created_at from messages where user_id = $1 order by created_at desc limit 1',
      [user.id],
    );
    if (last && now.getTime() - last.created_at.getTime() < CHAT_INTERVAL_MS) {
      const wait = Math.ceil((CHAT_INTERVAL_MS - (now.getTime() - last.created_at.getTime())) / 1000);
      throw new HttpError(429, 'slow_down', `发得有点快，${wait} 秒后再发`, { retryAfter: wait });
    }
    if (input.homeworkId) {
      const h = await db.one<{ class_id: number }>('select class_id from homework where id = $1', [input.homeworkId]);
      if (!h || h.class_id !== classId) throw notFound('作业');
    }
    const row = await db.one<{ id: number }>(
      'insert into messages (class_id, user_id, text, homework_id, created_at) values ($1, $2, $3, $4, $5) returning id',
      [classId, user.id, input.text, input.homeworkId ?? null, now],
    );
    const rows = await db.query<MsgRow>(`${SELECT} where m.id = $1`, [row!.id]);
    return (await shape(db, classId, rows))[0];
  });
}

// 管理员删消息：只做标记，不真删
export async function adminDeleteMessage(ctx: Ctx, id: number) {
  await ctx.db.query('update messages set deleted_at = $2 where id = $1', [id, ctx.now()]);
}
