import { useState, useEffect, useRef } from 'react';
import type { Task, AppSettings, TaskStatus } from '../types';
import { Badge, Button, Modal, confirmAction, toast } from './ui';
import { MoreMenu, type MenuItem } from './MoreMenu';
import { Icon } from './icons';
import { cn } from '../lib/utils';
import {
  displayStatus, isDelayed, isAnomaly, isDone, overdueDays, dueHint, dueUrgency,
  STATUS_BADGE_CLASS, STATUS_TEXT_CLASS, STATUS_DOT_CLASS, DISPLAY_STATUS_LABELS,
  priorityBadgeClass, priorityLabel,
  DUE_URGENCY_TEXT_CLASS, DUE_URGENCY_DOT_CLASS,
} from '../lib/status';
import { SORT_LABELS, type SortKey } from '../lib/taskSort';
import { displayWeekName } from '../lib/weekSort';
import {
  updateTaskField, updateDateField, updateTaskFields, setCompleted, setTaskStatus,
  deleteTask, batchDeleteTasks, batchSetCompleted, batchMoveTasks, copyTaskToWeek,
} from '../hooks/useTasks';
import { AttachmentModal } from './AttachmentModal';
import { TaskForm } from './TaskForm';

type Density = 'standard' | 'compact';

const DENSITY_KEY = 'taskTableDensity';
const COLUMNS_KEY = 'taskTableColumns';

