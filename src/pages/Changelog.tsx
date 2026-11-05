import { useState } from 'react';
import { useChangelogs, useImportLogs, useAllTasks } from '../hooks/useTasks';
import {
  Card, CardTitle, EmptyState, Badge, PageSkeleton, PageHeader, Button, Input,
} from '../components/ui';
import { Icon } from '../components/icons';
import { DISPLAY_STATUS_LABELS } from '../lib/status';
import { displayWeekName } from '../lib/weekSort';
import { cn } from '../lib/utils';
import type { Changelog as ChangelogEntry } from '../types';

const FIELD_LABELS: Record<string, string> = {
  title: '名称',
  requester: '需求人',
  priority: 'P',
  estimatedDate: '预估时间',
  estimatedDateText: '预估时间',
  revisedDate: '修订时间',
  revisedDateText: '修订时间',
  isCompleted: '是否完成',
  completedAt: '完成时间',
  completedAtText: '完成时间',
  remark: '备注',
  status: '状态',
  isPeriodic: '周期标记',
  weekName: '所属周',
};

const FIELD_OPTIONS = Object.entries(FIELD_LABELS);

export default function Changelog() {
  const logs = useChangelogs(300);
  const importLogs = useImportLogs();
  const tasks = useAllTasks();
  const [tab, setTab] = useState<'field' | 'history'>('field');
  const [keyword, setKeyword] = useState('');
  const [week, setWeek] = useState('');
  const [field, setField] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [visibleCount, setVisibleCount] = useState(50);

  const taskMap = new Map<number, string>();
  const weekMap = new Map<number, string>();
  (tasks ?? []).forEach((t) => {
    if (t.id) {
      taskMap.set(t.id, t.title);
      weekMap.set(t.id, t.weekName);
    }
  });

  if (!logs) return <PageSkeleton />;

  const weeks = Array.from(new Set([
    ...(logs ?? []).map((l) => l.weekName || weekMap.get(l.taskId) || '').filter(Boolean),
    ...(tasks ?? []).map((t) => t.weekName),
  ])).sort();

  const formatValue = (fieldName: string, value: string) => {
    if (!value) return '—';
    if (fieldName === 'status') return DISPLAY_STATUS_LABELS[value as keyof typeof DISPLAY_STATUS_LABELS] ?? value;
    if (fieldName === 'isCompleted' || fieldName === 'isPeriodic') return value === 'true' ? '是' : value === 'false' ? '否' : value;
    if (fieldName === 'priority') return `P${value}`;
    return value;
  };

  const sourceLabel = (source: string) =>
    source === 'status' ? '状态' : source === 'import' ? '导入' : '编辑';

  const logWeek = (l: ChangelogEntry) => l.weekName || weekMap.get(l.taskId) || '';
  const logTitle = (l: ChangelogEntry) => l.taskTitle || taskMap.get(l.taskId) || `#${l.taskId}`;

  const filtered = logs.filter((l) => {
    if (week && logWeek(l) !== week) return false;
    if (field && l.field !== field) return false;
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      const hay = [
        logTitle(l), logWeek(l), FIELD_LABELS[l.field] ?? l.field, l.oldValue, l.newValue, sourceLabel(l.source),
      ].join('\n').toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  const visible = filtered.slice(0, visibleCount);
  const hasFilter = !!(week || field || keyword.trim());
  const activeCount = [!!week, !!field, !!keyword.trim()].filter(Boolean).length;

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setKeyword('');
    setWeek('');
    setField('');
    setVisibleCount(50);
  };

  const keywordFilteredImport = (importLogs ?? []).filter((l) => {
    if (!keyword.trim()) return true;
    const kw = keyword.trim().toLowerCase();
    return [l.updatedAt, l.version, l.relatedSheet ?? ''].join('\n').toLowerCase().includes(kw);
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="更新日志"
        subtitle="查看字段变更与导入的历史记录；默认展示最近记录，可筛选后展开长内容。"
        actions={<Badge className="bg-slate-100 text-slate-600 ring-slate-200">{tab === 'field' ? `${filtered.length} 条记录` : `${keywordFilteredImport.length} 条历史`}</Badge>}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('field')}
          className={cn(
            'min-h-9 rounded-lg px-4 text-sm font-medium transition',
            tab === 'field' ? 'bg-brand-600 text-white shadow-soft' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          字段变更
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={cn(
            'min-h-9 rounded-lg px-4 text-sm font-medium transition',
            tab === 'history' ? 'bg-brand-600 text-white shadow-soft' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          历史日志（Sheet2）
        </button>
      </div>

      {tab === 'field' ? (
        <>
          <Card className="p-3">
            <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
              <div className="relative min-w-0 flex-1 md:min-w-[220px]">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={keyword}
                  onChange={(e) => { setKeyword(e.target.value); setVisibleCount(50); }}
                  placeholder="搜索任务、字段或变更内容…"
                  className="pl-9"
                  aria-label="搜索日志"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 md:flex md:flex-none">
                <select
                  value={week}
                  onChange={(e) => { setWeek(e.target.value); setVisibleCount(50); }}
                  className="select min-w-0 md:w-auto md:min-w-[148px]"
                  aria-label="按周筛选"
                >
                  <option value="">全部周</option>
                  {weeks.map((w) => <option key={w} value={w}>{displayWeekName(w)}</option>)}
                </select>
                <select
                  value={field}
                  onChange={(e) => { setField(e.target.value); setVisibleCount(50); }}
                  className="select min-w-0 md:w-auto md:min-w-[124px]"
                  aria-label="按字段筛选"
                >
                  <option value="">全部字段</option>
                  {FIELD_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
              {hasFilter && (
                <Button variant="ghost" className="h-9 shrink-0 text-xs" onClick={clearFilters}>
                  <Icon name="close" className="h-3.5 w-3.5" />
                  清空筛选
                </Button>
              )}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
              <Icon name="filter" className="h-3.5 w-3.5 text-slate-400" />
              <span>{hasFilter ? `筛选 ${activeCount} 项` : '未启用筛选'}</span>
              <span className="text-slate-300">·</span>
              <span>结果 <b className="text-slate-800">{filtered.length}</b> / 共 {logs.length} 条</span>
              <span className="ml-auto text-[11px] text-slate-400">最近 300 条</span>
            </div>
          </Card>

          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <CardTitle className="mb-0">字段变更记录</CardTitle>
              <span className="text-[11px] text-slate-400">默认最近记录 · 长内容可展开</span>
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                title={hasFilter ? '没有匹配的日志' : '暂无变更记录'}
                hint={hasFilter ? '尝试更换关键词、周或字段筛选。' : '编辑任务字段后会自动记录。'}
                action={hasFilter ? <Button variant="outline" onClick={clearFilters}>清除筛选</Button> : undefined}
              />
            ) : (
              <>
                {/* 移动端日志卡片 */}
                <div className="divide-y divide-slate-50 md:hidden">
                  {visible.map((l) => {
                    const isExpanded = expanded.has(l.id ?? 0);
                    const long = l.oldValue.length > 40 || l.newValue.length > 40;
                    return (
                      <div key={l.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-700">{logTitle(l)}</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">
                              {new Date(l.changedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              <span className="mx-1">·</span>
                              {sourceLabel(l.source)}
                            </p>
                          </div>
                          <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{FIELD_LABELS[l.field] ?? l.field}</Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">{logWeek(l) ? displayWeekName(logWeek(l)) : '—'}</p>
                        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-1.5 text-[11px]">
                          <div className={cn('rounded-md bg-rose-50/60 px-2 py-1.5 text-rose-700', !isExpanded && 'line-clamp-2')}>
                            {formatValue(l.field, l.oldValue)}
                          </div>
                          <Icon name="arrow-right" className="mt-1.5 h-3 w-3 text-slate-300" />
                          <div className={cn('rounded-md bg-emerald-50/60 px-2 py-1.5 text-emerald-700', !isExpanded && 'line-clamp-2')}>
                            {formatValue(l.field, l.newValue)}
                          </div>
                        </div>
                        {long && (
                          <button
                            type="button"
                            className="mt-2 text-[11px] font-medium text-brand-600"
                            onClick={() => toggleExpanded(l.id ?? 0)}
                          >
                            {isExpanded ? '收起内容' : '展开全文'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 桌面表格 */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                        <th className="px-3 py-2 font-medium">时间</th>
                        <th className="px-3 py-2 font-medium">任务</th>
                        <th className="px-3 py-2 font-medium">周</th>
                        <th className="px-3 py-2 font-medium">字段</th>
                        <th className="px-3 py-2 font-medium">旧值</th>
                        <th className="px-3 py-2 font-medium">新值</th>
                        <th className="px-3 py-2 font-medium">来源</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((l) => {
                        const isExpanded = expanded.has(l.id ?? 0);
                        const long = l.oldValue.length > 40 || l.newValue.length > 40;
                        return (
                          <tr key={l.id} className="border-b border-slate-50 align-top transition hover:bg-slate-50/40">
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                              {new Date(l.changedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="max-w-[210px] truncate px-3 py-2.5 text-slate-700" title={logTitle(l)}>{logTitle(l)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{logWeek(l) ? displayWeekName(logWeek(l)) : '—'}</td>
                            <td className="px-3 py-2.5">
                              <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{FIELD_LABELS[l.field] ?? l.field}</Badge>
                            </td>
                            <td className={cn('px-3 py-2.5 text-xs text-rose-600', isExpanded ? 'max-w-[260px] whitespace-pre-wrap break-words' : 'max-w-[180px] truncate')}>
                              {formatValue(l.field, l.oldValue)}
                            </td>
                            <td className={cn('px-3 py-2.5 text-xs text-emerald-600', isExpanded ? 'max-w-[260px] whitespace-pre-wrap break-words' : 'max-w-[180px] truncate')}>
                              {formatValue(l.field, l.newValue)}
                              {long && (
                                <button
                                  type="button"
                                  className="ml-2 whitespace-nowrap text-[10px] font-medium text-brand-600 hover:underline"
                                  onClick={() => toggleExpanded(l.id ?? 0)}
                                >
                                  {isExpanded ? '收起' : '展开'}
                                </button>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-400">{sourceLabel(l.source)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filtered.length > visibleCount && (
                  <div className="flex justify-center border-t border-slate-100 p-3">
                    <Button variant="outline" className="min-h-9 text-xs" onClick={() => setVisibleCount((n) => n + 50)}>
                      加载更多（剩余 {filtered.length - visibleCount} 条）
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      ) : (
        <Card className="p-0">
          <div className="border-b border-slate-100 px-4 py-3">
            <CardTitle className="mb-0">历史更新日志（来自 Sheet2）</CardTitle>
          </div>
          {!importLogs ? (
            <div className="p-4"><PageSkeleton rows={4} /></div>
          ) : importLogs.length === 0 ? (
            <EmptyState title="暂无历史日志" hint="导入含 Sheet2 的 Excel 后将自动展示。" />
          ) : (
            <>
              <div className="border-b border-slate-100 p-3">
                <div className="relative">
                  <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜索更新时间、版本或涉及表单…"
                    className="pl-9"
                    aria-label="搜索历史日志"
                  />
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {keywordFilteredImport.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
                    <span className="w-28 shrink-0 text-xs text-slate-500">{l.updatedAt}</span>
                    <Badge className="bg-brand-50 text-brand-700 ring-brand-200">{l.version || '—'}</Badge>
                    <span className="min-w-0 flex-1 text-sm text-slate-600">{l.relatedSheet || '未指定表单'}</span>
                  </div>
                ))}
              </div>
              {keywordFilteredImport.length === 0 && (
                <p className="py-10 text-center text-xs text-slate-400">没有匹配的历史日志</p>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
