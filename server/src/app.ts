import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { z } from 'zod';

import { logout, requestCode, userFromToken, verifyCode } from './auth.ts';
import { deleteAvatar, getAvatar, setAvatar, userRef } from './avatar.ts';
import { classBoard, globalBoard } from './board.ts';
import { adminDeleteMessage, listMessages, MessageIn, sendMessage } from './chat.ts';
import { getClass, ImportIn, importTimetable, joinClass, leaveClass, myClasses, resolveTimetable, searchClasses } from './classes.ts';
import { type Ctx, forbidden, HttpError, type User } from './context.ts';
import {
  adminDeleteHomework,
  adoptProposal,
  ChangesIn,
  confirmHomework,
  createHomework,
  createProposal,
  deleteHomework,
  editHomework,
  getHomework,
  HomeworkIn,
  listHomework,
  ProposalIn,
  setReaction,
  unconfirmHomework,
  voteProposal,
  withdrawProposal,
} from './homework.ts';
import { AVATAR_MAX_BYTES } from './rules.ts';

type Env = { Variables: { user: User | null; token: string | undefined } };

// 把请求体按格式检查一遍，不对就返回 400，并告诉 app 哪个字段不对
async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  const raw = await c.req.json().catch(() => null);
  const r = schema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new HttpError(400, 'bad_input', first?.message ?? '格式不对', { path: first?.path.join('.') });
  }
  return r.data;
}

function idParam(c: Context, name = 'id') {
  const n = Number(c.req.param(name));
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'bad_input', '编号不对');
  return n;
}

function need(c: Context<Env>): User {
  const u = c.get('user');
  if (!u) throw new HttpError(401, 'login_required', '登录后才能这样做');
  return u;
}