export function TaskTable({
  tasks,
  settings,
  weekNames,
  showWeek = false,
  sortKey,
  sortDesc,
  onToggleSort,
  onResetSort,
  scopeKey,
  embedded = false,
  hiddenDone = 0,
  onShowAll,
}: {
  tasks: Task[];
  settings: AppSettings;
  weekNames: string[];
  showWeek?: boolean;
  sortKey: SortKey;
  sortDesc: boolean;
  onToggleSort: (key: SortKey) => void;
  onResetSort?: () => void;
  scopeKey: string;
  /** 作为任务卡片的内容区：自己去撑满高度，内部滚动 */
  embedded?: boolean;
  /** 当前“待办”视图下被隐藏的已完成数量 */
  hiddenDone?: number;
  onShowAll?: () => void;
}) {
  const [attTask, setAttTask] = useState<Task | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [copyTask, setCopyTask] = useState<Task | null>(null);
  const [copyWeek, setCopyWeek] = useState('');
  const [moveTask, setMoveTask] = useState<Task | null>(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);
  const [batchTarget, setBatchTarget] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [density, setDensity] = useState<Density>(() => {
    try { return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'standard'; } catch { return 'standard'; }
  });
  const [columns, setColumns] = useState<{ completedAt: boolean; remark: boolean }>(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { completedAt?: boolean; remark?: boolean };
        return { completedAt: !!parsed.completedAt, remark: !!parsed.remark };
      }
    } catch { /* ignore */ }
    return { completedAt: false, remark: false };
  });

  useEffect(() => {
    try { localStorage.setItem(DENSITY_KEY, density); } catch { /* ignore */ }
  }, [density]);
  useEffect(() => {
    try { localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns)); } catch { /* ignore */ }
  }, [columns]);

  // 切换周/筛选/翻页后清空选择，并回到表格顶部
  useEffect(() => {
    setSelected(new Set());
    setCopyTask(null);
    setMoveTask(null);
    setBatchMoveOpen(false);
    setExpandedId(null);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [scopeKey]);

  // 任务被删除/刷新后，移除已不存在的选择
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(tasks.filter((t) => t.id).map((t) => t.id!));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tasks]);

  const toggleSelect = (id: number) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const allSelected = tasks.length > 0 && tasks.every((t) => t.id && selected.has(t.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(tasks.filter((t) => t.id).map((t) => t.id!)));
  };

  const selectedTasks = tasks.filter((t) => t.id && selected.has(t.id));

  const batchComplete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirmAction({
      title: '批量完成',
      message: `将选中的 ${ids.length} 个任务标记为已完成？`,
      confirmText: '标记完成',
    });
    if (!ok) return;
    try {
      await batchSetCompleted(ids, true);
      setSelected(new Set());
    } catch { /* 写操作层已提示 */ }
  };

  const batchDelete = async () => {
    if (selectedTasks.length === 0) return;
    const ok = await confirmAction({
      title: '批量删除',
      message: `删除选中的 ${selectedTasks.length} 个任务？\n删除后 8 秒内可撤销，留档文件会随撤销一起恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await batchDeleteTasks(selectedTasks);
      setSelected(new Set());
    } catch { /* 写操作层已提示 */ }
  };

  const doBatchMove = async () => {
    if (!batchTarget) return;
    try {
      await batchMoveTasks(selectedTasks, batchTarget);
      setBatchMoveOpen(false);
      setBatchTarget('');
      setSelected(new Set());
    } catch { /* 写操作层已提示 */ }
  };

  const removeOne = async (t: Task) => {
    const ok = await confirmAction({
      title: '删除任务',
      message: `删除「${t.title}」？\n删除后 8 秒内可撤销，留档文件会随撤销一起恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (ok) await deleteTask(t);
  };

  const doMove = async () => {
    if (!moveTask?.id || !moveTarget || moveTarget === moveTask.weekName) return;
    try {
      await updateTaskField(moveTask.id, 'weekName', moveTarget);
      toast(`已移动到「${displayWeekName(moveTarget)}」`);
      setMoveTask(null);
      setMoveTarget('');
    } catch { /* ignore */ }
  };

  const rowMenuItems = (t: Task): MenuItem[] => {
    const done = isDone(t);
    const statusItems: MenuItem[] = [];
    if (t.status === 'cancelled') {
      statusItems.push({
        label: '重新打开',
        onClick: () => { void setTaskStatus(t.id!, 'notStarted'); },
      });
    } else if (!done) {
      if (t.status !== 'inProgress') {
        statusItems.push({ label: '标记为进行中', onClick: () => { void setTaskStatus(t.id!, 'inProgress'); } });
      }
      if (t.status !== 'notStarted') {
        statusItems.push({ label: '标记为未开始', onClick: () => { void setTaskStatus(t.id!, 'notStarted'); } });
      }
      statusItems.push({ label: '取消任务', onClick: () => { void setTaskStatus(t.id!, 'cancelled'); } });
    }
    const items: MenuItem[] = [
      { label: '编辑任务', icon: 'edit', onClick: () => setEditTask(t) },
      done
        ? { label: '撤销完成', icon: 'refresh', onClick: () => { void setCompleted(t.id!, false); } }
        : { label: '标记完成', icon: 'check', onClick: () => { void setCompleted(t.id!, true); } },
      ...statusItems,
      { label: '移动到其他周…', icon: 'move', onClick: () => { setMoveTask(t); setMoveTarget(''); } },
    ];
    if (t.isPeriodic && weekNames.length > 1) {
      items.push({ label: '复制到其他周…', icon: 'refresh', onClick: () => { setCopyTask(t); setCopyWeek(''); } });
    }
    items.push(
      {
        label: (t.attachmentCount ?? 0) > 0 ? `留档文件（${t.attachmentCount}）` : '留档文件',
        icon: 'paperclip',
        onClick: () => setAttTask(t),
      },
      { label: '删除任务', icon: 'trash', danger: true, onClick: () => { void removeOne(t); } },
    );
    return items;
  };

  const thPad = density === 'compact' ? 'py-2' : 'py-2.5';
  const tdPad = density === 'compact' ? 'py-1.5' : 'py-2.5';

  return (
    <div className={cn('overflow-visible', embedded ? 'flex min-h-0 flex-1 flex-col' : 'card flex flex-col')}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1 font-medium text-slate-500">
            <Icon name="sparkles" className="h-3.5 w-3.5 text-brand-400" />
            {sortKey === 'smart' ? '未完成优先 · 延期在前' : `按${SORT_LABELS[sortKey]}排序`}
          </span>
          <span className="hidden text-slate-300 sm:inline">·</span>
          <span className="hidden sm:inline">共 {tasks.length} 行</span>
          {sortKey !== 'smart' && onResetSort && (
            <button
              type="button"
              onClick={onResetSort}
              className="rounded text-brand-600 transition hover:text-brand-700 hover:underline"
            >
              恢复未完成优先
            </button>
          )}
          {hiddenDone > 0 && onShowAll && (
            <button
              type="button"
              onClick={onShowAll}
              className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
            >
              已完成 {hiddenDone} 项已隐藏 · 查看
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="hidden items-center rounded-lg bg-slate-100 p-0.5 sm:flex" role="group" aria-label="表格密度">
            {([
              ['standard', '标准'],
              ['compact', '紧凑'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={density === value}
                onClick={() => setDensity(value)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-medium transition',
                  density === value ? 'bg-white text-slate-700 shadow-soft' : 'text-slate-400 hover:text-slate-600',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <details className="relative hidden md:block">
            <summary className="btn-outline h-7 cursor-pointer list-none gap-1 px-2 text-[11px] [&::-webkit-details-marker]:hidden">
              <Icon name="columns" className="h-3.5 w-3.5" />
              列显示
            </summary>
            <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-slate-100 bg-white p-2 shadow-xl">
              <p className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">可选列</p>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-2 text-sm text-slate-600 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={columns.completedAt}
                  onChange={(e) => setColumns((c) => ({ ...c, completedAt: e.target.checked }))}
                  className="h-4 w-4 rounded accent-brand-600"
                />
                完成时间
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-2 text-sm text-slate-600 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={columns.remark}
                  onChange={(e) => setColumns((c) => ({ ...c, remark: e.target.checked }))}
                  className="h-4 w-4 rounded accent-brand-600"
                />
                备注
              </label>
              <p className="mt-1 border-t border-slate-100 px-1.5 pt-2 text-[10px] leading-relaxed text-slate-400">
                默认显示：选择、序号、优先级、名称、需求人、日期、状态、操作。
              </p>
            </div>
          </details>
        </div>
      </div>

      {/* 桌面表格 */}
      <div ref={scrollRef} className="hidden min-h-0 overflow-auto rounded-b-xl md:block md:flex-1">
        <table className="w-full min-w-[980px] table-fixed text-[13px]">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-slate-200/70 bg-slate-50/95 text-left text-[11px] font-medium text-slate-500 backdrop-blur">
              <th className="w-10 px-2 py-2 text-center">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5 cursor-pointer rounded accent-brand-600" title="全选/取消" aria-label="全选" />
              </th>
              <Th onClick={() => onToggleSort('seq')} active={sortKey === 'seq'} desc={sortDesc} className="w-[52px] text-center" pad={thPad}>序号</Th>
              <Th onClick={() => onToggleSort('priority')} active={sortKey === 'priority'} desc={sortDesc} className="w-[78px] text-center" pad={thPad}>优先级</Th>
              <th className={cn('min-w-[240px] px-2 font-medium', thPad)}>名称</th>
              <th className={cn('w-[92px] px-2 font-medium', thPad)}>需求人</th>
              <Th onClick={() => onToggleSort('estimatedDate')} active={sortKey === 'estimatedDate'} desc={sortDesc} className="w-[136px]" pad={thPad}>日期</Th>
              <th className={cn('w-[88px] px-2 font-medium', thPad)}>状态</th>
              {columns.completedAt && (
                <Th onClick={() => onToggleSort('completedAt')} active={sortKey === 'completedAt'} desc={sortDesc} className="w-[100px]" pad={thPad}>完成时间</Th>
              )}
              {columns.remark && <th className={cn('w-[150px] px-2 font-medium', thPad)}>备注</th>}
              <th className={cn('w-[116px] px-2 text-right font-medium', thPad)}>操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const ds = displayStatus(t);
              const delayed = isDelayed(t);
              const anomaly = isAnomaly(t);
              const done = isDone(t);
              const hint = dueHint(t);
              return (
                <tr key={t.id} className={cn(
                  'group/row border-b border-slate-50 transition-colors hover:bg-slate-50/70',
                  anomaly && 'bg-rose-50/40',
                  done && 'bg-slate-50/40',
                )}>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={selected.has(t.id!)} onChange={() => toggleSelect(t.id!)} className="h-3.5 w-3.5 cursor-pointer rounded accent-brand-600" aria-label={`选择 ${t.title}`} />
                  </td>
                  <td className={cn('px-2 text-center text-xs text-slate-400 tabular-nums', tdPad)} title="任务序号">{t.seq}</td>

                  <td className={cn('px-2 text-center', tdPad)}>
                    <select
                      value={t.priority}
                      onChange={(e) => updateTaskField(t.id!, 'priority', Number(e.target.value))}
                      className={cn(
                        'max-w-full cursor-pointer rounded-full px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset outline-none transition hover:opacity-80',
                        priorityBadgeClass(t.priority),
                      )}
                      style={{ appearance: 'none', border: 'none' }}
                      title="点击修改优先级"
                      aria-label="优先级"
                    >
                      <option value={1}>P1 {priorityLabel(1, settings)}</option>
                      <option value={2}>P2 {priorityLabel(2, settings)}</option>
                      <option value={3}>P3 {priorityLabel(3, settings)}</option>
                    </select>
                  </td>

                  <td className={cn('px-2', tdPad)}>
                    <div className="flex items-start gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCompleted(t.id!, !done)}
                        className={cn(
                          'mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition',
                          done
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-slate-300 bg-white text-slate-300 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-500 group-hover/row:border-emerald-300 group-hover/row:text-emerald-400',
                        )}
                        title={done ? '点击撤销完成' : '点击标记完成'}
                        aria-label={done ? '撤销完成' : '标记完成'}
                        aria-pressed={done}
                      >
                        <Icon name="check" className="h-3 w-3" strokeWidth={3} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <InlineText
                            value={t.title}
                            onSave={(v) => updateTaskField(t.id!, 'title', v)}
                            className={cn('min-w-0 break-words font-medium', done ? 'text-slate-400 line-through' : 'text-slate-800')}
                          />
                          {showWeek && (
                            <span
                              className="shrink-0 whitespace-nowrap rounded bg-slate-50 px-1.5 py-0.5 text-[10px] leading-none text-slate-400 ring-1 ring-inset ring-slate-200/70"
                              title={t.weekName}
                            >
                              {displayWeekName(t.weekName)}
                            </span>
                          )}
                          {t.isPeriodic && <span className="shrink-0 text-[10px] text-brand-500" title="周期任务">⟳</span>}
                          {anomaly && <span className="shrink-0 rounded bg-rose-50 px-1 text-[10px] text-rose-600" title="已完成但缺少完成时间">补填</span>}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className={cn('px-2', tdPad)}>
                    <InlineText value={t.requester} onSave={(v) => updateTaskField(t.id!, 'requester', v)} className="block truncate text-slate-600" />
                  </td>

                  <td className={cn('group/date relative whitespace-nowrap px-2', tdPad)}>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1">
                        <InlineDate
                          value={t.estimatedDateText}
                          onSave={(v) => updateDateField(t.id!, 'estimatedDate', 'estimatedDateText', v)}
                          className={cn(t.revisedDateText ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-600')}
                        />
                        {t.revisedDateText ? (
                          <>
                            <Icon name="arrow-right" className="h-2.5 w-2.5 shrink-0 text-slate-300" />
                            <InlineDate
                              value={t.revisedDateText}
                              onSave={(v) => updateDateField(t.id!, 'revisedDate', 'revisedDateText', v)}
                              className="font-medium text-amber-600"
                            />
                          </>
                        ) : (
                          <AddRevisedDate
                            onSave={(v) => updateDateField(t.id!, 'revisedDate', 'revisedDateText', v)}
                          />
                        )}
                      </div>
                      {hint && (
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium', DUE_URGENCY_TEXT_CLASS[dueUrgency(t)])}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', DUE_URGENCY_DOT_CLASS[dueUrgency(t)])} />
                          {hint}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className={cn('whitespace-nowrap px-2', tdPad)}>
                    <span
                      className={cn('inline-flex items-center gap-1.5 text-xs font-medium', STATUS_TEXT_CLASS[ds])}
                      title={delayed ? `已延期 ${overdueDays(t)} 天` : undefined}
                    >
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT_CLASS[ds])} />
                      {DISPLAY_STATUS_LABELS[ds]}
                      {delayed && <span className="text-[10px] font-normal text-orange-500">{overdueDays(t)}天</span>}
                    </span>
                  </td>

                  {columns.completedAt && (
                    <td className={cn('whitespace-nowrap px-2', tdPad)}>
                      <InlineDate
                        value={t.completedAtText || t.completedAt || ''}
                        onSave={(v) => updateDateField(t.id!, 'completedAt', 'completedAtText', v)}
                        placeholder="26.9.7"
                        className={cn('text-slate-600', anomaly && 'font-medium text-rose-600')}
                      />
                    </td>
                  )}

                  {columns.remark && (
                    <td className={cn('px-2', tdPad)}>
                      <InlineText value={t.remark} onSave={(v) => updateTaskField(t.id!, 'remark', v)} className="text-xs text-slate-500" multiline />
                    </td>
                  )}

                  <td className={cn('px-2 text-right', tdPad)}>
                    <div className="flex items-center justify-end gap-0.5">
                      {!done && t.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => setCompleted(t.id!, true)}
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 md:opacity-0 md:focus-visible:opacity-100 md:group-hover/row:opacity-100"
                          title="标记为已完成"
                        >
                          <Icon name="check" className="h-3.5 w-3.5" />
                          完成
                        </button>
                      )}
                      <MoreMenu items={rowMenuItems(t)} label={`更多操作：${t.title}`} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={columns.completedAt ? (columns.remark ? 10 : 9) : (columns.remark ? 9 : 8)} className="px-3 py-12 text-center text-sm text-slate-400">暂无任务</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 移动端卡片 */}
      <div className="space-y-2 p-3 md:hidden">
        {tasks.map((t) => {
          const ds = displayStatus(t);
          const done = isDone(t);
          const delayed = isDelayed(t);
          const hint = dueHint(t);
          const expanded = expandedId === t.id;
          const dueText = t.revisedDateText || t.estimatedDateText;
          return (
            <div key={t.id} className={cn(
              'min-w-0 overflow-hidden rounded-xl border bg-white',
              delayed ? 'border-orange-200' : 'border-slate-100',
            )}>
              <div className="flex items-start gap-2 p-3 pb-2">
                <input
                  type="checkbox"
                  checked={selected.has(t.id!)}
                  onChange={() => toggleSelect(t.id!)}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded accent-brand-600"
                  aria-label={`选择 ${t.title}`}
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setExpandedId(expanded ? null : t.id!)}
                  aria-expanded={expanded}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn('min-w-0 break-words text-sm font-medium leading-snug', done ? 'text-slate-400 line-through' : 'text-slate-800')}>
                      {t.title}
                      {t.isPeriodic && <span className="ml-1 text-[10px] text-brand-500">⟳</span>}
                    </p>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <Badge className={STATUS_BADGE_CLASS[ds]}>{DISPLAY_STATUS_LABELS[ds]}</Badge>
                      <Icon name="chevron-down" className={cn('h-3.5 w-3.5 text-slate-300 transition-transform', expanded && 'rotate-180')} />
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <Badge className={priorityBadgeClass(t.priority)}>P{t.priority} {priorityLabel(t.priority, settings)}</Badge>
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Icon name="calendar" className="h-3.5 w-3.5 text-slate-400" />
                      {dueText || '未设日期'}
                    </span>
                    {t.revisedDateText && t.estimatedDateText && (
                      <span className="text-[10px] text-slate-400">预估 {t.estimatedDateText}</span>
                    )}
                    {hint && (
                      <span className={cn('inline-flex items-center gap-1 font-medium', DUE_URGENCY_TEXT_CLASS[dueUrgency(t)])}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', DUE_URGENCY_DOT_CLASS[dueUrgency(t)])} />
                        {hint}
                      </span>
                    )}
                  </div>
                </button>
              </div>

              {expanded && (
                <div className="mx-3 mb-2 space-y-2 rounded-lg bg-slate-50/80 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">需求人</span>
                    <span className="min-w-0 truncate text-right text-slate-700">{t.requester || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">所属周</span>
                    <span className="min-w-0 truncate text-right text-slate-700" title={t.weekName}>{displayWeekName(t.weekName)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="shrink-0 text-slate-400">预估 / 修订</span>
                    <span className="min-w-0 text-right text-slate-700">
                      {t.estimatedDateText || '—'}
                      {t.revisedDateText && <span className="ml-1 text-amber-600"> / {t.revisedDateText}</span>}
                    </span>
                  </div>
                  {t.completedAtText && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400">完成时间</span>
                      <span className="text-emerald-600">{t.completedAtText}</span>
                    </div>
                  )}
                  {t.remark && (
                    <div>
                      <span className="text-slate-400">备注</span>
                      <p className="mt-0.5 whitespace-pre-wrap break-words leading-relaxed text-slate-600">{t.remark}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button variant="outline" className="min-h-9 flex-1 text-xs" onClick={() => setEditTask(t)}>
                      <Icon name="edit" className="h-3.5 w-3.5" />
                      编辑
                    </Button>
                    <Button variant="outline" className="min-h-9 flex-1 text-xs" onClick={() => setAttTask(t)}>
                      <Icon name="paperclip" className="h-3.5 w-3.5" />
                      留档{t.attachmentCount ? `（${t.attachmentCount}）` : ''}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
                <Button
                  variant={done ? 'ghost' : 'outline'}
                  className={cn('min-h-10 flex-1 text-xs', done ? 'text-slate-400' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50')}
                  onClick={() => setCompleted(t.id!, !done)}
                >
                  <Icon name="check" className="h-4 w-4" />
                  {done ? '撤销完成' : '标记完成'}
                </Button>
                <MoreMenu
                  items={rowMenuItems(t)}
                  label={`更多操作：${t.title}`}
                  buttonClassName="h-10 w-10"
                />
              </div>
            </div>
          );
        })}
        {tasks.length === 0 && <p className="py-10 text-center text-sm text-slate-400">暂无任务</p>}
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-3 bottom-[calc(4.5rem_+_env(safe-area-inset-bottom))] z-40 mx-auto max-w-3xl rounded-xl border border-brand-100 bg-white/95 p-2 shadow-xl backdrop-blur md:bottom-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex items-center justify-between gap-2 sm:contents">
              <span className="shrink-0 px-1 text-sm font-medium text-brand-700">已选 {selected.size} 项</span>
              <Button variant="ghost" className="min-h-8 shrink-0 text-xs sm:order-last sm:min-h-9" onClick={() => setSelected(new Set())}>取消选择</Button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:contents">
              <Button variant="outline" className="min-h-9 text-xs whitespace-nowrap sm:flex-none" onClick={batchComplete}>
                <Icon name="check" className="h-3.5 w-3.5" />
                完成 {selected.size} 项
              </Button>
              <Button variant="outline" className="min-h-9 text-xs whitespace-nowrap sm:flex-none" onClick={() => setBatchMoveOpen(true)}>
                <Icon name="move" className="h-3.5 w-3.5" />
                移动周
              </Button>
              <Button variant="danger" className="min-h-9 text-xs whitespace-nowrap sm:flex-none" onClick={batchDelete}>
                <Icon name="trash" className="h-3.5 w-3.5" />
                删除 {selected.size} 项
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 移动周（单条） */}
      <Modal
        open={!!moveTask}
        onClose={() => setMoveTask(null)}
        title="移动任务到其他周"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveTask(null)}>取消</Button>
            <Button variant="primary" disabled={!moveTarget || moveTarget === moveTask?.weekName} onClick={doMove}>移动</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">将「{moveTask?.title}」移动到：</p>
        <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} className="select w-full" aria-label="目标周">
          <option value="">选择目标周</option>
          {weekNames.filter((w) => w !== moveTask?.weekName).map((w) => (
            <option key={w} value={w}>{displayWeekName(w)}</option>
          ))}
        </select>
      </Modal>

      {/* 批量移动周 */}
      <Modal
        open={batchMoveOpen}
        onClose={() => setBatchMoveOpen(false)}
        title={`移动 ${selected.size} 项任务`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBatchMoveOpen(false)}>取消</Button>
            <Button variant="primary" disabled={!batchTarget} onClick={doBatchMove}>移动 {selected.size} 项</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">选择目标周后，选中任务会整体移动；任务序号会由服务端重新排列。</p>
        <select value={batchTarget} onChange={(e) => setBatchTarget(e.target.value)} className="select w-full" aria-label="批量移动目标周">
          <option value="">选择目标周</option>
          {weekNames.map((w) => (
            <option key={w} value={w}>{displayWeekName(w)}</option>
          ))}
        </select>
      </Modal>

      {/* 复制周期任务 */}
      <Modal
        open={!!copyTask}
        onClose={() => setCopyTask(null)}
        title="复制任务到其他周"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCopyTask(null)}>取消</Button>
            <Button
              variant="primary"
              disabled={!copyWeek}
              onClick={async () => {
                if (!copyTask?.id || !copyWeek) return;
                try {
                  await copyTaskToWeek(copyTask.id, copyWeek);
                  setCopyTask(null);
                } catch { /* ignore */ }
              }}
            >
              复制
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">将「{copyTask?.title}」复制到：</p>
        <select value={copyWeek} onChange={(e) => setCopyWeek(e.target.value)} className="select w-full" aria-label="目标周">
          <option value="">选择目标周</option>
          {weekNames.filter((w) => w !== copyTask?.weekName).map((w) => (
            <option key={w} value={w}>{displayWeekName(w)}</option>
          ))}
        </select>
        <p className="mt-2 text-xs text-slate-400">复制会保留预估时间、清空修订时间；完成状态重置为未开始。</p>
      </Modal>

      <TaskForm
        open={!!editTask}
        initial={editTask}
        onClose={() => setEditTask(null)}
        weekName={editTask?.weekName ?? ''}
        weekNames={weekNames}
        settings={settings}
        onSave={async (t) => {
          if (!editTask?.id) return;
          await updateTaskFields(editTask.id, t);
        }}
      />

      <AttachmentModal task={attTask ? { id: attTask.id!, title: attTask.title } : null} onClose={() => setAttTask(null)} />
    </div>
  );
}

function Th({
  children, onClick, active, desc, className, pad,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  desc?: boolean;
  className?: string;
  pad?: string;
}) {
  return (
    <th className={cn('whitespace-nowrap px-2 font-medium select-none', pad ?? 'py-2.5', onClick && 'cursor-pointer hover:text-slate-700', className)} onClick={onClick}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active ? (
          <Icon name={desc ? 'chevron-down' : 'chevron-down'} className={cn('h-3 w-3 text-brand-500 transition-transform', !desc && 'rotate-180')} />
        ) : (
          onClick && <span className="text-[9px] text-slate-300">↕</span>
        )}
      </span>
    </th>
  );
}

function InlineText({
  value, onSave, className, multiline,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);

  const save = () => {
    setEditing(false);
    if (v !== value) Promise.resolve(onSave(v)).catch(() => { /* 已统一提示 */ });
  };

  if (editing) {
    if (multiline) {
      return (
        <textarea
          autoFocus
          rows={2}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setV(value); setEditing(false); }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.target as HTMLTextAreaElement).blur();
          }}
          className={cn('input px-2 py-1 text-xs', className)}
        />
      );
    }
    return (
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setV(value); setEditing(false); }
        }}
        className={cn('input px-2 py-1 text-sm', className)}
      />
    );
  }
  return (
    <span
      className={cn(
        'cursor-text rounded px-0.5 py-0.5 transition hover:bg-white hover:ring-1 hover:ring-slate-200',
        !multiline && 'inline-block',
        className,
      )}
      style={multiline ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' } : undefined}
      onClick={() => { setV(value); setEditing(true); }}
      title="点击编辑"
    >
      {value || <span className="text-slate-300">{multiline ? '—' : '空'}</span>}
    </span>
  );
}

