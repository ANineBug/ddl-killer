import { classWeights } from './classes.ts';
import type { Ctx, User } from './context.ts';
import { TIER_NAMES } from './rules.ts';

// 班级榜：这个班这学期每个人的贡献值，决定档位和权重
export async function classBoard(ctx: Ctx, classId: number) {
  const { map } = await classWeights(ctx.db, classId);
  const users = await ctx.db.query<{ id: number; nickname: string }>(
    'select u.id, u.nickname from memberships m join users u on u.id = m.user_id where m.class_id = $1',
    [classId],
  );
  return users
    .map((u) => {
      const w = map.get(u.id)!;
      return { user: { id: u.id, nickname: u.nickname }, score: w.score, tier: w.tier, tierName: TIER_NAMES[w.tier] };
    })
    .sort((a, b) => b.score - a.score || a.user.id - b.user.id);
}

// 总榜：所有班、所有学期加起来，只是看看谁对社区贡献最大，不影响权重。前 50 名 + 我自己的名次
export async function globalBoard(ctx: Ctx, user: User | null) {
  const top = await ctx.db.query<{ id: number; nickname: string; score: number }>(
    `select u.id, u.nickname, sum(p.delta)::int score from points p join users u on u.id = p.user_id
     group by u.id, u.nickname having sum(p.delta) > 0 order by score desc, u.id limit 50`,
  );
  let me = null;
  if (user) {
    const mine = await ctx.db.one<{ score: number }>('select coalesce(sum(delta), 0)::int score from points where user_id = $1', [user.id]);
    const score = mine?.score ?? 0;
    const ahead = await ctx.db.one<{ n: number }>(
      'select count(*)::int n from (select user_id from points group by user_id having sum(delta) > $1) t',
      [score],
    );
    me = { score, rank: score > 0 ? (ahead?.n ?? 0) + 1 : null };
  }
  return {
    top: top.map((r, i) => ({ rank: i + 1, user: { id: r.id, nickname: r.nickname }, score: r.score })),
    me,
  };
}
