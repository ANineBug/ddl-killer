import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { type Ctx, HttpError, type User } from './context.ts';
import type { Db } from './db.ts';
import {
  CODE_IP_PER_HOUR,
  CODE_MAX_ATTEMPTS,
  CODE_RESEND_MS,
  CODE_TTL_MS,
  defaultNickname,
  LOGIN_FAIL_PER_EMAIL,
  LOGIN_FAIL_PER_IP,
  LOGIN_FAIL_WINDOW_MS,
  normalizeEmail,
  passwordProblem,
} from './rules.ts';

// 账号：
//   注册    邮箱 → 收验证码 → 填验证码 + 设密码
//   登录    邮箱 + 密码，不用验证码
//   找回密码 邮箱 → 收验证码 → 填验证码 + 新密码（顺便把别的设备都登出）
// 以前用验证码直接登录建的账号没有密码，走「注册」或「找回密码」都能补一个

export type CodePurpose = 'register' | 'reset';

const USER_COLS = 'id, email, nickname, avatar_version, demoted, is_admin';

function codeHash(ctx: Ctx, email: string, code: string) {
  return createHmac('sha256', ctx.secret).update(`${email}:${code}`).digest('hex');
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

// ---------- 密码哈希：scrypt，盐随机，参数写在结果里，以后要调高也能认出旧的 ----------

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opt: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function checkPassword(pw: string, stored: string) {
  const [kind, n, r, p, salt, key] = stored.split('$');
  if (kind !== 'scrypt') return false;
  const want = Buffer.from(key, 'base64');
  const got = await scryptAsync(pw, Buffer.from(salt, 'base64'), want.length, { N: +n, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return timingSafeEqual(want, got);
}

// 邮箱不存在时也算一遍哈希，免得靠响应快慢猜出哪些邮箱注册过
const DUMMY_HASH = hashPassword('dummy-password-0');

function badEmail() {
  return new HttpError(400, 'bad_email', '目前只支持 QQ 邮箱、163 邮箱和 Gmail');
}

function checkNewPassword(pw: string) {
  const problem = passwordProblem(pw);
  if (problem) throw new HttpError(400, 'bad_password', problem);
}

async function newSession(db: Db, userId: number, now: Date) {
  const token = randomBytes(32).toString('base64url');
  await db.query('insert into sessions (token_hash, user_id, created_at, last_seen) values ($1, $2, $3, $3)', [tokenHash(token), userId, now]);
  return token;
}

// ---------- 验证码 ----------

const MAIL = {
  register: (code: string) => ({
    subject: `DDL斩 注册验证码 ${code}`,
    text: `你正在注册 DDL斩，验证码是 ${code}，10 分钟内有效。\n\n如果不是你本人在注册，忽略这封邮件就好。`,
  }),
  reset: (code: string) => ({
    subject: `DDL斩 重置密码验证码 ${code}`,
    text: `你正在重置 DDL斩 的密码，验证码是 ${code}，10 分钟内有效。\n\n如果不是你本人在操作，忽略这封邮件就好，你的密码不会变。`,
  }),
};

export async function requestCode(ctx: Ctx, rawEmail: string, purpose: CodePurpose, ip: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw badEmail();
  const now = ctx.now();

  // 注册时邮箱已经有密码，直接告诉他去登录；找回密码时邮箱没注册过，告诉他去注册。
  // 这样会暴露「这个邮箱注册过没有」，对一个同学之间用的作业 app 来说，换来的是不让人白等一封邮件
  const existing = await ctx.db.one<{ has_password: boolean }>('select password_hash is not null has_password from users where email = $1', [email]);
  if (purpose === 'register' && existing?.has_password) {
    throw new HttpError(409, 'already_registered', '这个邮箱已经注册过了，直接登录；忘了密码可以找回');
  }
  if (purpose === 'reset' && !existing) {
    throw new HttpError(404, 'not_registered', '这个邮箱还没注册');
  }

  return ctx.db.tx(async (db) => {
    const recent = await db.one<{ n: number }>('select count(*)::int n from code_requests where ip = $1 and at > $2', [
      ip,
      new Date(now.getTime() - 3600_000),
    ]);
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
      `insert into email_codes (email, code_hash, sent_at, expires_at, attempts, purpose) values ($1, $2, $3, $4, 0, $5)
       on conflict (email) do update set code_hash = excluded.code_hash, sent_at = excluded.sent_at,
         expires_at = excluded.expires_at, attempts = 0, purpose = excluded.purpose`,
      [email, codeHash(ctx, email, code), now, new Date(now.getTime() + CODE_TTL_MS), purpose],
    );
    await db.query('insert into code_requests (ip, email, at) values ($1, $2, $3)', [ip, email, now]);
    // 发信失败会抛错，事务回滚，用户可以立刻重试，不用等 60 秒
    const mail = MAIL[purpose](code);
    await ctx.mailer.send(email, mail.subject, mail.text);
    return { email };
  });
}

// 核对验证码。对了就删掉（一个码只能用一次），错了记一次，错满 5 次作废
async function useCode(ctx: Ctx, email: string, code: string, purpose: CodePurpose) {
  const wrong = new HttpError(400, 'bad_code', '验证码不对或已过期');
  // 输错次数要在事务外记下来：事务里抛错会把"次数 +1"也一起撤销
  const row = await ctx.db.one<{ code_hash: string; expires_at: Date; attempts: number; purpose: string }>(
    'select code_hash, expires_at, attempts, purpose from email_codes where email = $1',
    [email],
  );
  if (!row || row.purpose !== purpose || row.expires_at < ctx.now() || row.attempts >= CODE_MAX_ATTEMPTS) throw wrong;
  const a = Buffer.from(row.code_hash, 'hex');
  const b = Buffer.from(codeHash(ctx, email, code.trim()), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await ctx.db.query('update email_codes set attempts = attempts + 1 where email = $1', [email]);
    throw wrong;
  }
}

// ---------- 注册 ----------

export async function register(ctx: Ctx, rawEmail: string, code: string, password: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw badEmail();
  checkNewPassword(password);
  await useCode(ctx, email, code, 'register');
  const hash = await hashPassword(password);
  const now = ctx.now();

  return ctx.db.tx(async (db) => {
    await db.query('delete from email_codes where email = $1', [email]);
    let user = await db.one<User & { password_hash: string | null }>(`select ${USER_COLS}, password_hash from users where email = $1`, [email]);
    if (user?.password_hash) throw new HttpError(409, 'already_registered', '这个邮箱已经注册过了，直接登录；忘了密码可以找回');
    const created = !user;
    if (user) {
      // 以前用验证码登录建的老账号，补上密码就行
      await db.query('update users set password_hash = $2 where id = $1', [user.id, hash]);
    } else {
      user = (await db.one<User & { password_hash: string | null }>(
        `insert into users (email, nickname, created_at, password_hash) values ($1, $2, $3, $4) returning ${USER_COLS}, password_hash`,
        [email, defaultNickname(), now, hash],
      ))!;
    }
    const token = await newSession(db, user.id, now);
    return { token, created, user: user as User };
  });
}

// ---------- 登录 ----------

export async function login(ctx: Ctx, rawEmail: string, password: string, ip: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw badEmail();
  const now = ctx.now();
  const since = new Date(now.getTime() - LOGIN_FAIL_WINDOW_MS);

  const fails = await ctx.db.one<{ by_email: number; by_ip: number }>(
    `select (select count(*)::int from login_failures where email = $1 and at > $3) by_email,
            (select count(*)::int from login_failures where ip = $2 and at > $3) by_ip`,
    [email, ip, since],
  );
  if ((fails?.by_email ?? 0) >= LOGIN_FAIL_PER_EMAIL || (fails?.by_ip ?? 0) >= LOGIN_FAIL_PER_IP) {
    throw new HttpError(429, 'too_many', '密码错太多次了，过 15 分钟再试，或者用「忘记密码」');
  }

  const user = await ctx.db.one<User & { password_hash: string | null }>(`select ${USER_COLS}, password_hash from users where email = $1`, [email]);
  if (user && !user.password_hash) {
    throw new HttpError(400, 'no_password', '这个账号还没设密码，点「忘记密码」用验证码设一个');
  }
  const ok = await checkPassword(password, user?.password_hash ?? (await DUMMY_HASH));
  if (!user || !ok) {
    await ctx.db.query('insert into login_failures (email, ip, at) values ($1, $2, $3)', [email, ip, now]);
    throw new HttpError(400, 'bad_login', '邮箱或密码不对');
  }

  return ctx.db.tx(async (db) => {
    await db.query('delete from login_failures where email = $1', [email]);
    const token = await newSession(db, user.id, now);
    return { token, user: user as User };
  });
}

// ---------- 找回密码 ----------

export async function resetPassword(ctx: Ctx, rawEmail: string, code: string, password: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw badEmail();
  checkNewPassword(password);
  await useCode(ctx, email, code, 'reset');
  const hash = await hashPassword(password);
  const now = ctx.now();

  return ctx.db.tx(async (db) => {
    await db.query('delete from email_codes where email = $1', [email]);
    const user = await db.one<User>(`update users set password_hash = $2 where email = $1 returning ${USER_COLS}`, [email, hash]);
    if (!user) throw new HttpError(404, 'not_registered', '这个邮箱还没注册');
    // 密码换了，之前在别的手机上的登录全部作废；锁定记录也清掉
    await db.query('delete from sessions where user_id = $1', [user.id]);
    await db.query('delete from login_failures where email = $1', [email]);
    const token = await newSession(db, user.id, now);
    return { token, user };
  });
}

// ---------- 清理 ----------

// 发码记录、密码输错记录里有邮箱和 IP，只是用来限频率（最多看最近一小时），留一天就够了，过期的验证码也删掉。
// 后台每分钟跑一次，不让这些记录越攒越多
export async function purgeAuthLogs(ctx: Ctx) {
  const dayAgo = new Date(ctx.now().getTime() - 86_400_000);
  await ctx.db.query('delete from code_requests where at < $1', [dayAgo]);
  await ctx.db.query('delete from login_failures where at < $1', [dayAgo]);
  await ctx.db.query('delete from email_codes where expires_at < $1', [dayAgo]);
}

// ---------- 凭证 ----------

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
  await ctx.db.query(`update sessions set last_seen = $2 where token_hash = $1 and last_seen < $2::timestamptz - interval '1 hour'`, [
    hash,
    ctx.now(),
  ]);
  return user;
}

export async function logout(ctx: Ctx, token: string) {
  await ctx.db.query('delete from sessions where token_hash = $1', [tokenHash(token)]);
}
