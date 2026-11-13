import { type Ctx, HttpError, notFound, type User } from './context.ts';
import { AVATAR_MAX_BYTES } from './rules.ts';

// 从文件开头几个字节判断真实格式，不信请求里自己报的类型
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

// 给 app 用的头像地址；没传过头像返回 null，app 显示昵称首字加颜色。
// 地址里带版本号，换头像后地址就变了，手机上的旧缓存自然不用了
export function avatarUrl(userId: number, version: number) {
  return version > 0 ? `/v1/avatars/${userId}?v=${version}` : null;
}

// 所有接口里出现"某个人"时都用这个样子：编号、昵称、头像地址
export function userRef(id: number, nickname: string, avatarVersion: number) {
  return { id, nickname, avatar: avatarUrl(id, avatarVersion) };
}

export async function setAvatar(ctx: Ctx, user: User, bytes: Uint8Array) {
  if (bytes.length === 0) throw new HttpError(400, 'empty', '没有收到图片');
  if (bytes.length > AVATAR_MAX_BYTES) throw new HttpError(413, 'too_large', '头像最大 2MB');
  const mime = sniff(bytes);
  if (!mime) throw new HttpError(400, 'bad_image', '只支持 JPG、PNG、WebP 图片');
  return ctx.db.tx(async (db) => {
    await db.query(
      `insert into avatars (user_id, mime, data, updated_at) values ($1, $2, $3, $4)
       on conflict (user_id) do update set mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`,
      [user.id, mime, bytes, ctx.now()],
    );
    const row = await db.one<{ v: number }>('update users set avatar_version = avatar_version + 1 where id = $1 returning avatar_version v', [user.id]);
    return { avatar: avatarUrl(user.id, row!.v) };
  });
}

export async function deleteAvatar(ctx: Ctx, user: User) {
  await ctx.db.tx(async (db) => {
    await db.query('delete from avatars where user_id = $1', [user.id]);
    await db.query('update users set avatar_version = 0 where id = $1', [user.id]);
  });
  return { avatar: null };
}

export async function getAvatar(ctx: Ctx, userId: number) {
  const row = await ctx.db.one<{ mime: string; data: Uint8Array }>('select mime, data from avatars where user_id = $1', [userId]);
  if (!row) throw notFound('头像');
  return row;
}
