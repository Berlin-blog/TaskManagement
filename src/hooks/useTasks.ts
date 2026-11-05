import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Task, AppSettings, Changelog, ImportLog } from '../types';
import { todayISO, parseDate } from '../lib/date';
import { uuid } from '../lib/utils';
import { sortWeekNames } from '../lib/weekSort';
import { toast } from '../components/ui';
import {
  fetchTasks,
  fetchWeekNames,
  fetchWeekStats,
  fetchSettings,
  fetchChangelogs,
  fetchImportLogs,
  createTaskRemote,
  bulkCreateTasksRemote,
  bulkUpsertTasksRemote,
  patchTaskRemote,
  setCompletedRemote,
  setTaskStatusRemote,
  deleteTaskRemote,
  copyTaskRemote,
  clearAllTasksRemote,
  updateSettingsRemote,
  generatePeriodicRemote,
  bulkCreateImportLogsRemote,
  restoreAttachmentsRemote,
  checkHealth,
  type UpsertResult,
} from '../db/api';
import { DISPLAY_STATUS_LABELS } from '../lib/status';
import type { TaskStatus } from '../types';

// ---------- 版本号 + 监听 ----------
let dataVersion = 0;
const listeners = new Set<() => void>();
function bump() {
  dataVersion++;
  listeners.forEach((fn) => fn());
}

/** 通用数据 hook：dataVersion 变化或写操作后重新拉取；轮询兜底 */
function useData<T>(loader: () => Promise<T>, deps: any[], intervalMs = 15000): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);
  const depsKey = JSON.stringify(deps);

  const load = useCallback(() => {
    loader().then(setData).catch((e) => console.error('load error:', e));
  }, [depsKey]); // eslint-disable-line

  useEffect(() => {
    load();
  }, [depsKey, dataVersion]); // eslint-disable-line

  useEffect(() => {
    const id = setInterval(load, intervalMs);
    return () => clearInterval(id);
  }, [load, intervalMs]);

  useEffect(() => {
    listeners.add(load);
    return () => { listeners.delete(load); };
  }, [load]);

  return data;
}

/** 写操作统一错误提示；成功后由调用方 bump */
async function guard<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    toast(`${label}：${message}`, { type: 'error', duration: 4500 });
    throw e;
  }
}

// ---------- 连接状态 ----------
export function useConnection(): 'ok' | 'down' | 'checking' {
  const [status, setStatus] = useState<'ok' | 'down' | 'checking'>('checking');
  useEffect(() => {
    let active = true;
    const check = () => {
      checkHealth().then((ok) => {
        if (active) setStatus(ok ? 'ok' : 'down');
      });
    };
    check();
    const id = setInterval(check, 15000);
    return () => { active = false; clearInterval(id); };
  }, []);
  return status;
}

// ---------- 查询 hooks ----------
/** 指定周任务（只拉当前周） */
export function useWeekTasks(weekName: string | null): Task[] | undefined {
  return useData(
    () => (weekName ? fetchTasks(weekName) : Promise.resolve([] as Task[])),
    [weekName],
  );
}

/** 全部任务；enabled=false 时不发请求 */
export function useAllTasks(enabled = true): Task[] | undefined {
  return useData(
    () => (enabled ? fetchTasks() : Promise.resolve([] as Task[])),
    [enabled],
  );
}

/** 所有周名（智能排序 + 自定义顺序） */
export function useWeekNames(): string[] | undefined {
  const raw = useData(() => fetchWeekNames(), []);
  const settings = useData(() => fetchSettings(), []);
  return useMemo(
    () => (raw ? sortWeekNames(raw, settings?.weekOrder) : undefined),
    [raw, settings?.weekOrder],
  );
}

/** 每周统计（周按钮进度条用） */
export function useWeekStats() {
  return useData(() => fetchWeekStats(), []);
}

/** settings */
export function useSettings(): AppSettings | undefined {
  return useData(() => fetchSettings(), []);
}

/** changelog */
export function useChangelogs(limit = 300) {
  return useData(() => fetchChangelogs(limit), [limit]);
}

/** import logs */
export function useImportLogs() {
  return useData(() => fetchImportLogs(), []);
}

// ---------- 写操作 ----------
/** 新增任务（序号由服务端分配） */
export async function addTask(task: Task): Promise<number> {
  const id = await guard('新增任务失败', () => createTaskRemote(task));
  bump();
  toast('已新增任务');
  return id;
}

/** 更新单个或多个字段；变更日志由服务端事务内写入 */
export async function updateTaskFields(
  id: number,
  patch: Partial<Task>,
  source: 'edit' | 'status' = 'edit',
): Promise<void> {
  await guard('保存失败', () => patchTaskRemote(id, { ...patch, source }));
  bump();
}

/** 兼容旧接口：单字段更新 */
export async function updateTaskField(
  id: number,
  field: keyof Task,
  newValue: unknown,
  source: 'edit' | 'status' = 'edit',
): Promise<void> {
  await updateTaskFields(id, { [field]: newValue } as Partial<Task>, source);
}

/** 合并日期编辑：一次请求同时更新 ISO + text */
export async function updateDateField(
  id: number,
  isoField: 'estimatedDate' | 'revisedDate' | 'completedAt',
  textField: 'estimatedDateText' | 'revisedDateText' | 'completedAtText',
  text: string,
): Promise<void> {
  const iso = parseDate(text);
  await updateTaskFields(id, { [isoField]: iso, [textField]: text } as Partial<Task>);
}

/** 标记完成/未完成 */
export async function setCompleted(id: number, completed: boolean): Promise<void> {
  await guard('更新完成状态失败', () => setCompletedRemote(id, completed));
  bump();
  toast(completed ? '已标记完成，完成时间已记录' : '已取消完成');
}

