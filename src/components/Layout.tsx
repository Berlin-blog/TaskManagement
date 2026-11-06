import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useWeekNames, useConnection, useWeekStats } from '../hooks/useTasks';
import {
  normalizeWeekName, displayWeekName, weekYear, stripWeekYear, pickWeekForYear, hasExplicitWeekYear,
} from '../lib/weekSort';
import { useUIStore } from '../store/uiStore';
import { Modal, Input, Button, toast } from './ui';
import { Icon, type IconName } from './icons';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: IconName;
}

const COMMON_NAV: NavItem[] = [
  { to: '/', label: '仪表盘', short: '仪表盘', icon: 'dashboard' },
  { to: '/tasks', label: '任务', short: '任务', icon: 'tasks' },
  { to: '/board', label: '看板', short: '看板', icon: 'board' },
  { to: '/calendar', label: '日历', short: '日历', icon: 'calendar' },
];

const MANAGE_NAV: NavItem[] = [
  { to: '/stats', label: '统计', short: '统计', icon: 'chart' },
  { to: '/changelog', label: '更新日志', short: '日志', icon: 'history' },
  { to: '/import-export', label: '导入导出', short: '导入', icon: 'import' },
  { to: '/settings', label: '设置', short: '设置', icon: 'settings' },
];

const PAGE_TITLES: Record<string, string> = {
  '/': '仪表盘',
  '/tasks': '任务',
  '/calendar': '日历',
  '/board': '看板',
  '/stats': '统计',
  '/changelog': '更新日志',
  '/import-export': '导入导出',
  '/settings': '设置',
};

const LAST_WEEK_KEY = 'taskLastWeek';

