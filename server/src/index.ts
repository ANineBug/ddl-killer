import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';

import { createApp } from './app.ts';
import { purgeAuthLogs } from './auth.ts';
import type { Ctx } from './context.ts';
import { type Db, migrate, pglite, postgres } from './db.ts';
import { maybeSendDigests } from './digest.ts';
import { sweep } from './homework.ts';
import { consoleMailer, resendMailer } from './mailer.ts';

// 环境变量（服务器上写在 .env 里，见 README）：
//   DATABASE_URL    PostgreSQL 连接串。不填就用本机的 PGlite，数据存在 server/.data/
//   SECRET          随机长字符串，给验证码做哈希。服务器上必须填
//   RESEND_API_KEY  不填就不真发邮件，验证码打印在终端里
//   MAIL_FROM       发件人，例如 "作业提醒 <noreply@你的域名>"
//   FEEDBACK_TO     意见反馈发到哪个邮箱，不填就只存在数据库里
//   PORT            默认 8787
const env = process.env;
const production = env.NODE_ENV === 'production';

if (production && (!env.DATABASE_URL || !env.SECRET || !env.RESEND_API_KEY || !env.MAIL_FROM)) {
  console.error('正式环境必须配置 DATABASE_URL、SECRET、RESEND_API_KEY、MAIL_FROM');
  process.exit(1);
}

const db: Db = env.DATABASE_URL ? postgres(env.DATABASE_URL) : await pglite(fileURLToPath(new URL('../.data', import.meta.url)));
await migrate(db);

const ctx: Ctx = {
  db,
  now: () => new Date(),
  mailer: env.RESEND_API_KEY && env.MAIL_FROM ? resendMailer(env.RESEND_API_KEY, env.MAIL_FROM) : consoleMailer(),
  secret: env.SECRET ?? 'dev-secret-only-for-local',
  feedbackTo: env.FEEDBACK_TO || undefined,
};

const app = createApp(ctx);
const port = Number(env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`后端已启动：http://localhost:${port}/v1/health`));

// 每分钟把过了截止时间的提议结束掉
// 每天早上 7 点发邮件提醒
// 清掉一天以前的发码、输错密码记录（里面有邮箱和 IP）
setInterval(() => {
  sweep(ctx).catch((e) => console.error('sweep', e));
  maybeSendDigests(ctx).catch((e) => console.error('digest', e));
  purgeAuthLogs(ctx).catch((e) => console.error('purge', e));
}, 60_000);