/** 统一状态流转（看板/表格共用） */
export async function setTaskStatus(id: number, status: TaskStatus, silent = false): Promise<void> {
  await guard('更新状态失败', () => setTaskStatusRemote(id, status));
  bump();
  if (!silent) toast(`状态已改为「${DISPLAY_STATUS_LABELS[status] ?? status}」`);
}

/** 批量完成/取消完成 */
export async function batchSetCompleted(ids: number[], completed: boolean): Promise<void> {
  if (ids.length === 0) return;
  await guard('批量更新失败', () => Promise.all(ids.map((id) => setCompletedRemote(id, completed))));
  bump();
  toast(`已${completed ? '完成' : '取消完成'} ${ids.length} 项`);
}

/** 批量移动到其他周 */
export async function batchMoveTasks(tasks: Task[], targetWeek: string): Promise<void> {
  const valid = tasks.filter((t) => t.id && t.weekName !== targetWeek);
  if (valid.length === 0) return;
  await guard('批量移动失败', async () => {
    for (const t of valid) {
      await patchTaskRemote(t.id!, { weekName: targetWeek, source: 'edit' });
    }
  });
  bump();
  toast(`已移动 ${valid.length} 项到「${targetWeek}」`);
}

/** 删除任务（8 秒内撤销；附件会随撤销一起恢复） */
export async function deleteTask(task: Task): Promise<void> {
  if (!task.id) return;
  const snapshot = { ...task };
  const info = await guard('删除失败', () => deleteTaskRemote(task.id!));
  bump();
  toast(`已删除「${task.title.slice(0, 12)}${task.title.length > 12 ? '…' : ''}」`, {
    label: '撤销',
    duration: 8000,
    onClick: async () => {
      try {
        const newId = await createTaskRemote({ ...snapshot, id: undefined, seq: 0 });
        const restored = info.attachmentIds.length
          ? await restoreAttachmentsRemote(info.attachmentIds, newId)
          : 0;
        bump();
        toast(restored > 0 ? `已恢复任务及 ${restored} 个留档文件` : '已恢复任务');
      } catch (e) {
        toast(`恢复失败：${(e as Error).message}`, { type: 'error' });
      }
    },
  });
}

/** 批量删除（8 秒内撤销；附件会随撤销一起恢复） */
export async function batchDeleteTasks(tasks: Task[]): Promise<void> {
  const valid = tasks.filter((t) => t.id);
  if (valid.length === 0) return;
  // 服务端删除是软删除附件，这里记下每个任务的附件 id 供撤销时挂回
  const removed = await guard('批量删除失败', async () => {
    const out: { snapshot: Task; attachmentIds: number[] }[] = [];
    for (const t of valid) {
      const info = await deleteTaskRemote(t.id!);
      out.push({ snapshot: { ...t }, attachmentIds: info.attachmentIds });
    }
    return out;
  });
  bump();
  toast(`已删除 ${valid.length} 项`, {
    label: '撤销',
    duration: 8000,
    onClick: async () => {
      try {
        let restored = 0;
        let attachments = 0;
        for (const item of removed) {
          const newId = await createTaskRemote({ ...item.snapshot, id: undefined, seq: 0 });
          if (item.attachmentIds.length) {
            attachments += await restoreAttachmentsRemote(item.attachmentIds, newId);
          }
          restored++;
        }
        bump();
        toast(attachments > 0
          ? `已恢复 ${restored} 项任务及 ${attachments} 个留档文件`
          : `已恢复 ${restored} 项任务`);
      } catch (e) {
        toast(`恢复失败：${(e as Error).message}`, { type: 'error' });
      }
    },
  });
}

/** 周期任务批量生成到目标周 */
export async function generatePeriodicTasks(targetWeek: string): Promise<{ count: number; skipped: number }> {
  const r = await guard('生成周期任务失败', () => generatePeriodicRemote(targetWeek));
  bump();
  if (r.count === 0 && r.skipped === 0) {
    toast('没有已标记的周期任务（可在任务上勾选“周期”）');
  } else if (r.count === 0) {
    toast(`该周已存在全部 ${r.skipped} 项周期任务，无需生成`);
  } else {
    toast(`已生成 ${r.count} 项周期任务${r.skipped ? `，跳过已存在 ${r.skipped} 项` : ''}`);
  }
  return r;
}

/** 复制任务到新一周 */
export async function copyTaskToWeek(id: number, targetWeek: string): Promise<void> {
  await guard('复制失败', () => copyTaskRemote(id, targetWeek));
  bump();
  toast(`已复制到「${targetWeek}」`);
}

/** 清空全部数据 */
export async function clearAllData(): Promise<void> {
  await guard('清空失败', () => clearAllTasksRemote());
  bump();
  toast('已清空任务、日志与附件');
}

/** 保存设置 */
export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  await guard('保存设置失败', () => updateSettingsRemote(patch));
  bump();
  toast('设置已保存');
}

/** 批量导入任务（追加） */
export async function bulkAddTasks(tasks: Task[]): Promise<number> {
  const count = await guard('导入失败', () => bulkCreateTasksRemote(tasks));
  bump();
  return count;
}

/** 批量合并导入（同周同名更新，不重复新增） */
export async function bulkUpsertTasks(tasks: Task[]): Promise<UpsertResult> {
  const result = await guard('导入失败', () => bulkUpsertTasksRemote(tasks));
  bump();
  return result;
}

/** 批量导入历史日志 */
export async function bulkAddImportLogs(logs: ImportLog[]): Promise<void> {
  await guard('导入历史日志失败', () => bulkCreateImportLogsRemote(logs));
  bump();
}

export { uuid, todayISO };
