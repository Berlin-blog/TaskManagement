import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettings, useWeekNames, useWeekTasks, useAllTasks, addTask, generatePeriodicTasks } from '../hooks/useTasks';
import { Button, EmptyState, Modal, toast, confirmAction, PageSkeleton, PageHeader, Badge, Segmented } from '../components/ui';
import { TaskTable } from '../components/TaskTable';
import { TaskForm } from '../components/TaskForm';
import { FilterBar, activeFilterCount, type FilterState } from '../components/Filters';
import { MoreMenu, type MenuItem } from '../components/MoreMenu';
import { Icon } from '../components/icons';
import { displayStatus, isDelayed, isAnomaly, isDone, isOpen, matchesDueRange } from '../lib/status';
import { sortTasks, type SortKey } from '../lib/taskSort';
import { normalizeWeekName, displayWeekName } from '../lib/weekSort';
import { todayISO } from '../lib/date';
import { useUIStore } from '../store/uiStore';
import type { Task } from '../types';

const PAGE_SIZE = 20;

/** 生成周报文本：按需求人分组，含完成情况与延期提醒 */
function buildWeekReport(tasks: Task[], weekName: string): string {
  const total = tasks.length;
  const done = tasks.filter((t) => isDone(t)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const lines: string[] = [];
  lines.push(`【${weekName} 任务周报】共 ${total} 项，已完成 ${done} 项（${pct}%）`);
  lines.push('');

  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.requester || '未指定需求人';
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  for (const [requester, list] of groups) {
    lines.push(`■ ${requester}（${list.filter((t) => isDone(t)).length}/${list.length}）`);
    list
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .forEach((t, i) => {
        let mark: string;
        if (isDone(t)) mark = `✅${t.completedAtText || '已完成'}`;
        else if (t.status === 'cancelled') mark = '❌取消';
        else if (isDelayed(t)) mark = `⚠️延期（预估 ${t.estimatedDateText || '—'}）`;
        else if (t.status === 'inProgress') mark = `🔄进行中（预估 ${t.estimatedDateText || '—'}）`;
        else mark = `◻️未开始（预估 ${t.estimatedDateText || '—'}）`;
        lines.push(`  ${i + 1}. ${t.title}　${mark}${t.remark ? `｜${t.remark}` : ''}`);
      });
    lines.push('');
  }

  const delayedList = tasks.filter((t) => isDelayed(t));
  if (delayedList.length > 0) {
    lines.push(`⚠ 需关注：${delayedList.map((t) => `${t.title}（${t.requester || '—'}）`).join('、')}`);
  }
  return lines.join('\n').trimEnd();
}

function parseSort(value: string | null): SortKey {
  return value === 'priority' || value === 'estimatedDate' || value === 'completedAt' || value === 'seq' || value === 'smart'
    ? value
    : 'smart';
}

type TaskView = 'open' | 'all';

export default function Tasks() {
  const settings = useSettings();
  const weekNames = useWeekNames();
  const [searchParams, setSearchParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const urlWeek = useMemo(() => {
    const raw = searchParams.get('week') ?? '';
    if (!raw) return '';
    if (!weekNames || weekNames.includes(raw)) return raw;
    // 兼容旧链接：URL 里可能是不带年份的周名（9月第二周），对齐到库里的规范周名
    const normalized = normalizeWeekName(raw);
    return weekNames.includes(normalized) ? normalized : raw;
  }, [searchParams, weekNames]);
  const keyword = searchParams.get('q') ?? '';
  const requester = searchParams.get('requester') ?? '';
  const priority = searchParams.get('priority') ?? '';
  const status = searchParams.get('status') ?? '';
  const due = searchParams.get('due') ?? '';
  const dueFrom = searchParams.get('dueFrom') ?? '';
  const dueTo = searchParams.get('dueTo') ?? '';
  const sortKey = parseSort(searchParams.get('sort'));
  const sortDesc = searchParams.get('desc') === '1';
  const pageParam = Math.max(Number(searchParams.get('page')) || 1, 1);
  // 默认只看待办：已完成任务不再挤占首屏，需要时一键切到「全部」
  const view: TaskView = searchParams.get('view') === 'all' ? 'all' : 'open';

  const viewWeek = urlWeek || '全部';
  const isWeekMode = viewWeek !== '全部';

  const allTasks = useAllTasks(!isWeekMode);
  const weekTasks = useWeekTasks(isWeekMode ? viewWeek : null);
  const tasks = isWeekMode ? weekTasks : allTasks;

  const sortedWeeks = useMemo(() => weekNames ?? [], [weekNames]);
  const curIdx = sortedWeeks.indexOf(viewWeek);

  /** 统一写 URL；replace 避免每次筛选都产生一条历史 */
  const updateParams = (patch: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  };

  const setViewWeek = (week: string) => {
    updateParams({ week: week === '全部' ? null : week, page: null });
    useUIStore.getState().setCurrentWeek(week === '全部' ? null : week);
    try {
      if (week === '全部') localStorage.removeItem('taskLastWeek');
      else localStorage.setItem('taskLastWeek', week);
    } catch { /* ignore */ }
  };

  const finishedOnly = status === 'completed' || status === 'cancelled';
  // 状态筛选已经锁定“已完成/取消”时，实际展示的是全部，视图按钮随之对齐
  const effectiveView: TaskView = finishedOnly ? 'all' : view;

  const setView = (next: TaskView) => {
    updateParams({
      view: next === 'all' ? 'all' : null,
      ...(next === 'open' && finishedOnly ? { status: null } : {}),
      page: null,
    });
  };

  const setFilter = (f: FilterState) => {
    const finishedOnly = f.status === 'completed' || f.status === 'cancelled';
    updateParams({
      q: f.keyword || null,
      requester: f.requester || null,
      priority: f.priority || null,
      status: f.status || null,
      due: f.due || null,
      dueFrom: f.dueFrom || null,
      dueTo: f.dueTo || null,
      // 只看已完成/取消时自动切到「全部」，避免和「待办」视图互相矛盾
      ...(finishedOnly ? { view: 'all' } : {}),
      page: null,
    });
  };

  const filter: FilterState = {
    week: urlWeek,
    requester,
    priority,
    status,
    keyword,
    due,
    dueFrom,
    dueTo,
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      updateParams({ sort: key, desc: sortDesc ? null : '1', page: null });
    } else {
      updateParams({ sort: key, desc: null, page: null });
    }
  };

  const resetSort = () => updateParams({ sort: null, desc: null, page: null });

  const setPage = (page: number) => {
    updateParams({ page: page <= 1 ? null : String(page) });
  };

  // 旧链接自动改写成规范周名，刷新/分享后保持一致
  useEffect(() => {
    const raw = searchParams.get('week') ?? '';
    if (!raw || !urlWeek || raw === urlWeek) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('week', urlWeek);
      return next;
    }, { replace: true });
  }, [searchParams, urlWeek, setSearchParams]);

  // `/` 快捷聚焦搜索框
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      document.getElementById('task-keyword-input')?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 左右箭头翻周（选中具体周时有效）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (viewWeek === '全部') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft' && curIdx > 0) setViewWeek(sortedWeeks[curIdx - 1]);
      else if (e.key === 'ArrowRight' && curIdx >= 0 && curIdx < sortedWeeks.length - 1) setViewWeek(sortedWeeks[curIdx + 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curIdx, viewWeek, sortedWeeks.join('|')]);

  if (!tasks || !settings) return <PageSkeleton />;

  const requesters = Array.from(new Set(tasks.map((t) => t.requester).filter(Boolean)));
  const matchesFilters = (t: Task, ignoreView: boolean) => {
    if (requester && t.requester !== requester) return false;
    if (priority && t.priority !== Number(priority)) return false;
    if (status) {
      if (status === 'notCompleted') {
        if (isDone(t) || t.status === 'cancelled') return false;
      } else if (displayStatus(t) !== status) {
        return false;
      }
    } else if (!ignoreView && effectiveView === 'open' && !isOpen(t)) {
      // 待办视图：完成/取消的任务先收起；显式选了状态时以状态筛选为准
      return false;
    }
    if (!matchesDueRange(t, due, dueFrom, dueTo)) return false;
    if (keyword) {
      const kw = keyword.toLowerCase();
      if (!t.title.toLowerCase().includes(kw) && !t.remark.toLowerCase().includes(kw)) return false;
    }
    return true;
  };

  const filtered = tasks.filter((t) => matchesFilters(t, false));
  const hiddenDone = effectiveView === 'open' && !status
    ? tasks.filter((t) => matchesFilters(t, true) && !isOpen(t)).length
    : 0;

  const sorted = sortTasks(filtered, sortKey, sortDesc, isWeekMode ? undefined : sortedWeeks);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(pageParam, totalPages);
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openCount = tasks.filter((t) => isOpen(t)).length;
  const completed = tasks.filter((t) => isDone(t)).length;
  const delayed = tasks.filter((t) => isDelayed(t)).length;
  const anomalies = tasks.filter((t) => isAnomaly(t)).length;
  const filterCount = activeFilterCount(filter, false);
  const hasFilter = filterCount > 0;

  const reportText = isWeekMode ? buildWeekReport(sorted, displayWeekName(viewWeek)) : '';

  const secondaryActions: MenuItem[] = [];
  if (isWeekMode) {
    secondaryActions.push(
      {
        label: '生成周期任务',
        icon: 'refresh',
        onClick: async () => {
          const ok = await confirmAction({
            title: '生成周期任务',
            message: `将所有周期任务（周报、动销金额等）生成到「${viewWeek}」？\n已存在的同名任务会自动跳过。`,
            confirmText: '生成',
          });
          if (ok) await generatePeriodicTasks(viewWeek);
        },
      },
      {
        label: '预览周报文本',
        icon: 'eye',
        onClick: () => setReportOpen(true),
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        className="shrink-0"
        title="任务"
        subtitle="按工作周组织任务；先处理延期与未完成，再查看已完成记录。"
        scope={
          <>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand-50 px-2.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200/80">
              <Icon name="calendar" className="h-3.5 w-3.5" />
              {isWeekMode ? displayWeekName(viewWeek) : '全部周'}
            </span>
            <Segmented
              value={effectiveView}
              onChange={setView}
              ariaLabel="任务范围"
              options={[
                { value: 'open', label: '待办', count: openCount },
                { value: 'all', label: '全部', count: tasks.length },
              ]}
            />
            {delayed > 0 && (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-orange-50 px-2.5 text-[11px] font-semibold text-orange-700 ring-1 ring-inset ring-orange-200/80">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                {delayed} 项延期
              </span>
            )}
            {anomalies > 0 && (
              <span className="inline-flex h-7 items-center rounded-full bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200/80">
                待补完成时间 {anomalies}
              </span>
            )}
            {hasFilter && (
              <span className="num text-xs text-slate-500">
                筛选后 <b className="font-semibold text-slate-700">{filtered.length}</b> 项
              </span>
            )}
          </>
        }
        actions={
          <>
            {secondaryActions.length > 0 && (
              <MoreMenu
                items={secondaryActions}
                label="更多任务操作"
                trigger={<span className="px-1.5 text-xs font-medium">更多</span>}
                buttonClassName="h-9 border border-slate-200 bg-white px-1"
              />
            )}
            {filtered.length > 0 && (
              <Button
                variant="outline"
                className="min-h-9"
                onClick={async () => {
                  try {
                    const { downloadBlob, exportAllXlsx } = await import('../lib/excel');
                    downloadBlob(
                      exportAllXlsx(sorted),
                      isWeekMode ? `${viewWeek}.xlsx` : `任务筛选-${todayISO()}.xlsx`,
                    );
                  } catch (e) {
                    toast(`导出失败：${(e as Error).message}`, { type: 'error' });
                  }
                }}
                title="把当前筛选结果导出为 Excel"
              >
                <Icon name="download" className="h-4 w-4" />
                导出
              </Button>
            )}
            <Button variant="primary" className="min-h-9" onClick={() => setFormOpen(true)}>
              <Icon name="plus" className="h-4 w-4" />
              新增任务
            </Button>
          </>
        }
      />

      <div className="card flex min-h-0 flex-col overflow-visible md:max-h-[calc(100dvh-14rem)]">
        <FilterBar
          filter={filter}
          onChange={(f) => { setFilter(f); }}
          weekNames={weekNames ?? []}
          requesters={requesters}
          showWeek={false}
          settings={settings}
          embedded
          showSummary={false}
        />

        {pageItems.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              title={
                hasFilter
                  ? '没有匹配的任务'
                  : effectiveView === 'open' && hiddenDone > 0
                    ? '没有待办任务'
                    : '当前范围还没有任务'
              }
              hint={
                hasFilter
                  ? '可以尝试减少筛选条件，或一键清除全部筛选。'
                  : effectiveView === 'open' && hiddenDone > 0
                    ? '这一范围的任务都完成了，可以切换到「全部」回看已完成记录。'
                    : isWeekMode
                      ? '新增一条任务，或用“更多 → 生成周期任务”一键带入。'
                      : '新增任务，或导入 Excel 开始使用。'
              }
              action={
                <>
                  {hasFilter && <Button variant="outline" onClick={() => setFilter({ week: urlWeek, requester: '', priority: '', status: '', keyword: '', due: '', dueFrom: '', dueTo: '' })}>清除筛选</Button>}
                  {!hasFilter && effectiveView === 'open' && hiddenDone > 0 && (
                    <Button variant="outline" onClick={() => updateParams({ view: 'all', page: null })}>
                      查看全部（{completed} 项已完成）
                    </Button>
                  )}
                  <Button variant="primary" onClick={() => setFormOpen(true)}>
                    <Icon name="plus" className="h-4 w-4" />
                    新增任务
                  </Button>
                </>
              }
            />
          </div>
        ) : (
          <TaskTable
            embedded
            tasks={pageItems}
            settings={settings}
            weekNames={weekNames ?? []}
            showWeek={!isWeekMode}
            sortKey={sortKey}
            sortDesc={sortDesc}
            onToggleSort={toggleSort}
            onResetSort={resetSort}
            hiddenDone={hiddenDone}
            onShowAll={() => updateParams({ view: 'all', page: null })}
            scopeKey={`${viewWeek}|${effectiveView}|${keyword}|${requester}|${priority}|${status}|${due}|${dueFrom}|${dueTo}|${currentPage}|${sortKey}|${sortDesc}`}
          />
        )}

        {totalPages > 1 && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            <span>
              第 <b className="font-semibold text-slate-700">{currentPage}</b> / {totalPages} 页 · 共 {sorted.length} 项
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" className="min-h-8 px-2 text-xs" disabled={currentPage <= 1} onClick={() => setPage(1)}>首页</Button>
              <Button variant="ghost" className="min-h-8 px-2 text-xs" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹ 上一页</Button>
              <Button variant="ghost" className="min-h-8 px-2 text-xs" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>下一页 ›</Button>
              <Button variant="ghost" className="min-h-8 px-2 text-xs" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>末页</Button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`周报预览 - ${displayWeekName(viewWeek)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>关闭</Button>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(reportText);
                  toast('周报已复制到剪贴板');
                  setReportOpen(false);
                } catch {
                  const ta = document.getElementById('week-report-text') as HTMLTextAreaElement | null;
                  if (ta) {
                    ta.focus();
                    ta.select();
                    document.execCommand('copy');
                    toast('周报已复制');
                  }
                }
              }}
            >
              📋 复制全文
            </Button>
          </>
        }
      >
        <textarea
          id="week-report-text"
          readOnly
          value={reportText}
          className="h-[360px] w-full rounded-lg border border-slate-200 p-3 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <p className="mt-2 text-[11px] text-slate-400">按需求人分组，含完成情况与延期提醒，可直接粘贴到微信/邮件。</p>
      </Modal>

      <TaskForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        weekName={isWeekMode ? viewWeek : (weekNames?.[weekNames.length - 1] ?? '')}
        weekNames={weekNames ?? []}
        settings={settings}
        onSave={async (t) => { await addTask(t); }}
      />
    </div>
  );
}
