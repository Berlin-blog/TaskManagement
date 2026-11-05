import type { Task, AppSettings, Changelog, ImportLog } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const BASE = '/api';

async function http<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) {
    let message = '';
    try {
      const body = await r.json();
      message = body?.error || '';
    } catch {
      try { message = await r.text(); } catch { /* ignore */ }
    }
    throw new Error(message || `请求失败（${r.status}）`);
  }
  return r.json() as Promise<T>;
}

// ---------- Settings ----------
export async function fetchSettings(): Promise<AppSettings> {
  const s = await http<AppSettings | null>('/settings');
  return s
    ? { ...DEFAULT_SETTINGS, ...s, priorityMap: { ...DEFAULT_SETTINGS.priorityMap, ...s.priorityMap } }
    : DEFAULT_SETTINGS;
}

export async function updateSettingsRemote(patch: Partial<AppSettings>): Promise<void> {
  await http('/settings', { method: 'PUT', body: JSON.stringify(patch) });
}

// ---------- Tasks ----------
export async function fetchTasks(week?: string): Promise<Task[]> {
  const q = week ? `?week=${encodeURIComponent(week)}` : '';
  return http<Task[]>(`/tasks${q}`);
}

export async function fetchWeekNames(): Promise<string[]> {
  return http<string[]>('/tasks/weeks');
}

export interface WeekStat { week: string; total: number; completed: number }

export async function fetchWeekStats(): Promise<WeekStat[]> {
  return http<WeekStat[]>('/tasks/week-stats');
}

// ---------- 附件（任务留档） ----------
export interface Attachment {
  id: number;
  taskId: number;
  originalName: string;
  storedName: string;
  size: number;
  uploadedAt: number;
}

export async function fetchAttachments(taskId: number): Promise<Attachment[]> {
  return http<Attachment[]>(`/tasks/${taskId}/attachments`);
}

export async function uploadAttachments(taskId: number, files: File[]): Promise<number> {
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  const r = await fetch(`${BASE}/tasks/${taskId}/attachments`, { method: 'POST', body: fd });
  if (!r.ok) {
    let message = '';
    try { message = (await r.json())?.error || ''; } catch { /* ignore */ }
    throw new Error(message || '上传失败');
  }
  const j = await r.json();
  return j.count;
}

/** 附件空间用量（仅统计未删除的附件） */
export interface StorageUsage {
  used: number;
  count: number;
  quota: number;
  quotaMb: number;
  usedMb: number;
}

export async function fetchStorage(): Promise<StorageUsage> {
  return http<StorageUsage>('/attachments/storage');
}

/** 撤销删除任务后，把软删除的附件挂回重建的任务 */
export async function restoreAttachmentsRemote(ids: number[], taskId: number): Promise<number> {
  if (ids.length === 0) return 0;
  const r = await http<{ count: number }>('/attachments/restore', {
    method: 'POST',
    body: JSON.stringify({ ids, taskId }),
  });
  return r.count;
}

export function attachmentDownloadUrl(attId: number): string {
  return `${BASE}/attachments/${attId}/download`;
}

export async function deleteAttachmentRemote(attId: number): Promise<void> {
  await http(`/attachments/${attId}`, { method: 'DELETE' });
}

export async function createTaskRemote(t: Task): Promise<number> {
  const r = await http<{ id: number }>('/tasks', { method: 'POST', body: JSON.stringify(t) });
  return r.id;
}

export async function bulkCreateTasksRemote(tasks: Task[]): Promise<number> {
  const r = await http<{ count: number }>('/tasks/bulk', { method: 'POST', body: JSON.stringify(tasks) });
  return r.count;
}

export interface UpsertResult { added: number; updated: number; logged?: number }

export async function bulkUpsertTasksRemote(tasks: Task[]): Promise<UpsertResult> {
  return http<UpsertResult>('/tasks/bulk-upsert', { method: 'POST', body: JSON.stringify(tasks) });
}

export async function patchTaskRemote(id: number, patch: Partial<Task> & { source?: string }): Promise<Record<string, any>> {
  const r = await http<{ ok: boolean; oldValues: Record<string, any> }>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return r.oldValues ?? {};
}

export async function checkHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`);
    if (!r.ok) return false;
    const j = await r.json();
    return j.ok === true;
  } catch {
    return false;
  }
}

export async function setCompletedRemote(id: number, completed: boolean): Promise<void> {
  await http(`/tasks/${id}/complete`, { method: 'POST', body: JSON.stringify({ completed }) });
}

export async function setTaskStatusRemote(id: number, status: string): Promise<void> {
  await http(`/tasks/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
}

export interface DeletedTaskInfo {
  attachmentIds: number[];
  weekName: string;
}

export async function deleteTaskRemote(id: number): Promise<DeletedTaskInfo> {
  const r = await http<{ ok: boolean } & DeletedTaskInfo>(`/tasks/${id}`, { method: 'DELETE' });
  return { attachmentIds: r.attachmentIds ?? [], weekName: r.weekName ?? '' };
}

export async function copyTaskRemote(id: number, targetWeek: string): Promise<void> {
  await http(`/tasks/${id}/copy`, { method: 'POST', body: JSON.stringify({ targetWeek }) });
}

export async function generatePeriodicRemote(targetWeek: string): Promise<{ count: number; skipped: number }> {
  return http<{ count: number; skipped: number }>('/tasks/generate-periodic', {
    method: 'POST',
    body: JSON.stringify({ targetWeek }),
  });
}

export async function clearAllTasksRemote(): Promise<void> {
  await http('/tasks/clear', { method: 'POST' });
}

// ---------- Changelogs ----------
export async function fetchChangelogs(limit = 300): Promise<Changelog[]> {
  return http<Changelog[]>(`/changelogs?limit=${limit}`);
}

// ---------- Import logs ----------
export async function fetchImportLogs(): Promise<ImportLog[]> {
  return http<ImportLog[]>('/import-logs');
}

export async function bulkCreateImportLogsRemote(logs: ImportLog[]): Promise<void> {
  await http('/import-logs/bulk', { method: 'POST', body: JSON.stringify(logs) });
}
