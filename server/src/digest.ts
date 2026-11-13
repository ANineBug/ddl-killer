import type { Ctx } from './context.ts';

// 每天早上 7 点（北京时间）给打开了邮件提醒的同学发一封邮件：两天内要交的作业。
// 手机上的提醒可能被系统省电杀掉，邮件是兜底；QQ 邮箱还能在微信里收到通知

const OFFSET = 8 * 3600_000;
export const DIGEST_HOUR = 7;

const chinaDay = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
const chinaHour = (d: Date) => new Date(d.getTime() + OFFSET).getUTCHours();

function fmt(d: Date) {
  const c = new Date(d.getTime() + OFFSET);
  const w = ['日', '一', '二', '三', '四', '五', '六'][c.getUTCDay()];
  return `${c.getUTCMonth() + 1} 月 ${c.getUTCDate()} 日（周${w}）${String(c.getUTCHours()).padStart(2, '0')}:${String(c.getUTCMinutes()).padStart(2, '0')}`;
}

// 到点了、今天还没发过就发。每分钟调一次；返回发了几封
export async function maybeSendDigests(ctx: Ctx) {
  const now = ctx.now();
  if (chinaHour(now) !== DIGEST_HOUR) return 0;
  const day = chinaDay(now);
  const claimed = await ctx.db.query('insert into digest_runs (day, at) values ($1, $2) on conflict do nothing returning day', [day, now]);
  if (claimed.length === 0) return 0;
  return sendDigests(ctx);
}

export async function sendDigests(ctx: Ctx) {
  const now = ctx.now();
  const until = new Date(now.getTime() + 48 * 3600_000);
  const users = await ctx.db.query<{ id: number; email: string }>('select id, email from users where email_digest');
  let sent = 0;
  for (const u of users) {
    const rows = await ctx.db.query<{ title: string; due: Date; name: string; optional: boolean; confirmed: boolean }>(
      `select h.title, h.due, c.name, h.optional, h.confirmed_at is not null confirmed
       from homework h join classes c on c.id = h.class_id join memberships m on m.class_id = h.class_id and m.user_id = $1
       where h.status = 'active' and h.due is not null and h.due > $2 and h.due <= $3 and h.remind_ready
       order by h.due`,
      [u.id, now, until],
    );
    if (rows.length === 0) continue;
    const lines = rows.map((r) => `· ${fmt(r.due)} 截止　${r.name}：${r.title}${r.optional ? '（选做）' : ''}${r.confirmed ? '' : '（还没人确认）'}`);
    const text = `这两天要交的作业：\n\n${lines.join('\n')}\n\n已经做完的忽略就好。不想再收到这封邮件，在 app 的「我的 → 提醒」里关掉邮件提醒。`;
    try {
      await ctx.mailer.send(u.email, `两天内有 ${rows.length} 项作业要交`, text);
      sent++;
    } catch (e) {
      console.error('digest', u.id, e);
    }
  }
  return sent;
}
