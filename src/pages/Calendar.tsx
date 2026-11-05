import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllTasks, useSettings, setCompleted } from '../hooks/useTasks';
import {
  Card, Button, Badge, EmptyState, PageSkeleton, PageHeader, Segmented,
} from '../components/ui';
import { Icon } from '../components/icons';
import {
  priorityBadgeClass, priorityLabel, displayStatus, STATUS_BADGE_CLASS,
  DISPLAY_STATUS_LABELS, STATUS_DOT_CLASS, isDone, isDelayed, dueHint, dueUrgency,
  DUE_URGENCY_TEXT_CLASS, DUE_URGENCY_DOT_CLASS,
} from '../lib/status';
import { todayISO, weekRangeISO, formatDateWithWeekday } from '../lib/date';
import { displayWeekName } from '../lib/weekSort';
import { cn } from '../lib/utils';
import type { Task, AppSettings } from '../types';

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/** 把任务映射到日期：优先修订时间，其次预估时间，其次完成时间 */
function taskToDate(task: Pick<Task, 'revisedDate' | 'estimatedDate' | 'completedAt'>): string | null {
  return task.revisedDate ?? task.estimatedDate ?? task.completedAt ?? null;
}

export default function Calendar() {
  const tasks = useAllTasks();
  const settings = useSettings();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(todayISO());
  const [quickRange, setQuickRange] = useState<'day' | 'week'>('day');
  const [mobileView, setMobileView] = useState<'agenda' | 'month'>('agenda');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const todayStr = todayISO();

  // 把任务按日期分组
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    if (!tasks) return map;
    for (const t of tasks) {
      const d = taskToDate(t);
      if (d) {
        const arr = map.get(d) ?? [];
        arr.push(t);
        map.set(d, arr);
      }
    }
    return map;
  }, [tasks]);

  // 生成月视图的日期网格（周一起始）
  const grid = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    let firstWeekday = firstDay.getDay() - 1;
    if (firstWeekday < 0) firstWeekday = 6;

    const cells: { date: string | null; day: number; isToday: boolean }[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ date: null, day: 0, isToday: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ date: dateStr, day: d, isToday: dateStr === todayStr });
    }
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    while (cells.length < totalCells) cells.push({ date: null, day: 0, isToday: false });
    return cells;
  }, [year, month, todayStr]);

  const week = weekRangeISO();
  const weekTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks
      .filter((t) => {
        const d = taskToDate(t);
        return d && d >= week.start && d <= week.end;
      })
      .sort((a, b) => (taskToDate(a) ?? '').localeCompare(taskToDate(b) ?? '') || a.priority - b.priority);
  }, [tasks, week.start, week.end]);

  const selectedTasks = selectedDate ? (tasksByDate.get(selectedDate) ?? []) : [];
  const panelTasks = quickRange === 'week' ? weekTasks : selectedTasks;

  // 当月统计
  const monthStats = useMemo(() => {
    let total = 0;
    let completed = 0;
    let delayed = 0;
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    for (const [date, list] of tasksByDate.entries()) {
      if (!date.startsWith(prefix)) continue;
      total += list.length;
      completed += list.filter(isDone).length;
      delayed += list.filter(isDelayed).length;
    }
    return { total, completed, delayed };
  }, [tasksByDate, year, month]);

  // 移动端日程：当月按日期分组
  const agendaGroups = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return Array.from(tasksByDate.entries())
      .filter(([date]) => date.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [tasksByDate, year, month]);

  if (!tasks || !settings) return <PageSkeleton />;

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
    setSelectedDate(null);
    setQuickRange('day');
    setDrawerOpen(false);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
    setSelectedDate(null);
    setQuickRange('day');
    setDrawerOpen(false);
  };
  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedDate(todayStr);
    setQuickRange('day');
    setDrawerOpen(false);
  };
  const goThisWeek = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedDate(todayStr);
    setQuickRange('week');
    setDrawerOpen(true);
  };
  const selectDay = (date: string) => {
    setSelectedDate(date);
    setQuickRange('day');
    setDrawerOpen(true);
  };

  const noDateCount = tasks.filter((t) => !taskToDate(t)).length;
  const panelTitle = quickRange === 'week'
    ? '本周任务'
    : selectedDate
      ? formatDateWithWeekday(selectedDate)
      : '选择一天查看任务';

  const renderTask = (t: Task, compact = false) => (
    <CalendarTask
      key={t.id}
      task={t}
      settings={settings}
      compact={compact}
    />
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="日历"
        meta={<Badge className="bg-brand-50 text-brand-700 ring-brand-200">{year}年{MONTH_NAMES[month]}</Badge>}
        subtitle={`当月 ${monthStats.total} 项 · 已完成 ${monthStats.completed}${monthStats.delayed > 0 ? ` · 延期 ${monthStats.delayed}` : ''}`}
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button variant="ghost" className="min-h-9 px-2" onClick={prevMonth} aria-label="上个月">
                <Icon name="chevron-left" className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="min-h-9" onClick={goToday}>今天</Button>
              <Button variant="outline" className="min-h-9" onClick={goThisWeek}>本周</Button>
              <Button variant="ghost" className="min-h-9 px-2" onClick={nextMonth} aria-label="下个月">
                <Icon name="chevron-right" className="h-4 w-4" />
              </Button>
            </div>
          </>
        }
      />

      <Segmented
        className="md:hidden"
        value={mobileView}
        ariaLabel="日历视图"
        options={[
          { value: 'agenda', label: '日程' },
          { value: 'month', label: '月历' },
        ]}
        onChange={setMobileView}
      />

      {/* 移动端日程 */}
      {mobileView === 'agenda' && (
        <div className="space-y-3 md:hidden">
          {agendaGroups.length === 0 ? (
            <Card><EmptyState title="本月还没有排期" hint="切换到月历查看其他日期，或新增带日期的任务。" /></Card>
          ) : (
            agendaGroups.map(([date, list]) => (
              <section key={date}>
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <h2 className={cn('text-sm font-semibold', date === todayStr ? 'text-brand-700' : 'text-slate-700')}>
                    {formatDateWithWeekday(date)}
                  </h2>
                  {date === todayStr && <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-600">今天</span>}
                  <span className="ml-auto text-[10px] text-slate-400">{list.length} 项</span>
                </div>
                <div className="space-y-2">
                  {list.map((t) => renderTask(t, true))}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {/* 月历 + 桌面侧栏 */}
      <div className={cn('grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]', mobileView === 'agenda' && 'hidden md:grid')}>
        <Card className="min-w-0 p-3 sm:p-4">
          <div className="mb-2 grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="py-1 text-center text-[11px] font-medium text-slate-400 sm:text-xs">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell, i) => {
              if (!cell.date) return <div key={i} className="min-h-[54px] rounded-lg bg-slate-50/40 sm:min-h-[84px]" />;
              const dayTasks = tasksByDate.get(cell.date) ?? [];
              const cellDelayed = dayTasks.some(isDelayed);
              const cellTodayDue = dayTasks.some((t) => dueHint(t) === '今天到期');
              const hasOpen = dayTasks.some((t) => !isDone(t));
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => selectDay(cell.date!)}
                  className={cn(
                    'min-h-[54px] rounded-lg border p-1 text-left transition hover:border-brand-300 hover:bg-brand-50/30 sm:min-h-[84px] sm:p-1.5',
                    cell.isToday ? 'border-brand-400 bg-brand-50/40 ring-1 ring-brand-200' : 'border-slate-100 bg-white',
                    cellDelayed && !cell.isToday && 'border-orange-200 bg-orange-50/30',
                    cellTodayDue && !cellDelayed && !cell.isToday && 'border-amber-200 bg-amber-50/20',
                    selectedDate === cell.date && quickRange === 'day' && 'border-brand-500 ring-2 ring-brand-200',
                  )}
                  aria-label={`${cell.date}，${dayTasks.length} 项任务`}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      'text-[11px] font-semibold sm:text-xs',
                      cell.isToday ? 'text-brand-700' : hasOpen ? 'text-slate-700' : 'text-slate-400',
                    )}>
                      {cell.day}
                    </span>
                    {dayTasks.length > 0 && (
                      <span className="rounded-full bg-slate-100 px-1 text-[9px] text-slate-500 sm:text-[10px]">{dayTasks.length}</span>
                    )}
                  </div>

                  {/* 桌面：标题 + 状态点 */}
                  <div className="mt-1 hidden space-y-0.5 sm:block">
                    {dayTasks.slice(0, 2).map((t) => {
                      const ds = displayStatus(t);
                      return (
                        <div key={t.id} className="flex min-w-0 items-center gap-1" title={t.title}>
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT_CLASS[ds])} />
                          <span className={cn('truncate text-[10px] leading-tight', isDone(t) ? 'text-slate-400 line-through' : 'text-slate-600')}>
                            {t.title}
                          </span>
                        </div>
                      );
                    })}
                    {dayTasks.length > 2 && <p className="text-[9px] text-slate-400">+{dayTasks.length - 2} 项</p>}
                  </div>

                  {/* 手机：只留状态点与数量 */}
                  <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                    {dayTasks.slice(0, 4).map((t) => (
                      <span key={t.id} className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT_CLASS[displayStatus(t)])} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* 桌面侧边面板 */}
        <aside className="hidden lg:block">
          <Card className="sticky top-20 max-h-[calc(100vh_-_7rem)] overflow-hidden p-0">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-800">{panelTitle}</h2>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {quickRange === 'week'
                    ? `${week.start} 至 ${week.end} · ${weekTasks.length} 项`
                    : `${panelTasks.length} 项任务`}
                </p>
              </div>
              {quickRange === 'week' ? (
                <button type="button" className="text-[11px] text-brand-600 hover:underline" onClick={goToday}>回到今天</button>
              ) : selectedDate ? (
                <button type="button" className="text-[11px] text-slate-400 hover:text-slate-600" onClick={() => setSelectedDate(null)}>清除</button>
              ) : null}
            </div>
            <div className="max-h-[calc(100vh_-_12rem)] overflow-y-auto p-3">
              {panelTasks.length === 0 ? (
                <EmptyState title="当天没有排期任务" hint="点击月历中的其他日期查看，或新增一条带日期的任务。" />
              ) : (
                <div className="space-y-2">
                  {panelTasks.map((t) => renderTask(t))}
                </div>
              )}
            </div>
          </Card>
        </aside>
      </div>

      {/* 移动端日期抽屉 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
            aria-label="关闭日期详情"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="当天任务"
            className="modal-panel absolute inset-x-0 bottom-0 max-h-[78vh] rounded-t-2xl border-t border-slate-100 bg-white pb-[env(safe-area-inset-bottom)] shadow-xl"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200" />
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-800">
                  {quickRange === 'week' ? '本周任务' : selectedDate ? formatDateWithWeekday(selectedDate) : '当天任务'}
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-400">{panelTasks.length} 项</p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                onClick={() => setDrawerOpen(false)}
                aria-label="关闭"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[62vh] overflow-y-auto p-3">
              {panelTasks.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">当天没有排期任务</p>
              ) : (
                <div className="space-y-2">{panelTasks.map((t) => renderTask(t, true))}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {noDateCount > 0 && (
        <Card className="p-3.5">
          <p className="text-sm text-slate-500">
            另有 <b className="text-slate-700">{noDateCount}</b> 项任务未设置日期（“持续”“待定”等），不会出现在日历中。
            <Link to="/tasks?due=none" className="ml-2 font-medium text-brand-600 hover:underline">查看这些任务 →</Link>
          </p>
        </Card>
      )}
    </div>
  );
}

function CalendarTask({
  task, settings, compact,
}: {
  task: Task;
  settings: AppSettings;
  compact?: boolean;
}) {
  const ds = displayStatus(task);
  const done = isDone(task);
  const delayed = isDelayed(task);
  const hint = dueHint(task);
  const urgency = dueUrgency(task);
  return (
    <div className={cn(
      'rounded-lg border bg-white p-2.5',
      delayed ? 'border-orange-200' : 'border-slate-100',
      compact && 'p-3',
    )}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={done}
          onChange={() => setCompleted(task.id!, !done)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-emerald-600"
          aria-label={done ? '撤销完成' : '标记完成'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={cn('min-w-0 break-words text-sm font-medium leading-snug', done ? 'text-slate-400 line-through' : 'text-slate-800')}>
              {task.title}
            </p>
            <Badge className={STATUS_BADGE_CLASS[ds]}>{DISPLAY_STATUS_LABELS[ds]}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
            <Badge className={priorityBadgeClass(task.priority)}>P{task.priority} {priorityLabel(task.priority, settings)}</Badge>
            <span className="truncate">{task.requester || '未指定需求人'}</span>
            <span className="min-w-0 truncate" title={task.weekName}>{displayWeekName(task.weekName)}</span>
            {task.revisedDateText && <span className="text-amber-600">修订 {task.revisedDateText}</span>}
          </div>
          {hint && (
            <p className={cn('mt-1 inline-flex items-center gap-1 text-[10px] font-medium', DUE_URGENCY_TEXT_CLASS[urgency])}>
              <span className={cn('h-1.5 w-1.5 rounded-full', DUE_URGENCY_DOT_CLASS[urgency])} />
              {hint}
            </p>
          )}
          {task.remark && <p className="mt-1 line-clamp-2 break-words text-[11px] text-slate-500">{task.remark}</p>}
          <div className="mt-1.5 flex justify-end">
            <Link
              to={`/tasks?q=${encodeURIComponent(task.title)}`}
              className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-brand-600"
            >
              在任务页打开
              <Icon name="arrow-right" className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
