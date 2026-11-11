import { z } from 'zod';

import { type Ctx, HttpError, notFound, type User } from './context.ts';
import type { Db } from './db.ts';
import { expandWeeks, MAX_WEEK, nameKey, roomKey, type Tier, TIER_WEIGHT, tierOf } from './rules.ts';

// ---------- 导入上来的数据长什么样 ----------
// 只收课程安排。多余的字段（学号、姓名之类）会被直接丢掉，不进数据库

const WeekRangeIn = z.object({
  from: z.number().int().min(1).max(MAX_WEEK),
  to: z.number().int().min(1).max(MAX_WEEK),
  rule: z.enum(['all', 'odd', 'even']),
});

const SessionIn = z.object({
  weekday: z.number().int().min(1).max(7),
  from: z.number().int().min(1).max(14),
  to: z.number().int().min(1).max(14),
  location: z.string().trim().max(60).default(''),
  weeks: z.array(WeekRangeIn).min(1).max(20),
});

export const CourseIn = z.object({
  name: z.string().trim().min(1).max(60),
  teacher: z.string().trim().max(60).default(''),
  jxbId: z.string().trim().min(1).max(64).optional(),
  sessions: z.array(SessionIn).min(1).max(20),
});

export const ImportIn = z.object({
  term: z.string().trim().regex(/^\d{4}-\d{4}学年第\d学期$/, '学期格式不对'),
  courses: z.array(CourseIn).max(40),
});

type CourseInput = z.infer<typeof CourseIn>;

type Slot = { weekday: number; from: number; to: number; room: string; roomKey: string; weeks: number[] };

function slotsOf(c: CourseInput): Slot[] {
  return c.sessions
    .map((s) => ({
      weekday: s.weekday,
      from: Math.min(s.from, s.to),
      to: Math.max(s.from, s.to),
      room: s.location,
      roomKey: roomKey(s.location),
      weeks: expandWeeks(s.weeks),
    }))
    .filter((s) => s.weeks.length > 0);
}

// ---------- 认班：这门课属于哪个教学班 ----------
//
// 1. 页面上带了教务的教学班 id，就按 id 认
// 2. 否则按"时间 + 教室"认：同一学期，在同一间教室、同一个星期几的同样几节、而且有重叠的周上课，
//    就是同一个教学班。课表里同一时间同一间教室只会有一门课，所以不用再比课名，
//    课名在页面上带不带【调】、▲ 这些标记也不影响。
// 3. 讲座场地、实践场地这类不是真教室（真实课表里就有一门课某一周在"讲座场地"上），
//    如果一门课所有上课时间都在这种地方，才退一步用课名 + 老师 + 时间来认
async function findClass(db: Db, term: string, c: CourseInput, slots: Slot[]): Promise<number | null> {
  if (c.jxbId) {
    const hit = await db.one<{ id: number }>('select id from classes where term = $1 and jxb_id = $2', [term, c.jxbId]);
    if (hit) return hit.id;
  }
  const key = nameKey(c.name);
  const real = slots.filter((s) => s.roomKey);
  const votes = new Map<number, number>();
  const candidates = real.length > 0 ? real : slots;
  for (const s of candidates) {
    const rows = await db.query<{ id: number; jxb_id: string | null; teacher: string; name_key: string }>(
      `select distinct c.id, c.jxb_id, c.teacher, c.name_key from classes c join class_slots s on s.class_id = c.id
       where c.term = $1 and s.weekday = $2 and s.period_from = $3 and s.period_to = $4
         and s.room_key = $5 and s.weeks && $6::int[]`,
      [term, s.weekday, s.from, s.to, s.roomKey, s.weeks],
    );
    for (const r of rows) {
      // 两边都有教务 id 而且不一样，一定是两个班
      if (c.jxbId && r.jxb_id && r.jxb_id !== c.jxbId) continue;
      if (real.length === 0 && (r.name_key !== key || r.teacher !== c.teacher)) continue;
      votes.set(r.id, (votes.get(r.id) ?? 0) + 1);
    }
  }
  if (votes.size === 0) return null;
  // 对上的上课时间最多的那个；一样多就取最早建的
  const [best] = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if (c.jxbId) await db.query('update classes set jxb_id = $2 where id = $1 and jxb_id is null', [best[0], c.jxbId]);
  return best[0];
}

