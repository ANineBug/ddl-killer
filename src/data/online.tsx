import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { api, ApiError } from '@/api/client';
import type { BoardRow, ChatMessage, GlobalBoard, Me, ProposalKind, RemoteAttachment, RemoteClass, RemoteDetail, RemoteHomework, UserRef } from '@/api/types';

import { courseForServer, courseFromClass, fromRemote, localHomeworkId } from './remote';
import { useStore } from './store';
import type { Course, Homework } from './types';

// 所有要连服务器的操作都在这里。界面只管调用，出错时抛 ApiError，message 可以直接给用户看

export function useOnline() {
  const { account, setAccount, linkCourses, replaceRemote, upsertRemote, addJoinedCourse, removeHomework, courses, timetable, setTimetable, setProfile } = useStore();

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
    },
    [replaceRemote],
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
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setAccount(null);
  }, [setAccount]);

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

  return { loggedIn: !!account, account, link, sync, refresh, requestCode, login, register, resetPassword, logout, rename, feedback, me, upload, edit, remove, attach, detach, reload, react, detail, propose, vote, adopt, withdraw, voteDuplicate, messages, send, classBoard, globalBoard, setAvatar, leave, search, join };
}

export { ApiError, localHomeworkId };

// 后台同步：打开 app、登录或退出、导入了新课表、回到前台时，自动和服务器对一遍
export function OnlineSync() {
  const { courses, timetable, account } = useStore();
  const online = useOnline();
  const ref = useRef(online);
  ref.current = online;
  const state = useRef({ token: undefined as string | null | undefined, courses });
  state.current.courses = courses;

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
      const list = changed || unlinked ? await ref.current.link(state.current.courses, timetable.term, !!token) : state.current.courses;
      await ref.current.sync(list);
    };
    run().catch(() => {});
  }, [token, unlinked, timetable.term]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') ref.current.sync(state.current.courses).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  return null;
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : '出了点问题，稍后再试');