export default function Layout() {
  const weekNames = useWeekNames();
  const weekStats = useWeekStats();
  const { currentWeek, setCurrentWeek } = useUIStore();
  const navigate = useNavigate();
  const location = useLocation();
  const connection = useConnection();
  const [search, setSearch] = useState('');
  const [newWeekOpen, setNewWeekOpen] = useState(false);
  const [newWeekDraft, setNewWeekDraft] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  // 选了「还没有任何周」的年份时记住它，用于预填新建周、显示空态
  const [pendingYear, setPendingYear] = useState<number | null>(null);

  const isManagePath = MANAGE_NAV.some((n) => location.pathname.startsWith(n.to));
  // 任务页自带搜索框，顶栏再放一个会重复占位
  const isTasksPage = location.pathname === '/tasks';

  // 让顶栏周选择器与 URL / 上次选择保持一致
  useEffect(() => {
    const urlWeek = new URLSearchParams(location.search).get('week');
    if (urlWeek) {
      setCurrentWeek(urlWeek);
      try { localStorage.setItem(LAST_WEEK_KEY, urlWeek); } catch { /* ignore */ }
      return;
    }
    if (location.pathname === '/tasks') {
      setCurrentWeek(null);
      try { localStorage.removeItem(LAST_WEEK_KEY); } catch { /* ignore */ }
      return;
    }
    if (!currentWeek) {
      try {
        const stored = localStorage.getItem(LAST_WEEK_KEY);
        if (stored) setCurrentWeek(stored);
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // 搜索框跟随 URL 里的 q
  useEffect(() => {
    setSearch(new URLSearchParams(location.search).get('q') ?? '');
  }, [location.search]);

  useEffect(() => {
    const title = PAGE_TITLES[location.pathname] ?? '任务排期';
    document.title = `${title} · 任务排期`;
  }, [location.pathname]);

  useEffect(() => {
    if (isManagePath) setManageOpen(true);
  }, [isManagePath]);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  // 旧链接 / 旧本地的周名（无年份）自动对齐到库里的规范周名
  useEffect(() => {
    if (!currentWeek || !weekNames || weekNames.length === 0) return;
    if (weekNames.includes(currentWeek)) return;
    const normalized = normalizeWeekName(currentWeek);
    if (normalized !== currentWeek && weekNames.includes(normalized)) setCurrentWeek(normalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeek, weekNames]);

  const parsedWeeks = useMemo(
    () => (weekNames ?? []).map((name) => ({ name, year: weekYear(name) })),
    [weekNames],
  );

  /** 年份列表：数据里出现过的年份 + 前后一年，保证还没建周的年份也能先选 */
  const years = useMemo(() => {
    const set = new Set<number>();
    parsedWeeks.forEach((w) => { if (w.year) set.add(w.year); });
    const now = new Date().getFullYear();
    set.add(now - 1);
    set.add(now);
    set.add(now + 1);
    return Array.from(set).sort((a, b) => a - b);
  }, [parsedWeeks]);

  const activeYear = currentWeek ? weekYear(currentWeek) : pendingYear;
  const weeksInActiveYear = activeYear === null
    ? parsedWeeks
    : parsedWeeks.filter((w) => w.year === activeYear);

  // 已经落到具体周时，清掉「空年份」状态
  useEffect(() => {
    if (currentWeek) setPendingYear(null);
  }, [currentWeek]);

  const goWeek = (week: string | null) => {
    setPendingYear(null);
    setCurrentWeek(week);
    try {
      if (week) localStorage.setItem(LAST_WEEK_KEY, week);
      else localStorage.removeItem(LAST_WEEK_KEY);
    } catch { /* ignore */ }
    navigate(week ? `/tasks?week=${encodeURIComponent(week)}` : '/tasks');
  };

  const createWeek = () => {
    const raw = newWeekDraft.trim();
    if (!raw) {
      toast('请输入周名', { type: 'error' });
      return;
    }
    if (/^\d{4}\s*年?$/.test(raw)) {
      toast('请补全月份和周，如 2027年1月第一周', { type: 'error' });
      return;
    }
    // 选了年份但没写年份时，按当前年份上下文补全，避免「2027 视图下建 1 月」被推断成 2026
    const withYear = hasExplicitWeekYear(raw) || !activeYear ? raw : `${activeYear}年${raw}`;
    const week = normalizeWeekName(withYear);
    setNewWeekOpen(false);
    setNewWeekDraft('');
    goWeek(week);
    toast(`已切换到「${displayWeekName(week)}」，新增任务会默认归入该周`);
  };

  /** 选年：跳到该年最接近今天的周；该年还没有周则直接打开新建 */
  const handleYearChange = (value: string) => {
    if (!value) {
      setPendingYear(null);
      goWeek(null);
      return;
    }
    const year = Number(value);
    const list = (weekNames ?? []).filter((w) => weekYear(w) === year);
    if (list.length === 0) {
      setPendingYear(year);
      setNewWeekDraft('');
      setNewWeekOpen(true);
      return;
    }
    const target = pickWeekForYear(list);
    if (target) goWeek(target);
  };

  // 新建周弹窗里的实时预览：年份上下文 + 输入的周名
  const draftRaw = newWeekDraft.trim();
  const draftWeek = draftRaw
    ? normalizeWeekName(hasExplicitWeekYear(draftRaw) || !activeYear ? draftRaw : `${activeYear}年${draftRaw}`)
    : '';

  const submitSearch = () => {
    const q = search.trim();
    navigate(q ? `/tasks?q=${encodeURIComponent(q)}` : '/tasks');
    setMoreOpen(false);
  };

  const renderWeekOptions = () => (
    <>
      <option value="">{activeYear ? '全部周' : '全部周'}</option>
      {weeksInActiveYear.map(({ name }) => {
        const st = (weekStats ?? []).find((s) => s.week === name);
        const base = activeYear ? stripWeekYear(name, activeYear) : displayWeekName(name);
        const label = st && st.total > 0 ? `${base} · ${st.completed}/${st.total}` : base;
        return <option key={name} value={name}>{label}</option>;
      })}
      {activeYear !== null && weeksInActiveYear.length === 0 && (
        <option value="__empty__" disabled>该年还没有周，点「＋ 新建周…」创建</option>
      )}
      {currentWeek && !(weekNames ?? []).includes(currentWeek) && (
        <option value={currentWeek}>{displayWeekName(currentWeek)}</option>
      )}
      <option value="__new__">＋ 新建周…</option>
    </>
  );

  const handleWeekSelect = (value: string) => {
    if (value === '__new__') {
      setNewWeekDraft('');
      setNewWeekOpen(true);
      return;
    }
    goWeek(value || null);
  };

  const connectionMeta = {
    ok: { dot: 'bg-emerald-500', text: '数据已连接', mobile: '已连接' },
    down: { dot: 'bg-rose-500', text: '连接异常', mobile: '异常' },
    checking: { dot: 'bg-amber-400', text: '连接中…', mobile: '连接中' },
  }[connection];

  const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));

  const currentWeekStats = (weekStats ?? []).find((s) => s.week === currentWeek);
  const currentScopeLabel = currentWeek ? displayWeekName(currentWeek) : (activeYear ? `${activeYear}年 · 全部周` : '全部周');
  const currentScopeMeta = currentWeekStats && currentWeekStats.total > 0
    ? `${currentWeekStats.completed}/${currentWeekStats.total} 已完成`
    : activeYear ? `${weeksInActiveYear.length} 个周` : '跨周查看';

  const renderNavItem = (n: NavItem, compact = false) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.to === '/'}
      className={() => cn(
        compact
          ? 'flex flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[11px] font-medium transition'
          : 'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
        isActive(n.to)
          ? compact ? 'text-brand-700' : 'bg-brand-50/80 text-brand-700'
          : compact ? 'text-slate-500 active:bg-slate-100' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900',
      )}
    >
      {!compact && isActive(n.to) && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-600" />}
      <Icon name={n.icon} className={compact ? 'h-5 w-5' : 'h-[18px] w-[18px] shrink-0'} strokeWidth={isActive(n.to) ? 2.1 : 1.8} />
      <span className={compact ? 'leading-none' : undefined}>{compact ? n.short : n.label}</span>
    </NavLink>
  );

  const yearSelect = (compact = false) => (
    <select
      value={activeYear ?? ''}
      onChange={(e) => handleYearChange(e.target.value)}
      className={cn(
        'min-w-0 cursor-pointer rounded-lg border-0 bg-transparent font-medium text-slate-700 outline-none transition hover:bg-slate-100 focus:bg-slate-100',
        compact ? 'h-8 w-[72px] px-1 text-xs' : 'h-8 w-[84px] px-1.5 text-xs',
      )}
      aria-label="选择年份"
    >
      <option value="">全部年份</option>
      {years.map((y) => (
        <option key={y} value={y}>{y}年</option>
      ))}
    </select>
  );

  const weekSelect = (compact = false) => (
    <select
      value={currentWeek ?? ''}
      onChange={(e) => handleWeekSelect(e.target.value)}
      className={cn(
        'min-w-0 flex-1 cursor-pointer rounded-lg border-0 bg-transparent font-medium text-slate-800 outline-none transition hover:bg-slate-100 focus:bg-slate-100',
        compact ? 'h-8 px-1 text-xs' : 'h-8 px-1.5 text-xs',
      )}
      aria-label="选择当前周"
    >
      {renderWeekOptions()}
    </select>
  );

  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-link">跳到主要内容</a>

      {/* 侧边栏（桌面） */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-slate-200/70 bg-white md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-[0_4px_12px_-4px_rgba(37,72,216,.5)]">
            <Icon name="check" className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-slate-900">任务排期</p>
            <p className="mt-0.5 text-[11px] text-slate-500">个人管理工具</p>
          </div>
        </div>

        {/* 当前工作范围：放在导航上下文中，替代顶栏重复的年份/周控件 */}
        <div className="mx-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold text-slate-500">当前工作周</span>
            <button
              type="button"
              onClick={() => { setNewWeekDraft(''); setNewWeekOpen(true); }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-brand-600"
              title="新建周"
              aria-label="新建周"
            >
              <Icon name="plus" className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-white p-0.5">
            {yearSelect()}
            <span className="h-4 w-px bg-slate-200" />
            {weekSelect()}
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] text-slate-500">
            <span className={cn('h-1.5 w-1.5 rounded-full', connectionMeta.dot, connection === 'checking' && 'animate-pulse')} />
            {currentScopeMeta} · 切换后打开任务页
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="主导航">
          <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-[-0.01em] text-slate-500">工作台</p>
          <div className="space-y-0.5">{COMMON_NAV.map((n) => renderNavItem(n))}</div>

          <button
            type="button"
            onClick={() => setManageOpen((v) => !v)}
            aria-expanded={manageOpen}
            className="mt-5 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:text-slate-700"
          >
            <span>管理</span>
            <Icon name="chevron-down" className={cn('h-3.5 w-3.5 transition-transform', !manageOpen && '-rotate-90')} />
          </button>
          <div className={cn('space-y-0.5 overflow-hidden transition-all', manageOpen ? 'mt-1 opacity-100' : 'max-h-0 opacity-0')}>
            {MANAGE_NAV.map((n) => renderNavItem(n))}
          </div>
        </nav>

        <div className="mx-3 mb-3 rounded-xl border border-slate-200/70 px-3 py-2.5">
          <button
            type="button"
            onClick={() => navigate('/import-export')}
            className="flex w-full items-center gap-2 text-left text-[11px] text-slate-600 transition hover:text-slate-900"
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', connectionMeta.dot, connection === 'checking' && 'animate-pulse')} />
            <span className="flex-1">{connectionMeta.text}</span>
            <Icon name="arrow-right" className="h-3 w-3 text-slate-500" />
          </button>
          <p className="mt-1.5 text-[11px] text-slate-500">数据保存在本地 MySQL</p>
        </div>
      </aside>

      {/* 主区 */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur-md">
          {/* 桌面工具条：只保留全局搜索和连接状态，年份/周已移到侧栏 */}
          <div className="hidden h-[var(--header-height)] items-center gap-4 px-5 md:flex">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <span className="font-medium text-slate-500">任务排期</span>
              <span className="text-slate-300">/</span>
              <span className="truncate font-semibold text-slate-800">{PAGE_TITLES[location.pathname] ?? '任务'}</span>
            </div>

            {!isTasksPage && (
              <div className="relative ml-auto w-full max-w-[360px]">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
                  placeholder="搜索任务名称或备注…"
                  className="input h-9 pl-9 pr-12"
                  aria-label="全局搜索"
                />
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500 lg:block">Enter</kbd>
              </div>
            )}

            <button
              type="button"
              onClick={() => navigate('/import-export')}
              className={cn(
                'flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50',
                isTasksPage && 'ml-auto',
              )}
              title={connection === 'down' ? '数据连接异常，点击检查导入与备份' : '数据连接正常'}
            >
              <span className={cn('h-2 w-2 rounded-full', connectionMeta.dot, connection === 'checking' && 'animate-pulse')} />
              {connectionMeta.text}
            </button>
          </div>

          {/* 移动顶栏：品牌 + 当前范围单入口，搜索与切换收进任务页/范围面板 */}
          <div className="flex h-[var(--header-height)] w-full min-w-0 items-center gap-2 px-3 md:hidden">
            <div className="flex shrink-0 items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
                <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
              </span>
              <span className="hidden text-sm font-semibold text-slate-900 min-[480px]:block">任务排期</span>
            </div>

            <button
              type="button"
              onClick={() => setScopeOpen(true)}
              className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-2 text-xs font-medium text-slate-700 transition active:bg-slate-50"
              aria-haspopup="dialog"
              aria-expanded={scopeOpen}
            >
              <Icon name="calendar" className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate text-left">{currentScopeLabel}</span>
              <Icon name="chevron-down" className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            </button>

            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              title={connectionMeta.text}
              aria-label={connectionMeta.text}
              onClick={() => navigate('/import-export')}
            >
              <span className={cn('h-2 w-2 rounded-full', connectionMeta.dot, connection === 'checking' && 'animate-pulse')} />
            </button>
          </div>

          {connection === 'down' && (
            <div className="flex items-center gap-2 border-t border-rose-100 bg-rose-50 px-4 py-1.5 text-xs text-rose-700">
              <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">无法连接后端服务或 MySQL，请确认服务与数据库正在运行。</span>
              <button type="button" className="shrink-0 font-medium underline underline-offset-2" onClick={() => navigate('/import-export')}>
                检查数据
              </button>
            </div>
          )}
        </header>

        <main
          id="main-content"
          className="mx-auto min-w-0 w-full max-w-[1600px] flex-1 overflow-x-hidden p-4 pb-[calc(5.5rem_+_env(safe-area-inset-bottom))] sm:p-5 md:px-6 md:pb-8 lg:p-6"
        >
          <Outlet />
        </main>
      </div>

      {/* 移动端底部导航 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,.06)] backdrop-blur md:hidden"
        aria-label="移动端主导航"
      >
        <div className="flex h-14 items-stretch gap-0.5">
          {COMMON_NAV.map((n) => renderNavItem(n, true))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[11px] font-medium transition',
              isManagePath ? 'text-brand-700' : 'text-slate-500 active:bg-slate-100',
            )}
          >
            <Icon name="menu" className="h-5 w-5" />
            <span className="leading-none">更多</span>
          </button>
        </div>
      </nav>

      {/* 移动端「更多」底部抽屉 */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
            aria-label="关闭更多菜单"
            onClick={() => setMoreOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="更多功能"
            className="modal-panel absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-slate-100 bg-white px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-xl"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">更多</p>
                <p className="mt-0.5 text-xs text-slate-400">管理、统计与数据工具</p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                onClick={() => setMoreOpen(false)}
                aria-label="关闭"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MANAGE_NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex min-h-[56px] items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium transition',
                    isActive(n.to)
                      ? 'border-brand-200 bg-brand-50 text-brand-700'
                      : 'border-slate-100 bg-slate-50/70 text-slate-600 active:bg-slate-100',
                  )}
                >
                  <Icon name={n.icon} className="h-5 w-5 shrink-0" />
                  {n.label}
                </NavLink>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
              <span className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', connectionMeta.dot)} />
                {connectionMeta.mobile}
              </span>
              <span className="text-slate-400">本地 MySQL</span>
            </div>
          </div>
        </div>
      )}

      {/* 移动端：一个入口切换工作范围，避免顶栏堆叠年份、周与搜索 */}
      <Modal
        open={scopeOpen}
        onClose={() => setScopeOpen(false)}
        title="切换工作范围"
        footer={<Button variant="primary" onClick={() => setScopeOpen(false)}>完成</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-[11px] font-semibold text-slate-500">当前</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{currentScopeLabel}</p>
            <p className="mt-0.5 text-xs text-slate-500">{currentScopeMeta} · 切换后打开任务页</p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">年份</span>
            <select
              value={activeYear ?? ''}
              onChange={(e) => { setScopeOpen(false); handleYearChange(e.target.value); }}
              className="select h-10"
              aria-label="选择年份"
            >
              <option value="">全部年份</option>
              {years.map((y) => <option key={y} value={y}>{y}年</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">周</span>
            <select
              value={currentWeek ?? ''}
              onChange={(e) => { setScopeOpen(false); handleWeekSelect(e.target.value); }}
              className="select h-10"
              aria-label="选择当前周"
            >
              {renderWeekOptions()}
            </select>
          </label>
          <button
            type="button"
            onClick={() => { setScopeOpen(false); setNewWeekDraft(''); setNewWeekOpen(true); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2.5 text-xs font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            新建一个周
          </button>
        </div>
      </Modal>

      <Modal
        open={newWeekOpen}
        onClose={() => setNewWeekOpen(false)}
        title="新建周"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewWeekOpen(false)}>取消</Button>
            <Button variant="primary" onClick={createWeek}>创建并切换</Button>
          </>
        }
      >
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          周由任务自动生成。输入新周名后会切换到该周，新增任务默认归入这里；也可以直接在新增任务弹窗里输入周名。
          <br />
          年份可以省略：{activeYear ? `默认归入 ${activeYear} 年` : '默认按今天推断（未来 3 个月以上算去年）'}，也可以直接写年份，如 <b>2027年1月第一周</b>。
        </p>
        <Input
          autoFocus
          value={newWeekDraft}
          onChange={(e) => setNewWeekDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createWeek(); }}
          placeholder={activeYear ? `如：1月第一周（默认 ${activeYear} 年）` : '如：11月第二周 / 2027年1月第一周'}
        />
        {draftWeek && draftWeek !== draftRaw && (
          <p className="mt-2 text-xs text-brand-600">将创建为「{draftWeek}」</p>
        )}
      </Modal>
    </div>
  );
}
