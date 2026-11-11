import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { type Ctx, HttpError, type User } from './context.ts';
import {
  CODE_IP_PER_HOUR,
  CODE_MAX_ATTEMPTS,
  CODE_RESEND_MS,
  CODE_TTL_MS,
  defaultNickname,
  normalizeEmail,
} from './rules.ts';

// 注册和登录是同一个流程：输邮箱 → 收验证码 → 填验证码。第一次填对就自动建账号

function codeHash(ctx: Ctx, email: string, code: string) {
  return createHmac('sha256', ctx.secret).update(`${email}:${code}`).digest('hex');
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

function badEmail() {
  return new HttpError(400, 'bad_email', '目前只支持 QQ 邮箱、163 邮箱和 Gmail');
}

export async function requestCode(ctx: Ctx, rawEmail: string, ip: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw badEmail();
  const now = ctx.now();

  return ctx.db.tx(async (db) => {
    const recent = await db.one<{ n: number }>(
      'select count(*)::int n from code_requests where ip = $1 and at > $2',
      [ip, new Date(now.getTime() - 3600_000)],
    );
    if ((recent?.n ?? 0) >= CODE_IP_PER_HOUR) {
      throw new HttpError(429, 'too_many', '发送太频繁了，过一小时再试');
    }
    const last = await db.one<{ sent_at: Date }>('select sent_at from email_codes where email = $1', [email]);
    if (last && now.getTime() - last.sent_at.getTime() < CODE_RESEND_MS) {
      const wait = Math.ceil((CODE_RESEND_MS - (now.getTime() - last.sent_at.getTime())) / 1000);
      throw new HttpError(429, 'resend_wait', `${wait} 秒后才能重新发送`, { retryAfter: wait });
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.query(
      `insert into email_codes (email, code_hash, sent_at, expires_at, attempts) values ($1, $2, $3, $4, 0)
       on conflict (email) do update set code_hash = excluded.code_hash, sent_at = excluded.sent_at,
         expires_at = excluded.expires_at, attempts = 0`,
      [email, codeHash(ctx, email, code), now, new Date(now.getTime() + CODE_TTL_MS)],
    );
    await db.query('insert into code_requests (ip, email, at) values ($1, $2, $3)', [ip, email, now]);
    // 发信失败会抛错，事务回滚，用户可以立刻重试，不用等 60 秒
    await ctx.mailer.send(
      email,
      `验证码 ${code}`,
      `你的验证码是 ${code}，10 分钟内有效。\n\n如果不是你本人在登录，忽略这封邮件就好。`,
    );
    return { email };
  });
}

export async function verifyCode(ctx: Ctx, rawEmail: string, code: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw badEmail();
  const now = ctx.now();
  const wrong = new HttpError(400, 'bad_code', '验证码不对或已过期');

  // 输错次数要在事务外记下来：事务里抛错会把"次数 +1"也一起撤销
  const row = await ctx.db.one<{ code_hash: string; expires_at: Date; attempts: number }>(
    'select code_hash, expires_at, attempts from email_codes where email = $1',
    [email],
  );
  if (!row || row.expires_at < now || row.attempts >= CODE_MAX_ATTEMPTS) throw wrong;
  const a = Buffer.from(row.code_hash, 'hex');
  const b = Buffer.from(codeHash(ctx, email, code.trim()), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await ctx.db.query('update email_codes set attempts = attempts + 1 where email = $1', [email]);
    throw wrong;
  }

  return ctx.db.tx(async (db) => {
    await db.query('delete from email_codes where email = $1', [email]);
    let user = await db.one<User>('select id, email, nickname, avatar_version, demoted, is_admin from users where email = $1', [email]);
    const created = !user;
    if (!user) {
      user = (await db.one<User>(
        'insert into users (email, nickname, created_at) values ($1, $2, $3) returning id, email, nickname, avatar_version, demoted, is_admin',
        [email, defaultNickname(), now],
      ))!;
    }
    const token = randomBytes(32).toString('base64url');
    await db.query('insert into sessions (token_hash, user_id, created_at, last_seen) values ($1, $2, $3, $3)', [
      tokenHash(token),
      user.id,
      now,
    ]);
    return { token, created, user };
  });
}

export async function userFromToken(ctx: Ctx, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const hash = tokenHash(token);
  const user = await ctx.db.one<User>(
    `select u.id, u.email, u.nickname, u.avatar_version, u.demoted, u.is_admin from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1`,
    [hash],
  );
  if (!user) return null;
  // 最近使用时间只精确到小时，免得每个请求都写一次库
  await ctx.db.query(
    `update sessions set last_seen = $2 where token_hash = $1 and last_seen < $2::timestamptz - interval '1 hour'`,
    [hash, ctx.now()],
  );
  return user;
}

export async function logout(ctx: Ctx, token: string) {
  await ctx.db.query('delete from sessions where token_hash = $1', [tokenHash(token)]);
}
