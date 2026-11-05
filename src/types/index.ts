export type Priority = 1 | 2 | 3; // 1高 2中 3低

export type TaskStatus = 'notStarted' | 'inProgress' | 'completed' | 'cancelled';

export interface Task {
  id?: number;
  uid: string;
  weekName: string;
  seq: number;
  title: string;
  requester: string;
  priority: Priority;
  attachmentCount: number;
  estimatedDate: string | null;
  estimatedDateText: string;
  revisedDate: string | null;
  revisedDateText: string;
  isSpecialDate: boolean;
  specialDateText?: string;
  isCompleted: boolean;
  completedAt: string | null;
  completedAtText: string;
  remark: string;
  status: TaskStatus;
  isPeriodic: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Changelog {
  id?: number;
  taskId: number;
  taskTitle?: string;
  weekName: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedAt: number;
  source: 'edit' | 'import' | 'status';
}

export interface ImportLog {
  id?: number;
  updatedAt: string;
  version: string;
  relatedSheet: string | null;
  importedAt: number;
}

export interface AppSettings {
  id: string; // 固定 'app'
  weekStart: 1; // 1=周一
  priorityMap: Record<Priority, string>;
  specialTexts: string[];
  periodicKeywords: string[];
  weekOrder: string[]; // 自定义周顺序；空 = 智能排序
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  weekStart: 1,
  priorityMap: { 1: '高', 2: '中', 3: '低' },
  specialTexts: ['持续', '待定', '空'],
  periodicKeywords: ['周报', '动销金额', '周日更新', '周一更新', '周五更新'],
  weekOrder: [],
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  notStarted: '未开始',
  inProgress: '进行中',
  completed: '已完成',
  cancelled: '取消',
};
