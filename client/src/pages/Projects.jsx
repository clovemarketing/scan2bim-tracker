import { useEffect, useState, useMemo, useCallback } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, Briefcase, Clock, TrendingUp, CheckCircle2, Upload, Search, UserCheck, UserX, ChevronDown, ChevronRight, X, Save, Edit3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Badge from '../components/Badge';


const PROJ_H = [
  'Proj ID', 'Project Name', 'Client', 'Status', 'Team Lead',
  'Start (Day#)', 'End (Day#)', 'Client Hrs', 'Total Spent Hrs',
  'Req Eff Hrs', 'Act Eff Hrs', 'Remarks', 'Remaining Hrs',
  'Proj Efficiency', 'Proj Actual Eff',
  'Internal Feedback', 'Int. FB Count', 'Int. FB Hrs',
  'Client Feedback', 'Client FB Hrs', 'QA/QC',
];
const MAP_HEADERS = ['Map ID', 'Employee', 'EMP ID', 'Project', 'Proj ID', 'Role', 'Team Lead', 'Status'];
const MAP_STATUSES = ['Active', 'Completed', 'Removed'];
const toHhmm = (min) => {
  if (min == null || isNaN(min)) return '—';
  const sign = min < 0 ? '-' : '';
  const a = Math.abs(Math.round(min));
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
};

function useSettings() {
  const [s, setS] = useState({ projStatuses: [], roles: [], alignments: {} });
  useEffect(() => { api.settings().then(setS).catch(() => {}); }, []);
  return s;
}

