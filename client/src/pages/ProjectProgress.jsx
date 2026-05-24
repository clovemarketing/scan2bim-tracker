import { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Clock, FolderKanban, Users, TrendingUp, Search, BarChart2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import { api } from '../lib/api';


const toHhmm = (min) => {
  if (min == null || isNaN(min)) return '—';
  const a = Math.abs(Math.round(min));
  return `${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
};

function EffBadge({ ratio }) {
  if (!ratio || ratio === 0) return <span className="text-slate-300">—</span>;
  const pct = Math.round(ratio * 100);
  const cls = ratio >= 1
    ? 'text-emerald-600 bg-emerald-50'
    : ratio >= 0.85
    ? 'text-amber-600 bg-amber-50'
    : 'text-red-600 bg-red-50';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{pct}%</span>
  );
}

function StatCard({ icon: Icon, bg, color, label, value, sub }) {
  return (
    <div className="card flex items-center gap-3">
      <div className={`p-2 ${bg} rounded-lg`}><Icon size={18} className={color} /></div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-800">{value}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

const EFF_TIERS = [
  { key: 'All', label: 'All Efficiency' },
  { key: 'exceeded', label: 'Exceeded (≥100%)' },
  { key: 'ontrack', label: 'On Track (85–99%)' },
  { key: 'below', label: 'Below (<85%)' },
];

const SORT_OPTIONS = [
  { key: 'spent_desc', label: 'Spent ↓' },
  { key: 'spent_asc', label: 'Spent ↑' },
  { key: 'remaining_asc', label: 'Remaining ↑' },
  { key: 'eff_desc', label: 'Efficiency ↓' },
  { key: 'name_asc', label: 'Name A–Z' },
];

const STATUS_OPTIONS = ['In Progress', 'Completed', 'On Hold', ''];

export default function ProjectProgress({ toast, navigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [effFilter, setEffFilter] = useState('All');
  const [sortKey, setSortKey] = useState('spent_desc');
  const [statusFilter, setStatusFilter] = useState('All');

  const load = async () => {
    setLoading(true);
    try { setData(await api.dashboard()); }
    catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!data?.projStats) return [];
    let list = data.projStats.filter((p) => {
      if (search && !p.projName.toLowerCase().includes(search.toLowerCase()) &&
          !p.projId.toLowerCase().includes(search.toLowerCase())) return false;
      if (effFilter !== 'All') {
        const pct = p.avgEff ? p.avgEff * 100 : 0;
        if (effFilter === 'exceeded' && pct < 100) return false;
        if (effFilter === 'ontrack' && (pct < 85 || pct >= 100)) return false;
        if (effFilter === 'below' && (pct === 0 || pct >= 85)) return false;
      }
      if (statusFilter !== 'All') {
        if ((p.status || '') !== statusFilter) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortKey === 'spent_desc') return b.spent - a.spent;
      if (sortKey === 'spent_asc') return a.spent - b.spent;
      if (sortKey === 'remaining_asc') return (a.remaining ?? Infinity) - (b.remaining ?? Infinity);
      if (sortKey === 'eff_desc') return (b.avgEff || 0) - (a.avgEff || 0);
      if (sortKey === 'name_asc') return a.projName.localeCompare(b.projName);
      return 0;
    });
    return list;
  }, [data, search, effFilter, sortKey, statusFilter]);

  const chartData = filtered.slice(0, 10).map((p) => ({
    name: p.projName.length > 22 ? p.projName.slice(0, 22) + '…' : p.projName,
    fullName: p.projName,
    spent: +(p.spent / 60).toFixed(1),
    remaining: p.remaining != null && p.remaining > 0 ? p.remaining : 0,
  }));

  const totalSpent = filtered.reduce((s, p) => s + (p.spent || 0), 0);
  const totalSessions = filtered.reduce((s, p) => s + (p.sessions || 0), 0);
  const overrunCount = filtered.filter((p) => p.remaining != null && p.remaining < 0).length;
  const avgEffVals = filtered.map((p) => p.avgEff).filter((v) => v && v > 0);
  const avgEff = avgEffVals.length
    ? Math.round(avgEffVals.reduce((s, v) => s + v, 0) / avgEffVals.length * 100)
    : 0;

  const clearFilters = () => { setSearch(''); setEffFilter('All'); setSortKey('spent_desc'); setStatusFilter('All'); };
  const hasFilters = search || effFilter !== 'All' || sortKey !== 'spent_desc' || statusFilter !== 'All';

  function StatCardSkeleton() {
    return (
      <div className="card flex items-center gap-2 sm:gap-3">
        <div className="skeleton skeleton-icon-box sm:w-9 sm:h-9" style={{ width: 28, height: 28 }} />
        <div className="flex-1 min-w-0">
          <div className="skeleton sm:w-24 sm:h-3.5" style={{ width: '60%', height: 11 }} />
          <div className="skeleton mt-1 sm:w-16 sm:h-6" style={{ width: '40%', height: 18 }} />
          <div className="skeleton mt-1 sm:w-20 sm:h-3" style={{ width: '50%', height: 10 }} />
        </div>
      </div>
    );
  }

  function FilterBarSkeleton() {
    return (
      <div className="card mb-5 flex flex-wrap gap-3 items-end">
        <div className="skeleton" style={{ width: 200, height: 34 }} />
        <div className="skeleton" style={{ width: 160, height: 34 }} />
        <div className="skeleton" style={{ width: 130, height: 34 }} />
        <div className="skeleton" style={{ width: 130, height: 34 }} />
        <div className="skeleton ml-auto" style={{ width: 120, height: 14 }} />
      </div>
    );
  }

  function ChartSkeleton() {
    return (
      <div className="card mb-5">
        <div className="skeleton" style={{ width: 240, height: 14 }} />
        <div className="skeleton mt-3" style={{ width: '100%', height: 220 }} />
      </div>
    );
  }

  function TableSkeleton() {
    return (
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {Array.from({ length: 10 }).map((_, i) => (
                <th key={i} className="th text-xs"><div className="skeleton" style={{ width: 60, height: 12 }} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, r) => (
              <tr key={r} className="border-b border-slate-50">
                {Array.from({ length: 10 }).map((_, c) => (
                  <td key={c} className="td">
                    <div className="skeleton" style={{ width: c === 0 ? 140 : c === 4 ? 48 : 60, height: 14 }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading) return (
    <div className="page">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="skeleton" style={{ width: 200, height: 24 }} />
          <div className="skeleton mt-1.5" style={{ width: 180, height: 14 }} />
        </div>
        <div className="flex gap-2">
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 130, height: 36, borderRadius: 8 }} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <FilterBarSkeleton />
      <ChartSkeleton />
      <TableSkeleton />
    </div>
  );

  return (
    <div className="page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-2">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BarChart2 size={22} className="text-violet-500" /> Project Progress
          </h1>
          <p className="page-sub">
            {data?.projStats?.length ?? 0} projects · {toHhmm(data?.totalLoggedHrs)} total logged
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={load} className="btn-secondary"><RefreshCw size={14} /></button>
          {navigate && (
            <button onClick={() => navigate('project-hours')} className="btn-secondary text-xs">
              View Hours Log →
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard icon={Clock} bg="bg-violet-50" color="text-violet-600"
          label="Total Hours Logged" value={toHhmm(totalSpent)}
          sub={`${filtered.length} projects`} />
        <StatCard icon={FolderKanban} bg="bg-indigo-50" color="text-indigo-600"
          label="Sessions" value={totalSessions}
          sub="across filtered projects" />
        <StatCard icon={TrendingUp} bg="bg-amber-50" color="text-amber-600"
          label="Avg Efficiency" value={`${avgEff}%`}
          sub={`${overrunCount} overrun`} />
        <StatCard icon={Users} bg="bg-rose-50" color="text-rose-600"
          label="Over Budget" value={overrunCount}
          sub={`of ${filtered.length} projects`} />
      </div>

      {/* Filters */}
      <div className="card mb-5 flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8 w-full text-xs"
            placeholder="Search project name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <select className="input w-full text-xs" value={effFilter} onChange={(e) => setEffFilter(e.target.value)}>
            {EFF_TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[110px]">
          <label className="label">Status</label>
          <select className="input w-full text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Status</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || '(No Status)'}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[110px]">
          <select className="input w-full text-xs" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            {SORT_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        {hasFilters && (
          <button className="btn-secondary text-xs shrink-0" onClick={clearFilters}>Clear</button>
        )}
        <span className="text-xs text-slate-400 ml-auto self-center shrink-0">
          {filtered.length} of {data?.projStats?.length ?? 0} projects
        </span>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card mb-5">
          <p className="text-xs text-slate-500 font-medium mb-3">
            Hours: Spent vs Remaining — top 10 by hours
          </p>
          <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 36)}>
            <BarChart data={chartData} layout="vertical" barSize={14} margin={{ left: 0, right: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
              <Tooltip
                formatter={(val, name) => [val > 0 ? toHhmm(val * 60) : '—', name]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="spent" name="Spent" fill="#6366f1" stackId="a">
                <LabelList dataKey="spent" position="insideRight"
                  style={{ fontSize: 9, fill: '#fff' }}
                  formatter={(v) => v > 0 ? toHhmm(v * 60) : ''} />
              </Bar>
              <Bar dataKey="remaining" name="Remaining" fill="#e0e7ff" stackId="a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="th text-xs text-left">Project</th>
              <th className="th text-xs text-right">Total Spent Time</th>
              <th className="th text-xs text-right">Req Eff Time</th>
              <th className="th text-xs text-right">Act Eff Time</th>
              <th className="th text-xs text-right">Client Hrs</th>
              <th className="th text-xs text-right">Remaining</th>
              <th className="th text-xs text-center">Emp Eff</th>
              <th className="th text-xs text-center">Proj Eff</th>
              <th className="th text-xs text-center">Proj Act Eff</th>
              <th className="th text-xs text-center">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="td text-center text-slate-400 py-12">
                  No projects match the current filters
                </td>
              </tr>
            ) : filtered.map((p, i) => {
              const isOverrun = p.remaining != null && p.remaining < 0;
              const isLow = p.remaining != null && p.remaining >= 0 && p.remaining < 20;
              const remCls = p.remaining == null
                ? 'text-slate-400'
                : isOverrun
                ? 'text-red-600 font-semibold'
                : p.remaining === 0
                ? 'text-slate-500 font-medium'
                : isLow
                ? 'text-amber-600 font-semibold'
                : 'text-emerald-600';

              return (
                <tr key={i} className={`border-b border-slate-50 transition-colors hover:bg-slate-50/60 ${isOverrun ? 'bg-red-50/30' : ''}`}>
                  <td className="td">
                    <p className="font-semibold text-slate-800 leading-snug">{p.projName}</p>
                    <p className="text-xs text-slate-400 font-normal">{p.projId}</p>
                  </td>
                  <td className="td text-right">
                    <span className="font-bold text-indigo-600">{toHhmm(p.spent)}</span>
                  </td>
                  <td className="td text-right text-violet-600">
                    {p.reqEff > 0 ? toHhmm(p.reqEff) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="td text-right text-cyan-600">
                    {p.actEff > 0 ? toHhmm(p.actEff) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="td text-right text-slate-500">
                    {p.clientHrs > 0 ? `${p.clientHrs} h` : <span className="text-slate-300">—</span>}
                  </td>
                  <td className={`td text-right ${remCls}`}>
                    {p.remaining != null
                      ? isOverrun ? `${p.remaining.toFixed(1)} h ▲` : `${p.remaining.toFixed(1)} h`
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="td text-center">
                    <EffBadge ratio={p.avgEff} />
                  </td>
                  <td className="td text-center">
                    <EffBadge ratio={p.clientHrs > 0 && p.reqEff > 0 ? p.clientHrs / (p.reqEff / 60) : 0} />
                  </td>
                  <td className="td text-center">
                    <EffBadge ratio={p.clientHrs > 0 && p.spent > 0 ? p.clientHrs / (p.spent / 60) : 0} />
                  </td>
                  <td className="td text-center text-slate-500">{p.sessions}</td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td className="td font-semibold text-slate-700">
                  Total <span className="text-xs font-normal text-slate-400">({filtered.length} projects)</span>
                </td>
                <td className="td text-right font-bold text-indigo-600">{toHhmm(totalSpent)}</td>
                <td className="td text-right font-semibold text-violet-600">
                  {toHhmm(filtered.reduce((s, p) => s + (p.reqEff || 0), 0))}
                </td>
                <td className="td text-right font-semibold text-cyan-600">
                  {toHhmm(filtered.reduce((s, p) => s + (p.actEff || 0), 0))}
                </td>
                <td className="td text-right font-semibold text-slate-500">
                  {filtered.reduce((s, p) => s + (parseFloat(p.clientHrs) || 0), 0).toFixed(1) || '—'}
                </td>
                <td className="td text-right font-semibold text-slate-600">
                  {(() => {
                    const total = filtered.reduce((s, p) => s + (p.remaining ?? 0), 0);
                    const cls = total < 0 ? 'text-red-600' : total < 20 ? 'text-amber-600' : 'text-emerald-600';
                    return <span className={cls}>{total.toFixed(1)} h</span>;
                  })()}
                </td>
                <td className="td text-center"><EffBadge ratio={avgEff / 100} /></td>
                <td className="td text-center">
                  <EffBadge ratio={(() => {
                    const totalClient = filtered.reduce((s, p) => s + (parseFloat(p.clientHrs) || 0), 0);
                    const totalReq = filtered.reduce((s, p) => s + (p.reqEff || 0), 0);
                    return totalClient > 0 && totalReq > 0 ? totalClient / (totalReq / 60) : 0;
                  })()} />
                </td>
                <td className="td text-center">
                  <EffBadge ratio={(() => {
                    const totalClient = filtered.reduce((s, p) => s + (parseFloat(p.clientHrs) || 0), 0);
                    return totalClient > 0 && totalSpent > 0 ? totalClient / (totalSpent / 60) : 0;
                  })()} />
                </td>
                <td className="td text-center font-semibold text-slate-500">{totalSessions}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="card text-center text-slate-400 py-12 text-xs">No projects match the current filters</div>
        ) : (
          filtered.map((p, i) => {
            const isOverrun = p.remaining != null && p.remaining < 0;
            const isLow = p.remaining != null && p.remaining >= 0 && p.remaining < 20;
            const remCls = p.remaining == null
              ? 'text-slate-400'
              : isOverrun
              ? 'text-red-600 font-semibold'
              : p.remaining === 0
              ? 'text-slate-500 font-medium'
              : isLow
              ? 'text-amber-600 font-semibold'
              : 'text-emerald-600';
            return (
              <div key={i} className={`card !p-3 border border-slate-100 ${isOverrun ? 'bg-red-50/20' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{p.projName}</p>
                    <p className="text-[10px] text-slate-400">{p.projId}</p>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0">{p.sessions} sessions</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mt-2 text-[11px]">
                  <div className="text-center p-1 rounded bg-indigo-50/50">
                    <p className="text-[9px] text-slate-400">Spent</p>
                    <p className="font-bold text-indigo-600 leading-tight">{toHhmm(p.spent)}</p>
                  </div>
                  <div className="text-center p-1 rounded bg-violet-50/50">
                    <p className="text-[9px] text-slate-400">Req Eff</p>
                    <p className="text-violet-600 font-medium leading-tight">{p.reqEff > 0 ? toHhmm(p.reqEff) : '—'}</p>
                  </div>
                  <div className="text-center p-1 rounded bg-cyan-50/50">
                    <p className="text-[9px] text-slate-400">Act Eff</p>
                    <p className="text-cyan-600 font-medium leading-tight">{p.actEff > 0 ? toHhmm(p.actEff) : '—'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Client:</span>
                    <span className="text-slate-600 font-medium">{p.clientHrs > 0 ? `${p.clientHrs} h` : '—'}</span>
                  </div>
                  <div className={`flex items-center gap-1 ${remCls}`}>
                    <span className="text-slate-400">Rem:</span>
                    {p.remaining != null
                      ? <>{isOverrun ? `${p.remaining.toFixed(1)} h ▲` : `${p.remaining.toFixed(1)} h`}</>
                      : <span className="text-slate-300">—</span>}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Emp Eff:</span>
                    <EffBadge ratio={p.avgEff} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Proj:</span>
                    <EffBadge ratio={p.clientHrs > 0 && p.reqEff > 0 ? p.clientHrs / (p.reqEff / 60) : 0} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Act:</span>
                    <EffBadge ratio={p.clientHrs > 0 && p.spent > 0 ? p.clientHrs / (p.spent / 60) : 0} />
                  </div>
                </div>
              </div>
            );
          })
        )}
        {filtered.length > 0 && (
          <div className="card !p-3 border border-slate-100 bg-slate-50">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>Total ({filtered.length})</span>
              <div className="flex gap-2 text-[11px]">
                <span className="text-indigo-600">{toHhmm(totalSpent)}</span>
                <span className="text-violet-600">{toHhmm(filtered.reduce((s, p) => s + (p.reqEff || 0), 0))}</span>
                <span className="text-cyan-600">{toHhmm(filtered.reduce((s, p) => s + (p.actEff || 0), 0))}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
