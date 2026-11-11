// 和后端说话的唯一出口。所有接口都以 /v1 开头，出错时后端会给一句可以直接给用户看的中文
//
// 后端地址：打包时用环境变量 EXPO_PUBLIC_API_URL 指定（以后换成服务器域名）；
// 本机开发不填，就用本机的 http://localhost:8787（后端在 homework-app-backend/server 里跑）
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? 'http://localhost:8787' : '')).replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code: string;
  extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// 连不上服务器（没开、没网）时的错误
export const isOffline = (e: unknown) => e instanceof ApiError && e.code === 'offline';

let token: string | null = null;
export function setToken(t: string | null) {
  token = t;
}

type Options = { method?: string; body?: unknown; raw?: BodyInit; contentType?: string };

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'offline', '还没有配置服务器地址');
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined = opts.raw;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  } else if (opts.contentType) {
    headers['Content-Type'] = opts.contentType;
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, { method: opts.method ?? 'GET', headers, body });
  } catch {
    throw new ApiError(0, 'offline', '连不上服务器，检查一下网络');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const { error, message, ...extra } = (data ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, error ?? 'server_error', message ?? '服务器出错了，稍后再试', extra);
  }
  return data as T;
}

// 后端返回的头像是 /v1/avatars/… 这样的相对地址，显示时要补上服务器地址
export const assetUrl = (path: string | null | undefined) => (path ? `${API_URL}${path}` : null);
