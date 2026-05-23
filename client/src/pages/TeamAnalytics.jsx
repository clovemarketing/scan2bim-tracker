import { useEffect, useState, useMemo } from 'react';
import {
  RefreshCw, ChevronDown, ChevronRight, Users, Briefcase, Clock,
  Target, TrendingUp, BarChart2, PieChart as PieIcon, Award,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList, PieChart, Pie, Cell,
} from 'recharts';
import { api } from '../lib/api';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── helpers ────────────────────────────────────────────────────────────────────
function pct(val) { return val == null || val === '' ? '—' : `${Math.round(val * 100)}%`; }
function hrs(val) { return val == null || val === '' || val === 0 ? '—' : `${val} h`; }
function fmtHrs(val) {
  const h = parseFloat(val) || 0;
  if (!h) return '—';
  const whole = Math.floor(h);
  const mins  = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}h ${mins}m` : `${whole}h`;
}
function minHrs(val) {
  const m = parseFloat(val) || 0;
  if (!m) return '—';
  const h = Math.floor(m / 60);
  const mins = Math.round(m % 60);
  return h > 0 && mins > 0 ? `${h}h ${mins}m` : h > 0 ? `${h}h` : `${mins}m`;
}
const toHhmm = (min) => {
  if (min == null || isNaN(min)) return '—';
  const a = Math.abs(Math.round(min));
  return `${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
};

const TIER_CLS = (v) =>
  !v || v === 0 ? 'text-slate-400'
  : v >= 1 ? 'text-emerald-600 bg-emerald-50'
  : v >= 0.85 ? 'text-amber-600 bg-amber-50'
  : 'text-red-600 bg-red-50';

function EffBadge({ val }) {
  if (!val || val === 0) return <span className="text-slate-300">—</span>;
  const p = Math.round(val * 100);
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${TIER_CLS(val)}`}>{p}%</span>
  );
}

function StatusBadge({ status }) {
  const cls = status === 'In Progress' ? 'bg-indigo-50 text-indigo-700'
    : status === 'Completed' ? 'bg-emerald-50 text-emerald-700'
    : status === 'On Hold' ? 'bg-amber-50 text-amber-700'
    : 'bg-slate-50 text-slate-500';
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>{status || '—'}</span>;
}

const PIE_COLORS = ['#6366f1','#8b5cf6','#ec4899','#06b6d4','#10b981','#f59e0b','#ef4444','#3b82f6','#a855f7','#14b8a6'];

// ── sub-components ─────────────────────────────────────────────────────────────
function StatPill({ label, value, cls = 'bg-slate-50 text-slate-700' }) {
  return (
    <div className={`px-3 py-2 rounded-lg ${cls}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-sm font-bold leading-tight">{value}</p>
    </div>
  );
}

