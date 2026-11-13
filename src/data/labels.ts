// 提议、改动记录里用到的中文说法

import { formatDue, TBD_DUE } from './format';

export const PROPOSAL_KIND: Record<string, string> = {
  correct: '内容不对',
  update: '老师改了',
  duplicate: '重复了',
  unduplicate: '不是重复',
};

export const PROPOSAL_STATUS: Record<string, string> = {
  open: '投票中',
  applied: '已生效',
  rejected: '没通过',
  withdrawn: '已撤回',
  expired: '截止后自动结束',
};

// 接口字段和数据库字段两种写法都认
const FIELD: Record<string, string> = {
  title: '标题',
  detail: '要求',
  due: '截止时间',
  dueKind: '截止方式',
  due_kind: '截止方式',
  submit: '提交方式',
  source: '来源',
  optional: '选做',
  groupWork: '小组作业',
  group_work: '小组作业',
  cancel: '作业取消',
  status: '状态',
};

const DUE_KIND: Record<string, string> = { at: '具体时间', next_class: '下次课前', tbd: '待定' };
const STATUS: Record<string, string> = { active: '正常', cancelled: '已取消', merged: '已合并', deleted: '已删除' };

export const fieldName = (k: string) => FIELD[k] ?? k;

export function fieldValue(k: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return k === 'due' ? '待定' : '空';
  if (typeof v === 'boolean') return v ? '是' : '否';
  if (k === 'due' && typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) || d.getTime() === TBD_DUE.getTime() ? '待定' : formatDue(d);
  }
  if (k === 'dueKind' || k === 'due_kind') return DUE_KIND[String(v)] ?? String(v);
  if (k === 'status') return STATUS[String(v)] ?? String(v);
  return String(v);
}

// 班里的档位：分数决定，档位越高投票越有分量
export const TIER_NAMES = { newbie: '新同学', member: '同学', helper: '热心同学', trusted: '靠谱同学' } as const;
