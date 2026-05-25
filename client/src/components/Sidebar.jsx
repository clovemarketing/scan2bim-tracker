import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, FolderKanban, CalendarCheck, Clock, Database, Settings, ChevronRight, CalendarRange, RefreshCw, BarChart2, Target, LogOut, ChevronLeft, ShieldCheck, MessageSquare, TrendingUp, FileText } from 'lucide-react';

const NAV = [
  { key: 'dashboard',        label: 'Dashboard',        icon: LayoutDashboard },
  { key: 'employees',        label: 'Employees',        icon: Users },
  { key: 'projects',         label: 'Projects',         icon: FolderKanban },
  { key: 'attendance',       label: 'Attendance',       icon: CalendarCheck },
  { key: 'project-hours',    label: 'Project Hours',    icon: Clock },
  { key: 'project-hours-analytics', label: 'Analytics', icon: BarChart2 },
  { key: 'project-progress', label: 'Project Progress', icon: TrendingUp },
  { key: 'qaqc',             label: 'QA/QC Team',       icon: ShieldCheck },
  { key: 'feedbacks',        label: 'Feedbacks',        icon: MessageSquare },
  { key: 'division-targets', label: 'Division Targets', icon: Target },
  { key: 'reports',          label: 'Reports',          icon: FileText },
  { key: 'month-end-summary',label: 'Month End Summary',icon: BarChart2 },
  { key: 'shift-roster',     label: 'Shift Roster',     icon: CalendarRange },
  { key: 'data',             label: 'Data Management',  icon: Database },
  { key: 'settings',         label: 'Settings',         icon: Settings },
];