function InlineDate({
  value, onSave, className, prefix, placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  prefix?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);

  const save = () => {
    setEditing(false);
    if (v !== value) Promise.resolve(onSave(v)).catch(() => { /* 已统一提示 */ });
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setV(value); setEditing(false); }
        }}
        placeholder={placeholder ?? '26.9.7 / 持续 / 待定'}
        className={cn('input px-2 py-0.5 text-xs', className)}
      />
    );
  }
  return (
    <span
      className={cn('inline-block cursor-text rounded px-0.5 py-0.5 transition hover:bg-white hover:ring-1 hover:ring-slate-200', className)}
      onClick={() => { setV(value); setEditing(true); }}
      title="点击编辑"
    >
      {prefix && <span className="text-slate-400">{prefix} </span>}
      {value || <span className="text-slate-300">—</span>}
    </span>
  );
}

/**
 * 空修订时间的极简入口：默认隐藏，悬停整格时浮现「＋修订」，
 * 点击后就地输入，避免每行都露出占位符影响表格观感。
 */
function AddRevisedDate({ onSave }: { onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');

  const save = () => {
    setEditing(false);
    const next = v.trim();
    if (next) Promise.resolve(onSave(next)).catch(() => { /* 已统一提示 */ });
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setV(''); setEditing(false); }
        }}
        placeholder="26.9.7"
        className="input w-[86px] px-1.5 py-0.5 text-xs text-amber-600"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => { setV(''); setEditing(true); }}
      className="hidden shrink-0 text-[10px] text-slate-300 transition hover:text-amber-500 group-hover/date:inline group-focus-within/date:inline"
      title="添加修订时间"
    >
      ＋修订
    </button>
  );
}
