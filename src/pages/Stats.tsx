import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllTasks, useSettings, useWeekNames } from '../hooks/useTasks';
import {
  Card, EmptyState, PageSkeleton, PageHeader, Button,
} from '../components/ui';
import { Icon } from '../components/icons';
import {
  ChartCard, ChartTooltip, Donut, LegendItem, CHART_COLORS, PRIORITY_COLORS,
} from '../components/ChartKit';
import {
  isDelayed, isDone, isOpen, completionRate, priorityLabel,
} from '../lib/status';
import { shortWeekLabel, displayWeekName, weekYear } from '../lib/weekSort';
import { cn } from '../lib/utils';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

function OverviewStat({
  label, value, sub, dot, to,
}: {
  label: string;
  value: string | number;
  sub?: string;
  dot: string;
  to?: string;
}) {
  const navigate = useNavigate();
  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        <span className={cn('h-2.5 w-2.5 rounded-full', dot)} />
        <span className="text-xs font-medium text-slate-600">{label}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="num text-2xl font-semibold tracking-tight text-slate-900">{value}</span>
        {to && <Icon name="arrow-right" className="mb-1 h-3.5 w-3.5 text-slate-300" />}
      </div>
      {sub && <span className="mt-0.5 block text-[11px] text-slate-400">{sub}</span>}
    </>
  );
  if (!to) return <div className="card p-4">{inner}</div>;
  return (
    <button type="button" onClick={() => navigate(to)} className="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-card">
      {inner}
    </button>
  );
}

