// 业务规则里的纯计算：档位、门槛、邮箱规整、课名和教室规整。
// 不碰数据库，规则要调整基本只改这个文件。

// ---------- 档位与权重 ----------

export type Tier = 'newbie' | 'member' | 'helper' | 'trusted';

export const TIER_NAMES: Record<Tier, string> = {
  newbie: '新同学',
  member: '同学',
  helper: '热心同学',
  trusted: '靠谱同学',
};

export const TIER_WEIGHT: Record<Tier, number> = { newbie: 0, member: 1, helper: 1.5, trusted: 2 };

// 档位看的是这个人在这个班、这学期的贡献值。
// 教务导入的直接是"同学"；手动加入的要攒到 20 分。分数变成负的，不管怎么进来的都回到新同学
export function tierOf(score: number, imported: boolean, demoted = false): Tier {
  if (demoted || score < 0) return 'newbie';
  if (score >= 120) return 'trusted';
  if (score >= 60) return 'helper';
  if (imported || score >= 20) return 'member';
  return 'newbie';
}

// ---------- 门槛 ----------

// 门槛 = 班级人数 × 比例，向上取整，再夹在上下限之间。班级人数只算有权重的成员
export type ThresholdKind = 'confirm' | 'change' | 'postpone' | 'duplicate';

const THRESHOLDS: Record<ThresholdKind, { pct: number; min: number; max: number }> = {
  confirm: { pct: 0.1, min: 2, max: 5 },
  change: { pct: 0.1, min: 2, max: 5 }, // 纠错、更新
  postpone: { pct: 0.15, min: 3, max: 8 }, // 把截止时间往后推、改成待定、取消作业
  duplicate: { pct: 0.05, min: 2, max: 3 }, // 重复、不是重复
};

export function threshold(kind: ThresholdKind, classSize: number) {
  const r = THRESHOLDS[kind];
  return Math.min(r.max, Math.max(r.min, Math.ceil(classSize * r.pct)));
}

// ---------- 贡献值 ----------

export const POINTS = {
  uploadConfirmed: 10, // 自己传的作业被确认
  correctionAdopted: 5, // 自己提的纠错生效
  updateAdopted: 3, // 自己提的更新生效
  corrected: -5, // 自己传的作业被别人纠错
};

// ---------- 频率限制 ----------

export const NEWBIE_DAILY_UPLOADS = 3; // 新同学每个班每天最多传几条
export const DAILY_UPLOADS = 30; // 所有人每天总共最多传几条，防脚本
export const CHAT_INTERVAL_MS = 5000; // 聊天每 5 秒一条
export const CODE_RESEND_MS = 60_000; // 验证码 60 秒内不能重发
export const CODE_TTL_MS = 10 * 60_000; // 验证码 10 分钟有效
export const CODE_MAX_ATTEMPTS = 5; // 输错 5 次作废
export const CODE_IP_PER_HOUR = 10; // 同一个 IP 每小时最多发 10 次码
export const LOGIN_FAIL_WINDOW_MS = 15 * 60_000; // 密码输错按最近 15 分钟算
export const LOGIN_FAIL_PER_EMAIL = 10; // 同一个邮箱 15 分钟内错 10 次就先锁住
export const LOGIN_FAIL_PER_IP = 30; // 同一个 IP 15 分钟内错 30 次（换着邮箱猜）也锁住

// 密码：8 到 64 位，字母和数字都要有。只挡最弱的那种（纯数字生日、纯字母单词）
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return '密码至少 8 位';
  if (pw.length > 64) return '密码最多 64 位';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return '密码要同时有字母和数字';
  return null;
}
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 头像最大 2MB
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 作业附件每个最大 10MB
export const ATTACHMENTS_PER_HOMEWORK = 6; // 一条作业最多 6 个附件

// ---------- 邮箱 ----------

const ALLOWED_DOMAINS = new Set(['qq.com', '163.com', 'gmail.com']);

// 返回规整后的邮箱，不在白名单里返回 null。
// Gmail 不区分点、会忽略 + 后面的部分，a.b+x@gmail.com 和 ab@gmail.com 是同一个信箱，要算成同一个账号
export function normalizeEmail(raw: string): string | null {
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(raw.trim().toLowerCase());
  if (!m) return null;
  let local = m[1];
  let domain = m[2];
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (!ALLOWED_DOMAINS.has(domain)) return null;
  if (domain === 'gmail.com') local = local.split('+')[0].replace(/\./g, '');
  if (!local || !/^[a-z0-9._+-]+$/.test(local)) return null;
  return `${local}@${domain}`;
}

// ---------- 课名、教室、周次 ----------

// 课名去掉【调】、★▲ 这类页面标记和空白，全角转半角，用来判断是不是同一门课
export function nameKey(name: string) {
  return name
    .normalize('NFKC')
    .replace(/【[^】]*】|\[[^\]]*\]/g, '')
    .replace(/[★▲●◆■☆△]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

// 讲座场地、实践场地、线上这些不是固定教室，同一时间可能有很多班，不能拿来认班
const PLACEHOLDER_ROOM = /场地|待定|线上|网络|未安排|未排|^无$/;

// 教室规整：全角转半角、去空格和连字符、大写。"通博楼 B101" 和 "通博楼B101" 是同一间。
// 不是真教室的返回空字符串
export function roomKey(room: string) {
  const k = room.normalize('NFKC').replace(/[\s\-_·]/g, '').toUpperCase();
  if (!k || PLACEHOLDER_ROOM.test(k)) return '';
  return k;
}

export type WeekRange = { from: number; to: number; rule: 'all' | 'odd' | 'even' };

export const MAX_WEEK = 30;

// "1-5 周、7-17 周（单）"这类区间展开成具体的周数列表
export function expandWeeks(ranges: WeekRange[]): number[] {
  const set = new Set<number>();
  for (const r of ranges) {
    for (let w = Math.max(1, r.from); w <= Math.min(MAX_WEEK, r.to); w++) {
      if (r.rule === 'odd' && w % 2 === 0) continue;
      if (r.rule === 'even' && w % 2 === 1) continue;
      set.add(w);
    }
  }
  return [...set].sort((a, b) => a - b);
}

export function defaultNickname() {
  return `同学${Math.floor(1000 + Math.random() * 9000)}`;
}