// 反向代理（Caddy）会把真实 IP 写在 X-Forwarded-For 里
function clientIp(c: Context) {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export function createApp(ctx: Ctx) {
  const app = new Hono<Env>().basePath('/v1');

  // 网页预览（localhost:8081）调用本机后端（localhost:8787）算跨域，要放行。
  // 凭证放在请求头里、不用 cookie，所以允许任意来源也不会被别的网站冒用登录状态
  app.use(cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: err.code, message: err.message, ...err.extra }, err.status as 400);
    }
    console.error(err);
    return c.json({ error: 'server_error', message: '服务器出错了，稍后再试' }, 500);
  });

  app.use(async (c, next) => {
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') || undefined;
    c.set('token', token);
    c.set('user', await userFromToken(ctx, token));
    await next();
  });

  app.get('/health', (c) => c.json({ ok: true }));

  // ---------- 登录 ----------
  app.post('/auth/code', async (c) => {
    const { email } = await body(c, z.object({ email: z.string() }));
    return c.json(await requestCode(ctx, email, clientIp(c)));
  });
  app.post('/auth/verify', async (c) => {
    const { email, code } = await body(c, z.object({ email: z.string(), code: z.string() }));
    const r = await verifyCode(ctx, email, code);
    return c.json({ token: r.token, created: r.created, user: userRef(r.user.id, r.user.nickname, r.user.avatar_version) });
  });
  app.post('/auth/logout', async (c) => {
    const token = c.get('token');
    if (token) await logout(ctx, token);
    return c.json({ ok: true });
  });

  // ---------- 我 ----------
  app.get('/me', async (c) => {
    const u = need(c);
    const row = await ctx.db.one<{ email_digest: boolean }>('select email_digest from users where id = $1', [u.id]);
    return c.json({ ...userRef(u.id, u.nickname, u.avatar_version), emailDigest: row?.email_digest ?? false, classes: await myClasses(ctx, u) });
  });

  // 头像：请求体直接是图片本身（Content-Type: image/jpeg 等），最大 2MB。
  // 建议 app 先裁成正方形、压到 512 像素左右再传，省流量，也显示得快
  app.put(
    '/me/avatar',
    bodyLimit({
      maxSize: AVATAR_MAX_BYTES,
      onError: () => {
        throw new HttpError(413, 'too_large', '头像最大 2MB');
      },
    }),
    async (c) => {
      const u = need(c);
      return c.json(await setAvatar(ctx, u, new Uint8Array(await c.req.arrayBuffer())));
    },
  );
  app.delete('/me/avatar', async (c) => c.json(await deleteAvatar(ctx, need(c))));
  app.get('/avatars/:id', async (c) => {
    const a = await getAvatar(ctx, idParam(c));
    // 地址里带着版本号，换头像地址就变，所以可以放心让手机缓存很久
    return c.body(a.data as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': a.mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
  });
  app.patch('/me', async (c) => {
    const u = need(c);
    // 改昵称、开关邮件提醒，都可以只传其中一样
    const input = await body(
      c,
      z.object({ nickname: z.string().trim().min(1, '昵称不能为空').max(12, '昵称最多 12 个字').optional(), emailDigest: z.boolean().optional() }),
    );
    if (input.nickname !== undefined) await ctx.db.query('update users set nickname = $2 where id = $1', [u.id, input.nickname]);
    if (input.emailDigest !== undefined) await ctx.db.query('update users set email_digest = $2 where id = $1', [u.id, input.emailDigest]);
    const row = await ctx.db.one<{ nickname: string; email_digest: boolean }>('select nickname, email_digest from users where id = $1', [u.id]);
    return c.json({ id: u.id, nickname: row!.nickname, emailDigest: row!.email_digest });
  });
  app.post('/me/import', async (c) => {
    const u = need(c);
    return c.json({ courses: await importTimetable(ctx, u, await body(c, ImportIn)) });
  });

  // ---------- 教学班 ----------
  app.post('/classes/resolve', async (c) => c.json({ courses: await resolveTimetable(ctx, await body(c, ImportIn)) }));
  app.get('/classes/search', async (c) => {
    const term = c.req.query('term') ?? '';
    return c.json({ classes: await searchClasses(ctx, term, c.req.query('q') ?? '') });
  });
  app.get('/classes/:id', async (c) => c.json(await getClass(ctx, idParam(c))));
  app.post('/classes/:id/join', async (c) => c.json(await joinClass(ctx, need(c), idParam(c))));
  app.delete('/classes/:id/join', async (c) => c.json(await leaveClass(ctx, need(c), idParam(c))));
  app.get('/classes/:id/board', async (c) => c.json({ board: await classBoard(ctx, idParam(c)) }));

  // ---------- 作业 ----------
  app.get('/classes/:id/homework', async (c) => c.json({ homework: await listHomework(ctx, idParam(c), c.get('user')) }));
  app.post('/classes/:id/homework', async (c) => {
    const u = need(c);
    return c.json(await createHomework(ctx, u, idParam(c), await body(c, HomeworkIn)), 201);
  });
  app.get('/homework/:id', async (c) => c.json(await getHomework(ctx, idParam(c), c.get('user'))));
  app.patch('/homework/:id', async (c) => {
    const u = need(c);
    return c.json(await editHomework(ctx, u, idParam(c), await body(c, ChangesIn)));
  });
  app.delete('/homework/:id', async (c) => c.json(await deleteHomework(ctx, need(c), idParam(c))));
  app.post('/homework/:id/confirm', async (c) => c.json(await confirmHomework(ctx, need(c), idParam(c))));
  app.delete('/homework/:id/confirm', async (c) => c.json(await unconfirmHomework(ctx, need(c), idParam(c))));
  app.put('/homework/:id/reactions/:kind', async (c) => {
    const kind = z.enum(['thumbs', 'cry']).parse(c.req.param('kind'));
    return c.json(await setReaction(ctx, need(c), idParam(c), kind, true));
  });
  app.delete('/homework/:id/reactions/:kind', async (c) => {
    const kind = z.enum(['thumbs', 'cry']).parse(c.req.param('kind'));
    return c.json(await setReaction(ctx, need(c), idParam(c), kind, false));
  });

  // ---------- 提议 ----------
  app.post('/homework/:id/proposals', async (c) => {
    const u = need(c);
    return c.json(await createProposal(ctx, u, idParam(c), await body(c, ProposalIn)), 201);
  });
  app.post('/proposals/:id/vote', async (c) => {
    const u = need(c);
    const { agree } = await body(c, z.object({ agree: z.boolean() }));
    return c.json({ status: await voteProposal(ctx, u, idParam(c), agree) });
  });
  app.post('/proposals/:id/adopt', async (c) => c.json({ status: await adoptProposal(ctx, need(c), idParam(c)) }));
  app.post('/proposals/:id/withdraw', async (c) => c.json({ status: await withdrawProposal(ctx, need(c), idParam(c)) }));

  // ---------- 排行榜 ----------
  app.get('/board', async (c) => c.json(await globalBoard(ctx, c.get('user'))));

  // ---------- 聊天 ----------
  app.get('/classes/:id/messages', async (c) => {
    const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));
    return c.json({
      messages: await listMessages(ctx, need(c), idParam(c), { after: num(c.req.query('after')), before: num(c.req.query('before')) }),
    });
  });
  app.post('/classes/:id/messages', async (c) => {
    const u = need(c);
    return c.json(await sendMessage(ctx, u, idParam(c), await body(c, MessageIn)), 201);
  });

  // ---------- 管理员 ----------
  const admin = (c: Context<Env>) => {
    const u = need(c);
    if (!u.is_admin) throw forbidden('只有管理员能这样做');
    return u;
  };
  app.delete('/admin/messages/:id', async (c) => {
    admin(c);
    await adminDeleteMessage(ctx, idParam(c));
    return c.json({ ok: true });
  });
  app.delete('/admin/homework/:id', async (c) => {
    admin(c);
    await adminDeleteHomework(ctx, idParam(c));
    return c.json({ ok: true });
  });
  // 降级：这个账号在所有班都按新同学算（权重 0、每天限传 3 条）。demoted=false 恢复
  app.post('/admin/users/:id/demote', async (c) => {
    admin(c);
    const { demoted } = await body(c, z.object({ demoted: z.boolean().default(true) }));
    await ctx.db.query('update users set demoted = $2 where id = $1', [idParam(c), demoted]);
    return c.json({ ok: true });
  });

  return app;
}
