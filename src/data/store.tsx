import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { mockCourses, mockHomework } from './mock';
import { Course, Homework, Profile, ReactionKey, Reminder, Settings, TimetableSettings } from './types';
import { mergeImportedCourses, migrateCourse } from './schedule';
import { createPersistence } from './persistence';

export type NewHomework = Pick<Homework, 'courseId' | 'title' | 'detail' | 'due' | 'submit' | 'hasPhoto'>;
export type NewCourse = Omit<Course, 'id' | 'hue' | 'members'>;

type StoreValue = {
  courses: Course[];
  homework: Homework[];
  profile: Profile;
  settings: Settings;
  timetable: TimetableSettings;
  setTimetable: (s: Partial<TimetableSettings>) => void;
  importCourses: (courses: Course[], term: string, start?: string) => Promise<{ added: number; updated: number; undo: () => void }>;
  courseById: (id: string) => Course | undefined;
  toggleDone: (id: string) => void;
  toggleReaction: (id: string, key: ReactionKey) => void;
  // 传 undefined 表示恢复默认提醒
  setReminders: (id: string, reminders: Reminder[] | undefined) => void;
  addHomework: (h: NewHomework) => Homework;
  updateHomework: (id: string, h: NewHomework) => void;
  // 删除后返回被删的那条，方便"撤销"时放回去
  removeHomework: (id: string) => Homework | undefined;
  restoreHomework: (h: Homework) => void;
  addCourse: (c: NewCourse) => { course: Course; matched: boolean };
  updateCourse: (id: string, c: NewCourse) => void;
  // 删课时这门课的作业也一起删掉；返回被删的内容，方便撤销
  removeCourse: (id: string) => { course: Course; homework: Homework[] } | undefined;
  restoreCourse: (removed: { course: Course; homework: Homework[] }) => void;
  setProfile: (p: Partial<Profile>) => void;
  setSettings: (s: Partial<Settings>) => void;
  // 清掉手机上保存的数据，回到演示数据
  resetDemo: () => void;
};

const STORE_KEY = 'store.v1';

const defaultProfile: Profile = { nickname: '游客', avatarHue: 0 };
const defaultSettings: Settings = { remindDay: true, remindHours: true, quietNight: true };

type Saved = { courses: Course[]; homework: Homework[]; profile: Profile; settings: Settings; timetable: TimetableSettings };

// 存的时候日期会变成 "2026-11-06T15:59:00.000Z" 这样的文字，读回来时再变回日期
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const reviveDates = (_key: string, value: unknown) =>
  typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value;

