import type { Db } from './db.ts';
import type { Mailer } from './mailer.ts';

// 整个服务共用的东西。测试时可以换成假的：内存数据库、可拨动的时钟、不真发信的邮件
export type Ctx = {
  db: Db;
  now: () => Date;
  mailer: Mailer;
  // 给验证码做哈希用的密钥，服务器上从环境变量读
  secret: string;
  // 意见反馈发到这个邮箱；不填就只存库
  feedbackTo?: string;
};

// 接口出错统一抛这个，status 是 HTTP 状态码，code 给 app 判断用，message 直接给用户看
export class HttpError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const notFound = (what = '内容') => new HttpError(404, 'not_found', `${what}不存在`);
export const forbidden = (message: string) => new HttpError(403, 'forbidden', message);

export type User = {
  id: number;
  email: string;
  nickname: string;
  avatar_version: number;
  demoted: boolean;
  is_admin: boolean;
};
