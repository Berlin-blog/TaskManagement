import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';

/**
 * 图表统一色彩体系
 * - 语义色：与全站徽标/状态色保持一致（完成=翡翠绿 / 未完成=琥珀 / 延期=玫瑰红 / 取消=石板灰）
 * - 主色：品牌蓝 brand-600
 * - 分类色：用于优先级等少量类目，色相相邻、明度递减，整体协调
 */
export const CHART_COLORS = {
  brand: '#2548d8',
  brandSoft: '#5b86fb',
  total: '#94a3b8',
  completed: '#10b981',
  completedSoft: '#34d399',
  open: '#f59e0b',
  openSoft: '#fcd34d',
  delayed: '#f97316',
  delayedSoft: '#fb923c',
  cancelled: '#94a3b8',
  grid: '#eef2f7',
  axis: '#94a3b8',
  axisText: '#64748b',
};

/** 优先级分类色：P1 高 / P2 中 / P3 低 —— 与徽标语义一致（玫红→琥珀→灰蓝） */
export const PRIORITY_COLORS = ['#f43f5e', '#f59e0b', '#38bdf8'];

/** 通用分类色：当类目较多且无固定语义时使用，色相相邻渐变 */
export const CATEGORICAL = ['#2548d8', '#5b86fb', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#94a3b8'];

/** Tooltip 内容项 */
interface TooltipItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

/** 统一图表 Tooltip：圆点 + 名称 + 数值，带柔和阴影与圆角 */
export function ChartTooltip({
  active,
  payload,
  label,
  unit,
  formatter,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  unit?: string;
  formatter?: (value: number | string, name: string | number | undefined) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-100 bg-white/95 px-3 py-2 shadow-card backdrop-blur">
      {label !== undefined && label !== '' && (
        <p className="mb-1.5 text-xs font-semibold text-slate-700">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((p, i) => {
          const name = String(p.name ?? p.dataKey ?? '');
          const raw = p.value;
          const value = formatter
            ? formatter(raw as number, name)
            : `${raw}${unit ?? ''}`;
          return (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className="font-semibold text-slate-800">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 图表卡片：标题 + 副标题 + 右侧操作区 + 主体 */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn('card overflow-hidden p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            {title}
          </h3>
          {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/** 圆环图（Donut）：中心显示总数与说明，图例由调用方渲染 */
export function Donut({
  data,
  centerLabel,
  centerValue,
  colors,
  height = 240,
  innerRadius = 58,
  outerRadius = 88,
  padAngle = 3,
  onActive,
  onItemClick,
}: {
  data: { name: string; value: number }[];
  centerLabel?: string;
  centerValue?: string | number;
  colors: string[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  padAngle?: number;
  onActive?: (item: { name: string; value: number } | null) => void;
  onItemClick?: (item: { name: string; value: number }, index: number) => void;
}) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={padAngle}
            stroke="none"
            cornerRadius={6}
            startAngle={90}
            endAngle={-270}
            onMouseLeave={() => onActive?.(null)}
            onClick={(_entry, index) => onItemClick?.(data[index], index)}
            className={onItemClick ? 'cursor-pointer' : undefined}
          >
            {data.map((d, i) => (
              <Cell
                key={d.name}
                fill={colors[i % colors.length]}
                opacity={d.value === 0 ? 0.25 : 1}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* 中心文字 */}
      {(centerValue !== undefined || centerLabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-800">{centerValue}</span>
          {centerLabel && <span className="mt-0.5 text-xs text-slate-400">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

/** 图例条目：圆点 + 名称 + 数值 + 百分比 */
export function LegendItem({
  name,
  value,
  total,
  color,
}: {
  name: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{name}</span>
      <span className="text-xs font-semibold text-slate-800">{value}</span>
      <span className="w-9 text-right text-[11px] text-slate-400">{pct}%</span>
    </div>
  );
}

/**
 * 通用渐变 defs（供柱状/面积图复用）
 * 注意：recharts 的每个 ResponsiveContainer 都会生成独立的 <svg>，
 * 浏览器按文档顺序解析 url(#id)，会命中第一个匹配的 defs。
 * 当同一页面内多个图表都渲染本组件时，重复的 id 会让后渲染的图表
 * 引用到另一个 svg 里的渐变，跨 svg 边界的 fill 不会绘制（柱体不可见）。
 * 因此同页多图时必须通过 idPrefix 给每个实例唯一 id。
 */
export function ChartGradients({ idPrefix = '' }: { idPrefix?: string } = {}) {
  const p = idPrefix;
  return (
    <defs>
      <linearGradient id={`${p}grad-total`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#cbd5e1" />
        <stop offset="100%" stopColor="#94a3b8" />
      </linearGradient>
      <linearGradient id={`${p}grad-completed`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#10b981" />
      </linearGradient>
      <linearGradient id={`${p}grad-open`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fcd34d" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
      <linearGradient id={`${p}grad-delayed`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fb923c" />
        <stop offset="100%" stopColor="#f97316" />
      </linearGradient>
      <linearGradient id={`${p}grad-rate`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#5b86fb" />
        <stop offset="100%" stopColor="#2548d8" />
      </linearGradient>
      <linearGradient id={`${p}grad-rate-area`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2548d8" stopOpacity={0.28} />
        <stop offset="100%" stopColor="#2548d8" stopOpacity={0.02} />
      </linearGradient>
    </defs>
  );
}

/** 指标卡片：图标 + 标签 + 数值 + 强调色条，hover 上浮 */
export function StatCard({
  label,
  value,
  icon,
  accent,
  to,
  hint,
}: {
  label: string;
  value: number | string;
  icon: string;
  accent: string; // e.g. 'from-brand-500 to-brand-600'
  to?: string;
  hint?: string;
}) {
  const inner = (
    <>
      <span className={cn('absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-base shadow-soft', accent)}>
        <span className="opacity-90">{icon}</span>
      </span>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-800">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
      <span className={cn('absolute bottom-0 left-0 h-1 w-full rounded-b-xl bg-gradient-to-r', accent)} />
    </>
  );
  const cls = 'card relative block overflow-hidden p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-card';
  if (to) {
    return <Link to={to} className={cls}>{inner}</Link>;
  }
  return <div className={cls}>{inner}</div>;
}