export default function Stats() {
  const tasks = useAllTasks();
  const settings = useSettings();
  const weekNames = useWeekNames();
  const navigate = useNavigate();
  const [year, setYear] = useState('all');
  const [week, setWeek] = useState('all');
  const [requester, setRequester] = useState('all');

  const years = useMemo(() => {
    const set = new Set<number>();
    (weekNames ?? []).forEach((w) => { const y = weekYear(w); if (y) set.add(y); });
    return Array.from(set).sort((a, b) => b - a);
  }, [weekNames]);

  const weeksInYear = useMemo(
    () => (weekNames ?? []).filter((w) => year === 'all' || weekYear(w) === Number(year)),
    [weekNames, year],
  );

  useEffect(() => {
    if (week !== 'all' && !weeksInYear.includes(week)) setWeek('all');
  }, [week, weeksInYear]);

  if (!tasks || !settings) return <PageSkeleton />;

  const requesters = Array.from(new Set(tasks.map((t) => t.requester).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const filtered = tasks.filter((t) => {
    if (year !== 'all' && weekYear(t.weekName) !== Number(year)) return false;
    if (week !== 'all' && t.weekName !== week) return false;
    if (requester !== 'all' && (t.requester || '未指定') !== requester) return false;
    return true;
  });

  const total = filtered.length;
  const completed = filtered.filter(isDone).length;
  const notCompleted = filtered.filter(isOpen).length;
  const delayed = filtered.filter(isDelayed).length;
  const cancelled = filtered.filter((t) => t.status === 'cancelled').length;
  const rate = completionRate(total, completed);

  const byWeek = (year === 'all' ? (weekNames ?? []) : weeksInYear).map((w) => {
    const ws = filtered.filter((t) => t.weekName === w);
    const done = ws.filter(isDone).length;
    return {
      week: w,
      总数: ws.length,
      已完成: done,
      延期: ws.filter(isDelayed).length,
      完成率: completionRate(ws.length, done),
    };
  }).filter((w) => w.总数 > 0);

  const byP = [1, 2, 3].map((p) => ({
    name: `P${p} ${priorityLabel(p, settings)}`,
    value: filtered.filter((t) => t.priority === p).length,
  }));
  const pTotal = byP.reduce((s, x) => s + x.value, 0);

  const requesterMap = new Map<string, { total: number; done: number; delayed: number }>();
  filtered.forEach((t) => {
    const r = t.requester || '未指定';
    const cur = requesterMap.get(r) ?? { total: 0, done: 0, delayed: 0 };
    cur.total++;
    if (isDone(t)) cur.done++;
    if (isDelayed(t)) cur.delayed++;
    requesterMap.set(r, cur);
  });
  const byRequester = Array.from(requesterMap.entries())
    .map(([name, v]) => ({
      name,
      ...v,
      other: Math.max(0, v.total - v.done - v.delayed),
      rate: completionRate(v.total, v.done),
    }))
    .sort((a, b) => b.total - a.total);

  const buildTaskUrl = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams();
    if (week !== 'all') q.set('week', week);
    if (requester !== 'all') q.set('requester', requester);
    Object.entries(extra).forEach(([k, v]) => q.set(k, v));
    const s = q.toString();
    return s ? `/tasks?${s}` : '/tasks';
  };
  const openWeek = (w: string) => {
    const q = new URLSearchParams({ week: w });
    if (requester !== 'all') q.set('requester', requester);
    navigate(`/tasks?${q.toString()}`);
  };

  const hasFilters = year !== 'all' || week !== 'all' || requester !== 'all';
  const activeCount = [year !== 'all', week !== 'all', requester !== 'all'].filter(Boolean).length;

  const clearFilters = () => {
    setYear('all');
    setWeek('all');
    setRequester('all');
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="统计"
        subtitle="先看概览，再从周趋势、需求人和优先级三个角度分析；所有图表都可下钻到任务明细。"
        scope={
          <>
            <span className="num inline-flex h-7 items-center rounded-full bg-slate-100 px-2.5 text-xs font-semibold text-slate-700">
              {total} 项任务
            </span>
            <span className="text-xs text-slate-500">
              {activeCount > 0 ? `已应用 ${activeCount} 个筛选` : '全部数据范围'}
            </span>
          </>
        }
      />

      {/* 统一筛选 */}
      <Card className="p-3.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="grid flex-1 grid-cols-2 gap-2 sm:flex sm:flex-none">
            <select
              value={year}
              onChange={(e) => { setYear(e.target.value); setWeek('all'); }}
              className="select min-w-0"
              aria-label="年份筛选"
            >
              <option value="all">全部年份</option>
              {years.map((y) => <option key={y} value={y}>{y}年</option>)}
            </select>
            <select
              value={week}
              onChange={(e) => setWeek(e.target.value)}
              className="select min-w-0"
              aria-label="周筛选"
            >
              <option value="all">全部周</option>
              {weeksInYear.map((w) => <option key={w} value={w}>{displayWeekName(w)}</option>)}
            </select>
            <select
              value={requester}
              onChange={(e) => setRequester(e.target.value)}
              className="select col-span-2 min-w-0 sm:col-span-1"
              aria-label="需求人筛选"
            >
              <option value="all">全部需求人</option>
              {requesters.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between gap-2 sm:ml-auto">
            <span className="text-xs text-slate-500">
              {activeCount > 0 ? `筛选 ${activeCount} 项 · ` : ''}结果 <b className="text-slate-800">{total}</b> / 共 {tasks.length} 项
            </span>
            {hasFilters && (
              <Button variant="ghost" className="h-8 shrink-0 text-xs" onClick={clearFilters}>清除筛选</Button>
            )}
          </div>
        </div>
      </Card>

      {total === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="chart" className="h-5 w-5 text-brand-500" />}
            title="当前筛选下没有数据"
            hint="尝试切换年份、周或需求人，或清除全部筛选后再看图表。"
            action={<Button variant="outline" onClick={clearFilters}>清除筛选</Button>}
          />
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-800">概览</h2>
                <p className="mt-0.5 text-xs text-slate-400">当前筛选范围的关键数字</p>
              </div>
              {cancelled > 0 && <span className="text-[11px] text-slate-400">含取消 {cancelled} 项（不计入完成）</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <OverviewStat label="总任务数" value={total} dot="bg-slate-400" sub="含取消" to={buildTaskUrl()} />
              <OverviewStat label="已完成" value={completed} dot="bg-emerald-500" sub={`占比 ${rate}%`} to={buildTaskUrl({ status: 'completed' })} />
              <OverviewStat label="未完成" value={notCompleted} dot="bg-amber-500" sub="进行中 / 未开始" to={buildTaskUrl({ status: 'notCompleted' })} />
              <OverviewStat label="延期" value={delayed} dot="bg-orange-500" sub="已过截止日期" to={buildTaskUrl({ status: 'delayed' })} />
              <div className="card col-span-2 p-4 sm:col-span-1">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
                  <span className="text-xs text-slate-500">完成率</span>
                </div>
                <div className="mt-2 text-2xl font-bold tracking-tight text-slate-800 tabular-nums">{rate}%</div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${rate}%` }} />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-800">分析</h2>
                <p className="mt-0.5 text-xs text-slate-400">图表与条目均可点击跳转到对应任务</p>
              </div>
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                <Icon name="eye" className="h-3.5 w-3.5" />
                点击查看明细
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard
                title="周趋势"
                subtitle="各周任务量、延期与完成率"
                action={
                  <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-slate-400" />总数</span>
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-orange-500" />延期</span>
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-brand-600" />完成率</span>
                  </div>
                }
              >
                {byWeek.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-sm font-medium text-slate-700">当前范围暂无周数据</p>
                    <p className="mt-1 text-xs text-slate-500">导入或新增带周的任务后，这里会显示周趋势。</p>
                    <button type="button" onClick={hasFilters ? clearFilters : () => navigate('/tasks')} className="mt-3 text-xs font-semibold text-brand-600 hover:underline">
                      {hasFilters ? '清除筛选 →' : '去任务页查看 →'}
                    </button>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={byWeek} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: CHART_COLORS.axisText }} tickFormatter={(v: string) => shortWeekLabel(v)} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: CHART_COLORS.axisText }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: CHART_COLORS.axisText }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar
                        yAxisId="left"
                        dataKey="总数"
                        fill={CHART_COLORS.total}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={26}
                        cursor="pointer"
                        onClick={(data: unknown) => {
                          const item = data as { payload?: { week?: string }; week?: string };
                          const w = item?.payload?.week ?? item?.week;
                          if (w) openWeek(w);
                        }}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="延期"
                        fill={CHART_COLORS.delayedSoft}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={26}
                        cursor="pointer"
                        onClick={(data: unknown) => {
                          const item = data as { payload?: { week?: string }; week?: string };
                          const w = item?.payload?.week ?? item?.week;
                          if (w) {
                            const q = new URLSearchParams({ week: w, status: 'delayed' });
                            navigate(`/tasks?${q.toString()}`);
                          }
                        }}
                      />
                      <Line yAxisId="right" type="monotone" dataKey="完成率" stroke={CHART_COLORS.brand} strokeWidth={2.5} dot={{ r: 2.5, fill: CHART_COLORS.brand }} activeDot={{ r: 4.5 }} unit="%" />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="优先级分布" subtitle="点击扇区查看对应任务">
                <div className="grid items-center gap-4 sm:grid-cols-2">
                  <Donut
                    data={byP}
                    colors={PRIORITY_COLORS}
                    centerValue={pTotal}
                    centerLabel="任务总数"
                    height={240}
                    onItemClick={(_item, index) => {
                      navigate(buildTaskUrl({ priority: String(index + 1) }));
                    }}
                  />
                  <div className="space-y-0.5">
                    {byP.map((d, i) => (
                      <button
                        key={d.name}
                        type="button"
                        className="w-full rounded-lg text-left transition hover:bg-slate-50"
                        onClick={() => navigate(buildTaskUrl({ priority: String(i + 1) }))}
                      >
                        <LegendItem name={d.name} value={d.value} total={pTotal} color={PRIORITY_COLORS[i]} />
                      </button>
                    ))}
                  </div>
                </div>
              </ChartCard>
            </div>

            <ChartCard
              title="需求人分布"
              subtitle="任务量、完成情况与延期构成"
              action={<span className="text-[11px] text-slate-400">按任务量排序</span>}
            >
              {byRequester.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-slate-700">暂无需求人数据</p>
                  <p className="mt-1 text-xs text-slate-500">给任务补充需求人后，可按人查看任务量与完成率。</p>
                  <button type="button" onClick={() => navigate('/tasks')} className="mt-3 text-xs font-semibold text-brand-600 hover:underline">去任务页查看 →</button>
                </div>
              ) : (
                <>
                  {/* 移动端卡片列表 */}
                  <div className="space-y-2 md:hidden">
                    {byRequester.map((r) => (
                      <button
                        key={r.name}
                        type="button"
                        onClick={() => navigate(buildTaskUrl({ requester: r.name === '未指定' ? '' : r.name }))}
                        className="w-full rounded-lg border border-slate-100 p-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-slate-700">{r.name}</span>
                          <span className="text-xs text-slate-500">{r.total} 项 · {r.rate}%</span>
                        </div>
                        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
                          <span className="h-full bg-emerald-500" style={{ width: `${(r.done / (r.total || 1)) * 100}%` }} />
                          <span className="h-full bg-orange-500" style={{ width: `${(r.delayed / (r.total || 1)) * 100}%` }} />
                          <span className="h-full bg-amber-400" style={{ width: `${(r.other / (r.total || 1)) * 100}%` }} />
                        </div>
                        <div className="mt-1.5 flex gap-3 text-[10px] text-slate-400">
                          <span>完成 {r.done}</span>
                          <span>延期 {r.delayed}</span>
                          <span>其他 {r.other}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* 桌面表格 */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                          <th className="px-3 py-2 font-medium">需求人</th>
                          <th className="px-3 py-2 text-right font-medium">任务量</th>
                          <th className="px-3 py-2 text-right font-medium">已完成</th>
                          <th className="px-3 py-2 text-right font-medium">延期</th>
                          <th className="px-3 py-2 font-medium">任务构成</th>
                          <th className="px-3 py-2 text-right font-medium">完成率</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {byRequester.map((r) => (
                          <tr key={r.name} className="border-b border-slate-50 transition hover:bg-slate-50/60">
                            <td className="px-3 py-2.5 font-medium text-slate-700">{r.name}</td>
                            <td className="px-3 py-2.5 text-right text-slate-700">{r.total}</td>
                            <td className="px-3 py-2.5 text-right text-emerald-600">{r.done}</td>
                            <td className="px-3 py-2.5 text-right text-orange-600">{r.delayed}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex h-2 w-40 overflow-hidden rounded-full bg-slate-100">
                                <span className="h-full bg-emerald-500" style={{ width: `${(r.done / (r.total || 1)) * 100}%` }} />
                                <span className="h-full bg-orange-500" style={{ width: `${(r.delayed / (r.total || 1)) * 100}%` }} />
                                <span className="h-full bg-amber-400" style={{ width: `${(r.other / (r.total || 1)) * 100}%` }} />
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{r.rate}%</td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                className="text-xs text-brand-600 hover:underline"
                                onClick={() => navigate(buildTaskUrl({ requester: r.name === '未指定' ? '' : r.name }))}
                              >
                                查看
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </ChartCard>
          </section>
        </>
      )}
    </div>
  );
}