async function createClass(db: Db, now: Date, term: string, c: CourseInput, slots: Slot[], userId: number) {
  const row = await db.one<{ id: number }>(
    `insert into classes (term, name, name_key, teacher, jxb_id, created_by, created_at)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [term, c.name.replace(/【[^】]*】/g, '').replace(/[★▲●◆■]/g, '').trim(), nameKey(c.name), c.teacher, c.jxbId ?? null, userId, now],
  );
  for (const s of slots) {
    await db.query(
      `insert into class_slots (class_id, weekday, period_from, period_to, room, room_key, weeks)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [row!.id, s.weekday, s.from, s.to, s.room, s.roomKey, s.weeks],
    );
  }
  return row!.id;
}

// 教务导入：这就是这个人这学期的完整课表。
// 能认出来的班直接加入，认不出来的新建（只有导入能新建班）。
// 上次导入有、这次没有的课（比如退课了）会退出；和导入的课时间冲突的手动加入的班也会退出
export async function importTimetable(ctx: Ctx, user: User, input: z.infer<typeof ImportIn>) {
  const now = ctx.now();
  return ctx.db.tx(async (db) => {
    const result: { index: number; classId: number; created: boolean }[] = [];
    const ids = new Set<number>();
    for (const [index, c] of input.courses.entries()) {
      const slots = slotsOf(c);
      if (slots.length === 0) continue;
      let id = await findClass(db, input.term, c, slots);
      const created = id === null;
      if (id === null) id = await createClass(db, now, input.term, c, slots, user.id);
      ids.add(id);
      result.push({ index, classId: id, created });
    }
    const list = [...ids];

    await db.query(
      `delete from memberships m using classes c
       where m.class_id = c.id and m.user_id = $1 and m.via = 'import' and c.term = $2 and not (m.class_id = any($3::int[]))`,
      [user.id, input.term, list],
    );
    for (const id of list) {
      await db.query(
        `insert into memberships (class_id, user_id, via, joined_at) values ($1, $2, 'import', $3)
         on conflict (class_id, user_id) do update set via = 'import'`,
        [id, user.id, now],
      );
    }
    await db.query(
      `delete from memberships m
       where m.user_id = $1 and m.via = 'manual' and exists (
         select 1 from class_slots a join class_slots b on b.class_id = any($2::int[])
         where a.class_id = m.class_id and a.weekday = b.weekday
           and a.period_from <= b.period_to and b.period_from <= a.period_to and a.weeks && b.weeks)`,
      [user.id, list],
    );
    return result;
  });
}

// 游客也能导入课表看作业，但游客不建班、不算人数，只是查一下这些课对应哪些已有的班
export async function resolveTimetable(ctx: Ctx, input: z.infer<typeof ImportIn>) {
  const out: { index: number; classId: number | null }[] = [];
  for (const [index, c] of input.courses.entries()) {
    const slots = slotsOf(c);
    out.push({ index, classId: slots.length ? await findClass(ctx.db, input.term, c, slots) : null });
  }
  return out;
}

// ---------- 成员与权重 ----------

export type MemberWeight = { userId: number; tier: Tier; weight: number; score: number };

// 一个班里每个人现在的档位和权重。班级人数 = 有权重的人数
export async function classWeights(db: Db, classId: number) {
  const rows = await db.query<{ user_id: number; via: string; demoted: boolean; score: number }>(
    `select m.user_id, m.via, u.demoted,
       coalesce((select sum(p.delta) from points p where p.user_id = m.user_id and p.class_id = m.class_id), 0)::int score
     from memberships m join users u on u.id = m.user_id where m.class_id = $1`,
    [classId],
  );
  const map = new Map<number, MemberWeight>();
  for (const r of rows) {
    const tier = tierOf(r.score, r.via === 'import', r.demoted);
    map.set(r.user_id, { userId: r.user_id, tier, weight: TIER_WEIGHT[tier], score: r.score });
  }
  const size = [...map.values()].filter((m) => m.weight > 0).length;
  return { map, size };
}

export async function requireMember(db: Db, classId: number, userId: number) {
  const m = await db.one('select 1 from memberships where class_id = $1 and user_id = $2', [classId, userId]);
  if (!m) throw new HttpError(403, 'not_member', '先加入这个教学班');
}

