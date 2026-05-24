import { useEffect, useState, useMemo, useCallback } from 'react';
import { RefreshCw, Save, Edit2, X, Users, Briefcase, TrendingUp, TrendingDown, Target, Award, BarChart3, PieChart } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart as RePie, Pie, Cell, LabelList,
} from 'recharts';
import { api } from '../lib/api';
import TeamAnalytics from './TeamAnalytics';
import LoadingScreen from '../components/LoadingScreen';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6','#78716c','#3b82f6'];

function fmt(val) { return val == null || val === '' ? '—' : val; }
const toHhmm = (min) => {
  if (min == null || isNaN(min)) return '—';
  const a = Math.abs(Math.round(min));
  return `${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
};

export default function DivisionTargets({ toast, currentUser }) {
  const readOnly = currentUser?.role === 'Team Lead';
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projectHours, setProjectHours] = useState([]);
  const [divisionTarget, setDivisionTarget] = useState('');
  const [teamTargets, setTeamTargets] = useState({});
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('targets');
  const [filterTeamLead, setFilterTeamLead] = useState('All');

  const load = async () => {
    setLoading(true);
    try {
      const [p, e, ph, dt] = await Promise.all([api.projects(), api.employees(), api.projectHours(), api.getDivTargets(year, month)]);
      setProjects(p.data || []);
      setEmployees(e.data || []);
      setProjectHours(ph.data || []);
      setDivisionTarget(dt.divisionTarget ?? '');
      setTeamTargets(dt.targets || {});
      setEditing(false);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [year, month]);

  const saveTargets = async () => {
    try {
      await api.saveDivTargets(year, month, divisionTarget, teamTargets);
      toast.success(`Targets saved for ${MONTHS[month]} ${year}`);
      setEditing(false);
    } catch (e) { toast.error(e.message); }
  };

  const teamLeads = useMemo(() => [...new Set(employees.map((r) => r[3]).filter(Boolean))].sort(), [employees]);

  // ── Filtered project hours (month + team lead) ──────────────────────────
  const filteredPH = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return projectHours.filter((r) => {
      if (!(r[1] || '').startsWith(prefix)) return false;
      if (filterTeamLead !== 'All' && r[13] !== filterTeamLead) return false;
      return true;
    });
  }, [projectHours, year, month, filterTeamLead]);

  // ── Filter-aware aggregations ───────────────────────────────────────────
  const projIdsInFilter = useMemo(() => new Set(filteredPH.map((r) => r[5]).filter(Boolean)), [filteredPH]);

  const tlClientHrs = useMemo(() => {
    const m = {};
    projects.forEach((r) => {
      const pid = r[0];
      if (pid && projIdsInFilter.has(pid)) {
        const tl = r[4]; const ch = parseFloat(r[7]) || 0;
        if (tl) m[tl] = (m[tl] || 0) + ch;
      }
    });
    return m;
  }, [projects, projIdsInFilter]);

  const tlSpentHrs = useMemo(() => {
    const m = {};
    filteredPH.forEach((r) => {
      const tl = r[13]; const sh = (parseFloat(r[8]) || 0) / 60;
      if (tl) m[tl] = (m[tl] || 0) + sh;
    });
    return m;
  }, [filteredPH]);

  const tlEmpCount = useMemo(() => {
    const m = {}; employees.forEach((r) => { const tl = r[3]; if (tl) m[tl] = (m[tl] || 0) + 1; }); return m;
  }, [employees]);

  const autoDistribute = useCallback(() => {
    const dt = parseFloat(divisionTarget);
    if (!dt || dt <= 0) return toast.error('Enter a valid division target');
    const totalCH = teamLeads.reduce((s, tl) => s + (tlClientHrs[tl] || 0), 0);
    const dist = {};
    if (totalCH <= 0) {
      const per = dt / teamLeads.length;
      teamLeads.forEach((tl) => { dist[tl] = parseFloat(per.toFixed(2)); });
    } else {
      let allocated = 0;
      teamLeads.forEach((tl, i) => {
        if (i === teamLeads.length - 1) { dist[tl] = parseFloat((dt - allocated).toFixed(2)); }
        else { const v = ((tlClientHrs[tl] || 0) / totalCH) * dt; dist[tl] = parseFloat(v.toFixed(2)); allocated += v; }
      });
    }
    setTeamTargets(dist);
    toast.success('Targets auto-distributed proportionally');
  }, [divisionTarget, teamLeads, tlClientHrs, toast]);

  const setTLTarget = (tl, val) => setTeamTargets((p) => ({ ...p, [tl]: val === '' ? '' : parseFloat(val) || 0 }));

  const totalTarget = useMemo(() => Object.values(teamTargets).reduce((s, v) => s + (parseFloat(v) || 0), 0), [teamTargets]);
  const totalClientHrs = useMemo(() => Object.values(tlClientHrs).reduce((s, v) => s + v, 0), [tlClientHrs]);
  const totalSpentHrs = useMemo(() => Object.values(tlSpentHrs).reduce((s, v) => s + v, 0), [tlSpentHrs]);
  const dt = parseFloat(divisionTarget) || 0;
  const targetDiff = dt > 0 ? totalTarget - dt : 0;
  const overallReached = dt > 0 ? (totalClientHrs / dt) * 100 : 0;
  const overallToDeliver = dt > 0 ? Math.max(0, ((dt - totalClientHrs) / dt) * 100) : 0;
  const overallGap = dt - totalClientHrs;

  const activeTLs = useMemo(() => {
    let list = teamLeads.filter((tl) => (teamTargets[tl] > 0) || (tlClientHrs[tl] > 0) || (tlSpentHrs[tl] > 0));
    if (filterTeamLead !== 'All' && !list.includes(filterTeamLead)) list = [...list, filterTeamLead];
    return list;
  }, [teamLeads, teamTargets, tlClientHrs, tlSpentHrs, filterTeamLead]);

  const chartData = useMemo(() => activeTLs.map((tl) => ({
    name: tl,
    target: parseFloat(teamTargets[tl]) || 0,
    clientHrs: tlClientHrs[tl] || 0,
    spentHrs: tlSpentHrs[tl] || 0,
    gap: (parseFloat(teamTargets[tl]) || 0) - (tlClientHrs[tl] || 0),
    reached: (parseFloat(teamTargets[tl]) || 0) > 0 ? ((tlClientHrs[tl] || 0) / (parseFloat(teamTargets[tl]) || 0)) * 100 : 0,
  })), [activeTLs, teamTargets, tlClientHrs, tlSpentHrs]);

  const pieData = useMemo(() => chartData.filter((d) => d.target > 0).map((d) => ({ name: d.name, value: d.target })), [chartData]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-1">
        <p className="font-medium text-slate-700">{label}</p>
        {payload.map((p) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value} {p.dataKey === 'reached' ? '%' : 'h'}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><Target size={22} className="text-indigo-600" /> Division Targets</h1>
          <p className="page-sub">Set divisional hour targets, distribute to teams, and track progress</p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'targets' && (
            <>
              <select className="input w-28 text-xs" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select className="input w-24 text-xs" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y}>{y}</option>)}
              </select>
            </>
          )}
          <button onClick={load} className="btn-secondary"><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="overflow-x-auto mb-5">
        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('targets')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'targets' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Target size={14} /> Targets
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'analytics' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Award size={14} /> Team Analytics
          </button>
        </div>
      </div>

      {activeTab === 'targets' && (
        <>
          {loading ? <LoadingScreen message="Calculating targets" words={['goals', 'metrics', 'progress', 'results', 'goals']} /> : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            {[
              { label: 'Division Target', val: fmt(dt), cls: 'text-indigo-700', icon: Target, bg: 'bg-indigo-50' },
              { label: `Client Hrs (${MONTHS[month]})`, val: `${totalClientHrs.toFixed(0)} h`, cls: 'text-emerald-700', icon: Briefcase, bg: 'bg-emerald-50' },
              { label: 'Overall % Reached', val: `${overallReached.toFixed(1)}%`, cls: overallReached >= 100 ? 'text-emerald-600' : 'text-amber-600', icon: TrendingUp, bg: 'bg-blue-50' },
              { label: '% To Be Delivered', val: `${overallToDeliver.toFixed(1)}%`, cls: overallToDeliver <= 0 ? 'text-emerald-600' : 'text-amber-600', icon: TrendingDown, bg: 'bg-amber-50' },
              { label: `Spent Hrs (${MONTHS[month]})`, val: toHhmm(totalSpentHrs * 60), cls: 'text-violet-700', icon: Users, bg: 'bg-violet-50' },
              { label: 'Gap (Target − Client)', val: `${overallGap.toFixed(0)} h`, cls: overallGap <= 0 ? 'text-emerald-600' : 'text-red-600', icon: TrendingDown, bg: 'bg-red-50' },
            ].map(({ label, val, cls, icon: Icon, bg }) => (
              <div key={label} className="card flex items-center gap-3">
                <div className={`p-2 rounded-lg ${bg}`}><Icon size={16} className={cls} /></div>
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className={`text-lg font-bold ${cls}`}>{val}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Target Setting Section */}
          <div className="card mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold text-slate-700">Target Distribution</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {!readOnly && !editing && (
                  <button onClick={() => setEditing(true)} className="btn-secondary text-xs"><Edit2 size={12} /> Edit</button>
                )}
                {!readOnly && editing && (
                  <>
                    <button onClick={autoDistribute} className="btn-secondary text-xs">Auto-Distribute</button>
                    <button onClick={() => { load(); setEditing(false); }} className="btn-secondary text-xs"><X size={12} /> Cancel</button>
                    <button onClick={saveTargets} className="btn-primary text-xs"><Save size={12} /> Save</button>
                  </>
                )}
                {readOnly && <span className="text-xs text-slate-400 italic">View only</span>}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 p-3 bg-indigo-50 rounded-lg">
              <div className="w-full sm:w-auto">
                <label className="text-xs text-slate-500 font-medium">Division Target (hrs)</label>
                <input type="number" min="0" step="10" className="input w-full sm:w-36 text-sm font-semibold mt-1" value={divisionTarget} onChange={(e) => setDivisionTarget(e.target.value)} readOnly={readOnly || !editing} disabled={readOnly || !editing} />
              </div>
              <div className="text-xs text-slate-500">
                <p className="font-medium text-slate-700">Allocated: <span className={targetDiff === 0 ? 'text-emerald-600' : 'text-red-600'}>{totalTarget.toFixed(1)} h</span></p>
                <p>{targetDiff === 0 ? '✓ Sum matches division target' : `Remaining to distribute: ${(dt - totalTarget).toFixed(1)} h`}</p>
              </div>
            </div>

            {/* Team Target Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 font-medium text-slate-500">Team Lead</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-500">Employees</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-500">Target Hrs</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-500">Client Hrs</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-500">Spent Hrs ({MONTHS[month]})</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-500">% Reached</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-500">% To Deliver</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-500">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTLs.map((tl, i) => {
                    const tgt = parseFloat(teamTargets[tl]) || 0;
                    const ch = tlClientHrs[tl] || 0;
                    const sh = tlSpentHrs[tl] || 0;
                    const reached = tgt > 0 ? (ch / tgt) * 100 : 0;
                    const toDeliver = tgt > 0 ? Math.max(0, ((tgt - ch) / tgt) * 100) : 0;
                    const gap = tgt - ch;
                    return (
                      <tr key={tl} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-700">{tl}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{tlEmpCount[tl] || 0}</td>
                        <td className="px-3 py-2 text-right">
                          {editing
                            ? <input type="number" min="0" step="0.5" className="input w-24 text-xs text-right" value={teamTargets[tl] ?? ''} onChange={(e) => setTLTarget(tl, e.target.value)} />
                            : <span className="text-slate-700 font-medium">{tgt.toFixed(1)}</span>
                          }
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700 font-medium">{ch.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{toHhmm(sh * 60)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${reached >= 100 ? 'text-emerald-600' : reached >= 85 ? 'text-amber-600' : 'text-red-500'}`}>
                          {reached.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">{toDeliver.toFixed(1)}%</td>
                        <td className={`px-3 py-2 text-right font-medium ${gap <= 0 ? 'text-emerald-600' : gap <= tgt * 0.15 ? 'text-amber-600' : 'text-red-500'}`}>
                          {gap > 0 ? '+' : ''}{gap.toFixed(1)} h
                        </td>
                      </tr>
                    );
                  })}
                  {activeTLs.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No team leads with data — assign employees to team leads first</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-semibold text-slate-700">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">{activeTLs.reduce((s, tl) => s + (tlEmpCount[tl] || 0), 0)}</td>
                    <td className="px-3 py-2 text-right">{totalTarget.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{totalClientHrs.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{toHhmm(totalSpentHrs * 60)}</td>
                    <td className={`px-3 py-2 text-right ${overallReached >= 100 ? 'text-emerald-600' : overallReached >= 85 ? 'text-amber-600' : 'text-red-500'}`}>
                      {overallReached.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right">{overallToDeliver.toFixed(1)}%</td>
                    <td className={`px-3 py-2 text-right ${overallGap <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {overallGap > 0 ? '+' : ''}{overallGap.toFixed(1)} h
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="md:hidden space-y-2">
              {activeTLs.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No team leads with data</p>
              ) : (<>
                {activeTLs.map((tl) => {
                  const tgt = parseFloat(teamTargets[tl]) || 0;
                  const ch = tlClientHrs[tl] || 0;
                  const sh = tlSpentHrs[tl] || 0;
                  const reached = tgt > 0 ? (ch / tgt) * 100 : 0;
                  const toDeliver = tgt > 0 ? Math.max(0, ((tgt - ch) / tgt) * 100) : 0;
                  const gap = tgt - ch;
                  return (
                    <div key={tl} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-slate-800">{tl}</div>
                        <span className="text-slate-400">Emps: {tlEmpCount[tl] || 0}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                        <span>Target: <strong className="text-slate-700">{tgt.toFixed(1)}</strong></span>
                        <span>Client: <strong className="text-emerald-600">{ch.toFixed(1)}</strong></span>
                        <span>Spent: <strong className="text-violet-600">{toHhmm(sh * 60)}</strong></span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                        <span>Reached: <strong className={reached >= 100 ? 'text-emerald-600' : reached >= 85 ? 'text-amber-600' : 'text-red-500'}>{reached.toFixed(1)}%</strong></span>
                        <span>To Deliver: <strong className="text-slate-500">{toDeliver.toFixed(1)}%</strong></span>
                        <span>Gap: <strong className={gap <= 0 ? 'text-emerald-600' : gap <= tgt * 0.15 ? 'text-amber-600' : 'text-red-500'}>{gap > 0 ? '+' : ''}{gap.toFixed(1)} h</strong></span>
                      </div>
                    </div>
                  );
                })}
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs">
                  <div className="flex items-center justify-between font-semibold text-slate-700">
                    <span>Total</span>
                    <div className="flex gap-3">
                      <span>{totalTarget.toFixed(1)}</span>
                      <span className="text-emerald-600">{totalClientHrs.toFixed(1)}</span>
                      <span className="text-violet-600">{toHhmm(totalSpentHrs * 60)}</span>
                    </div>
                  </div>
                </div>
              </>)}
            </div>
          </div>

          {/* Filter */}
          <div className="card mb-5 flex flex-col sm:flex-row flex-wrap gap-3 items-end">
            <div className="w-full sm:w-auto">
              <label className="label">Team Lead</label>
              <select className="input w-full sm:w-44" value={filterTeamLead} onChange={(e) => setFilterTeamLead(e.target.value)}>
                <option value="All">All Team Leads</option>
                {teamLeads.map((tl) => <option key={tl}>{tl}</option>)}
              </select>
            </div>
            {filterTeamLead !== 'All' && (
              <button className="btn-secondary text-xs self-end" onClick={() => setFilterTeamLead('All')}>
                Clear
              </button>
            )}
            <div className="text-sm text-slate-500 self-end pb-2 ml-auto">
              {filteredPH.length} sessions
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            {/* Team Target vs Client Hours */}
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><BarChart3 size={15} /> Target vs Client Hours by Team</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="target" name="Target Hrs" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="clientHrs" name="Client Hrs" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-slate-400 text-sm py-8 text-center">No data to display</p>}
            </div>

            {/* Gap Analysis */}
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><Target size={15} /> Gap Analysis (Target − Client Hrs)</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="gap" name="Gap (h)" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.gap <= 0 ? '#10b981' : entry.gap <= entry.target * 0.15 ? '#f59e0b' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-slate-400 text-sm py-8 text-center">No data to display</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            {/* % Reached by Team */}
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><TrendingUp size={15} /> % Target Reached by Team</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 40, left: 80, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="reached" name="% Reached" radius={[0, 4, 4, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.reached >= 100 ? '#10b981' : entry.reached >= 85 ? '#f59e0b' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-slate-400 text-sm py-8 text-center">No data to display</p>}
            </div>

            {/* Target Distribution Pie */}
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><PieChart size={15} /> Target Distribution by Team</h3>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <RePie>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => `${v.toFixed(1)} h`} />
                  </RePie>
                </ResponsiveContainer>
              ) : <p className="text-slate-400 text-sm py-8 text-center">Set targets to see distribution</p>}
            </div>
          </div>

          {/* Team-wise Reach Details Table */}
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Team-wise Target Reach Details</h3>
            {chartData.length > 0 ? (<>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Team Lead</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Target</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Client Hrs</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">% Reached</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">% To Deliver</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Gap</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((d, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-700">{d.name}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{d.target.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 font-medium">{d.clientHrs.toFixed(1)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${d.reached >= 100 ? 'text-emerald-600' : d.reached >= 85 ? 'text-amber-600' : 'text-red-500'}`}>
                          {d.reached.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">
                          {d.target > 0 ? `${Math.max(0, ((d.target - d.clientHrs) / d.target) * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right font-medium ${d.gap <= 0 ? 'text-emerald-600' : d.gap <= d.target * 0.15 ? 'text-amber-600' : 'text-red-500'}`}>
                          {d.gap > 0 ? '+' : ''}{d.gap.toFixed(1)} h
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${d.reached >= 100 ? 'bg-emerald-50 text-emerald-600' : d.reached >= 85 ? 'bg-amber-50 text-amber-600' : d.reached > 0 ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-400'}`}>
                            {d.reached >= 100 ? 'Achieved' : d.reached >= 85 ? 'On Track' : d.reached > 0 ? 'Behind' : 'No Data'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-2">
                {chartData.map((d, i) => (
                  <div key={i} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-slate-800">{d.name}</div>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${d.reached >= 100 ? 'bg-emerald-50 text-emerald-600' : d.reached >= 85 ? 'bg-amber-50 text-amber-600' : d.reached > 0 ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-400'}`}>
                        {d.reached >= 100 ? 'Achieved' : d.reached >= 85 ? 'On Track' : d.reached > 0 ? 'Behind' : 'No Data'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                      <span>Target: <strong className="text-slate-700">{d.target.toFixed(1)}</strong></span>
                      <span>Client: <strong className="text-emerald-600">{d.clientHrs.toFixed(1)}</strong></span>
                      <span>Reached: <strong className={d.reached >= 100 ? 'text-emerald-600' : d.reached >= 85 ? 'text-amber-600' : 'text-red-500'}>{d.reached.toFixed(1)}%</strong></span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                      <span>To Deliver: <strong className="text-slate-500">{d.target > 0 ? `${Math.max(0, ((d.target - d.clientHrs) / d.target) * 100).toFixed(1)}%` : '—'}</strong></span>
                      <span>Gap: <strong className={d.gap <= 0 ? 'text-emerald-600' : d.gap <= d.target * 0.15 ? 'text-amber-600' : 'text-red-500'}>{d.gap > 0 ? '+' : ''}{d.gap.toFixed(1)} h</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </>) : <p className="text-slate-400 text-sm py-4 text-center">Set targets to see details</p>}
          </div>
        </>
      )}
        </>
      )}

      {activeTab === 'analytics' && (
        <TeamAnalytics toast={toast} />
      )}
    </div>
  );
}
