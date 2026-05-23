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

  if (loading) return (
    <div className="page flex items-center justify-center h-full">
      <span className="text-slate-400 animate-pulse">Loading…</span>
    </div>
  );

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BarChart2 size={22} className="text-violet-500" /> Project Progress
          </h1>
          <p className="page-sub">
            {data?.projStats?.length ?? 0} projects · {toHhmm(data?.totalLoggedHrs)} total logged
          </p>
        </div>
        <div className="flex gap-2">
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
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8 w-56 text-xs"
            placeholder="Search project name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <select className="input w-48 text-xs" value={effFilter} onChange={(e) => setEffFilter(e.target.value)}>
            {EFF_TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input w-36 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Status</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || '(No Status)'}</option>)}
          </select>
        </div>
        <div>
          <select className="input w-36 text-xs" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            {SORT_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        {hasFilters && (
          <button className="btn-secondary text-xs" onClick={clearFilters}>Clear</button>
        )}
        <span className="text-xs text-slate-400 ml-auto self-center">
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
      <div className="card overflow-x-auto">
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
    </div>
  );
}
