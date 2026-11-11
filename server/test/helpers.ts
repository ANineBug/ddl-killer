import { createApp } from '../src/app.ts';
import type { Ctx } from '../src/context.ts';
import { migrate, pglite } from '../src/db.ts';

// 每个测试一个全新的内存数据库，时间可以手动往前拨，邮件不真发、记在 mails 里
export async function setup() {
  const db = await pglite();
  await migrate(db);
  let t = new Date('2026-09-14T02:00:00Z').getTime(); // 第三周周一上午（北京时间 10 点）
  const mails: { to: string; text: string }[] = [];
  const ctx: Ctx = {
    db,
    now: () => new Date(t),
    mailer: { send: async (to, _s, text) => void mails.push({ to, text }) },
    secret: 'test',
  };
  const app = createApp(ctx);

  async function call(method: string, path: string, token?: string, json?: unknown) {
    const res = await app.request(`/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '10.0.0.1',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
    const data = (await res.json()) as any;
    return { status: res.status, data };
  }

  let ipCounter = 0;
  // 注册并登录一个账号，返回凭证。每个账号用不同的 IP，免得撞上发码频率限制
  async function login(email: string) {
    ipCounter++;
    const res = await app.request('/v1/auth/code', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.${ipCounter >> 8}.${ipCounter & 255}` },
      body: JSON.stringify({ email }),
    });
    if (res.status !== 200) throw new Error(`code ${res.status} ${await res.text()}`);
    const code = /验证码是 (\d{6})/.exec(mails.at(-1)!.text)![1];
    const v = await call('POST', '/auth/verify', undefined, { email, code });
    if (v.status !== 200) throw new Error(`verify ${v.status}`);
    return v.data.token as string;
  }

  return {
    app,
    ctx,
    db,
    mails,
    call,
    login,
    tick: (ms: number) => void (t += ms),
    close: () => db.close(),
  };
}

export const TERM = '2026-2027学年第1学期';

// 一份典型的课表：概率论周一 6-7 节、周五 5-6 节；大学物理周三 10-12 节
export const probability = {
  name: '概率论与数理统计B',
  teacher: '王老师',
  sessions: [
    { weekday: 1, from: 6, to: 7, location: '经世楼G901', weeks: [{ from: 1, to: 17, rule: 'all' }] },
    { weekday: 5, from: 5, to: 6, location: '经世楼 G901', weeks: [{ from: 1, to: 17, rule: 'all' }] },
  ],
};

export const physics = {
  name: '大学物理',
  teacher: '乙老师',
  sessions: [{ weekday: 3, from: 10, to: 12, location: '颐德楼H902', weeks: [{ from: 1, to: 17, rule: 'all' }] }],
};

// 建一个有 n 个"同学"（教务导入、权重 1）的班，返回这些人的凭证和班级编号
export async function classWith(s: Awaited<ReturnType<typeof setup>>, n: number, course: object = probability) {
  const tokens: string[] = [];
  let classId = 0;
  for (let i = 0; i < n; i++) {
    const tk = await s.login(`member${i}_${Math.random().toString(36).slice(2, 7)}@qq.com`);
    const r = await s.call('POST', '/me/import', tk, { term: TERM, courses: [course] });
    classId = r.data.courses[0].classId;
    tokens.push(tk);
  }
  return { tokens, classId };
}

export const inDays = (s: Awaited<ReturnType<typeof setup>>, days: number) =>
  new Date(s.ctx.now().getTime() + days * 86_400_000).toISOString();
