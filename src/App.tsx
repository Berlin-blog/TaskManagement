import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import { ToastHost, ConfirmHost } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';

// 路由级懒加载：首屏只加载 Layout + Dashboard，其余按需
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Board = lazy(() => import('./pages/Board'));
const Stats = lazy(() => import('./pages/Stats'));
const Changelog = lazy(() => import('./pages/Changelog'));
const Settings = lazy(() => import('./pages/Settings'));
const ImportExport = lazy(() => import('./pages/ImportExport'));
const Calendar = lazy(() => import('./pages/Calendar'));

/** 统一加载态 */
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-brand-200 border-t-brand-600" />
        <p className="text-sm text-slate-400">加载中…</p>
      </div>
    </div>
  );
}

/** 旧 /week/:weekName 链接兼容：重定向到合并后的任务页 */
function WeekRedirect() {
  const { weekName } = useParams();
  return <Navigate to={`/tasks?week=${encodeURIComponent(weekName ?? '')}`} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
    <>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
          <Route path="/week/:weekName" element={<WeekRedirect />} />
          <Route path="/tasks" element={<Suspense fallback={<PageLoader />}><Tasks /></Suspense>} />
          <Route path="/board" element={<Suspense fallback={<PageLoader />}><Board /></Suspense>} />
          <Route path="/calendar" element={<Suspense fallback={<PageLoader />}><Calendar /></Suspense>} />
          <Route path="/stats" element={<Suspense fallback={<PageLoader />}><Stats /></Suspense>} />
          <Route path="/changelog" element={<Suspense fallback={<PageLoader />}><Changelog /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
          <Route path="/import-export" element={<Suspense fallback={<PageLoader />}><ImportExport /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
    <ToastHost />
    <ConfirmHost />
    </>
    </ErrorBoundary>
  );
}
