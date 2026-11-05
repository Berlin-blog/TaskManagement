import { useEffect, useState } from 'react';
import { Input, Select } from './ui';
import { Icon } from './icons';
import type { AppSettings } from '../types';
import { priorityLabel } from '../lib/status';
import { displayWeekName } from '../lib/weekSort';

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

  // URL 变化（清除/搜索/浏览器后退）时同步本地输入
  useEffect(() => { setKeyword(filter.keyword); }, [filter.keyword]);

  return (
    <div className={embedded ? `border-b border-slate-100 p-2.5 md:p-3 ${className ?? ''}` : `card overflow-visible p-3 ${className ?? ''}`}>
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="relative min-w-0 flex-1 md:min-w-[190px]">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            id="task-keyword-input"
            placeholder="搜索任务名称 / 备注…（按 / 聚焦）"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              set({ keyword: e.target.value });
            }}
            className="h-9 pl-9"
            aria-label="关键词搜索"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
          {showWeek && (
            <Select
              value={filter.week}
              onChange={(e) => set({ week: e.target.value })}
              className="h-9 min-w-0 md:w-auto md:min-w-[126px]"
              aria-label="周筛选"
            >
              <option value="">全部周</option>
              {weekNames.map((w) => (
                <option key={w} value={w}>{displayWeekName(w)}</option>
              ))}
            </Select>
          )}
          <Select
            value={filter.requester}
            onChange={(e) => set({ requester: e.target.value })}
            className="h-9 min-w-0 md:w-auto md:min-w-[118px]"
            aria-label="需求人筛选"
          >
            <option value="">全部需求人</option>
            {requesters.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
          <Select
            value={filter.priority}
            onChange={(e) => set({ priority: e.target.value })}
            className="h-9 min-w-0 md:w-auto md:min-w-[104px]"
            aria-label="优先级筛选"
          >
            <option value="">全部优先级</option>
            <option value="1">P1 {priorityLabel(1, settings)}</option>
            <option value="2">P2 {priorityLabel(2, settings)}</option>
            <option value="3">P3 {priorityLabel(3, settings)}</option>
          </Select>
          <Select
            value={filter.status}
            onChange={(e) => set({ status: e.target.value })}
            className="h-9 min-w-0 md:w-auto md:min-w-[116px]"
            aria-label="状态筛选"
          >
            <option value="">全部状态</option>
            <option value="notCompleted">未完成（全部）</option>
            <option value="notStarted">未开始</option>
            <option value="inProgress">进行中</option>
            <option value="completed">已完成</option>
            <option value="delayed">延期</option>
            <option value="cancelled">取消</option>
          </Select>
          <Select
            value={filter.due}
            onChange={(e) => set({ due: e.target.value, dueFrom: '', dueTo: '' })}
            className="h-9 min-w-0 md:w-auto md:min-w-[122px]"
            aria-label="日期范围筛选"
          >
            <option value="">全部日期</option>
            <option value="overdue">已延期</option>
            <option value="today">今天到期</option>
            <option value="next7">近 7 天到期</option>
            <option value="none">未设置日期</option>
            <option value="custom">自定义日期范围…</option>
          </Select>
        </div>

        {activeCount > 0 && (
          <button
            type="button"
            className="btn-ghost h-9 shrink-0 gap-1 self-start px-2.5 text-xs text-slate-500 md:self-auto"
            onClick={() => onChange(EMPTY_FILTER)}
          >
            <Icon name="close" className="h-3.5 w-3.5" />
            清空筛选
          </button>
        )}
      </div>

      {filter.due === 'custom' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-500">截止日期</span>
          <Input
            type="date"
            value={filter.dueFrom}
            onChange={(e) => set({ dueFrom: e.target.value })}
            className="w-auto text-xs"
            aria-label="开始日期"
          />
          <span className="text-xs text-slate-400">至</span>
          <Input
            type="date"
            value={filter.dueTo}
            onChange={(e) => set({ dueTo: e.target.value })}
            className="w-auto text-xs"
            aria-label="结束日期"
          />
          {(filter.dueFrom || filter.dueTo) && (
            <button
              type="button"
              className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
              onClick={() => set({ dueFrom: '', dueTo: '' })}
            >
              清除日期
            </button>
          )}
        </div>
      )}

      {resultCount !== undefined && showSummary && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 font-medium text-slate-600">
            <Icon name="filter" className="h-3.5 w-3.5 text-slate-400" />
            {activeCount > 0 ? `筛选 ${activeCount} 项` : '未启用筛选'}
          </span>
          <span>
            结果 <b className="font-semibold tabular-nums text-slate-800">{resultCount}</b>
            {totalCount !== undefined && <span className="text-slate-400"> / 共 {totalCount} 项</span>}
          </span>
          {activeCount > 0 && (
            <button
              type="button"
              className="ml-auto text-brand-600 hover:text-brand-700 hover:underline underline-offset-2"
              onClick={() => onChange(EMPTY_FILTER)}
            >
              一键清除全部筛选
            </button>
          )}
        </div>
      )}
    </div>
  );
}