function SearchableSelect({ value, onChange, employees, placeholder = 'Search by name or EMP ID…' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? employees.filter((e) =>
          (e[0] || '').toLowerCase().includes(q) || (e[1] || '').toLowerCase().includes(q)
        )
      : employees;
    return list.slice(0, 30);
  }, [employees, query]);
  return (
    <div className="relative">
      <input
        className="input"
        placeholder={placeholder}
        value={open ? query : (value || '')}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-52 overflow-y-auto">
          {value && (
            <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-xs text-slate-400 border-b border-slate-100"
              onMouseDown={() => { onChange(''); setOpen(false); }}>
              — Clear selection —
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">No employees found</div>
          ) : filtered.map((e, i) => (
            <button key={`${e[0] || ''}-${i}`} type="button"
              onMouseDown={() => { onChange(e[1]); setQuery(''); setOpen(false); }}
              className={`w-full text-left px-3 py-2 hover:bg-indigo-50 text-xs flex items-center gap-2 transition-colors ${value === e[1] ? 'bg-indigo-50' : ''}`}>
              <span className="font-mono text-slate-400 text-[10px] w-[4.5rem] shrink-0">{e[0]}</span>
              <span className="font-medium text-slate-700 truncate">{e[1]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeChecklist({ employees, selected, onToggle, onToggleAll, search, onSearchChange, title }) {
  const [expanded, setExpanded] = useState(false);
  const allSelected = employees.length > 0 && employees.every((e) => selected.has(e[0]));
  const someSelected = employees.some((e) => selected.has(e[0]));
  const empLookup = useMemo(() => {
    const m = {};
    employees.forEach((e) => { m[e[0]] = e; });
    return m;
  }, [employees]);
  const selectedList = useMemo(() =>
    [...selected].filter((id) => empLookup[id]).map((id) => empLookup[id]),
    [selected, empLookup]
  );
  return (
    <div className="border border-slate-200 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 flex-1 min-w-0">
          {expanded ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
          <span className="text-xs font-medium text-slate-700 truncate">{title}</span>
          <span className="shrink-0 text-xs font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full">{selected.size}</span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {!expanded && selected.size > 0 && (
            <button type="button" onClick={() => setExpanded(true)}
              className="p-1 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit selection">
              <Edit3 size={13} />
            </button>
          )}
          {expanded && (
            <button type="button" onClick={() => setExpanded(false)}
              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Save">
              <Save size={13} />
            </button>
          )}
        </div>
      </div>
      {!expanded && selectedList.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedList.map((e, i) => (
            <span key={`${e[0] || ''}-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-medium">
              {e[1]}
              <button type="button" onClick={() => onToggle(e[0])}
                className="hover:text-red-500 transition-colors">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      {expanded && (
        <div className="mt-2">
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9 text-sm" placeholder="Search employees…"
              value={search} onChange={(e) => onSearchChange(e.target.value)} />
          </div>
              <div className="border border-slate-200 rounded-xl max-h-40 overflow-auto">
            {employees.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-6">No employees found</p>
            ) : (
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 w-10">
                      <input type="checkbox" className="accent-indigo-600 cursor-pointer"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                        onChange={onToggleAll} />
                    </th>
                    <th className="text-left px-2 py-2 font-semibold text-slate-500">EMP ID</th>
                    <th className="text-left px-2 py-2 font-semibold text-slate-500">Name</th>
                    <th className="text-left px-2 py-2 font-semibold text-slate-500">Team Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e, i) => (
                    <tr key={`${e[0] || ''}-${i}`} className="tr hover:bg-indigo-50/30">
                      <td className="px-3 py-2">
                        <input type="checkbox" className="accent-indigo-600 cursor-pointer"
                          checked={selected.has(e[0])}
                          onChange={() => onToggle(e[0])} />
                      </td>
                      <td className="px-2 py-2 font-mono text-slate-400">{e[0]}</td>
                      <td className="px-2 py-2 text-slate-700">{e[1]}</td>
                      <td className="px-2 py-2 text-slate-400 text-[10px]">{e[3] || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} />;
}

function ProjectsSkeleton({ tab }) {
  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="space-y-2">
          <SkeletonBlock className="h-7 w-44" />
          <SkeletonBlock className="h-4 w-32" />
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-8 w-20 rounded-lg" />
          <SkeletonBlock className="h-8 w-28 rounded-lg" />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5">
        <SkeletonBlock className="h-8 w-24 rounded-lg" />
        <SkeletonBlock className="h-8 w-28 rounded-lg" />
      </div>

      {tab === 'projects' ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card flex items-center gap-3">
                <SkeletonBlock className="h-10 w-10 rounded-xl shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <SkeletonBlock className="h-3 w-16" />
                  <SkeletonBlock className="h-5 w-12" />
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="card mb-4">
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <SkeletonBlock className="h-3 w-14" />
                  <SkeletonBlock className="h-8 w-36" />
                </div>
              ))}
            </div>
          </div>

          {/* Summary cards */}
          <div className="mb-4">
            <SkeletonBlock className="h-3 w-32 mb-2" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 space-y-1.5">
                  <SkeletonBlock className="h-3 w-16" />
                  <SkeletonBlock className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 flex gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-3 flex-1" />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, r) => (
              <div key={r} className="flex gap-4 px-4 py-3 border-t border-slate-50">
                {Array.from({ length: 9 }).map((_, c) => (
                  <SkeletonBlock key={c} className="h-3 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Filters */}
          <div className="card mb-5">
            <div className="flex flex-wrap gap-4 items-end">
              {Array.from({ length: 3 }).map((_, i) => (
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
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-3 flex-1" />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="flex gap-4 px-4 py-3 border-t border-slate-50">
                {Array.from({ length: 8 }).map((_, c) => (
                  <SkeletonBlock key={c} className="h-3 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Projects({ toast }) {
  const sett = useSettings();

  // ── Tab ──
  const [tab, setTab] = useState('projects');

  // ── Projects tab state ──
  const [rows, setRows] = useState([]);
  const [rowIndices, setRowIndices] = useState([]);
  const [headers, setHeaders] = useState(PROJ_H);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [filterLead, setFilterLead] = useState('All');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(Array(21).fill(''));
  const [saving, setSaving] = useState(false);
  const [empRows, setEmpRows] = useState([]);
  const [empMapRows, setEmpMapRows] = useState([]);
  const [empMapIndices, setEmpMapIndices] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState(new Set());
  const [memberSearch, setMemberSearch] = useState('');
  const [qcMembers, setQcMembers] = useState(new Set());
  const [fbIntMembers, setFbIntMembers] = useState(new Set());
  const [fbClientMembers, setFbClientMembers] = useState(new Set());
  const [qcSearch, setQcSearch] = useState('');
  const [fbIntSearch, setFbIntSearch] = useState('');
  const [fbClientSearch, setFbClientSearch] = useState('');
  const [viewMode, setViewMode] = useState('hrs');

  const duplicateIdWarning = useMemo(() => {
    const entered = (form[0] || '').trim();
    if (!entered) return null;
    const dup = rows.find((r, i) => {
      if (modal?.mode === 'edit') {
        const sheetRow = rowIndices[i];
        if (sheetRow === modal.sheetRow) return false;
      }
      return (r[0] || '').trim().toLowerCase() === entered.toLowerCase();
    });
    if (!dup) return null;
    return {
      message: `Duplicate Proj ID — "${entered}" already exists for "${dup[1] || dup[0]}"`,
      existingProject: dup[1] || dup[0],
    };
  }, [form, rows, rowIndices, modal]);

  const getNextProjId = useCallback(() => {
    if (!rows.length) return 'PRJ001';
    let maxNum = 0;
    let prefix = 'PRJ';
    let digits = 3;
    rows.forEach((r) => {
      const id = (r[0] || '').trim();
      if (!id) return;
      const match = id.match(/^([A-Za-z-]*?)(\d+)$/);
      if (match) {
        const p = match[1] || '';
        const num = parseInt(match[2], 10);
        if (p) prefix = p;
        if (num > maxNum) { maxNum = num; digits = match[2].length; }
      }
    });
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(digits, '0')}`;
  }, [rows]);

  // ── Import state ──
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState('upload');
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [excelData, setExcelData] = useState([]);
  const [sheetDataMap, setSheetDataMap] = useState({});
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);

  // ── Assignments tab state ──
  const [mapEmployees, setMapEmployees] = useState([]);
  const [inProgressProjs, setInProgressProjs] = useState([]);
  const [projRowMap, setProjRowMap] = useState({});
  const [mapFilterLead, setMapFilterLead] = useState('All');
  const [mapFilterProj, setMapFilterProj] = useState('All');
  const [mapFilterStatus, setMapFilterStatus] = useState('Active');
  const [assignModal, setAssignModal] = useState(false);
  const [mapEditModal, setMapEditModal] = useState(null);
  const [assignForm, setAssignForm] = useState({ empId: '', projId: '', role: 'Engineer', teamLead: '', status: 'Active' });
  const [mapEditForm, setMapEditForm] = useState({ role: '', teamLead: '', status: '' });
  const [leadMappings, setLeadMappings] = useState([]);
  const [assignSelected, setAssignSelected] = useState(new Set());
  const [assignSearch, setAssignSearch] = useState('');

  const SYSTEM_COLS = ['Proj ID', 'Project Name', 'Client', 'Status', 'Team Lead', 'Start (Day#)', 'End (Day#)', 'Client Hrs', 'Total Spent Hrs', 'Req Eff Hrs', 'Act Eff Hrs', 'Proj Eff %', 'Remarks', 'Remaining Hrs'];
  const REQUIRED_COLS = [0, 1];

  const autoMapColumns = useCallback((hdrs) => {
    const map = {};
    SYSTEM_COLS.forEach((sysCol, sysIdx) => {
      const sysKey = sysCol.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matchIdx = hdrs.findIndex((exH) => {
        const exKey = (exH || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
        return exKey === sysKey || exKey.includes(sysKey) || sysKey.includes(exKey);
      });
      if (matchIdx >= 0) map[sysIdx] = matchIdx;
    });
    return map;
  }, []);

  const applySheet = useCallback((all, name) => {
    const sd = all[name];
    if (!sd) return;
    setExcelHeaders(sd.headers);
    setExcelData(sd.rows);
    setSelectedSheet(name);
    setMapping(autoMapColumns(sd.headers));
  }, [autoMapColumns]);

  const handleFileSelect = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const names = wb.SheetNames;
        if (!names.length) return toast.error('No sheets found in the Excel file');
        const all = {};
        names.forEach((n) => {
          const ws = wb.Sheets[n];
          const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
          all[n] = { headers: json[0] || [], rows: json.slice(1).filter((r) => r.some((c) => c !== '' && c != null)) };
        });
        setSheetDataMap(all);
        setSheetNames(names);
        applySheet(all, names[0]);
        setImportStep('mapping');
      } catch (err) { toast.error('Failed to parse Excel: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
  }, [applySheet]);

  const handleSheetChange = useCallback((name) => {
    applySheet(sheetDataMap, name);
  }, [sheetDataMap, applySheet]);

  const mappedRows = useMemo(() => {
    if (!excelData.length || !Object.keys(mapping).length) return [];
    return excelData.map((row) => {
      const sysRow = Array(SYSTEM_COLS.length).fill('');
      Object.entries(mapping).forEach(([sysIdx, exIdx]) => {
        sysRow[parseInt(sysIdx)] = row[exIdx] !== undefined ? String(row[exIdx]) : '';
      });
      return sysRow;
    });
  }, [excelData, mapping]);

  const doImport = async () => {
    if (!mappedRows.length) return toast.error('No data to import');
    const missing = REQUIRED_COLS.filter((i) => mapping[i] === undefined);
    if (missing.length) return toast.error('Please map required columns: ' + missing.map((i) => SYSTEM_COLS[i]).join(', '));
    setImporting(true);
    try {
      const res = await api.importProjects(mappedRows);
      toast.success(`${res.count} projects imported successfully`);
      setImportOpen(false);
      setImportStep('upload');
      setMapping({});
      load();
    } catch (e) { toast.error(e.message); }
    finally { setImporting(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [d, ed, em, ae, ip] = await Promise.all([
        api.projects(), api.employees(), api.empMap(),
        api.activeEmployees(), api.inProgressProjects(),
      ]);
      setHeaders(PROJ_H);
      setRows(d.data || []);
      setRowIndices(d.rowIndices || []);
      setEmpRows((ed.data || []).filter((r) => r[0] && r[1]));
      setEmpMapRows(em.data || []);
      setEmpMapIndices(em.rowIndices || []);
      setMapEmployees(ae || []);
      setInProgressProjs(ip || []);
      const rMap = {};
      (d.data || []).forEach((r, i) => { if (r[0]) rMap[r[0]] = (d.rowIndices || [])[i]; });
      setProjRowMap(rMap);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const STATUSES = sett.projStatuses.length ? sett.projStatuses : ['In Progress', 'Completed', 'On Hold', 'Not Started', 'Cancelled'];
  const roles = sett.roles?.length ? sett.roles : ['Lead', 'Engineer', 'Senior Engineer', 'Checker', 'Coordinator'];

  const empFullNameMap = useMemo(() => {
    const m = {};
    empRows.forEach((e) => {
      if (!e[1]) return;
      const full = e[1].trim();
      m[full.toLowerCase()] = full;
      const first = full.split(/\s+/)[0].toLowerCase();
      if (first && !m[first]) m[first] = full;
    });
    return m;
  }, [empRows]);

  const normLead = (v) => empFullNameMap[(v || '').toLowerCase().trim()] || v || '';

  const teamLeads = useMemo(() => {
    const fromProjects = rows.map((r) => normLead(r[4])).filter(Boolean);
    const fromEmployees = empRows.map((e) => normLead(e[3])).filter(Boolean);
    return [...new Set([...fromProjects, ...fromEmployees])].sort();
  }, [rows, empFullNameMap, empRows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== 'All' && r[3] !== filter) return false;
      if (filterLead !== 'All' && normLead(r[4]) !== filterLead) return false;
      return true;
    });
  }, [rows, filter, filterLead, empFullNameMap]);

  const filteredRowIndices = useMemo(() => {
    return rows.reduce((acc, r, i) => {
      const statusOk = filter === 'All' || r[3] === filter;
      const leadOk   = filterLead === 'All' || normLead(r[4]) === filterLead;
      if (statusOk && leadOk) acc.push(rowIndices[i]);
      return acc;
    }, []);
  }, [rows, rowIndices, filter, filterLead, empFullNameMap]);

  const stats = useMemo(() => {
    const clientHrs = rows.reduce((s, r) => s + (parseFloat(r[7]) || 0), 0);
    const spentHrs  = rows.reduce((s, r) => s + (parseFloat(r[8]) || 0), 0);
    return {
      total:      rows.length,
      inProgress: rows.filter((r) => r[3] === 'In Progress').length,
      completed:  rows.filter((r) => r[3] === 'Completed').length,
      clientHrs,
      remaining:  clientHrs - spentHrs / 60,
    };
  }, [rows]);

  const filteredStats = useMemo(() => {
    const clientHrs = filtered.reduce((s, r) => s + (parseFloat(r[7]) || 0), 0);
    const spentHrs  = filtered.reduce((s, r) => s + (parseFloat(r[8]) || 0), 0);
    const reqEffHrs = filtered.reduce((s, r) => s + (parseFloat(r[9]) || 0), 0);
    const actEffHrs = filtered.reduce((s, r) => s + (parseFloat(r[10]) || 0), 0);
    const reqVsClientPct = clientHrs > 0 ? (reqEffHrs / 60 / clientHrs) * 100 : 0;
    return {
      count:      filtered.length,
      clientHrs,
      spentHrs,
      reqEffHrs,
      actEffHrs,
      projEff:    reqEffHrs > 0 ? clientHrs / (reqEffHrs / 60) : 0,
      actualEff:  spentHrs  > 0 ? clientHrs / (spentHrs  / 60) : 0,
      gap:        clientHrs - spentHrs / 60,
      gapPct:     clientHrs > 0 ? ((clientHrs - spentHrs / 60) / clientHrs) * 100 : 0,
      reqVsClientPct,
      hrsAchievedPct: clientHrs > 0 ? (spentHrs / 60 / clientHrs) * 100 : 0,
    };
  }, [filtered]);

  // ── Projects actions ──
  const confirmDelete = async (row, sheetRow) => {
    const name = row[1] || row[0];
    if (!confirm(`Delete project "${name}" (${row[0]})? This cannot be undone.`)) return;
    try {
      await api.bulkClearRows('PROJECTS', [sheetRow]);
      const projId = row[0];
      const derivedIds = [projId];
      if (row[20] === 'Yes') derivedIds.push(`${projId}-QC`);
      if (row[15] === 'Yes') derivedIds.push(`${projId}-FB-Int`);
      if (row[18] === 'Yes') derivedIds.push(`${projId}-FB-Client`);
      const mapRowsToClear = empMapRows
        .map((m, i) => derivedIds.includes(m[4]) ? empMapIndices[i] : null)
        .filter(Boolean);
      if (mapRowsToClear.length) {
        await api.bulkClearRows('EMP_MAP', mapRowsToClear);
      }
      toast.success(`Project "${name}" deleted`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const openAdd = () => {
    const nextId = getNextProjId();
    const f = Array(21).fill('');
    f[0] = nextId;
    setForm(f);
    setSelectedMembers(new Set()); setMemberSearch(''); setQcMembers(new Set()); setFbIntMembers(new Set()); setFbClientMembers(new Set()); setQcSearch(''); setFbIntSearch(''); setFbClientSearch(''); setModal({ mode: 'add' });
  };
  const openEdit = (_displayRow, sheetRow) => {
    const idx = rowIndices.indexOf(sheetRow);
    const originalRow = idx >= 0 ? rows[idx] : _displayRow;
    const f = originalRow.slice(0, 12); while (f.length < 12) f.push('');
    f.push(originalRow[15] || '');
    f.push(originalRow[16] || '');
    f.push(originalRow[17] || '');
    f.push(originalRow[18] || '');
    f.push(originalRow[19] || '');
    f.push(originalRow[20] || '');
    f.push(originalRow[21] || '');  // 18 - QA/QC Assigned Person
    f.push(originalRow[22] || '');  // 19 - FB Internal Assigned Person
    f.push(originalRow[23] || '');  // 20 - FB Client Assigned Person
    const projId = f[0];
    const existing = new Set(empMapRows.filter((m) => m[4] === projId && m[8] === 'Active').map((m) => m[2]));
    if (existing.size === 0 && f[4]) {
      const leadLower = f[4].trim().toLowerCase();
      const byLead = empRows.filter((e) => (e[3] || '').trim().toLowerCase() === leadLower);
      byLead.forEach((e) => existing.add(e[0]));
    }
    setSelectedMembers(existing); setMemberSearch('');
    setQcMembers(new Set(empMapRows.filter((m) => m[4] === projId + '-QC' && m[8] === 'Active').map((m) => m[2])));
    setFbIntMembers(new Set(empMapRows.filter((m) => m[4] === projId + '-FB-Int' && m[8] === 'Active').map((m) => m[2])));
    setFbClientMembers(new Set(empMapRows.filter((m) => m[4] === projId + '-FB-Client' && m[8] === 'Active').map((m) => m[2])));
    setQcSearch(''); setFbIntSearch(''); setFbClientSearch('');
    setForm(f); setModal({ mode: 'edit', sheetRow });
  };

  const syncDerivedMembers = async (memberSet, leadName, derivedProjId, projName, existingDerivedMap) => {
    // Sync EMP_MAP entries for a derived project track (QC, FB-Int, FB-Client)
    if (!derivedProjId || !projName) return;
    const existingEntries = existingDerivedMap?.[derivedProjId] || [];
    const existingIds = new Set(existingEntries.map((m) => m[2]));
    // Add new members
    for (const empId of memberSet) {
      if (existingIds.has(empId)) continue;
      const emp = empRows.find((e) => e[0] === empId);
      if (!emp) continue;
      await api.assignEmp({ empName: emp[1], empId, projName: projName, projId: derivedProjId, role: '', teamLead: leadName || '' });
    }
    // Remove deselected members
    for (const m of existingEntries) {
      if (!memberSet.has(m[2])) {
        const idx = empMapRows.findIndex((e) => e[0] === m[0]);
        const sheetRow = idx >= 0 ? empMapIndices[idx] : null;
        if (sheetRow != null) {
          const updated = [...m]; updated[8] = 'Removed';
          await api.updateEmpMap(sheetRow, updated);
        }
      }
    }
  };

  const save = async () => {
    if (!form[0] || !form[1]) return toast.error('Proj ID and Project Name are required');

    const projId = form[0];
    const projName = form[1];

    // ── Duplicate Proj ID check ──
    const duplicate = rows.find((r, i) => {
      if (modal.mode === 'edit') {
        const sheetRow = rowIndices[i];
        if (sheetRow === modal.sheetRow) return false; // skip self
      }
      return (r[0] || '').trim().toLowerCase() === projId.trim().toLowerCase();
    });
    if (duplicate) {
      return toast.error(`Duplicate Proj ID: "${projId}" already exists for project "${duplicate[1] || duplicate[0]}". Please use a unique ID.`);
    }

    setSaving(true);
    try {

      // ── Add mode ──
      if (modal.mode === 'add') {
        await api.addProject(form);

        // Main project team members
        if (form[4] && selectedMembers.size > 0) {
          for (const empId of selectedMembers) {
            const emp = empRows.find((e) => e[0] === empId);
            if (!emp) continue;
            await api.assignEmp({ empName: emp[1], empId, projName, projId, role: '', teamLead: form[4] });
          }
        }

        // Derived track team members
        if (form[17] === 'Yes' && form[18] && qcMembers.size > 0) {
          for (const empId of qcMembers) {
            const emp = empRows.find((e) => e[0] === empId);
            if (!emp) continue;
            await api.assignEmp({ empName: emp[1], empId, projName: `${projName}-QC`, projId: `${projId}-QC`, role: '', teamLead: form[18] });
          }
        }
        if (form[12] === 'Yes' && form[19] && fbIntMembers.size > 0) {
          for (const empId of fbIntMembers) {
            const emp = empRows.find((e) => e[0] === empId);
            if (!emp) continue;
            await api.assignEmp({ empName: emp[1], empId, projName: `${projName}-FB-Int`, projId: `${projId}-FB-Int`, role: '', teamLead: form[19] });
          }
        }
        if (form[15] === 'Yes' && form[20] && fbClientMembers.size > 0) {
          for (const empId of fbClientMembers) {
            const emp = empRows.find((e) => e[0] === empId);
            if (!emp) continue;
            await api.assignEmp({ empName: emp[1], empId, projName: `${projName}-FB-Client`, projId: `${projId}-FB-Client`, role: '', teamLead: form[20] });
          }
        }

        toast.success('Project added');

      // ── Edit mode ──
      } else if (modal.mode === 'edit') {
        await api.updateProject(modal.sheetRow, form);

        // Build a lookup of existing EMP_MAP entries grouped by projId
        const existingDerivedMap = {};
        empMapRows.filter((m) => m[8] === 'Active').forEach((m) => {
          if (!existingDerivedMap[m[4]]) existingDerivedMap[m[4]] = [];
          existingDerivedMap[m[4]].push(m);
        });

        // Sync main project team
        const mainExisting = existingDerivedMap[projId] || [];
        const mainExistingIds = new Set(mainExisting.map((m) => m[2]));
        for (const empId of selectedMembers) {
          if (mainExistingIds.has(empId)) continue;
          const emp = empRows.find((e) => e[0] === empId);
          if (!emp) continue;
          await api.assignEmp({ empName: emp[1], empId, projName, projId, role: '', teamLead: form[4] });
        }
        for (const m of mainExisting) {
          if (!selectedMembers.has(m[2])) {
            const idx = empMapRows.findIndex((e) => e[0] === m[0]);
            const sheetRow = idx >= 0 ? empMapIndices[idx] : null;
            if (sheetRow != null) {
              const updated = [...m]; updated[8] = 'Removed';
              await api.updateEmpMap(sheetRow, updated);
            }
          }
        }

        // Sync derived track teams
        await syncDerivedMembers(qcMembers, form[18], `${projId}-QC`, `${projName}-QC`, existingDerivedMap);
        await syncDerivedMembers(fbIntMembers, form[19], `${projId}-FB-Int`, `${projName}-FB-Int`, existingDerivedMap);
        await syncDerivedMembers(fbClientMembers, form[20], `${projId}-FB-Client`, `${projName}-FB-Client`, existingDerivedMap);

        toast.success('Project updated');
      }
      setModal(null); load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const set = (i, v) => setForm((f) => { const n = [...f]; n[i] = v; return n; });

  const teamMembersUnderLead = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const lead = (form[4] || '').trim().toLowerCase();
    const byLead = lead ? empRows.filter((e) => (e[3] || '').trim().toLowerCase() === lead) : empRows;
    const pool = byLead.length > 0 ? byLead : empRows;
    return pool.filter((e) => {
      if (q && !e[0].toLowerCase().includes(q) && !e[1].toLowerCase().includes(q)) return false;
      return true;
    });
  }, [empRows, memberSearch, form]);

  const toggleMember = (empId) => {
    setSelectedMembers((prev) => {
      const n = new Set(prev);
      if (n.has(empId)) n.delete(empId); else n.add(empId);
      return n;
    });
  };

  const allMembersSelected = teamMembersUnderLead.length > 0 && teamMembersUnderLead.every((e) => selectedMembers.has(e[0]));
  const someMembersSelected = teamMembersUnderLead.some((e) => selectedMembers.has(e[0]));

  const statusCounts = STATUSES.reduce((a, s) => { a[s] = rows.filter((r) => r[3] === s).length; return a; }, {});

  const bulkSetStatus = async (selectedData, status) => {
    if (!confirm(`Set ${selectedData.length} project(s) to "${status}"?`)) return;
    try {
      const updates = selectedData.map((d) => {
        const idx = rowIndices.indexOf(d.sheetRow);
        const originalRow = idx >= 0 ? rows[idx] : d.row;
        return {
          row: d.sheetRow,
          values: originalRow.slice(0, 12).map((v, i) => (i === 3 ? status : (v ?? ''))),
        };
      });
      await api.bulkUpdate('PROJECTS', updates);
      toast.success(`${selectedData.length} projects updated to "${status}"`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const renderCell = (ci, val, row) => {
    if (ci === 3) return <Badge value={val} />;
    if (ci === 8 || ci === 9 || ci === 10) {
      const v = parseFloat(val);
      if (isNaN(v)) return <span className="text-slate-300">—</span>;
      return <span className="font-mono text-xs">{toHhmm(v)}</span>;
    }
    if (ci === 12) {
      let rem = parseFloat(val);
      if (isNaN(rem)) {
        const clientHrs = parseFloat(row?.[7]);
        const spentHrs  = parseFloat(row?.[8]);
        if (!isNaN(clientHrs) && clientHrs > 0 && !isNaN(spentHrs)) rem = clientHrs - spentHrs / 60;
        else return <span className="text-slate-300">—</span>;
      }
      return (
        <span className={`font-medium ${rem < 0 ? 'text-red-600' : rem === 0 ? 'text-slate-500' : rem < 20 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {rem < 0 ? `${toHhmm(rem * 60)} ▲` : toHhmm(rem * 60)}
        </span>
      );
    }
    if (ci === 13) {
      const ch = parseFloat(row?.[7]) || 0;
      const re = parseFloat(row?.[9]) || 0;
      const pct = re > 0 ? (ch / (re / 60)) * 100 : 0;
      if (!pct) return <span className="text-slate-300">—</span>;
      const cls = pct >= 100 ? 'text-emerald-600 bg-emerald-50' : pct >= 85 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
      return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{pct.toFixed(1)}%</span>;
    }
    if (ci === 14) {
      const ch = parseFloat(row?.[7]) || 0;
      const sp = parseFloat(row?.[8]) || 0;
      const pct = sp > 0 ? (ch / (sp / 60)) * 100 : 0;
      if (!pct) return <span className="text-slate-300">—</span>;
      const cls = pct >= 100 ? 'text-emerald-600 bg-emerald-50' : pct >= 85 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
      return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{pct.toFixed(1)}%</span>;
    }
    if (ci === 15) {
      if (val === 'Yes') return <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">Yes</span>;
      return <span className="text-slate-300">—</span>;
    }
    if (ci === 16) {
      const n = parseInt(val);
      if (!n) return <span className="text-slate-300">—</span>;
      return <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-semibold">{n}</span>;
    }
    if (ci === 17) {
      const h = parseFloat(val);
      if (!h) return <span className="text-slate-300">—</span>;
      return <span className="text-slate-700 font-mono text-xs">{h.toFixed(1)} h</span>;
    }
    if (ci === 18) {
      if (val === 'Yes') return <span className="inline-block px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold">Yes</span>;
      return <span className="text-slate-300">—</span>;
    }
    if (ci === 19) {
      const h = parseFloat(val);
      if (!h) return <span className="text-slate-300">—</span>;
      return <span className="text-violet-700 font-mono text-xs font-semibold">{h.toFixed(1)} h</span>;
    }
    if (ci === 20) {
      if (val === 'Yes') return <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">QA/QC</span>;
      return <span className="text-slate-300">—</span>;
    }
    return val;
  };

  // ── Assignments tab computed values ──
  const empTlMap = useMemo(() => {
    const m = {};
    mapEmployees.forEach((e) => { if (e[0]) m[e[0]] = e[3] || ''; });
    return m;
  }, [mapEmployees]);

  const mapAllLeads = useMemo(() => {
    const fromMap = empMapRows.map((m) => m[10]).filter(Boolean);
    const fromEmp = mapEmployees.map((e) => e[3]).filter(Boolean);
    return [...new Set([...fromMap, ...fromEmp])].sort();
  }, [empMapRows, mapEmployees]);

  const mapDisplayed = useMemo(() => empMapRows.filter((m) => {
    if (mapFilterLead !== 'All') {
      const tl = m[10] || empTlMap[m[2]] || '';
      if (tl !== mapFilterLead) return false;
    }
    if (mapFilterProj !== 'All' && m[4] !== mapFilterProj) return false;
    if (mapFilterStatus !== 'All' && m[8] !== mapFilterStatus) return false;
    return true;
  }), [empMapRows, mapFilterLead, mapFilterProj, mapFilterStatus, empTlMap]);

  const mapDisplayRows = useMemo(
    () => mapDisplayed.map((m) => [m[0], m[1], m[2], m[3], m[4], m[5], m[10] || empTlMap[m[2]] || '—', m[8]]),
    [mapDisplayed, empTlMap]
  );

  const allProjsInMap = useMemo(() => {
    const seen = new Set();
    return empMapRows.filter((m) => { if (seen.has(m[4])) return false; seen.add(m[4]); return true; })
      .map((m) => ({ id: m[4], name: m[3] || m[4] }));
  }, [empMapRows]);

  const mapRowIdxMap = useMemo(() => {
    const m = {};
    empMapRows.forEach((r, i) => { if (r[0]) m[r[0]] = empMapIndices[i]; });
    return m;
  }, [empMapRows, empMapIndices]);

  const mapDisplayRowIndices = useMemo(
    () => mapDisplayed.map((m) => mapRowIdxMap[m[0]] || 0),
    [mapDisplayed, mapRowIdxMap]
  );

  const assignedEmpIds = useMemo(() => {
    if (!assignForm.projId) return new Set();
    return new Set(empMapRows.filter((m) => m[4] === assignForm.projId && m[8] === 'Active').map((m) => m[2]));
  }, [empMapRows, assignForm.projId]);

  const assignAvailableEmps = useMemo(() => {
    if (!assignForm.projId) return [];
    return mapEmployees.filter((e) => !assignedEmpIds.has(e[0]));
  }, [mapEmployees, assignedEmpIds, assignForm.projId]);

  const filteredAssignEmps = useMemo(() => {
    if (!assignSearch.trim()) return assignAvailableEmps;
    const q = assignSearch.trim().toLowerCase();
    return assignAvailableEmps.filter((e) =>
      (e[0] || '').toLowerCase().includes(q) ||
      (e[1] || '').toLowerCase().includes(q) ||
      (e[4] || '').toLowerCase().includes(q)
    );
  }, [assignAvailableEmps, assignSearch]);

  const allAssignFilteredSelected = filteredAssignEmps.length > 0 && filteredAssignEmps.every((e) => assignSelected.has(e[0]));
  const someAssignFilteredSelected = filteredAssignEmps.some((e) => assignSelected.has(e[0]));

  // ── Assignments tab actions ──
  const mapSetStatus = async (origIdx, newStatus) => {
    try {
      const m = mapDisplayed[origIdx];
      const sheetRow = mapRowIdxMap[m[0]];
      if (!sheetRow) return;
      const updated = [...m]; updated[8] = newStatus;
      await api.updateEmpMap(sheetRow, updated);
      toast.success(`Assignment ${newStatus === 'Active' ? 'activated' : 'deactivated'}`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const openMapEdit = (origIdx) => {
    const m = mapDisplayed[origIdx];
    const sheetRow = mapRowIdxMap[m[0]] || 0;
    setMapEditModal({ origIdx, mapping: m, sheetRow });
    setMapEditForm({ role: m[5], teamLead: m[10], status: m[8] });
  };

  const saveMapEdit = async () => {
    setSaving(true);
    try {
      const updated = [...mapEditModal.mapping];
      updated[5] = mapEditForm.role;
      updated[10] = mapEditForm.teamLead;
      updated[8] = mapEditForm.status;
      await api.updateEmpMap(mapEditModal.sheetRow, updated);
      toast.success('Assignment updated');
      setMapEditModal(null);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const assignEmpToProj = async () => {
    if (!assignForm.projId || assignSelected.size === 0) return toast.error('Select project and at least one employee');
    setSaving(true);
    try {
      const proj = inProgressProjs.find((p) => p[0] === assignForm.projId);
      let count = 0;
      for (const empId of assignSelected) {
        const emp = mapEmployees.find((e) => e[0] === empId);
        if (!emp) continue;
        const alreadyMapped = empMapRows.some((m) => m[2] === empId && m[4] === assignForm.projId && m[8] === 'Active');
        if (alreadyMapped) continue;
        await api.assignEmp({
          empName: emp[1], empId: emp[0], projName: proj[1], projId: proj[0],
          role: assignForm.role, teamLead: assignForm.teamLead || proj[4] || '',
        });
        count++;
      }
      toast.success(`${count} employee${count !== 1 ? 's' : ''} assigned to "${proj[1]}"`);
      if (assignForm.teamLead && projRowMap[assignForm.projId]) {
        const projFullRow = rows.find((r) => r[0] === assignForm.projId);
        if (projFullRow && projFullRow[4] !== assignForm.teamLead) {              const f = [...projFullRow.slice(0, 12), projFullRow[15] || '', projFullRow[16] || '', projFullRow[17] || '', projFullRow[18] || '', projFullRow[19] || '', projFullRow[20] || '', projFullRow[21] || '', projFullRow[22] || '', projFullRow[23] || ''];
          f[4] = assignForm.teamLead;
          await api.updateProject(projRowMap[assignForm.projId], f).catch(() => {});
        }
      }
      setAssignModal(false);
      setAssignForm({ empId: '', projId: '', role: 'Engineer', teamLead: '', status: 'Active' });
      setAssignSelected(new Set());
      setLeadMappings([]);
      setAssignSearch('');
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const empBulkSetStatus = async (selectedData, status) => {
    if (!confirm(`Set ${selectedData.length} assignment(s) to "${status}"?`)) return;
    try {
      const updates = selectedData.map((d) => {
        const origIdx = mapDisplayRowIndices.indexOf(d.sheetRow);
        if (origIdx === -1) return null;
        const m = mapDisplayed[origIdx];
        if (!m) return null;
        const updated = [...m]; updated[8] = status;
        return { row: d.sheetRow, values: updated };
      }).filter(Boolean);
      await api.bulkUpdate('EMP_MAP', updates);
      toast.success(`${updates.length} assignments set to "${status}"`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-sub !mb-0">
            {tab === 'projects'
              ? `${rows.length} total · Remaining Hrs = Client Hrs − Spent`
              : `${empMapRows.length} assignments · assign employees to projects`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-100 rounded-lg p-0.5 mr-1">
            <button onClick={() => setTab('projects')}
              className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-all ${tab === 'projects' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              Projects
            </button>
            <button onClick={() => setTab('assignments')}
              className={`px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-all ${tab === 'assignments' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              Assignments
            </button>
          </div>
          <button onClick={load} className="btn-secondary px-2.5 sm:px-4"><RefreshCw size={14} /></button>
          {tab === 'projects' && (
            <>
              <button onClick={() => setImportOpen(true)} className="btn-secondary"><Upload size={14} /> <span className="hidden sm:inline">Import</span></button>
              <button onClick={openAdd} className="btn-primary"><Plus size={14} /> <span className="hidden sm:inline">Add Project</span></button>
            </>
          )}
          {tab === 'assignments' && (
            <button onClick={() => setAssignModal(true)} className="btn-primary"><Plus size={14} /> <span className="hidden sm:inline">Assign Employee</span></button>
          )}
        </div>
      </div>

      {/* ── Projects tab ── */}
      {tab === 'projects' && (
        <>
          {loading ? <ProjectsSkeleton tab="projects" /> : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
                <div className="card flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 rounded-lg"><Briefcase size={16} className="text-indigo-600" /></div>
                  <div>
                    <p className="text-xs text-slate-500">Total Projects</p>
                    <p className="text-xl font-bold text-slate-800">{stats.total}</p>
                  </div>
                </div>
                <div className="card flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg"><TrendingUp size={16} className="text-blue-600" /></div>
                  <div>
                    <p className="text-xs text-slate-500">In Progress</p>
                    <p className="text-xl font-bold text-blue-700">{stats.inProgress}</p>
                  </div>
                </div>
                <div className="card flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 rounded-lg"><CheckCircle2 size={16} className="text-emerald-600" /></div>
                  <div>
                    <p className="text-xs text-slate-500">Completed</p>
                    <p className="text-xl font-bold text-emerald-700">{stats.completed}</p>
                  </div>
                </div>
                <div className="card flex items-center gap-3">
                  <div className="p-2 bg-violet-50 rounded-lg"><Clock size={16} className="text-violet-600" /></div>
                  <div>
                    <p className="text-xs text-slate-500">Total Client Hrs</p>
                    <p className="text-xl font-bold text-slate-800">{stats.clientHrs.toFixed(0)} h</p>
                  </div>
                </div>
                <div className="card flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${stats.remaining < 0 ? 'bg-red-50' : 'bg-amber-50'}`}>
                    <Clock size={16} className={stats.remaining < 0 ? 'text-red-600' : 'text-amber-600'} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Remaining Hrs</p>
                    <p className={`text-xl font-bold ${stats.remaining < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                      {stats.remaining.toFixed(0)} h
                    </p>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                <div className="flex gap-2 flex-wrap items-center">
                  {['All', ...STATUSES].map((s) => (
                    <button key={s} onClick={() => setFilter(s)}
                      className={`px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-medium border transition-all ${filter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                      {s} {s !== 'All' && <span className="opacity-60">({statusCounts[s] || 0})</span>}
                    </button>
                  ))}
                </div>
                <div className="sm:ml-auto flex items-center gap-2 w-full sm:w-auto">
                  <label className="text-xs text-slate-500 font-medium whitespace-nowrap shrink-0">Team Lead</label>
                  <select className="input flex-1 sm:w-48 text-xs" value={filterLead} onChange={(e) => setFilterLead(e.target.value)}>
                    <option value="All">All Team Leads</option>
                    {teamLeads.map((l) => <option key={l}>{l}</option>)}
                  </select>
                  {(filter !== 'All' || filterLead !== 'All') && (
                    <button className="btn-secondary text-xs shrink-0" onClick={() => { setFilter('All'); setFilterLead('All'); }}>Clear</button>
                  )}
                </div>
              </div>

              {/* Filter-aware summary */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block"></span>
                    {filter === 'All' && filterLead === 'All'
                      ? 'All projects summary'
                      : `Filtered: ${[filter !== 'All' ? filter : '', filterLead !== 'All' ? filterLead : ''].filter(Boolean).join(' · ')}`}
                  </p>
                  <div className="flex bg-slate-100 rounded-lg p-0.5">
                    <button onClick={() => setViewMode('hrs')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'hrs' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                      Hrs
                    </button>
                    <button onClick={() => setViewMode('pct')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'pct' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                      %
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {[
                    { label: 'Projects', value: `${filteredStats.count} / ${stats.total}`, cls: 'text-slate-800' },
                    { label: 'Client Hrs', value: viewMode === 'hrs' ? `${filteredStats.clientHrs.toFixed(0)} h` : '100%', cls: 'text-violet-700' },
                    { label: 'Spent Hrs', value: viewMode === 'hrs' ? toHhmm(filteredStats.spentHrs) : `${filteredStats.hrsAchievedPct.toFixed(1)}%`, cls: 'text-indigo-700' },
                    { label: 'Req Eff Hrs', value: toHhmm(filteredStats.reqEffHrs), cls: 'text-slate-700' },
                    {
                      label: 'Proj Eff %',
                      value: filteredStats.reqEffHrs > 0 ? `${(filteredStats.projEff * 100).toFixed(1)}%` : '—',
                      cls: filteredStats.projEff >= 1 ? 'text-emerald-600' : filteredStats.projEff >= 0.85 ? 'text-amber-600' : filteredStats.projEff > 0 ? 'text-red-600' : 'text-slate-400',
                    },
                    {
                      label: 'Proj Actual Eff',
                      value: filteredStats.actEffHrs > 0 ? `${(filteredStats.actualEff * 100).toFixed(1)}%` : '—',
                      cls: filteredStats.actualEff >= 1 ? 'text-emerald-600' : filteredStats.actualEff >= 0.85 ? 'text-amber-600' : filteredStats.actualEff > 0 ? 'text-red-600' : 'text-slate-400',
                    },
                    {
                      label: 'Req Eff / Client',
                      value: filteredStats.clientHrs > 0
                        ? (viewMode === 'hrs'
                            ? `${toHhmm(filteredStats.reqEffHrs)} / ${filteredStats.clientHrs.toFixed(0)} h`
                            : `${filteredStats.reqVsClientPct.toFixed(1)}%`)
                        : '—',
                      cls: filteredStats.reqVsClientPct <= 0 ? 'text-slate-400'
                        : filteredStats.reqVsClientPct <= 100 ? 'text-emerald-600'
                        : filteredStats.reqVsClientPct <= 115 ? 'text-amber-600'
                        : 'text-red-600',
                    },
                    {
                      label: 'Hrs Gap',
                      value: filteredStats.clientHrs > 0
                        ? (viewMode === 'hrs' ? toHhmm(filteredStats.gap * 60) : `${filteredStats.gapPct.toFixed(1)}%`)
                        : '—',
                      cls: filteredStats.gapPct < 0 ? 'text-red-600' : filteredStats.gapPct === 0 ? 'text-slate-400' : 'text-emerald-600',
                    },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className={`text-base font-bold ${cls}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <DataTable
                headers={headers}
                rows={filtered}
                rowIndices={filteredRowIndices}
                columnControl
                storageKey="projects"
                selectable
                defaultHiddenCols={[8, 9, 10, 15, 16, 17, 18, 19, 20]}
                alignments={sett.alignments['PROJECTS'] || []}
                bulkActions={[
                  { label: 'Mark Completed', onClick: (sel) => bulkSetStatus(sel, 'Completed') },
                  { label: 'Mark On Hold', onClick: (sel) => bulkSetStatus(sel, 'On Hold') },
                  { label: 'Mark Cancelled', danger: true, onClick: (sel) => bulkSetStatus(sel, 'Cancelled') },
                ]}
                actions={{
                  renderCell,
                  renderRow: (row, sheetRow) => (
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(row, sheetRow)} className="btn-secondary py-1 px-2 text-xs gap-1">
                        <Pencil size={11} /> Edit
                      </button>
                      <button onClick={() => confirmDelete(row, sheetRow)} className="btn-secondary py-1 px-2 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ),
                }}
                mobileCard={(row, origIdx, isSelected, sheetRow) => (
                  <div className="space-y-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="font-semibold text-slate-800 truncate">{row[1] || '—'}</div>
                        <div className="text-slate-400 font-mono text-[10px]">{row[0] || ''}</div>
                      </div>
                      <div className="shrink-0">{renderCell(3, row[3], row)}</div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">
                      {row[2] && <span>Client: {row[2]}</span>}
                      {row[4] && <span>Lead: {row[4]}</span>}
                      {parseFloat(row[7]) > 0 && <span>Hrs: {parseFloat(row[7]).toFixed(0)}h</span>}
                    </div>
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-50 mt-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-slate-400">Rem: {renderCell(12, row[12], row)}</span>
                        <span className="text-slate-400">Eff: {renderCell(13, row[13], row)}</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(row, sheetRow)} className="btn-secondary py-1 px-2 text-xs gap-1">
                          <Pencil size={11} /> Edit
                        </button>
                        <button onClick={() => confirmDelete(row, sheetRow)} className="btn-secondary py-1 px-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              />
            </>
          )}
        </>
      )}

      {/* ── Assignments tab ── */}
      {tab === 'assignments' && (
        <>
          {loading ? <ProjectsSkeleton tab="assignments" /> : (
            <>
              <div className="card mb-5 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 sm:items-end">
                <div className="w-full sm:w-auto">
                  <label className="label">Team Lead</label>
                  <select className="input w-full sm:w-40" value={mapFilterLead} onChange={(e) => setMapFilterLead(e.target.value)}>
                    <option>All</option>
                    {mapAllLeads.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div className="w-full sm:w-auto">
                  <label className="label">Project</label>
                  <select className="input w-full sm:w-56" value={mapFilterProj} onChange={(e) => setMapFilterProj(e.target.value)}>
                    <option>All</option>
                    {allProjsInMap.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="w-full sm:w-auto">
                  <label className="label">Status</label>
                  <select className="input w-full sm:w-32" value={mapFilterStatus} onChange={(e) => setMapFilterStatus(e.target.value)}>
                    <option>All</option>
                    {MAP_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="text-sm text-slate-500 self-end pb-2 sm:ml-auto">{mapDisplayed.length} results</div>
              </div>

              <DataTable
                headers={MAP_HEADERS}
                rows={mapDisplayRows}
                rowIndices={mapDisplayRowIndices}
                columnControl
                storageKey="emp-map"
                selectable
                defaultHiddenCols={[2, 4]}
                alignments={(sett.alignments || {})['EMP_MAP'] || []}
                bulkActions={[
                  { label: 'Activate', icon: UserCheck, onClick: (sel) => empBulkSetStatus(sel, 'Active') },
                  { label: 'Remove', icon: UserX, danger: true, onClick: (sel) => empBulkSetStatus(sel, 'Removed') },
                ]}
                actions={{
                  renderCell: (ci, val) => ci === 7 ? <Badge value={val} /> : val,
                  renderRow: (row, sheetRow) => {
                    const origIdx = mapDisplayRowIndices.indexOf(sheetRow);
                    if (origIdx === -1) return null;
                    const isActive = mapDisplayed[origIdx]?.[8] === 'Active';
                    return (
                      <>
                        <button onClick={() => openMapEdit(origIdx)} className="btn-secondary py-1 px-2 text-xs gap-1">
                          <Pencil size={11} /> Edit
                        </button>
                        <button
                          onClick={() => mapSetStatus(origIdx, isActive ? 'Removed' : 'Active')}
                          className={`btn py-1 px-2 text-xs gap-1 ${isActive ? 'btn-secondary text-red-600 border-red-100 hover:bg-red-50' : 'btn-secondary text-emerald-600 border-emerald-100 hover:bg-emerald-50'}`}
                        >
                          {isActive ? <><UserX size={11} /> Remove</> : <><UserCheck size={11} /> Activate</>}
                        </button>
                      </>
                    );
                  },
                }}
                mobileCard={(row, origIdx, isSelected, sheetRow) => {
                  const mOrigIdx = mapDisplayRowIndices.indexOf(sheetRow);
                  const isActive = mOrigIdx !== -1 ? mapDisplayed[mOrigIdx]?.[8] === 'Active' : false;
                  return (
                    <div className="space-y-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 leading-tight">
                          <div className="font-semibold text-slate-800 truncate">{row[1] || '—'}</div>
                          <div className="text-slate-400 font-mono text-[10px]">{row[2] || ''}</div>
                        </div>
                        <div className="shrink-0">{row[7] ? <Badge value={row[7]} /> : <span className="text-slate-300">—</span>}</div>
                      </div>
                      <div className="text-slate-500">
                        <span>{row[3] || '—'}</span>
                        {row[4] && <span className="text-slate-400 ml-1 font-mono text-[10px]">({row[4]})</span>}
                      </div>
                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-50 mt-0.5">
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">
                          {row[5] && <span>Role: {row[5]}</span>}
                          {row[6] && <span>Lead: {row[6]}</span>}
                        </div>
                        {mOrigIdx !== -1 && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openMapEdit(mOrigIdx)} className="btn-secondary py-1 px-1.5 text-xs">
                              <Pencil size={10} />
                            </button>
                            <button onClick={() => mapSetStatus(mOrigIdx, isActive ? 'Removed' : 'Active')}
                              className={`btn py-1 px-1.5 text-xs ${isActive ? 'btn-secondary text-red-600 border-red-100 hover:bg-red-50' : 'btn-secondary text-emerald-600 border-emerald-100 hover:bg-emerald-50'}`}>
                              {isActive ? <UserX size={10} /> : <UserCheck size={10} />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
            </>
          )}
        </>
      )}

      {/* ── Project form modal ── */}
      {modal && (
        <Modal title={modal.mode === 'add' ? 'Add Project' : 'Edit Project'} onClose={() => setModal(null)} wide>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {[['Proj ID', 0], ['Project Name', 1], ['Client', 2]].map(([l, i]) => (
              <div key={i}>
                <label className="label">{l}</label>
                <input className={`input ${i === 0 && duplicateIdWarning ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : ''}`}
                  value={form[i] ?? ''} onChange={(e) => set(i, e.target.value)} />
                {i === 0 && duplicateIdWarning && (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <span>⚠️</span> {duplicateIdWarning.message}
                  </p>
                )}
              </div>
            ))}
            <div>
              <label className="label">Status</label>
              <select className="input" value={form[3]} onChange={(e) => set(3, e.target.value)}>
                <option value="">— Select —</option>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Team Lead</label>
              <SearchableSelect value={form[4]} onChange={(v) => {
                set(4, v);
                const vl = (v || '').trim().toLowerCase();
                setSelectedMembers(new Set(empRows.filter((e) => (e[3] || '').trim().toLowerCase() === vl).map((e) => e[0])));
              }} employees={empRows} />
            </div>
            {form[4] && (
              <div className="col-span-1 sm:col-span-3">
                <EmployeeChecklist
                  employees={teamMembersUnderLead}
                  selected={selectedMembers}
                  onToggle={toggleMember}
                  onToggleAll={() => {
                    setSelectedMembers((prev) => {
                      const n = new Set(prev);
                      if (allMembersSelected) teamMembersUnderLead.forEach((e) => n.delete(e[0]));
                      else teamMembersUnderLead.forEach((e) => n.add(e[0]));
                      return n;
                    });
                  }}
                  search={memberSearch}
                  onSearchChange={setMemberSearch}
                  title={`Employees (team: ${form[4]})`}
                />
              </div>
            )}
            <div><label className="label">Client Hrs</label><input className="input" type="number" value={form[7] ?? ''} onChange={(e) => set(7, e.target.value)} /></div>

            {modal.mode === 'edit' && (
              <div className="col-span-1 sm:col-span-3">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-3 mt-1 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
                  Auto-calculated from logged hours — read only
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  {[['Start (Day#)', 5], ['End (Day#)', 6], ['Total Spent Hrs', 8], ['Req Eff Hrs', 9], ['Act Eff Hrs', 10]].map(([l, i]) => (
                    <div key={i}>
                      <label className="label text-slate-400">{l}</label>
                      <div className="input bg-slate-50 text-slate-500 cursor-not-allowed select-none">
                        {form[i] !== '' && form[i] != null ? (i >= 8 && i <= 10 ? toHhmm(parseFloat(form[i])) : form[i]) : <span className="text-slate-300">—</span>}
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="label text-slate-400">Project Efficiency</label>
                    <div className="input bg-slate-50 text-slate-500 cursor-not-allowed select-none">
                      {(() => {
                        const ch = parseFloat(form[7]) || 0;
                        const re = parseFloat(form[9]) || 0;
                        return re > 0 ? `${(ch / (re / 60) * 100).toFixed(1)}%` : <span className="text-slate-300">—</span>;
                      })()}
                    </div>
                  </div>
                  <div>
                    <label className="label text-slate-400">Project Actual Eff</label>
                    <div className="input bg-slate-50 text-slate-500 cursor-not-allowed select-none">
                      {(() => {
                        const ch = parseFloat(form[7]) || 0;
                        const sp = parseFloat(form[8]) || 0;
                        return sp > 0 ? `${(ch / (sp / 60) * 100).toFixed(1)}%` : <span className="text-slate-300">—</span>;
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="col-span-1 sm:col-span-3"><label className="label">Remarks</label><input className="input" value={form[11] ?? ''} onChange={(e) => set(11, e.target.value)} /></div>

            <div className="col-span-1 sm:col-span-3">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-3 mt-1 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-violet-400"></span>
                Feedback &amp; QA/QC
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {/* Col 1: Internal Feedback */}
                <div className="col-span-1 sm:col-span-1">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" className="accent-indigo-600 w-4 h-4 cursor-pointer"
                      checked={form[12] === 'Yes'}
                      onChange={(e) => { set(12, e.target.checked ? 'Yes' : ''); if (!e.target.checked) { set(13, ''); set(14, ''); setFbIntMembers(new Set()); } }} />
                    <span className="text-sm font-medium text-slate-700">Internal Feedback</span>
                  </label>
                  {form[12] === 'Yes' && (
                    <div className="pl-6 flex flex-col gap-2">
                      <div>
                        <label className="label text-xs">Internal Feedbacks Count</label>
                        <input className="input" type="number" min="0" placeholder="0"
                          value={form[13] ?? ''} onChange={(e) => set(13, e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-xs">Internal Feedback Hrs</label>
                        <input className="input" type="number" min="0" step="0.5" placeholder="0.0"
                          value={form[14] ?? ''} onChange={(e) => set(14, e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-xs">FB Internal Lead</label>
                        <SearchableSelect value={form[19]} onChange={(v) => { set(19, v); setFbIntMembers(new Set(empRows.filter((e) => e[3] === v).map((e) => e[0]))); }} employees={empRows} placeholder="Assign lead for FB Internal…" />
                      </div>
                    </div>
                  )}
                </div>
                {/* Col 2: Client Feedback */}
                <div className="col-span-1 sm:col-span-1">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" className="accent-violet-600 w-4 h-4 cursor-pointer"
                      checked={form[15] === 'Yes'}
                      onChange={(e) => { set(15, e.target.checked ? 'Yes' : ''); if (!e.target.checked) { set(16, ''); setFbClientMembers(new Set()); } }} />
                    <span className="text-sm font-medium text-slate-700">Client Feedback</span>
                  </label>
                  {form[15] === 'Yes' && (
                    <div className="pl-6 flex flex-col gap-2">
                      <div>
                        <label className="label text-xs">Client Feedback Hrs</label>
                        <input className="input" type="number" min="0" step="0.5" placeholder="0.0"
                          value={form[16] ?? ''} onChange={(e) => set(16, e.target.value)} />
                      </div>
                      <div>
                        <label className="label text-xs">FB Client Lead</label>
                        <SearchableSelect value={form[20]} onChange={(v) => { set(20, v); setFbClientMembers(new Set(empRows.filter((e) => e[3] === v).map((e) => e[0]))); }} employees={empRows} placeholder="Assign lead for FB Client…" />
                      </div>
                    </div>
                  )}
                </div>
                {/* Col 3: QA/QC */}
                <div className="col-span-1 sm:col-span-1">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" className="accent-amber-600 w-4 h-4 cursor-pointer"
                      checked={form[17] === 'Yes'}
                      onChange={(e) => { set(17, e.target.checked ? 'Yes' : ''); if (!e.target.checked) { set(18, ''); setQcMembers(new Set()); } }} />
                    <span className="text-sm font-medium text-slate-700">Send to QA/QC Team</span>
                  </label>
                  {form[17] === 'Yes' && (
                    <div className="pl-6 flex flex-col gap-2">
                      <div>
                        <label className="label text-xs">QA/QC Lead</label>
                        <SearchableSelect value={form[18]} onChange={(v) => { set(18, v); setQcMembers(new Set(empRows.filter((e) => e[3] === v).map((e) => e[0]))); }} employees={empRows} placeholder="Assign lead for QA/QC…" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Employee selection tables below the grid */}
              {form[12] === 'Yes' && form[19] && (
                <div className="col-span-1 sm:col-span-3 border-t border-slate-100 pt-3 mt-3">
                  <EmployeeChecklist
                    employees={empRows.filter((e) => {
                      const q = fbIntSearch.trim().toLowerCase();
                      return (!q || e[0].toLowerCase().includes(q) || e[1].toLowerCase().includes(q));
                    })}
                    selected={fbIntMembers}
                    onToggle={(id) => setFbIntMembers((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                    onToggleAll={() => {
                      const all = empRows.filter((e) => {
                        const q = fbIntSearch.trim().toLowerCase();
                        return (!q || e[0].toLowerCase().includes(q) || e[1].toLowerCase().includes(q));
                      });
                      setFbIntMembers((prev) => {
                        const allSelected = all.length > 0 && all.every((e) => prev.has(e[0]));
                        const n = new Set(prev);
                        if (allSelected) all.forEach((e) => n.delete(e[0]));
                        else all.forEach((e) => n.add(e[0]));
                        return n;
                      });
                    }}
                    search={fbIntSearch}
                    onSearchChange={setFbIntSearch}
                    title={`FB Internal team under ${form[19]}`}
                  />
                </div>
              )}
              {form[15] === 'Yes' && form[20] && (
                <div className="col-span-1 sm:col-span-3 border-t border-slate-100 pt-3 mt-3">
                  <EmployeeChecklist
                    employees={empRows.filter((e) => {
                      const q = fbClientSearch.trim().toLowerCase();
                      return (!q || e[0].toLowerCase().includes(q) || e[1].toLowerCase().includes(q));
                    })}
                    selected={fbClientMembers}
                    onToggle={(id) => setFbClientMembers((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                    onToggleAll={() => {
                      const all = empRows.filter((e) => {
                        const q = fbClientSearch.trim().toLowerCase();
                        return (!q || e[0].toLowerCase().includes(q) || e[1].toLowerCase().includes(q));
                      });
                      setFbClientMembers((prev) => {
                        const allSelected = all.length > 0 && all.every((e) => prev.has(e[0]));
                        const n = new Set(prev);
                        if (allSelected) all.forEach((e) => n.delete(e[0]));
                        else all.forEach((e) => n.add(e[0]));
                        return n;
                      });
                    }}
                    search={fbClientSearch}
                    onSearchChange={setFbClientSearch}
                    title={`FB Client team under ${form[20]}`}
                  />
                </div>
              )}
              {form[17] === 'Yes' && form[18] && (
                <div className="col-span-1 sm:col-span-3 border-t border-slate-100 pt-3 mt-3">
                  <EmployeeChecklist
                    employees={empRows.filter((e) => {
                      const q = qcSearch.trim().toLowerCase();
                      return (!q || e[0].toLowerCase().includes(q) || e[1].toLowerCase().includes(q));
                    })}
                    selected={qcMembers}
                    onToggle={(id) => setQcMembers((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                    onToggleAll={() => {
                      const all = empRows.filter((e) => {
                        const q = qcSearch.trim().toLowerCase();
                        return (!q || e[0].toLowerCase().includes(q) || e[1].toLowerCase().includes(q));
                      });
                      setQcMembers((prev) => {
                        const allSelected = all.length > 0 && all.every((e) => prev.has(e[0]));
                        const n = new Set(prev);
                        if (allSelected) all.forEach((e) => n.delete(e[0]));
                        else all.forEach((e) => n.add(e[0]));
                        return n;
                      });
                    }}
                    search={qcSearch}
                    onSearchChange={setQcSearch}
                    title={`QA/QC team under ${form[18]}`}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* ── Import Modal ── */}
      {importOpen && (
        <Modal title="Import Projects from Excel" onClose={() => { setImportOpen(false); setImportStep('upload'); setMapping({}); setExcelHeaders([]); setExcelData([]); setSheetDataMap({}); setSheetNames([]); setSelectedSheet(''); }} wide>
          {importStep === 'upload' ? (
            <div>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-14 text-center hover:border-indigo-300 transition-colors cursor-pointer mb-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
                onClick={() => document.getElementById('import-file-input').click()}>
                <Upload size={36} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500 mb-1">Drop your Excel file here or click to browse</p>
                <p className="text-xs text-slate-400">Supports .xlsx, .xls</p>
                <input id="import-file-input" type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={(e) => { const f = e.target.files[0]; if (f) { handleFileSelect(f); e.target.value = ''; } }} />
              </div>
              <div className="text-center">
                <a href={api.projectTemplateUrl()} className="text-xs text-indigo-600 hover:underline font-medium" target="_blank" rel="noreferrer">
                  Download template →
                </a>
              </div>
            </div>
          ) : (
            <div>
              {sheetNames.length > 1 && (
                <div className="mb-4 flex items-center gap-2">
                  <label className="text-xs text-slate-500 font-medium">Sheet:</label>
                  <select className="input w-auto text-xs" value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}>
                    {sheetNames.map((n) => <option key={n}>{n}</option>)}
                  </select>
                </div>
              )}

              {/* Matched / skipped summary */}
              {(() => {
                const matchedCount = Object.keys(mapping).length;
                const skippedCount = SYSTEM_COLS.length - matchedCount;
                return (
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
                      ✓ {matchedCount} column{matchedCount !== 1 ? 's' : ''} matched
                    </span>
                    {skippedCount > 0 && (
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500 font-medium border border-slate-200">
                        — {skippedCount} skipped (will be blank)
                      </span>
                    )}
                    <span className="text-xs text-red-400 ml-auto">* Required</span>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mb-4 max-h-52 overflow-y-auto">
                {SYSTEM_COLS.map((sysCol, sysIdx) => {
                  const isReq = REQUIRED_COLS.includes(sysIdx);
                  const isMapped = mapping[sysIdx] !== undefined;
                  return (
                    <div key={sysIdx} className={`flex items-center gap-2 rounded-lg px-1.5 py-0.5 ${isMapped ? 'bg-emerald-50/60' : ''}`}>
                      <span className={`text-xs w-36 shrink-0 truncate font-medium ${isMapped ? 'text-emerald-800' : 'text-slate-400'}`}>
                        {isMapped ? '✓' : '—'} {sysCol} {isReq && <span className="text-red-400">*</span>}
                      </span>
                      <select className="input text-xs flex-1 py-1"
                        value={mapping[sysIdx] !== undefined ? mapping[sysIdx] : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMapping((prev) => {
                            const next = { ...prev };
                            if (val === '') delete next[sysIdx];
                            else next[sysIdx] = parseInt(val);
                            return next;
                          });
                        }}>
                        <option value="">— Skip —</option>
                        {excelHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {/* Preview — only mapped columns */}
              {(() => {
                const mappedCols = SYSTEM_COLS.map((h, i) => ({ h, i })).filter(({ i }) => mapping[i] !== undefined);
                return (
                  <>
                    <p className="text-xs text-slate-400 mb-2">
                      Preview — {mappedRows.length} rows · showing {mappedCols.length} mapped column{mappedCols.length !== 1 ? 's' : ''}:
                    </p>
                    <div className="max-h-52 overflow-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 sticky top-0">
                            {mappedCols.map(({ h, i }) => (
                              <th key={i} className="px-2 py-1.5 text-left font-medium border-b border-slate-200 whitespace-nowrap text-slate-600">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {mappedRows.slice(0, 10).map((row, ri) => (
                            <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                              {mappedCols.map(({ i }) => (
                                <td key={i} className="px-2 py-1 border-b border-slate-100 truncate max-w-28 text-slate-700">
                                  {row[i] || <span className="text-slate-300">—</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {mappedRows.length > 10 && (
                      <p className="text-xs text-slate-400 mt-1">… and {mappedRows.length - 10} more rows</p>
                    )}
                  </>
                );
              })()}

              <div className="flex justify-between items-center mt-6">
                <button className="btn-secondary text-xs" onClick={() => { setImportStep('upload'); setMapping({}); setExcelHeaders([]); setExcelData([]); setSheetDataMap({}); setSheetNames([]); setSelectedSheet(''); }}>
                  ← Back
                </button>
                <div className="flex gap-2">
                  <button className="btn-secondary" onClick={() => { setImportOpen(false); setImportStep('upload'); setMapping({}); setExcelHeaders([]); setExcelData([]); setSheetDataMap({}); setSheetNames([]); setSelectedSheet(''); }}>
                    Cancel
                  </button>
                  <button className="btn-primary" onClick={doImport} disabled={importing || !mappedRows.length}>
                    {importing ? 'Importing…' : `Import ${mappedRows.length} Projects`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Edit Assignment Modal ── */}
      {mapEditModal && (
        <Modal title="Edit Assignment" onClose={() => setMapEditModal(null)}>
          <div className="mb-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
            <span className="font-medium">{mapEditModal.mapping[1]}</span> → <span className="font-medium">{mapEditModal.mapping[3]}</span>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label">Role</label>
              <select className="input" value={mapEditForm.role} onChange={(e) => setMapEditForm((f) => ({ ...f, role: e.target.value }))}>
                {roles.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Team Lead</label>
              <select className="input" value={mapEditForm.teamLead} onChange={(e) => setMapEditForm((f) => ({ ...f, teamLead: e.target.value }))}>
                <option value="">— Select —</option>
                {mapAllLeads.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={mapEditForm.status} onChange={(e) => setMapEditForm((f) => ({ ...f, status: e.target.value }))}>
                {MAP_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setMapEditModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={saveMapEdit} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* ── Assign Employee Modal ── */}
      {assignModal && (
        <Modal title="Assign Employee to Project" onClose={() => {
          setAssignModal(false);
          setAssignForm({ empId: '', projId: '', role: 'Engineer', teamLead: '', status: 'Active' });
          setAssignSelected(new Set());
          setLeadMappings([]);
          setAssignSearch('');
        }} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="label">Team Lead (from Employees)</label>
                <select className="input" value={assignForm.teamLead} onChange={async (e) => {
                  const val = e.target.value;
                  setAssignForm((f) => ({ ...f, teamLead: val, projId: '' }));
                  setAssignSearch('');
                  if (val) {
                    const underLead = mapEmployees.filter((emp) => emp[3] === val && emp[6] === 'Active');
                    setAssignSelected(new Set(underLead.map((emp) => emp[0])));
                    try {
                      const mapped = await api.empMapByLead(val);
                      setLeadMappings(mapped);
                    } catch { setLeadMappings([]); }
                  } else {
                    setAssignSelected(new Set());
                    setLeadMappings([]);
                  }
                }}>
                  <option value="">— All leads —</option>
                  {mapAllLeads.map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Project (In Progress) *</label>
                <select className="input" value={assignForm.projId} onChange={(e) => setAssignForm((f) => ({ ...f, projId: e.target.value }))}>
                  <option value="">— Select project —</option>
                  {inProgressProjs.map((p) => <option key={p[0]} value={p[0]}>{p[1]} ({p[0]})</option>)}
                </select>
              </div>
            </div>

            {assignForm.projId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">
                    Select Employees ({assignSelected.size} of {assignAvailableEmps.length} available)
                  </label>
                  {assignForm.teamLead && (
                    <span className="text-xs text-slate-400">
                      {mapEmployees.filter((e) => e[3] === assignForm.teamLead && e[6] === 'Active').length} under {assignForm.teamLead}
                    </span>
                  )}
                </div>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input pl-9 text-sm" placeholder="Search employees…"
                    value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} />
                </div>
                <div className="border border-slate-200 rounded-xl max-h-56 overflow-auto">
                  {filteredAssignEmps.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-8">No available employees</p>
                  ) : (
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 w-10">
                            <input type="checkbox" className="accent-indigo-600 cursor-pointer"
                              checked={allAssignFilteredSelected}
                              ref={(el) => { if (el) el.indeterminate = someAssignFilteredSelected && !allAssignFilteredSelected; }}
                              onChange={() => {
                                setAssignSelected((prev) => {
                                  const n = new Set(prev);
                                  if (allAssignFilteredSelected) filteredAssignEmps.forEach((e) => n.delete(e[0]));
                                  else filteredAssignEmps.forEach((e) => n.add(e[0]));
                                  return n;
                                });
                              }} />
                          </th>
                          <th className="text-left px-2 py-2 font-semibold text-slate-500">EMP ID</th>
                          <th className="text-left px-2 py-2 font-semibold text-slate-500">Name</th>
                          <th className="text-left px-2 py-2 font-semibold text-slate-500">Department</th>
                          <th className="text-center px-2 py-2 font-semibold text-slate-500">Under Lead</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAssignEmps.map((emp) => {
                          const checked = assignSelected.has(emp[0]);
                          const isUnderLead = assignForm.teamLead && emp[3] === assignForm.teamLead;
                          return (
                            <tr key={emp[0]} className={`border-b border-slate-50 ${checked ? 'bg-indigo-50/60' : 'hover:bg-indigo-50/30'}`}>
                              <td className="px-3 py-2">
                                <input type="checkbox" className="accent-indigo-600 cursor-pointer"
                                  checked={checked} onChange={() => setAssignSelected((prev) => {
                                    const n = new Set(prev);
                                    n.has(emp[0]) ? n.delete(emp[0]) : n.add(emp[0]);
                                    return n;
                                  })} />
                              </td>
                              <td className="px-2 py-2 font-mono text-slate-500">{emp[0]}</td>
                              <td className="px-2 py-2 font-medium">{emp[1]}</td>
                              <td className="px-2 py-2 text-slate-500">{emp[4] || '—'}</td>
                              <td className="px-2 py-2 text-center">
                                {isUnderLead
                                  ? <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-medium">✓</span>
                                  : <span className="text-slate-300">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                {assignSelected.size > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 rounded-xl max-h-20 overflow-y-auto mt-2">
                    {[...assignSelected].map((id) => {
                      const emp = mapEmployees.find((e) => e[0] === id);
                      return emp ? (
                        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded text-xs text-slate-600 border border-slate-200">
                          {emp[1] || id}
                          <button onClick={() => setAssignSelected((prev) => { const n = new Set(prev); n.delete(id); return n; })}
                            className="text-slate-400 hover:text-red-500 ml-0.5">&times;</button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => {
              setAssignModal(false);
              setAssignForm({ empId: '', projId: '', role: 'Engineer', teamLead: '', status: 'Active' });
              setAssignSelected(new Set());
              setLeadMappings([]);
              setAssignSearch('');
            }} className="btn-secondary">Cancel</button>
            <button onClick={assignEmpToProj} disabled={saving || !assignForm.projId || assignSelected.size === 0} className="btn-primary">
              {saving ? 'Assigning…' : `Assign ${assignSelected.size} employee${assignSelected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}
