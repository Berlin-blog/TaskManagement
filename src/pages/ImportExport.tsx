import { useState, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  useAllTasks, useSettings, useWeekNames, useImportLogs,
  bulkAddTasks, bulkUpsertTasks, bulkAddImportLogs, clearAllData,
} from '../hooks/useTasks';
import {
  Card, CardTitle, Button, Badge, EmptyState, toast, confirmAction, PageHeader,
} from '../components/ui';
import { Icon } from '../components/icons';
import { parseWorkbook, exportWeekXlsx, exportAllXlsx, exportAllCsv, downloadBlob } from '../lib/excel';
import { displayWeekName } from '../lib/weekSort';
import { DEFAULT_SETTINGS } from '../types';
import type { Task } from '../types';

const BACKUP_KEY = 'taskLastBackupAt';
const STEPS = ['选择文件', '预览', '确认导入', '完成'];

function recordBackup() {
  localStorage.setItem(BACKUP_KEY, String(Date.now()));
}

function BackupHint() {
  const last = useMemo(() => Number(localStorage.getItem(BACKUP_KEY) || 0), []);
  if (!last) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <span>💾</span>
        <p className="text-xs leading-relaxed text-amber-700">尚未备份过。数据虽存于 MySQL，建议定期导出一份 xlsx 作为离线备份。</p>
      </div>
    );
  }
  const days = Math.floor((Date.now() - last) / 86400000);
  if (days >= 7) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
        <Icon name="alert" className="h-4 w-4 text-orange-600" />
        <p className="text-xs leading-relaxed text-orange-700">距上次备份已 <b>{days} 天</b>，建议导出一份 xlsx 备份。</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5">
      <Icon name="check" className="h-4 w-4 text-emerald-600" />
      <p className="text-xs leading-relaxed text-emerald-700">上次备份：{days === 0 ? '今天' : `${days} 天前`}，状态良好。</p>
    </div>
  );
}

interface Preview {
  weekNames: string[];
  taskCount: number;
  logCount: number;
  errors: string[];
  tasks: Task[];
  logs: { updatedAt: string; version: string; relatedSheet: string | null; importedAt: number }[];
  added: number;
  updated: number;
  samples: Task[];
  fileName: string;
}

interface Completed {
  mode: 'merge' | 'replace';
  taskCount: number;
  added: number;
  updated: number;
  logCount: number;
}

const taskKey = (t: Task) => `${t.weekName}\u0000${t.title}`;

