import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { api, ApiError } from '@/api/client';
import type { BoardRow, ChatMessage, GlobalBoard, Me, ProposalKind, RemoteAttachment, RemoteClass, RemoteDetail, RemoteHomework, UserRef } from '@/api/types';

import { courseForServer, courseFromClass, fromRemote, localHomeworkId } from './remote';
import { type ServerMark, useStore } from './store';
import type { Course, Homework, Reminder } from './types';

// 服务器给的「我的状态」：时间是文字，变回日期
type RawMark = Omit<ServerMark, 'doneAt' | 'updatedAt' | 'reminders'> & {
  doneAt: string | null;
  updatedAt: string;
  reminders: ({ kind: 'before'; minutes: number } | { kind: 'at'; at: string })[] | null;
};
const parseMark = (m: RawMark): ServerMark => ({
  ...m,
  doneAt: m.doneAt ? new Date(m.doneAt) : null,
  updatedAt: new Date(m.updatedAt),
  reminders: m.reminders ? m.reminders.map((r): Reminder => (r.kind === 'at' ? { kind: 'at', at: new Date(r.at) } : r)) : null,
});

// 本机改了还没存到服务器的「我的状态」→ 接口要的样子
function pendingMarks(homework: Homework[]) {
  return homework
    .filter((h) => h.remote && h.markPending && h.markedAt)
    .map((h) => ({
      localId: h.id,
      at: h.markedAt!.getTime(),
      body: {
        homeworkId: h.remote!.id,
        done: h.done,
        doneAt: h.doneAt ? h.doneAt.toISOString() : null,
        ignored: !!h.ignored,
        archived: h.archived ?? null,
        reminders: h.reminders ? h.reminders.map((r) => (r.kind === 'at' ? { kind: 'at', at: r.at.toISOString() } : r)) : null,
        updatedAt: h.markedAt!.toISOString(),
      },
    }));
}

// 所有要连服务器的操作都在这里。界面只管调用，出错时抛 ApiError，message 可以直接给用户看

