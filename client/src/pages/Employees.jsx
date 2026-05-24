import { useEffect, useLayoutEffect, useState, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Pencil, Trash2, RefreshCw, UserCheck, UserX, Users, Briefcase, Building2, Clock, AlertCircle, CheckCircle2, Search, Upload, Download, X } from 'lucide-react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import LoadingScreen from '../components/LoadingScreen';

const EMP_HEADERS = ['EMP ID', 'Full Name', 'Short Name', 'Team Lead', 'Department', 'Designation', 'Status', 'Req Eff Ratio', 'Work Hrs/Day', 'Phone', 'Email', 'Join Date', 'Remarks', 'Shift', 'Week Off', 'Rot Off Day 1', 'Rot Off Day 2', 'Rot Off Enabled', 'Experience'];

const MANDATORY_FIELDS = [
  { label: 'Team Lead', idx: 3, check: (v) => !v },
  { label: 'Experience', idx: 18, check: (v) => !v || v === '00:00' },
  { label: 'Req Eff %', idx: 7, check: (v) => !v },
  { label: 'Work Hrs', idx: 8, check: (v) => !v },
  { label: 'Shift', idx: 13, check: (v) => !v },
];

function useSettings() {
  const [s, setS] = useState(null);
  useEffect(() => {
    api.settings()
      .then(setS)
      .catch((e) => { console.warn('Settings load failed:', e); setS({ depts: [], designations: [], empStatuses: [], shifts: [], weekoffs: [], alignments: {} }); });
  }, []);
  return s || { depts: [], designations: [], empStatuses: [], shifts: [], weekoffs: [], alignments: {} };
}

