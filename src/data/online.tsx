import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { api, ApiError } from '@/api/client';
import type { Me, RemoteClass, RemoteHomework, UserRef } from '@/api/types';

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

  const requestCode = useCallback((email: string) => api('/auth/code', { method: 'POST', body: { email } }), []);

  const login = useCallback(
    async (email: string, code: string) => {
      const res = await api<{ token: string; created: boolean; user: UserRef }>('/auth/verify', { method: 'POST', body: { email, code } });
      setAccount({ token: res.token, user: res.user });
      setProfile({ nickname: res.user.nickname });
      return res;
    },
    [setAccount, setProfile],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setAccount(null);
  }, [setAccount]);

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
    async (classId: number, data: { title: string; detail: string; due: Date | null; submit: string; source: string }) => {
      const r = await api<RemoteHomework>(`/classes/${classId}/homework`, {
        method: 'POST',
        body: { ...data, dueKind: data.due ? 'at' : 'tbd', due: data.due?.toISOString() },
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

  // ---------- 教学班 ----------

  const search = useCallback((term: string, q: string) => api<{ classes: RemoteClass[] }>(`/classes/search?term=${encodeURIComponent(term)}&q=${encodeURIComponent(q)}`), []);

  // 加入：登录了在服务器上加入（时间冲突会被拒绝）；游客只加进自己的课表，能看作业
  const join = useCallback(
    async (c: RemoteClass) => {
      if (account) await api(`/classes/${c.id}/join`, { method: 'POST' });
      const course = { ...courseFromClass(c, `j${c.id}`, 0), manual: true };
      addJoinedCourse(course);
      // 课表一次只显示一个学期；还没选过学期（一直在看演示课表）时，切到这个班的学期，刚加的课才看得到
      if (!timetable.term) setTimetable({ term: c.term });
      await sync([course]);
    },
    [account, addJoinedCourse, sync, timetable.term, setTimetable],
  );

  return { loggedIn: !!account, account, link, sync, refresh, requestCode, login, logout, rename, me, upload, edit, remove, react, search, join };
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
