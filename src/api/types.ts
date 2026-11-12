// 后端返回的数据长什么样（和 homework-app-backend/server 里的接口对应）

export type UserRef = { id: number; nickname: string; avatar: string | null };

export type Tier = 'newbie' | 'member' | 'helper' | 'trusted';

export type RemoteState = 'pending' | 'confirmed' | 'disputed' | 'cancelled' | 'closed' | 'merged';

// 作业附件：图片、PDF、Word。url 是 /v1/files/… 这样的相对地址
export type RemoteAttachment = { id: string; name: string; mime: string; size: number; url: string };

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
  attachments: RemoteAttachment[];
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

export type ProposalKind = 'correct' | 'update' | 'duplicate' | 'unduplicate';

export type RemoteProposal = {
  id: number;
  homeworkId: number;
  kind: ProposalKind;
  // 提议改成什么：字段名用接口里的写法（title、due、dueKind、submit、cancel……）
  changes: Record<string, unknown> | null;
  targetId: number | null;
  reason: string;
  status: 'open' | 'applied' | 'rejected' | 'withdrawn' | 'expired';
  appliedVia: 'adopt' | 'vote' | null;
  proposer: UserRef;
  agree: number;
  disagree: number;
  threshold: number;
  myVote: boolean | null;
  createdAt: string;
};

// 改动记录里一个字段的"原 → 现"。字段名是数据库里的写法（due_kind、group_work、status……）
export type RemoteChange = {
  id: number;
  by: UserRef;
  proposalId: number | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  at: string;
};

export type RemoteDetail = RemoteHomework & {
  history: RemoteChange[];
  proposals: RemoteProposal[];
  mergedFrom: { id: number; title: string }[];
};

export type ChatMessage = {
  id: number;
  user: UserRef & { tier: Tier; tierName: string };
  text: string;
  homework: { id: number; title: string; due: string | null } | null;
  createdAt: string;
};

export type BoardRow = { user: UserRef; score: number; tier: Tier; tierName: string };
export type GlobalBoard = { top: { rank: number; user: UserRef; score: number }[]; me: { score: number; rank: number | null } | null };
