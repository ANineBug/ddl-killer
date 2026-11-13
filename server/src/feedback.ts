import { z } from 'zod';

import { type Ctx, HttpError, type User } from './context.ts';
import { FEEDBACK_PER_DAY } from './rules.ts';

export const FeedbackIn = z.object({
  kind: z.enum(['bug', 'idea', 'other']),
  text: z.string().trim().min(1, '写点什么再发吧').max(1000, '最多 1000 个字'),
  contact: z.string().trim().max(60, '联系方式最多 60 个字').default(''),
  appVersion: z.string().trim().max(20).default(''),
  platform: z.string().trim().max(20).default(''),
});

const KIND_NAMES = { bug: '问题', idea: '建议', other: '其他' } as const;

// 收一条反馈：先存库，再（配了收件人的话）发邮件。邮件发不出去不算失败，库里还有
export async function sendFeedback(ctx: Ctx, user: User, input: z.infer<typeof FeedbackIn>) {
  const now = ctx.now();
  const since = new Date(now.getTime() - 86_400_000);
  const recent = await ctx.db.one<{ n: number }>('select count(*)::int n from feedback where user_id = $1 and created_at > $2', [user.id, since]);
  if ((recent?.n ?? 0) >= FEEDBACK_PER_DAY) {
    throw new HttpError(429, 'too_many', `一天最多发 ${FEEDBACK_PER_DAY} 条反馈，明天再来吧`);
  }
  const row = await ctx.db.one<{ id: number }>(
    `insert into feedback (user_id, kind, text, contact, app_version, platform, created_at)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [user.id, input.kind, input.text, input.contact, input.appVersion, input.platform, now],
  );
  if (ctx.feedbackTo) {
    const lines = [
      input.text,
      '',
      `类型：${KIND_NAMES[input.kind]}`,
      `来自：${user.nickname}（用户 #${user.id}）`,
      `联系方式：${input.contact || '没留'}`,
      `版本：${input.appVersion || '未知'} · ${input.platform || '未知'}`,
      `反馈编号：#${row!.id}`,
    ];
    await ctx.mailer
      .send(ctx.feedbackTo, `[DDL斩反馈·${KIND_NAMES[input.kind]}] ${input.text.slice(0, 30).replace(/\s+/g, ' ')}`, lines.join('\n'))
      .catch((e) => console.error('feedback mail', e));
  }
  return { id: row!.id };
}
