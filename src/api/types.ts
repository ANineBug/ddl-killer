// 后端返回的数据长什么样（和 homework-app-backend/server 里的接口对应）

export type UserRef = { id: number; nickname: string; avatar: string | null };

export type Tier = 'newbie' | 'member' | 'helper' | 'trusted';

export type RemoteState = 'pending' | 'confirmed' | 'disputed' | 'cancelled' | 'closed' | 'merged';

export type RemoteHomework = {
  id: number;
  classId: number;
  title: string;
  detail: string;
  dueKind: 'at' | 'next_class' | 'tbd';
  due: string | null;
  earliestDue: string | null;
  submit: string;
  source: string;
  optional: boolean;
  groupWork: boolean;
  state: RemoteState;
  postponed: boolean;
  mergedInto: number | null;
  version: number;
  remindReady: boolean;
  uploader: UserRef;
  uploaderCount: number;
  confirms: { current: number; old: number };
  reactions: { thumbs: number; cry: number };
  openProposals: number;
  possibleDuplicates: number[];
  createdAt: string;
  updatedAt: string;
  me: { isUploader: boolean; confirmed: 'current' | 'old' | null; reactions: string[] } | null;
};

export type RemoteSlot = { weekday: number; from: number; to: number; room: string; weeks: number[] };

export type RemoteClass = {
  id: number;
  term: string;
  name: string;
  teacher: string;
  members: number;
  slots: RemoteSlot[];
};

export type MyClass = RemoteClass & { via: 'import' | 'manual'; myTier: Tier; myScore: number };

export type Me = UserRef & { classes: MyClass[] };
