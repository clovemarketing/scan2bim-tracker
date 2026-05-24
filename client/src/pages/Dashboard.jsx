import { useEffect, useState, useMemo, useCallback } from 'react';
import { Users, FolderKanban, CalendarCheck, Clock, RefreshCw, TrendingUp, BarChart2, Target, Search, X, Award } from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import { api } from '../lib/api';

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#94a3b8', '#ef4444'];

function toHhmm(val) {
  const total = Math.round(parseFloat(val) || 0);
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function KpiCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="card flex items-start gap-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className={`p-3 rounded-xl ${color}`}><Icon size={22} className="text-white" /></div>
      <div>
        <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function KpiCardSkeleton() {
  return (
    <div className="card flex items-start gap-4">
      <div className="skeleton skeleton-icon-box" style={{ width: 46, height: 46 }} />
      <div className="flex-1">
        <div className="skeleton" style={{ width: 80, height: 28 }} />
        <div className="skeleton mt-2" style={{ width: 128, height: 16 }} />
        <div className="skeleton mt-1.5" style={{ width: 96, height: 12 }} />
      </div>
    </div>
  );
}

function EffBadge({ ratio }) {
  if (!ratio || ratio === 0) return <span className="text-slate-300">—</span>;
  const pct = Math.round(ratio * 100);
  const cls = ratio >= 1 ? 'text-emerald-600 bg-emerald-50' : ratio >= 0.85 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{pct}%</span>;
}

const ATT_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

const EFF_TIERS = [
  { key: 'All', label: 'All' },
  { key: 'exceeded', label: 'Exceeded (≥100%)' },
  { key: 'ontrack', label: 'On Track (85–99%)' },
  { key: 'below', label: 'Below (<85%)' },
];

const WMO_CODES = {
  clear: [0, 1],
  cloudy: [2, 3],
  fog: [45, 48],
  rain: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82],
  snow: [71, 73, 75, 77, 85, 86],
  thunder: [95, 96, 99],
};

function getCondition(code) {
  for (const [key, vals] of Object.entries(WMO_CODES)) {
    if (vals.includes(code)) return key;
  }
  return 'clear';
}

const CARD_BG = {
  'clear-day': 'radial-gradient(178.94% 106.41% at 26.42% 106.41%, #FFF7B1 0%, rgba(255,255,255,0) 71.88%), #FFF9E6',
  'clear-night': 'radial-gradient(178.94% 106.41% at 26.42% 106.41%, #2a2a5e 0%, rgba(255,255,255,0) 71.88%), #1a1a3e',
  'cloudy-day': 'radial-gradient(178.94% 106.41% at 26.42% 106.41%, #b0c8e0 0%, rgba(255,255,255,0) 71.88%), #dce4ec',
  'cloudy-night': 'radial-gradient(178.94% 106.41% at 26.42% 106.41%, #3a3a5a 0%, rgba(255,255,255,0) 71.88%), #2a2a44',
  'rain-day': 'radial-gradient(178.94% 106.41% at 26.42% 106.41%, #6a8aaa 0%, rgba(255,255,255,0) 71.88%), #9ab0c8',
  'rain-night': 'radial-gradient(178.94% 106.41% at 26.42% 106.41%, #2a2a4a 0%, rgba(255,255,255,0) 71.88%), #1e1e38',
  'snow-day': 'radial-gradient(178.94% 106.41% at 26.42% 106.41%, #d0dce8 0%, rgba(255,255,255,0) 71.88%), #eef2f6',
  'snow-night': 'radial-gradient(178.94% 106.41% at 26.42% 106.41%, #3a4050 0%, rgba(255,255,255,0) 71.88%), #282e3a',
  'thunder-day': 'radial-gradient(178.94% 106.41% at 26.42% 106.41%, #5a4a6a 0%, rgba(255,255,255,0) 71.88%), #3a3a4e',
  'thunder-night': 'radial-gradient(178.94% 106.41% at 26.42% 106.41%, #2a203a 0%, rgba(255,255,255,0) 71.88%), #1a1428',
  'fog-day': 'radial-gradient(178.94% 106.41% at 26.42% 106.41%, #b0bcc4 0%, rgba(255,255,255,0) 71.88%), #d0d6dc',
  'fog-night': 'radial-gradient(178.94% 106.41% at 26.42% 106.41%, #3a3e44 0%, rgba(255,255,255,0) 71.88%), #2a2e34',
};

/* Dynamic text colors per theme — literal full class names required for Tailwind JIT */
const TEXT_COLORS = {
  'clear-day':      { text: 'text-amber-900',  sub: 'text-amber-800/60' },
  'clear-night':    { text: 'text-white',      sub: 'text-blue-200/70' },
  'cloudy-day':     { text: 'text-slate-800',  sub: 'text-slate-600/70' },
  'cloudy-night':   { text: 'text-white',      sub: 'text-blue-200/70' },
  'rain-day':       { text: 'text-white',      sub: 'text-blue-100/80' },
  'rain-night':     { text: 'text-white',      sub: 'text-blue-200/70' },
  'snow-day':       { text: 'text-slate-800',  sub: 'text-slate-600/70' },
  'snow-night':     { text: 'text-white',      sub: 'text-slate-300/70' },
  'thunder-day':    { text: 'text-white',      sub: 'text-white/70' },
  'thunder-night':  { text: 'text-white',      sub: 'text-purple-200/70' },
  'fog-day':        { text: 'text-slate-800',  sub: 'text-slate-600/70' },
  'fog-night':      { text: 'text-white',      sub: 'text-slate-300/70' },
};

function isNight(weather) {
  return weather?.is_day === 0;
}

function WeatherArt({ condition, night }) {
  const clear = condition === 'clear';
  const cloudy = condition === 'cloudy';
  const rain = condition === 'rain';
  const snow = condition === 'snow';
  const thunder = condition === 'thunder';
  const fog = condition === 'fog';
  const cloudCls = night ? 'cloud-dark' : (clear || thunder ? 'cloud-grey' : 'cloud-blue');

  return (
    <>
      {clear && !night && (
        <>
          <div className="weather-sun glow" />
          <div className="weather-sun" />
        </>
      )}

      {clear && night && (
        <>
          <div className="weather-moon" />
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="star" style={{
              left: `${5 + Math.random() * 85}%`,
              top: `${5 + Math.random() * 70}%`,
            }} />
          ))}
        </>
      )}

      {(cloudy || rain || thunder) && (
        <>
          {!night && (
            <>
              <div className="weather-sun" style={{ opacity: 0.15 }} />
              <div className="weather-sun glow" style={{ opacity: 0.1 }} />
            </>
          )}
          {night && (
            <div className="weather-moon" style={{ opacity: 0.4 }} />
          )}
          <div className="weather-cloud front">
            <div className={`cloud-body cloud-front ${cloudCls}`}>
              <div className="cloud-bump" />
            </div>
          </div>
          <div className="weather-cloud back">
            <div className={`cloud-body cloud-back ${cloudCls}`}>
              <div className="cloud-bump" />
            </div>
          </div>
        </>
      )}

      {clear && night && (
        <div className="weather-cloud front" style={{ opacity: 0.25 }}>
          <div className={`cloud-body cloud-front ${cloudCls}`}>
            <div className="cloud-bump" />
          </div>
        </div>
      )}

      {/* Rain */}
      {rain && (
        <div className="rain-container">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="raindrop" style={{ left: `${5 + i * 12}%` }} />
          ))}
        </div>
      )}

      {/* Snow */}
      {snow && (
        <div className="rain-container">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="snowflake" style={{ left: `${8 + i * 13}%` }} />
          ))}
        </div>
      )}

      {/* Thunder */}
      {thunder && (
        <>
          <div className="rain-container">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="raindrop" style={{ left: `${10 + i * 14}%` }} />
            ))}
          </div>
          <div className="lightning">⚡</div>
        </>
      )}

      {/* Fog */}
      {fog && (
        <div className="fog-layer">
          <div className="fog-puff" />
          <div className="fog-puff" />
          <div className="fog-puff" />
        </div>
      )}
    </>
  );
}

