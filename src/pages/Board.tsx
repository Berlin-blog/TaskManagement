import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useAllTasks, useSettings, useWeekNames, setTaskStatus, setCompleted,
  deleteTask, addTask, updateTaskFields,
} from '../hooks/useTasks';
import {
  Card, EmptyState, Badge, PageSkeleton, PageHeader, Button,
} from '../components/ui';
import { FilterBar, EMPTY_FILTER, type FilterState } from '../components/Filters';
import { MoreMenu, type MenuItem } from '../components/MoreMenu';
import { TaskForm } from '../components/TaskForm';
import { AttachmentModal } from '../components/AttachmentModal';
import { Icon } from '../components/icons';
import {
  displayStatus, isDone, isDelayed, overdueDays, dueHint, dueUrgency,
  DISPLAY_STATUS_LABELS, STATUS_BADGE_CLASS, STATUS_BORDER_CLASS,
  priorityBadgeClass, priorityLabel, DUE_URGENCY_TEXT_CLASS, DUE_URGENCY_DOT_CLASS,
  matchesDueRange,
} from '../lib/status';
import { displayWeekName } from '../lib/weekSort';
import { cn } from '../lib/utils';
import { useUIStore } from '../store/uiStore';
import type { Task, TaskStatus, AppSettings } from '../types';

type ColumnKey = 'notStarted' | 'inProgress' | 'completed' | 'cancelled';

const COLUMNS: { key: ColumnKey; label: string; statusValue: TaskStatus; dot: string; bar: string }[] = [
  { key: 'notStarted', label: '未开始', statusValue: 'notStarted', dot: 'bg-slate-400', bar: 'border-t-slate-300' },
  { key: 'inProgress', label: '进行中', statusValue: 'inProgress', dot: 'bg-blue-500', bar: 'border-t-blue-400' },
  { key: 'completed', label: '已完成', statusValue: 'completed', dot: 'bg-emerald-500', bar: 'border-t-emerald-400' },
  { key: 'cancelled', label: '取消', statusValue: 'cancelled', dot: 'bg-rose-400', bar: 'border-t-rose-300' },
];

function columnOf(task: Task): ColumnKey {
  if (task.status === 'cancelled') return 'cancelled';
  if (isDone(task)) return 'completed';
  return task.status === 'inProgress' ? 'inProgress' : 'notStarted';
}

