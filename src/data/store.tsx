import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

import { mockCourses, mockHomework } from './mock';
import { Course, Homework, Profile, ReactionKey } from './types';

type NewHomework = Pick<Homework, 'courseId' | 'title' | 'detail' | 'due' | 'submit' | 'hasPhoto'>;
type NewCourse = Omit<Course, 'id' | 'hue' | 'members'>;

type StoreValue = {
  courses: Course[];
  homework: Homework[];
  profile: Profile;
  courseById: (id: string) => Course | undefined;
  toggleDone: (id: string) => void;
  toggleReaction: (id: string, key: ReactionKey) => void;
  addHomework: (h: NewHomework) => Homework;
  addCourse: (c: NewCourse) => { course: Course; matched: boolean };
  setProfile: (p: Partial<Profile>) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now()}-${seq++}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [courses, setCourses] = useState(mockCourses);
  const [homework, setHomework] = useState(mockHomework);
  const [profile, setProfileState] = useState<Profile>({ nickname: '游客', avatarHue: 0 });

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
      };
      setHomework((list) => [created, ...list]);
      return created;
    },
    [profile.nickname],
  );

  // 演示版匹配：时间和地点完全一样就算同一个教学班，不处理写法差异
  const addCourse = useCallback(
    (c: NewCourse) => {
      const s = c.sessions[0];
      const existing = courses.find((x) =>
        x.sessions.some(
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

  const setProfile = useCallback((p: Partial<Profile>) => setProfileState((prev) => ({ ...prev, ...p })), []);

  const value = useMemo(
    () => ({ courses, homework, profile, courseById, toggleDone, toggleReaction, addHomework, addCourse, setProfile }),
    [courses, homework, profile, courseById, toggleDone, toggleReaction, addHomework, addCourse, setProfile],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore 需要在 StoreProvider 里使用');
  return ctx;
}
