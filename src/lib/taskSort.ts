import type { Task } from '../types';
import { dueDate, isDelayed, isDone } from './status';

/**
 * smart = 未完成优先（默认）
 * 其余为表头可点击的显式排序
 */
export type SortKey = 'smart' | 'seq' | 'priority' | 'estimatedDate' | 'completedAt';

export const SORT_LABELS: Record<SortKey, string> = {
  smart: '未完成优先',
  seq: '序号',
  priority: '优先级',
  estimatedDate: '截止日期',
  completedAt: '完成时间',
};

const EMPTY = '\uFFFF';

function compareWithEmpty(a: string, b: string, desc: boolean): number {
  const ae = !a || a === EMPTY;
  const be = !b || b === EMPTY;
  if (ae && be) return 0;
  // 空日期永远排在最后，不随升/降序翻转
  if (ae) return 1;
  if (be) return -1;
  return desc ? b.localeCompare(a) : a.localeCompare(b);
}

/** 任务所处阶段：0 待办、1 已完成、2 已取消 */
function stageRank(task: Task): number {
  if (task.status === 'cancelled') return 2;
  if (isDone(task)) return 1;
  return 0;
}

/** 待办内部的紧急度：0 已延期、1 有截止日、2 没有截止日 */
function dueBucket(task: Task): number {
  const due = dueDate(task);
  if (!due) return 2;
  return isDelayed(task) ? 0 : 1;
}

function byWeekThenSeq(a: Task, b: Task, weekIndex: Map<string, number> | null): number {
  if (weekIndex) {
    const ai = weekIndex.get(a.weekName) ?? 9999;
    const bi = weekIndex.get(b.weekName) ?? 9999;
    if (ai !== bi) return ai - bi;
  }
  const seqDiff = a.seq - b.seq;
  if (seqDiff !== 0) return seqDiff;
  return (a.id ?? 0) - (b.id ?? 0);
}

function compareSmart(a: Task, b: Task, weekIndex: Map<string, number> | null): number {
  const stageDiff = stageRank(a) - stageRank(b);
  if (stageDiff !== 0) return stageDiff;

  if (stageRank(a) === 0) {
    // 待办：延期 → 有截止日期（越早越前）→ 无日期；同日期按优先级
    const bucketDiff = dueBucket(a) - dueBucket(b);
    if (bucketDiff !== 0) return bucketDiff;

    const da = dueDate(a) ?? '';
    const db = dueDate(b) ?? '';
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -1 : 1;
    }
    if (a.priority !== b.priority) return a.priority - b.priority;
  } else if (isDone(a) && isDone(b)) {
    // 已完成：最近完成的在前
    const ca = a.completedAt ?? '';
    const cb = b.completedAt ?? '';
    if (ca !== cb) {
      if (!ca) return 1;
      if (!cb) return -1;
      return ca < cb ? 1 : -1;
    }
  }

  return byWeekThenSeq(a, b, weekIndex);
}

/** 全量排序：Tasks 页先排序再分页，避免只排当前页 */
export function sortTasks(tasks: Task[], key: SortKey, desc: boolean, weekOrder?: string[]): Task[] {
  const weekIndex = weekOrder && weekOrder.length
    ? new Map(weekOrder.map((w, i) => [w, i]))
    : null;

  return [...tasks].sort((a, b) => {
    if (key === 'smart') return compareSmart(a, b, weekIndex);

    // “全部任务”默认按周分组，而不是把各周的 1、2、3 号混在一起
    if (weekIndex && key === 'seq') {
      const ai = weekIndex.get(a.weekName) ?? 9999;
      const bi = weekIndex.get(b.weekName) ?? 9999;
      if (ai !== bi) return ai - bi;
    }
    let result = 0;
    if (key === 'seq') result = a.seq - b.seq;
    else if (key === 'priority') result = a.priority - b.priority;
    else if (key === 'estimatedDate') {
      result = compareWithEmpty(dueDate(a) ?? '', dueDate(b) ?? '', desc);
    } else if (key === 'completedAt') {
      result = compareWithEmpty(a.completedAt ?? '', b.completedAt ?? '', desc);
    }
    if (result !== 0) return desc && (key === 'seq' || key === 'priority') ? -result : result;
    // 稳定的第二排序键
    return byWeekThenSeq(a, b, null);
  });
}