function SectionHeader({ children, count, expand, onToggle }) {
  return (
    <div className="flex items-center justify-between cursor-pointer select-none" onClick={onToggle}>
      <div className="flex items-center gap-2">
        {expand !== undefined && (
          expand ? <ChevronDown size={15} className="text-slate-400" />
                 : <ChevronRight size={15} className="text-slate-400" />
        )}
        <span className="font-semibold text-slate-800 text-sm">{children}</span>
        {count != null && <span className="text-xs text-slate-400 font-normal">({count})</span>}
      </div>
    </div>
  );
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────────
export default function TeamAnalytics({ toast }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('lead');
  const now = new Date();
  const [year, setYear]         = useState(now.getFullYear());
  const [month, setMonth]       = useState(now.getMonth());
  const [divisionTarget, setDivisionTarget] = useState('');
  const [teamTargets, setTeamTargets]       = useState({});
  const [empRows, setEmpRows]   = useState([]);

  // filters
  const [selLead, setSelLead]     = useState('All');
  const [selStatus, setSelStatus] = useState('All');
  const [selEmp, setSelEmp]       = useState('All');
  const [selProj, setSelProj]     = useState('');   // for chart drill-down

  // expand state
  const [expLeads, setExpLeads]   = useState({});
  const [expProjs, setExpProjs]   = useState({});
  const [expEmps,  setExpEmps]    = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [ta, empRes] = await Promise.all([api.teamAnalytics(), api.employees()]);
      setData(ta); setEmpRows(empRes.data || []);
      const key = `divTarget_${year}_${month}`;
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (saved) { setDivisionTarget(saved.divisionTarget ?? ''); setTeamTargets(saved.teamTargets || {}); }
        else { setDivisionTarget(''); setTeamTargets({}); }
      } catch { setDivisionTarget(''); setTeamTargets({}); }
    }
    catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [year, month]);

  const tog = (setState, key) => setState((p) => ({ ...p, [key]: !p[key] }));

  // ── derived filter options ──────────────────────────────────────────────────
  const leadOptions = useMemo(() => data?.byLead.map((l) => l.leadName) || [], [data]);
  const statusOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.byProject.map((p) => p.status).filter(Boolean))].sort();
  }, [data]);
  const empOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.byEmployee.map((e) => e.empName).filter(Boolean))].sort();
  }, [data]);

  // ── filtered slices ─────────────────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    if (!data) return [];
    return data.byLead.filter((l) => selLead === 'All' || l.leadName === selLead);
  }, [data, selLead]);

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    return data.byProject.filter((p) => {
      if (selLead !== 'All' && !p.employees.some((e) => e.leadName === selLead)) return false;
      if (selStatus !== 'All' && p.status !== selStatus) return false;
      return true;
    });
  }, [data, selLead, selStatus]);

  const filteredEmployees = useMemo(() => {
    if (!data) return [];
    return data.byEmployee.filter((e) => {
      if (selLead !== 'All' && e.leadName !== selLead) return false;
      if (selEmp !== 'All' && e.empName !== selEmp) return false;
      return true;
    });
  }, [data, selLead, selEmp]);

  // ── overall summary ─────────────────────────────────────────────────────────
  const overall = useMemo(() => {
    if (!data) return null;
    return data.byProject.reduce((t, p) => ({
      clientHrs: t.clientHrs + p.clientHrs,
      spent:     t.spent     + p.totalSpent,
      reqEff:    t.reqEff    + p.totalReqEff,
      actEff:    t.actEff    + p.totalActEff,
    }), { clientHrs: 0, spent: 0, reqEff: 0, actEff: 0 });
  }, [data]);

  // ── target data ──────────────────────────────────────────────────────────────
  const dt = parseFloat(divisionTarget) || 0;
  const tlTotalTargets = useMemo(() => {
    const m = {}; Object.entries(teamTargets).forEach(([tl, v]) => { m[tl] = parseFloat(v) || 0; }); return m;
  }, [teamTargets]);
  const totalTargetSum = Object.values(tlTotalTargets).reduce((s, v) => s + v, 0);

  const tlClientFromAnalytics = useMemo(() => {
    if (!data) return {};
    const m = {};
    data.byLead.forEach((l) => { m[l.leadName] = l.totals.clientHrs; });
    return m;
  }, [data]);

  if (loading) return (
    <div className="page flex items-center justify-center h-full">
      <span className="text-slate-400 animate-pulse">Loading analytics…</span>
    </div>
  );
  if (!data) return null;

  const TABS = [
    { key: 'lead',     label: 'Team Lead',      icon: Award },
    { key: 'project',  label: 'Project Report', icon: Briefcase },
    { key: 'employee', label: 'Employee View',  icon: Users },
    { key: 'charts',   label: 'Charts',         icon: BarChart2 },
  ];

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Award size={22} className="text-violet-500" /> Team & Project Analytics
          </h1>
          <p className="page-sub">
            {data.byLead.length} teams · {data.byProject.length} projects · {data.byEmployee.length} employees
          </p>
        </div>
        <button onClick={load} className="btn-secondary"><RefreshCw size={14} /></button>
      </div>

      {/* Overall summary */}
      {overall && (
        <div className="space-y-4 mb-5">
          {/* Division target cards */}
          {dt > 0 && (() => {
            const overallReached = dt > 0 ? (overall.clientHrs / dt) * 100 : 0;
            const overallToDeliver = dt > 0 ? Math.max(0, ((dt - overall.clientHrs) / dt) * 100) : 0;
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="card flex items-center gap-3">
                  <div className="p-2 bg-amber-50 rounded-lg"><Target size={17} className="text-amber-600" /></div>
                  <div>
                    <p className="text-xs text-slate-500">Division Target ({MONTHS[month]} {year})</p>
                    <p className="text-xl font-bold text-slate-800">{hrs(dt)}</p>
                  </div>
                </div>
                <div className={`card flex items-center gap-3 ${overallReached >= 100 ? 'bg-emerald-50/40' : ''}`}>
                  <div className={`p-2 rounded-lg ${overallReached >= 100 ? 'bg-emerald-100' : 'bg-blue-50'}`}><TrendingUp size={17} className={overallReached >= 100 ? 'text-emerald-600' : 'text-blue-600'} /></div>
                  <div>
                    <p className="text-xs text-slate-500">% Achieved</p>
                    <p className={`text-xl font-bold ${overallReached >= 100 ? 'text-emerald-600' : overallReached >= 85 ? 'text-amber-600' : 'text-red-500'}`}>
                      {overallReached.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="card flex items-center gap-3">
                  <div className="p-2 bg-orange-50 rounded-lg"><TrendingUp size={17} className="text-orange-600" /></div>
                  <div>
                    <p className="text-xs text-slate-500">% To Be Delivered</p>
                    <p className="text-xl font-bold text-orange-600">{overallToDeliver.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg"><Briefcase size={17} className="text-blue-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Total Client Hrs</p>
                <p className="text-xl font-bold text-slate-800">{fmtHrs(overall.clientHrs)}</p>
              </div>
            </div>
            <div className="card flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-lg"><Clock size={17} className="text-indigo-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Total Spent Time</p>
                <p className="text-xl font-bold text-slate-800">{minHrs(overall.spent)}</p>
              </div>
            </div>
            <div className="card flex items-center gap-3">
              <div className="p-2 bg-violet-50 rounded-lg"><Target size={17} className="text-violet-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Total Req Eff Time</p>
                <p className="text-xl font-bold text-slate-800">{minHrs(overall.reqEff)}</p>
              </div>
            </div>
            <div className="card flex items-center gap-3">
              <div className="p-2 bg-cyan-50 rounded-lg"><TrendingUp size={17} className="text-cyan-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Total Act Eff Time</p>
                <p className="text-xl font-bold text-slate-800">{minHrs(overall.actEff)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shared filters */}
      <div className="card mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Team Lead</label>
          <select className="input w-44 text-xs" value={selLead} onChange={(e) => setSelLead(e.target.value)}>
            <option value="All">All Team Leads</option>
            {leadOptions.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Project Status</label>
          <select className="input w-40 text-xs" value={selStatus} onChange={(e) => setSelStatus(e.target.value)}>
            <option value="All">All Statuses</option>
            {statusOptions.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Employee</label>
          <select className="input w-44 text-xs" value={selEmp} onChange={(e) => setSelEmp(e.target.value)}>
            <option value="All">All Employees</option>
            {empOptions.map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Target Period</label>
          <div className="flex items-center gap-1">
            <select className="input w-24 text-xs" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="input w-20 text-xs" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>
        {(selLead !== 'All' || selStatus !== 'All' || selEmp !== 'All') && (
          <button className="btn-secondary text-xs self-end" onClick={() => { setSelLead('All'); setSelStatus('All'); setSelEmp('All'); }}>Clear</button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl mb-5 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════ TAB: TEAM LEAD ════════════════════════════ */}
      {tab === 'lead' && (
        <div className="space-y-4">
          {filteredLeads.length === 0 ? (
            <div className="card text-center text-slate-400 py-12">No data for selected filters</div>
          ) : filteredLeads.map((lead) => (
            <div key={lead.leadName} className="card">
              {/* Lead header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Award size={17} className="text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{lead.leadName}</p>
                    <p className="text-xs text-slate-400">{lead.employees.length} employees · {lead.projects.length} projects</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <StatPill label="Client Hrs" value={fmtHrs(lead.totals.clientHrs)} cls="bg-blue-50 text-blue-700" />
                  <StatPill label="Spent" value={minHrs(lead.totals.spent)} cls="bg-indigo-50 text-indigo-700" />
                  <StatPill label="Req Eff" value={minHrs(lead.totals.reqEff)} cls="bg-violet-50 text-violet-700" />
                  <StatPill label="Act Eff" value={minHrs(lead.totals.actEff)} cls="bg-cyan-50 text-cyan-700" />
                  {tlTotalTargets[lead.leadName] > 0 && (() => {
                    const tgt = tlTotalTargets[lead.leadName];
                    const ach = lead.totals.clientHrs;
                    const pct = tgt > 0 ? (ach / tgt) * 100 : 0;
                    const toDel = tgt > 0 ? Math.max(0, ((tgt - ach) / tgt) * 100) : 0;
                    return (<>
                      <StatPill label="Target Hrs" value={hrs(tgt)} cls="bg-amber-50 text-amber-700" />
                      <StatPill label="% Achieved" value={`${pct.toFixed(1)}%`} cls={pct >= 100 ? 'bg-emerald-50 text-emerald-700' : pct >= 85 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'} />
                      <StatPill label="% To Deliver" value={`${toDel.toFixed(1)}%`} cls={toDel <= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'} />
                    </>);
                  })()}
                </div>
              </div>

              {/* Projects table */}
              <div className="mb-3">
                <SectionHeader expand={expLeads[lead.leadName]} onToggle={() => tog(setExpLeads, lead.leadName)}>
                  Projects
                </SectionHeader>
                {expLeads[lead.leadName] && (
                  <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="th">Project</th>
                          <th className="th">Status</th>
                          <th className="th text-center">Emps</th>
                          <th className="th text-right">Client Hrs</th>
                          <th className="th text-right">Spent</th>
                          <th className="th text-right">Req Eff Time</th>
                          <th className="th text-right">Act Eff Time</th>
                          <th className="th text-center">Proj Eff</th>
                          <th className="th text-center">Actual Eff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lead.projects.filter((p) => selStatus === 'All' || p.status === selStatus).map((p) => (
                          <tr key={p.projId} className="tr">
                            <td className="td font-medium">
                              <p>{p.projName}</p>
                              <p className="text-slate-400 font-normal">{p.projId}</p>
                            </td>
                            <td className="td"><StatusBadge status={p.status} /></td>
                            <td className="td text-center text-slate-500">{p.empCount}</td>
                            <td className="td text-right text-blue-600">{hrs(p.clientHrs)}</td>
                            <td className="td text-right font-semibold text-indigo-600">{minHrs(p.spent)}</td>
                            <td className="td text-right text-violet-600">{minHrs(p.reqEff)}</td>
                            <td className="td text-right text-cyan-600">{minHrs(p.actEff)}</td>
                            <td className="td text-center"><EffBadge val={p.projEff} /></td>
                            <td className="td text-center"><EffBadge val={p.actualEff} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Employees table */}
              <div>
                <SectionHeader expand={expLeads[`${lead.leadName}_emp`]} onToggle={() => tog(setExpLeads, `${lead.leadName}_emp`)}>
                  Employees
                </SectionHeader>
                {expLeads[`${lead.leadName}_emp`] && (
                  <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="th">Employee</th>
                          <th className="th">Dept</th>
                          <th className="th text-right">Spent Hrs</th>
                          <th className="th text-right">Req Eff Hrs</th>
                          <th className="th text-right">Act Eff Hrs</th>
                          <th className="th text-center">Avg Eff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lead.employees.map((e) => (
                          <tr key={e.empId} className="tr">
                            <td className="td font-medium">
                              <p>{e.empName}</p>
                              <p className="text-slate-400 font-normal">{e.empId}</p>
                            </td>
                            <td className="td text-slate-500">{e.dept || '—'}</td>
                            <td className="td text-right font-semibold text-indigo-600">{minHrs(e.spent)}</td>
                            <td className="td text-right text-violet-600">{minHrs(e.reqEff)}</td>
                            <td className="td text-right text-cyan-600">{minHrs(e.actEff)}</td>
                            <td className="td text-center"><EffBadge val={e.avgEff} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════ TAB: PROJECT REPORT ════════════════════════ */}
      {tab === 'project' && (
        <div className="space-y-4">
          {filteredProjects.length === 0 ? (
            <div className="card text-center text-slate-400 py-12">No projects match the selected filters</div>
          ) : filteredProjects.map((proj) => (
            <div key={proj.projId} className="card">
              {/* Project header */}
              <div className="flex items-start justify-between mb-3 gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-800">{proj.projName}</p>
                    <StatusBadge status={proj.status} />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{proj.projId} · {proj.client || 'No client'}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end shrink-0">
                  <StatPill label="Client Hrs" value={fmtHrs(proj.clientHrs)} cls="bg-blue-50 text-blue-700" />
                  <StatPill label="Spent" value={minHrs(proj.totalSpent)} cls="bg-indigo-50 text-indigo-700" />
                  <StatPill label="Req Eff" value={minHrs(proj.totalReqEff)} cls="bg-violet-50 text-violet-700" />
                  <StatPill label="Act Eff" value={minHrs(proj.totalActEff)} cls="bg-cyan-50 text-cyan-700" />
                </div>
              </div>

              {/* Efficiency summary row */}
              <div className="flex flex-wrap gap-3 mb-3 p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Project Efficiency</span>
                  <EffBadge val={proj.projEff} />
                  <span className="text-xs text-slate-400">(Client / Req Eff)</span>
                </div>
                <div className="w-px bg-slate-200" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Actual Efficiency</span>
                  <EffBadge val={proj.actualEff} />
                  <span className="text-xs text-slate-400">(Client / Spent)</span>
                </div>
                {proj.clientHrs > 0 && (
                  <>
                    <div className="w-px bg-slate-200" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Client hrs / person</span>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        {fmtHrs(proj.clientHrsPerEmp)} × {proj.empCount} people
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Employee breakdown */}
              <SectionHeader
                count={proj.empCount}
                expand={expProjs[proj.projId]}
                onToggle={() => tog(setExpProjs, proj.projId)}
              >
                Employee Breakdown
              </SectionHeader>
              {expProjs[proj.projId] && (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="th">Employee</th>
                        <th className="th">Dept</th>
                        <th className="th">Team Lead</th>
                        <th className="th text-right">Client Hrs Share</th>
                        <th className="th text-right">Spent Hrs</th>
                        <th className="th text-right">Req Eff Hrs</th>
                        <th className="th text-right">Act Eff Hrs</th>
                        <th className="th text-center">Per Person Eff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proj.employees.map((e) => (
                        <tr key={e.empId} className="tr">
                          <td className="td font-medium">
                            <p>{e.empName}</p>
                            <p className="text-slate-400 font-normal">{e.empId}</p>
                          </td>
                          <td className="td text-slate-500">{e.dept || '—'}</td>
                          <td className="td text-slate-500">{e.leadName || '—'}</td>
                          <td className="td text-right text-blue-600 font-semibold">
                            {proj.clientHrs > 0 ? fmtHrs(e.clientHrsShare) : '—'}
                          </td>
                          <td className="td text-right font-semibold text-indigo-600">{minHrs(e.spent)}</td>
                          <td className="td text-right text-violet-600">{minHrs(e.reqEff)}</td>
                          <td className="td text-right text-cyan-600">{minHrs(e.actEff)}</td>
                          <td className="td text-center"><EffBadge val={e.empEff} /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td className="td font-semibold" colSpan={3}>Total</td>
                        <td className="td text-right font-semibold text-blue-600">{fmtHrs(proj.clientHrs)}</td>
                        <td className="td text-right font-semibold text-indigo-600">{minHrs(proj.totalSpent)}</td>
                        <td className="td text-right font-semibold text-violet-600">{minHrs(proj.totalReqEff)}</td>
                        <td className="td text-right font-semibold text-cyan-600">{minHrs(proj.totalActEff)}</td>
                        <td className="td text-center"><EffBadge val={proj.projEff} /></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════ TAB: EMPLOYEE VIEW ═════════════════════════ */}
      {tab === 'employee' && (
        <div className="space-y-3">
          {filteredEmployees.length === 0 ? (
            <div className="card text-center text-slate-400 py-12">No employees match selected filters</div>
          ) : filteredEmployees.map((emp) => (
            <div key={emp.empId} className="card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                    {emp.empName[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{emp.empName}</p>
                    <p className="text-xs text-slate-400">{emp.empId} · {emp.dept || '—'} · Lead: {emp.leadName || '—'}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <StatPill label="Spent" value={minHrs(emp.totals.spent)} cls="bg-indigo-50 text-indigo-700" />
                  <StatPill label="Req Eff" value={minHrs(emp.totals.reqEff)} cls="bg-violet-50 text-violet-700" />
                  <StatPill label="Act Eff" value={minHrs(emp.totals.actEff)} cls="bg-cyan-50 text-cyan-700" />
                  <StatPill label="Avg Eff" value={pct(emp.totals.avgEff)} cls={`${TIER_CLS(emp.totals.avgEff)} font-semibold`} />
                </div>
              </div>

              <SectionHeader
                count={emp.projects.length}
                expand={expEmps[emp.empId]}
                onToggle={() => tog(setExpEmps, emp.empId)}
              >
                Projects
              </SectionHeader>

              {expEmps[emp.empId] && (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="th">Project</th>
                        <th className="th">Status</th>
                        <th className="th text-right">Client Hrs</th>
                        <th className="th text-right">Spent Hrs</th>
                        <th className="th text-right">Req Eff Hrs</th>
                        <th className="th text-right">Act Eff Hrs</th>
                        <th className="th text-center">Eff %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emp.projects.filter((p) => selStatus === 'All' || p.status === selStatus).map((p) => (
                        <tr key={p.projId} className="tr">
                          <td className="td font-medium">
                            <p>{p.projName}</p>
                            <p className="text-slate-400 font-normal">{p.projId}</p>
                          </td>
                          <td className="td"><StatusBadge status={p.status} /></td>
                          <td className="td text-right text-blue-600">{hrs(p.clientHrs)}</td>
                          <td className="td text-right font-semibold text-indigo-600">{minHrs(p.spent)}</td>
                          <td className="td text-right text-violet-600">{minHrs(p.reqEff)}</td>
                          <td className="td text-right text-cyan-600">{minHrs(p.actEff)}</td>
                          <td className="td text-center"><EffBadge val={p.empEff} /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td className="td font-semibold" colSpan={2}>Total</td>
                        <td className="td text-right text-blue-600">—</td>
                        <td className="td text-right font-semibold text-indigo-600">{minHrs(emp.totals.spent)}</td>
                        <td className="td text-right font-semibold text-violet-600">{minHrs(emp.totals.reqEff)}</td>
                        <td className="td text-right font-semibold text-cyan-600">{minHrs(emp.totals.actEff)}</td>
                        <td className="td text-center"><EffBadge val={emp.totals.avgEff} /></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════ TAB: CHARTS ═══════════════════════════════ */}
      {tab === 'charts' && (
        <div className="space-y-6">

          {/* ── Client Hrs Distribution per project ── */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-slate-700">Client Hours Distribution per Employee</p>
                <p className="text-xs text-slate-400">Select a project to see how client hours are split across the team</p>
              </div>
              <select
                className="input w-64 text-xs"
                value={selProj}
                onChange={(e) => setSelProj(e.target.value)}
              >
                <option value="">— Select a project —</option>
                {filteredProjects.filter((p) => p.clientHrs > 0 && p.empCount > 0).map((p) => (
                  <option key={p.projId} value={p.projId}>{p.projName}</option>
                ))}
              </select>
            </div>

            {(() => {
              const proj = selProj ? filteredProjects.find((p) => p.projId === selProj) : null;
              if (!proj) return <p className="text-slate-400 text-sm text-center py-12">Select a project above</p>;
              const pieData = proj.employees.map((e, i) => ({
                name: e.empName, value: proj.clientHrsPerEmp,
                dept: e.dept, lead: e.leadName,
              }));
              const barData = proj.employees.map((e) => ({
                name: e.empName,
                fullName: e.empName,
                clientShare: proj.clientHrsPerEmp,
                spent: +(e.spent / 60).toFixed(2),
                reqEff: +(e.reqEff / 60).toFixed(2),
                actEff: +(e.actEff / 60).toFixed(2),
              }));
              return (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Pie */}
                  <div>
                    <p className="text-xs text-slate-500 mb-2 font-medium">
                      {proj.projName} · {proj.clientHrs}h client · {proj.empCount} people · {fmtHrs(proj.clientHrsPerEmp)}/person
                    </p>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" outerRadius={95} innerRadius={45} paddingAngle={2} dataKey="value"
                          label={({ name, value }) => `${name}: ${toHhmm(value * 60)}`} labelLine={false}>
                          {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => [toHhmm(v * 60), 'Client Hrs Share']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Bar: 4 metrics per employee */}
                  <div>
                    <p className="text-xs text-slate-500 mb-2 font-medium">Hours breakdown per employee</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={barData} barSize={10} margin={{ left: 0, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} unit=" h" />
                        <Tooltip
                          formatter={(val, name) => [toHhmm(val * 60), name]}
                          labelFormatter={(_, p) => p?.[0]?.payload?.fullName || _}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="clientShare" name="Client Hrs Share" fill="#3b82f6" radius={[3,3,0,0]} />
                        <Bar dataKey="spent"       name="Spent Hrs"        fill="#6366f1" radius={[3,3,0,0]} />
                        <Bar dataKey="reqEff"      name="Req Eff Hrs"      fill="#8b5cf6" radius={[3,3,0,0]} />
                        <Bar dataKey="actEff"      name="Act Eff Hrs"      fill="#06b6d4" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Team Lead summary pie ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="card">
              <p className="text-sm font-semibold text-slate-700 mb-1">Spent Hours by Team Lead</p>
              <p className="text-xs text-slate-400 mb-3">Total hours worked under each team lead</p>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={filteredLeads.map((l) => ({ name: l.leadName, value: +(l.totals.spent / 60).toFixed(2) }))}
                    cx="50%" cy="50%" outerRadius={90} innerRadius={40} paddingAngle={2} dataKey="value"
                    label={({ name, value }) => `${name}: ${toHhmm(value * 60)}`} labelLine={false}
                  >
                    {filteredLeads.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [toHhmm(v * 60), 'Spent']} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <p className="text-sm font-semibold text-slate-700 mb-1">Four Metrics by Team Lead</p>
              <p className="text-xs text-slate-400 mb-3">Client Hrs · Spent · Req Eff · Act Eff</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={filteredLeads.map((l) => ({
                    name: l.leadName,
                    fullName: l.leadName,
                    clientHrs: l.totals.clientHrs,
                    spent:     +(l.totals.spent / 60).toFixed(2),
                    reqEff:    +(l.totals.reqEff / 60).toFixed(2),
                    actEff:    +(l.totals.actEff / 60).toFixed(2),
                  }))}
                  barSize={9} margin={{ left: 0, right: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} unit=" h" />
                  <Tooltip
                    formatter={(val, name) => [toHhmm(val * 60), name]}
                    labelFormatter={(_, p) => p?.[0]?.payload?.fullName || _}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="clientHrs" name="Client Hrs"   fill="#3b82f6" radius={[3,3,0,0]} />
                  <Bar dataKey="spent"     name="Spent Hrs"    fill="#6366f1" radius={[3,3,0,0]} />
                  <Bar dataKey="reqEff"    name="Req Eff Time" fill="#8b5cf6" radius={[3,3,0,0]} />
                  <Bar dataKey="actEff"    name="Act Eff Time" fill="#06b6d4" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Employee wise pie ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="card">
              <p className="text-sm font-semibold text-slate-700 mb-1">Spent Hours by Employee (top 12)</p>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={filteredEmployees.slice(0, 12).map((e) => ({ name: e.empName, value: +(e.totals.spent / 60).toFixed(2) }))}
                    cx="50%" cy="50%" outerRadius={95} innerRadius={40} paddingAngle={2} dataKey="value"
                    label={({ name, value }) => `${name}: ${toHhmm(value * 60)}`} labelLine={false}
                  >
                    {filteredEmployees.slice(0, 12).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [toHhmm(v * 60), 'Spent']} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <p className="text-sm font-semibold text-slate-700 mb-1">Four Metrics by Employee (top 10)</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={filteredEmployees.slice(0, 10).map((e) => ({
                    name: e.empName,
                    fullName: e.empName,
                    spent:  +(e.totals.spent / 60).toFixed(2),
                    reqEff: +(e.totals.reqEff / 60).toFixed(2),
                    actEff: +(e.totals.actEff / 60).toFixed(2),
                  }))}
                  barSize={8} margin={{ left: 0, right: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} unit=" h" />
                  <Tooltip
                    formatter={(val, name) => [toHhmm(val * 60), name]}
                    labelFormatter={(_, p) => p?.[0]?.payload?.fullName || _}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="spent"  name="Spent Hrs"    fill="#6366f1" radius={[3,3,0,0]} />
                  <Bar dataKey="reqEff" name="Req Eff Hrs"  fill="#8b5cf6" radius={[3,3,0,0]} />
                  <Bar dataKey="actEff" name="Act Eff Hrs"  fill="#06b6d4" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Division Target Composition ── */}
          {dt > 0 && (
          <div className="space-y-4">
            <div className="card">
              <p className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2"><Target size={15} /> Division Target Composition ({MONTHS[month]} {year})</p>
              <p className="text-xs text-slate-400 mb-3">Target: {hrs(dt)} · Client Hrs: {hrs(overall.clientHrs)} · {((overall.clientHrs / dt) * 100).toFixed(1)}% achieved</p>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-slate-500 mb-2 font-medium">Target Distribution by Team</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={Object.entries(tlTotalTargets).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))}
                        cx="50%" cy="50%" outerRadius={95} innerRadius={45} paddingAngle={2} dataKey="value"
                        label={({ name, value }) => `${name}: ${toHhmm(value * 60)}`} labelLine={false}>
                        {Object.keys(tlTotalTargets).filter((k) => tlTotalTargets[k] > 0).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [toHhmm(v * 60), 'Target']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-2 font-medium">Target vs Client Hrs by Team</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={filteredLeads.map((l) => ({
                      name: l.leadName,
                      target: tlTotalTargets[l.leadName] || 0,
                      clientHrs: l.totals.clientHrs,
                    }))} barSize={12} margin={{ left: 0, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 10 }} unit=" h" />
                      <Tooltip formatter={(val) => [toHhmm(val * 60), '']} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="target" name="Target Hrs" fill="#f59e0b" radius={[3,3,0,0]} />
                      <Bar dataKey="clientHrs" name="Client Hrs" fill="#10b981" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Team-wise % Reached horizontal bar */}
            <div className="card">
              <p className="text-sm font-semibold text-slate-700 mb-3">% Target Reached by Team</p>
              {filteredLeads.filter((l) => tlTotalTargets[l.leadName] > 0).length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, filteredLeads.filter((l) => tlTotalTargets[l.leadName] > 0).length * 40)}>
                  <BarChart data={filteredLeads.filter((l) => tlTotalTargets[l.leadName] > 0).map((l) => {
                    const tgt = tlTotalTargets[l.leadName];
                    const ach = l.totals.clientHrs;
                    return { name: l.leadName, reached: tgt > 0 ? (ach / tgt) * 100 : 0 };
                  })} layout="vertical" margin={{ top: 10, right: 40, left: 80, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip formatter={(v) => [`${v.toFixed(1)}%`, '% Reached']} />
                    <Bar dataKey="reached" name="% Reached" radius={[0, 4, 4, 0]}>
                      {filteredLeads.filter((l) => tlTotalTargets[l.leadName] > 0).map((l, i) => {
                        const tgt = tlTotalTargets[l.leadName];
                        const ach = l.totals.clientHrs;
                        const pct = tgt > 0 ? (ach / tgt) * 100 : 0;
                        return <Cell key={i} fill={pct >= 100 ? '#10b981' : pct >= 85 ? '#f59e0b' : '#ef4444'} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-slate-400 text-sm py-8 text-center">Set division targets to see reach percentages</p>}
            </div>
          </div>
          )}

        </div>
      )}
    </div>
  );
}
