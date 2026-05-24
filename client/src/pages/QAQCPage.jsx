import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  RefreshCw, ShieldCheck, Clock, Users, Briefcase, TrendingUp, Filter, X, BarChart2,
  Pencil, Search, Save, ChevronDown, Check,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList, Cell, PieChart, Pie,
} from 'recharts';
import { api } from '../lib/api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';

const DEFAULT_STATUSES = ['Not Started', 'In Progress', 'Completed', 'On Hold', 'Cancelled'];

function EffBadge({ value }) {
  if (!isFinite(value) || isNaN(value) || value <= 0) return <span className="text-slate-300">—</span>;
  const p = value * 100;
  const cls = p >= 100 ? 'text-emerald-600 bg-emerald-50' : p >= 85 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{p.toFixed(1)}%</span>;
}

function toHhmm(val) {
  const total = Math.round(parseFloat(val) || 0);
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
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

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#14b8a6'];

function StatCardSkeleton() {
  return (
    <div className="card flex items-center gap-2 sm:gap-3">
      <div className="p-1.5 sm:p-2 rounded-lg skeleton-icon-box" />
      <div className="flex-1 space-y-1.5 sm:space-y-2">
        <div className="skeleton h-2 w-12 sm:h-3 sm:w-16" />
        <div className="skeleton h-4 w-10 sm:h-5 sm:w-12" />
      </div>
    </div>
  );
}

export default function QAQCPage({ toast }) {
  const [rows, setRows] = useState([]);
  const [rowIndices, setRowIndices] = useState([]);
  const [tmMap, setTmMap] = useState({});
  const [logEntries, setLogEntries] = useState({});
  const [settings, setSettings] = useState({ projStatuses: [] });
  const [viewMode, setViewMode] = useState('project');
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterLead, setFilterLead] = useState('All');
  const [selectedProjectIds, setSelectedProjectIds] = useState(new Set());
  const [projectFilterQuery, setProjectFilterQuery] = useState('');
  const [projectFilterOpen, setProjectFilterOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [chartType, setChartType] = useState('bar');
  const [editingProject, setEditingProject] = useState(null);
  const [editStatus, setEditStatus] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const STATUSES = settings.projStatuses?.length ? settings.projStatuses : DEFAULT_STATUSES;

  const load = async () => {
    setLoading(true);
    try {
      const [res, sett] = await Promise.all([
        api.qaqcProjects(),
        api.settings().catch(() => ({ projStatuses: [] })),
      ]);
      setRows(res.data || []);
      setRowIndices(res.rowIndices || []);
      setTmMap(res.teamMembersMap || {});
      setLogEntries(res.logEntries || {});
      setSettings(sett || { projStatuses: [] });
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const rowIndexByProjId = useMemo(() => {
    const m = {};
    rows.forEach((r, i) => { if (r[0]) m[r[0]] = rowIndices[i] || (i + 2); });
    return m;
  }, [rows, rowIndices]);

  const openEditStatus = useCallback((p) => {
    setEditingProject(p);
    setEditStatus(p.status || '');
  }, []);

  const closeEditStatus = useCallback(() => {
    setEditingProject(null);
    setEditStatus('');
    setEditSaving(false);
  }, []);

  const saveStatus = useCallback(async () => {
    if (!editingProject || !editStatus) return;
    const sheetRow = rowIndexByProjId[editingProject.projId];
    if (!sheetRow) { toast.error('Could not find project row'); return; }
    setEditSaving(true);
    try {
      const fullRow = rows.find((r) => r[0] === editingProject.projId) || [];
      const updateRow = [
        ...fullRow.slice(0, 3),
        editStatus,
        ...fullRow.slice(4, 21),
      ];
      await api.updateProject(sheetRow, updateRow);
      toast.success('Status updated');
      closeEditStatus();
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setEditSaving(false);
    }
  }, [editingProject, editStatus, rowIndexByProjId, rows, closeEditStatus, toast]);

  const statuses = useMemo(() => ['All', ...[...new Set(rows.map((r) => r[3]).filter(Boolean))].sort()], [rows]);

  const leadOptions = useMemo(() => {
    const leads = new Set();
    rows.forEach((r) => {
      if (r[21]) leads.add(r[21]);
      if (r[4]) leads.add(r[4]);
    });
    return ['All', ...[...leads].sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterStatus !== 'All' && r[3] !== filterStatus) return false;
      const lead = r[21] || r[4];
      if (filterLead !== 'All' && lead !== filterLead) return false;
      if (selectedProjectIds.size > 0 && !selectedProjectIds.has(r[0])) return false;
      return true;
    });
  }, [rows, filterStatus, filterLead, selectedProjectIds]);

  // ── All log entries flattened for aggregation ──
  const allLogEntries = useMemo(() => {
    const entries = [];
    filtered.forEach((r) => {
      const derivedId = `${r[0]}-QC`;
      const le = logEntries[derivedId] || [];
      le.forEach((e) => {
        entries.push({
          ...e,
          projName: r[1] || r[0],
          projId: r[0],
          status: r[3],
          projectLead: r[21] || r[4] || '',
          clientHrs: parseFloat(r[7]) || 0,
        });
      });
    });
    return entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [filtered, logEntries]);

  // ── Stats ──
  const stats = useMemo(() => {
    const totalQCHrs = filtered.reduce((s, r) => s + (parseFloat(r[7]) || 0) * 0.15, 0);
    const totalSpent = allLogEntries.reduce((s, e) => s + (e.hrsWorked || 0), 0);
    const totalReqEff = allLogEntries.reduce((s, e) => s + (e.reqEffHrs || 0), 0);
    const totalActEff = allLogEntries.reduce((s, e) => s + (e.actEffHrs || 0), 0);
    const uniqueEmps = [...new Set(allLogEntries.map((e) => e.empId).filter(Boolean))].length;
    const avgEff = totalReqEff > 0 ? totalActEff / totalReqEff : 0;

    return {
      totalProjects: filtered.length,
      totalQCHrs, totalSpent, totalReqEff, totalActEff,
      sessions: allLogEntries.length,
      uniqueEmps,
      avgEff,
    };
  }, [filtered, allLogEntries]);

  // ── Project Wise aggregation ──
  const projAnalytics = useMemo(() => {
    return filtered.map((r) => {
      const clientHrs = parseFloat(r[7]) || 0;
      const derivedId = `${r[0]}-QC`;
      const entries = logEntries[derivedId] || [];
      const team = tmMap[derivedId] || [];

      const spent = entries.reduce((s, e) => s + (e.hrsWorked || 0), 0);
      const reqEff = entries.reduce((s, e) => s + (e.reqEffHrs || 0), 0);
      const actEff = entries.reduce((s, e) => s + (e.actEffHrs || 0), 0);

      const qcHrs = clientHrs * 0.15;
      const projActualEff = spent > 0 ? (qcHrs / spent) / 10 : 0;
      const projReqEff = reqEff > 0 ? (qcHrs / reqEff) / 10 : 0;
      const empAvgEff = reqEff > 0 ? actEff / reqEff : 0;

      return {
        projId: r[0] || '',
        projName: r[1] || r[0],
        client: r[2] || '—',
        status: r[3] || '—',
        projectLead: r[21] || r[4] || '—',
        clientHrs,
        qcHrs: +qcHrs.toFixed(2),
        spent: +spent.toFixed(2),
        reqEff: +reqEff.toFixed(2),
        actEff: +actEff.toFixed(2),
        projActualEff,
        projReqEff,
        empAvgEff,
        sessions: entries.length,
        empCount: team.length,
      };
     }).sort((a, b) => b.spent - a.spent);
  }, [filtered, logEntries, tmMap]);

  // ── Employee Wise aggregation ──
  const empAnalytics = useMemo(() => {
    const map = {};
    allLogEntries.forEach((e) => {
      const key = e.empId || e.empName;
      if (!map[key]) {
        map[key] = {
          empId: e.empId || '',
          empName: e.empName || e.empId,
          sessions: 0,
          spent: 0,
          reqEff: 0,
          actEff: 0,
          projSet: new Set(),
        };
      }
      map[key].sessions++;
      map[key].spent += e.hrsWorked || 0;
      map[key].reqEff += e.reqEffHrs || 0;
      map[key].actEff += e.actEffHrs || 0;
      if (e.projId) map[key].projSet.add(e.projId);
    });

    return Object.values(map)
      .map((e) => ({
        ...e,
        spent: +e.spent.toFixed(2),
        reqEff: +e.reqEff.toFixed(2),
        actEff: +e.actEff.toFixed(2),
        projCount: e.projSet.size,
        avgEff: e.reqEff > 0 ? e.actEff / e.reqEff : 0,
      }))
      .sort((a, b) => b.spent - a.spent);
  }, [allLogEntries]);

  // ── Team Lead Wise aggregation ──
  const leadAnalytics = useMemo(() => {
    const map = {};
    allLogEntries.forEach((e) => {
      const key = e.teamLead || e.projectLead || '(Unassigned)';
      if (!map[key]) {
        map[key] = {
          leadName: key,
          sessions: 0,
          spent: 0,
          reqEff: 0,
          actEff: 0,
          empSet: new Set(),
          projSet: new Set(),
          totalQcHrs: 0,
        };
      }
      map[key].sessions++;
      map[key].spent += e.hrsWorked || 0;
      map[key].reqEff += e.reqEffHrs || 0;
      map[key].actEff += e.actEffHrs || 0;
      map[key].totalQcHrs += e.clientHrs ? e.clientHrs * 0.15 : 0;
      if (e.empId) map[key].empSet.add(e.empId);
      if (e.projId) map[key].projSet.add(e.projId);
    });

    return Object.values(map)
      .map((l) => ({
        ...l,
        totalQcHrs: +l.totalQcHrs.toFixed(2),
        spent: +l.spent.toFixed(2),
        reqEff: +l.reqEff.toFixed(2),
        actEff: +l.actEff.toFixed(2),
        empCount: l.empSet.size,
        projCount: l.projSet.size,
        avgEff: l.reqEff > 0 ? l.actEff / l.reqEff : 0,
      }))
      .sort((a, b) => b.spent - a.spent);
  }, [allLogEntries]);

  // ── Chart data ──
  const empChartData = useMemo(() =>
    empAnalytics.slice(0, 10).map((e) => ({
      name: e.empName.length > 15 ? e.empName.slice(0, 15) + '…' : e.empName,
      fullName: e.empName,
      spent: e.spent,
      req: e.reqEff,
      act: e.actEff,
      avgEff: +(e.avgEff * 100).toFixed(1),
    }))
  , [empAnalytics]);

  const projChartData = useMemo(() =>
    projAnalytics.slice(0, 10).map((p) => ({
      name: p.projName.length > 18 ? p.projName.slice(0, 18) + '…' : p.projName,
      fullName: p.projName,
      spent: p.spent,
      req: p.reqEff,
      act: p.actEff,
      clientHrs: p.qcHrs,
      projActualEff: +(p.projActualEff * 100).toFixed(1),
      projReqEff: +(p.projReqEff * 100).toFixed(1),
      avgEff: +(p.empAvgEff * 100).toFixed(1),
    }))
  , [projAnalytics]);

  const leadChartData = useMemo(() =>
    leadAnalytics.slice(0, 10).map((l) => ({
      name: l.leadName.length > 15 ? l.leadName.slice(0, 15) + '…' : l.leadName,
      fullName: l.leadName,
      spent: l.spent,
      req: l.reqEff,
      act: l.actEff,
      avgEff: +(l.avgEff * 100).toFixed(1),
    }))
  , [leadAnalytics]);

  const hasData = allLogEntries.length > 0;

  return (
    <div className="page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="page-title flex items-center gap-2 text-lg sm:text-2xl">
            <ShieldCheck size={18} className="sm:size-[20px] text-amber-500 shrink-0" />
            QA/QC Analytics
          </h1>
          <p className="page-sub text-xs sm:text-sm">{filtered.length} project{filtered.length !== 1 ? 's' : ''} with QA/QC flag · {stats.sessions} session{stats.sessions !== 1 ? 's' : ''} logged</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 self-start sm:self-auto flex-wrap">
          <button onClick={() => setShowFilters(!showFilters)} className={`btn-secondary gap-1 px-2 sm:px-3 text-[11px] sm:text-xs ${showFilters ? 'border-amber-400 bg-amber-50' : ''}`}>
            <Filter size={12} className="sm:size-[13px]" />
            <span className="hidden sm:inline">Filters</span>
            <span className="sm:hidden">Filter</span>
          </button>
          <button onClick={load} className="btn-secondary px-2 sm:px-3"><RefreshCw size={13} className="sm:size-[14px]" /></button>
          <button onClick={() => { api.syncQaqc().then(() => toast.success('QAQC_PROJECTS sheet synced')).catch((e) => toast.error(e.message)).then(load); }} className="btn-secondary gap-1 px-2 sm:px-3 text-[11px] sm:text-xs">
            <RefreshCw size={12} className="sm:size-[13px]" /> <span className="hidden sm:inline">Sync to Sheets</span>
          </button>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 bg-amber-50/50 p-0.5 rounded-xl mb-5 flex-wrap w-full sm:w-fit">
        <button
          onClick={() => setViewMode('project')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${viewMode === 'project' ? 'bg-white shadow text-amber-700' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Briefcase size={13} className="sm:size-[14px]" /> Project
        </button>
        <button
          onClick={() => setViewMode('employee')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${viewMode === 'employee' ? 'bg-white shadow text-amber-700' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Users size={13} className="sm:size-[14px]" /> Employee
        </button>
        <button
          onClick={() => setViewMode('lead')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${viewMode === 'lead' ? 'bg-white shadow text-amber-700' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <BarChart2 size={13} className="sm:size-[14px]" /> Team Lead
        </button>
      </div>

        {/* Filters */}
       {showFilters && (
         <div className="card mb-5 flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 sm:items-end">
           <div className="w-full sm:w-auto sm:min-w-[200px] sm:flex-1">
             <label className="label text-xs">Project</label>
             <div className="relative">
               <button
                 onClick={() => setProjectFilterOpen(!projectFilterOpen)}
                 className="input w-full text-xs text-left flex items-center justify-between gap-2"
               >
                 <span className="text-slate-600 truncate">
                   {selectedProjectIds.size > 0
                     ? `${selectedProjectIds.size} project${selectedProjectIds.size !== 1 ? 's' : ''} selected`
                     : 'All projects'}
                 </span>
               </button>
               {projectFilterOpen && (
                 <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-64 overflow-y-auto">
                   <div className="sticky top-0 bg-white border-b border-slate-100 p-2">
                     <div className="relative">
                       <input
                         className="input pl-8 text-xs w-full"
                         placeholder="Search projects…"
                         value={projectFilterQuery}
                         onChange={(e) => setProjectFilterQuery(e.target.value)}
                         autoFocus
                       />
                     </div>
                   </div>
                   <div className="p-1">
                     <button
                       onClick={() => { setSelectedProjectIds(new Set()); }}
                       className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2 text-slate-500"
                     >
                       <span className="text-xs text-slate-400">✕</span> Clear selection
                     </button>
                     {rows
                       .filter((r) => {
                         if (!projectFilterQuery.trim()) return true;
                         const q = projectFilterQuery.trim().toLowerCase();
                         const projId = (r[0] || '').toLowerCase();
                         const projName = (r[1] || '').toLowerCase();
                         return projId.includes(q) || projName.includes(q);
                       })
                       .map((r) => (
                         <button
                           key={r[0]}
                           onClick={() => {
                             const newSet = new Set(selectedProjectIds);
                             if (newSet.has(r[0])) newSet.delete(r[0]);
                             else newSet.add(r[0]);
                             setSelectedProjectIds(newSet);
                           }}
                           className="w-full text-left px-2 py-1.5 text-xs hover:bg-indigo-50 flex items-center gap-2"
                         >
                           <span className={`w-3.5 h-3.5 border border-slate-300 rounded flex items-center justify-center text-[10px] ${selectedProjectIds.has(r[0]) ? 'bg-indigo-500 border-indigo-500 text-white' : ''}`}>
                             {selectedProjectIds.has(r[0]) && '✓'}
                           </span>
                           <span className="truncate">
                             <span className="font-mono text-slate-400">{r[0]}</span> {r[1] || r[0]}
                           </span>
                         </button>
                       ))}
                   </div>
                 </div>
               )}
             </div>
           </div>
           <div className="w-full sm:w-auto">
             <label className="label text-xs">Status</label>
             <select className="input w-full sm:w-40 text-xs" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
               {statuses.map((s) => <option key={s}>{s}</option>)}
             </select>
           </div>
           <div className="w-full sm:w-auto">
             <label className="label text-xs">Assigned Lead</label>
             <select className="input w-full sm:w-44 text-xs" value={filterLead} onChange={(e) => setFilterLead(e.target.value)}>
               {leadOptions.map((o) => <option key={o}>{o}</option>)}
             </select>
           </div>
           {(filterStatus !== 'All' || filterLead !== 'All' || selectedProjectIds.size > 0) && (
             <button className="btn-secondary text-xs self-start sm:self-end shrink-0" onClick={() => { setFilterStatus('All'); setFilterLead('All'); setSelectedProjectIds(new Set()); setProjectFilterQuery(''); }}>
               <X size={12} /> Clear
             </button>
           )}
           <div className="text-xs text-slate-500 self-start sm:self-end pb-2 sm:ml-auto">
             {filtered.length} project{filtered.length !== 1 ? 's' : ''}
           </div>
         </div>
       )}

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4 mb-6">
          {Array.from({ length: 7 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4 mb-6">
          <StatCard icon={Briefcase} bg="bg-amber-50" color="text-amber-600" label="Projects" value={stats.totalProjects} sub="with QA/QC flag" />
          <StatCard icon={Clock} bg="bg-indigo-50" color="text-indigo-600" label="QC Allocated" value={hasData ? toHhmm(stats.totalQCHrs * 60) : '—'} sub="Client Hrs × 15%" />
          <StatCard icon={Clock} bg="bg-blue-50" color="text-blue-600" label="Spent Hrs" value={hasData ? toHhmm(stats.totalSpent) : '—'} sub="actual logged" />
          <StatCard icon={TrendingUp} bg="bg-violet-50" color="text-violet-600" label="Req Eff Hrs" value={hasData ? toHhmm(stats.totalReqEff) : '—'} />
          <StatCard icon={BarChart2} bg="bg-emerald-50" color="text-emerald-600" label="Act Eff Hrs" value={hasData ? toHhmm(stats.totalActEff) : '—'} />
          <StatCard icon={Users} bg="bg-emerald-50" color="text-emerald-600" label="Employees" value={stats.uniqueEmps} sub={`${stats.sessions} sessions`} />
          <StatCard icon={TrendingUp} bg="bg-rose-50" color="text-rose-600" label="Avg Efficiency" value={hasData ? EffBadge({ value: stats.avgEff }) : '—'} />
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="skeleton h-32 rounded-xl" />
          <div className="skeleton h-64 rounded-xl" />
          <div className="skeleton h-48 rounded-xl" />
        </div>
      ) : !hasData ? (
        <div className="card text-center py-16 text-slate-400">
          <ShieldCheck size={48} className="mx-auto mb-3 text-slate-200" />
          <p className="font-medium">No QA/QC session data yet</p>
          <p className="text-sm mt-1">Log hours against projects with "Send to QA/QC Team" enabled.</p>
        </div>
      ) : viewMode === 'project' ? (
        <>
          {/* Project Wise Table */}
          <div className="card overflow-x-auto mb-6 p-0">
            <table className="min-w-[750px] md:min-w-full text-xs">
               <thead className="bg-slate-50 border-b border-slate-200">
                 <tr>
                   <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-slate-500">Project</th>
                   <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-slate-500">Client</th>
                   <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-slate-500">Status</th>
                   <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-slate-500 hidden md:table-cell">Lead</th>
                   <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500">Emps</th>
                   <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500">Sess</th>
                   <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs font-semibold text-slate-500">QC Hrs</th>
                   <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs font-semibold text-slate-500">Spent</th>
                   <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs font-semibold text-slate-500 hidden md:table-cell">Req Eff</th>
                   <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs font-semibold text-slate-500 hidden md:table-cell">Act Eff</th>
                   <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500 hidden lg:table-cell">QC Actual Eff</th>
                   <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500 hidden lg:table-cell">QC Req Eff</th>
                   <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500 hidden lg:table-cell">Emp Avg Eff</th>
                   <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500"></th>
                 </tr>
               </thead>
              <tbody>
                {projAnalytics.map((p, i) => (
                  <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-amber-50/30`}>
                    <td className="px-2 sm:px-3 py-2">
                      <p className="font-medium text-slate-800 truncate max-w-[120px] sm:max-w-[160px] md:max-w-[180px]" title={p.projName}>{p.projName}</p>
                      <p className="text-slate-400 font-normal text-[10px] sm:text-xs">{p.projId}</p>
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-[11px] sm:text-sm text-slate-600">{p.client}</td>
                    <td className="px-2 sm:px-3 py-2 text-[11px]"><Badge value={p.status} /></td>
                    <td className="px-2 sm:px-3 py-2 text-[11px] sm:text-sm text-slate-600 hidden md:table-cell">{p.projectLead}</td>
                    <td className="px-2 sm:px-3 py-2 text-center text-[11px] sm:text-sm text-slate-500">{p.empCount}</td>
                    <td className="px-2 sm:px-3 py-2 text-center text-[11px] sm:text-sm text-slate-500">{p.sessions}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-amber-700 font-semibold">{toHhmm(p.qcHrs * 60)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-indigo-600 font-semibold">{toHhmm(p.spent)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-violet-600 hidden md:table-cell">{toHhmm(p.reqEff)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-emerald-600 hidden md:table-cell">{toHhmm(p.actEff)}</td>
                     <td className="px-2 sm:px-3 py-2 text-center hidden lg:table-cell"><EffBadge value={p.projActualEff} /></td>
                     <td className="px-2 sm:px-3 py-2 text-center hidden lg:table-cell"><EffBadge value={p.projReqEff} /></td>
                     <td className="px-2 sm:px-3 py-2 text-center hidden lg:table-cell"><EffBadge value={p.empAvgEff} /></td>
                     <td className="px-2 sm:px-3 py-2 text-center">
                       <button onClick={() => openEditStatus(p)} className="p-1 hover:bg-slate-100 rounded transition-colors" title="Edit Status">
                         <Pencil size={11} className="sm:size-[13px] text-slate-400" />
                       </button>
                     </td>
                   </tr>
                ))}
              </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold">
                  <tr>
                    <td className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs" colSpan={5}>Total ({projAnalytics.length})</td>
                    <td className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-sm text-slate-700">{projAnalytics.reduce((s, p) => s + p.sessions, 0)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-amber-700">{toHhmm(projAnalytics.reduce((s, p) => s + p.qcHrs, 0) * 60)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-indigo-600">{toHhmm(stats.totalSpent)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-slate-700 hidden md:table-cell">{toHhmm(stats.totalReqEff)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-cyan-600 hidden md:table-cell">{toHhmm(stats.totalActEff)}</td>
                    <td className="px-2 sm:px-3 py-2 text-center hidden lg:table-cell">
                      <EffBadge value={
                        stats.totalSpent > 0 
                          ? ((projAnalytics.reduce((s, p) => s + p.qcHrs, 0) / stats.totalSpent) / 10) 
                          : 0
                      } />
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-center hidden lg:table-cell">
                      <EffBadge value={
                        stats.totalReqEff > 0 
                          ? ((projAnalytics.reduce((s, p) => s + p.qcHrs, 0) / stats.totalReqEff) / 10) 
                          : 0
                      } />
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-center hidden lg:table-cell"><EffBadge value={stats.avgEff} /></td>
                    <td className="px-2 sm:px-3 py-2"></td>
                  </tr>
                </tfoot>
            </table>
          </div>

          {/* Charts */}
          {projChartData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-slate-700">Hours Comparison</p>
                  <button onClick={() => setChartType(chartType === 'bar' ? 'pie' : 'bar')} className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium">
                    {chartType === 'bar' ? 'Pie' : 'Bar'}
                  </button>
                </div>
                {chartType === 'bar' ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, projChartData.length * 38)}>
                    <BarChart data={projChartData} layout="vertical" barSize={10} barGap={4} barCategoryGap="25%" margin={{ left: 0, right: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                      <Tooltip formatter={(val, name) => [`${val} h`, name]} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="spent" name="Spent Hrs" fill="#6366f1" radius={[0, 2, 2, 0]} />
                      <Bar dataKey="req" name="Req Eff Hrs" fill="#8b5cf6" radius={[0, 2, 2, 0]} />
                      <Bar dataKey="act" name="Act Eff Hrs" fill="#10b981" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={projChartData} dataKey="spent" nameKey="fullName" cx="50%" cy="50%" outerRadius={100} innerRadius={55}
                        label={({ name, value }) => `${name}: ${value}h`} labelLine={true}>
                        {projChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => `${v} h`} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="card">
                <p className="text-sm font-semibold text-slate-700 mb-3">Efficiency Ranking</p>
                <ResponsiveContainer width="100%" height={Math.max(200, projChartData.length * 38)}>
                  <BarChart data={[...projChartData].sort((a, b) => b.avgEff - a.avgEff)} layout="vertical" barSize={10} margin={{ left: 0, right: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip formatter={(v) => [`${v}%`, 'Avg Eff']} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _} />
                    <Bar dataKey="avgEff" name="Avg Eff %" radius={[0, 4, 4, 0]}>
                      {[...projChartData].sort((a, b) => b.avgEff - a.avgEff).map((entry, i) => (
                        <Cell key={i} fill={entry.avgEff >= 100 ? '#10b981' : entry.avgEff >= 85 ? '#f59e0b' : '#ef4444'} />
                      ))}
                      <LabelList dataKey="avgEff" position="right" style={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} formatter={(v) => `${v}%`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-slate-400 mt-2">Colour: green ≥100% · amber 85–99% · red &lt;85%</p>
              </div>
            </div>
          )}
        </>
      ) : viewMode === 'employee' ? (
        <>
          {/* Employee Wise Table */}
          <div className="card overflow-x-auto mb-6 p-0">
            <table className="min-w-[500px] md:min-w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-slate-500">Employee</th>
                  <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-slate-500 hidden sm:table-cell">EMP ID</th>
                  <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500">Proj</th>
                  <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500">Sess</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs font-semibold text-slate-500">Spent</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs font-semibold text-slate-500 hidden md:table-cell">Req Eff</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs font-semibold text-slate-500 hidden md:table-cell">Act Eff</th>
                  <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500">Avg Eff</th>
                </tr>
              </thead>
              <tbody>
                {empAnalytics.map((e, i) => (
                  <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-amber-50/30`}>
                    <td className="px-2 sm:px-3 py-2 font-medium text-slate-800 text-[11px] sm:text-sm">{e.empName}</td>
                    <td className="px-2 sm:px-3 py-2 text-slate-400 text-[10px] sm:text-xs hidden sm:table-cell">{e.empId}</td>
                    <td className="px-2 sm:px-3 py-2 text-center text-[11px] sm:text-sm text-slate-500">{e.projCount}</td>
                    <td className="px-2 sm:px-3 py-2 text-center text-[11px] sm:text-sm text-slate-500">{e.sessions}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-indigo-600 font-semibold">{toHhmm(e.spent)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-violet-600 hidden md:table-cell">{toHhmm(e.reqEff)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-emerald-600 hidden md:table-cell">{toHhmm(e.actEff)}</td>
                    <td className="px-2 sm:px-3 py-2 text-center"><EffBadge value={e.avgEff} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold">
                <tr>
                  <td className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs" colSpan={3}>Total ({empAnalytics.length})</td>
                  <td className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-sm text-slate-700">{empAnalytics.reduce((s, e) => s + e.sessions, 0)}</td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-indigo-600">{toHhmm(stats.totalSpent)}</td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-violet-600 hidden md:table-cell">{toHhmm(stats.totalReqEff)}</td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-emerald-600 hidden md:table-cell">{toHhmm(stats.totalActEff)}</td>
                  <td className="px-2 sm:px-3 py-2 text-center"><EffBadge value={stats.avgEff} /></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {empChartData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card">
                <p className="text-sm font-semibold text-slate-700 mb-3">Hours Comparison</p>
                <ResponsiveContainer width="100%" height={Math.max(200, empChartData.length * 38)}>
                  <BarChart data={empChartData} layout="vertical" barSize={10} barGap={4} barCategoryGap="25%" margin={{ left: 0, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip formatter={(val, name) => [`${val} h`, name]} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="spent" name="Spent Hrs" fill="#6366f1" radius={[0, 2, 2, 0]} />
                    <Bar dataKey="req" name="Req Eff Hrs" fill="#8b5cf6" radius={[0, 2, 2, 0]} />
                    <Bar dataKey="act" name="Act Eff Hrs" fill="#10b981" radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <p className="text-sm font-semibold text-slate-700 mb-3">Efficiency Ranking</p>
                <ResponsiveContainer width="100%" height={Math.max(200, empChartData.length * 38)}>
                  <BarChart data={[...empChartData].sort((a, b) => b.avgEff - a.avgEff)} layout="vertical" barSize={10} margin={{ left: 0, right: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip formatter={(v) => [`${v}%`, 'Avg Eff']} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _} />
                    <Bar dataKey="avgEff" name="Avg Eff %" radius={[0, 4, 4, 0]}>
                      {[...empChartData].sort((a, b) => b.avgEff - a.avgEff).map((entry, i) => (
                        <Cell key={i} fill={entry.avgEff >= 100 ? '#10b981' : entry.avgEff >= 85 ? '#f59e0b' : '#ef4444'} />
                      ))}
                      <LabelList dataKey="avgEff" position="right" style={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} formatter={(v) => `${v}%`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Team Lead Wise Table */}
          <div className="card overflow-x-auto mb-6 p-0">
            <table className="min-w-[550px] md:min-w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-slate-500">Team Lead</th>
                  <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500">Emp</th>
                  <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500">Proj</th>
                  <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500">Sess</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs font-semibold text-slate-500">QC Hrs</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs font-semibold text-slate-500">Spent</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs font-semibold text-slate-500 hidden md:table-cell">Req Eff</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-[10px] sm:text-xs font-semibold text-slate-500 hidden md:table-cell">Act Eff</th>
                  <th className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-xs font-semibold text-slate-500">Avg Eff</th>
                </tr>
              </thead>
              <tbody>
                {leadAnalytics.map((l, i) => (
                  <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-amber-50/30`}>
                    <td className="px-2 sm:px-3 py-2 font-medium text-slate-800 text-[11px] sm:text-sm">{l.leadName}</td>
                    <td className="px-2 sm:px-3 py-2 text-center text-[11px] sm:text-sm text-slate-500">{l.empCount}</td>
                    <td className="px-2 sm:px-3 py-2 text-center text-[11px] sm:text-sm text-slate-500">{l.projCount}</td>
                    <td className="px-2 sm:px-3 py-2 text-center text-[11px] sm:text-sm text-slate-500">{l.sessions}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-amber-700 font-semibold">{toHhmm(l.totalQcHrs * 60)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-indigo-600 font-semibold">{toHhmm(l.spent)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-violet-600 hidden md:table-cell">{toHhmm(l.reqEff)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-emerald-600 hidden md:table-cell">{toHhmm(l.actEff)}</td>
                    <td className="px-2 sm:px-3 py-2 text-center"><EffBadge value={l.avgEff} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold">
                <tr>
                  <td className="px-2 sm:px-3 py-2 text-[10px] sm:text-xs">Total ({leadAnalytics.length})</td>
                  <td className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-sm text-slate-700">{stats.uniqueEmps}</td>
                  <td className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-sm text-slate-700">{projAnalytics.length}</td>
                  <td className="px-2 sm:px-3 py-2 text-center text-[10px] sm:text-sm text-slate-700">{stats.sessions}</td>
                    <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-amber-700">{toHhmm(stats.totalQCHrs * 60)}</td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-indigo-600">{toHhmm(stats.totalSpent)}</td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-violet-600 hidden md:table-cell">{toHhmm(stats.totalReqEff)}</td>
                  <td className="px-2 sm:px-3 py-2 text-right font-mono text-[10px] sm:text-sm text-emerald-600 hidden md:table-cell">{toHhmm(stats.totalActEff)}</td>
                  <td className="px-2 sm:px-3 py-2 text-center"><EffBadge value={stats.avgEff} /></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {leadChartData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card">
                <p className="text-sm font-semibold text-slate-700 mb-3">Hours by Team Lead</p>
                <ResponsiveContainer width="100%" height={Math.max(200, leadChartData.length * 38)}>
                  <BarChart data={leadChartData} layout="vertical" barSize={10} barGap={4} barCategoryGap="25%" margin={{ left: 0, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip formatter={(val, name) => [`${val} h`, name]} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="spent" name="Spent Hrs" fill="#6366f1" radius={[0, 2, 2, 0]} />
                    <Bar dataKey="req" name="Req Eff Hrs" fill="#8b5cf6" radius={[0, 2, 2, 0]} />
                    <Bar dataKey="act" name="Act Eff Hrs" fill="#10b981" radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <p className="text-sm font-semibold text-slate-700 mb-3">Efficiency by Team Lead</p>
                <ResponsiveContainer width="100%" height={Math.max(200, leadChartData.length * 38)}>
                  <BarChart data={[...leadChartData].sort((a, b) => b.avgEff - a.avgEff)} layout="vertical" barSize={10} margin={{ left: 0, right: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip formatter={(v) => [`${v}%`, 'Avg Eff']} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _} />
                    <Bar dataKey="avgEff" name="Avg Eff %" radius={[0, 4, 4, 0]}>
                      {[...leadChartData].sort((a, b) => b.avgEff - a.avgEff).map((entry, i) => (
                        <Cell key={i} fill={entry.avgEff >= 100 ? '#10b981' : entry.avgEff >= 85 ? '#f59e0b' : '#ef4444'} />
                      ))}
                      <LabelList dataKey="avgEff" position="right" style={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} formatter={(v) => `${v}%`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
       )}

       {/* Edit Status Modal */}
       {editingProject && (
         <Modal title={`Edit Status: ${editingProject.projName}`} onClose={closeEditStatus}>
           <div className="space-y-4">
             <div>
               <label className="label text-xs">Current Status</label>
               <p className="text-sm text-slate-600">{editingProject.status || '—'}</p>
             </div>
             <div>
               <label className="label text-xs">New Status</label>
               <select
                 className="input w-full"
                 value={editStatus}
                 onChange={(e) => setEditStatus(e.target.value)}
               >
                 <option value="">— Select —</option>
                 {STATUSES.map((s) => (
                   <option key={s} value={s}>{s}</option>
                 ))}
               </select>
             </div>
             <div className="flex gap-3 justify-end pt-2">
               <button onClick={closeEditStatus} className="btn-secondary" disabled={editSaving}>
                 Cancel
               </button>
               <button onClick={saveStatus} className="btn-primary flex items-center gap-1.5" disabled={!editStatus || editSaving}>
                 {editSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                 {editSaving ? 'Saving…' : 'Save'}
               </button>
             </div>
           </div>
         </Modal>
       )}

       {/* Formula legend */}
      <div className="mt-4 text-xs text-slate-400 flex flex-wrap gap-4">
        <span>QC Hours = Client Hours × 15%</span>
        <span>QC Actual Efficiency = (QC Hrs ÷ Spent Hrs) ÷ 10</span>
        <span>QC Req Efficiency = (QC Hrs ÷ Req Eff Hrs) ÷ 10</span>
        <span>Emp Avg Eff = (Act Eff Hrs ÷ Req Eff Hrs) × 100</span>
      </div>
    </div>
  );
}
