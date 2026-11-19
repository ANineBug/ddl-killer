import { z } from 'zod';

import type { Ctx, User } from './context.ts';

// 每个人对作业的个人状态（完成、与我无关、归档、自己设的提醒）。只有自己能看、能改。
// 每条带着在设备上修改的时间，同一条作业两台设备都改过的，以后改的为准

const iso = z.iso.datetime().transform((s) => new Date(s));

const ReminderIn = z.union([
  z.object({ kind: z.literal('before'), minutes: z.number().int().min(0).max(60 * 24 * 60) }),
  z.object({ kind: z.literal('at'), at: z.iso.datetime() }),
]);

export const MarksIn = z.object({
  marks: z
    .array(
      z.object({
        homeworkId: z.number().int().positive(),
        done: z.boolean(),
        doneAt: iso.nullable(),
        ignored: z.boolean(),
        archived: z.boolean().nullable(),
        reminders: z.array(ReminderIn).max(10).nullable(),
        updatedAt: iso,
      }),
    )
    .max(300),
});

type MarkRow = {
  homework_id: number;
  done: boolean;
  done_at: Date | null;
  ignored: boolean;
  archived: boolean | null;
  reminders: unknown;
  updated_at: Date;
};

export async function listMarks(ctx: Ctx, user: User) {
  const rows = await ctx.db.query<MarkRow>(
    'select homework_id, done, done_at, ignored, archived, reminders, updated_at from homework_marks where user_id = $1',
    [user.id],
  );
  return rows.map((r) => ({
    homeworkId: r.homework_id,
    done: r.done,
    doneAt: r.done_at,
    ignored: r.ignored,
    archived: r.archived,
    reminders: r.reminders,
    updatedAt: r.updated_at,
  }));
}

// 存一批：服务器上已经有更新的就不覆盖；设备时间跑到未来的按现在算；作业不存在的跳过
export async function saveMarks(ctx: Ctx, user: User, input: z.infer<typeof MarksIn>) {
  const now = ctx.now();
  let saved = 0;
  await ctx.db.tx(async (db) => {
    for (const m of input.marks) {
      const at = m.updatedAt > now ? now : m.updatedAt;
      const r = await db.query<{ homework_id: number }>(
        `insert into homework_marks (user_id, homework_id, done, done_at, ignored, archived, reminders, updated_at)
         select $1, h.id, $3, $4, $5, $6, $7, $8 from homework h where h.id = $2
         on conflict (user_id, homework_id) do update set done = excluded.done, done_at = excluded.done_at, ignored = excluded.ignored,
           archived = excluded.archived, reminders = excluded.reminders, updated_at = excluded.updated_at
         where homework_marks.updated_at <= excluded.updated_at
         returning homework_id`,
        [user.id, m.homeworkId, m.done, m.doneAt, m.ignored, m.archived, m.reminders === null ? null : JSON.stringify(m.reminders), at],
      );
      saved += r.length;
    }
  });
  return { saved };
}