function GreetingCard({ name }) {
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  const [showWelcome, setShowWelcome] = useState(true);
  const [phase, setPhase] = useState('welcome'); // 'welcome' | 'transitioning' | 'card'

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('transitioning'), 2000);
    const t2 = setTimeout(() => {
      setShowWelcome(false);
      setPhase('card');
    }, 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const [weather, setWeather] = useState(null);
  const [location, setLocation] = useState('');

  const fetchWeather = useCallback(async (lat, lon) => {
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`);
      const data = await res.json();
      setWeather(data.current_weather);
    } catch { /* ignore */ }
    try {
      const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      const data = await res.json();
      setLocation(data.city || data.locality || '');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchWeather(17.6868, 83.2185);
    navigator.geolocation?.getCurrentPosition(
      (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { timeout: 5000, enableHighAccuracy: false },
    );
  }, [fetchWeather]);

  const code = weather?.weathercode ?? 0;
  const condition = getCondition(code);
  const night = isNight(weather);
  const themeKey = `${condition}-${night ? 'night' : 'day'}`;
  const bg = CARD_BG[themeKey] || CARD_BG['clear-day'];
  const temp = weather?.temperature != null ? Math.round(weather.temperature) : '—';
  const themeColors = TEXT_COLORS[themeKey] || (night ? { text: 'text-blue-100', sub: 'text-blue-200/50' } : { text: 'text-amber-900', sub: 'text-amber-800/50' });
  const textCls = themeColors.text;
  const subCls = themeColors.sub;

  return (
    <div className="greeting-card-wrapper" style={{ height: 125 }}>
      {/* Animated Welcome Overlay */}
      {showWelcome && (
        <div className={`welcome-overlay ${phase === 'transitioning' ? 'welcome-exit' : 'welcome-enter'}`}>
          <div className="welcome-greeting">
            <span className="welcome-wave">👋</span>
            <span className="welcome-text-line">Welcome back{name ? `, ${name.split(' ')[0]}` : ''}!</span>
          </div>
          <div className="welcome-sub">{greet} · {dayName}</div>
        </div>
      )}

      {/* Weather Card */}
      <div
        className={`greeting-card ${phase === 'card' ? 'card-enter' : phase === 'welcome' ? 'card-hidden' : 'card-pre-enter'}`}
        style={{ background: bg }}
      >
        <div className="weather-art">
          <WeatherArt condition={condition} night={night} />
        </div>
        <div className={`relative z-10 h-full flex flex-col justify-between`}>
          <div>
            <div className="flex items-baseline gap-2">
              <span className={`text-xl font-bold ${textCls}`}>{temp}°C</span>
              <span className={`text-[10px] ${subCls}`}>{location || 'Visakhapatnam'}</span>
            </div>
            <p className={`text-[11px] ${subCls} mt-0.5`}>{dayName}, {dateStr}</p>
          </div>
          <div>
            <p className={`text-sm font-bold ${textCls} leading-tight`}>{greet}{name ? `, ${name}` : ''}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ toast, navigate, user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [attFilter, setAttFilter] = useState('today');
  const [attSummary, setAttSummary] = useState(null);
  const [attLoading, setAttLoading] = useState(false);

  const [divTargetData, setDivTargetData] = useState(null);
  const [divTargetsLoading, setDivTargetsLoading] = useState(false);

  const loadDivTargets = useCallback(async () => {
    const now = new Date();
    setDivTargetsLoading(true);
    try {
      const dt = await api.getDivTargets(now.getFullYear(), now.getMonth());
      setDivTargetData(dt);
    } catch (e) { /* ignore */ }
    finally { setDivTargetsLoading(false); }
  }, []);

  // Project Progress filters
  const [projSearch, setProjSearch] = useState('');
  const [projEffFilter, setProjEffFilter] = useState('All');

  // Team Efficiency filters
  const [effDept, setEffDept] = useState('All');
  const [effTier, setEffTier] = useState('All');

  const loadMain = async () => {
    setLoading(true);
    try { setData(await api.dashboard()); }
    catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const loadAttSummary = async (filter) => {
    setAttLoading(true);
    try { setAttSummary(await api.attendanceSummary({ filter })); }
    catch (e) { toast.error(e.message); }
    finally { setAttLoading(false); }
  };

  useEffect(() => { loadMain(); loadDivTargets(); }, []);
  useEffect(() => { loadAttSummary(attFilter); }, [attFilter]);

  // ── Derived filter options ──────────────────────────────────────────────
  const empDepts = useMemo(
    () => [...new Set((data?.empEff || []).map((e) => e.dept).filter(Boolean))].sort(),
    [data],
  );

  const filteredProjStats = useMemo(() => {
    if (!data?.projStats) return [];
    return data.projStats.filter((p) => {
      if (projSearch && !p.projName.toLowerCase().includes(projSearch.toLowerCase())) return false;
      if (projEffFilter !== 'All') {
        const pct = p.avgEff ? p.avgEff * 100 : 0;
        if (projEffFilter === 'exceeded' && pct < 100) return false;
        if (projEffFilter === 'ontrack' && (pct < 85 || pct >= 100)) return false;
        if (projEffFilter === 'below' && (pct === 0 || pct >= 85)) return false;
      }
      return true;
    });
  }, [data, projSearch, projEffFilter]);

  const filteredEmpEff = useMemo(() => {
    if (!data?.empEff) return [];
    return data.empEff.filter((e) => {
      if (effDept !== 'All' && e.dept !== effDept) return false;
      if (effTier !== 'All') {
        if (effTier === 'exceeded' && e.avgEff < 1) return false;
        if (effTier === 'ontrack' && (e.avgEff < 0.85 || e.avgEff >= 1)) return false;
        if (effTier === 'below' && (e.avgEff === 0 || e.avgEff >= 0.85)) return false;
      }
      return true;
    });
  }, [data, effDept, effTier]);

  const overallEffPct = data ? Math.round(data.overallEff * 100) : 0;

  const clientHrsSum = useMemo(() => {
    if (!data?.projStats) return 0;
    return data.projStats.reduce((sum, p) => sum + (p.clientHrs || 0), 0);
  }, [data]);

  const completedClientHrs = useMemo(() => {
    if (!data?.projStats) return 0;
    return data.projStats
      .filter((p) => p.status === 'Completed')
      .reduce((sum, p) => sum + (p.clientHrs || 0), 0);
  }, [data]);

  const projChartData = data?.projStats ? filteredProjStats.slice(0, 10).map((p) => ({
    name: p.projName.length > 22 ? p.projName.slice(0, 22) + '…' : p.projName,
    fullName: p.projName,
    spent: p.spent / 60,
    remaining: p.remaining != null && p.remaining > 0 ? p.remaining : 0,
    clientHrs: p.clientHrs || 0,
  })) : [];

  return (
    <div className="page">
      <div className="flex flex-col sm:flex-row items-start justify-between mb-6 gap-4">
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <GreetingCard name={user?.name} />
          <DivTargetCard divTargetData={divTargetData} clientHrsSum={clientHrsSum} loading={loading || divTargetsLoading} />
          <CompletedProjectsCard completedCount={data?.completed || 0} totalProjects={data?.totalProjects || 0} completedClientHrs={completedClientHrs} divTarget={divTargetData?.divisionTarget} overallEff={data?.overallEff} totalSessions={data?.totalPhSessions} totalHours={data?.totalLoggedHrs} loading={loading} />
          <EfficiencyMetricCard overallEff={data?.overallEff} totalSessions={data?.totalPhSessions} totalHours={data?.totalLoggedHrs} loading={loading} />
        </div>
        <button onClick={() => { loadMain(); loadAttSummary(attFilter); loadDivTargets(); }} className="btn-secondary text-xs gap-1.5 shrink-0 w-full sm:w-auto">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Dashboard Title */}
      <div className="flex flex-col sm:flex-row items-baseline gap-1 sm:gap-2 mb-3">
        <h2 className="text-lg font-semibold text-slate-700">Dashboard</h2>
        <span className="text-xs text-slate-400">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
      </div>

      {/* KPI Row — skeletons while loading */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {loading || !data ? (
          <>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </>
        ) : (
          <>
            <KpiCard label="Active Employees" value={data.totalEmployees} sub="across all departments" icon={Users} color="bg-indigo-500" />
            <KpiCard label="In Progress" value={data.inProgress} sub={`of ${data.totalProjects} total projects`} icon={FolderKanban} color="bg-violet-500" />
            <KpiCard label="Attendance Rate" value={`${data.attendanceRate}%`} sub={`${data.present} present · ${data.absent} absent`} icon={CalendarCheck} color="bg-emerald-500" />
            <KpiCard label="Hours Logged Today" value={toHhmm(data.hoursToday)} sub={`WFH: ${data.wfh}`} icon={Clock} color="bg-amber-500" />
          </>
        )}
      </div>

      {/* Charts Row — only when data is loaded */}
      {!loading && data && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Project Status Distribution</h3>
          {data.projStatus?.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.projStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {data.projStatus.map((entry, i) => <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart onAction={() => navigate('data')} />}
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Department Headcount</h3>
          {data.deptChart?.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.deptChart} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} name="Employees" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart onAction={() => navigate('data')} />}
        </div>
      </div>

      {/* ── Attendance Overview ─────────────────────────────────────────────── */}
      <div className="card mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><CalendarCheck size={16} className="text-indigo-500" /> Attendance Overview</h3>
            <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg overflow-x-auto">
              {ATT_FILTERS.map((f) => (
                <button key={f.key} onClick={() => setAttFilter(f.key)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${attFilter === f.key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

        {attLoading ? <p className="text-slate-400 text-sm animate-pulse py-4">Loading…</p> : attSummary ? (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 mb-5">
              {[
                { label: 'Present', val: attSummary.present, cls: 'text-emerald-600 bg-emerald-50' },
                { label: 'Absent', val: attSummary.absent, cls: 'text-red-600 bg-red-50' },
                { label: 'Leave', val: attSummary.leave, cls: 'text-orange-600 bg-orange-50' },
                { label: 'WFH', val: attSummary.wfh, cls: 'text-blue-600 bg-blue-50' },
                { label: 'OD', val: attSummary.od, cls: 'text-cyan-600 bg-cyan-50' },
                { label: 'Half Day', val: attSummary.hd, cls: 'text-yellow-600 bg-yellow-50' },
                { label: 'Holiday', val: attSummary.holiday, cls: 'text-slate-600 bg-slate-50' },
              ].map(({ label, val, cls }) => (
                <div key={label} className={`rounded-lg px-3 py-2 ${cls}`}>
                  <p className="text-lg font-bold">{val}</p>
                  <p className="text-xs font-medium opacity-70">{label}</p>
                </div>
              ))}
            </div>

            {attSummary.byDate?.length > 1 && (
              <div className="mb-5">
                <p className="text-xs text-slate-400 mb-2">{attSummary.fromDate} → {attSummary.toDate}</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={attSummary.byDate} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="P" name="Present" fill="#22c55e" stackId="a" />
                    <Bar dataKey="A" name="Absent" fill="#ef4444" stackId="a" />
                    <Bar dataKey="L" name="Leave" fill="#f97316" stackId="a" />
                    <Bar dataKey="WFH" name="WFH" fill="#3b82f6" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {attSummary.byEmployee?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Employee Breakdown ({attSummary.byEmployee.length})</p>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-100">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50"><tr>
                      <th className="th text-xs">Employee</th>
                      <th className="th text-xs">EMP ID</th>
                      <th className="th text-xs">Present</th>
                      <th className="th text-xs">Absent</th>
                      <th className="th text-xs">Leave</th>
                      <th className="th text-xs">WFH</th>
                      <th className="th text-xs">Total</th>
                      <th className="th text-xs">Rate</th>
                    </tr></thead>
                    <tbody>
                      {attSummary.byEmployee.slice(0, 15).map((e, i) => (
                        <tr key={i} className="tr">
                          <td className="td font-medium">{e.empName}</td>
                          <td className="td text-slate-400">{e.empId}</td>
                          <td className="td text-emerald-600 font-medium">{e.P || 0}</td>
                          <td className="td text-red-600">{e.A || 0}</td>
                          <td className="td text-orange-600">{e.L || 0}</td>
                          <td className="td text-blue-600">{e.WFH || 0}</td>
                          <td className="td text-slate-500">{e.total}</td>
                          <td className="td">
                            <div className="flex items-center gap-1.5">
                              <div className="w-16 bg-slate-100 rounded-full h-1.5">
                                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${e.total > 0 ? ((e.P || 0) / e.total * 100) : 0}%` }} />
                              </div>
                              <span className={e.total > 0 && (e.P || 0) / e.total > 0.8 ? 'text-emerald-600' : 'text-red-500'}>
                                {e.total > 0 ? Math.round((e.P || 0) / e.total * 100) : 0}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {attSummary.byEmployee.slice(0, 15).map((e, i) => {
                    const rate = e.total > 0 ? Math.round((e.P || 0) / e.total * 100) : 0;
                    return (
                      <div key={i} className="border border-slate-100 rounded-lg p-3 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-medium text-slate-800">{e.empName}</span>
                          <span className="text-slate-400">{e.empId}</span>
                        </div>
                        <div className="flex gap-3 mb-1.5">
                          <span className="text-emerald-600 font-medium">P:{e.P || 0}</span>
                          <span className="text-red-600">A:{e.A || 0}</span>
                          <span className="text-orange-600">L:{e.L || 0}</span>
                          <span className="text-blue-600">WFH:{e.WFH || 0}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">Total: {e.total}</span>
                          <span className="text-slate-300">·</span>
                          <div className="flex-1 max-w-[80px] bg-slate-100 rounded-full h-1.5">
                            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${rate}%` }} />
                          </div>
                          <span className={rate > 80 ? 'text-emerald-600' : 'text-red-500'}>{rate}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ── Project Progress ────────────────────────────────────────────────── */}
      {data.projStats?.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-start sm:items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BarChart2 size={16} className="text-violet-500" /> Project Progress
            </h3>
            <button onClick={() => navigate('project-progress')} className="text-xs text-indigo-600 hover:underline shrink-0">View all →</button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-8 w-full sm:w-52 text-xs"
                placeholder="Search project…"
                value={projSearch}
                onChange={(e) => setProjSearch(e.target.value)}
              />
            </div>
            <div>
              <select className="input w-full sm:w-48 text-xs" value={projEffFilter} onChange={(e) => setProjEffFilter(e.target.value)}>
                {EFF_TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            {(projSearch || projEffFilter !== 'All') && (
              <button className="btn-secondary text-xs" onClick={() => { setProjSearch(''); setProjEffFilter('All'); }}>Clear</button>
            )}
            <span className="text-xs text-slate-400 ml-auto self-center">
              {filteredProjStats.length} of {data.projStats.length} projects
            </span>
          </div>

          {/* Stat pills */}
          <div className="flex flex-wrap gap-3 mb-5">
            <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 rounded-xl">
              <Clock size={14} className="text-violet-500" />
              <span className="text-sm font-bold text-violet-700">{toHhmm(data.totalLoggedHrs)}</span>
              <span className="text-xs text-violet-500">total logged</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-xl">
              <FolderKanban size={14} className="text-indigo-500" />
              <span className="text-sm font-bold text-indigo-700">{filteredProjStats.length}</span>
              <span className="text-xs text-indigo-500">projects shown</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-xl">
              <Users size={14} className="text-emerald-500" />
              <span className="text-sm font-bold text-emerald-700">{data.totalPhSessions}</span>
              <span className="text-xs text-emerald-500">total sessions</span>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {/* Desktop table */}
            <div className="hidden md:block rounded-lg border border-slate-100 overflow-hidden">
              <div className="overflow-y-auto" style={{ maxHeight: '300px' }}>
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10"><tr>
                    <th className="th text-xs">Project</th>
                    <th className="th text-xs text-right">Total Spent Time</th>
                    <th className="th text-xs text-right">Req Eff Time</th>
                    <th className="th text-xs text-right">Act Eff Time</th>
                    <th className="th text-xs text-right">Client Hrs</th>
                    <th className="th text-xs text-right">Remaining</th>
                    <th className="th text-xs text-center">Project Efficiency</th>
                    <th className="th text-xs text-center">Sessions</th>
                  </tr></thead>
                  <tbody>
                    {filteredProjStats.length === 0 ? (
                      <tr><td colSpan={8} className="td text-center text-slate-400 py-6">No projects match filters</td></tr>
                    ) : filteredProjStats.map((p, i) => {
                      const remCls = p.remaining == null ? 'text-slate-400' : p.remaining <= 0 ? 'text-red-600 font-semibold' : p.remaining < 20 ? 'text-amber-600' : 'text-emerald-600';
                      return (
                        <tr key={i} className="tr">
                          <td className="td font-medium max-w-[180px]">
                            <p className="truncate" title={p.projName}>{p.projName}</p>
                            <p className="text-slate-400 font-normal">{p.projId}</p>
                          </td>
                          <td className="td text-right font-semibold text-indigo-600">{toHhmm(p.spent)}</td>
                          <td className="td text-right text-violet-600">{p.reqEff > 0 ? toHhmm(p.reqEff) : '—'}</td>
                          <td className="td text-right text-cyan-600">{p.actEff > 0 ? toHhmm(p.actEff) : '—'}</td>
                          <td className="td text-right text-slate-500">{p.clientHrs || '—'}</td>
                          <td className={`td text-right ${remCls}`}>{p.remaining != null ? `${p.remaining} h` : '—'}</td>
                          <td className="td text-center"><EffBadge ratio={p.avgEff} /></td>
                          <td className="td text-center text-slate-500">{p.sessions}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filteredProjStats.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No projects match filters</p>
              ) : filteredProjStats.map((p, i) => {
                const remCls = p.remaining == null ? 'text-slate-400' : p.remaining <= 0 ? 'text-red-600' : p.remaining < 20 ? 'text-amber-600' : 'text-emerald-600';
                return (
                  <div key={i} className="border border-slate-100 rounded-lg p-3 text-xs">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="font-medium text-slate-800 truncate">{p.projName}</p>
                        <p className="text-slate-400 text-[10px]">{p.projId}</p>
                      </div>
                      <EffBadge ratio={p.avgEff} />
                    </div>
                    <div className="grid grid-cols-2 gap-y-1 gap-x-3">
                      <div><span className="text-slate-400">Spent:</span> <span className="font-semibold text-indigo-600">{toHhmm(p.spent)}</span></div>
                      <div><span className="text-slate-400">Client:</span> <span className="text-slate-600">{p.clientHrs || '—'}</span></div>
                      <div><span className="text-slate-400">Req Eff:</span> <span className="text-violet-600">{p.reqEff > 0 ? toHhmm(p.reqEff) : '—'}</span></div>
                      <div><span className="text-slate-400">Act Eff:</span> <span className="text-cyan-600">{p.actEff > 0 ? toHhmm(p.actEff) : '—'}</span></div>
                      <div><span className="text-slate-400">Remaining:</span> <span className={remCls}>{p.remaining != null ? `${p.remaining}h` : '—'}</span></div>
                      <div><span className="text-slate-400">Sessions:</span> <span className="text-slate-600">{p.sessions}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>

            {projChartData.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-2">Hours: Spent vs Remaining (top 10 by hours)</p>
                <ResponsiveContainer width="100%" height={Math.max(180, projChartData.length * 34)}>
                  <BarChart data={projChartData} layout="vertical" barSize={14} margin={{ left: 0, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                    <Tooltip
                      formatter={(val, name) => [toHhmm(val * 60), name]}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="spent" name="Spent" fill="#6366f1" stackId="a">
                      <LabelList dataKey="spent" position="insideRight" style={{ fontSize: 9, fill: '#fff' }} formatter={(v) => v > 0 ? toHhmm(v * 60) : ''} />
                    </Bar>
                    <Bar dataKey="remaining" name="Remaining" fill="#e0e7ff" stackId="a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Team Efficiency ─────────────────────────────────────────────────── */}
      {data.empEff?.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-start sm:items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Target size={16} className="text-emerald-500" /> Team Efficiency
            </h3>
            <button onClick={() => navigate('project-hours')} className="text-xs text-indigo-600 hover:underline shrink-0">View full log →</button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div>
              <label className="label">Department</label>
              <select className="input w-full sm:w-44 text-xs" value={effDept} onChange={(e) => setEffDept(e.target.value)}>
                <option value="All">All Departments</option>
                {empDepts.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Efficiency Tier</label>
              <select className="input w-full sm:w-48 text-xs" value={effTier} onChange={(e) => setEffTier(e.target.value)}>
                {EFF_TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            {(effDept !== 'All' || effTier !== 'All') && (
              <button className="btn-secondary text-xs self-end" onClick={() => { setEffDept('All'); setEffTier('All'); }}>Clear</button>
            )}
            <span className="text-xs text-slate-400 ml-auto self-end pb-2">
              {filteredEmpEff.length} of {data.empEff.length} employees
            </span>
          </div>

          {/* Overall eff stat + breakdown */}
          <div className="flex flex-wrap gap-3 mb-5">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${overallEffPct >= 100 ? 'bg-emerald-50' : overallEffPct >= 85 ? 'bg-amber-50' : 'bg-red-50'}`}>
              <TrendingUp size={14} className={overallEffPct >= 100 ? 'text-emerald-500' : overallEffPct >= 85 ? 'text-amber-500' : 'text-red-500'} />
              <span className={`text-sm font-bold ${overallEffPct >= 100 ? 'text-emerald-700' : overallEffPct >= 85 ? 'text-amber-700' : 'text-red-700'}`}>{overallEffPct}%</span>
              <span className={`text-xs ${overallEffPct >= 100 ? 'text-emerald-500' : overallEffPct >= 85 ? 'text-amber-500' : 'text-red-500'}`}>overall efficiency</span>
            </div>
            {[
              { label: 'Exceeded (≥100%)', count: filteredEmpEff.filter((e) => e.avgEff >= 1).length, cls: 'bg-emerald-50 text-emerald-700' },
              { label: 'On Track (85–99%)', count: filteredEmpEff.filter((e) => e.avgEff >= 0.85 && e.avgEff < 1).length, cls: 'bg-amber-50 text-amber-700' },
              { label: 'Below Target (<85%)', count: filteredEmpEff.filter((e) => e.avgEff > 0 && e.avgEff < 0.85).length, cls: 'bg-red-50 text-red-700' },
            ].map(({ label, count, cls }) => (
              <div key={label} className={`flex items-center gap-2 px-4 py-2 rounded-xl ${cls}`}>
                <span className="text-sm font-bold">{count}</span>
                <span className="text-xs opacity-70">{label}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-6">
            {/* Desktop table */}
            <div className="hidden md:block rounded-lg border border-slate-100 overflow-hidden">
              <div className="overflow-y-auto" style={{ maxHeight: '300px' }}>
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10"><tr>
                    <th className="th text-xs">Employee</th>
                    <th className="th text-xs">Dept</th>
                    <th className="th text-xs text-right">Total Hrs</th>
                    <th className="th text-xs text-center">Sessions</th>
                    <th className="th text-xs text-center">Avg Eff</th>
                  </tr></thead>
                  <tbody>
                    {filteredEmpEff.length === 0 ? (
                      <tr><td colSpan={5} className="td text-center text-slate-400 py-6">No employees match filters</td></tr>
                    ) : filteredEmpEff.map((e, i) => (
                      <tr key={i} className="tr">
                        <td className="td font-medium">
                          <p>{e.empName}</p>
                          <p className="text-slate-400 font-normal">{e.empId}</p>
                        </td>
                        <td className="td text-slate-500">{e.dept || '—'}</td>
                        <td className="td text-right font-semibold text-indigo-600">{toHhmm(e.totalHrs)}</td>
                        <td className="td text-center text-slate-500">{e.sessions}</td>
                        <td className="td text-center"><EffBadge ratio={e.avgEff} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filteredEmpEff.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No employees match filters</p>
              ) : filteredEmpEff.map((e, i) => (
                <div key={i} className="border border-slate-100 rounded-lg p-3 text-xs">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1 mr-2">
                      <p className="font-medium text-slate-800 truncate">{e.empName}</p>
                      <p className="text-slate-400 text-[10px]">{e.empId}</p>
                    </div>
                    <EffBadge ratio={e.avgEff} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <div><span className="text-slate-400">Dept:</span> <span className="text-slate-600">{e.dept || '—'}</span></div>
                    <div><span className="text-slate-400">Hours:</span> <span className="font-semibold text-indigo-600">{toHhmm(e.totalHrs)}</span></div>
                    <div><span className="text-slate-400">Sessions:</span> <span className="text-slate-600">{e.sessions}</span></div>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-2">Total hours logged per employee (top 10)</p>
              <ResponsiveContainer width="100%" height={Math.max(180, Math.min(filteredEmpEff.length, 10) * 34)}>
                  <BarChart
                  data={filteredEmpEff.slice(0, 10).map((e) => ({ name: e.empName.split(' ')[0], fullName: e.empName, hrs: e.totalHrs, eff: Math.round(e.avgEff * 100) }))}
                  layout="vertical" barSize={14} margin={{ left: 0, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} unit=" min" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip
                    formatter={(val, name) => [toHhmm(val), name === 'hrs' ? 'Hours' : 'Eff %']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Bar dataKey="hrs" name="hrs" radius={[0, 4, 4, 0]}>
                    {filteredEmpEff.slice(0, 10).map((e, i) => (
                      <Cell key={i} fill={e.avgEff >= 1 ? '#22c55e' : e.avgEff >= 0.85 ? '#f59e0b' : e.avgEff > 0 ? '#ef4444' : '#94a3b8'} />
                    ))}
                    <LabelList dataKey="hrs" position="right" style={{ fontSize: 9, fill: '#64748b' }} formatter={(v) => toHhmm(v)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-slate-400 mt-1">Bar colour: green ≥100% · amber 85–99% · red &lt;85%</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Gantt Chart (Project Timeline) ───────────────────────────────────── */}
      {data.ganttData?.length > 0 && (
        <GanttChart
          ganttData={data.ganttData}
          projTeamMap={data.projTeamMap || {}}
          navigate={navigate}
        />
      )}

      {/* Bottom Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-start sm:items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold text-slate-700">Active Projects</h3>
            <button onClick={() => navigate('projects')} className="text-xs text-indigo-600 hover:underline shrink-0">View all →</button>
          </div>
          {data.activeProjects?.length ? (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-100">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50"><tr>
                    <th className="th text-xs">Project</th>
                    <th className="th text-xs">Lead</th>
                    <th className="th text-xs">Client Hrs</th>
                  </tr></thead>
                  <tbody>
                    {data.activeProjects.map((p, i) => (
                      <tr key={i} className="tr">
                        <td className="td font-medium max-w-[200px] truncate">{p[1]}</td>
                        <td className="td text-slate-500">{p[4]}</td>
                        <td className="td text-slate-500">{p[7]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {data.activeProjects.map((p, i) => (
                  <div key={i} className="border border-slate-100 rounded-lg p-3 text-xs flex items-center justify-between">
                    <div className="min-w-0 flex-1 mr-2">
                      <p className="font-medium text-slate-800 truncate">{p[1]}</p>
                      <p className="text-slate-400 text-[10px] mt-0.5">Lead: {p[4] || '—'}</p>
                    </div>
                    <span className="text-slate-600 shrink-0">{p[7] || '—'}h</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <p className="text-slate-400 text-sm">No active projects</p>
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-start sm:items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold text-slate-700">Recent Project Sessions</h3>
            <button onClick={() => navigate('attendance')} className="text-xs text-indigo-600 hover:underline shrink-0">View all →</button>
          </div>
          {data.recentAtt?.length ? (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-100">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50"><tr>
                    <th className="th text-xs">Date</th>
                    <th className="th text-xs">Employee</th>
                    <th className="th text-xs">Project</th>
                    <th className="th text-xs">Hrs</th>
                  </tr></thead>
                  <tbody>
                    {data.recentAtt.map((r, i) => (
                      <tr key={i} className="tr">
                        <td className="td text-xs text-slate-500">{r[0]}</td>
                        <td className="td font-medium text-slate-700">{r[2]}</td>
                        <td className="td text-slate-500 max-w-[140px] truncate" title={r[6]}>{r[6] || '—'}</td>
                        <td className="td text-slate-500">{r[9] ? toHhmm(r[9]) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {data.recentAtt.map((r, i) => (
                  <div key={i} className="border border-slate-100 rounded-lg p-3 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-500">{r[0]}</span>
                      <span className="font-medium text-slate-700">{r[2]}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 truncate min-w-0 mr-2">{r[6] || '—'}</span>
                      <span className="text-indigo-600 font-semibold shrink-0">{r[9] ? toHhmm(r[9]) : '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <p className="text-slate-400 text-sm">No sessions yet</p>
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Gantt Chart (Project Timeline) ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dayOfYear(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const start = new Date(d.getFullYear(), 0, 0);
  return (d - start) / (1000 * 60 * 60 * 24);
}

function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

function daysBetween(d1, d2) {
  return Math.round((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
}

function monthLabel(dateStr) {
  const d = new Date(dateStr);
  return MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
}

const GANTT_STATUS_COLORS = {
  'In Progress': { bg: '#6366f1', light: '#eef2ff' },
  'Completed': { bg: '#22c55e', light: '#f0fdf4' },
  'On Hold': { bg: '#f59e0b', light: '#fffbeb' },
};
const GANTT_DEFAULT_COLOR = { bg: '#94a3b8', light: '#f8fafc' };

function ProjectAnalytics({ proj, teamMembers }) {
  const spentHrs = proj.spentHrs / 60;
  const reqEffHrs = proj.reqEffHrs / 60;
  const actEffHrs = proj.actEffHrs / 60;
  const effPct = proj.clientHrs > 0 && spentHrs > 0 ? ((proj.clientHrs / spentHrs) * 100).toFixed(1) : '—';
  const reqEffPct = proj.clientHrs > 0 && reqEffHrs > 0 ? ((proj.clientHrs / reqEffHrs) * 100).toFixed(1) : '—';

  const hoursData = [
    { name: 'Spent', value: +spentHrs.toFixed(1) },
    { name: 'Client', value: proj.clientHrs },
    { name: 'Req Eff', value: +reqEffHrs.toFixed(1) },
    { name: 'Act Eff', value: +actEffHrs.toFixed(1) },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
      <div>
        <p className="text-xs text-slate-500 mb-2 font-medium">Hours Breakdown</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={hoursData} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} unit=" h" />
            <Tooltip formatter={(v) => [toHhmm(v * 60), '']} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              <Cell fill="#6366f1" />
              <Cell fill="#3b82f6" />
              <Cell fill="#8b5cf6" />
              <Cell fill="#06b6d4" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-2 font-medium">Efficiency Metrics</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="p-3 rounded-lg bg-emerald-50 text-center">
            <p className="text-2xl font-bold text-emerald-600">{effPct === '—' ? '—' : `${effPct}%`}</p>
            <p className="text-xs text-emerald-600 font-medium">Actual Eff</p>
            <p className="text-[10px] text-emerald-400">(Client / Spent)</p>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 text-center">
            <p className="text-2xl font-bold text-blue-600">{reqEffPct === '—' ? '—' : `${reqEffPct}%`}</p>
            <p className="text-xs text-blue-600 font-medium">Req Eff</p>
            <p className="text-[10px] text-blue-400">(Client / Req Eff)</p>
          </div>
        </div>

        {teamMembers.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-1 font-medium">Team Member Hours</p>
            <ResponsiveContainer width="100%" height={Math.max(80, Math.min(teamMembers.length, 6) * 28)}>
              <BarChart
                data={teamMembers.slice(0, 6).map((m) => ({ name: (m.empName || '').split(' ')[0], fullName: m.empName, spent: +((m.spentHrs || 0) / 60).toFixed(2) }))}
                layout="vertical" barSize={16} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v) => [toHhmm(v * 60), '']} />
                <Bar dataKey="spent" fill="#6366f1" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectDetailPanel({ proj, teamMembers, teamLead, teamTarget, teamClientHrs, targetPct, onClose, navigate }) {
  const [showAnalytics, setShowAnalytics] = useState(false);

  return (
    <div className="mt-4 border border-slate-200 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-slate-800 text-sm">{proj.projName}</h4>
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${proj.status === 'In Progress' ? 'bg-indigo-50 text-indigo-700' : proj.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {proj.status}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{proj.projId} · {proj.client || 'No client'} · Lead: {teamLead || '—'}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X size={14} /></button>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-2 mb-3">
        {[
          { label: 'Spent Hrs', val: toHhmm(proj.spentHrs), cls: 'text-indigo-700 bg-indigo-50' },
          { label: 'Client Hrs', val: `${proj.clientHrs} h`, cls: 'text-blue-700 bg-blue-50' },
          { label: 'Req Eff', val: toHhmm(proj.reqEffHrs), cls: 'text-violet-700 bg-violet-50' },
          { label: 'Act Eff', val: toHhmm(proj.actEffHrs), cls: 'text-cyan-700 bg-cyan-50' },
          { label: 'Period', val: proj.firstDate && proj.lastDate ? `${proj.firstDate.slice(5)} → ${proj.lastDate.slice(5)}` : `${proj.firstDate?.slice(5) || '?'} → ${proj.lastDate?.slice(5) || '?'}`, cls: 'text-slate-700 bg-slate-100' },
        ].map((s) => (
          <div key={s.label} className={`px-3 py-1.5 rounded-lg ${s.cls}`}>
            <p className="text-[10px] font-medium opacity-70">{s.label}</p>
            <p className="text-sm font-bold">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Division target for this team lead */}
      {teamTarget > 0 && (
        <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2 text-xs">
            <Target size={14} className="text-amber-600 shrink-0" />
            <span className="font-medium text-amber-800">Team Target ({teamLead}): {teamTarget} h</span>
            <span className="text-amber-600">· Achieved: {teamClientHrs.toFixed(1)} h</span>
            <span className={`font-bold ${targetPct >= 100 ? 'text-emerald-600' : targetPct >= 85 ? 'text-amber-600' : 'text-red-500'}`}>
              ({targetPct.toFixed(1)}%)
            </span>
          </div>
          <div className="mt-1.5 w-full bg-amber-200 rounded-full h-1.5">
            <div className={`h-1.5 rounded-full transition-all ${targetPct >= 100 ? 'bg-emerald-500' : targetPct >= 85 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(targetPct, 100)}%` }} />
          </div>
        </div>
      )}

      {/* Team members */}
      {teamMembers.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-slate-600 mb-1.5">
            <Users size={12} className="inline mr-1" />
            Team Members ({teamMembers.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {teamMembers.map((m) => (
              <span key={m.empId} className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded-lg text-xs text-slate-700 border border-slate-200 shadow-sm">
                <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                  {(m.empName || '?')[0]}
                </span>
                {m.empName}
                <span className="text-slate-400 font-normal">({toHhmm(m.spentHrs)})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Analytics toggle */}
      <div className="flex gap-2">
        <button onClick={() => setShowAnalytics(!showAnalytics)} className="btn-secondary text-xs gap-1.5">
          <BarChart2 size={12} /> {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
        </button>
        <button onClick={() => {
          onClose();
          navigate('division-targets');
        }} className="btn-secondary text-xs gap-1.5">
          <Award size={12} /> Division Targets
        </button>
      </div>

      {showAnalytics && <ProjectAnalytics proj={proj} teamMembers={teamMembers} />}
    </div>
  );
}

function GanttChart({ ganttData, projTeamMap, navigate }) {
  const now = new Date();
  const [monthFilter, setMonthFilter] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedProj, setSelectedProj] = useState(null);
  const [divTargets, setDivTargets] = useState({});
  useEffect(() => {
    try {
      const key = `divTarget_${now.getFullYear()}_${now.getMonth()}`;
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved) setDivTargets(saved.teamTargets || {});
    } catch {}
  }, []);

  // ── Determine visible date range ──────────────────────────────────────
  const defaultRange = { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };

  const viewRange = useMemo(() => {
    if (monthFilter === 'all') {
      // Show full current year by default — all 12 months visible
      const year = now.getFullYear();
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }

    const ref = new Date();
    if (monthFilter === '12months') {
      const d = new Date(ref); d.setFullYear(d.getFullYear() - 1);
      return { from: d.toISOString().slice(0, 10), to: ref.toISOString().slice(0, 10) };
    }
    if (monthFilter === '6months') {
      const d = new Date(ref); d.setMonth(d.getMonth() - 6);
      return { from: d.toISOString().slice(0, 10), to: ref.toISOString().slice(0, 10) };
    }
    if (monthFilter === '3months') {
      const d = new Date(ref); d.setMonth(d.getMonth() - 3);
      return { from: d.toISOString().slice(0, 10), to: ref.toISOString().slice(0, 10) };
    }
    if (monthFilter === '1month') {
      const d = new Date(ref); d.setMonth(d.getMonth() - 1);
      return { from: d.toISOString().slice(0, 10), to: ref.toISOString().slice(0, 10) };
    }
    if (monthFilter === 'custom' && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    return defaultRange;
  }, [ganttData, monthFilter, customFrom, customTo]);

  // ── Snap to month boundaries ──────────────────────────────────────────
  const timelineRange = useMemo(() => {
    if (!viewRange.from || !viewRange.to) return null;
    const d1 = new Date(viewRange.from);
    const snapFrom = new Date(d1.getFullYear(), d1.getMonth(), 1).toISOString().slice(0, 10);
    const d2 = new Date(viewRange.to);
    const snapTo = new Date(d2.getFullYear(), d2.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { from: snapFrom, to: snapTo };
  }, [viewRange]);

  // ── Build month headers & days ────────────────────────────────────────
  const { timelineMonths, timelineTotalDays } = useMemo(() => {
    if (!timelineRange) return { timelineMonths: [], timelineTotalDays: 365 };
    const result = [];
    const cursor = new Date(timelineRange.from + 'T00:00:00');
    const end = new Date(timelineRange.to + 'T00:00:00');
    let offset = 0;
    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      result.push({
        name: MONTH_NAMES[m],
        year: y,
        days: daysInMonth,
        offset,
      });
      offset += daysInMonth;
      cursor.setMonth(m + 1);
    }
    return { timelineMonths: result, timelineTotalDays: offset };
  }, [timelineRange]);

  // ── Filtered projects ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return ganttData.filter((p) => {
      if (search && !p.projName.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (timelineRange) {
        if (p.lastDate && p.lastDate < timelineRange.from) return false;
        if (p.firstDate && p.firstDate > timelineRange.to) return false;
      }
      return true;
    });
  }, [ganttData, search, statusFilter, timelineRange]);

  const countYears = new Set(timelineMonths.map((m) => m.year)).size;

  // ── Bar click ─────────────────────────────────────────────────────────
  const handleBarClick = (proj) => {
    setSelectedProj((prev) => (prev?.projId === proj.projId ? null : proj));
  };

  const selectedDetail = selectedProj
    ? {
        proj: selectedProj,
        teamMembers: projTeamMap[selectedProj.projId] || [],
        teamLead: selectedProj.teamLead || '',
        teamTarget: divTargets[selectedProj.teamLead] || 0,
        teamClientHrs: selectedProj.clientHrs || 0,
        targetPct: (divTargets[selectedProj.teamLead] || 0) > 0
          ? ((selectedProj.clientHrs || 0) / (divTargets[selectedProj.teamLead] || 1)) * 100
          : 0,
      }
    : null;

  return (
    <div className="card mb-2.5">
      {/* Header & Filters */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Target size={16} className="text-violet-500" /> Project Timeline (Gantt)
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input w-full sm:w-24 text-xs" value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setSelectedProj(null); }}>
            <option value="all">All Months</option>
            <option value="12months">12 Months</option>
            <option value="6months">6 Months</option>
            <option value="3months">3 Months</option>
            <option value="1month">1 Month</option>
            <option value="custom">Custom</option>
          </select>
          {monthFilter === 'custom' && (
            <>
              <input type="month" className="input w-full sm:w-36 text-xs" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} placeholder="From" />
              <span className="text-xs text-slate-400">to</span>
              <input type="month" className="input w-full sm:w-36 text-xs" value={customTo} onChange={(e) => setCustomTo(e.target.value)} placeholder="To" />
            </>
          )}
          <div className="relative flex-1 min-w-[120px]">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-6 w-full text-xs" placeholder="Search..." value={search} onChange={(e) => { setSearch(e.target.value); setSelectedProj(null); }} />
          </div>
          <select className="input w-full sm:w-28 text-xs" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setSelectedProj(null); }}>
            <option value="All">All Status</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
          </select>
          {selectedProj && (
            <button className="btn-secondary text-xs" onClick={() => setSelectedProj(null)}>Clear</button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        {filtered.length} project{filtered.length !== 1 ? 's' : ''}
        {timelineRange && ` · ${monthLabel(timelineRange.from)} → ${monthLabel(timelineRange.to)}`}
      </p>

      {filtered.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8">No projects for selected filters</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Month headers */}
            <div className="flex border-b border-slate-200 mb-0.5" style={{ height: 26 }}>
              {timelineMonths.map((m) => (
                <div key={`${m.year}-${m.name}`}
                  className="text-[10px] text-slate-500 font-medium px-1 truncate flex items-end pb-1 border-r border-slate-100 last:border-r-0"
                  style={{ width: `${(m.days / timelineTotalDays) * 100}%` }}>
                  {m.name}{countYears > 1 ? ` '${String(m.year).slice(2)}` : ''}
                </div>
              ))}
            </div>

            {/* Grid & bars */}
            <div className="relative" style={{ minHeight: filtered.length * 34 + 4 }}>
              {/* Month grid lines */}
              {timelineMonths.map((m) => (
                <div key={`grid-${m.year}-${m.name}`}
                  className="absolute top-0 bottom-0 border-r border-slate-100 pointer-events-none"
                  style={{ left: `${(m.offset / timelineTotalDays) * 100}%`, width: 0 }} />
              ))}

              {/* Project bars */}
              {filtered.map((proj) => {
                const projStartDays = proj.firstDate ? Math.max(0, daysBetween(timelineRange.from, proj.firstDate)) : 0;
                const projEndDays = proj.lastDate ? Math.min(timelineTotalDays, daysBetween(timelineRange.from, proj.lastDate)) : timelineTotalDays;
                const leftPct = Math.max(0, (projStartDays / timelineTotalDays) * 100);
                const widthPct = Math.min(100 - leftPct, Math.max(1, ((projEndDays - projStartDays) / timelineTotalDays) * 100));
                const color = GANTT_STATUS_COLORS[proj.status] || GANTT_DEFAULT_COLOR;
                const isSel = selectedProj?.projId === proj.projId;

                return (
                  <div key={proj.projId}
                    className={`flex items-center rounded cursor-pointer transition-all mb-0.5 ${isSel ? 'ring-2 ring-indigo-400 shadow-md' : 'hover:opacity-80'}`}
                    style={{ height: 32, backgroundColor: isSel ? '#eef2ff' : 'transparent' }}
                    onClick={() => handleBarClick(proj)}>

                    {/* Project label */}
                    <div className="text-xs font-medium text-slate-700 truncate shrink-0 px-2" style={{ width: '170px' }}>
                      {proj.projName}
                      <span className="text-slate-400 font-normal ml-1 text-[10px]">{proj.projId}</span>
                    </div>

                    {/* Bar area */}
                    <div className="relative flex-1 h-full">
                      <div className="absolute top-1/2 -translate-y-1/2 h-5 rounded-md transition-all duration-150 flex items-center px-1.5 gap-1 overflow-hidden"
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: color.bg,
                          opacity: isSel ? 1 : 0.85,
                          boxShadow: isSel ? `0 0 0 2px ${color.bg}33` : 'none',
                        }}
                        title={`${proj.projName}: ${proj.firstDate || '?'} → ${proj.lastDate || '?'} · ${proj.status}`}>
                        {/* Client hrs label inside bar */}
                        {widthPct > 12 && (
                          <span className="text-[10px] font-semibold text-white/90 truncate leading-none">
                            {proj.clientHrs > 0 ? `${proj.clientHrs}h` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Spent hrs badge */}
                    <div className="text-[10px] text-slate-400 px-1.5 shrink-0 w-14 text-right flex flex-col leading-tight">
                      <span>{proj.spentHrs > 0 ? toHhmm(proj.spentHrs) : ''}</span>
                      {proj.clientHrs > 0 && <span className="text-blue-400 font-medium">{proj.clientHrs}h cl</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 mt-3 text-xs flex-wrap">
        {Object.entries(GANTT_STATUS_COLORS).map(([status, c]) => (
          <span key={status} className="flex items-center gap-1.5 text-slate-500">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.bg }} />
            {status}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-slate-400">· <Clock size={11} /> Spent hrs</span>
        <span className="flex items-center gap-1.5 text-blue-500">· Client hrs on bar</span>
        <span className="text-slate-300 ml-auto">Click any bar to view project details</span>
      </div>

      {/* Detail panel */}
      {selectedDetail && (
        <ProjectDetailPanel
          {...selectedDetail}
          onClose={() => setSelectedProj(null)}
          navigate={navigate}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Header Mini Cards — Division Target & Efficiency
   ═══════════════════════════════════════════════════════════════════════════════ */

function DivTargetCard({ divTargetData, clientHrsSum, loading }) {
  const target = divTargetData?.divisionTarget || 0;
  const achieved = clientHrsSum || 0;
  const pct = target > 0 ? Math.min((achieved / target) * 100, 100) : 0;

  if (loading) {
    return (
      <div className="card h-[125px] flex flex-col justify-between min-w-0 w-full">
        <div className="skeleton" style={{ width: 80, height: 12 }} />
        <div className="flex gap-4">
          <div className="skeleton" style={{ width: 48, height: 28 }} />
          <div className="skeleton" style={{ width: 48, height: 28 }} />
        </div>
        <div className="skeleton" style={{ width: '100%', height: 6, borderRadius: 4 }} />
      </div>
    );
  }

  return (
      <div className="card h-[125px] flex flex-col justify-between min-w-0 w-full">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Division Target</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${pct >= 100 ? 'bg-emerald-50 text-emerald-600' : pct >= 85 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'}`}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="flex items-end gap-5">
        <div>
          <p className="text-xl font-bold text-slate-800 leading-none">{target.toFixed(0)}<span className="text-sm font-medium text-slate-400">h</span></p>
          <p className="text-[10px] text-slate-400 mt-0.5">Target</p>
        </div>
        <div>
          <p className="text-xl font-bold text-emerald-600 leading-none">{achieved.toFixed(0)}<span className="text-sm font-medium text-emerald-400">h</span></p>
          <p className="text-[10px] text-slate-400 mt-0.5">Achieved</p>
        </div>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#22c55e' : pct >= 85 ? '#f59e0b' : '#ef4444' }}
        />
      </div>
    </div>
  );
}

function EfficiencyMetricCard({ overallEff, totalSessions, totalHours, loading }) {
  const pct = overallEff != null ? Math.min(Math.round(overallEff * 100), 999) : 0;
  const hrs = totalHours || 0;

  if (loading) {
    return (
      <div className="card h-[125px] flex flex-col justify-between min-w-0 w-full">
        <div className="skeleton" style={{ width: 80, height: 12 }} />
        <div className="skeleton" style={{ width: 60, height: 28 }} />
        <div className="skeleton" style={{ width: 120, height: 12 }} />
      </div>
    );
  }

  return (
    <div className="card h-[125px] flex flex-col justify-between min-w-0 w-full">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Efficiency</span>
      <div>
        <p className={`text-2xl font-bold leading-none ${pct >= 100 ? 'text-emerald-600' : pct >= 85 ? 'text-amber-600' : 'text-red-600'}`}>
          {pct}%
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">Overall Efficiency</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500">{totalSessions ?? '—'} sessions</span>
        <span className="text-xs text-slate-400">·</span>
        <span className="text-xs text-indigo-600 font-semibold">{toHhmm(hrs)}</span>
      </div>
    </div>
  );
}

function CompletedProjectsCard({ completedCount, totalProjects, completedClientHrs, divTarget, overallEff, totalSessions, totalHours, loading }) {
  const pct = totalProjects > 0 ? Math.min(Math.round((completedCount / totalProjects) * 100), 100) : 0;
  const target = divTarget || 0;
  const achieved = completedClientHrs || 0;
  const effPct = overallEff != null ? Math.min(Math.round(overallEff * 100), 999) : 0;
  const hrs = totalHours || 0;

  if (loading) {
    return (
      <div className="card h-[125px] flex flex-col justify-between min-w-0 w-full">
        <div className="skeleton" style={{ width: 80, height: 12 }} />
        <div className="flex gap-4">
          <div className="skeleton" style={{ width: 48, height: 28 }} />
          <div className="skeleton" style={{ width: 48, height: 28 }} />
        </div>
        <div className="skeleton" style={{ width: '100%', height: 6, borderRadius: 4 }} />
      </div>
    );
  }

  return (
    <div className="card h-[125px] flex flex-col justify-between min-w-0 w-full">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Completed</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600">
          {pct}%
        </span>
      </div>
      <div className="flex items-end gap-5">
        <div>
          <p className="text-xl font-bold text-slate-800 leading-none">{achieved.toFixed(0)}<span className="text-sm font-medium text-slate-400">h</span></p>
          <p className="text-[10px] text-slate-400 mt-0.5">Achieved</p>
        </div>
        <div>
          <p className="text-xl font-bold text-slate-800 leading-none">{target.toFixed(0)}<span className="text-sm font-medium text-slate-400">h</span></p>
          <p className="text-[10px] text-slate-400 mt-0.5">Target</p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
        <span className={`text-xs font-bold ${effPct >= 100 ? 'text-emerald-600' : 'text-amber-600'}`}>{effPct}%</span>
        <span className="text-xs text-slate-400">{completedCount} / {totalProjects} done</span>
        <span className="text-[10px] text-indigo-600 font-semibold">{toHhmm(hrs)}</span>
      </div>
    </div>
  );
}

function EmptyChart({ onAction }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 gap-3">
      <p className="text-slate-400 text-sm">No data yet</p>
      <button onClick={onAction} className="btn-primary text-xs px-3 py-1.5">Import from Excel</button>
    </div>
  );
}