export function useOnline() {
  const { account, setAccount, linkCourses, replaceRemote, upsertRemote, addJoinedCourse, removeHomework, courses, timetable, setTimetable, setProfile, homework, applyMarks, markSaved, clearRemoteMarks } =
    useStore();

  // 1. 课表 → 教学班。登录了就是"导入并加入"，游客只查对应哪些已有的班
  const link = useCallback(
    async (list: Course[], term: string | undefined, loggedIn: boolean) => {
      if (!term) return list;
      const imported = list.filter((c) => c.source?.term === term && !c.manual);
      const links: Record<string, number> = {};
      if (imported.length) {
        const body = { term, courses: imported.map(courseForServer) };
        const res = await api<{ courses: { index: number; classId: number | null }[] }>(loggedIn ? '/me/import' : '/classes/resolve', {
          method: 'POST',
          body,
        });
        for (const r of res.courses) if (r.classId) links[imported[r.index].id] = r.classId;
      }
      // 手动加入的班，登录后要在服务器上也加入一次（游客加入只记在手机上）
      if (loggedIn) {
        for (const c of list.filter((x) => x.manual && x.serverClassId)) {
          await api(`/classes/${c.serverClassId}/join`, { method: 'POST' }).catch(() => {});
        }
      }
      linkCourses(links);
      return list.map((c) => (links[c.id] ? { ...c, serverClassId: links[c.id] } : c));
    },
    [linkCourses],
  );

  // 2. 把有教学班的课的作业都拉下来
  const sync = useCallback(
    async (list: Course[]) => {
      const linked = list.filter((c) => c.serverClassId);
      const items: Homework[] = [];
      for (const c of linked) {
        const res = await api<{ homework: RemoteHomework[] }>(`/classes/${c.serverClassId}/homework`);
        items.push(...res.homework.map((h) => fromRemote(h, c.id)));
      }
      replaceRemote(
        linked.map((c) => c.id),
        items,
      );
      // 登录了就把「我的状态」（完成、与我无关、归档、提醒）也对一遍
      if (account) {
        const res = await api<{ marks: RawMark[] }>('/me/marks');
        applyMarks(res.marks.map(parseMark));
      }
    },
    [replaceRemote, account, applyMarks],
  );

  // 把本机改了还没存上的「我的状态」存到服务器，一次最多 300 条
  const pushMarks = useCallback(
    async (list: Homework[]) => {
      const pending = pendingMarks(list);
      for (let i = 0; i < pending.length; i += 300) {
        const chunk = pending.slice(i, i + 300);
        await api('/me/marks', { method: 'POST', body: { marks: chunk.map((p) => p.body) } });
        markSaved(Object.fromEntries(chunk.map((p) => [p.localId, p.at])));
      }
    },
    [markSaved],
  );

  const refresh = useCallback(async () => {
    const list = await link(courses, timetable.term, !!account);
    await sync(list);
  }, [link, sync, courses, timetable.term, account]);

  // ---------- 登录 ----------

  // 注册、找回密码前先发验证码；平时登录只要邮箱 + 密码
  const requestCode = useCallback(
    (email: string, purpose: 'register' | 'reset') => api('/auth/code', { method: 'POST', body: { email, purpose } }),
    [],
  );

  const signedIn = useCallback(
    (res: { token: string; user: UserRef }) => {
      setAccount({ token: res.token, user: res.user });
      setProfile({ nickname: res.user.nickname });
    },
    [setAccount, setProfile],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ token: string; user: UserRef }>('/auth/login', { method: 'POST', body: { email, password } });
      signedIn(res);
      return res;
    },
    [signedIn],
  );

  const register = useCallback(
    async (email: string, code: string, password: string) => {
      const res = await api<{ token: string; created: boolean; user: UserRef }>('/auth/register', { method: 'POST', body: { email, code, password } });
      signedIn(res);
      return res;
    },
    [signedIn],
  );

  const resetPassword = useCallback(
    async (email: string, code: string, password: string) => {
      const res = await api<{ token: string; user: UserRef }>('/auth/reset', { method: 'POST', body: { email, code, password } });
      signedIn(res);
      return res;
    },
    [signedIn],
  );

  const logout = useCallback(async () => {
    // 先把还没存上的「我的状态」存到账号上，再退出；退出后本机清掉，免得下一个登录的人带上
    // 没网存不上的就先留在本机，下次登录再存，不然会丢
    const saved = await pushMarks(homework).then(() => true, () => false);
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setAccount(null);
    if (saved) clearRemoteMarks();
  }, [setAccount, pushMarks, homework, clearRemoteMarks]);

  // 意见反馈：直接发给开发者，带上版本号和系统，方便排查
  const feedback = useCallback(
    (data: { kind: 'bug' | 'idea' | 'other'; text: string; contact: string; appVersion: string; platform: string }) =>
      api<{ id: number }>('/feedback', { method: 'POST', body: data }),
    [],
  );

  const rename = useCallback(
    async (nickname: string) => {
      if (!account) return;
      const res = await api<{ nickname: string }>('/me', { method: 'PATCH', body: { nickname } });
      setAccount({ ...account, user: { ...account.user, nickname: res.nickname } });
    },
    [account, setAccount],
  );

  const me = useCallback(() => api<Me>('/me'), []);
  const saveTermStarts = useCallback((termStarts: Record<string, string>) => api('/me', { method: 'PATCH', body: { termStarts } }), []);

  // ---------- 作业 ----------

  const courseIdOf = useCallback((classId: number) => courses.find((c) => c.serverClassId === classId)?.id, [courses]);

  const apply = useCallback(
    (r: RemoteHomework) => {
      const courseId = courseIdOf(r.classId);
      if (courseId) upsertRemote(fromRemote(r, courseId));
    },
    [courseIdOf, upsertRemote],
  );

  const upload = useCallback(
    async (
      classId: number,
      data: { title: string; detail: string; dueKind: 'at' | 'next_class' | 'tbd'; due: Date | null; submit: string; source: string; optional: boolean; groupWork: boolean },
    ) => {
      const r = await api<RemoteHomework>(`/classes/${classId}/homework`, {
        method: 'POST',
        body: { ...data, due: data.dueKind === 'tbd' ? undefined : data.due?.toISOString() },
      });
      apply(r);
      return r;
    },
    [apply],
  );

  const edit = useCallback(
    async (h: Homework, changes: Record<string, unknown>) => {
      const r = await api<RemoteHomework>(`/homework/${h.remote!.id}`, { method: 'PATCH', body: changes });
      apply(r);
    },
    [apply],
  );

  const remove = useCallback(
    async (h: Homework) => {
      await api(`/homework/${h.remote!.id}`, { method: 'DELETE' });
      removeHomework(h.id);
    },
    [removeHomework],
  );

  // 确认、赞、下雨：点一下切换
  const react = useCallback(
    async (h: Homework, kind: 'confirm' | 'thumbs' | 'cry') => {
      const on = !h.myReactions.includes(kind);
      const path = kind === 'confirm' ? `/homework/${h.remote!.id}/confirm` : `/homework/${h.remote!.id}/reactions/${kind}`;
      const r = await api<RemoteHomework>(path, { method: on ? (kind === 'confirm' ? 'POST' : 'PUT') : 'DELETE' });
      apply(r);
    },
    [apply],
  );

  // ---------- 详情与提议 ----------

  // 详情：带改动记录、提议、合并进来的条目。顺便把列表里这条也更新成最新的
  // ---------- 附件 ----------

  // 一次传一个：请求体就是文件本身，文件名放在请求头里
  const attach = useCallback(async (homeworkId: number, f: { uri: string; name: string; mime?: string }) => {
    const blob = await (await fetch(f.uri)).blob();
    return api<RemoteAttachment>(`/homework/${homeworkId}/attachments`, {
      method: 'POST',
      raw: blob,
      contentType: f.mime || 'application/octet-stream',
      headers: { 'X-File-Name': encodeURIComponent(f.name) },
    });
  }, []);

  const detach = useCallback((key: string) => api(`/attachments/${key}`, { method: 'DELETE' }), []);

  // 加、删完附件，把这条作业重新拉一遍，手机上的附件列表就对上了
  const reload = useCallback(async (homeworkId: number) => apply(await api<RemoteHomework>(`/homework/${homeworkId}`)), [apply]);

  const detail = useCallback(
    async (h: Homework) => {
      const d = await api<RemoteDetail>(`/homework/${h.remote!.id}`);
      apply(d);
      return d;
    },
    [apply],
  );

  // 提议生效可能合并、拆开别的作业，所以动完重新拉一遍这门课的作业
  const resync = useCallback(
    async (h: Homework) => {
      const c = courses.find((x) => x.id === h.courseId);
      if (c) await sync([c]);
    },
    [courses, sync],
  );

  const propose = useCallback(
    async (h: Homework, body: { kind: ProposalKind; changes?: Record<string, unknown>; targetId?: number; reason?: string }) => {
      await api(`/homework/${h.remote!.id}/proposals`, { method: 'POST', body });
      await resync(h);
    },
    [resync],
  );

  const vote = useCallback(
    async (h: Homework, proposalId: number, agree: boolean) => {
      const r = await api<{ status: string }>(`/proposals/${proposalId}/vote`, { method: 'POST', body: { agree } });
      await resync(h);
      return r.status;
    },
    [resync],
  );

  const adopt = useCallback(
    async (h: Homework, proposalId: number) => {
      await api(`/proposals/${proposalId}/adopt`, { method: 'POST' });
      await resync(h);
    },
    [resync],
  );

  const withdraw = useCallback(
    async (h: Homework, proposalId: number) => {
      await api(`/proposals/${proposalId}/withdraw`, { method: 'POST' });
      await resync(h);
    },
    [resync],
  );

  // 列表里那一叠的「是重复 / 不是重复」：找到这两条之间进行中的"重复了"提议，投一票
  const voteDuplicate = useCallback(
    async (front: Homework, agree: boolean) => {
      const d = await api<RemoteDetail>(`/homework/${front.remote!.id}`);
      const p = d.proposals.find((x) => x.kind === 'duplicate' && x.status === 'open');
      if (!p) throw new ApiError(404, 'not_found', '这条重复提议已经结束了');
      return vote(front, p.id, agree);
    },
    [vote],
  );

  // ---------- 聊天、排行榜 ----------

  // after：只要比这条新的；不给就是最新 50 条
  const messages = useCallback(
    (classId: number, after?: number) => api<{ messages: ChatMessage[] }>(`/classes/${classId}/messages${after ? `?after=${after}` : ''}`).then((r) => r.messages),
    [],
  );
  const send = useCallback(
    (classId: number, text: string, homeworkId?: number) => api<ChatMessage>(`/classes/${classId}/messages`, { method: 'POST', body: { text, homeworkId } }),
    [],
  );
  // ---------- 管理员 ----------
  const adminDeleteMessage = useCallback((id: number) => api(`/admin/messages/${id}`, { method: 'DELETE' }), []);
  const adminDeleteHomework = useCallback(
    async (h: Homework) => {
      await api(`/admin/homework/${h.remote!.id}`, { method: 'DELETE' });
      removeHomework(h.id);
    },
    [removeHomework],
  );
  // 降级：这个账号在所有班都按新同学算、不能在总聊天室发言；demoted=false 恢复
  const adminDemote = useCallback(
    (userId: number, demoted: boolean) => api(`/admin/users/${userId}/demote`, { method: 'POST', body: { demoted } }),
    [],
  );
  const adminDemotedUsers = useCallback(() => api<{ users: UserRef[] }>('/admin/users').then((r) => r.users), []);

  // 总聊天室：全校登录的同学都能看、能发
  const lobbyMessages = useCallback(
    (after?: number) => api<{ messages: ChatMessage[] }>(`/lobby/messages${after ? `?after=${after}` : ''}`).then((r) => r.messages),
    [],
  );
  const lobbySend = useCallback((text: string) => api<ChatMessage>('/lobby/messages', { method: 'POST', body: { text } }), []);
  const classBoard = useCallback((classId: number) => api<{ board: BoardRow[] }>(`/classes/${classId}/board`).then((r) => r.board), []);
  // 总分榜：总榜 / 月榜 / 周榜
  const globalBoard = useCallback((period: 'all' | 'month' | 'week' = 'all') => api<GlobalBoard>(`/board?period=${period}`), []);

  // ---------- 头像 ----------

  // 传的是已经压缩好的图片地址（本机文件），读成二进制直接发上去
  const setAvatar = useCallback(
    async (uri: string, mime: string) => {
      if (!account) return;
      const blob = await (await fetch(uri)).blob();
      const r = await api<{ avatar: string }>('/me/avatar', { method: 'PUT', raw: blob, contentType: mime });
      setAccount({ ...account, user: { ...account.user, avatar: r.avatar } });
    },
    [account, setAccount],
  );

  // ---------- 教学班 ----------

  // 从课表删掉一门服务器上的课：登录了顺便在服务器上退出这个班
  const leave = useCallback(
    async (classId: number) => {
      if (account) await api(`/classes/${classId}/join`, { method: 'DELETE' });
    },
    [account],
  );

  const search = useCallback((term: string, q: string) => api<{ classes: RemoteClass[] }>(`/classes/search?term=${encodeURIComponent(term)}&q=${encodeURIComponent(q)}`), []);

  // 加入：登录了在服务器上加入（时间冲突会被拒绝）；游客只加进自己的课表，能看作业
  const join = useCallback(
    async (c: RemoteClass) => {
      if (account) await api(`/classes/${c.id}/join`, { method: 'POST' });
      const course = { ...courseFromClass(c, `j${c.id}`, 0), manual: true };
      addJoinedCourse(course);
      // 课表一次只显示一个学期；还没选过学期（还没导入过课表）时，切到这个班的学期，刚加的课才看得到
      if (!timetable.term) setTimetable({ term: c.term });
      await sync([course]);
    },
    [account, addJoinedCourse, sync, timetable.term, setTimetable],
  );

  return { loggedIn: !!account, account, link, sync, refresh, requestCode, login, register, resetPassword, logout, rename, feedback, pushMarks, me, saveTermStarts, isAdmin: !!account?.admin, upload, edit, remove, attach, detach, reload, react, detail, propose, vote, adopt, withdraw, voteDuplicate, messages, send, lobbyMessages, lobbySend, adminDeleteMessage, adminDeleteHomework, adminDemote, adminDemotedUsers, classBoard, globalBoard, setAvatar, leave, search, join };
}

