import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import { Toast } from './components/Toast';
import { api, setToken, getToken } from './lib/api';
import LoadingScreen from './components/LoadingScreen';
import ErrorBoundary from './components/ErrorBoundary';
import AiChat from './components/AiChat';
import AiPageInsight from './components/AiPageInsight';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Employees = lazy(() => import('./pages/Employees'));
const Projects = lazy(() => import('./pages/Projects'));
const Attendance = lazy(() => import('./pages/Attendance'));
const ProjectHours = lazy(() => import('./pages/ProjectHours'));
const ShiftRoster = lazy(() => import('./pages/ShiftRoster'));
const DataManagement = lazy(() => import('./pages/DataManagement'));
const Settings = lazy(() => import('./pages/Settings'));
const ProjectProgress = lazy(() => import('./pages/ProjectProgress'));
const DivisionTargets = lazy(() => import('./pages/DivisionTargets'));
const MonthEndSummary = lazy(() => import('./pages/MonthEndSummary'));
const QAQCPage = lazy(() => import('./pages/QAQCPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const Login = lazy(() => import('./pages/Login'));

let toastId = 1;

// Pages each role can access. null = unrestricted (all pages).
const ROLE_PAGES = {
  Admin: null,
  'Team Lead': ['employees', 'attendance', 'division-targets', 'shift-roster'],
};

export default function App() {
  const [page, setPage] = useState(() => { try { return localStorage.getItem('s2b_page') || 'dashboard'; } catch { return 'dashboard'; } });
  const [toasts, setToasts] = useState([]);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const dismiss = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  const toast = {
    success: (msg) => setToasts((p) => [...p, { id: toastId++, type: 'success', msg }]),
    error: (msg) => setToasts((p) => [...p, { id: toastId++, type: 'error', msg }]),
  };

  // Verify token on mount
  useEffect(() => {
    if (!getToken()) { setAuthChecked(true); return; }
    api.verify()
      .then((u) => setUser(u))
      .catch(() => { setToken(null); })
      .finally(() => setAuthChecked(true));
  }, []);

  // Role-based allowed page keys (null = all allowed)
  const allowedKeys = user ? (ROLE_PAGES[user.role] ?? null) : null;

  // Redirect to first allowed page if current page is forbidden
  useEffect(() => {
    if (user && allowedKeys && !allowedKeys.includes(page)) {
      setPage(allowedKeys[0]);
    }
  }, [user?.role, page]);

  // Persist current page across refreshes
  useEffect(() => { try { localStorage.setItem('s2b_page', page); } catch {} }, [page]);

  const handleLogin = (userData) => setUser(userData);

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setToken(null);
    setUser(null);
    try { localStorage.removeItem('s2b_page'); } catch {}
  };

  if (!authChecked && !user && getToken()) {
    return <LoadingScreen message="Verifying credentials" words={['identity', 'access', 'security', 'session', 'identity']} />;
  }

  if (!user) {
    return (
      <Suspense fallback={<LoadingScreen message="Loading" words={['app']} />}>
        <Login onLogin={handleLogin} />
        <Toast toasts={toasts} dismiss={dismiss} />
      </Suspense>
    );
  }

  const pages = {
    dashboard: <Dashboard toast={toast} navigate={setPage} user={user} />,
    employees: <Employees toast={toast} />,
    projects: <Projects toast={toast} />,
    attendance: <Attendance toast={toast} currentUser={user} />,
    'project-hours': <ProjectHours toast={toast} />,
    'project-hours-analytics': <ProjectHours toast={toast} key="analytics" initialTab="analytics" />,
    'project-progress': <ProjectProgress toast={toast} navigate={setPage} />,
    'qaqc': <QAQCPage toast={toast} />,
    'feedbacks': <FeedbackPage toast={toast} />,
    'reports': <ReportsPage toast={toast} />,
    'division-targets': <DivisionTargets toast={toast} currentUser={user} />,
    'month-end-summary': <MonthEndSummary toast={toast} />,
    'shift-roster': <ShiftRoster toast={toast} />,
    data: <DataManagement toast={toast} />,
    settings: <Settings toast={toast} currentUser={user} />,
  };

  // If on a forbidden page, show the first allowed page
  const activePage = (!allowedKeys || allowedKeys.includes(page)) ? page : allowedKeys[0];

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        page={activePage}
        onNavigate={setPage}
        user={user}
        onLogout={handleLogout}
        allowedKeys={allowedKeys}
      />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <AiPageInsight page={activePage} />
        <ErrorBoundary key={activePage}>
          <Suspense fallback={<LoadingScreen message="Loading page" words={['data', 'view', 'page']} />}>
            {pages[activePage] || pages[allowedKeys?.[0]] || pages.dashboard}
          </Suspense>
        </ErrorBoundary>
      </main>
      <Toast toasts={toasts} dismiss={dismiss} />
      <AiChat page={activePage} />
    </div>
  );
}
