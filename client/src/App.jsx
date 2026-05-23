import { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import { Toast } from './components/Toast';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Projects from './pages/Projects';
import Attendance from './pages/Attendance';
import ProjectHours from './pages/ProjectHours';
import ShiftRoster from './pages/ShiftRoster';
import DataManagement from './pages/DataManagement';
import Settings from './pages/Settings';
import ProjectProgress from './pages/ProjectProgress';
import DivisionTargets from './pages/DivisionTargets';
import QAQCPage from './pages/QAQCPage';
import FeedbackPage from './pages/FeedbackPage';
import Login from './pages/Login';
import { api, setToken, getToken } from './lib/api';

let toastId = 1;

// Pages each role can access. null = unrestricted (all pages).
const ROLE_PAGES = {
  Admin: null,
  'Team Lead': ['employees', 'attendance', 'division-targets', 'shift-roster'],
};

export default function App() {
  const [page, setPage] = useState('dashboard');
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
      .finally(() => setAuthChecked(false));
    setAuthChecked(true);
  }, []);

  // Role-based allowed page keys (null = all allowed)
  const allowedKeys = user ? (ROLE_PAGES[user.role] ?? null) : null;

  // Redirect to first allowed page if current page is forbidden
  useEffect(() => {
    if (user && allowedKeys && !allowedKeys.includes(page)) {
      setPage(allowedKeys[0]);
    }
  }, [user?.role, page]);

  const handleLogin = (userData) => setUser(userData);

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setToken(null);
    setUser(null);
  };

  if (!authChecked && !user && getToken()) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login onLogin={handleLogin} />
        <Toast toasts={toasts} dismiss={dismiss} />
      </>
    );
  }

  const pages = {
    dashboard: <Dashboard toast={toast} navigate={setPage} />,
    employees: <Employees toast={toast} />,
    projects: <Projects toast={toast} />,
    attendance: <Attendance toast={toast} currentUser={user} />,
    'project-hours': <ProjectHours toast={toast} />,
    'project-hours-analytics': <ProjectHours toast={toast} key="analytics" initialTab="analytics" />,
    'project-progress': <ProjectProgress toast={toast} navigate={setPage} />,
    'qaqc': <QAQCPage toast={toast} />,
    'feedbacks': <FeedbackPage toast={toast} />,
    'division-targets': <DivisionTargets toast={toast} currentUser={user} />,
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
      <main className="flex-1 overflow-y-auto">
        {pages[activePage] || pages[allowedKeys?.[0]] || pages.dashboard}
      </main>
      <Toast toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
