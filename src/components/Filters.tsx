import { useEffect, useMemo, useState } from 'react';
import { Input, Select } from './ui';
import { Icon } from './icons';
import type { AppSettings } from '../types';
import { priorityLabel } from '../lib/status';
import { displayWeekName } from '../lib/weekSort';
import { cn } from '../lib/utils';

export interface FilterState {
  week: string;
  requester: string;
  priority: string;
  status: string;
  keyword: string;
  due: string;
  dueFrom: string;
  dueTo: string;
}

export const EMPTY_FILTER: FilterState = {
  week: '',
  requester: '',
  priority: '',
  status: '',
  keyword: '',
  due: '',
  dueFrom: '',
  dueTo: '',
};

/** 当前启用的筛选项数量（日期范围算 1 项） */
export function activeFilterCount(filter: FilterState, includeWeek = true): number {
  let count = 0;
  if (includeWeek && filter.week) count++;
  if (filter.requester) count++;
  if (filter.priority) count++;
  if (filter.status) count++;
  if (filter.keyword.trim()) count++;
  if (filter.due) count++;
  return count;
}

const STATUS_OPTIONS = [
  { value: 'notCompleted', label: '未完成（全部）' },
  { value: 'notStarted', label: '未开始' },
  { value: 'inProgress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'delayed', label: '延期' },
  { value: 'cancelled', label: '取消' },
];

const DUE_OPTIONS = [
  { value: 'overdue', label: '已延期' },
  { value: 'today', label: '今天到期' },
  { value: 'next7', label: '近 7 天到期' },
  { value: 'none', label: '未设置日期' },
  { value: 'custom', label: '自定义日期范围…' },
];

export function FilterBar({
  filter,
  onChange,
  weekNames,
  requesters,
  showWeek = true,
  settings,
  resultCount,
  totalCount,
  className,
  embedded = false,
  showSummary = true,
}: {
  filter: FilterState;
  onChange: (f: FilterState) => void;
  weekNames: string[];
  requesters: string[];
  showWeek?: boolean;
  settings?: AppSettings;
  resultCount?: number;
  totalCount?: number;
  className?: string;
  /** 嵌在任务卡片内部：去掉卡片外壳和阴影 */
  embedded?: boolean;
  /** 是否显示底部的“结果 N 项”汇总行 */
  showSummary?: boolean;
}) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filter, ...patch });
  const [keyword, setKeyword] = useState(filter.keyword);
  const activeCount = activeFilterCount(filter, showWeek);
  // 周筛选通过范围徽标和筛选 chip 已足够可见，高级区只在日期条件启用时自动展开
  const advancedActive = !!filter.due;
  const [advancedOpen, setAdvancedOpen] = useState(advancedActive);

  // URL 变化（清除/搜索/浏览器后退）时同步本地输入
  useEffect(() => { setKeyword(filter.keyword); }, [filter.keyword]);
  useEffect(() => {
    if (advancedActive) setAdvancedOpen(true);
  }, [advancedActive]);

  const chips = useMemo(() => {
    const list: { key: string; label: string; clear: Partial<FilterState> }[] = [];
    if (filter.keyword.trim()) {
      list.push({ key: 'keyword', label: `“${filter.keyword.trim()}”`, clear: { keyword: '' } });
    }
    if (showWeek && filter.week) {
      list.push({ key: 'week', label: displayWeekName(filter.week), clear: { week: '' } });
    }
    if (filter.requester) {
      list.push({ key: 'requester', label: filter.requester, clear: { requester: '' } });
    }
    if (filter.priority) {
      list.push({
        key: 'priority',
        label: `P${filter.priority} ${priorityLabel(Number(filter.priority), settings)}`,
        clear: { priority: '' },
      });
    }
    if (filter.status) {
      const found = STATUS_OPTIONS.find((o) => o.value === filter.status);
      list.push({ key: 'status', label: found?.label ?? filter.status, clear: { status: '' } });
    }
    if (filter.due) {
      const found = DUE_OPTIONS.find((o) => o.value === filter.due);
      const range = filter.due === 'custom' && (filter.dueFrom || filter.dueTo)
        ? `${filter.dueFrom || '不限'} 至 ${filter.dueTo || '不限'}`
        : found?.label ?? filter.due;
      list.push({ key: 'due', label: range, clear: { due: '', dueFrom: '', dueTo: '' } });
    }
    return list;
  }, [filter, settings, showWeek]);

  const clearAll = () => {
    onChange(EMPTY_FILTER);
    setKeyword('');
  };

  return (
    <div className={embedded ? `border-b border-slate-200/70 p-3 ${className ?? ''}` : `card p-3.5 ${className ?? ''}`}>
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:min-w-[220px] lg:max-w-[380px]">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            id="task-keyword-input"
            placeholder="搜索任务名称 / 备注…"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              set({ keyword: e.target.value });
            }}
            className="h-9 pl-9 pr-9"
            aria-label="关键词搜索"
          />
          {keyword && (
            <button
              type="button"
              onClick={() => { setKeyword(''); set({ keyword: '' }); }}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="清空搜索"
            >
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-none lg:items-center">
          <Select
            value={filter.requester}
            onChange={(e) => set({ requester: e.target.value })}
            className="h-9 min-w-0 lg:w-auto lg:min-w-[124px]"
            aria-label="需求人筛选"
          >
            <option value="">全部需求人</option>
            {requesters.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
          <Select
            value={filter.status}
            onChange={(e) => set({ status: e.target.value })}
            className="h-9 min-w-0 lg:w-auto lg:min-w-[126px]"
            aria-label="状态筛选"
          >
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select
            value={filter.priority}
            onChange={(e) => set({ priority: e.target.value })}
            className="h-9 min-w-0 lg:w-auto lg:min-w-[112px]"
            aria-label="优先级筛选"
          >
            <option value="">全部优先级</option>
            <option value="1">P1 {priorityLabel(1, settings)}</option>
            <option value="2">P2 {priorityLabel(2, settings)}</option>
            <option value="3">P3 {priorityLabel(3, settings)}</option>
          </Select>

          <button
            type="button"
            className={cn(
              'col-span-2 flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition sm:col-span-1 lg:justify-start',
              advancedOpen || advancedActive
                ? 'bg-slate-100 text-slate-700'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
            )}
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            aria-controls="advanced-filters"
          >
            <Icon name="filter" className="h-3.5 w-3.5" />
            更多筛选
            {advancedActive && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
            <Icon name="chevron-down" className={cn('h-3.5 w-3.5 text-slate-500 transition-transform', advancedOpen && 'rotate-180')} />
          </button>
        </div>

        {activeCount > 0 && (
          <button
            type="button"
            className="self-start px-1 text-xs font-medium text-slate-500 underline-offset-4 transition hover:text-slate-800 hover:underline lg:ml-auto lg:self-auto"
            onClick={clearAll}
          >
            清除全部
          </button>
        )}
      </div>

      {/* 渐进展示：日期与周等低频条件默认收起 */}
      <div
        id="advanced-filters"
        className={cn(
          'grid overflow-hidden transition-all duration-200',
          advancedOpen ? 'mt-2.5 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
        aria-hidden={!advancedOpen}
        hidden={!advancedOpen}
      >
        <div className="min-h-0">
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50/80 p-2.5">
            <span className="mr-0.5 text-[11px] font-semibold text-slate-500">日期范围</span>
            {showWeek && (
              <Select
                value={filter.week}
                onChange={(e) => set({ week: e.target.value })}
                className="h-8 w-auto min-w-[130px] text-xs"
                aria-label="周筛选"
              >
                <option value="">全部周</option>
                {weekNames.map((w) => (
                  <option key={w} value={w}>{displayWeekName(w)}</option>
                ))}
              </Select>
            )}
            <Select
              value={filter.due}
              onChange={(e) => set({ due: e.target.value, dueFrom: '', dueTo: '' })}
              className="h-8 w-auto min-w-[132px] text-xs"
              aria-label="日期范围筛选"
            >
              <option value="">全部日期</option>
              {DUE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            {filter.due === 'custom' && (
              <>
                <Input
                  type="date"
                  value={filter.dueFrom}
                  onChange={(e) => set({ dueFrom: e.target.value })}
                  className="h-8 w-auto text-xs"
                  aria-label="开始日期"
                />
                <span className="text-xs text-slate-500">至</span>
                <Input
                  type="date"
                  value={filter.dueTo}
                  onChange={(e) => set({ dueTo: e.target.value })}
                  className="h-8 w-auto text-xs"
                  aria-label="结束日期"
                />
              </>
            )}
            {(filter.due || (showWeek && filter.week)) && (
              <button
                type="button"
                className="ml-auto text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                onClick={() => set({ due: '', dueFrom: '', dueTo: '', ...(showWeek ? { week: '' } : {}) })}
              >
                重置日期
              </button>
            )}
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium text-slate-500">已筛选</span>
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-slate-200 bg-white pl-2 pr-1 text-[11px] font-medium text-slate-600"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => set(chip.clear)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label={`移除筛选：${chip.label}`}
              >
                <Icon name="close" className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {resultCount !== undefined && showSummary && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200/60 pt-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 font-medium text-slate-600">
            <Icon name="filter" className="h-3.5 w-3.5 text-slate-500" />
            {activeCount > 0 ? `筛选 ${activeCount} 项` : '未启用筛选'}
          </span>
          <span>
            结果 <b className="num font-semibold text-slate-800">{resultCount}</b>
            {totalCount !== undefined && <span className="text-slate-500"> / 共 {totalCount} 项</span>}
          </span>
          {activeCount > 0 && (
            <button
              type="button"
              className="ml-auto text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
              onClick={clearAll}
            >
              一键清除全部筛选
            </button>
          )}
        </div>
      )}
    </div>
  );
}