function highlightMatch(text, query) {
  if (!query) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-slate-900 rounded-sm px-0">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

function SearchableSelect({ value, onChange, employees, placeholder = 'Search by name or EMP ID…' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const activeItemRef = useRef(null);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
        setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  useLayoutEffect(() => {
    setActiveIdx(-1);
    if (dropdownRef.current) dropdownRef.current.scrollTop = 0;
  }, [query]);

  useEffect(() => {
    if (activeItemRef.current) activeItemRef.current.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees.slice(0, 200);
    const matches = employees.filter((e) =>
      (e[0] || '').toLowerCase().includes(q) ||
      (e[1] || '').toLowerCase().includes(q)
    );
    matches.sort((a, b) => {
      const score = (id, name) => {
        if (id === q) return 0;
        if (name === q) return 1;
        if (id.startsWith(q)) return 2;
        if (name.startsWith(q)) return 3;
        if (name.split(/\s+/).some(w => w.startsWith(q))) return 4;
        return 5;
      };
      const diff = score((a[0] || '').toLowerCase(), (a[1] || '').toLowerCase())
                 - score((b[0] || '').toLowerCase(), (b[1] || '').toLowerCase());
      return diff !== 0 ? diff : (a[1] || '').localeCompare(b[1] || '');
    });
    return matches;
  }, [employees, query]);

  const handleSelect = (empName) => {
    onChange(empName);
    setQuery('');
    setOpen(false);
    setActiveIdx(-1);
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeIdx >= 0 && filtered[activeIdx]) handleSelect(filtered[activeIdx][1]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); setActiveIdx(-1); }
  };

  const q = query.trim();

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger / input box */}
      <div
        className={`flex items-center gap-1.5 input min-h-[2.25rem] cursor-text px-2.5 py-1.5 flex-wrap transition-shadow ${open ? 'ring-2 ring-indigo-300 border-indigo-400' : ''}`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {/* Selected pill shown when closed or when value exists */}
        {value && !open && (
          <span className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full max-w-full">
            <span className="truncate">{value}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(''); setQuery(''); }}
              className="shrink-0 hover:text-red-500 transition-colors"
              tabIndex={-1}
            >
              <X size={11} />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          className="flex-1 min-w-[6rem] bg-transparent outline-none text-sm placeholder:text-slate-400"
          placeholder={value && !open ? '' : open && value ? 'Type to change…' : placeholder}
          value={query}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {/* Search icon or clear query */}
        {open && query ? (
          <button type="button" tabIndex={-1} onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="text-slate-400 hover:text-slate-600 shrink-0">
            <X size={13} />
          </button>
        ) : (
          <Search size={13} className="text-slate-400 shrink-0 pointer-events-none" />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div ref={dropdownRef} className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-2xl mt-1 max-h-56 overflow-y-auto">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm border-b border-slate-100 px-3 py-1.5 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-medium">
              {q ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${q}"` : `${filtered.length} employees`}
            </span>
            {value && (
              <button type="button" onClick={() => { onChange(''); setQuery(''); }} className="text-[10px] text-red-400 hover:text-red-600 font-medium transition-colors">
                Clear selection
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-slate-400">No match for <span className="font-semibold text-slate-600">"{q}"</span></p>
            </div>
          ) : filtered.map((e, idx) => {
            const isSelected = value === e[1];
            const isActive = activeIdx === idx;
            return (
              <button
                key={`${e[0]}-${idx}`}
                ref={isActive ? activeItemRef : null}
                type="button"
                onClick={() => handleSelect(e[1])}
                className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors border-b border-slate-50 last:border-0
                  ${isSelected ? 'bg-indigo-50' : isActive ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
              >
                <span className={`font-mono text-[10px] shrink-0 px-1.5 py-0.5 rounded ${isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                  {highlightMatch(e[0], q)}
                </span>
                <span className={`text-xs font-medium truncate ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>
                  {highlightMatch(e[1], q)}
                </span>
                {isSelected && <span className="ml-auto text-indigo-500 text-xs shrink-0">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const Field = ({ form, set, label, i, opts, type = 'text' }) => (
  <div>
    <label className="label">{label}</label>
    {opts ? (
      <select className="input" value={form[i]} onChange={(e) => set(i, e.target.value)}>
        <option value="">— Select —</option>
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    ) : (
      <input type={type} className="input" value={form[i] ?? ''} onChange={(e) => set(i, e.target.value)} />
    )}
  </div>
);

export default function Employees({ toast }) {
  const sett = useSettings();
  const [rows, setRows] = useState([]);
  const [rowIndices, setRowIndices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(Array(19).fill(''));
  const [expYears, setExpYears] = useState('');
  const [expMonths, setExpMonths] = useState('');
  const [effHrs, setEffHrs] = useState('');
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const parseWorkHrs = (v) => {
    if (!v) return 8;
    const p = v.split(':');
    return p.length === 2 ? parseInt(p[0]) + parseInt(p[1]) / 60 : (parseFloat(v) || 8);
  };
  const DEFAULT_MATRIX = [
    { label: '>2 years', range: '6.5 to 8', max: 8 },
    { label: '1.5 - 2 years', range: '4.5 to 6', max: 6 },
    { label: '1 - 1.5 years', range: '4 to 5', max: 5 },
    { label: '0.5 - 1 years', range: '3.5 to 4.5', max: 4.5 },
    { label: '0 - 0.5 years', range: '1 to 2', max: 2 },
  ];
  const matrixEntry = (years, months) => {
    if (years === '' || months === '') return null;
    const t = parseInt(years) * 12 + parseInt(months);
    const arr = (sett.prodMatrix && sett.prodMatrix.length ? sett.prodMatrix : DEFAULT_MATRIX);
    for (const x of arr) {
      const label = x.label || '';
      const gM = label.match(/^>\s*([\d.]+)/);
      const dM = label.match(/^([\d.]+)\s*-\s*([\d.]+)/);
      if (gM) { if (t > Math.round(parseFloat(gM[1]) * 12)) return x; }
      else if (dM) {
        const lo = Math.round(parseFloat(dM[1]) * 12);
        const hi = Math.round(parseFloat(dM[2]) * 12);
        if (t >= lo && t <= hi) return x;
      }
    }
    return null;
  };
  const updateReqEff = (y, mo) => {
    const e = matrixEntry(y, mo);
    if (e && e.max > 0) { setEffHrs(decToHhmm(e.max)); set(7, ((e.max / 0.08)).toFixed(1)); }
  };

  // Recompute when matrix data loads after experience is already set
  useEffect(() => {
    if (expYears !== '' && expMonths !== '' && modal) {
      const e = matrixEntry(expYears, expMonths);
      if (e && e.max > 0) { setEffHrs(decToHhmm(e.max)); set(7, ((e.max / 0.08)).toFixed(1)); }
    }
  }, [sett.prodMatrix, expYears, expMonths, modal]);

  // Filter state
  const [fDesignation, setFDesignation] = useState('All');
  const [fDept, setFDept] = useState('All');
  const [fTeamLead, setFTeamLead] = useState('All');
  const [fShift, setFShift] = useState('All');
  const [fStatus, setFStatus] = useState('All');

  // Filter options from data
  const desigOptions = useMemo(() => [...new Set(rows.map((r) => r[5]).filter(Boolean))].sort(), [rows]);
  const deptOptions = useMemo(() => [...new Set(rows.map((r) => r[4]).filter(Boolean))].sort(), [rows]);
  const tlOptionsFilter = useMemo(() => [...new Set(rows.map((r) => r[3]).filter(Boolean))].sort(), [rows]);
  const shiftOptions = useMemo(() => [...new Set(rows.map((r) => r[13]).filter(Boolean))].sort(), [rows]);
  const statusOptions = useMemo(() => [...new Set(rows.map((r) => r[6]).filter(Boolean))].sort(), [rows]);

  const filteredRows = useMemo(() => rows.filter((r) => {
    if (fDesignation !== 'All' && r[5] !== fDesignation) return false;
    if (fDept !== 'All' && r[4] !== fDept) return false;
    if (fTeamLead !== 'All' && r[3] !== fTeamLead) return false;
    if (fShift !== 'All' && r[13] !== fShift) return false;
    if (fStatus !== 'All' && r[6] !== fStatus) return false;
    return true;
  }), [rows, fDesignation, fDept, fTeamLead, fShift, fStatus]);

  const filteredRowIndices = useMemo(() => rows.reduce((acc, r, i) => {
    if (fDesignation !== 'All' && r[5] !== fDesignation) return acc;
    if (fDept !== 'All' && r[4] !== fDept) return acc;
    if (fTeamLead !== 'All' && r[3] !== fTeamLead) return acc;
    if (fShift !== 'All' && r[13] !== fShift) return acc;
    if (fStatus !== 'All' && r[6] !== fStatus) return acc;
    acc.push(rowIndices[i]);
    return acc;
  }, []), [rows, rowIndices, fDesignation, fDept, fTeamLead, fShift, fStatus]);

  const clearFilters = () => { setFDesignation('All'); setFDept('All'); setFTeamLead('All'); setFShift('All'); setFStatus('All'); };
  const hasFilters = fDesignation !== 'All' || fDept !== 'All' || fTeamLead !== 'All' || fShift !== 'All' || fStatus !== 'All';

  // Incomplete detection
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [incompleteSearch, setIncompleteSearch] = useState('');
  const [incompleteFTL, setIncompleteFTL] = useState('All');
  const [incompleteFShift, setIncompleteFShift] = useState('All');
  const [incompleteSelected, setIncompleteSelected] = useState(new Set());
  const [incompleteBulkForm, setIncompleteBulkForm] = useState({ tl: '', shift: '', workHrs: '', expYears: '', expMonths: '' });
  const [incompleteBulkSaving, setIncompleteBulkSaving] = useState(false);
  const incompleteListRef = useRef(null);

  const incompleteRows = useMemo(() =>
    rows
      .map((r, i) => ({ row: r, sheetRow: rowIndices[i] }))
      .filter(({ row: r }) => MANDATORY_FIELDS.some(({ idx, check }) => check(r[idx]))),
    [rows, rowIndices]);

  const incompleteTLOpts = useMemo(() => [...new Set(rows.map(r => r[3]).filter(Boolean))].sort(), [rows]);
  const incompleteShiftOpts = useMemo(() => [...new Set(rows.map(r => r[13]).filter(Boolean))].sort(), [rows]);

  const filteredIncomplete = useMemo(() => {
    const q = incompleteSearch.trim().toLowerCase();
    return incompleteRows.filter(({ row }) => {
      if (q && !String(row[1] || '').toLowerCase().includes(q) && !String(row[0] || '').toLowerCase().includes(q)) return false;
      if (incompleteFTL === 'None' && row[3]) return false;
      if (incompleteFTL !== 'All' && incompleteFTL !== 'None' && row[3] !== incompleteFTL) return false;
      if (incompleteFShift === 'None' && row[13]) return false;
      if (incompleteFShift !== 'All' && incompleteFShift !== 'None' && row[13] !== incompleteFShift) return false;
      return true;
    });
  }, [incompleteRows, incompleteSearch, incompleteFTL, incompleteFShift]);

  useLayoutEffect(() => {
    if (incompleteListRef.current) incompleteListRef.current.scrollTop = 0;
  }, [incompleteSearch, incompleteFTL, incompleteFShift]);

  // Bulk edit state
  const [bulkEditModal, setBulkEditModal] = useState(null); // null | selectedData[]
  const [bulkEditForm, setBulkEditForm] = useState({ shift: '', tl: '', designation: '', workHrs: '' });
  const [bulkEditSaving, setBulkEditSaving] = useState(false);

  // ── Import / Export ──
  const EMP_SYSTEM_COLS = ['EMP ID', 'Full Name', 'Short Name', 'Team Lead', 'Department', 'Designation', 'Status', 'Req Eff Ratio', 'Work Hrs/Day', 'Phone', 'Email', 'Join Date', 'Remarks', 'Shift', 'Week Off', 'Rot Off Day 1', 'Rot Off Day 2', 'Rot Off Enabled', 'Experience'];
  const EMP_REQUIRED_COLS = [0, 1];

  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState('upload');
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [excelData, setExcelData] = useState([]);
  const [sheetDataMap, setSheetDataMap] = useState({});
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);

  const autoMapColumns = useCallback((hdrs) => {
    const map = {};
    EMP_SYSTEM_COLS.forEach((sysCol, sysIdx) => {
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
      const sysRow = Array(EMP_SYSTEM_COLS.length).fill('');
      Object.entries(mapping).forEach(([sysIdx, exIdx]) => {
        sysRow[parseInt(sysIdx)] = row[exIdx] !== undefined ? String(row[exIdx]) : '';
      });
      return sysRow;
    });
  }, [excelData, mapping]);

  const doImport = async () => {
    if (!mappedRows.length) return toast.error('No data to import');
    const missing = EMP_REQUIRED_COLS.filter((i) => mapping[i] === undefined);
    if (missing.length) return toast.error('Please map required columns: ' + missing.map((i) => EMP_SYSTEM_COLS[i]).join(', '));
    setImporting(true);
    try {
      const res = await api.importEmployees(mappedRows);
      toast.success(`${res.count} employees imported successfully`);
      setImportOpen(false);
      setImportStep('upload');
      setMapping({});
      load();
    } catch (e) { toast.error(e.message); }
    finally { setImporting(false); }
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([EMP_HEADERS, ...filteredRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, `Employees_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const load = async () => {
    setLoading(true);
    try { const d = await api.employees(); setRows(d.data || []); setRowIndices(d.rowIndices || []); }
    catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const backfillReqEff = async () => {
    setBackfilling(true);
    try {
      const r = await api.backfillReqEff();
      toast.success(`Backfilled Req Eff Ratio for ${r.updated} employee(s)`);
      if (r.updated > 0) load();
    } catch (e) { toast.error(e.message); }
    finally { setBackfilling(false); }
  };

  const closeIncompleteModal = () => {
    setShowIncomplete(false);
    setIncompleteSearch(''); setIncompleteFTL('All'); setIncompleteFShift('All');
    setIncompleteSelected(new Set());
    setIncompleteBulkForm({ tl: '', shift: '', workHrs: '', expYears: '', expMonths: '' });
  };
  const toggleIncompleteAll = () => {
    const allSel = filteredIncomplete.length > 0 && filteredIncomplete.every(({ sheetRow }) => incompleteSelected.has(sheetRow));
    setIncompleteSelected(prev => {
      const next = new Set(prev);
      if (allSel) filteredIncomplete.forEach(({ sheetRow }) => next.delete(sheetRow));
      else filteredIncomplete.forEach(({ sheetRow }) => next.add(sheetRow));
      return next;
    });
  };
  const toggleIncompleteOne = (sheetRow) => setIncompleteSelected(prev => {
    const next = new Set(prev);
    next.has(sheetRow) ? next.delete(sheetRow) : next.add(sheetRow);
    return next;
  });
  const applyIncompleteBulk = async () => {
    const toUpdate = incompleteRows.filter(({ sheetRow }) => incompleteSelected.has(sheetRow));
    if (!toUpdate.length) return;
    const { tl, shift, workHrs, expYears, expMonths } = incompleteBulkForm;
    const hasExp = expYears !== '' && expMonths !== '';
    if (!tl && !shift && !workHrs && !hasExp) return toast.error('Fill at least one field to assign');
    setIncompleteBulkSaving(true);
    try {
      const updates = toUpdate.map(({ row, sheetRow }) => {
        const values = [...row]; while (values.length < 19) values.push('');
        if (tl) values[3] = tl;
        if (shift) values[13] = shift;
        if (workHrs) values[8] = workHrs;
        if (hasExp) {
          const ey = String(expYears), em = String(expMonths);
          values[18] = `${ey.padStart(2, '0')}:${em.padStart(2, '0')}`;
          const entry = matrixEntry(ey, em);
          if (entry && entry.max > 0) values[7] = (entry.max / 0.08).toFixed(1);
          const jd = expToJoinDate(ey, em);
          if (jd) values[11] = jd;
        }
        return { row: sheetRow, values };
      });
      await api.bulkUpdate('EMPLOYEES', updates);
      toast.success(`${updates.length} employee(s) updated`);
      setIncompleteSelected(new Set());
      setIncompleteBulkForm({ tl: '', shift: '', workHrs: '', expYears: '', expMonths: '' });
      load();
    } catch (e) { toast.error(e.message); }
    finally { setIncompleteBulkSaving(false); }
  };

  // All employees available as TL options (Active + already-TL ones)
  const tlOptions = useMemo(() =>
    rows.filter((r) => r[0] && r[1]),
    [rows]);

  const blank = () => { const f = Array(19).fill(''); f[6] = 'Active'; f[7] = '75'; f[8] = '08:00'; return f; };

  // Experience ↔ Join Date helpers
  const expToJoinDate = (y, mo) => {
    if (y === '' || mo === '') return '';
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - (parseInt(y) * 12 + parseInt(mo)), now.getDate());
    return d.toISOString().slice(0, 10);
  };
  const joinDateToExp = (dateStr) => {
    if (!dateStr) return null;
    const join = new Date(dateStr);
    if (isNaN(join.getTime())) return null;
    const now = new Date();
    const months = Math.max(0, (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth()));
    return { y: String(Math.floor(months / 12)), mo: String(months % 12) };
  };

  const decToHhmm = (v) => {
    if (!v && v !== 0) return '';
    if (String(v).includes(':')) return String(v);
    const n = parseFloat(v);
    if (isNaN(n)) return v;
    const h = Math.floor(n);
    const m = Math.round((n - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const parseExp = (v) => {
    const m = String(v || '').match(/^(\d+):(\d+)$/);
    return m ? { y: m[1], mo: m[2] } : null;
  };
  const openAdd = () => { setForm(blank()); setExpYears(''); setExpMonths(''); setEffHrs(''); setModal({ mode: 'add' }); };
  const openEdit = (row, sheetRow) => {
    const f = [...row]; while (f.length < 19) f.push('');
    f[15] = f[15] != null && f[15] !== '' ? String(f[15]) : '';
    f[16] = f[16] != null && f[16] !== '' ? String(f[16]) : '';
    f[8] = decToHhmm(f[8]);
    const oldRat = parseFloat(f[7]);
    if (!isNaN(oldRat) && oldRat <= 5) f[7] = String(oldRat * 100);
    const p = parseExp(f[18]);
    setExpYears(p ? p.y : ''); setExpMonths(p ? p.mo : '');
    if (p) { const e = matrixEntry(p.y, p.mo); setEffHrs(e ? decToHhmm(e.max) : ''); } else setEffHrs('');
    setForm(f); setModal({ mode: 'edit', sheetRow });
  };

  const save = async () => {
    if (!form[0] || !form[1]) return toast.error('EMP ID and Full Name are required');
    setSaving(true);
    try {
      if (modal.mode === 'add') { await api.addEmployee(form); toast.success('Employee added'); }
      else { await api.updateEmployee(modal.sheetRow, form); toast.success('Employee updated'); }
      setModal(null); load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const set = (i, v) => setForm((f) => { const n = [...f]; n[i] = v; return n; });

  const bulkSetStatus = async (selectedData, status) => {
    if (!confirm(`Mark ${selectedData.length} employee(s) as ${status}?`)) return;
    try {
      const updates = selectedData.map((d) => ({
        row: d.sheetRow,
        values: d.row.map((v, i) => (i === 6 ? status : (v ?? ''))),
      }));
      await api.bulkUpdate('EMPLOYEES', updates);
      toast.success(`${selectedData.length} employees marked ${status}`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const confirmDelete = (row, sheetRow) => {
    const name = row[1] || row[0];
    if (!confirm(`Delete employee "${name}" (EMP ID: ${row[0]})? This cannot be undone.`)) return;
    api.bulkClearRows('EMPLOYEES', [sheetRow])
      .then(() => { toast.success(`"${name}" deleted`); load(); })
      .catch((e) => toast.error(e.message));
  };

  const bulkDelete = async (selectedData) => {
    if (!confirm(`Delete ${selectedData.length} employee(s)? This cannot be undone.`)) return;
    try {
      const sheetRows = selectedData.map((d) => d.sheetRow);
      await api.bulkClearRows('EMPLOYEES', sheetRows);
      toast.success(`${selectedData.length} employee(s) deleted`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const bulkEdit = async () => {
    if (!bulkEditModal?.length) return;
    const hasVal = Object.values(bulkEditForm).some(Boolean);
    if (!hasVal) return toast.error('Fill at least one field');
    setBulkEditSaving(true);
    try {
      const updates = bulkEditModal.map((d) => {
        const values = [...d.row];
        while (values.length < 19) values.push('');
        if (bulkEditForm.shift) values[13] = bulkEditForm.shift;
        if (bulkEditForm.tl) values[3] = bulkEditForm.tl;
        if (bulkEditForm.designation) values[5] = bulkEditForm.designation;
        if (bulkEditForm.workHrs) values[8] = bulkEditForm.workHrs;
        return { row: d.sheetRow, values };
      });
      await api.bulkUpdate('EMPLOYEES', updates);
      toast.success(`${updates.length} employee(s) updated`);
      setBulkEditModal(null);
      setBulkEditForm({ shift: '', tl: '', designation: '', workHrs: '' });
      load();
    } catch (e) { toast.error(e.message); }
    finally { setBulkEditSaving(false); }
  };

  return (
    <div className="page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="page-sub">{rows.length} records — master employee list</p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <button onClick={load} className="btn-secondary"><RefreshCw size={14} /></button>
          <button onClick={backfillReqEff} disabled={backfilling} className="btn-secondary gap-1 sm:gap-1.5 text-[11px] sm:text-xs" title="Calculate experience from join date and update Req Eff Ratio from productivity matrix">
            <RefreshCw size={14} className={backfilling ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{backfilling ? 'Running…' : 'Backfill'}</span>
            <span className="sm:hidden">{backfilling ? '…' : 'BF'}</span>
          </button>
          <button onClick={() => setShowIncomplete(true)}
            className={`btn-secondary gap-1 sm:gap-1.5 text-[11px] sm:text-xs ${incompleteRows.length > 0 ? 'text-amber-600 border-amber-300 hover:bg-amber-50' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>
            {incompleteRows.length > 0
              ? <AlertCircle size={14} />
              : <CheckCircle2 size={14} />}
            <span className="hidden sm:inline">{incompleteRows.length > 0 ? `Incomplete (${incompleteRows.length})` : 'All Complete'}</span>
            <span className="sm:hidden">{incompleteRows.length}</span>
          </button>
          <button onClick={exportToExcel} className="btn-secondary gap-1 sm:gap-1.5 text-[11px] sm:text-xs"><Download size={14} /> Export</button>
          <button onClick={() => setImportOpen(true)} className="btn-secondary gap-1 sm:gap-1.5 text-[11px] sm:text-xs"><Upload size={14} /> Import</button>
          <button onClick={openAdd} className="btn-primary text-[11px] sm:text-xs"><Plus size={14} /> Add</button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card mb-5 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[120px]">
          <label className="label">Designation</label>
          <select className="input w-full" value={fDesignation} onChange={(e) => setFDesignation(e.target.value)}>
            <option value="All">All</option>
            {desigOptions.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="label">Department</label>
          <select className="input w-full" value={fDept} onChange={(e) => setFDept(e.target.value)}>
            <option value="All">All</option>
            {deptOptions.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="label">Team Lead</label>
          <select className="input w-full" value={fTeamLead} onChange={(e) => setFTeamLead(e.target.value)}>
            <option value="All">All</option>
            {tlOptionsFilter.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[100px]">
          <label className="label">Shift</label>
          <select className="input w-full" value={fShift} onChange={(e) => setFShift(e.target.value)}>
            <option value="All">All</option>
            {shiftOptions.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[100px]">
          <label className="label">Status</label>
          <select className="input w-full" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="All">All</option>
            {statusOptions.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="btn-secondary text-xs self-end">Clear Filters</button>
        )}
        <div className="text-xs text-slate-500 self-end pb-2 ml-auto">
          {hasFilters ? `${filteredRows.length} of ${rows.length}` : `${rows.length}`} records
        </div>
      </div>

      {loading ? <LoadingScreen message="Gathering your team" words={['profiles', 'roles', 'skills', 'contacts', 'profiles']} /> : (
        <DataTable
          headers={EMP_HEADERS}
          rows={filteredRows}
          rowIndices={filteredRowIndices}
          columnControl
          storageKey="employees"
          selectable
          defaultHiddenCols={[]}
          alignments={sett.alignments['EMPLOYEES'] || []}
          bulkActions={[
            { label: 'Mark Active', icon: UserCheck, onClick: (sel) => bulkSetStatus(sel, 'Active') },
            { label: 'Mark Inactive', icon: UserX, danger: true, onClick: (sel) => bulkSetStatus(sel, 'Inactive') },
            {
              label: 'Bulk Edit', icon: Users,
              onClick: (sel) => { setBulkEditForm({ shift: '', tl: '', designation: '', workHrs: '' }); setBulkEditModal(sel); },
            },
            { label: 'Delete', icon: Trash2, danger: true, onClick: (sel) => bulkDelete(sel) },
          ]}
          actions={{
            renderCell: (ci, val) => ci === 6 ? <Badge value={val} /> : val,
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
            <div className="space-y-1 text-xs" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="font-semibold text-slate-800 truncate">{row[1] || '—'}</div>
                  <div className="text-slate-400 font-mono text-[10px]">{row[0] || ''}</div>
                </div>
                <div className="shrink-0">{row[6] ? <Badge value={row[6]} /> : <span className="text-slate-300">—</span>}</div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">
                {row[5] && <span>Desig: {row[5]}</span>}
                {row[4] && <span>Dept: {row[4]}</span>}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">
                {row[3] && <span>Lead: {row[3]}</span>}
                {row[13] && <span>Shift: {row[13]}</span>}
                {row[8] && <span>Hrs: {row[8]}</span>}
                {row[7] && <span>Eff: {row[7]}%</span>}
                {row[18] && <span>Exp: {row[18]}</span>}
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-50 mt-0.5">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-400 min-w-0">
                  {row[9] && <span className="truncate">{row[9]}</span>}
                  {row[10] && <span className="truncate">{row[10]}</span>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); openEdit(row, sheetRow); }} className="btn-secondary py-1 px-1.5 text-[10px]">
                    <Pencil size={10} /> Edit
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); confirmDelete(row, sheetRow); }} className="btn-secondary py-1 px-1.5 text-[10px] text-red-600 border-red-200 hover:bg-red-50">
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            </div>
          )}
        />
      )}

      {/* Add / Edit Employee Modal */}
      {modal && (
        <Modal title={modal.mode === 'add' ? 'Add Employee' : 'Edit Employee'} onClose={() => setModal(null)} wide>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field form={form} set={set} label="EMP ID" i={0} />
            <Field form={form} set={set} label="Full Name" i={1} />
            <Field form={form} set={set} label="Short Name" i={2} />

            {/* Team Lead — searchable */}
            <div>
              <label className="label">Team Lead</label>
              <SearchableSelect
                value={form[3]}
                onChange={(v) => set(3, v)}
                employees={tlOptions}
              />
            </div>

            <Field form={form} set={set} label="Department" i={4} opts={sett.depts} />
            <Field form={form} set={set} label="Designation" i={5} opts={sett.designations} />
            <Field form={form} set={set} label="Status" i={6} opts={sett.empStatuses} />
            <div>
              <label className="label">Req Eff Ratio</label>
              <div className="relative">
                <input type="text" className="input pr-10" value={form[7] ?? ''} onChange={(e) => set(7, e.target.value)} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">%</span>
              </div>
            </div>
            <div>
              <label className="label">Work Hours/Day (HH:MM)</label>
              <input type="text" className="input" placeholder="e.g. 08:30"
                value={form[8] ?? ''}
                onChange={(e) => {
                  let v = e.target.value;
                  if (v.length === 2 && !v.includes(':') && form[8]?.length === 1) v += ':';
                  set(8, v);
                  if (expYears !== '' && expMonths !== '') updateReqEff(expYears, expMonths);
                }} />
            </div>
            <Field form={form} set={set} label="Phone" i={9} />
            <Field form={form} set={set} label="Email" i={10} type="email" />
            <div>
              <label className="label">Join Date</label>
              <input type="date" className="input" value={form[11] ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  set(11, v);
                  const exp = joinDateToExp(v);
                  if (exp) {
                    setExpYears(exp.y); setExpMonths(exp.mo);
                    set(18, `${exp.y.padStart(2, '0')}:${exp.mo.padStart(2, '0')}`);
                    updateReqEff(exp.y, exp.mo);
                  }
                }} />
            </div>
            <div>
              <label className="label">Experience</label>
              <div className="flex gap-2">
                <select className="input w-full" value={expYears} onChange={(e) => {
                  const y = e.target.value; setExpYears(y);
                  set(18, `${String(y).padStart(2, '0')}:${String(expMonths).padStart(2, '0')}`);
                  if (y !== '' && expMonths !== '') {
                    updateReqEff(y, expMonths);
                    set(11, expToJoinDate(y, expMonths));
                  }
                }}>
                  <option value="">Year</option>
                  {Array.from({ length: 31 }, (_, i) => i).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select className="input w-full" value={expMonths} onChange={(e) => {
                  const mo = e.target.value; setExpMonths(mo);
                  set(18, `${String(expYears).padStart(2, '0')}:${String(mo).padStart(2, '0')}`);
                  if (expYears !== '' && mo !== '') {
                    updateReqEff(expYears, mo);
                    set(11, expToJoinDate(expYears, mo));
                  }
                }}>
                  <option value="">Mon</option>
                  {Array.from({ length: 12 }, (_, i) => i).map((mo) => <option key={mo} value={mo}>{String(mo).padStart(2, '0')}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Req Eff Hrs (HH:MM)</label>
              <input type="text" className="input" placeholder="HH:MM"
                value={effHrs} onChange={(e) => {
                  const v = e.target.value; setEffHrs(v);
                  const n = parseWorkHrs(v);
                  if (!isNaN(n) && n > 0) set(7, (n / 0.08).toFixed(1));
                  else if (!v) set(7, '');
                }} />
            </div>
            <Field form={form} set={set} label="Shift" i={13} opts={sett.shifts?.map((s) => s.name)} />
            <Field form={form} set={set} label="Week Off" i={14} opts={sett.weekoffs?.map((w) => w.name)} />
            <div className="col-span-1 sm:col-span-2 lg:col-span-3">
              <div className="flex items-center gap-3 mt-2">
                <input type="checkbox" id="rotEnabled" className="accent-purple-600 w-4 h-4 cursor-pointer"
                  checked={form[17] === 'Yes'}
                  onChange={(e) => {
                    const n = [...form];
                    n[17] = e.target.checked ? 'Yes' : '';
                    if (!e.target.checked) { n[15] = ''; n[16] = ''; }
                    setForm(n);
                  }} />
                <label htmlFor="rotEnabled" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                  Enable +2 Additional Rotational Off Days
                </label>
              </div>
            </div>
            {form[17] === 'Yes' && (
              <>
                <Field form={form} set={set} label="Rotational Off Day 1" i={15} opts={Array.from({ length: 31 }, (_, i) => String(i + 1))} />
                <Field form={form} set={set} label="Rotational Off Day 2" i={16} opts={Array.from({ length: 31 }, (_, i) => String(i + 1))} />
              </>
            )}
            <div className="col-span-1 sm:col-span-2 lg:col-span-3"><Field form={form} set={set} label="Remarks" i={12} /></div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* Bulk Edit Modal */}
      {bulkEditModal && (
        <Modal title={`Bulk Edit — ${bulkEditModal.length} employee(s)`} onClose={() => { setBulkEditModal(null); setBulkEditForm({ shift: '', tl: '', designation: '', workHrs: '' }); }}>
          <p className="text-xs text-slate-500 mb-4">
            Only fields you fill in will be applied. Leave a field empty to skip it.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label flex items-center gap-1.5"><Briefcase size={12} /> Shift</label>
              <select className="input" value={bulkEditForm.shift}
                onChange={(e) => setBulkEditForm((f) => ({ ...f, shift: e.target.value }))}>
                <option value="">— Keep unchanged —</option>
                {(sett.shifts || []).map((s) => (
                  <option key={s.name} value={s.name}>{s.name} ({s.hours})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><Building2 size={12} /> Designation</label>
              <select className="input" value={bulkEditForm.designation}
                onChange={(e) => setBulkEditForm((f) => ({ ...f, designation: e.target.value }))}>
                <option value="">— Keep unchanged —</option>
                {sett.designations.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><Users size={12} /> Team Lead</label>
              <SearchableSelect
                value={bulkEditForm.tl}
                onChange={(v) => setBulkEditForm((f) => ({ ...f, tl: v }))}
                employees={tlOptions}
                placeholder="Search by name or EMP ID…"
              />
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><Clock size={12} /> Work Hrs/Day</label>
              <input type="text" className="input" placeholder="e.g. 08:30"
                value={bulkEditForm.workHrs}
                onChange={(e) => setBulkEditForm((f) => ({ ...f, workHrs: e.target.value }))} />
            </div>
          </div>

          {bulkEditModal.length > 0 && (
            <div className="p-3 bg-slate-50 rounded-xl mt-4">
              <p className="text-xs font-medium text-slate-500 mb-2">Selected ({bulkEditModal.length}):</p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {bulkEditModal.map((d) => (
                  <span key={d.sheetRow} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded border border-slate-200 text-xs text-slate-600">
                    <span className="font-mono text-slate-400 text-[10px]">{d.row[0]}</span>
                    {d.row[1]}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => { setBulkEditModal(null); setBulkEditForm({ shift: '', tl: '', designation: '', workHrs: '' }); }} className="btn-secondary">Cancel</button>
            <button onClick={bulkEdit} disabled={bulkEditSaving} className="btn-primary">
              {bulkEditSaving ? 'Saving…' : `Apply to ${bulkEditModal.length} employees`}
            </button>
          </div>
        </Modal>
      )}

      {/* Incomplete Data Modal */}
      {showIncomplete && (
        <Modal
          title={`Incomplete Employee Data — ${incompleteRows.length} of ${rows.length} employees`}
          onClose={closeIncompleteModal}
          wide
        >
          {incompleteRows.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-3 text-emerald-600">
              <CheckCircle2 size={40} className="opacity-80" />
              <p className="text-sm font-medium">All employees have the 5 mandatory fields filled in.</p>
            </div>
          ) : (
            <>
               {/* Search + Filters */}
               <div className="flex flex-wrap gap-2 mb-3">
                 <div className="relative flex-1 min-w-[180px] w-full sm:w-auto">
                   <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                   <input className="input pl-8 pr-8 text-sm w-full" placeholder="Search name or EMP ID…"
                     value={incompleteSearch}
                     onChange={(e) => setIncompleteSearch(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Escape') setIncompleteSearch(''); }} />
                   {incompleteSearch && (
                     <button
                       type="button"
                       className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                       onClick={() => setIncompleteSearch('')}
                     >
                       <X size={14} />
                     </button>
                   )}
                 </div>
                <select className="input w-full sm:w-44 text-sm" value={incompleteFTL} onChange={(e) => setIncompleteFTL(e.target.value)}>
                  <option value="All">All Team Leads</option>
                  <option value="None">— Not assigned —</option>
                  {incompleteTLOpts.map(tl => <option key={tl}>{tl}</option>)}
                </select>
                <select className="input w-full sm:w-40 text-sm" value={incompleteFShift} onChange={(e) => setIncompleteFShift(e.target.value)}>
                  <option value="All">All Shifts</option>
                  <option value="None">— Not assigned —</option>
                  {incompleteShiftOpts.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              {/* Select All row */}
              <div className="flex items-center gap-3 mb-2 px-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="accent-indigo-600 w-4 h-4 cursor-pointer"
                    checked={filteredIncomplete.length > 0 && filteredIncomplete.every(({ sheetRow }) => incompleteSelected.has(sheetRow))}
                    ref={el => { if (el) el.indeterminate = filteredIncomplete.some(({ sheetRow }) => incompleteSelected.has(sheetRow)) && !filteredIncomplete.every(({ sheetRow }) => incompleteSelected.has(sheetRow)); }}
                    onChange={toggleIncompleteAll} />
                  <span className="text-xs text-slate-600 font-medium">
                    Select all ({filteredIncomplete.length} shown)
                  </span>
                </label>
                {incompleteSelected.size > 0 && (
                  <>
                    <span className="text-xs font-semibold text-indigo-600">{incompleteSelected.size} selected</span>
                    <button onClick={() => setIncompleteSelected(new Set())}
                      className="text-xs text-slate-400 hover:text-slate-600 underline ml-auto">
                      Clear selection
                    </button>
                  </>
                )}
              </div>

              {/* Bulk Assign Panel */}
              {incompleteSelected.size > 0 && (
                <div className="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <p className="text-xs font-semibold text-indigo-700 mb-2">
                    Bulk Assign — {incompleteSelected.size} employee(s) selected
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                     <div>
                       <label className="text-[10px] text-slate-500 font-medium mb-0.5 block">Team Lead</label>
                       <SearchableSelect
                         value={incompleteBulkForm.tl}
                         onChange={(v) => setIncompleteBulkForm(f => ({ ...f, tl: v }))}
                         employees={tlOptions}
                         placeholder="Search by name or EMP ID…"
                       />
                     </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-medium mb-0.5 block">Shift</label>
                      <select className="input text-xs py-1.5" value={incompleteBulkForm.shift}
                        onChange={(e) => setIncompleteBulkForm(f => ({ ...f, shift: e.target.value }))}>
                        <option value="">— Keep unchanged —</option>
                        {(sett.shifts || []).map(s => <option key={s.name} value={s.name}>{s.name}{s.hours ? ` (${s.hours})` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-medium mb-0.5 block">Work Hrs / Day</label>
                      <input type="text" placeholder="e.g. 08:00" className="input text-xs py-1.5"
                        value={incompleteBulkForm.workHrs}
                        onChange={(e) => setIncompleteBulkForm(f => ({ ...f, workHrs: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-medium mb-0.5 block">Experience (auto-fills Join Date + Req Eff %)</label>
                      <div className="flex gap-1">
                        <select className="input text-xs py-1.5 w-full" value={incompleteBulkForm.expYears}
                          onChange={(e) => setIncompleteBulkForm(f => ({ ...f, expYears: e.target.value }))}>
                          <option value="">Yr</option>
                          {Array.from({ length: 31 }, (_, i) => i).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <select className="input text-xs py-1.5 w-full" value={incompleteBulkForm.expMonths}
                          onChange={(e) => setIncompleteBulkForm(f => ({ ...f, expMonths: e.target.value }))}>
                          <option value="">Mo</option>
                          {Array.from({ length: 12 }, (_, i) => i).map(mo => <option key={mo} value={mo}>{String(mo).padStart(2, '0')}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={applyIncompleteBulk} disabled={incompleteBulkSaving} className="btn-primary text-xs py-1.5 gap-1">
                      {incompleteBulkSaving ? 'Saving…' : `Apply to ${incompleteSelected.size} employee(s)`}
                    </button>
                  </div>
                </div>
              )}

              {/* Employee List */}
              <div ref={incompleteListRef} className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                {filteredIncomplete.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-8">No employees match the filters</p>
                ) : filteredIncomplete.map(({ row, sheetRow }, idx) => {
                  const missing = MANDATORY_FIELDS.filter(({ idx: fi, check }) => check(row[fi]));
                  const filled = MANDATORY_FIELDS.filter(({ idx: fi, check }) => !check(row[fi]));
                  const isSel = incompleteSelected.has(sheetRow);
                  return (
                    <div key={`${row[0]}-${idx}`}
                      className={`flex items-center gap-3 p-2.5 border rounded-xl transition-colors cursor-pointer ${isSel ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-100 bg-white hover:bg-slate-50'}`}
                      onClick={() => toggleIncompleteOne(sheetRow)}
                    >
                      <input type="checkbox" className="accent-indigo-600 w-4 h-4 cursor-pointer shrink-0"
                        checked={isSel} onChange={() => toggleIncompleteOne(sheetRow)}
                        onClick={(e) => e.stopPropagation()} />
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${isSel ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                        {(row[1] || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-slate-700 truncate">{row[1] || '—'}</p>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0 bg-slate-100 px-1.5 py-0.5 rounded">{row[0]}</span>
                          {row[6] && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${row[6] === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                              {row[6]}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {missing.map(f => (
                            <span key={f.idx} className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded font-semibold">✗ {f.label}</span>
                          ))}
                          {filled.map(f => (
                            <span key={f.idx} className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded font-medium">✓ {f.label}</span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); closeIncompleteModal(); openEdit(row, sheetRow); }}
                        className="btn-secondary py-1.5 px-2.5 text-xs gap-1 shrink-0"
                      >
                        <Pencil size={11} /> Fill
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ── Import Modal ── */}
      {importOpen && (
        <Modal title="Import Employees from Excel" onClose={() => { setImportOpen(false); setImportStep('upload'); setMapping({}); setExcelHeaders([]); setExcelData([]); setSheetDataMap({}); setSheetNames([]); setSelectedSheet(''); }} wide>
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
                <button onClick={exportToExcel} className="text-xs text-indigo-600 hover:underline font-medium" type="button">
                  Download current data as template →
                </button>
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
                const skippedCount = EMP_SYSTEM_COLS.length - matchedCount;
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
                {EMP_SYSTEM_COLS.map((sysCol, sysIdx) => {
                  const isReq = EMP_REQUIRED_COLS.includes(sysIdx);
                  const isMapped = mapping[sysIdx] !== undefined;
                  return (
                    <div key={sysIdx} className={`flex items-center gap-2 rounded-lg px-1.5 py-0.5 ${isMapped ? 'bg-emerald-50/60' : ''}`}>
                      <span className={`text-xs w-20 sm:w-36 shrink-0 truncate font-medium ${isMapped ? 'text-emerald-800' : 'text-slate-400'}`}>
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
                const mappedCols = EMP_SYSTEM_COLS.map((h, i) => ({ h, i })).filter(({ i }) => mapping[i] !== undefined);
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
                    {importing ? 'Importing…' : `Import ${mappedRows.length} Employees`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