export { ApiError, localHomeworkId };

// 后台同步：打开 app、登录或退出、导入了新课表、回到前台时，自动和服务器对一遍
// 服务器上「我加入的班」→ 手机课表里的课。教务导入的和手动加入的分开标，和本机导入的一样参与同步
function restoredCourses(me: Me): Course[] {
  return me.classes.map((c) => ({ ...courseFromClass(c, `srv${c.id}`, 0), manual: c.via === 'manual' ? true : undefined, restored: true }));
}

export function OnlineSync() {
  const { courses, timetable, account, restoreCourses, setTimetable, setAccount, homework } = useStore();
  const online = useOnline();
  const ref = useRef(online);
  ref.current = online;
  const state = useRef({ token: undefined as string | null | undefined, courses, timetable, account });
  state.current.courses = courses;
  state.current.timetable = timetable;
  state.current.account = account;
  // 这个账号的「每学期第一周」已经和服务器对过一次了，之后本机改了才往上传
  const startsReady = useRef<string | null>(null);

  // 还没挂上教学班的课（刚导入的）；变了才重新认班，认不出来的不会反复请求
  const unlinked = courses
    .filter((c) => c.source?.term === timetable.term && !c.manual && !c.serverClassId)
    .map((c) => c.id)
    .join(',');
  const token = account?.token ?? null;

  useEffect(() => {
    const changed = state.current.token !== token;
    state.current.token = token;
    const run = async () => {
      let list = state.current.courses;
      let term = timetable.term;
      // 刚登录或刚打开 app：从服务器补回本机没有的班（换手机、网页版登录时课表就回来了），
      // 顺便对一下每学期第一周、拿到是不是管理员
      if (token && changed) {
        const me = await ref.current.me();
        const have = new Set(list.map((c) => c.serverClassId).filter(Boolean));
        const add = restoredCourses(me).filter((c) => !have.has(c.serverClassId));
        if (add.length) {
          restoreCourses(add);
          list = [...list, ...add];
        }
        const local = state.current.timetable.starts;
        const starts = { ...me.termStarts, ...local };
        // 本机还没选学期：选恢复回来的课最多的那个学期
        if (!term && list.length) {
          const count = new Map<string, number>();
          for (const c of list) if (c.source?.term) count.set(c.source.term, (count.get(c.source.term) ?? 0) + 1);
          term = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0];
        }
        setTimetable({ starts, ...(term && term !== timetable.term ? { term } : {}) });
        if (JSON.stringify(starts) !== JSON.stringify(me.termStarts)) await ref.current.saveTermStarts(starts).catch(() => {});
        startsReady.current = token;
        const a = state.current.account;
        if (a && a.token === token && a.admin !== me.isAdmin) setAccount({ ...a, admin: me.isAdmin });
      }
      list = changed || unlinked ? await ref.current.link(list, term, !!token) : list;
      await ref.current.sync(list);
    };
    run().catch(() => {});
  }, [token, unlinked, timetable.term]);

  // 打勾、与我无关、归档、改提醒：停手 1 秒后存到账号上。没网存不上的，下次有变化或回到前台时再存
  const pendingKey = homework
    .filter((h) => h.remote && h.markPending)
    .map((h) => `${h.id}@${h.markedAt?.getTime()}`)
    .join(',');
  const homeworkRef = useRef(homework);
  homeworkRef.current = homework;
  useEffect(() => {
    if (!token || !pendingKey) return;
    const t = setTimeout(() => ref.current.pushMarks(homeworkRef.current).catch(() => {}), 1000);
    return () => clearTimeout(t);
  }, [pendingKey, token]);

  // 本机改了某学期的第一周：存到账号上，别的设备登录也能用
  const startsKey = JSON.stringify(timetable.starts);
  useEffect(() => {
    if (!token || startsReady.current !== token) return;
    ref.current.saveTermStarts(timetable.starts).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startsKey, token]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        ref.current.sync(state.current.courses).catch(() => {});
        ref.current.pushMarks(homeworkRef.current).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : '出了点问题，稍后再试');
