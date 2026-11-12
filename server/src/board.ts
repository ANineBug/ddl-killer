import { userRef } from './avatar.ts';
import { classWeights } from './classes.ts';
import type { Ctx, User } from './context.ts';
import { TIER_NAMES } from './rules.ts';

// 班级榜：这个班这学期每个人的贡献值，决定档位和权重
export async function classBoard(ctx: Ctx, classId: number) {
  const { map } = await classWeights(ctx.db, classId);
  const users = await ctx.db.query<{ id: number; nickname: string; avatar_version: number }>(
    'select u.id, u.nickname, u.avatar_version from memberships m join users u on u.id = m.user_id where m.class_id = $1',
    [classId],
  );
  return users
    .map((u) => {
      const w = map.get(u.id)!;
      return { user: userRef(u.id, u.nickname, u.avatar_version), score: w.score, tier: w.tier, tierName: TIER_NAMES[w.tier] };
    })
    .sort((a, b) => b.score - a.score || a.user.id - b.user.id);
}

export type Period = 'all' | 'month' | 'week';

// 周榜从这周一 0 点算，月榜从这个月 1 号 0 点算，都按中国时间
export function periodStart(now: Date, period: Period): Date | null {
  if (period === 'all') return null;
  const offset = 8 * 3600_000;
  const china = new Date(now.getTime() + offset); // 用 UTC 的读法读出中国时间的年月日
  const y = china.getUTCFullYear();
  const m = china.getUTCMonth();
  const d = china.getUTCDate();
  if (period === 'month') return new Date(Date.UTC(y, m, 1) - offset);
  const sinceMonday = (china.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(y, m, d - sinceMonday) - offset);
}

// 总分榜：所有班加起来，只是看看谁对大家贡献最大，不影响权重。
// 分总榜、月榜、周榜；前 50 名 + 我自己的名次
export async function globalBoard(ctx: Ctx, user: User | null, period: Period = 'all') {
  const since = periodStart(ctx.now(), period) ?? new Date(0);
  const top = await ctx.db.query<{ id: number; nickname: string; avatar_version: number; score: number }>(
    `select u.id, u.nickname, u.avatar_version, sum(p.delta)::int score from points p join users u on u.id = p.user_id
     where p.created_at >= $1
     group by u.id having sum(p.delta) > 0 order by score desc, u.id limit 50`,
    [since],
  );
  let me = null;
  if (user) {
    const mine = await ctx.db.one<{ score: number }>(
      'select coalesce(sum(delta), 0)::int score from points where user_id = $1 and created_at >= $2',
      [user.id, since],
    );
    const score = mine?.score ?? 0;
    const ahead = await ctx.db.one<{ n: number }>(
      'select count(*)::int n from (select user_id from points where created_at >= $2 group by user_id having sum(delta) > $1) t',
      [score, since],
    );
    me = { score, rank: score > 0 ? (ahead?.n ?? 0) + 1 : null };
  }
  return {
    period,
    top: top.map((r, i) => ({ rank: i + 1, user: userRef(r.id, r.nickname, r.avatar_version), score: r.score })),
    me,
  };
}
