import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  RefreshCw, Plus, Trash2, Clock, Users, Briefcase, TrendingUp,
  BarChart2, Target, LayoutList, PieChart as PieIcon, Download, Save, X,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList, Cell, PieChart, Pie,
} from 'recharts';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';

const PH_HEADERS = [
  '#', 'Date', 'EMP ID', 'Employee Name', 'Department',
  'Project ID', 'Project Name', 'Client', 'Spent Hrs',
  'Req Eff Hrs', 'Act Eff Hrs', 'Eff %', 'Remarks', 'Team Lead',
];

function useSettings() {
  const [s, setS] = useState(null);
  useEffect(() => {
    api.settings()
      .then(setS)
      .catch((e) => { console.warn('Settings load failed:', e); setS({ alignments: {} }); });
  }, []);
  return s || { alignments: {} };
}

function parseHhmm(val) {
  const s = String(val || '');
  if (!s.includes(':')) return NaN;
  const [h, m] = s.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return NaN;
  return h * 60 + m;
}

function toHhmm(val) {
  const total = Math.round(parseFloat(val) || 0);
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function EffBadge({ val }) {
  if (!val || val === 0) return <span className="text-slate-300">—</span>;
  const pct = val * 100;
  const cls = pct >= 100 ? 'text-emerald-600 bg-emerald-50' : pct >= 85 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{pct.toFixed(1)}%</span>;
}

function SearchableSelect({ options, value, onSelect, placeholder, className }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query || !options) return [];
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 50);
  }, [options, query]);

  useEffect(() => { setQuery(value || ''); }, [value]);

  return (
    <div className="relative">
      <input
        className={className || 'input'}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((o, i) => (
            <div key={i} className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer truncate" onMouseDown={() => { onSelect(o); setQuery(o.label); setOpen(false); }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, color, bg, label, value, sub }) {
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

function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} />;
}

function ProjectHoursSkeleton() {
  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="space-y-2">
          <SkeletonBlock className="h-7 w-52" />
          <SkeletonBlock className="h-4 w-36" />
        </div>
        <SkeletonBlock className="h-8 w-8 rounded-lg" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card flex items-center gap-3">
            <SkeletonBlock className="h-10 w-10 rounded-xl shrink-0" />
            <div className="space-y-1.5 flex-1">
              <SkeletonBlock className="h-5 w-12" />
              <SkeletonBlock className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <SkeletonBlock className="h-3 w-14" />
              <SkeletonBlock className="h-8 w-32" />
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 flex gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3 border-t border-slate-50">
            {Array.from({ length: 10 }).map((_, c) => (
              <SkeletonBlock key={c} className="h-3 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProjectHours({ toast, initialTab }) {
  const sett = useSettings();
  const [activeTab, setActiveTab] = useState('log');
  const [headers, setHeaders] = useState(PH_HEADERS);
  const [rows, setRows] = useState([]);
  const [rowIndices, setRowIndices] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [empMapData, setEmpMapData] = useState([]);
  const [projTypeMap, setProjTypeMap] = useState({}); // projId → { isQaqc, isClientFb, isInternalFb }
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState(null); // for editing Act Eff Hrs

  // Log tab filters
  const [filterEmp, setFilterEmp] = useState('All');
  const [filterProj, setFilterProj] = useState('All');
  const [filterTeamLead, setFilterTeamLead] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [logDatePreset, setLogDatePreset] = useState('all');
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');
  const [dateOpen, setDateOpen] = useState(false);

  // Analytics filters
  const [aEmp, setAEmp] = useState('All');
  const [aProj, setAProj] = useState('All');
  const [aMonth, setAMonth] = useState('All');
  const [aDept, setADept] = useState('All');
  const [aStatus, setAStatus] = useState('All');
  const [aTeamLead, setATeamLead] = useState('All');
  const [aType, setAType] = useState('All');
  const [aYear, setAYear] = useState(new Date().getFullYear());
  const [aMonthIdx, setAMonthIdx] = useState(new Date().getMonth());
  const [targetAllMonths, setTargetAllMonths] = useState(false);
  const [divisionTarget, setDivisionTarget] = useState('');
  const [teamTargets, setTeamTargets] = useState({});
  const [showTargetSettings, setShowTargetSettings] = useState(() => {
    const saved = localStorage.getItem('ph_showTargetSettings');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => { localStorage.setItem('ph_showTargetSettings', showTargetSettings); }, [showTargetSettings]);

  function passTypeFilter(r, typeVal) {
    if (typeVal === 'All') return true;
    const flags = projTypeMap[r[5]] || {};
    if (typeVal === 'QC') return flags.isQaqc;
    if (typeVal === 'Internal FB') return flags.isInternalFb;
    if (typeVal === 'Client FB') return flags.isClientFb;
    if (typeVal === 'Regular') return !flags.isQaqc && !flags.isInternalFb && !flags.isClientFb;
    return true;
  }

  // Analytics view toggle
  const [analyticsView, setAnalyticsView] = useState('employee'); // 'employee' | 'project' | 'team-lead'
  const [showTlColMenu, setShowTlColMenu] = useState(false);
  const tlColMenuRef = useRef(null);
  useEffect(() => {
    if (!showTlColMenu) return;
    const handler = (e) => { if (tlColMenuRef.current && !tlColMenuRef.current.contains(e.target)) setShowTlColMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTlColMenu]);
  const [effChartType, setEffChartType] = useState('bar'); // 'bar' | 'pie'
  const [empDistChartType, setEmpDistChartType] = useState('pie'); // 'pie' | 'bar'
  const [empEffDistChartType, setEmpEffDistChartType] = useState('pie'); // 'pie' | 'bar'
  const [projClientChartType, setProjClientChartType] = useState('pie'); // 'pie' | 'bar'
  const [tlVisibleCols, setTlVisibleCols] = useState({
    employees: true,
    projects: true,
    sessions: true,
    spentHrs: true,
    reqHrs: true,
    actHrs: true,
    clientHrs: true,
    targetHrs: true,
    pctAchieved: true,
    pctLeft: true,
    gap: true,
    projEff: true,
    actualEff: true,
    avgEff: true,
  });
  const tlColumnList = [
    { key: 'employees', label: 'Employees' },
    { key: 'projects', label: 'Projects' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'spentHrs', label: 'Spent Hrs' },
    { key: 'reqHrs', label: 'Req Eff Hrs' },
    { key: 'actHrs', label: 'Act Eff Hrs' },
    { key: 'clientHrs', label: 'Client Hrs' },
    { key: 'targetHrs', label: 'Target Hrs' },
    { key: 'pctAchieved', label: '% Achieved' },
    { key: 'pctLeft', label: '% Left' },
    { key: 'gap', label: 'Gap' },
    { key: 'projEff', label: 'Proj Req Eff' },
    { key: 'actualEff', label: 'Proj Act Eff' },
    { key: 'avgEff', label: 'Emp Avg Eff' },
  ];

  const load = async () => {
    setLoading(true);
    try {
      const [d, p, e, em, pt] = await Promise.all([api.projectHours(), api.projects(), api.employees(), api.empMap(), api.projectTypes()]);
      if (d.headers?.length) setHeaders(d.headers);
      setRows(d.data || []);
      setRowIndices(d.rowIndices || []);
      setProjects(p?.data || p || []);
      setEmployees(e?.data || e || []);
      setEmpMapData(em?.data || []);
      setProjTypeMap(pt || {});
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // ── Log tab computed ────────────────────────────────────────────────────

  // Employee → Team Lead: primary = EMPLOYEES col 3, fallback = EMP_MAP col 10
  const empLeadMap = useMemo(() => {
    const m = {};
    (Array.isArray(employees) ? employees : []).forEach((e) => { if (e[0] && e[3]) m[e[0]] = e[3]; });
    (Array.isArray(empMapData) ? empMapData : []).forEach((row) => {
      if (row[2] && !m[row[2]] && row[10]) m[row[2]] = row[10];
    });
    return m;
  }, [employees, empMapData]);

  const employeeRatioMap = useMemo(() => {
    const m = {};
    (Array.isArray(employees) ? employees : []).forEach((e) => {
      if (e[0]) m[e[0]] = parseFloat(e[7]) || 0.75;
    });
    return m;
  }, [employees]);

  // resolve team lead for a row: stored col 13 first, then dynamic lookup
  const getRowTL = (r) => r[13] || empLeadMap[r[2]] || '';

  const passDateFilter = useCallback((r) => {
    if (logDatePreset === 'all') return true;
    const raw = r[1];
    if (!raw) return false;
    const s = String(raw);
    let ymd;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      ymd = s;
    } else {
      const parts = s.split('/');
      if (parts.length !== 3) return false;
      const m = parts[0].padStart(2, '0');
      const d = parts[1].padStart(2, '0');
      const y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
      ymd = `${y}-${m}-${d}`;
    }
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    if (logDatePreset === 'today') return ymd === todayStr;
    if (logDatePreset === 'yesterday') {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return ymd === y.toISOString().slice(0, 10);
    }
    if (logDatePreset === '7days') {
      const d = new Date(today); d.setDate(d.getDate() - 7);
      return ymd >= d.toISOString().slice(0, 10);
    }
    if (logDatePreset === '30days') {
      const d = new Date(today); d.setDate(d.getDate() - 30);
      return ymd >= d.toISOString().slice(0, 10);
    }
    if (logDatePreset === 'custom') {
      if (logDateFrom && ymd < logDateFrom) return false;
      if (logDateTo && ymd > logDateTo) return false;
      return true;
    }
    return true;
  }, [logDatePreset, logDateFrom, logDateTo]);

  // Dynamic filter options for Log tab (cross-dependent, like Analytics)
  const logBaseRows = useMemo(() => rows.filter((r) => {
    if (!passDateFilter(r)) return false;
    return true;
  }), [rows, passDateFilter]);

  const logEmpOptions = useMemo(() => {
    const filtered = logBaseRows.filter((r) => {
      if (filterProj !== 'All' && r[5] !== filterProj) return false;
      if (filterTeamLead !== 'All' && getRowTL(r) !== filterTeamLead) return false;
      if (!passTypeFilter(r, filterType)) return false;
      return true;
    });
    const names = new Set(filtered.map((r) => r[3]).filter(Boolean));
    if (filterEmp !== 'All') names.add(filterEmp);
    return [...names].sort();
  }, [logBaseRows, filterProj, filterTeamLead, filterType, filterEmp, empLeadMap, projTypeMap]);

  const logProjOptions = useMemo(() => {
    const filtered = logBaseRows.filter((r) => {
      if (filterEmp !== 'All' && r[3] !== filterEmp) return false;
      if (filterTeamLead !== 'All' && getRowTL(r) !== filterTeamLead) return false;
      if (!passTypeFilter(r, filterType)) return false;
      return true;
    });
    const map = new Map();
    filtered.forEach((r) => { if (r[5]) map.set(r[5], r[6] || r[5]); });
    if (filterProj !== 'All' && !map.has(filterProj)) {
      const found = logBaseRows.find((r) => r[5] === filterProj);
      map.set(filterProj, found ? (found[6] || filterProj) : filterProj);
    }
    const nameCount = {};
    map.forEach((name) => { nameCount[name] = (nameCount[name] || 0) + 1; });
    const typeLabel = (id) => { const f = projTypeMap[id] || {}; return f.isQaqc ? 'QC' : f.isInternalFb ? 'Int FB' : f.isClientFb ? 'Client FB' : 'Regular'; };
    return [...map.entries()]
      .map(([id, name]) => ({ id, label: nameCount[name] > 1 ? `${name} (${typeLabel(id)})` : name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [logBaseRows, filterEmp, filterTeamLead, filterType, filterProj, empLeadMap, projTypeMap]);

  const teamLeadOptionsLog = useMemo(() => {
    const filtered = logBaseRows.filter((r) => {
      if (filterEmp !== 'All' && r[3] !== filterEmp) return false;
      if (filterProj !== 'All' && r[5] !== filterProj) return false;
      if (!passTypeFilter(r, filterType)) return false;
      return true;
    });
    const leads = new Set(filtered.map((r) => getRowTL(r)).filter(Boolean));
    const fromEmp = employees.map((e) => e[3]).filter(Boolean);
    const fromMap = empMapData.map((row) => row[10]).filter(Boolean);
    fromEmp.forEach((l) => leads.add(l));
    fromMap.forEach((l) => leads.add(l));
    if (filterTeamLead !== 'All') leads.add(filterTeamLead);
    return [...leads].sort();
  }, [logBaseRows, filterEmp, filterProj, filterType, filterTeamLead, employees, empMapData, empLeadMap, projTypeMap]);

  const filteredRows = useMemo(() => rows.filter((r) => {
    if (filterEmp !== 'All' && r[3] !== filterEmp) return false;
    if (filterProj !== 'All' && r[5] !== filterProj) return false;
    if (filterTeamLead !== 'All' && getRowTL(r) !== filterTeamLead) return false;
    if (!passDateFilter(r)) return false;
    if (!passTypeFilter(r, filterType)) return false;
    return true;
  }), [rows, filterEmp, filterProj, filterTeamLead, filterType, empLeadMap, passDateFilter, projTypeMap]);

  const filteredRowIndices = useMemo(() => rows.reduce((acc, r, i) => {
    if (filterEmp !== 'All' && r[3] !== filterEmp) return acc;
    if (filterProj !== 'All' && r[5] !== filterProj) return acc;
    if (filterTeamLead !== 'All' && getRowTL(r) !== filterTeamLead) return acc;
    if (!passDateFilter(r)) return acc;
    if (!passTypeFilter(r, filterType)) return acc;
    acc.push(rowIndices[i]);
    return acc;
  }, []), [rows, rowIndices, filterEmp, filterProj, filterTeamLead, filterType, empLeadMap, passDateFilter, projTypeMap]);

  // Ensure every row has 14 elements; fill Team Lead from dynamic lookup if col 13 is blank
  // Calculate Req Eff Hrs (col 9) from Spent Hrs (col 8) * employee ratio
  const logRows = useMemo(() => filteredRows.map((r) => {
    const row = r.length >= 14 ? [...r] : [...r, ...Array(14 - r.length).fill('')];
    if (!row[13]) row[13] = empLeadMap[r[2]] || '—';
    const spent = parseFloat(row[8]) || 0;
    const rawRatio = employeeRatioMap[row[2]] || 0.75;
    // Normalize: ratio stored as percentage (e.g. 100) → decimal (1.0)
    const ratio = rawRatio > 1 ? rawRatio / 100 : rawRatio;
    const reqEff = +(spent * ratio).toFixed(2);
    row[9] = reqEff;
    const actEff = parseFloat(row[10]) || 0;
    row[11] = actEff > 0 && reqEff > 0 ? +(actEff / reqEff).toFixed(4) : 0;
    return row;
  }), [filteredRows, empLeadMap, employeeRatioMap]);

  const totalHrs = filteredRows.reduce((s, r) => s + (parseFloat(r[8]) || 0), 0);
  const uniqueEmps = new Set(filteredRows.map((r) => r[2]).filter(Boolean)).size;
  const effVals = logRows.map((r) => parseFloat(r[11])).filter((v) => !isNaN(v) && v > 0);
  const avgEff = effVals.length ? effVals.reduce((s, v) => s + v, 0) / effVals.length : 0;
  const avgEffDisplay = (avgEff * 100).toFixed(1) + '%';

  // Type breakdown (log tab)
  const typeBreakdown = useMemo(() => {
    let qc = 0, intFb = 0, clientFb = 0, regular = 0;
    filteredRows.forEach((r) => {
      const hrs = parseFloat(r[8]) || 0;
      const flags = projTypeMap[r[5]] || {};
      if (flags.isQaqc) qc += hrs;
      else if (flags.isInternalFb) intFb += hrs;
      else if (flags.isClientFb) clientFb += hrs;
      else regular += hrs;
    });
    return { qc, intFb, clientFb, regular };
  }, [filteredRows, projTypeMap]);

  // ── Analytics options ───────────────────────────────────────────────────
  // parse M/D/YY or YYYY-MM-DD → "YYYY-MM"
  const toYearMonth = (dateStr) => {
    if (!dateStr) return null;
    const s = String(dateStr);
    if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
    const parts = s.split('/');
    if (parts.length === 3) {
      const m = parts[0].padStart(2, '0');
      const y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
      return `${y}-${m}`;
    }
    return null;
  };
  const fmtMonthLabel = (ym) => {
    const [y, m] = ym.split('-');
    return new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  };
  const monthOptions = useMemo(() => {
    const months = [...new Set(rows.map((r) => toYearMonth(r[1])).filter(Boolean))].sort().reverse();
    return months;
  }, [rows]);

  const deptOptions = useMemo(() => [...new Set(rows.map((r) => r[4]).filter(Boolean))].sort(), [rows]);

  // Project status map: projId -> status
  const projStatusMap = useMemo(() => {
    const m = {};
    const list = Array.isArray(projects) ? projects : [];
    list.forEach((p) => { if (p[0]) m[p[0]] = p[3] || ''; });
    return m;
  }, [projects]);

  const statusOptions = useMemo(() => {
    const s = [...new Set(rows.map((r) => projStatusMap[r[5]]).filter(Boolean))].sort();
    return s;
  }, [rows, projStatusMap]);

  const analyticsEmpOptions = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (aProj !== 'All' && r[5] !== aProj) return false;
      if (aMonth !== 'All' && toYearMonth(r[1]) !== aMonth) return false;
      if (aDept !== 'All' && r[4] !== aDept) return false;
      if (aStatus !== 'All' && projStatusMap[r[5]] !== aStatus) return false;
      if (aTeamLead !== 'All' && getRowTL(r) !== aTeamLead) return false;
      if (!passTypeFilter(r, aType)) return false;
      return true;
    });
    const names = new Set(filtered.map((r) => r[3]).filter(Boolean));
    if (aEmp !== 'All') names.add(aEmp);
    return [...names].sort();
  }, [rows, aProj, aMonth, aDept, aStatus, aTeamLead, aType, aEmp, projStatusMap, empLeadMap, projTypeMap]);

  const analyticsProjOptions = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (aEmp !== 'All' && r[3] !== aEmp) return false;
      if (aMonth !== 'All' && toYearMonth(r[1]) !== aMonth) return false;
      if (aDept !== 'All' && r[4] !== aDept) return false;
      if (aStatus !== 'All' && projStatusMap[r[5]] !== aStatus) return false;
      if (aTeamLead !== 'All' && getRowTL(r) !== aTeamLead) return false;
      if (!passTypeFilter(r, aType)) return false;
      return true;
    });
    const map = new Map();
    filtered.forEach((r) => { if (r[5]) map.set(r[5], r[6] || r[5]); });
    if (aProj !== 'All' && !map.has(aProj)) {
      const found = rows.find((r) => r[5] === aProj);
      map.set(aProj, found ? (found[6] || aProj) : aProj);
    }
    const nameCount = {};
    map.forEach((name) => { nameCount[name] = (nameCount[name] || 0) + 1; });
    const typeLabel = (id) => { const f = projTypeMap[id] || {}; return f.isQaqc ? 'QC' : f.isInternalFb ? 'Int FB' : f.isClientFb ? 'Client FB' : 'Regular'; };
    return [...map.entries()]
      .map(([id, name]) => ({ id, label: nameCount[name] > 1 ? `${name} (${typeLabel(id)})` : name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, aEmp, aMonth, aDept, aStatus, aTeamLead, aType, aProj, projStatusMap, empLeadMap, projTypeMap]);

  // Team Lead options (analytics tab)
  const teamLeadOptions = useMemo(() => {
    const fromRows = rows.map((r) => r[13]).filter(Boolean);
    const fromEmp = employees.map((e) => e[3]).filter(Boolean);
    const fromMap = empMapData.map((row) => row[10]).filter(Boolean);
    return [...new Set([...fromRows, ...fromEmp, ...fromMap])].sort();
  }, [rows, employees, empMapData]);

  // Analytics filtered rows
  const analyticsRows = useMemo(() => rows.filter((r) => {
    if (aEmp !== 'All' && r[3] !== aEmp) return false;
    if (aProj !== 'All' && r[5] !== aProj) return false;
    if (aMonth !== 'All' && toYearMonth(r[1]) !== aMonth) return false;
    if (aDept !== 'All' && r[4] !== aDept) return false;
    if (aStatus !== 'All' && projStatusMap[r[5]] !== aStatus) return false;
    if (aTeamLead !== 'All' && getRowTL(r) !== aTeamLead) return false;
    if (!passTypeFilter(r, aType)) return false;
    return true;
  }), [rows, aEmp, aProj, aMonth, aDept, aStatus, aTeamLead, aType, projStatusMap, empLeadMap, projTypeMap]);

  // ── Analytics stat values ───────────────────────────────────────────────
  const aTotalSpent = analyticsRows.reduce((s, r) => s + (parseFloat(r[8]) || 0), 0);
  const aTotalReq = analyticsRows.reduce((s, r) => {
    const spent = parseFloat(r[8]) || 0;
    const rawRatio = employeeRatioMap[r[2]] || 0.75;
    const ratio = rawRatio > 1 ? rawRatio / 100 : rawRatio;
    return s + +(spent * ratio).toFixed(2);
  }, 0);
  const aTotalAct = analyticsRows.reduce((s, r) => s + (parseFloat(r[10]) || 0), 0);
  const aAvgEff = aTotalReq > 0 ? aTotalAct / aTotalReq : 0;
  const aAvgEffDisplay = (aAvgEff * 100).toFixed(1) + '%';
  const aUniqueEmps = new Set(analyticsRows.map((r) => r[2]).filter(Boolean)).size;
  const aUniqueProjs = new Set(analyticsRows.map((r) => r[5]).filter(Boolean)).size;
  const aTotalClientHrs = useMemo(() => {
    const projClientHrs = {};
    (Array.isArray(projects) ? projects : []).forEach((p) => { if (p[0]) projClientHrs[p[0]] = parseFloat(p[7]) || 0; });
    const projsInFilter = new Set(analyticsRows.map((r) => r[5]).filter(Boolean));
    return [...projsInFilter].reduce((sum, pid) => sum + (projClientHrs[pid] || 0), 0);
  }, [analyticsRows, projects]);
  const totalGap = +(aTotalSpent / 60 - aTotalClientHrs).toFixed(1);

  // Type breakdown (analytics tab)
  const aTypeBreakdown = useMemo(() => {
    let qc = 0, intFb = 0, clientFb = 0, regular = 0;
    analyticsRows.forEach((r) => {
      const hrs = parseFloat(r[8]) || 0;
      const flags = projTypeMap[r[5]] || {};
      if (flags.isQaqc) qc += hrs;
      else if (flags.isInternalFb) intFb += hrs;
      else if (flags.isClientFb) clientFb += hrs;
      else regular += hrs;
    });
    return { qc, intFb, clientFb, regular };
  }, [analyticsRows, projTypeMap]);

  // ── Target data ─────────────────────────────────────────────────────────
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  useEffect(() => {
    const key = `divTarget_${aYear}_${aMonthIdx}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved) { setDivisionTarget(saved.divisionTarget ?? ''); setTeamTargets(saved.teamTargets || {}); }
      else { setDivisionTarget(''); setTeamTargets({}); }
    } catch { setDivisionTarget(''); setTeamTargets({}); }
  }, [aYear, aMonthIdx]);
  const dt = parseFloat(divisionTarget) || 0;
  const tlTotalTargets = useMemo(() => {
    const m = {}; Object.entries(teamTargets).forEach(([tl, v]) => { m[tl] = parseFloat(v) || 0; }); return m;
  }, [teamTargets]);
  const totalTargetSum = Object.values(tlTotalTargets).reduce((s, v) => s + v, 0);

  // ── Target-month client hrs (independent of analytics filters) ──────────
  const targetMonthRows = useMemo(() => {
    if (targetAllMonths) return rows;
    return rows.filter((r) => {
      const ym = toYearMonth(r[1]);
      if (!ym) return false;
      const [y, m] = ym.split('-').map(Number);
      return y === aYear && m === aMonthIdx + 1;
    });
  }, [rows, aYear, aMonthIdx, targetAllMonths]);
  const targetMonthClientHrs = useMemo(() => {
    const projClientHrs = {};
    (Array.isArray(projects) ? projects : []).forEach((p) => { if (p[0]) projClientHrs[p[0]] = parseFloat(p[7]) || 0; });
    const projsInMonth = new Set(targetMonthRows.map((r) => r[5]).filter(Boolean));
    return [...projsInMonth].reduce((sum, pid) => sum + (projClientHrs[pid] || 0), 0);
  }, [targetMonthRows, projects]);
  const targetMonthTlClientHrs = useMemo(() => {
    const projClientHrs = {};
    (Array.isArray(projects) ? projects : []).forEach((p) => { if (p[0]) projClientHrs[p[0]] = parseFloat(p[7]) || 0; });
    const empMap = {};
    employees.forEach((e) => { if (e[1]) empMap[e[1]] = e[3] || ''; });
    empMapData.forEach((row) => { if (row[1] && !empMap[row[1]] && row[10]) empMap[row[1]] = row[10]; });
    const tlProjMap = {};
    targetMonthRows.forEach((r) => {
      const lead = empMap[r[3]] || 'Unassigned';
      if (!tlProjMap[lead]) tlProjMap[lead] = new Set();
      if (r[5]) tlProjMap[lead].add(r[5]);
    });
    const result = {};
    Object.entries(tlProjMap).forEach(([tl, projIds]) => { result[tl] = [...projIds].reduce((sum, pid) => sum + (projClientHrs[pid] || 0), 0); });
    return result;
  }, [targetMonthRows, projects, employees, empMapData]);
  // Spent-hrs per team lead within the target period (what was actually worked)
  const targetMonthSpentHrs = useMemo(() => targetMonthRows.reduce((s, r) => s + (parseFloat(r[8]) || 0), 0), [targetMonthRows]);
  const targetMonthTlSpentHrs = useMemo(() => {
    const empMap = {};
    employees.forEach((e) => { if (e[1]) empMap[e[1]] = e[3] || ''; });
    empMapData.forEach((row) => { if (row[1] && !empMap[row[1]] && row[10]) empMap[row[1]] = row[10]; });
    const result = {};
    targetMonthRows.forEach((r) => {
      const lead = empMap[r[3]] || 'Unassigned';
      result[lead] = (result[lead] || 0) + (parseFloat(r[8]) || 0);
    });
    return result;
  }, [targetMonthRows, employees, empMapData]);

  const activeTarget = aTeamLead !== 'All' ? (tlTotalTargets[aTeamLead] || 0) : dt;

  // ── Employee-wise aggregation ───────────────────────────────────────────
  const empAnalytics = useMemo(() => {
    const map = {};
    analyticsRows.forEach((r) => {
      const key = r[2] || r[3];
      if (!key) return;
      if (!map[key]) map[key] = {
        empName: r[3] || key, empId: r[2] || '', dept: r[4] || '—',
        sessions: 0, spentHrs: 0, reqHrs: 0, actHrs: 0,
      };
      const spent = parseFloat(r[8]) || 0;
      const rawRatio = employeeRatioMap[r[2]] || 0.75;
      const ratio = rawRatio > 1 ? rawRatio / 100 : rawRatio;
      map[key].sessions++;
      map[key].spentHrs += spent;
      map[key].reqHrs += +(spent * ratio).toFixed(2);
      map[key].actHrs += parseFloat(r[10]) || 0;
    });
    return Object.values(map).map((e) => ({
      ...e,
      spentHrs: +e.spentHrs.toFixed(2),
      reqHrs: +e.reqHrs.toFixed(2),
      actHrs: +e.actHrs.toFixed(2),
      avgEff: e.reqHrs > 0 ? +(e.actHrs / e.reqHrs).toFixed(4) : 0,
    })).sort((a, b) => b.spentHrs - a.spentHrs);
  }, [analyticsRows, employeeRatioMap]);

  // ── Project-wise aggregation ────────────────────────────────────────────
  const projAnalytics = useMemo(() => {
    const map = {};
    const projClientHrs = {};

    const projList = Array.isArray(projects) ? projects : [];
    projList.forEach((p) => { if (p[0]) projClientHrs[p[0]] = parseFloat(p[7]) || 0; });

    analyticsRows.forEach((r) => {
      const key = r[5] || r[6];
      if (!key) return;
      if (!map[key]) map[key] = {
        projId: r[5] || '', projName: r[6] || key, client: r[7] || '—',
        status: projStatusMap[r[5]] || '—',
        sessions: 0, spentHrs: 0, reqHrs: 0, actHrs: 0,
      };
      const spent = parseFloat(r[8]) || 0;
      const rawRatio = employeeRatioMap[r[2]] || 0.75;
      const ratio = rawRatio > 1 ? rawRatio / 100 : rawRatio;
      map[key].sessions++;
      map[key].spentHrs += spent;
      map[key].reqHrs += +(spent * ratio).toFixed(2);
      map[key].actHrs += parseFloat(r[10]) || 0;
    });
    return Object.values(map).map((p) => {
      const clientHrs = projClientHrs[p.projId] || 0;
      const projEff = p.reqHrs > 0 ? +(clientHrs / (p.reqHrs / 60)).toFixed(4) : 0;
      const actualEff = p.spentHrs > 0 ? +(clientHrs / (p.spentHrs / 60)).toFixed(4) : 0;
      return {
        ...p,
        spentHrs: +p.spentHrs.toFixed(2),
        reqHrs: +p.reqHrs.toFixed(2),
        actHrs: +p.actHrs.toFixed(2),
        clientHrs,
        projEff,
        actualEff,
        avgEff: p.reqHrs > 0 ? +(p.actHrs / p.reqHrs).toFixed(4) : 0,
      };
    }).sort((a, b) => b.spentHrs - a.spentHrs);
  }, [analyticsRows, projStatusMap, projects, employeeRatioMap]);

  // ── Team Lead aggregation ──────────────────────────────────────────────
  const teamLeadAnalytics = useMemo(() => {
    const map = {};
    const empMap = {};
    const projClientHrs = {};

    (Array.isArray(projects) ? projects : []).forEach((p) => {
      if (p[0]) projClientHrs[p[0]] = parseFloat(p[7]) || 0;
    });

    employees.forEach((e) => { if (e[1]) empMap[e[1]] = e[3] || ''; });
    empMapData.forEach((row) => { if (row[1] && !empMap[row[1]] && row[10]) empMap[row[1]] = row[10]; });

    analyticsRows.forEach((r) => {
      const empName = r[3];
      const lead = empMap[empName] || 'Unassigned';
      if (!map[lead]) map[lead] = {
        teamLead: lead,
        sessions: 0, spentHrs: 0, reqHrs: 0, actHrs: 0,
        employees: new Set(), projects: new Set(), projIds: new Set(),
      };
      const spent = parseFloat(r[8]) || 0;
      const rawRatio = employeeRatioMap[r[2]] || 0.75;
      const ratio = rawRatio > 1 ? rawRatio / 100 : rawRatio;
      map[lead].sessions++;
      map[lead].spentHrs += spent;
      map[lead].reqHrs += +(spent * ratio).toFixed(2);
      map[lead].actHrs += parseFloat(r[10]) || 0;
      map[lead].employees.add(r[3]);
      map[lead].projects.add(r[6]);
      if (r[5]) map[lead].projIds.add(r[5]);
    });
    return Object.values(map).map((t) => {
      const targetHrs = tlTotalTargets[t.teamLead] || 0;
      const clientHrs = [...t.projIds].reduce((sum, pid) => sum + (projClientHrs[pid] || 0), 0);
      const projEff = t.reqHrs > 0 ? +(clientHrs / (t.reqHrs / 60)).toFixed(4) : 0;
      const actualEff = t.spentHrs > 0 ? +(clientHrs / (t.spentHrs / 60)).toFixed(4) : 0;
      const gapHrs = +(targetHrs - clientHrs).toFixed(1);
      let gapStatus;
      if (targetHrs <= 0) gapStatus = 'Out of Track';
      else if (gapHrs <= 0) gapStatus = 'Excellent';
      else { const r = gapHrs / targetHrs; gapStatus = r <= 0.1 ? 'On Track' : r <= 0.25 ? 'At Risk' : 'Out of Track'; }
      const achievedPct = targetHrs > 0 ? Math.min(100, (clientHrs / targetHrs) * 100) : 0;
      const leftPct = targetHrs > 0 ? Math.max(0, ((targetHrs - clientHrs) / targetHrs) * 100) : 0;
      return {
        ...t,
        spentHrs: +t.spentHrs.toFixed(2),
        reqHrs: +t.reqHrs.toFixed(2),
        actHrs: +t.actHrs.toFixed(2),
        clientHrs: +clientHrs.toFixed(1),
        projEff,
        actualEff,
        gapHrs,
        gapStatus,
        achievedPct,
        leftPct,
        empCount: t.employees.size,
        projCount: t.projects.size,
        avgEff: t.reqHrs > 0 ? +(t.actHrs / t.reqHrs).toFixed(4) : 0,
      };
    }).sort((a, b) => b.spentHrs - a.spentHrs);
  }, [analyticsRows, employees, empMapData, projects, employeeRatioMap, tlTotalTargets]);

  const tlClientHrs = useMemo(() => {
    const m = {};
    teamLeadAnalytics.forEach((t) => { m[t.teamLead] = t.clientHrs; });
    return m;
  }, [teamLeadAnalytics]);

  // Achieved = Client Hrs (filtered by analytics period); Gap = Target − Client Hrs
  const activeAchieved = aTeamLead !== 'All' ? (tlClientHrs[aTeamLead] || 0) : aTotalClientHrs;

  const teamLeadTargetSum = useMemo(() => teamLeadAnalytics.reduce((s, t) => s + (tlTotalTargets[t.teamLead] || 0), 0), [teamLeadAnalytics, tlTotalTargets]);
  const teamLeadSpentSum = useMemo(() => teamLeadAnalytics.reduce((s, t) => s + t.spentHrs, 0), [teamLeadAnalytics]);
  const teamLeadClientSum = useMemo(() => teamLeadAnalytics.reduce((s, t) => s + t.clientHrs, 0), [teamLeadAnalytics]);
  const teamLeadGapSum = +(teamLeadTargetSum - teamLeadClientSum).toFixed(1);

  // ── Chart data ──────────────────────────────────────────────────────────
  const empChartData = empAnalytics.slice(0, 10).map((e) => ({
    name: e.empName,
    fullName: e.empName,
    spent: +(e.spentHrs / 60).toFixed(2),
    req: +(e.reqHrs / 60).toFixed(2),
    act: +(e.actHrs / 60).toFixed(2),
    avgEff: +(e.avgEff * 100).toFixed(2),
  }));

  const projChartData = projAnalytics.slice(0, 10).map((p) => ({
    name: p.projName.length > 20 ? p.projName.slice(0, 20) + '…' : p.projName,
    fullName: p.projName,
    spent: +(p.spentHrs / 60).toFixed(2),
    req: +(p.reqHrs / 60).toFixed(2),
    act: +(p.actHrs / 60).toFixed(2),
    clientHrs: p.clientHrs,
    projEff: +(p.projEff * 100).toFixed(2),
    actualEff: +(p.actualEff * 100).toFixed(2),
    avgEff: +(p.avgEff * 100).toFixed(2),
  }));

  const leadChartData = useMemo(() => teamLeadAnalytics.map((t) => ({
    teamLead: t.teamLead,
    clientHrs: t.clientHrs,
    spentHrs: +(t.spentHrs / 60).toFixed(2),
    reqHrs: +(t.reqHrs / 60).toFixed(2),
    actHrs: +(t.actHrs / 60).toFixed(2),
    projEff: +(t.projEff * 100).toFixed(2),
    actualEff: +(t.actualEff * 100).toFixed(2),
    avgEff: +(t.avgEff * 100).toFixed(2),
    target: tlTotalTargets[t.teamLead] || 0,
    pctAchieved: tlTotalTargets[t.teamLead] > 0 ? +Math.min(100, ((t.spentHrs / 60) / tlTotalTargets[t.teamLead]) * 100).toFixed(1) : 0,
    pctLeft: tlTotalTargets[t.teamLead] > 0 ? +Math.max(0, 100 - Math.min(100, ((t.spentHrs / 60) / tlTotalTargets[t.teamLead]) * 100)).toFixed(1) : 0,
  })), [teamLeadAnalytics, tlTotalTargets]);

  // Full chart data (all entries, not top-10)
  const empChartDataFull = useMemo(() => empAnalytics.map((e) => ({
    name: e.empName,
    fullName: e.empName,
    spent: +(e.spentHrs / 60).toFixed(2),
    req: +(e.reqHrs / 60).toFixed(2),
    act: +(e.actHrs / 60).toFixed(2),
    avgEff: +(e.avgEff * 100).toFixed(2),
  })), [empAnalytics]);

  const projChartDataFull = useMemo(() => projAnalytics.map((p) => ({
    name: p.projName.length > 20 ? p.projName.slice(0, 20) + '…' : p.projName,
    fullName: p.projName,
    spent: +(p.spentHrs / 60).toFixed(2),
    req: +(p.reqHrs / 60).toFixed(2),
    act: +(p.actHrs / 60).toFixed(2),
    clientHrs: p.clientHrs,
    projEff: +(p.projEff * 100).toFixed(2),
    actualEff: +(p.actualEff * 100).toFixed(2),
    avgEff: +(p.avgEff * 100).toFixed(2),
  })), [projAnalytics]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const openAdd = () => {
    const today = new Date().toISOString().slice(0, 10);
    setForm([String(rows.length + 1), today, '', '', '', '', '', '', '', '', '', '', '', '']);
    setModal(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.addProjectHours(form);
      toast.success('Entry added');
      setModal(false);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const bulkDelete = async (selectedData) => {
    if (!confirm(`Delete ${selectedData.length} entr${selectedData.length === 1 ? 'y' : 'ies'}? This cannot be undone.`)) return;
    try {
      const sheetRows = selectedData.map((d) => d.sheetRow);
      await api.bulkClearRows('PROJ_HOURS', sheetRows);
      toast.success(`${selectedData.length} entries deleted`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const openEditActEff = (row, sheetRow) => {
    const dec = parseFloat(row[10]) || 0;
    setEditingRow({ row, sheetRow, actEffVal: dec > 0 ? toHhmm(dec) : '' });
  };

  const saveActEff = async () => {
    if (!editingRow) return;
    const actEffHrs = parseHhmm(editingRow.actEffVal);
    if (isNaN(actEffHrs) || actEffHrs < 0) return toast.error('Enter time in HH:MM format (e.g. 07:30)');
    try {
      const newRow = [...editingRow.row];
      const spent = parseFloat(newRow[8]) || 0;
      const rawRatio = employeeRatioMap[newRow[2]] || 0.75;
      const ratio = rawRatio > 1 ? rawRatio / 100 : rawRatio;
      const reqEffHrs = +(spent * ratio).toFixed(2);
      newRow[9] = reqEffHrs;
      newRow[10] = actEffHrs;
      newRow[11] = reqEffHrs > 0 ? +(actEffHrs / reqEffHrs).toFixed(4) : 0;
      await api.bulkUpdate('PROJ_HOURS', [{ row: editingRow.sheetRow, values: newRow }]);
      toast.success('Act Eff Hrs updated');
      setEditingRow(null);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const F = (label, i) => (
    <div key={i}>
      <label className="label">{label}</label>
      <input className="input" value={form[i] ?? ''} onChange={(e) => setForm((f) => { const n = [...f]; n[i] = e.target.value; return n; })} />
    </div>
  );

  const exportToExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([PH_HEADERS, ...logRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Project Hours Log');
    const parts = [];
    if (filterEmp !== 'All') parts.push(filterEmp.replace(/\s+/g, '_'));
    if (filterProj !== 'All') parts.push(filterProj.replace(/\s+/g, '_'));
    if (filterTeamLead !== 'All') parts.push(filterTeamLead.replace(/\s+/g, '_'));
    const suffix = parts.length ? `_${parts.join('_')}` : '';
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Project_Hours_Log${suffix}_${date}.xlsx`);
  };

  const clearAnalyticsFilters = () => { setAEmp('All'); setAProj('All'); setAMonth('All'); setADept('All'); setAStatus('All'); setATeamLead('All'); setAType('All'); };
  const hasAnalyticsFilters = aEmp !== 'All' || aProj !== 'All' || aMonth !== 'All' || aDept !== 'All' || aStatus !== 'All' || aTeamLead !== 'All' || aType !== 'All';

  // ── Searchable select options ──────────────────────────────────────────
  const empSearchOptions = useMemo(() => {
    return (Array.isArray(employees) ? employees : []).map((e) => ({
      label: e[1] || '', empId: e[0] || '', dept: e[4] || '',
    })).filter((o) => o.label);
  }, [employees]);
  const projSearchOptions = useMemo(() => {
    return (Array.isArray(projects) ? projects : []).map((p) => ({
      label: p[1] || '', projId: p[0] || '', client: p[2] || '',
    })).filter((o) => o.label);
  }, [projects]);

  const renderCell = (colIndex, val, row, origIdx, sheetRow) => {
    if (colIndex === 8) {
      const v = parseFloat(val) || 0;
      return v > 0 ? toHhmm(v) : '—';
    }
    if (colIndex === 9) {
      const v = parseFloat(val) || 0;
      return v > 0 ? toHhmm(v) : '—';
    }
    if (colIndex === 10) {
      const v = parseFloat(val) || 0;
      return (
        <div className="flex items-center justify-between gap-2">
          <span>{v > 0 ? toHhmm(v) : '—'}</span>
          <button
            onClick={() => openEditActEff(row, sheetRow)}
            className="btn-secondary py-1 px-2 text-xs whitespace-nowrap"
          >
            Edit
          </button>
        </div>
      );
    }
    if (colIndex === 11) return <EffBadge val={parseFloat(val) || 0} />;
    return val;
  };

  return (
    <div className="page">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="page-title">Project Hours Log</h1>
          <p className="page-sub">{rows.length} total entries</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={load} className="btn-secondary"><RefreshCw size={14} /></button>
          {activeTab === 'log' && (
            <button onClick={exportToExcel} className="btn-secondary flex items-center gap-1.5">
              <Download size={14} /> <span className="hidden sm:inline">Export Excel</span>
            </button>
          )}
          <button onClick={openAdd} className="btn-primary flex items-center gap-1.5"><Plus size={14} /> Log Hours</button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl mb-5 w-fit max-w-full overflow-x-auto">
        <button
          onClick={() => setActiveTab('log')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'log' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <LayoutList size={14} /> Log
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'analytics' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <BarChart2 size={14} /> Analytics
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* LOG TAB                                                           */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'log' && (
        <>
          {loading ? <ProjectHoursSkeleton /> : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                <StatCard icon={Clock} bg="bg-indigo-50" color="text-indigo-600" label="Total Hours" value={toHhmm(totalHrs)} />
                <StatCard icon={Briefcase} bg="bg-emerald-50" color="text-emerald-600" label="Sessions" value={filteredRows.length} />
                <StatCard icon={Users} bg="bg-blue-50" color="text-blue-600" label="Employees" value={uniqueEmps} />
                <StatCard icon={TrendingUp} bg="bg-amber-50" color="text-amber-600" label="Avg Efficiency" value={avgEffDisplay} />
              </div>

              {/* Type breakdown */}
              <div className="card mb-5 py-3 px-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Breakdown by Type</p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    <span className="text-xs text-slate-500">Regular</span>
                    <span className="text-sm font-semibold text-slate-700">{toHhmm(typeBreakdown.regular)}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-xs text-amber-600">QC</span>
                    <span className="text-sm font-semibold text-amber-700">{toHhmm(typeBreakdown.qc)}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200">
                    <span className="w-2 h-2 rounded-full bg-sky-500" />
                    <span className="text-xs text-sky-600">Internal FB</span>
                    <span className="text-sm font-semibold text-sky-700">{toHhmm(typeBreakdown.intFb)}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200">
                    <span className="w-2 h-2 rounded-full bg-violet-500" />
                    <span className="text-xs text-violet-600">Client FB</span>
                    <span className="text-sm font-semibold text-violet-700">{toHhmm(typeBreakdown.clientFb)}</span>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="card mb-5 grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:items-end items-start">
                <div>
                  <label className="label">Employee</label>
                  <select className="input w-full sm:w-44" value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)}>
                    <option>All</option>
                    {logEmpOptions.map((e) => <option key={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Project</label>
                  <select className="input w-full sm:w-56" value={filterProj} onChange={(e) => setFilterProj(e.target.value)}>
                    <option value="All">All</option>
                    {logProjOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Team Lead</label>
                  <select className="input w-full sm:w-44" value={filterTeamLead} onChange={(e) => setFilterTeamLead(e.target.value)}>
                    <option>All</option>
                    {teamLeadOptionsLog.map((tl) => <option key={tl}>{tl}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Type</label>
                  <select className="input w-full sm:w-36" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option>All</option>
                    <option>Regular</option>
                    <option>QC</option>
                    <option>Internal FB</option>
                    <option>Client FB</option>
                  </select>
                </div>
                <div className="relative">
                  <label className="label">Date</label>
                  <div className="relative">
                    <button onClick={() => setDateOpen(!dateOpen)}
                      className="input w-full sm:w-36 text-left flex items-center justify-between gap-1 cursor-pointer">
                      <span className="truncate">{{ all: 'All', today: 'Today', yesterday: 'Yesterday', '7days': '7 Days', '30days': '30 Days', custom: 'Custom' }[logDatePreset]}</span>
                      <svg className={`w-3 h-3 text-slate-400 transition-transform ${dateOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {dateOpen && (
                      <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-xl min-w-[14rem] overflow-hidden">
                        {[
                          { key: 'all', label: 'All' },
                          { key: 'today', label: 'Today' },
                          { key: 'yesterday', label: 'Yesterday' },
                          { key: '7days', label: '7 Days' },
                          { key: '30days', label: '30 Days' },
                          { key: 'custom', label: 'Custom' },
                        ].map(({ key, label }) => (
                          <button key={key} type="button"
                            onClick={() => { setLogDatePreset(key); if (key !== 'custom') setDateOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${logDatePreset === key ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'}`}
                          >{label}</button>
                        ))}
                        {logDatePreset === 'custom' && (
                          <div className="px-3 pb-3 pt-1 border-t border-slate-100 flex flex-col gap-2">
                            <input type="date" className="input text-xs w-full" value={logDateFrom} onChange={(e) => setLogDateFrom(e.target.value)} />
                            <span className="text-xs text-slate-400 text-center">to</span>
                            <input type="date" className="input text-xs w-full" value={logDateTo} onChange={(e) => setLogDateTo(e.target.value)} />
                            <button type="button" onClick={() => setDateOpen(false)} className="btn-primary text-xs py-1">Apply</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {(filterEmp !== 'All' || filterProj !== 'All' || filterTeamLead !== 'All' || filterType !== 'All' || logDatePreset !== 'all') && (
                  <button className="btn-secondary text-xs self-end col-span-2 sm:col-auto w-fit" onClick={() => { setFilterEmp('All'); setFilterProj('All'); setFilterTeamLead('All'); setFilterType('All'); setLogDatePreset('all'); setLogDateFrom(''); setLogDateTo(''); setDateOpen(false); }}>
                    Clear Filters
                  </button>
                )}
                <div className="text-sm text-slate-500 self-end pb-2 ml-auto col-span-2 sm:col-auto text-right sm:text-left">
                  {filteredRows.length !== rows.length ? `${filteredRows.length} of ${rows.length}` : `${rows.length}`} entries
                </div>
              </div>

              <DataTable
                headers={PH_HEADERS}
                rows={logRows}
                rowIndices={filteredRowIndices}
                columnControl
                storageKey="project-hours"
                selectable
                alignments={sett.alignments['PROJ_HOURS'] || []}
                bulkActions={[{ label: 'Delete Selected', icon: Trash2, danger: true, onClick: bulkDelete }]}
                actions={{ renderCell }}
                mobileCard={(row, origIdx, isSelected, sheetRow) => (
                  <div className="space-y-1 text-xs" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="font-semibold text-slate-800 truncate">{row[3] || '—'}</div>
                        <div className="text-slate-400 text-[10px]">{row[1] || ''}</div>
                      </div>
                      <div className="shrink-0">{renderCell(11, row[11], row, origIdx, sheetRow)}</div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">
                      {row[6] && <span className="truncate max-w-[180px]">{row[6]}</span>}
                      {row[7] && <span>Client: {row[7]}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">
                      <span>Spent: {renderCell(8, row[8], row, origIdx, sheetRow)}</span>
                      <span>Req: {renderCell(9, row[9], row, origIdx, sheetRow)}</span>
                      <span>Act: {renderCell(10, row[10], row, origIdx, sheetRow)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-400">
                      {row[13] && <span>Lead: {row[13]}</span>}
                      {row[12] && <span className="truncate max-w-[160px]">{row[12]}</span>}
                    </div>
                  </div>
                )}
              />
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ANALYTICS TAB                                                     */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <>
          {/* Analytics filters */}
          <div className="card mb-5 grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:items-end items-start">
            <div>
              <label className="label">Month</label>
              <select className="input w-full sm:w-36" value={aMonth} onChange={(e) => setAMonth(e.target.value)}>
                <option value="All">All Months</option>
                {monthOptions.map((m) => <option key={m} value={m}>{fmtMonthLabel(m)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Employee</label>
              <select className="input w-full sm:w-44" value={aEmp} onChange={(e) => setAEmp(e.target.value)}>
                <option value="All">All Employees</option>
                {analyticsEmpOptions.map((e) => <option key={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Project</label>
              <select className="input w-full sm:w-52" value={aProj} onChange={(e) => setAProj(e.target.value)}>
                <option value="All">All Projects</option>
                {analyticsProjOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Department</label>
              <select className="input w-full sm:w-40" value={aDept} onChange={(e) => setADept(e.target.value)}>
                <option value="All">All Depts</option>
                {deptOptions.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Project Status</label>
              <select className="input w-full sm:w-40" value={aStatus} onChange={(e) => setAStatus(e.target.value)}>
                <option value="All">All Statuses</option>
                {statusOptions.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Team Lead</label>
              <select className="input w-full sm:w-44" value={aTeamLead} onChange={(e) => setATeamLead(e.target.value)}>
                <option value="All">All Team Leads</option>
                {teamLeadOptions.map((tl) => <option key={tl}>{tl}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input w-full sm:w-36" value={aType} onChange={(e) => setAType(e.target.value)}>
                <option value="All">All Types</option>
                <option>Regular</option>
                <option>QC</option>
                <option>Internal FB</option>
                <option>Client FB</option>
              </select>
            </div>
            <div className="col-span-2 sm:col-auto">
              <label className="label">Target Period</label>
              <div className="flex gap-1 items-center flex-wrap">
                <select
                  className="input w-full xs:w-28 text-xs"
                  value={targetAllMonths ? 'all' : String(aMonthIdx)}
                  onChange={(e) => {
                    if (e.target.value === 'all') { setTargetAllMonths(true); }
                    else { setTargetAllMonths(false); setAMonthIdx(parseInt(e.target.value)); }
                  }}
                >
                  <option value="all">All Months</option>
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <select
                  className={`input w-24 text-xs ${targetAllMonths ? 'opacity-40 pointer-events-none' : ''}`}
                  value={aYear}
                  onChange={(e) => setAYear(parseInt(e.target.value))}
                  disabled={targetAllMonths}
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => <option key={y}>{y}</option>)}
                </select>
              </div>
            </div>
            {hasAnalyticsFilters && (
              <button className="btn-secondary text-xs self-end col-span-2 sm:col-auto w-fit" onClick={clearAnalyticsFilters}>Clear Filters</button>
            )}
            <div className="text-sm text-slate-500 self-end pb-2 ml-auto col-span-2 sm:col-auto text-right sm:text-left">
              {analyticsRows.length !== rows.length ? `${analyticsRows.length} of ${rows.length}` : `${rows.length}`} entries
            </div>
          </div>

          {/* Analytics stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4 mb-6">
            <StatCard icon={Briefcase} bg="bg-blue-50" color="text-blue-600" label="Total Client Hrs" value={aTotalClientHrs > 0 ? `${aTotalClientHrs.toFixed(1)} h` : '—'} sub="client hrs" />
            <StatCard icon={Clock} bg="bg-indigo-50" color="text-indigo-600" label="Total Spent Time" value={toHhmm(aTotalSpent)} sub="spent hours" />
            <StatCard icon={Target} bg="bg-violet-50" color="text-violet-600" label="Req Eff Time" value={toHhmm(aTotalReq)} sub="req eff hrs" />
            <StatCard icon={BarChart2} bg="bg-cyan-50" color="text-cyan-600" label="Act Eff Time" value={toHhmm(aTotalAct)} sub="act eff hrs" />
            <StatCard icon={TrendingUp} bg="bg-amber-50" color="text-amber-600" label="Avg Efficiency" value={aAvgEffDisplay} />
            <StatCard icon={Users} bg="bg-emerald-50" color="text-emerald-600" label="Employees" value={aUniqueEmps} sub={`${analyticsRows.length} sessions`} />
            <StatCard icon={Briefcase} bg="bg-rose-50" color="text-rose-600" label="Projects" value={aUniqueProjs} />
          </div>

          {/* Type breakdown (analytics) */}
          <div className="card mb-6 py-3 px-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Breakdown by Type</p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-xs text-slate-500">Regular</span>
                <span className="text-sm font-semibold text-slate-700">{toHhmm(aTypeBreakdown.regular)}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs text-amber-600">QC</span>
                <span className="text-sm font-semibold text-amber-700">{toHhmm(aTypeBreakdown.qc)}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span className="text-xs text-sky-600">Internal FB</span>
                <span className="text-sm font-semibold text-sky-700">{toHhmm(aTypeBreakdown.intFb)}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200">
                <span className="w-2 h-2 rounded-full bg-violet-500" />
                <span className="text-xs text-violet-600">Client FB</span>
                <span className="text-sm font-semibold text-violet-700">{toHhmm(aTypeBreakdown.clientFb)}</span>
              </div>
            </div>
          </div>

          {/* Target Settings */}
          <div className="card mb-6">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Target size={15} /> Target Settings ({targetAllMonths ? 'All Months' : `${MONTHS[aMonthIdx]} ${aYear}`})
                <button onClick={() => setShowTargetSettings(!showTargetSettings)} className="ml-1 p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors" title={showTargetSettings ? 'Collapse' : 'Expand'}>
                  {showTargetSettings ? <X size={14} /> : <Target size={14} />}
                </button>
              </p>
              {showTargetSettings && (
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                    const dtVal = parseFloat(divisionTarget);
                    if (!dtVal || dtVal <= 0) return toast.error('Set a division target first');
                    const tlNames = teamLeadOptions.length ? teamLeadOptions : teamLeadAnalytics.map((t) => t.teamLead).filter(Boolean);
                    const totalCH = tlNames.reduce((s, tl) => s + (targetMonthTlClientHrs[tl] || 0), 0);
                    const dist = {};
                    if (totalCH <= 0) {
                      const per = dtVal / tlNames.length;
                      tlNames.forEach((tl) => { dist[tl] = parseFloat(per.toFixed(2)); });
                    } else {
                      let allocated = 0;
                      tlNames.forEach((tl, i) => {
                        if (i === tlNames.length - 1) dist[tl] = parseFloat((dtVal - allocated).toFixed(2));
                        else { const v = ((targetMonthTlClientHrs[tl] || 0) / totalCH) * dtVal; dist[tl] = parseFloat(v.toFixed(2)); allocated += v; }
                      });
                    }
                    setTeamTargets(dist);
                    toast.success('Targets auto-distributed');
                  }} className="btn-secondary text-xs">Auto-Distribute</button>
                  <button onClick={() => {
                    const key = `divTarget_${aYear}_${aMonthIdx}`;
                    localStorage.setItem(key, JSON.stringify({ divisionTarget, teamTargets }));
                    toast.success(`Targets saved for ${MONTHS[aMonthIdx]} ${aYear}`);
                  }} className="btn-primary text-xs"><Save size={12} /> Save</button>
                </div>
              )}
            </div>
            {showTargetSettings && (
              <>
                <div className="flex flex-wrap items-start gap-4 mb-4 p-3 bg-indigo-50 rounded-lg">
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Division Target (hrs)</label>
                    <input type="number" min="0" step="10" className="input w-36 text-sm font-semibold mt-1" value={divisionTarget} onChange={(e) => setDivisionTarget(e.target.value)} />
                  </div>
                  <div className="text-xs text-slate-500">
                    <p className="font-medium text-slate-700">Target: <span className="text-indigo-600">{dt.toFixed(1)} h</span></p>
                    <p>Client Hrs: <span className="text-emerald-600">{targetMonthClientHrs.toFixed(1)} h</span> · {dt > 0 ? `${(targetMonthClientHrs / dt * 100).toFixed(1)}%` : '—'}</p>
                  </div>
                  <div className="text-xs text-slate-500">
                    <p className="font-medium text-slate-700">Team Targets Sum: <span className="text-violet-600">{totalTargetSum.toFixed(1)} h</span></p>
                    <p>To deliver: <span className="text-blue-600">{Math.max(0, dt - targetMonthClientHrs).toFixed(1)} h</span> · {dt > 0 ? `${((dt - targetMonthClientHrs) / dt * 100).toFixed(1)}% left` : '—'}</p>
                  </div>
                </div>
                {(teamLeadOptions.length > 0 || teamLeadAnalytics.length > 0) && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-3 py-1.5 font-medium text-slate-500">Team Lead</th>
                          <th className="text-right px-3 py-1.5 font-medium text-slate-500">Client Hrs</th>
                          <th className="text-right px-3 py-1.5 font-medium text-slate-500">Target Hrs</th>
                          <th className="text-center px-3 py-1.5 font-medium text-slate-500">% Achieved</th>
                          <th className="text-center px-3 py-1.5 font-medium text-slate-500">% Left</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(teamLeadOptions.length ? teamLeadOptions : teamLeadAnalytics.map((t) => t.teamLead).filter(Boolean)).map((tl) => {
                          const ch = targetMonthTlClientHrs[tl] || 0;
                          const tgt = parseFloat(teamTargets[tl]) || 0;
                          const pct = tgt > 0 ? (ch / tgt) * 100 : 0;
                          const left = tgt > 0 ? Math.max(0, ((tgt - ch) / tgt) * 100) : 0;
                          return (
                            <tr key={tl} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="px-3 py-1.5 font-medium text-slate-700">{tl}</td>
                              <td className="px-3 py-1.5 text-right text-slate-600">{ch.toFixed(1)}</td>
                              <td className="px-3 py-1.5 text-right">
                                <input type="number" min="0" step="0.5" className="input w-20 text-xs text-right" value={teamTargets[tl] ?? ''} onChange={(e) => setTeamTargets((p) => ({ ...p, [tl]: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 }))} />
                              </td>
                              <td className={`px-3 py-1.5 text-center font-semibold ${pct >= 100 ? 'text-emerald-600' : pct >= 85 ? 'text-amber-600' : 'text-red-500'}`}>
                                {tgt > 0 ? `${Math.min(100, pct).toFixed(1)}%` : '—'}
                              </td>
                              <td className="px-3 py-1.5 text-center text-slate-500">{tgt > 0 ? `${left.toFixed(1)}%` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-semibold">
                          <td className="px-3 py-1.5">Total</td>
                          <td className="px-3 py-1.5 text-right text-emerald-600">{targetMonthClientHrs.toFixed(1)}</td>
                          <td className="px-3 py-1.5 text-right text-violet-600">{totalTargetSum.toFixed(1)}</td>
                          <td className={`px-3 py-1.5 text-center ${targetMonthClientHrs > 0 && totalTargetSum > 0 ? (targetMonthClientHrs / totalTargetSum >= 1 ? 'text-emerald-600' : 'text-amber-600') : ''}`}>
                            {totalTargetSum > 0 ? `${Math.min(100, (targetMonthClientHrs / totalTargetSum) * 100).toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-center text-slate-500">
                            {totalTargetSum > 0 ? `${Math.max(0, ((totalTargetSum - targetMonthClientHrs) / totalTargetSum) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}

          </div>

          {/* Target stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
            <StatCard icon={Briefcase} bg="bg-blue-50" color="text-blue-600" label="Total Client Hrs" value={aTotalClientHrs > 0 ? `${aTotalClientHrs.toFixed(1)} h` : '—'} sub={`${analyticsRows.length} sessions`} />
            {aTeamLead !== 'All' ? (
              <StatCard icon={Target} bg="bg-amber-50" color="text-amber-600" label={`${aTeamLead}'s Target (${targetAllMonths ? 'All Months' : `${MONTHS[aMonthIdx]} ${aYear}`})`} value={activeTarget > 0 ? `${activeTarget.toFixed(1)} h` : 'Not set'} sub="target hours" />
            ) : (
              <StatCard icon={Target} bg="bg-amber-50" color="text-amber-600" label={`Division Target (${targetAllMonths ? 'All Months' : `${MONTHS[aMonthIdx]} ${aYear}`})`} value={dt > 0 ? `${dt.toFixed(1)} h` : 'Not set'} sub="target hours" />
            )}
            <StatCard icon={TrendingUp} bg="bg-emerald-50" color="text-emerald-600" label={`Achieved (${targetAllMonths ? 'All Months' : `${MONTHS[aMonthIdx]} ${aYear}`})`} value={activeAchieved > 0 ? `${activeAchieved.toFixed(1)} h` : '—'} sub={activeTarget > 0 ? `${(activeAchieved / activeTarget * 100).toFixed(1)}% achieved` : ''} />
            <StatCard icon={BarChart2} bg="bg-blue-50" color="text-blue-600" label={`To Be Delivered (${targetAllMonths ? 'All Months' : `${MONTHS[aMonthIdx]} ${aYear}`})`} value={activeTarget > 0 ? `${Math.max(0, activeTarget - activeAchieved).toFixed(1)} h` : '—'} sub={activeTarget > 0 ? `${((activeTarget - activeAchieved) / activeTarget * 100).toFixed(1)}% remaining` : ''} />
            {aTeamLead !== 'All' ? (
              <StatCard icon={Target} bg="bg-violet-50" color="text-violet-600" label="Division Target" value={dt > 0 ? `${dt.toFixed(1)} h` : '—'} sub={`${totalTargetSum > 0 ? `${(activeTarget / totalTargetSum * 100).toFixed(1)}% of team sum` : ''}`} />
            ) : (
              <StatCard icon={Target} bg="bg-violet-50" color="text-violet-600" label="Team Targets Sum" value={totalTargetSum > 0 ? `${totalTargetSum.toFixed(1)} h` : '—'} sub={dt > 0 ? `${(totalTargetSum / dt * 100).toFixed(1)}% of div target` : ''} />
            )}
          </div>

          {/* View toggle: Employee vs Project vs Team Lead */}
          <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl mb-5 overflow-x-auto">
            <button
              onClick={() => setAnalyticsView('employee')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${analyticsView === 'employee' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Users size={14} /> Employee Wise
            </button>
            <button
              onClick={() => setAnalyticsView('project')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${analyticsView === 'project' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Briefcase size={14} /> Project Wise
            </button>
            <button
              onClick={() => setAnalyticsView('team-lead')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${analyticsView === 'team-lead' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Users size={14} /> Team Lead Wise
            </button>
          </div>

          {/* ── Employee Wise ─────────────────────────────────────────── */}
          {analyticsView === 'employee' && (
            <>
              {/* Table */}
              <div className="card overflow-x-auto mb-6">
                <p className="text-sm font-semibold text-slate-700 mb-4">Employee Performance ({empAnalytics.length})</p>
                <table className="min-w-[560px] w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th text-xs">Employee</th>
                      <th className="th text-xs">Dept</th>
                      <th className="th text-xs text-center">Sessions</th>
                      <th className="th text-xs text-right">Spent Hrs</th>
                      <th className="th text-xs text-right">Req Eff Hrs</th>
                      <th className="th text-xs text-right">Act Eff Hrs</th>
                      <th className="th text-xs text-center">Avg Eff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empAnalytics.length === 0 ? (
                      <tr><td colSpan={7} className="td text-center text-slate-400 py-6">No data for selected filters</td></tr>
                    ) : empAnalytics.map((e, i) => (
                      <tr key={i} className="tr">
                        <td className="td font-medium">
                          <p>{e.empName}</p>
                          <p className="text-slate-400 font-normal">{e.empId}</p>
                        </td>
                        <td className="td text-slate-500">{e.dept}</td>
                        <td className="td text-center text-slate-500">{e.sessions}</td>
                        <td className="td text-right font-semibold text-indigo-600">{toHhmm(e.spentHrs)}</td>
                        <td className="td text-right text-violet-600">{e.reqHrs > 0 ? toHhmm(e.reqHrs) : '—'}</td>
                        <td className="td text-right text-cyan-600">{e.actHrs > 0 ? toHhmm(e.actHrs) : '—'}</td>
                        <td className="td text-center"><EffBadge val={e.avgEff} /></td>
                      </tr>
                    ))}
                  </tbody>
                  {empAnalytics.length > 0 && (
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td className="td font-semibold" colSpan={2}>Total</td>
                        <td className="td text-center font-semibold">{empAnalytics.reduce((s, e) => s + e.sessions, 0)}</td>
                        <td className="td text-right font-semibold text-indigo-600">{toHhmm(aTotalSpent)}</td>
                        <td className="td text-right font-semibold text-violet-600">{aTotalReq > 0 ? toHhmm(aTotalReq) : '—'}</td>
                        <td className="td text-right font-semibold text-cyan-600">{aTotalAct > 0 ? toHhmm(aTotalAct) : '—'}</td>
                        <td className="td text-center"><EffBadge val={aAvgEff} /></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Charts */}
              {empChartDataFull.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Hours Comparison — Grouped */}
                  <div className="card">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Hours Comparison</p>
                    <ResponsiveContainer width="100%" height={Math.max(200, empChartDataFull.length * 36)}>
                      <BarChart data={empChartDataFull} layout="vertical" barSize={10} barGap={4} barCategoryGap="25%" margin={{ left: 0, right: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                        <Tooltip
                          formatter={(val, name) => [toHhmm(val * 60), name]}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="spent" name="Spent Hrs" fill="#6366f1" radius={[0, 2, 2, 0]} />
                        <Bar dataKey="req" name="Req Eff Hrs" fill="#8b5cf6" radius={[0, 2, 2, 0]} />
                        <Bar dataKey="act" name="Act Eff Hrs" fill="#06b6d4" radius={[0, 2, 2, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Efficiency Ranking */}
                  <div className="card">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Efficiency Ranking</p>
                    <ResponsiveContainer width="100%" height={Math.max(200, empChartDataFull.length * 36)}>
                      <BarChart data={[...empChartDataFull].sort((a, b) => b.avgEff - a.avgEff)} layout="vertical" barSize={10} margin={{ left: 0, right: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                        <Tooltip
                          formatter={(v) => [`${v}%`, 'Avg Eff']}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _}
                        />
                        <Bar dataKey="avgEff" name="Avg Eff %" radius={[0, 4, 4, 0]}>
                          {[...empChartDataFull].sort((a, b) => b.avgEff - a.avgEff).map((entry, i) => (
                            <Cell key={i} fill={entry.avgEff >= 100 ? '#10b981' : entry.avgEff >= 85 ? '#f59e0b' : '#ef4444'} />
                          ))}
                          <LabelList dataKey="avgEff" position="right" style={{ fontSize: 9, fill: '#64748b' }} formatter={(v) => `${v}%`} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-slate-400 mt-1">Colour: green ≥100% · amber 85–99% · red &lt;85%</p>
                  </div>

                  {/* Spent Hours Distribution — Pie / Bar toggle */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-slate-700">Spent Hours Distribution</p>
                      <button
                        onClick={() => setEmpDistChartType(empDistChartType === 'pie' ? 'bar' : 'pie')}
                        className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium transition-colors"
                      >
                        {empDistChartType === 'pie' ? 'Switch to Bar' : 'Switch to Pie'}
                      </button>
                    </div>
                    {empDistChartType === 'pie' ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={empChartDataFull} dataKey="spent" nameKey="fullName" cx="50%" cy="50%" outerRadius={100} innerRadius={55}
                            label={({ name, value }) => `${name}: ${toHhmm(value * 60)}`} labelLine={true}>
                            {empChartDataFull.map((_, i) => (
                              <Cell key={i} fill={['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#14b8a6'][i % 10]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => toHhmm(v * 60)} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(200, empChartDataFull.length * 36)}>
                        <BarChart data={[...empChartDataFull].sort((a, b) => b.spent - a.spent)} layout="vertical" barSize={10} margin={{ left: 0, right: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                          <Tooltip
                            formatter={(val) => [toHhmm(val * 60), 'Spent Hrs']}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _}
                          />
                          <Bar dataKey="spent" name="Spent Hrs" radius={[0, 4, 4, 0]}>
                            {[...empChartDataFull].sort((a, b) => b.spent - a.spent).map((_, i) => (
                              <Cell key={i} fill={['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#14b8a6'][i % 10]} />
                            ))}
                            <LabelList dataKey="spent" position="right" style={{ fontSize: 9, fill: '#64748b' }} formatter={(v) => toHhmm(v * 60)} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    {(() => { const t = [...empChartDataFull].sort((a, b) => b.spent - a.spent)[0]; return t ? <p className="text-xs text-slate-500 mt-2">Highest: <span className="font-semibold text-slate-700">{t.name}</span> — {toHhmm(t.spent * 60)}</p> : null; })()}
                  </div>

                  {/* Efficiency Distribution — Pie / Bar toggle */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-slate-700">Efficiency Distribution</p>
                      <button
                        onClick={() => setEmpEffDistChartType(empEffDistChartType === 'pie' ? 'bar' : 'pie')}
                        className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium transition-colors"
                      >
                        {empEffDistChartType === 'pie' ? 'Switch to Bar' : 'Switch to Pie'}
                      </button>
                    </div>
                    {empEffDistChartType === 'pie' ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={empChartDataFull} dataKey="avgEff" nameKey="fullName" cx="50%" cy="50%" outerRadius={100} innerRadius={55}
                            label={({ name, value }) => `${name}: ${value.toFixed(1)}%`} labelLine={true}>
                            {empChartDataFull.map((_, i) => (
                              <Cell key={i} fill={['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#14b8a6'][i % 10]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => `${v}%`} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(200, empChartDataFull.length * 36)}>
                        <BarChart data={[...empChartDataFull].sort((a, b) => b.avgEff - a.avgEff)} layout="vertical" barSize={10} margin={{ left: 0, right: 50 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                          <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                          <Tooltip
                            formatter={(v) => [`${v}%`, 'Avg Eff']}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _}
                          />
                          <Bar dataKey="avgEff" name="Avg Eff %" radius={[0, 4, 4, 0]}>
                            {[...empChartDataFull].sort((a, b) => b.avgEff - a.avgEff).map((entry, i) => (
                              <Cell key={i} fill={entry.avgEff >= 100 ? '#10b981' : entry.avgEff >= 85 ? '#f59e0b' : '#ef4444'} />
                            ))}
                            <LabelList dataKey="avgEff" position="right" style={{ fontSize: 9, fill: '#64748b' }} formatter={(v) => `${v}%`} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    <p className="text-xs text-slate-400 mt-1">Colour: green ≥100% · amber 85–99% · red &lt;85%</p>
                    {(() => { const t = [...empChartDataFull].sort((a, b) => b.avgEff - a.avgEff)[0]; return t ? <p className="text-xs text-slate-500 mt-1">Highest: <span className="font-semibold text-slate-700">{t.name}</span> — {t.avgEff}%</p> : null; })()}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Project Wise ──────────────────────────────────────────── */}
          {analyticsView === 'project' && (
            <>
              {/* Table */}
              <div className="card overflow-x-auto mb-6">
                <p className="text-sm font-semibold text-slate-700 mb-4">Project Performance ({projAnalytics.length})</p>
                <table className="min-w-[860px] w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th text-xs">Project</th>
                      <th className="th text-xs">Client</th>
                      <th className="th text-xs">Status</th>
                      <th className="th text-xs text-right">Client Hrs</th>
                      <th className="th text-xs text-center">Sessions</th>
                      <th className="th text-xs text-right">Spent Hrs</th>
                      <th className="th text-xs text-right">Req Eff Hrs</th>
                      <th className="th text-xs text-right">Act Eff Hrs</th>
                      <th className="th text-xs text-center">Proj Req Eff</th>
                      <th className="th text-xs text-center">Proj Act Eff</th>
                      <th className="th text-xs text-center">Emp Avg Eff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projAnalytics.length === 0 ? (
                      <tr><td colSpan={11} className="td text-center text-slate-400 py-6">No data for selected filters</td></tr>
                    ) : projAnalytics.map((p, i) => (
                      <tr key={i} className="tr">
                        <td className="td font-medium max-w-[160px]">
                          <p className="truncate" title={p.projName}>{p.projName}</p>
                          <p className="text-slate-400 font-normal">{p.projId}</p>
                        </td>
                        <td className="td text-slate-500 max-w-[100px] truncate" title={p.client}>{p.client}</td>
                        <td className="td text-slate-500">{p.status}</td>
                        <td className="td text-right text-blue-600 font-semibold">{p.clientHrs > 0 ? `${p.clientHrs.toFixed(1)} h` : '—'}</td>
                        <td className="td text-center text-slate-500">{p.sessions}</td>
                        <td className="td text-right font-semibold text-indigo-600">{toHhmm(p.spentHrs)}</td>
                        <td className="td text-right text-violet-600">{p.reqHrs > 0 ? toHhmm(p.reqHrs) : '—'}</td>
                        <td className="td text-right text-cyan-600">{p.actHrs > 0 ? toHhmm(p.actHrs) : '—'}</td>
                        <td className="td text-center"><EffBadge val={p.projEff} /></td>
                        <td className="td text-center"><EffBadge val={p.actualEff} /></td>
                        <td className="td text-center"><EffBadge val={p.avgEff} /></td>
                      </tr>
                    ))}
                  </tbody>
                  {projAnalytics.length > 0 && (
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td className="td font-semibold" colSpan={3}>Total</td>
                        <td className="td text-right font-semibold text-blue-600">{aTotalClientHrs > 0 ? `${aTotalClientHrs.toFixed(1)} h` : '—'}</td>
                        <td className="td text-center font-semibold">{projAnalytics.reduce((s, p) => s + p.sessions, 0)}</td>
                        <td className="td text-right font-semibold text-indigo-600">{toHhmm(aTotalSpent)}</td>
                        <td className="td text-right font-semibold text-violet-600">{aTotalReq > 0 ? toHhmm(aTotalReq) : '—'}</td>
                        <td className="td text-right font-semibold text-cyan-600">{aTotalAct > 0 ? toHhmm(aTotalAct) : '—'}</td>
                        <td className="td text-center"><EffBadge val={aTotalClientHrs > 0 && aTotalReq > 0 ? aTotalClientHrs / (aTotalReq / 60) : 0} /></td>
                        <td className="td text-center"><EffBadge val={aTotalClientHrs > 0 && aTotalSpent > 0 ? aTotalClientHrs / (aTotalSpent / 60) : 0} /></td>
                        <td className="td text-center"><EffBadge val={aAvgEff} /></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Charts */}
              {projChartDataFull.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Hours Comparison — Grouped */}
                  <div className="card">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Hours Comparison</p>
                    <ResponsiveContainer width="100%" height={Math.max(240, projChartDataFull.length * 44)}>
                      <BarChart data={projChartDataFull} layout="vertical" barSize={8} barGap={4} barCategoryGap="25%" margin={{ left: 0, right: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                        <Tooltip
                          formatter={(val, name) => [toHhmm(val * 60), name]}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="spent" name="Spent Hrs" fill="#6366f1" radius={[0, 2, 2, 0]} />
                        <Bar dataKey="req" name="Req Eff Hrs" fill="#8b5cf6" radius={[0, 2, 2, 0]} />
                        <Bar dataKey="act" name="Act Eff Hrs" fill="#06b6d4" radius={[0, 2, 2, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Efficiency Comparison — Grouped */}
                  <div className="card">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Efficiency Comparison</p>
                    <ResponsiveContainer width="100%" height={Math.max(240, projChartDataFull.length * 44)}>
                      <BarChart data={projChartDataFull} layout="vertical" barSize={8} barGap={6} barCategoryGap="25%" margin={{ left: 0, right: 120 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                        <Tooltip
                          formatter={(v, name) => [`${v}%`, name]}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="projEff" name="Proj Eff" fill="#10b981" radius={[0, 3, 3, 0]}>
                          <LabelList dataKey="projEff" position="right" style={{ fontSize: 9, fill: '#10b981', fontWeight: 600 }} formatter={(v) => `Proj Eff: ${v}%`} />
                        </Bar>
                        <Bar dataKey="actualEff" name="Actual Eff" fill="#f59e0b" radius={[0, 3, 3, 0]}>
                          <LabelList dataKey="actualEff" position="right" style={{ fontSize: 9, fill: '#f59e0b', fontWeight: 600 }} formatter={(v) => `Act Eff: ${v}%`} />
                        </Bar>
                        <Bar dataKey="avgEff" name="Avg Eff" fill="#6366f1" radius={[0, 3, 3, 0]}>
                          <LabelList dataKey="avgEff" position="right" style={{ fontSize: 9, fill: '#6366f1', fontWeight: 600 }} formatter={(v) => `Avg Eff: ${v}%`} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Client Hours Distribution — Pie / Bar toggle */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-slate-700">Client Hours Distribution</p>
                      <button
                        onClick={() => setProjClientChartType(projClientChartType === 'pie' ? 'bar' : 'pie')}
                        className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium transition-colors"
                      >
                        {projClientChartType === 'pie' ? 'Switch to Bar' : 'Switch to Pie'}
                      </button>
                    </div>
                    {projClientChartType === 'pie' ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={projChartDataFull} dataKey="clientHrs" nameKey="fullName" cx="50%" cy="50%" outerRadius={100} innerRadius={55}
                            label={({ name, value }) => `${name}: ${value}h`} labelLine={true}>
                            {projChartDataFull.map((_, i) => (
                              <Cell key={i} fill={['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#14b8a6'][i % 10]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => toHhmm(v * 60)} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(240, projChartDataFull.length * 44)}>
                        <BarChart data={[...projChartDataFull].sort((a, b) => b.clientHrs - a.clientHrs)} layout="vertical" barSize={8} barGap={6} barCategoryGap="25%" margin={{ left: 0, right: 50 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                          <Tooltip
                            formatter={(val) => [toHhmm(val * 60), 'Client Hrs']}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _}
                          />
                          <Bar dataKey="clientHrs" name="Client Hrs" radius={[0, 4, 4, 0]}>
                            {[...projChartDataFull].sort((a, b) => b.clientHrs - a.clientHrs).map((_, i) => (
                              <Cell key={i} fill={['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#14b8a6'][i % 10]} />
                            ))}
                            <LabelList dataKey="clientHrs" position="right" style={{ fontSize: 9, fill: '#64748b' }} formatter={(v) => toHhmm(v * 60)} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Proj Eff Ranking */}
                  <div className="card">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Project Efficiency Ranking</p>
                    <ResponsiveContainer width="100%" height={Math.max(240, projChartDataFull.length * 44)}>
                      <BarChart data={[...projChartDataFull].sort((a, b) => b.projEff - a.projEff)} layout="vertical" barSize={8} barGap={6} barCategoryGap="25%" margin={{ left: 0, right: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                        <Tooltip
                          formatter={(v) => [`${v}%`]}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || _}
                        />
                        <Bar dataKey="projEff" name="Proj Eff %" radius={[0, 4, 4, 0]}>
                          {[...projChartDataFull].sort((a, b) => b.projEff - a.projEff).map((entry, i) => (
                            <Cell key={i} fill={entry.projEff >= 100 ? '#10b981' : entry.projEff >= 85 ? '#f59e0b' : '#ef4444'} />
                          ))}
                          <LabelList dataKey="projEff" position="right" style={{ fontSize: 9, fill: '#64748b' }} formatter={(v) => `${v}%`} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-xs text-slate-400 mt-1">Colour: green ≥100% · amber 85–99% · red &lt;85%</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Team Lead Wise ────────────────────────────────────────── */}
          {analyticsView === 'team-lead' && (
            <>
              <div className="card">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-700">Team Lead Performance ({teamLeadAnalytics.length})</p>
                  <div className="relative" ref={tlColMenuRef}>
                    <button
                      onClick={() => setShowTlColMenu((v) => !v)}
                      className="btn-secondary btn-xs inline-flex items-center gap-2 px-3 py-1 rounded-full"
                    >
                      Columns
                    </button>
                    {showTlColMenu && (
                      <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border bg-white p-3 shadow-lg">
                        {tlColumnList.map((col) => (
                          <label key={col.key} className="flex items-center gap-2 text-xs mb-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={tlVisibleCols[col.key]}
                              onChange={() => setTlVisibleCols((prev) => ({ ...prev, [col.key]: !prev[col.key] }))}
                              className="h-4 w-4 rounded border-slate-300 text-slate-700"
                            />
                            {col.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[1400px] text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="th text-xs">Team Lead</th>
                        <th className={`th text-xs text-center ${tlVisibleCols.employees ? '' : 'hidden'}`}>Employees</th>
                        <th className={`th text-xs text-center ${tlVisibleCols.projects ? '' : 'hidden'}`}>Projects</th>
                        <th className={`th text-xs text-center ${tlVisibleCols.sessions ? '' : 'hidden'}`}>Sessions</th>
                        <th className={`th text-xs text-right ${tlVisibleCols.spentHrs ? '' : 'hidden'}`}>Spent Hrs</th>
                        <th className={`th text-xs text-right ${tlVisibleCols.reqHrs ? '' : 'hidden'}`}>Req Eff Hrs</th>
                        <th className={`th text-xs text-center ${tlVisibleCols.actHrs ? '' : 'hidden'}`}>Act Eff Hrs</th>
                        <th className={`th text-xs text-right ${tlVisibleCols.clientHrs ? '' : 'hidden'}`}>Client Hrs</th>
                        <th className={`th text-xs text-right ${tlVisibleCols.targetHrs ? '' : 'hidden'}`}>Target Hrs</th>
                        <th className={`th text-xs text-center ${tlVisibleCols.pctAchieved ? '' : 'hidden'}`}>% Achieved</th>
                        <th className={`th text-xs text-center ${tlVisibleCols.pctLeft ? '' : 'hidden'}`}>% Left</th>
                        <th className={`th text-xs text-center ${tlVisibleCols.gap ? '' : 'hidden'}`}>Gap</th>
                        <th className={`th text-xs text-center ${tlVisibleCols.projEff ? '' : 'hidden'}`}>Proj Req Eff</th>
                        <th className={`th text-xs text-center ${tlVisibleCols.actualEff ? '' : 'hidden'}`}>Proj Act Eff</th>
                        <th className={`th text-xs text-center ${tlVisibleCols.avgEff ? '' : 'hidden'}`}>Emp Avg Eff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamLeadAnalytics.length === 0 ? (
                        <tr><td colSpan={15} className="td text-center text-slate-400 py-6">No data for selected filters</td></tr>
                      ) : teamLeadAnalytics.map((t, i) => (
                        <tr key={i} className="tr">
                          <td className="td font-medium text-slate-700">{t.teamLead || '—'}</td>
                          <td className={`td text-center text-slate-500 ${tlVisibleCols.employees ? '' : 'hidden'}`}>{t.empCount}</td>
                          <td className={`td text-center text-slate-500 ${tlVisibleCols.projects ? '' : 'hidden'}`}>{t.projCount}</td>
                          <td className={`td text-center text-slate-500 ${tlVisibleCols.sessions ? '' : 'hidden'}`}>{t.sessions}</td>
                          <td className={`td text-right font-semibold text-indigo-600 ${tlVisibleCols.spentHrs ? '' : 'hidden'}`}>{toHhmm(t.spentHrs)}</td>
                          <td className={`td text-right text-violet-600 ${tlVisibleCols.reqHrs ? '' : 'hidden'}`}>{t.reqHrs > 0 ? toHhmm(t.reqHrs) : '—'}</td>
                          <td className={`td text-right text-cyan-600 ${tlVisibleCols.actHrs ? '' : 'hidden'}`}>{t.actHrs > 0 ? toHhmm(t.actHrs) : '—'}</td>
                          <td className={`td text-right font-semibold text-amber-600 ${tlVisibleCols.clientHrs ? '' : 'hidden'}`}>{t.clientHrs > 0 ? `${t.clientHrs.toFixed(1)} h` : '—'}</td>
                          <td className={`td text-right font-semibold text-violet-600 ${tlVisibleCols.targetHrs ? '' : 'hidden'}`}>{tlTotalTargets[t.teamLead] > 0 ? `${tlTotalTargets[t.teamLead].toFixed(1)} h` : '—'}</td>
                          <td className={`td text-center ${tlVisibleCols.pctAchieved ? '' : 'hidden'}`}>
                            {tlTotalTargets[t.teamLead] > 0 ? (
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${tlTotalTargets[t.teamLead] > 0 && t.achievedPct >= 100 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
                                {t.achievedPct.toFixed(1)}%
                              </span>
                            ) : '—'}
                          </td>
                          <td className={`td text-center text-slate-500 ${tlVisibleCols.pctLeft ? '' : 'hidden'}`}>
                            {tlTotalTargets[t.teamLead] > 0
                              ? `${t.leftPct.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className={`td text-center ${tlVisibleCols.gap ? '' : 'hidden'}`}>
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${t.gapStatus === 'Excellent' ? 'text-emerald-600 bg-emerald-50'
                              : t.gapStatus === 'On Track' ? 'text-indigo-600 bg-indigo-50'
                                : t.gapStatus === 'At Risk' ? 'text-amber-600 bg-amber-50'
                                  : 'text-red-600 bg-red-50'
                              }`}>
                              {t.gapHrs > 0 ? `+${t.gapHrs}` : t.gapHrs} h
                            </span>
                            <br />
                            <span className="text-[10px] text-slate-400">{t.gapStatus}</span>
                          </td>
                          <td className={`td text-center ${tlVisibleCols.projEff ? '' : 'hidden'}`}><EffBadge val={t.projEff} /></td>
                          <td className={`td text-center ${tlVisibleCols.actualEff ? '' : 'hidden'}`}><EffBadge val={t.actualEff} /></td>
                          <td className={`td text-center ${tlVisibleCols.avgEff ? '' : 'hidden'}`}><EffBadge val={t.avgEff} /></td>
                        </tr>
                      ))}
                    </tbody>
                    {teamLeadAnalytics.length > 0 && (
                      <tfoot className="bg-slate-50 border-t border-slate-200">
                        <tr>
                          <td className="td font-semibold">Total</td>
                          <td className={`td text-center font-semibold ${tlVisibleCols.employees ? '' : 'hidden'}`}>{new Set(teamLeadAnalytics.map((t) => t.teamLead)).size}</td>
                          <td className={`td ${tlVisibleCols.projects ? '' : 'hidden'}`} />
                          <td className={`td text-center font-semibold ${tlVisibleCols.sessions ? '' : 'hidden'}`}>{teamLeadAnalytics.reduce((s, t) => s + t.sessions, 0)}</td>
                          <td className={`td text-right font-semibold text-indigo-600 ${tlVisibleCols.spentHrs ? '' : 'hidden'}`}>{toHhmm(aTotalSpent)}</td>
                          <td className={`td text-right font-semibold text-violet-600 ${tlVisibleCols.reqHrs ? '' : 'hidden'}`}>{aTotalReq > 0 ? toHhmm(aTotalReq) : '—'}</td>
                          <td className={`td text-right font-semibold text-cyan-600 ${tlVisibleCols.actHrs ? '' : 'hidden'}`}>{aTotalAct > 0 ? toHhmm(aTotalAct) : '—'}</td>
                          <td className={`td text-right font-semibold text-amber-600 ${tlVisibleCols.clientHrs ? '' : 'hidden'}`}>{teamLeadClientSum > 0 ? `${teamLeadClientSum.toFixed(1)} h` : '—'}</td>
                          <td className={`td text-right font-semibold text-violet-600 ${tlVisibleCols.targetHrs ? '' : 'hidden'}`}>{teamLeadTargetSum > 0 ? `${teamLeadTargetSum.toFixed(1)} h` : '—'}</td>
                          <td className={`td text-center ${tlVisibleCols.pctAchieved ? '' : 'hidden'}`}>
                            {teamLeadTargetSum > 0 ? (
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${teamLeadClientSum / teamLeadTargetSum >= 1 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
                                {Math.min(100, (teamLeadClientSum / teamLeadTargetSum) * 100).toFixed(1)}%
                              </span>
                            ) : '—'}
                          </td>
                          <td className={`td text-center text-slate-500 ${tlVisibleCols.pctLeft ? '' : 'hidden'}`}>
                            {teamLeadTargetSum > 0
                              ? `${Math.max(0, ((teamLeadTargetSum - teamLeadClientSum) / teamLeadTargetSum) * 100).toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className={`td text-center ${tlVisibleCols.gap ? '' : 'hidden'}`}>
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${teamLeadGapSum <= 0 ? 'text-emerald-600 bg-emerald-50' : teamLeadTargetSum > 0 && teamLeadGapSum / teamLeadTargetSum < 0.1 ? 'text-indigo-600 bg-indigo-50' : teamLeadTargetSum > 0 && teamLeadGapSum / teamLeadTargetSum < 0.25 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'}`}>
                              {teamLeadGapSum > 0 ? `+${teamLeadGapSum}` : teamLeadGapSum.toFixed(1)} h
                            </span>
                            <br />
                            <span className="text-[10px] text-slate-400">{teamLeadTargetSum <= 0 ? 'Out of Track' : teamLeadGapSum <= 0 ? 'Excellent' : teamLeadGapSum / teamLeadTargetSum < 0.1 ? 'On Track' : teamLeadGapSum / teamLeadTargetSum < 0.25 ? 'At Risk' : 'Out of Track'}</span>
                          </td>
                          <td className={`td text-center ${tlVisibleCols.projEff ? '' : 'hidden'}`}><EffBadge val={aTotalReq > 0 ? +(teamLeadClientSum / (aTotalReq / 60)).toFixed(4) : 0} /></td>
                          <td className={`td text-center ${tlVisibleCols.actualEff ? '' : 'hidden'}`}><EffBadge val={aTotalSpent > 0 ? +(teamLeadClientSum / (aTotalSpent / 60)).toFixed(4) : 0} /></td>
                          <td className={`td text-center ${tlVisibleCols.avgEff ? '' : 'hidden'}`}><EffBadge val={aAvgEff} /></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── Division Target Composition ────────────────────── */}
          {dt > 0 && (
            <div className="card mb-6">
              <p className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2"><Target size={15} /> Division Target Composition ({targetAllMonths ? 'All Months' : `${MONTHS[aMonthIdx]} ${aYear}`})</p>
              <p className="text-xs text-slate-400 mb-3">Target: {dt.toFixed(1)} h · Client Hrs: {aTotalClientHrs.toFixed(1)} h · {((aTotalClientHrs / dt) * 100).toFixed(1)}% achieved</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="text-xs text-slate-500 mb-2 font-medium">Target Distribution by Team</p>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={Object.entries(tlTotalTargets).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={55}
                        label={({ name, value }) => `${name}: ${value}h`} labelLine={true}>
                        {Object.keys(tlTotalTargets).filter((k) => tlTotalTargets[k] > 0).map((_, i) => <Cell key={i} fill={['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#14b8a6'][i % 10]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v} h`, 'Target']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-2 font-medium">Target vs Client Hrs by Team</p>
                  <ResponsiveContainer width="100%" height={Math.max(200, leadChartData.length * 55)}>
                    <BarChart data={leadChartData} layout="vertical" barSize={10} barCategoryGap="30%" margin={{ left: 0, right: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="teamLead" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip formatter={(v) => toHhmm(v * 60)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="target" name="Target Hrs" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="clientHrs" name="Client Hrs" fill="#6366f1" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="spentHrs" name="Spent Hrs" fill="#10b981" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {leadChartData.filter((d) => d.target > 0).length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">% Target Reached by Team</p>
                  <ResponsiveContainer width="100%" height={Math.max(200, leadChartData.filter((d) => d.target > 0).length * 44)}>
                    <BarChart data={leadChartData.filter((d) => d.target > 0)} layout="vertical" barSize={18} margin={{ left: 0, right: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="teamLead" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip
                        formatter={(v, name) => [`${v}%`, name]}
                        contentStyle={{ fontSize: 11 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="pctAchieved" name="Achieved" stackId="tgt" radius={[0, 0, 0, 0]}>
                        {leadChartData.filter((d) => d.target > 0).map((entry, i) => (
                          <Cell key={i} fill={entry.pctAchieved >= 100 ? '#10b981' : entry.pctAchieved >= 85 ? '#f59e0b' : '#ef4444'} />
                        ))}
                        <LabelList dataKey="pctAchieved" position="insideRight" style={{ fontSize: 9, fill: '#fff', fontWeight: 600 }} formatter={(v) => v > 5 ? `${v}%` : ''} />
                      </Bar>
                      <Bar dataKey="pctLeft" name="Pending" stackId="tgt" fill="#e2e8f0" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="pctLeft" position="right" style={{ fontSize: 9, fill: '#94a3b8' }} formatter={(v) => v > 0 ? `${v}% left` : ''} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-slate-400 mt-1">Achieved: green ≥100% · amber 85–99% · red &lt;85% · Pending shown in grey</p>
                </div>
              )}
            </div>
          )}

          {/* ── Team Lead Charts ──────────────────────────────── */}
          {leadChartData.length > 0 && (
            <>
              {/* Row 1: Stacked Hours + Efficiency Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Hours Comparison — Grouped */}
                  <div className="card">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Hours Comparison</p>
                    <ResponsiveContainer width="100%" height={Math.max(200, leadChartData.length * 45)}>
                      <BarChart data={leadChartData} layout="vertical" barSize={12} barGap={4} barCategoryGap="25%" margin={{ left: 0, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="teamLead" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip formatter={(val) => toHhmm(val * 60)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="clientHrs" name="Client Hrs" fill="#6366f1" radius={[0, 2, 2, 0]} />
                        <Bar dataKey="spentHrs" name="Spent Hrs" fill="#f59e0b" radius={[0, 2, 2, 0]} />
                        <Bar dataKey="reqHrs" name="Req Eff Hrs" fill="#8b5cf6" radius={[0, 2, 2, 0]} />
                        <Bar dataKey="actHrs" name="Act Eff Hrs" fill="#06b6d4" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Efficiency Comparison — Grouped / Pie toggle */}
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-slate-700">Efficiency Comparison</p>
                    <button
                      onClick={() => setEffChartType(effChartType === 'bar' ? 'pie' : 'bar')}
                      className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium transition-colors"
                    >
                      {effChartType === 'bar' ? 'Switch to Pie' : 'Switch to Bar'}
                    </button>
                  </div>
                  {effChartType === 'bar' ? (
                    <ResponsiveContainer width="100%" height={Math.max(200, leadChartData.length * 45)}>
                      <BarChart data={leadChartData} layout="vertical" barSize={10} margin={{ left: 0, right: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                        <YAxis type="category" dataKey="teamLead" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="projEff" name="Proj Eff" fill="#10b981" radius={[0, 3, 3, 0]}>
                          <LabelList dataKey="projEff" position="right" style={{ fontSize: 9, fill: '#64748b' }} formatter={(v) => `${v}%`} />
                        </Bar>
                        <Bar dataKey="actualEff" name="Actual Eff" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                        <Bar dataKey="avgEff" name="Emp Avg Eff" fill="#6366f1" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          {/* Outer ring — Proj Eff (green shades) */}
                          <Pie data={leadChartData} dataKey="projEff" nameKey="teamLead" cx="50%" cy="50%"
                            outerRadius={130} innerRadius={100}
                            label={({ teamLead, projEff }) => `${teamLead}: ${projEff.toFixed(1)}%`} labelLine={false}>
                            {leadChartData.map((_, i) => (
                              <Cell key={i} fill={['#059669', '#10b981', '#34d399', '#6ee7b7', '#047857', '#065f46', '#a7f3d0', '#d1fae5', '#ecfdf5', '#bbf7d0'][i % 10]} />
                            ))}
                          </Pie>
                          {/* Middle ring — Actual Eff (amber shades) */}
                          <Pie data={leadChartData} dataKey="actualEff" nameKey="teamLead" cx="50%" cy="50%"
                            outerRadius={94} innerRadius={66} label={false}>
                            {leadChartData.map((_, i) => (
                              <Cell key={i} fill={['#d97706', '#f59e0b', '#fbbf24', '#fcd34d', '#b45309', '#92400e', '#fde68a', '#fef3c7', '#fffbeb', '#fef9c3'][i % 10]} />
                            ))}
                          </Pie>
                          {/* Inner ring — Emp Avg Eff (indigo shades) */}
                          <Pie data={leadChartData} dataKey="avgEff" nameKey="teamLead" cx="50%" cy="50%"
                            outerRadius={60} innerRadius={32} label={false}>
                            {leadChartData.map((_, i) => (
                              <Cell key={i} fill={['#4338ca', '#6366f1', '#818cf8', '#a5b4fc', '#3730a3', '#312e81', '#c7d2fe', '#e0e7ff', '#eef2ff', '#4f46e5'][i % 10]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v, name, props) => [`${v.toFixed(1)}%`, `${props.name} · ${name}`]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex justify-center gap-4 mt-1">
                        <span className="flex items-center gap-1 text-xs text-slate-600"><span className="inline-block w-3 h-3 rounded-full bg-emerald-600" /> Proj Eff (outer)</span>
                        <span className="flex items-center gap-1 text-xs text-slate-600"><span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> Actual Eff (mid)</span>
                        <span className="flex items-center gap-1 text-xs text-slate-600"><span className="inline-block w-3 h-3 rounded-full bg-indigo-600" /> Emp Avg Eff (inner)</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Row 2: Client Distribution + Proj Eff Ranking */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Client Hours Distribution — Donut */}
                <div className="card">
                  <p className="text-sm font-semibold text-slate-700 mb-3">Client Hours Distribution</p>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={leadChartData} dataKey="clientHrs" nameKey="teamLead" cx="50%" cy="50%" outerRadius={100} innerRadius={55}
                        label={({ teamLead, clientHrs }) => `${teamLead}: ${toHhmm(clientHrs * 60)}`} labelLine={true}>
                        {leadChartData.map((_, i) => (
                          <Cell key={i} fill={['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#14b8a6'][i % 10]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => toHhmm(v * 60)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Proj Eff Ranking */}
                <div className="card">
                  <p className="text-sm font-semibold text-slate-700 mb-3">Project Efficiency Ranking</p>
                  <ResponsiveContainer width="100%" height={Math.max(200, leadChartData.length * 45)}>
                    <BarChart data={[...leadChartData].sort((a, b) => b.projEff - a.projEff)} layout="vertical" barSize={12} margin={{ left: 0, right: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="teamLead" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Bar dataKey="projEff" name="Proj Eff %" radius={[0, 4, 4, 0]}>
                        {[...leadChartData].sort((a, b) => b.projEff - a.projEff).map((entry, i) => (
                          <Cell key={i} fill={entry.projEff >= 100 ? '#10b981' : entry.projEff >= 85 ? '#f59e0b' : '#ef4444'} />
                        ))}
                        <LabelList dataKey="projEff" position="right" style={{ fontSize: 9, fill: '#64748b' }} formatter={(v) => `${v}%`} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-slate-400 mt-1">Colour: green ≥100% · amber 85–99% · red &lt;85%</p>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Edit Act Eff Hrs modal */}
      {editingRow && (() => {
        const spent = parseFloat(editingRow.row[8]) || 0;
        const rawRatio = employeeRatioMap[editingRow.row[2]] || 0.75;
        const ratio = rawRatio > 1 ? rawRatio / 100 : rawRatio;
        const reqEff = +(spent * ratio).toFixed(2);
        const actParsed = parseHhmm(editingRow.actEffVal);
        const effPct = !isNaN(actParsed) && actParsed > 0 && reqEff > 0 ? (actParsed / reqEff * 100).toFixed(1) : null;
        return (
          <Modal title="Edit Actual Efficiency Hours" onClose={() => setEditingRow(null)}>
            <div className="space-y-4 mb-6">
              <div className="p-3 bg-indigo-50 rounded-lg text-sm text-indigo-700 font-medium">
                {editingRow.row[3]} · {editingRow.row[6]}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Spent Hrs</p>
                  <p className="font-semibold text-indigo-600">{toHhmm(spent)} <span className="text-slate-400 font-normal">({spent} h)</span></p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Req Eff Hrs</p>
                  <p className="font-semibold text-violet-600">{toHhmm(reqEff)} <span className="text-slate-400 font-normal">({reqEff} h)</span></p>
                </div>
              </div>
              <div>
                <label className="label">Act Eff Hrs (HH:MM) *</label>
                <input
                  type="text" placeholder="00:00" className="input text-center text-lg font-semibold"
                  value={editingRow.actEffVal}
                  onChange={(e) => setEditingRow({ ...editingRow, actEffVal: e.target.value })}
                />
                {effPct !== null && (
                  <p className="text-xs mt-1 font-medium text-emerald-600">Eff % preview: {effPct}%</p>
                )}
                <p className="text-xs text-slate-400 mt-1">Eff % auto-calculates as Act Eff Hrs ÷ Req Eff Hrs</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditingRow(null)} className="btn-secondary">Cancel</button>
              <button onClick={saveActEff} className="btn-primary">Save</button>
            </div>
          </Modal>
        );
      })()}

      {/* Add entry modal */}
      {modal && (
        <Modal title="Log Project Hours" onClose={() => setModal(false)} wide>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {F('#', 0)}
            {F('Date (YYYY-MM-DD)', 1)}
            <div>
              <label className="label">EMP ID</label>
              <input className="input bg-slate-50" value={form[2] ?? ''} readOnly placeholder="Auto-filled" />
            </div>
            <div>
              <label className="label">Employee Name</label>
              <SearchableSelect options={empSearchOptions} value={form[3] ?? ''} onSelect={(o) => setForm((f) => { const n = [...f]; n[2] = o.empId; n[3] = o.label; n[4] = o.dept; return n; })} placeholder="Type to search employee…" />
            </div>
            <div>
              <label className="label">Department</label>
              <input className="input bg-slate-50" value={form[4] ?? ''} readOnly placeholder="Auto-filled from employee" />
            </div>
            <div>
              <label className="label">Project ID</label>
              <input className="input bg-slate-50" value={form[5] ?? ''} readOnly placeholder="Auto-filled" />
            </div>
            <div>
              <label className="label">Project Name</label>
              <SearchableSelect options={projSearchOptions} value={form[6] ?? ''} onSelect={(o) => setForm((f) => { const n = [...f]; n[5] = o.projId; n[6] = o.label; n[7] = o.client; return n; })} placeholder="Type to search project…" />
            </div>
            <div>
              <label className="label">Client</label>
              <input className="input bg-slate-50" value={form[7] ?? ''} readOnly placeholder="Auto-filled from project" />
            </div>
            {F('Spent Hrs', 8)}
            {F('Req Eff Hrs', 9)}
            {F('Act Eff Hrs', 10)}
            {F('Eff %', 11)}
            {F('Remarks', 12)}
            <div>
              <label className="label">Team Lead</label>
              <select className="input" value={form[13] ?? ''} onChange={(e) => setForm((f) => { const n = [...f]; n[13] = e.target.value; return n; })}>
                <option value="">— Select —</option>
                {teamLeadOptionsLog.map((tl) => <option key={tl}>{tl}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
