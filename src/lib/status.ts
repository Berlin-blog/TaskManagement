import type { Task, TaskStatus, AppSettings } from '../types';
import { addDaysISO, diffDaysISO, todayISO } from './date';

/** 实际生效的截止日期：修订时间优先，否则预估时间；仅返回真实日期 */
export function dueDate(task: Task): string | null {
  return task.revisedDate ?? task.estimatedDate ?? null;
}

/** 真正算“完成”的任务：取消的任务即使历史上有完成标记也不计入 */
export function isDone(task: Task): boolean {
  return task.status !== 'cancelled' && task.isCompleted;
}

/** 尚未完成且未取消 */
export function isOpen(task: Task): boolean {
  return task.status !== 'cancelled' && !task.isCompleted;
}

/** 延期标记：未完成 且 非取消 且 截止日期为真实日期且已过 */
export function isDelayed(task: Task): boolean {
  if (isDone(task) || task.status === 'cancelled') return false;
  const due = dueDate(task);
  if (!due) return false;
  return due < todayISO();
}

/** 逾期天数（仅延期任务 > 0） */
export function overdueDays(task: Task): number {
  if (!isDelayed(task)) return 0;
  const due = dueDate(task)!;
  return Math.max(1, diffDaysISO(due, todayISO()));
}

/** 距离截止日还有多少天：今天=0，未来为正，逾期为负；无日期或已结束返回 null */
export function daysUntilDue(task: Task): number | null {
  if (!isOpen(task)) return null;
  const due = dueDate(task);
  if (!due) return null;
  return diffDaysISO(todayISO(), due);
}

/** 近 N 天内到期（含今天，不含已延期） */
export function isDueInNextDays(task: Task, days = 7): boolean {
  if (!isOpen(task)) return false;
  const due = dueDate(task);
  if (!due) return false;
  const today = todayISO();
  return due >= today && due <= addDaysISO(today, days);
}

/** 今天到期 */
export function isDueToday(task: Task): boolean {
  return isOpen(task) && dueDate(task) === todayISO();
}

export type DueUrgency = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'normal' | 'none';

/** 截止紧急程度，用于统一颜色与提示 */
export function dueUrgency(task: Task): DueUrgency {
  const d = daysUntilDue(task);
  if (d == null) return 'none';
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d <= 7) return 'soon';
  return 'normal';
}

/** 卡片/列表上的截止提示文案 */
export function dueHint(task: Task): string | null {
  const d = daysUntilDue(task);
  if (d == null) return null;
  if (d < 0) return `逾期 ${-d} 天`;
  if (d === 0) return '今天到期';
  if (d === 1) return '明天到期';
  if (d <= 7) return `${d} 天后到期`;
  return null;
}

export const DUE_URGENCY_TEXT_CLASS: Record<DueUrgency, string> = {
  overdue: 'text-orange-600',
  today: 'text-orange-600',
  tomorrow: 'text-amber-600',
  soon: 'text-amber-600',
  normal: 'text-slate-400',
  none: 'text-slate-400',
};

export const DUE_URGENCY_DOT_CLASS: Record<DueUrgency, string> = {
  overdue: 'bg-orange-500',
  today: 'bg-orange-500',
  tomorrow: 'bg-amber-500',
  soon: 'bg-amber-400',
  normal: 'bg-slate-300',
  none: 'bg-slate-200',
};

/** 异常标记：已完成但没有完成时间 */
export function isAnomaly(task: Task): boolean {
  return isDone(task) && !task.completedAt;
}

/** 按截止日期范围筛选；range 为空表示不过滤 */
export function matchesDueRange(
  task: Task,
  range: string,
  from = '',
  to = '',
): boolean {
  if (!range) return true;
  const due = dueDate(task);
  if (range === 'none') return !due;
  if (!due) return false;
  if (range === 'overdue') return isDelayed(task);
  if (range === 'today') return isDueToday(task);
  if (range === 'next7') return isDueInNextDays(task, 7);
  if (range === 'custom') {
    if (!from && !to) return true;
    if (from && due < from) return false;
    if (to && due > to) return false;
    return true;
  }
  return true;
}

/** 综合展示状态（用于看板分列与徽标）：
 *  优先级：取消 > 已完成 > 延期(叠加未开始/进行中) > 未开始/进行中 */
export type DisplayStatus = TaskStatus | 'delayed';

export function displayStatus(task: Task): DisplayStatus {
  if (task.status === 'cancelled') return 'cancelled';
  if (isDone(task)) return 'completed';
  if (isDelayed(task)) return 'delayed';
  return task.status;
}

export const DISPLAY_STATUS_LABELS: Record<DisplayStatus, string> = {
  notStarted: '未开始',
  inProgress: '进行中',
  completed: '已完成',
  delayed: '延期',
  cancelled: '取消',
};

/** 状态徽标颜色 class（Tailwind） */
export const STATUS_BADGE_CLASS: Record<DisplayStatus, string> = {
  notStarted: 'bg-slate-100 text-slate-600 ring-slate-200',
  inProgress: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  delayed: 'bg-orange-50 text-orange-700 ring-orange-200',
  cancelled: 'bg-rose-50 text-rose-600 ring-rose-200',
};

/** 状态文字颜色：表格里用「圆点 + 文字」代替整块徽标，降低视觉噪音 */
export const STATUS_TEXT_CLASS: Record<DisplayStatus, string> = {
  notStarted: 'text-slate-500',
  inProgress: 'text-blue-600',
  completed: 'text-emerald-600',
  delayed: 'text-orange-600',
  cancelled: 'text-rose-500',
};

/** 状态圆点：与徽标颜色保持一致，供日历/看板/摘要使用 */
export const STATUS_DOT_CLASS: Record<DisplayStatus, string> = {
  notStarted: 'bg-slate-400',
  inProgress: 'bg-blue-500',
  completed: 'bg-emerald-500',
  delayed: 'bg-orange-500',
  cancelled: 'bg-rose-400',
};

/** 状态左侧色条 */
export const STATUS_BORDER_CLASS: Record<DisplayStatus, string> = {
  notStarted: 'border-l-slate-300',
  inProgress: 'border-l-blue-400',
  completed: 'border-l-emerald-400',
  delayed: 'border-l-orange-500',
  cancelled: 'border-l-rose-300',
};

/** P 徽标颜色 */
export function priorityBadgeClass(p: number): string {
  if (p === 1) return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (p === 2) return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

export function priorityLabel(p: number, settings?: AppSettings): string {
  const map = settings?.priorityMap ?? { 1: '高', 2: '中', 3: '低' };
  return map[p as 1 | 2 | 3] ?? String(p);
}

/** 完成率 */
export function completionRate(total: number, completed: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}