const StoreContext = createContext<StoreValue | null>(null);

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now()}-${seq++}`;

// 所有数据都放在这里；每次改动后自动存到手机上，下次打开接着用
export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [courses, setCourses] = useState<Course[]>(() => mockCourses.map(migrateCourse));
  const [homework, setHomework] = useState<Homework[]>(mockHomework);
  const [profile, setProfileState] = useState<Profile>(defaultProfile);
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);
  const [timetable, setTimetableState] = useState<TimetableSettings>({ starts: {} });
  const homeworkRef = useRef(homework);
  useLayoutEffect(() => { homeworkRef.current = homework; }, [homework]);
  const persistence = useMemo(() => createPersistence(AsyncStorage, STORE_KEY), []);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 打开 app 时先读出上次保存的数据；第一次打开没有保存过，就用演示数据
  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw, reviveDates) as Partial<Saved>;
        if (saved.courses) setCourses(saved.courses.map(migrateCourse));
        if (saved.homework) setHomework(saved.homework);
        if (saved.profile) setProfileState({ ...defaultProfile, ...saved.profile });
        if (saved.settings) setSettingsState({ ...defaultSettings, ...saved.settings });
        if (saved.timetable) setTimetableState({ ...saved.timetable, starts: saved.timetable.starts ?? {} });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // 数据一变就存；连续改动时等 300 毫秒停下来再存一次
  useEffect(() => {
    if (!ready) return;
    saveTimer.current = setTimeout(() => {
      const data: Saved = { courses, homework, profile, settings, timetable };
      persistence.save(JSON.stringify(data)).catch(() => {});
    }, 300);
    return () => clearTimeout(saveTimer.current);
  }, [ready, courses, homework, profile, settings, timetable, persistence]);

  const courseById = useCallback((id: string) => courses.find((c) => c.id === id), [courses]);

  const toggleDone = useCallback((id: string) => {
    setHomework((list) => list.map((h) => (h.id === id ? { ...h, done: !h.done } : h)));
  }, []);

  const toggleReaction = useCallback((id: string, key: ReactionKey) => {
    setHomework((list) =>
      list.map((h) => {
        if (h.id !== id) return h;
        const mine = h.myReactions.includes(key);
        return {
          ...h,
          reactions: { ...h.reactions, [key]: h.reactions[key] + (mine ? -1 : 1) },
          myReactions: mine ? h.myReactions.filter((k) => k !== key) : [...h.myReactions, key],
        };
      }),
    );
  }, []);

  const setReminders = useCallback((id: string, reminders: Reminder[] | undefined) => {
    setHomework((list) => list.map((h) => (h.id === id ? { ...h, reminders } : h)));
  }, []);

  const addHomework = useCallback(
    (h: NewHomework) => {
      const created: Homework = {
        ...h,
        id: newId('h'),
        uploader: profile.nickname,
        uploadedAt: new Date(),
        reactions: { confirm: 1, thumbs: 0, cry: 0 },
        myReactions: ['confirm'],
        done: false,
        mine: true,
      };
      setHomework((list) => [created, ...list]);
      return created;
    },
    [profile.nickname],
  );

  const updateHomework = useCallback((id: string, h: NewHomework) => {
    setHomework((list) => list.map((x) => (x.id === id ? { ...x, ...h } : x)));
  }, []);

  const removeHomework = useCallback(
    (id: string) => {
      const removed = homework.find((h) => h.id === id);
      setHomework((list) => list.filter((h) => h.id !== id));
      return removed;
    },
    [homework],
  );

  const restoreHomework = useCallback((h: Homework) => {
    setHomework((list) => (list.some((x) => x.id === h.id) ? list : [h, ...list]));
  }, []);

  // 演示版匹配：时间和地点完全一样就算同一个教学班，不处理写法差异
  const addCourse = useCallback(
    (c: NewCourse) => {
      const s = c.sessions[0];
      const existing = courses.find((x) =>
        !x.source && x.name === c.name && x.teacher === c.teacher && x.sessions.some(
          (y) => y.weekday === s.weekday && y.from === s.from && y.location.toLowerCase() === s.location.toLowerCase(),
        ),
      );
      if (existing) return { course: existing, matched: true };
      const course: Course = { ...c, id: newId('c'), hue: courses.length % 5, members: 1 };
      setCourses((list) => [...list, course]);
      return { course, matched: false };
    },
    [courses],
  );

  const updateCourse = useCallback((id: string, c: NewCourse) => {
    setCourses((list) => list.map((x) => (x.id === id ? { ...x, ...c } : x)));
  }, []);

  const removeCourse = useCallback(
    (id: string) => {
      const course = courses.find((c) => c.id === id);
      if (!course) return undefined;
      const related = homework.filter((h) => h.courseId === id);
      setCourses((list) => list.filter((c) => c.id !== id));
      setHomework((list) => list.filter((h) => h.courseId !== id));
      return { course, homework: related };
    },
    [courses, homework],
  );

  const restoreCourse = useCallback((removed: { course: Course; homework: Homework[] }) => {
    setCourses((list) => (list.some((c) => c.id === removed.course.id) ? list : [...list, removed.course]));
    setHomework((list) => [...removed.homework.filter((h) => !list.some((x) => x.id === h.id)), ...list]);
  }, []);

  const setProfile = useCallback((p: Partial<Profile>) => setProfileState((prev) => ({ ...prev, ...p })), []);
  const setSettings = useCallback((s: Partial<Settings>) => setSettingsState((prev) => ({ ...prev, ...s })), []);
  const setTimetable = useCallback((s: Partial<TimetableSettings>) => setTimetableState((prev) => ({ ...prev, ...s })), []);

  const importCourses = useCallback(async (incoming: Course[], term: string, start?: string) => {
    const result = mergeImportedCourses(courses, incoming);
    const before = timetable;
    const next = { term, starts: start ? { ...timetable.starts, [term]: start } : timetable.starts };
    // 导入先可靠保存再更新界面。失败时保留预览和原课表，允许直接重试。
    clearTimeout(saveTimer.current);
    const saved: Saved = { courses: result.courses, homework, profile, settings, timetable: next };
    await persistence.save(JSON.stringify(saved));
    setCourses(result.courses);
    setTimetableState(next);
    let undone = false;
    return {
      added: result.added.length,
      updated: result.previous.length,
      undo: () => {
        if (undone) return;
        undone = true;
        // 只撤销这一次导入；之后新建的作业或其他课程不会被旧快照覆盖。
        setCourses((list) => list.flatMap((c) => {
          if (!result.applied.includes(c)) return [c];
          if (result.added.includes(c.id)) return homeworkRef.current.some((h) => h.courseId === c.id) ? [c] : [];
          return [result.previous.find((old) => old.id === c.id) ?? c];
        }));
        setTimetableState((current) => current === next ? before : current);
      },
    };
  }, [courses, timetable, homework, profile, settings, persistence]);

  const resetDemo = useCallback(() => {
    setCourses(mockCourses.map(migrateCourse));
    setHomework(mockHomework);
    setProfileState(defaultProfile);
    setSettingsState(defaultSettings);
    setTimetableState({ starts: {} });
  }, []);

  const value = useMemo(
    () => ({
      courses,
      homework,
      profile,
      settings,
      timetable,
      setTimetable,
      importCourses,
      courseById,
      toggleDone,
      toggleReaction,
      setReminders,
      addHomework,
      updateHomework,
      removeHomework,
      restoreHomework,
      addCourse,
      updateCourse,
      removeCourse,
      restoreCourse,
      setProfile,
      setSettings,
      resetDemo,
    }),
    [
      courses,
      homework,
      profile,
      settings,
      timetable,
      setTimetable,
      importCourses,
      courseById,
      toggleDone,
      toggleReaction,
      setReminders,
      addHomework,
      updateHomework,
      removeHomework,
      restoreHomework,
      addCourse,
      updateCourse,
      removeCourse,
      restoreCourse,
      setProfile,
      setSettings,
      resetDemo,
    ],
  );

  // 读完保存的数据之前先不画界面，免得先闪一下演示数据
  if (!ready) return null;

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore 需要在 StoreProvider 里使用');
  return ctx;
}