export default function Board() {
  const tasks = useAllTasks();
  const settings = useSettings();
  const weekNames = useWeekNames();
  const currentWeek = useUIStore((s) => s.currentWeek);
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [initialized, setInitialized] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<ColumnKey | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [attTask, setAttTask] = useState<Task | null>(null);
  const [delayedOpen, setDelayedOpen] = useState(false);
  const [mobileStatus, setMobileStatus] = useState<ColumnKey>('notStarted');

  // 默认跟随全局当前周；没有选择时落在最近一周
  useEffect(() => {
    if (initialized || !weekNames || weekNames.length === 0) return;
    const week = currentWeek ?? weekNames[weekNames.length - 1];
    setFilter((f) => ({ ...f, week }));
    if (!currentWeek) useUIStore.getState().setCurrentWeek(week);
    setInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekNames, initialized]);

  const changeFilter = (f: FilterState) => {
    setFilter(f);
    useUIStore.getState().setCurrentWeek(f.week || null);
  };

  if (!tasks || !settings) return <PageSkeleton />;

  const requesters = Array.from(new Set(tasks.map((t) => t.requester).filter(Boolean)));
  const filtered = tasks.filter((t) => {
    if (filter.week && t.weekName !== filter.week) return false;
    if (filter.requester && t.requester !== filter.requester) return false;
    if (filter.priority && t.priority !== Number(filter.priority)) return false;
    if (filter.status) {
      if (filter.status === 'notCompleted') {
        if (isDone(t) || t.status === 'cancelled') return false;
      } else if (displayStatus(t) !== filter.status) {
        return false;
      }
    }
    if (!matchesDueRange(t, filter.due, filter.dueFrom, filter.dueTo)) return false;
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      if (!t.title.toLowerCase().includes(kw) && !t.remark.toLowerCase().includes(kw)) return false;
    }
    return true;
  });

  const delayedItems = filtered.filter(isDelayed);
  const openCount = filtered.filter((t) => !isDone(t) && t.status !== 'cancelled').length;
  const currentRange = filter.week ? displayWeekName(filter.week) : '全部周';

  const onDrop = async (col: typeof COLUMNS[number]) => {
    const id = dragId;
    setDragId(null);
    setDragOver(null);
    if (id == null) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || columnOf(task) === col.key) return;
    await setTaskStatus(id, col.statusValue);
  };

  const cardMenu = (task: Task): MenuItem[] => [
    { label: '编辑任务', icon: 'edit', onClick: () => setEditTask(task) },
    ...(isDone(task)
      ? [{ label: '撤销完成', icon: 'refresh' as const, onClick: () => { void setCompleted(task.id!, false); } }]
      : [{ label: '标记完成', icon: 'check' as const, onClick: () => { void setCompleted(task.id!, true); } }]),
    { label: '移至未开始', onClick: () => { void setTaskStatus(task.id!, 'notStarted'); } },
    { label: '移至进行中', onClick: () => { void setTaskStatus(task.id!, 'inProgress'); } },
    { label: '移至已完成', onClick: () => { void setTaskStatus(task.id!, 'completed'); } },
    { label: '移至取消', onClick: () => { void setTaskStatus(task.id!, 'cancelled'); } },
    {
      label: (task.attachmentCount ?? 0) > 0 ? `留档文件（${task.attachmentCount}）` : '留档文件',
      icon: 'paperclip',
      onClick: () => setAttTask(task),
    },
    { label: '删除任务', icon: 'trash', danger: true, onClick: () => { void deleteTask(task); } },
  ];

  const renderCard = (task: Task, compact = false) => (
    <BoardCard
      key={task.id}
      task={task}
      settings={settings}
      menu={cardMenu(task)}
      compact={compact}
      onEdit={() => setEditTask(task)}
      className={cn(dragId === task.id && 'opacity-40')}
      draggable={!compact}
      onDragStart={() => setDragId(task.id!)}
      onDragEnd={() => { setDragId(null); setDragOver(null); }}
    />
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="看板"
        meta={
          <>
            <Badge className="bg-brand-50 text-brand-700 ring-brand-200">{currentRange}</Badge>
            <span className="text-xs text-slate-400">{filtered.length} 项 · 未完成 {openCount}</span>
          </>
        }
        subtitle="拖拽卡片到另一列切换状态；延期任务保留在所属状态列，并显示逾期提醒。"
        actions={
          <>
            <Link to={filter.week ? `/tasks?week=${encodeURIComponent(filter.week)}` : '/tasks'}>
              <Button variant="outline" className="min-h-9">
                <Icon name="tasks" className="h-4 w-4" />
                列表
              </Button>
            </Link>
            <Button variant="primary" className="min-h-9" onClick={() => setAddOpen(true)}>
              <Icon name="plus" className="h-4 w-4" />
              新增任务
            </Button>
          </>
        }
      />

      <FilterBar
        filter={filter}
        onChange={changeFilter}
        weekNames={weekNames ?? []}
        requesters={requesters}
        settings={settings}
        resultCount={filtered.length}
        totalCount={tasks.length}
      />

      {delayedItems.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-orange-200 bg-orange-50/60">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
              <Icon name="alert" className="h-4 w-4" />
            </span>
            <button
              type="button"
              onClick={() => setDelayedOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              aria-expanded={delayedOpen}
            >
              <span className="text-sm font-medium text-orange-800">延期 {delayedItems.length} 项</span>
              <span className="hidden text-xs text-orange-600/80 sm:inline">这些任务已过截止日期，需要优先处理</span>
              <Icon name="chevron-down" className={cn('h-4 w-4 shrink-0 text-orange-500 transition-transform', delayedOpen && 'rotate-180')} />
            </button>
            <Link
              to={`/tasks?status=delayed${filter.week ? `&week=${encodeURIComponent(filter.week)}` : ''}`}
              className="shrink-0 text-xs font-medium text-orange-700 underline underline-offset-2"
            >
              在任务页查看
            </Link>
          </div>
          {delayedOpen && (
            <div className="grid gap-1.5 border-t border-orange-100 px-3 py-2 sm:grid-cols-2 xl:grid-cols-3">
              {delayedItems.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEditTask(t)}
                  className="flex min-w-0 items-center gap-2 rounded-lg bg-white/70 px-2.5 py-2 text-left transition hover:bg-white"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{t.title}</span>
                  <span className="shrink-0 text-[10px] font-medium text-orange-600">逾期 {overdueDays(t)} 天</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="当前范围没有任务"
            hint="调整筛选条件，或切换到全部周；也可以直接新增任务。"
            action={
              <>
                {filter.week && <Button variant="outline" onClick={() => changeFilter({ ...filter, week: '' })}>查看全部周</Button>}
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  <Icon name="plus" className="h-4 w-4" />
                  新增任务
                </Button>
              </>
            }
          />
        </Card>
      ) : (
        <>
          {/* 桌面四列 */}
          <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => {
              const items = filtered.filter((t) => columnOf(t) === col.key);
              const unfinished = items.filter((t) => !isDone(t) && t.status !== 'cancelled').length;
              return (
                <div
                  key={col.key}
                  className={cn(
                    'card flex min-w-0 flex-col border-t-4 p-2.5 transition',
                    col.bar,
                    dragOver === col.key && 'bg-brand-50/30 ring-2 ring-brand-300',
                  )}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => { e.preventDefault(); void onDrop(col); }}
                >
                  <div className="mb-2 flex items-start justify-between gap-2 px-1 pt-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full', col.dot)} />
                        <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 tabular-nums">{items.length}</span>
                      </div>
                      {(col.key === 'notStarted' || col.key === 'inProgress') && (
                        <p className="mt-0.5 text-[10px] text-slate-400">未完成 {unfinished} 项</p>
                      )}
                    </div>
                  </div>
                  <div className="flex max-h-[calc(100vh_-_360px)] min-h-[180px] flex-col gap-2 overflow-y-auto px-0.5 pb-1">
                    {items.map((t) => renderCard(t))}
                    {items.length === 0 && (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 py-10 text-xs text-slate-300">
                        拖拽任务到这里
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 移动端：状态标签 + 单列卡片 */}
          <div className="md:hidden">
            <div className="mb-3 grid grid-cols-4 gap-1.5" role="tablist" aria-label="任务状态">
              {COLUMNS.map((col) => {
                const count = filtered.filter((t) => columnOf(t) === col.key).length;
                return (
                  <button
                    key={col.key}
                    type="button"
                    role="tab"
                    aria-selected={mobileStatus === col.key}
                    onClick={() => setMobileStatus(col.key)}
                    className={cn(
                      'flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border text-xs font-medium transition',
                      mobileStatus === col.key
                        ? 'border-brand-200 bg-brand-50 text-brand-700'
                        : 'border-slate-100 bg-white text-slate-500',
                    )}
                  >
                    <span className="flex items-center gap-1">
                      <span className={cn('h-1.5 w-1.5 rounded-full', col.dot)} />
                      {col.label}
                    </span>
                    <span className={cn('text-lg font-semibold tabular-nums', mobileStatus === col.key ? 'text-brand-700' : 'text-slate-700')}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              {filtered.filter((t) => columnOf(t) === mobileStatus).map((t) => renderCard(t, true))}
              {filtered.filter((t) => columnOf(t) === mobileStatus).length === 0 && (
                <Card className="py-10 text-center text-xs text-slate-400">这个状态下暂无任务</Card>
              )}
            </div>
          </div>
        </>
      )}

      <TaskForm
        open={addOpen}
        onClose={() => setAddOpen(false)}
        weekName={filter.week || (weekNames?.[weekNames.length - 1] ?? '')}
        weekNames={weekNames ?? []}
        settings={settings}
        onSave={async (t) => { await addTask(t); }}
      />
      <TaskForm
        open={!!editTask}
        initial={editTask}
        onClose={() => setEditTask(null)}
        weekName={editTask?.weekName ?? ''}
        weekNames={weekNames ?? []}
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

function BoardCard({
  task, settings, menu, onEdit, compact, className, draggable, onDragStart, onDragEnd,
}: {
  task: Task;
  settings: AppSettings;
  menu: MenuItem[];
  onEdit: () => void;
  compact?: boolean;
  className?: string;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const ds = displayStatus(task);
  const done = isDone(task);
  const hint = dueHint(task);
  const urgency = dueUrgency(task);
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'group cursor-pointer rounded-lg border border-slate-100 border-l-[3px] bg-white p-3 shadow-soft transition hover:border-slate-200 hover:shadow-card focus-visible:ring-2 focus-visible:ring-brand-300',
        STATUS_BORDER_CLASS[ds],
        draggable && 'active:cursor-grabbing',
        compact && 'p-3.5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn('min-w-0 break-words text-sm font-medium leading-snug', done ? 'text-slate-400 line-through' : 'text-slate-800')}>
          {task.title}
          {task.isPeriodic && <span className="ml-1 text-[10px] text-brand-500">⟳</span>}
        </p>
        <Badge className={STATUS_BADGE_CLASS[ds]}>{DISPLAY_STATUS_LABELS[ds]}</Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge className={priorityBadgeClass(task.priority)}>P{task.priority} {priorityLabel(task.priority, settings)}</Badge>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          <Icon name="calendar" className="h-3 w-3 text-slate-400" />
          {task.revisedDateText || task.estimatedDateText || '未设日期'}
        </span>
        {hint && (
          <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium', DUE_URGENCY_TEXT_CLASS[urgency])}>
            <span className={cn('h-1.5 w-1.5 rounded-full', DUE_URGENCY_DOT_CLASS[urgency])} />
            {hint}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
        <span className="truncate">{task.requester || '未指定需求人'}</span>
        <span className="text-slate-300">·</span>
        <span className="min-w-0 truncate" title={task.weekName}>{displayWeekName(task.weekName)}</span>
      </div>

      {task.remark && (
        <p className="mt-2 line-clamp-2 break-words text-xs leading-relaxed text-slate-500">{task.remark}</p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-slate-50 pt-2">
        <div className="flex items-center gap-1">
          {done ? (
            <span className="inline-flex items-center gap-1 px-1 text-[11px] text-emerald-600">
              <Icon name="check" className="h-3.5 w-3.5" />
              已完成
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void setCompleted(task.id!, true); }}
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50"
            >
              <Icon name="check" className="h-3.5 w-3.5" />
              标记完成
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] text-slate-500 transition hover:bg-slate-100"
          >
            <Icon name="edit" className="h-3.5 w-3.5" />
            编辑
          </button>
        </div>
        <MoreMenu
          items={menu}
          label={`更多操作：${task.title}`}
          buttonClassName="h-8 w-8"
        />
      </div>
    </div>
  );
}
