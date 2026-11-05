import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useAllTasks, useSettings, useWeekNames, setCompleted, addTask, updateTaskFields,
} from '../hooks/useTasks';
import {
  Card, Button, EmptyState, Badge, PageSkeleton, PageHeader, ProgressBar, SectionTitle,
} from '../components/ui';
import { Icon } from '../components/icons';
import { ChartTooltip, CHART_COLORS } from '../components/ChartKit';
import { TaskForm } from '../components/TaskForm';
import {
  isDelayed, isAnomaly, isDone, isOpen, isDueToday, isDueInNextDays, dueDate, dueHint, dueUrgency,
  completionRate, priorityBadgeClass, priorityLabel, displayStatus,
  STATUS_BADGE_CLASS, DISPLAY_STATUS_LABELS, DUE_URGENCY_TEXT_CLASS, DUE_URGENCY_DOT_CLASS,
} from '../lib/status';
import { shortWeekLabel, displayWeekName } from '../lib/weekSort';
import { useUIStore } from '../store/uiStore';
import type { Task, AppSettings } from '../types';
import { cn } from '../lib/utils';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

function sortByUrgency(a: Task, b: Task): number {
  const da = dueDate(a) ?? '9999-12-31';
  const db = dueDate(b) ?? '9999-12-31';
  if (da !== db) return da.localeCompare(db);
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.seq - b.seq;
}