// ---------- 查找、加入、退出 ----------

type ClassRow = { id: number; term: string; name: string; teacher: string };

async function describe(db: Db, rows: ClassRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const slots = await db.query<{ class_id: number; weekday: number; period_from: number; period_to: number; room: string; weeks: number[] }>(
    'select class_id, weekday, period_from, period_to, room, weeks from class_slots where class_id = any($1::int[]) order by weekday, period_from',
    [ids],
  );
  const sizes = new Map<number, number>();
  for (const id of ids) sizes.set(id, (await classWeights(db, id)).size);
  return rows.map((r) => ({
    id: r.id,
    term: r.term,
    name: r.name,
    teacher: r.teacher,
    members: sizes.get(r.id) ?? 0,
    slots: slots
      .filter((s) => s.class_id === r.id)
      .map((s) => ({ weekday: s.weekday, from: s.period_from, to: s.period_to, room: s.room, weeks: s.weeks })),
  }));
}

export async function getClass(ctx: Ctx, id: number) {
  const row = await ctx.db.one<ClassRow>('select id, term, name, teacher from classes where id = $1', [id]);
  if (!row) throw notFound('教学班');
  return (await describe(ctx.db, [row]))[0];
}

// 手动加课 = 搜已有的班加入。按课名或老师搜
export async function searchClasses(ctx: Ctx, term: string, q: string) {
  const query = q.trim();
  if (!query) return [];
  const rows = await ctx.db.query<ClassRow>(
    `select id, term, name, teacher from classes
     where term = $1 and (name_key like '%' || $2 || '%' or teacher like '%' || $3 || '%')
     order by name, id limit 30`,
    [term, nameKey(query), query],
  );
  return describe(ctx.db, rows);
}

// 一个人同一时间只能在一个班：星期几相同、节次有重叠、周次有重叠，就算冲突。单双周错开的不算
async function conflictOf(db: Db, userId: number, classId: number) {
  return db.one<{ id: number; name: string }>(
    `select c.id, c.name from memberships m
       join classes c on c.id = m.class_id
       join classes t on t.id = $2 and t.term = c.term
       join class_slots a on a.class_id = c.id
       join class_slots b on b.class_id = t.id
     where m.user_id = $1 and c.id <> t.id and a.weekday = b.weekday
       and a.period_from <= b.period_to and b.period_from <= a.period_to and a.weeks && b.weeks
     limit 1`,
    [userId, classId],
  );
}

export async function joinClass(ctx: Ctx, user: User, classId: number) {
  return ctx.db.tx(async (db) => {
    const cls = await db.one('select id from classes where id = $1', [classId]);
    if (!cls) throw notFound('教学班');
    const already = await db.one('select 1 from memberships where class_id = $1 and user_id = $2', [classId, user.id]);
    if (already) return { joined: true };
    const conflict = await conflictOf(db, user.id, classId);
    if (conflict) {
      throw new HttpError(409, 'time_conflict', `和「${conflict.name}」的上课时间冲突，同一时间只能在一个班`, {
        conflictClassId: conflict.id,
      });
    }
    await db.query(`insert into memberships (class_id, user_id, via, joined_at) values ($1, $2, 'manual', $3)`, [
      classId,
      user.id,
      ctx.now(),
    ]);
    return { joined: true };
  });
}

export async function leaveClass(ctx: Ctx, user: User, classId: number) {
  await ctx.db.query('delete from memberships where class_id = $1 and user_id = $2', [classId, user.id]);
  return { left: true };
}

export async function myClasses(ctx: Ctx, user: User) {
  const rows = await ctx.db.query<ClassRow & { via: string }>(
    `select c.id, c.term, c.name, c.teacher, m.via from memberships m join classes c on c.id = m.class_id
     where m.user_id = $1 order by c.term desc, c.name`,
    [user.id],
  );
  const described = await describe(ctx.db, rows);
  const out = [];
  for (const [i, d] of described.entries()) {
    const w = (await classWeights(ctx.db, d.id)).map.get(user.id);
    out.push({ ...d, via: rows[i].via, myTier: w?.tier ?? 'newbie', myScore: w?.score ?? 0 });
  }
  return out;
}