export default function Sidebar({ page, onNavigate, user, onLogout, allowedKeys }) {
  const visibleNav = allowedKeys ? NAV.filter(({ key }) => allowedKeys.includes(key)) : NAV;
  const [health, setHealth] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      if (saved !== null) return saved === 'true';
    } catch {}
    return typeof window !== 'undefined' && window.innerWidth < 768;
  });

  // Close sidebar on mobile whenever page changes (login redirect, Dashboard navigate, role redirect, etc.)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) setCollapsed(true);
  }, [page]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('sidebar_collapsed', String(next)); } catch {}
      return next;
    });
  };

  const handleNavigate = (key) => {
    onNavigate(key);
    if (window.innerWidth < 768) setCollapsed(true);
  };

  const checkHealth = async () => {
    try {
      const res = await fetch('/api/ping');
      if (res.ok) { const data = await res.json(); setHealth({ status: 'connected', ...data }); return; }
      setHealth({ status: 'disconnected' });
    } catch {
      setHealth({ status: 'disconnected' });
    }
  };

  useEffect(() => { checkHealth(); const t = setInterval(checkHealth, 30000); return () => clearInterval(t); }, []);

  const isOk = health?.status === 'connected' || health?.status === 'ok';
  const shortId = health?.spreadsheetId ? health.spreadsheetId.slice(0, 8) + '…' : '';

  return (
    <>
      {/* Mobile backdrop — tap to close */}
      {!collapsed && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={toggle} />
      )}

      {/* Mobile floating open-button — small semicircle at left edge, centered vertically.
          Only visible on mobile when the sidebar is fully off-screen. */}
      {collapsed && (
        <button
          onClick={toggle}
          aria-label="Open menu"
          className="fixed left-0 top-1/2 -translate-y-1/2 z-50 md:hidden flex items-center justify-center bg-slate-900 border border-slate-700 border-l-0 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          style={{ width: '18px', height: '48px', borderRadius: '0 40px 40px 0' }}
        >
          <ChevronRight size={12} />
        </button>
      )}

      <aside
        className={`
          fixed md:sticky top-0 left-0
          z-40 md:z-auto
          flex flex-col shrink-0 h-screen
          bg-slate-900
          transition-[width,transform] duration-200 ease-in-out
          overflow-visible
          ${collapsed
            ? '-translate-x-full md:translate-x-0 w-60 md:w-16'
            : 'translate-x-0 w-60'
          }
        `}
      >
        {/* Desktop-only semicircle toggle */}
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute top-1/2 -translate-y-1/2 z-50 hidden md:flex items-center justify-center bg-slate-900 border border-slate-700 border-l-0 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          style={{ right: '-18px', width: '18px', height: '48px', borderRadius: '0 40px 40px 0' }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* ── Header ── */}
        <div className={`border-b border-slate-800 transition-all duration-200 ${collapsed ? 'px-3 py-4 flex flex-col items-center gap-2' : 'px-5 py-4'}`}>
          <img
            src="/CLOVE%20LOGO%20WHITE%20(1).png"
            alt="Clove Tech"
            className={`object-contain transition-all duration-200 ${collapsed ? 'h-6 w-auto hidden md:block' : 'h-8 w-auto mb-3'}`}
          />
          {!collapsed && (
            <div>
              <p className="text-white font-bold text-sm leading-tight">Scan2BIM</p>
              <p className="text-slate-400 text-xs">Operations Tracker</p>
            </div>
          )}
          {collapsed && (
            <p className="text-slate-500 text-[9px] font-bold tracking-widest hidden md:block">S2B</p>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {visibleNav.map(({ key, label, icon: Icon }) => {
            const active = page === key;
            return (
              <button
                key={key}
                onClick={() => handleNavigate(key)}
                title={collapsed ? label : ''}
                className={`w-full flex items-center py-2.5 rounded-lg text-sm font-medium transition-all group
                  ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'}
                  ${active
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                <Icon
                  size={17}
                  className={`shrink-0 ${active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'} ${collapsed ? 'hidden md:block' : ''}`}
                />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{label}</span>
                    {active && <ChevronRight size={14} className="opacity-70 shrink-0" />}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* ── Footer ── */}
        <div className={`border-t border-slate-800 space-y-2 ${collapsed ? 'px-2 py-3' : 'px-4 py-3'}`}>
          {user && (
            collapsed ? (
              <div className="flex-col items-center gap-2 pb-1 hidden md:flex">
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center" title={`${user.name} (${user.role})`}>
                  <span className="text-white text-xs font-bold">{(user.name || '?')[0].toUpperCase()}</span>
                </div>
                <button onClick={onLogout} title="Sign out" className="text-slate-500 hover:text-red-400 transition-colors">
                  <LogOut size={13} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 bg-slate-800 rounded-xl px-3 py-2">
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">{(user.name || '?')[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{user.name}</p>
                  <p className="text-slate-400 text-[10px] truncate">{user.role}</p>
                </div>
                <button onClick={onLogout} title="Sign out" className="text-slate-500 hover:text-red-400 transition-colors shrink-0">
                  <LogOut size={13} />
                </button>
              </div>
            )
          )}

          {/* Connection status */}
          {collapsed ? (
            <div className="hidden md:flex justify-center pt-1">
              <span
                className={`w-2 h-2 rounded-full ${isOk ? 'bg-emerald-400 shadow-emerald-400/50 shadow-sm' : 'bg-red-400'}`}
                title={isOk ? `Connected — ${health?.title || 'Google Sheets'}` : 'Disconnected'}
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isOk ? 'bg-emerald-400 shadow-emerald-400/50 shadow-sm' : 'bg-red-400'}`}
                  title={isOk ? 'Connected' : 'Disconnected'} />
                <p className="text-slate-500 text-xs">Google Sheets</p>
                <button onClick={checkHealth} className="ml-auto text-slate-600 hover:text-slate-400 transition-colors" title="Refresh status">
                  <RefreshCw size={10} />
                </button>
              </div>
              <p className={`text-xs truncate ${isOk ? 'text-slate-400' : 'text-red-400'}`}>
                {isOk ? (health.title || shortId) : 'Server unreachable — restart backend'}
              </p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
