import type { Homework, Reminder } from './types';

// 「我的状态」（完成、与我无关、归档、自己设的提醒）的合并规则：纯计算，方便单独测试

export type ServerMark = {
  homeworkId: number;
  done: boolean;
  doneAt: Date | null;
  ignored: boolean;
  archived: boolean | null;
  reminders: Reminder[] | null;
  updatedAt: Date;
};

export const hasMark = (h: Homework) => h.done || !!h.ignored || h.archived !== undefined || h.reminders !== undefined;

// 一条服务器上的作业，拿到服务器的状态 m（可能没有）以后应该变成什么样：
// - 本机改了还没存上、而且比服务器的晚：留本机的，等着上传
// - 服务器上有：用服务器的
// - 服务器上没有、本机有状态、从没同步过（老版本时打的勾）：标成待上传
export function mergeMark(h: Homework, m: ServerMark | undefined): Homework {
  if (!h.remote) return h;
  if (!m) return !h.markPending && !h.markedAt && hasMark(h) ? { ...h, markedAt: h.doneAt ?? new Date(), markPending: true } : h;
  if (h.markPending && h.markedAt && h.markedAt > m.updatedAt) return h;
  return {
    ...h,
    done: m.done,
    doneAt: m.doneAt ?? undefined,
    ignored: m.ignored || undefined,
    archived: m.archived ?? undefined,
    reminders: m.reminders ?? undefined,
    markedAt: m.updatedAt,
    markPending: false,
  };
}