export default function Dashboard() {
  const tasks = useAllTasks();
  const settings = useSettings();
  const weekNames = useWeekNames();
  const { currentWeek } = useUIStore();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);

  const focusWeek = currentWeek ?? weekNames?.[weekNames.length - 1] ?? '';
  const focusWeekName = focusWeek ? displayWeekName(focusWeek) : '本周';

  // 顶栏的年份/周选择器与仪表盘展示的周保持同步（首次进入时默认最新周）
  useEffect(() => {
    if (!currentWeek && weekNames?.length) {
      useUIStore.getState().setCurrentWeek(weekNames[weekNames.length - 1]);
    }
  }, [currentWeek, weekNames]);

  if (!tasks || !settings) return <PageSkeleton />;

  const taskForm = (
    <>
      <TaskForm
        open={addOpen}
        onClose={() => setAddOpen(false)}
        weekName={focusWeek}
        weekNames={weekNames ?? []}
        settings={settings}
        onSave={async (t) => { await addTask(t); }}
      />
      <TaskForm
        open={!!editTask}
        initial={editTask}
        onClose={() => setEditTask(null)}
        weekName={editTask?.weekName ?? focusWeek}
        weekNames={weekNames ?? []}
        settings={settings}
        onSave={async (t) => {
          if (!editTask?.id) return;
          await updateTaskFields(editTask.id, t);
        }}
      />
    </>
  );

  if (tasks.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="仪表盘"
          subtitle="今日概览与优先处理"
          actions={
            <Button variant="primary" className="min-h-9" onClick={() => setAddOpen(true)}>
              <Icon name="plus" className="h-4 w-4" />
              新增任务
            </Button>
          }
        />
        <Card>
          <EmptyState
            title="当前还没有任务"
            hint="先导入已有的 Excel 排期，或直接新增第一条任务。导入后这里会自动汇总延期、到期和高优先级事项。"
            action={
              <>
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  <Icon name="plus" className="h-4 w-4" />
                  新增任务
                </Button>
                <Link to="/import-export">
                  <Button variant="outline">
                    <Icon name="import" className="h-4 w-4" />
                    导入 Excel
                  </Button>
                </Link>
              </>
            }
          />
        </Card>
        {taskForm}
      </div>
    );
  }

  const openTasks = tasks.filter(isOpen);
  const delayed = tasks.filter(isDelayed).sort(sortByUrgency);
  const dueNext7 = tasks.filter((t) => isDueInNextDays(t, 7));
  const anomalies = tasks.filter(isAnomaly).length;
  const focusTasks = focusWeek ? tasks.filter((t) => t.weekName === focusWeek) : [];
  const focusDone = focusTasks.filter(isDone).length;
  const focusOpen = focusTasks.filter(isOpen).length;
  const focusRate = completionRate(focusTasks.length, focusDone);

  const todayTasks = openTasks.filter(isDueToday).sort(sortByUrgency);
  const next7Tasks = openTasks
    .filter((t) => isDueInNextDays(t, 7) && !isDueToday(t))
    .sort(sortByUrgency);

  const seen = new Set<number>();
  [...delayed, ...todayTasks, ...next7Tasks].forEach((t) => { if (t.id) seen.add(t.id); });
  const highPriority = openTasks
    .filter((t) => t.priority === 1 && !(t.id && seen.has(t.id)))
    .sort((a, b) => a.seq - b.seq);

  const groups = [
    {
      key: 'overdue',
      title: '已延期',
      hint: '超过截止日期，优先处理',
      icon: 'alert' as const,
      tone: 'text-orange-600 bg-orange-50 ring-orange-100',
      items: delayed,
      to: '/tasks?status=delayed',
    },
    {
      key: 'today',
      title: '今天到期',
      hint: '今天需要交付',
      icon: 'clock' as const,
      tone: 'text-amber-700 bg-amber-50 ring-amber-100',
      items: todayTasks,
      to: '/tasks?due=today',
    },
    {
      key: 'next7',
      title: '近 7 天到期',
      hint: '提前安排，避免临近堆积',
      icon: 'calendar' as const,
      tone: 'text-blue-700 bg-blue-50 ring-blue-100',
      items: next7Tasks,
      to: '/tasks?due=next7',
    },
    {
      key: 'p1',
      title: '高优先级未完成',
      hint: '尚未临近截止的 P1 任务',
      icon: 'sparkles' as const,
      tone: 'text-rose-700 bg-rose-50 ring-rose-100',
      items: highPriority,
      to: '/tasks?priority=1&status=notCompleted',
    },
  ];

  const weekTrend = (weekNames ?? [])
    .map((w) => {
      const ws = tasks.filter((t) => t.weekName === w);
      const done = ws.filter(isDone).length;
      return {
        week: w,
        完成率: completionRate(ws.length, done),
        已完成: done,
        总数: ws.length,
      };
    })
    .filter((d) => d.总数 > 0)
    .slice(-8);

  const markDone = async (task: Task) => {
    if (!task.id) return;
    setCompletingId(task.id);
    try {
      await setCompleted(task.id, true);
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="仪表盘"
        subtitle={
          <span>
            {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} · 先处理延期和临近截止，再安排本周计划
          </span>
        }
        actions={
          <>
            <Link to="/tasks?status=notCompleted">
              <Button variant="outline" className="min-h-9">
                <Icon name="tasks" className="h-4 w-4" />
                查看待办
              </Button>
            </Link>
            <Button variant="primary" className="min-h-9" onClick={() => setAddOpen(true)}>
              <Icon name="plus" className="h-4 w-4" />
              新增任务
            </Button>
          </>
        }
      />

      {/* 今日概览 */}
      <section aria-labelledby="overview-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="overview-title" className="text-sm font-semibold text-slate-700">今日概览</h2>
          <span className="text-[11px] text-slate-400">点击指标查看对应任务</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OverviewCard
            label="未完成任务"
            value={openTasks.length}
            hint="进行中 / 未开始"
            icon="tasks"
            tone="bg-slate-800 text-white"
            onClick={() => navigate('/tasks?status=notCompleted')}
          />
          <OverviewCard
            label="已延期任务"
            value={delayed.length}
            hint={delayed.length > 0 ? '需要优先关注' : '暂无延期'}
            icon="alert"
            tone="bg-orange-500 text-white"
            emphasis={delayed.length > 0}
            onClick={() => navigate('/tasks?status=delayed')}
          />
          <OverviewCard
            label="近 7 天到期"
            value={dueNext7.length}
            hint="含今天，不含已延期"
            icon="calendar"
            tone="bg-brand-600 text-white"
            onClick={() => navigate('/tasks?due=next7')}
          />
          <OverviewCard
            label={focusWeek ? `${focusWeekName}完成率` : '本周完成率'}
            value={`${focusRate}%`}
            hint={focusWeek ? `${focusDone}/${focusTasks.length} 项已完成` : '还没有周数据'}
            icon="chart"
            tone="bg-emerald-500 text-white"
            progress={focusRate}
            onClick={() => navigate(focusWeek ? `/tasks?week=${encodeURIComponent(focusWeek)}` : '/tasks')}
          />
        </div>
      </section>

      {anomalies > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
          <Icon name="alert" className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-sm text-amber-800">
            有 <b>{anomalies}</b> 个任务标记为已完成但缺少完成时间，建议前往任务列表补填。
          </p>
          <Link to="/tasks?status=completed" className="text-xs font-medium text-amber-700 underline underline-offset-2">去补填</Link>
        </div>
      )}

      {/* 优先处理 */}
      <section aria-labelledby="priority-title" className="space-y-3">
        <SectionTitle
          title="优先处理"
          subtitle="按紧迫程度排序，可直接标记完成或查看详情"
          action={<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">共 {delayed.length + todayTasks.length + next7Tasks.length + highPriority.length} 项</span>}
        />
        <div id="priority-title" className="grid gap-3 lg:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.key} className={cn('p-4', group.items.length === 0 && 'bg-slate-50/40')}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', group.tone)}>
                    <Icon name={group.icon} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800">
                      {group.title}
                      <span className="ml-1.5 text-xs font-normal text-slate-400">{group.items.length}</span>
                    </h3>
                    <p className="truncate text-[11px] text-slate-400">{group.hint}</p>
                  </div>
                </div>
                {group.items.length > 0 && (
                  <Link to={group.to} className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700">
                    全部
                  </Link>
                )}
              </div>
              {group.items.length === 0 ? (
                <p className="rounded-lg bg-white/60 px-3 py-5 text-center text-xs text-slate-400">这里很清爽</p>
              ) : (
                <div className="-mx-1 divide-y divide-slate-50">
                  {group.items.slice(0, 5).map((t) => (
                    <PriorityRow
                      key={t.id}
                      task={t}
                      settings={settings}
                      completing={completingId === t.id}
                      onComplete={() => { void markDone(t); }}
                      onView={() => setEditTask(t)}
                    />
                  ))}
                </div>
              )}
              {group.items.length > 5 && (
                <Link to={group.to} className="mt-2 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs text-slate-500 transition hover:bg-slate-50 hover:text-brand-600">
                  还有 {group.items.length - 5} 项
                  <Icon name="arrow-right" className="h-3.5 w-3.5" />
                </Link>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* 本周进度 */}
      <section aria-labelledby="week-title" className="space-y-3">
        <SectionTitle
          title="本周进度"
          subtitle="当前周完成情况与最近几周的完成率变化"
          action={focusWeek ? <Link to={`/tasks?week=${encodeURIComponent(focusWeek)}`} className="text-xs font-medium text-brand-600">查看本周任务 →</Link> : undefined}
        />
        <div id="week-title" className="grid gap-3 lg:grid-cols-5">
          <Card className="p-4 lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">{focusWeek ? focusWeekName : '本周'}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-slate-800">{focusRate}%</p>
                <p className="mt-0.5 text-xs text-slate-400">{focusDone} / {focusTasks.length} 项已完成</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Icon name="chart" className="h-5 w-5" />
              </span>
            </div>
            <ProgressBar value={focusRate} className="mt-4 h-2.5" barClassName="bg-gradient-to-r from-emerald-400 to-emerald-600" label="本周完成率" />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 px-2 py-2">
                <p className="text-lg font-semibold text-slate-800">{focusTasks.length}</p>
                <p className="text-[10px] text-slate-400">总任务</p>
              </div>
              <div className="rounded-lg bg-emerald-50/70 px-2 py-2">
                <p className="text-lg font-semibold text-emerald-700">{focusDone}</p>
                <p className="text-[10px] text-emerald-600/80">已完成</p>
              </div>
              <div className="rounded-lg bg-amber-50/70 px-2 py-2">
                <p className="text-lg font-semibold text-amber-700">{focusOpen}</p>
                <p className="text-[10px] text-amber-600/80">未完成</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 lg:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">完成率趋势</h3>
                <p className="mt-0.5 text-[11px] text-slate-400">最近 8 个有任务的周</p>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <i className="h-2 w-2 rounded-full bg-brand-600" />完成率
              </span>
            </div>
            {weekTrend.length === 0 ? (
              <p className="py-14 text-center text-xs text-slate-400">暂无周数据</p>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={weekTrend} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: CHART_COLORS.axisText }} tickFormatter={(v: string) => shortWeekLabel(v)} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: CHART_COLORS.axisText }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip unit="%" />} />
                  <Area type="monotone" dataKey="完成率" stroke={CHART_COLORS.brand} strokeWidth={2.5} fill={CHART_COLORS.brand} fillOpacity={0.1} dot={{ r: 2.5, fill: CHART_COLORS.brand }} activeDot={{ r: 4.5 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      </section>

      {taskForm}
    </div>
  );
}

function OverviewCard({
  label, value, hint, icon, tone, onClick, progress, emphasis,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: 'tasks' | 'alert' | 'calendar' | 'chart';
  tone: string;
  onClick: () => void;
  progress?: number;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'card group relative overflow-hidden p-4 text-left transition hover:-translate-y-0.5 hover:shadow-card',
        emphasis && 'border-orange-200',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-800 tabular-nums">{value}</p>
          <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
        </div>
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-soft', tone)}>
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </span>
      </div>
      {progress !== undefined && (
        <ProgressBar value={progress} className="mt-3 h-1.5" barClassName="bg-emerald-500" label={`${label}进度`} />
      )}
      <span className="absolute bottom-0 left-0 h-0.5 w-full origin-left scale-x-0 bg-brand-500 transition-transform group-hover:scale-x-100" />
    </button>
  );
}

function PriorityRow({
  task, settings, completing, onComplete, onView,
}: {
  task: Task;
  settings: AppSettings;
  completing: boolean;
  onComplete: () => void;
  onView: () => void;
}) {
  const ds = displayStatus(task);
  const hint = dueHint(task);
  const urgency = dueUrgency(task);
  return (
    <div className="-mx-1 flex items-start gap-2 rounded-lg px-1 py-2.5 transition hover:bg-slate-50/80">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="min-w-0 break-words text-sm font-medium leading-snug text-slate-800">{task.title}</p>
          <Badge className={STATUS_BADGE_CLASS[ds]}>{DISPLAY_STATUS_LABELS[ds]}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
          <Badge className={priorityBadgeClass(task.priority)}>P{task.priority} {priorityLabel(task.priority, settings)}</Badge>
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar" className="h-3 w-3" />
            {task.revisedDateText || task.estimatedDateText || '未设日期'}
          </span>
          {hint && (
            <span className={cn('inline-flex items-center gap-1 font-medium', DUE_URGENCY_TEXT_CLASS[urgency])}>
              <span className={cn('h-1.5 w-1.5 rounded-full', DUE_URGENCY_DOT_CLASS[urgency])} />
              {hint}
            </span>
          )}
          <span className="truncate">{task.requester || '未指定需求人'}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          className="min-h-8 px-2 text-xs text-slate-500"
          onClick={onView}
        >
          查看
        </Button>
        <Button
          variant="outline"
          className="min-h-8 border-emerald-200 px-2 text-xs text-emerald-700 hover:bg-emerald-50"
          onClick={onComplete}
          disabled={completing}
        >
          <Icon name="check" className="h-3.5 w-3.5" />
          {completing ? '保存中…' : '完成'}
        </Button>
      </div>
    </div>
  );
}