export default function ImportExport() {
  const tasks = useAllTasks();
  const settings = useSettings();
  const weekNames = useWeekNames();
  const importLogs = useImportLogs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [dragging, setDragging] = useState(false);

  const step = importing ? 2 : completed ? 3 : preview ? 1 : 0;

  const resetImport = () => {
    setPreview(null);
    setCompleted(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFile = async (file: File) => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      toast('请选择 .xlsx 或 .xls 文件', { type: 'error' });
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      toast('文件超过 30MB，建议拆分后再导入', { type: 'error' });
      return;
    }
    try {
      const s = settings ?? DEFAULT_SETTINGS;
      const buf = await file.arrayBuffer();
      const res = parseWorkbook(buf, s);
      const existing = new Set((tasks ?? []).map(taskKey));
      let added = 0;
      let updated = 0;
      for (const t of res.tasks) {
        if (existing.has(taskKey(t))) updated++;
        else { added++; existing.add(taskKey(t)); }
      }
      setPreview({
        weekNames: res.weekNames,
        taskCount: res.tasks.length,
        logCount: res.importLogs.length,
        errors: res.errors,
        tasks: res.tasks,
        logs: res.importLogs,
        added,
        updated,
        samples: res.tasks.slice(0, 6),
        fileName: file.name,
      });
      setCompleted(null);
      toast(`已解析 ${res.tasks.length} 条任务，请确认后导入`);
    } catch (e) {
      toast(`解析失败：${(e as Error).message}`, { type: 'error' });
    }
  };

  const doImport = async () => {
    if (!preview) return;
    if (mode === 'replace') {
      const ok = await confirmAction({
        title: '覆盖导入',
        message: '将清空现有全部任务、变更日志、导入历史与附件，然后导入新文件。\n此操作不可恢复，确定继续？',
        confirmText: '清空并导入',
        danger: true,
      });
      if (!ok) return;
    }
    setImporting(true);
    try {
      if (mode === 'replace') {
        await clearAllData();
        await bulkAddTasks(preview.tasks);
      } else {
        await bulkUpsertTasks(preview.tasks);
      }
      // 历史日志去重后追加；覆盖模式下旧日志已被清空，不能沿用旧集合
      const existing = mode === 'replace'
        ? new Set<string>()
        : new Set((importLogs ?? []).map((l) => `${l.updatedAt}|${l.version}|${l.relatedSheet ?? ''}`));
      const freshLogs = preview.logs.filter((l) => {
        const key = `${l.updatedAt}|${l.version}|${l.relatedSheet ?? ''}`;
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      });
      if (freshLogs.length) await bulkAddImportLogs(freshLogs);
      setCompleted({
        mode,
        taskCount: preview.taskCount,
        added: mode === 'replace' ? preview.taskCount : preview.added,
        updated: mode === 'replace' ? 0 : preview.updated,
        logCount: freshLogs.length,
      });
      setPreview(null);
      toast(mode === 'replace'
        ? `覆盖导入完成：${preview.taskCount} 条任务`
        : `导入完成：新增 ${preview.added} 条，更新 ${preview.updated} 条`);
    } catch {
      // 错误已统一提示
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="导入导出"
        subtitle="按步骤导入 Excel，或导出当前全部任务作为离线备份。导入前会先预览，不会直接写入。"
        scope={
          <>
            <Badge className="bg-slate-100 text-slate-600 ring-slate-200">
              {(weekNames ?? []).length} 个周
            </Badge>
            <span className="num text-xs text-slate-500">{tasks?.length ?? 0} 项任务</span>
          </>
        }
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">导入任务</h2>
          <p className="mt-0.5 text-xs text-slate-400">支持多 sheet，自动识别表头；同周同名任务在合并模式下会更新而不是重复新增</p>
        </div>
        <Card>
          <StepBar step={step} />
          {completed ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Icon name="check" className="h-6 w-6" strokeWidth={2.4} />
              </div>
              <p className="text-base font-semibold text-emerald-800">导入完成</p>
              <p className="mt-1 text-sm text-emerald-700">
                共处理 {completed.taskCount} 条任务{completed.mode === 'merge'
                  ? `：新增 ${completed.added} 条，更新 ${completed.updated} 条`
                  : '（覆盖导入）'}
              </p>
              {completed.logCount > 0 && <p className="mt-1 text-xs text-emerald-600">历史日志 +{completed.logCount} 条</p>}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={resetImport}>继续导入</Button>
                <Link to="/tasks"><Button variant="outline">查看任务</Button></Link>
              </div>
            </div>
          ) : !preview ? (
            <div
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 text-center transition ${
                dragging ? 'border-brand-400 bg-brand-50/40' : 'border-slate-200 bg-slate-50/50 hover:border-brand-300 hover:bg-brand-50/30'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) onFile(f);
              }}
            >
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-brand-600 shadow-soft">
                <Icon name="import" className="h-6 w-6" />
              </div>
              <p className="text-sm text-slate-600">拖拽 xlsx 文件到此处，或</p>
              <Button variant="primary" className="mt-3" onClick={() => fileRef.current?.click()}>
                选择文件
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.currentTarget.value = '';
                }}
              />
              <p className="mt-2 text-xs text-slate-400">支持 .xlsx / .xls，单文件不超过 30MB</p>
            </div>
          ) : (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="flex min-w-0 items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                  <Icon name="paperclip" className="h-3.5 w-3.5 text-slate-400" />
                  <span className="max-w-[200px] truncate">{preview.fileName}</span>
                </span>
                <Badge className="bg-brand-50 text-brand-700 ring-brand-200">{preview.taskCount} 条任务</Badge>
                <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">{preview.logCount} 条历史日志</Badge>
                <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{preview.weekNames.length} 个周</Badge>
                <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">新增 {preview.added}</Badge>
                <Badge className="bg-amber-50 text-amber-700 ring-amber-200">更新 {preview.updated}</Badge>
                {preview.errors.length > 0 && (
                  <Badge className="bg-rose-50 text-rose-700 ring-rose-200">{preview.errors.length} 个错误</Badge>
                )}
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5">
                {preview.weekNames.map((w) => (
                  <span key={w} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600" title={w}>{displayWeekName(w)}</span>
                ))}
              </div>
              <p className="mb-3 text-[11px] text-slate-400">周名会自动补年份（如 9月第二周 → 2026年9月第二周），跨年同名周不会互相覆盖。</p>

              {preview.samples.length > 0 && (
                <div className="mb-3 overflow-x-auto rounded-lg border border-slate-100">
                  <table className="w-full text-xs">
                    <thead className="table-head">
                      <tr>
                        <th className="px-2.5 py-2 text-left font-semibold">周</th>
                        <th className="px-2.5 py-2 text-left font-semibold">名称</th>
                        <th className="px-2.5 py-2 text-left font-semibold">需求人</th>
                        <th className="px-2.5 py-2 text-left font-semibold">P</th>
                        <th className="px-2.5 py-2 text-left font-semibold">预估</th>
                        <th className="px-2.5 py-2 text-left font-semibold">完成</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.samples.map((t, i) => (
                        <tr key={i} className="border-t border-slate-50">
                          <td className="whitespace-nowrap px-2 py-1.5 text-slate-500" title={t.weekName}>{displayWeekName(t.weekName)}</td>
                          <td className="max-w-[260px] truncate px-2 py-1.5 text-slate-700">{t.title}</td>
                          <td className="px-2 py-1.5 text-slate-500">{t.requester || '—'}</td>
                          <td className="px-2 py-1.5 text-slate-500">P{t.priority}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{t.estimatedDateText || '—'}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{t.isCompleted ? '是' : '否'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.errors.length > 0 && (
                <ul className="mb-3 max-h-32 overflow-y-auto rounded-lg bg-rose-50/60 p-2.5 text-xs text-rose-600">
                  {preview.errors.map((e, i) => <li key={i}>· {e}</li>)}
                </ul>
              )}

              <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 px-3.5 py-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">导入方式</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                    <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} className="mt-0.5 accent-brand-600" />
                    <span>
                      <span className="font-medium">合并导入</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">同周同名任务更新，其余新增；不会删除现有数据</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                    <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-0.5 accent-rose-600" />
                    <span>
                      <span className="font-medium">覆盖导入</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">先清空全部任务、日志与附件，再导入</span>
                    </span>
                  </label>
                </div>
                {mode === 'replace' && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1.5 text-[11px] font-medium text-rose-700">
                    <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
                    覆盖操作不可撤销，建议先在下方导出一份备份。
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" onClick={doImport} disabled={importing}>
                  {importing ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      导入中…
                    </>
                  ) : '确认导入'}
                </Button>
                <Button variant="ghost" onClick={resetImport} disabled={importing}>取消</Button>
              </div>
            </div>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">导出任务</h2>
          <p className="mt-0.5 text-xs text-slate-400">导出全部任务或指定周，用于离线备份与分享</p>
        </div>
        <Card>
          {!tasks || tasks.length === 0 ? (
            <EmptyState title="暂无可导出数据" hint="先导入或新增任务。" />
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs text-slate-500">全部任务（每周一个 sheet + 全部汇总 sheet）</p>
                <Button variant="outline" onClick={() => { downloadBlob(exportAllXlsx(tasks), '全部任务.xlsx'); recordBackup(); }}>
                  <Icon name="download" className="h-4 w-4" />
                  导出全部为 .xlsx
                </Button>
              </div>
              <div>
                <p className="mb-2 text-xs text-slate-500">全部任务 CSV（含 BOM，Excel 可直接打开）</p>
                <Button variant="outline" onClick={() => { downloadBlob(exportAllCsv(tasks), '全部任务.csv'); recordBackup(); }}>
                  <Icon name="download" className="h-4 w-4" />
                  导出全部为 .csv
                </Button>
              </div>
              <div>
                <p className="mb-2 text-xs text-slate-500">指定周 xlsx（接近原 Excel 结构）</p>
                <div className="flex flex-wrap gap-2">
                  {(weekNames ?? []).map((w) => (
                    <Button key={w} variant="outline" className="text-xs" onClick={() => { downloadBlob(exportWeekXlsx(tasks, w), `${w}.xlsx`); recordBackup(); }}>
                      {displayWeekName(w)}.xlsx
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">数据备份说明</h2>
          <p className="mt-0.5 text-xs text-slate-400">数据库与附件目录需要分别备份</p>
        </div>
        <Card>
          <BackupHint />
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-500">
            <li className="flex gap-2"><span className="text-slate-300">1.</span><span>xlsx / csv 仅包含任务与排期信息，不包含留档附件文件。</span></li>
            <li className="flex gap-2"><span className="text-slate-300">2.</span><span>数据库保存在本地 MySQL；附件默认位于 <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">%LOCALAPPDATA%\TaskSchedule\uploads</code>，请单独复制备份。</span></li>
            <li className="flex gap-2"><span className="text-slate-300">3.</span><span>覆盖导入前建议先导出全部任务，操作不可撤销。</span></li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

function StepBar({ step }: { step: number }) {
  return (
    <div className="mb-4 flex items-center gap-1 overflow-x-auto pb-1">
      {STEPS.map((label, i) => (
        <div key={label} className="flex min-w-0 flex-1 items-center gap-1">
          <div className={cnStep(i <= step)}>
            <span className={cnStepCircle(i < step, i === step)}>
              {i < step ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cnStepText(i <= step)}>{label}</span>
          </div>
          {i < STEPS.length - 1 && <span className={`h-px flex-1 ${i < step ? 'bg-brand-300' : 'bg-slate-200'}`} />}
        </div>
      ))}
    </div>
  );
}

function cnStep(active: boolean): string {
  return `flex items-center gap-1.5 rounded-lg px-1 text-xs ${active ? '' : 'opacity-60'}`;
}
function cnStepCircle(done: boolean, active: boolean): string {
  return [
    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
    done ? 'bg-brand-600 text-white' : active ? 'border border-brand-300 bg-brand-50 text-brand-700' : 'border border-slate-200 bg-white text-slate-400',
  ].join(' ');
}
function cnStepText(active: boolean): string {
  return `whitespace-nowrap text-[11px] ${active ? 'font-medium text-slate-700' : 'text-slate-400'}`;
}
