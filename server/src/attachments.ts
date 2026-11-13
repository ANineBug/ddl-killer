import { randomBytes } from 'node:crypto';

import { type Ctx, forbidden, HttpError, notFound, type User } from './context.ts';
import type { Db } from './db.ts';
import { ATTACHMENT_MAX_BYTES, ATTACHMENTS_PER_HOMEWORK } from './rules.ts';

// 作业附件：图片（拍的题目、黑板）、PDF、Word。
// 谁能加、能删：和直接改作业一样，只有上传的人，而且还没人确认之前。确认之后要补图，走「有问题」

export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// 从文件开头几个字节判断真实格式，不信请求里自己报的类型
function sniff(b: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 5) === '%PDF-') return 'application/pdf';
  // docx 本质是个 zip 包，里面有 word/ 文件夹。只认 zip 不够（随便什么压缩包都是 zip），还要看到 word/
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 && Buffer.from(b).includes('word/')) return DOCX;
  return null;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', [DOCX]: 'docx' };

// 文件名只留最后一段、去掉控制字符，太长截断；扩展名按真实格式补上
function cleanName(raw: string, mime: string) {
  const base = raw.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  const ext = EXT[mime];
  if (!base) return `附件.${ext}`;
  return base.toLowerCase().endsWith(`.${ext}`) || (ext === 'jpg' && /\.jpe?g$/i.test(base)) ? base : `${base}.${ext}`;
}

export type AttachmentView = { id: string; name: string; mime: string; size: number; url: string };

const view = (a: { key: string; name: string; mime: string; size: number }): AttachmentView => ({
  id: a.key,
  name: a.name,
  mime: a.mime,
  size: a.size,
  url: `/v1/files/${a.key}`,
});

// 给作业列表、详情用：一次查出这几条作业的附件
export async function attachmentsFor(db: Db, homeworkIds: number[]) {
  const rows = await db.query<{ key: string; homework_id: number; name: string; mime: string; size: number }>(
    'select key, homework_id, name, mime, size from attachments where homework_id = any($1::int[]) order by id',
    [homeworkIds],
  );
  const map = new Map<number, AttachmentView[]>();
  for (const r of rows) map.set(r.homework_id, [...(map.get(r.homework_id) ?? []), view(r)]);
  return map;
}

async function editableHomework(db: Db, user: User, homeworkId: number) {
  await db.query('select id from homework where id = $1 for update', [homeworkId]);
  const h = await db.one<{ uploader_id: number; confirmed_at: Date | null; status: string }>(
    'select uploader_id, confirmed_at, status from homework where id = $1',
    [homeworkId],
  );
  if (!h || h.status === 'deleted') throw notFound('作业');
  if (h.uploader_id !== user.id) throw forbidden('只有上传的人能加、删附件');
  if (h.confirmed_at) throw forbidden('已经有同学确认过了，附件不能再改；要补充请点「有问题」');
}

export async function addAttachment(ctx: Ctx, user: User, homeworkId: number, rawName: string, bytes: Uint8Array) {
  if (bytes.length === 0) throw new HttpError(400, 'empty', '没有收到文件');
  if (bytes.length > ATTACHMENT_MAX_BYTES) throw new HttpError(413, 'too_large', '附件每个最大 10MB');
  const mime = sniff(bytes);
  if (!mime) throw new HttpError(400, 'bad_file', '只支持图片（JPG、PNG、WebP）、PDF 和 Word（docx）');

  return ctx.db.tx(async (db) => {
    await editableHomework(db, user, homeworkId);
    const n = await db.one<{ n: number }>('select count(*)::int n from attachments where homework_id = $1', [homeworkId]);
    if ((n?.n ?? 0) >= ATTACHMENTS_PER_HOMEWORK) throw new HttpError(400, 'too_many', `一条作业最多 ${ATTACHMENTS_PER_HOMEWORK} 个附件`);
    const row = {
      key: randomBytes(18).toString('base64url'),
      name: cleanName(rawName, mime),
      mime,
      size: bytes.length,
    };
    await db.query(
      'insert into attachments (key, homework_id, uploader_id, name, mime, size, data, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [row.key, homeworkId, user.id, row.name, row.mime, row.size, bytes, ctx.now()],
    );
    await db.query('update homework set updated_at = $2 where id = $1', [homeworkId, ctx.now()]);
    return view(row);
  });
}

export async function removeAttachment(ctx: Ctx, user: User, key: string) {
  return ctx.db.tx(async (db) => {
    const a = await db.one<{ id: number; homework_id: number }>('select id, homework_id from attachments where key = $1', [key]);
    if (!a) throw notFound('附件');
    await editableHomework(db, user, a.homework_id);
    await db.query('delete from attachments where id = $1', [a.id]);
    await db.query('update homework set updated_at = $2 where id = $1', [a.homework_id, ctx.now()]);
    return { deleted: true };
  });
}

// 下载：作业被删了，附件也就看不到了
export async function getFile(ctx: Ctx, key: string) {
  const row = await ctx.db.one<{ name: string; mime: string; data: Uint8Array }>(
    `select a.name, a.mime, a.data from attachments a join homework h on h.id = a.homework_id where a.key = $1 and h.status <> 'deleted'`,
    [key],
  );
  if (!row) throw notFound('附件');
  return row;
}
