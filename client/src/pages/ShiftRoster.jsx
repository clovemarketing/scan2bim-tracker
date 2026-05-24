import { useEffect, useState, useMemo } from 'react';
import {
  Users, Sun, Moon, Sunset, Clock, CalendarDays, ChevronLeft, ChevronRight,
  RefreshCw, BarChart3, PieChart as PieChartIcon, Pencil, Search,
  FilterX, AlertTriangle,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';

import { api } from '../lib/api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import HolidayManager from './HolidayManager';

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6'];

const SHIFT_BG = {
  Morning: '#fef3c7', Afternoon: '#ffedd5', Night: '#e0e7ff', General: '#f1f5f9',
};
const SHIFT_BADGE = {
  Morning: 'bg-amber-100 text-amber-700',
  Afternoon: 'bg-orange-100 text-orange-700',
  Night: 'bg-indigo-100 text-indigo-700',
  General: 'bg-slate-200 text-slate-700',
};
const SHIFT_CARD = {
  Morning: { icon: Sun, color: 'bg-amber-500', label: 'Morning', shift: '08:00–16:00' },
  Afternoon: { icon: Sunset, color: 'bg-orange-500', label: 'Afternoon', shift: '16:00–00:00' },
  Night: { icon: Moon, color: 'bg-indigo-500', label: 'Night', shift: '00:00–08:00' },
  General: { icon: Clock, color: 'bg-slate-500', label: 'General', shift: '09:00–18:00' },
};
const CARD_ORDER = ['Morning', 'Afternoon', 'Night', 'General'];
const CARD_COLORS = ['bg-cyan-500', 'bg-pink-500', 'bg-teal-500', 'bg-violet-500', 'bg-rose-500', 'bg-lime-500', 'bg-blue-500'];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FILTER_OPTS = [
  { key: 'all', label: 'All Employees' },
  { key: 'no-shift', label: 'Unassigned Shift', icon: AlertTriangle },
  { key: 'no-weekoff', label: 'Unassigned Week Off', icon: AlertTriangle },
  { key: 'unassigned', label: 'Both Unassigned', icon: AlertTriangle },
];

function getWeekOffDays(weekOffName, year, month) {
  if (!weekOffName) return [];
  const days = [];
  const numDays = new Date(year, month, 0).getDate();
  for (let d = 1; d <= numDays; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    if (weekOffName === 'Sunday' && dow === 0) days.push(d);
    else if (weekOffName === 'Saturday-Sunday' && (dow === 6 || dow === 0)) days.push(d);
    else if (weekOffName === 'Monday' && dow === 1) days.push(d);
  }
  return days;
}

function distributeRotationalOffs(employees, year, month, overrides = {}) {
  const numDays = new Date(year, month, 0).getDate();
  const rotOffMap = {};
  const active = employees.filter((e) => e[6] === 'Active' && e[0]);
  active.forEach((_, i) => {
    const emp = active[i];
    const empId = emp[0];
    if (emp[17] !== 'Yes') { rotOffMap[empId] = new Set(); return; }
    const override = overrides[`${empId}_${year}_${month}`];
    if (override) {
      rotOffMap[empId] = new Set(override);
      return;
    }
    const offDays = new Set();
    const empD1 = parseInt(emp[15]);
    const empD2 = parseInt(emp[16]);
    if (empD1 && empD2) {
      offDays.add(empD1);
      offDays.add(empD2);
    } else {
      const day1 = (i % numDays) + 1;
      const day2 = ((i + Math.floor(active.length / 2)) % numDays) + 1;
      offDays.add(day1);
      offDays.add(day2);
    }
    rotOffMap[empId] = offDays;
  });
  return rotOffMap;
}

function MonthCalendar({ year, month, employees, rotOffs, holidaySet }) {
  const [weekOffCache, setWeekOffCache] = useState({});
  const numDays = new Date(year, month, 0).getDate();

  useEffect(() => {
    const cache = {};
    employees.forEach((e) => {
      const key = `${e[14]}_${year}_${month}`;
      if (!cache[key]) cache[key] = getWeekOffDays(e[14], year, month);
    });
    setWeekOffCache(cache);
  }, [employees, year, month]);

  const activeEmp = useMemo(() => employees.filter((e) => e[6] === 'Active' && e[0]), [employees]);

  function isHoliday(day) {
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return holidaySet ? holidaySet.has(ds) : false;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm">
      <table className="min-w-full bg-white text-xs">
        <thead>
          <tr className="bg-slate-50">
            <th className="th text-xs sticky left-0 bg-slate-50 z-10 min-w-[140px]">Employee</th>
            <th className="th text-xs min-w-[60px]">Shift</th>
            {Array.from({ length: numDays }, (_, i) => {
              const dow = WEEKDAYS[new Date(year, month - 1, i + 1).getDay()];
              const holiday = isHoliday(i + 1);
              return (
                <th key={i} className={`th text-xs text-center min-w-[32px] px-1 ${holiday ? 'bg-green-50' : dow === 'Sun' ? 'bg-red-50' : ''}`}>
                  <span className="text-[9px] text-slate-400 font-normal block leading-tight">{dow.slice(0, 2)}</span>
                  <span className="block leading-tight">{i + 1}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {(() => {
            const shiftOrder = [...new Set([...CARD_ORDER, ...activeEmp.map((e) => e[13]).filter(Boolean)])];
            const unassigned = activeEmp.filter((e) => !e[13]);
            const groups = [
              ...shiftOrder.map((shift) => ({ shift, emps: activeEmp.filter((e) => e[13] === shift) })).filter((g) => g.emps.length > 0),
              ...(unassigned.length ? [{ shift: 'Unassigned', emps: unassigned }] : []),
            ];
            return groups.flatMap(({ shift, emps }) => [
              <tr key={`hdr-${shift}`}>
                <td colSpan={numDays + 2} className="td font-semibold text-xs" style={{ backgroundColor: SHIFT_BG[shift] || '#f1f5f9' }}>
                  {shift} ({emps.length})
                </td>
              </tr>,
              ...emps.map((emp, idx) => {
            const wOffName = emp[14];
            const wOffDays = weekOffCache[`${wOffName}_${year}_${month}`] || [];
            const empRotOffs = rotOffs[emp[0]] || new Set();
            return (
              <tr key={`${emp[0]}-${idx}`} className="tr">
                <td className="td font-medium text-xs sticky left-0 bg-white z-10 min-w-[140px]">
                  <span className="truncate block max-w-[130px]" title={emp[1]}>{emp[1]}</span>
                </td>
                <td className="td px-1.5 py-2">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${SHIFT_BADGE[emp[13]] || 'bg-slate-100 text-slate-600'}`}>
                    {emp[13] ? emp[13].charAt(0).toUpperCase() : '—'}
                  </span>
                </td>
                {Array.from({ length: numDays }, (_, i) => {
                  const day = i + 1;
                  const dow = new Date(year, month - 1, day).getDay();
                  const isHolidayDay = isHoliday(day);
                  const isWeekOff = wOffDays.includes(day);
                  const isRotOff = empRotOffs.has(day);
                  const isSun = dow === 0;
                  let cls = 'td text-center px-1 py-2 text-[11px]';
                  let bg = '';
                  if (isHolidayDay) { bg = 'bg-green-100 text-green-600 font-semibold'; }
                  else if (isRotOff) { bg = 'bg-purple-100 text-purple-600 font-semibold'; }
                  else if (isWeekOff) { bg = 'bg-red-100 text-red-500'; }
                  else if (isSun) { bg = 'bg-slate-50 text-slate-400'; }
                  const label = isHolidayDay ? 'H' : isRotOff ? 'R' : isWeekOff ? 'W' : '✓';
                  return (
                    <td key={i} className={`${cls} ${bg}`}>
                      {label}
                    </td>
                  );
                })}
              </tr>
            );
          }),
            ]);
          })()}
        </tbody>
      </table>
    </div>
  );
}

export default function ShiftRoster({ toast }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employees, setEmployees] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('roster');
  const [matrixFilter, setMatrixFilter] = useState('all');
  const [matrixSearch, setMatrixSearch] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ shift: '', weekOff: '' });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState({ shift: '', weekOff: '' });

  const [empRowIndex, setEmpRowIndex] = useState({});
  const [rotOverrides, setRotOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`rotOverrides`) || '{}'); }
    catch { return {}; }
  });
  const rotOffKey = `${year}_${month}`;
  const getRotKey = (empId) => `${empId}_${rotOffKey}`;
  useEffect(() => { localStorage.setItem('rotOverrides', JSON.stringify(rotOverrides)); }, [rotOverrides]);

  const [holidays, setHolidays] = useState([]);
  const [holidayModal, setHolidayModal] = useState(false);
  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);

  const load = async () => {
    setLoading(true);
    try {
      const [empData, settData, holidayData] = await Promise.all([api.employees(), api.settings(), api.getHolidays(year)]);
      setEmployees(empData.data || []);
      if (empData.rowIndices) {
        const idxMap = {};
        (empData.data || []).forEach((e, i) => { if (e[0]) idxMap[e[0]] = empData.rowIndices[i]; });
        setEmpRowIndex(idxMap);
      }
      setSettings(settData);
      setHolidays(holidayData.holidays || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [year]);

  const activeEmp = useMemo(() => employees.filter((e) => e[6] === 'Active' && e[0]), [employees]);
  const allEmp = useMemo(() => employees.filter((e) => e[0]), [employees]);
  const rotOffs = useMemo(() => distributeRotationalOffs(employees, year, month, rotOverrides), [employees, year, month, rotOverrides]);

  const stats = useMemo(() => {
    const total = allEmp.length;
    const shiftCounts = {};
    const weekOffCounts = {};
    allEmp.forEach((e) => {
      const s = e[13] || 'Unassigned';
      shiftCounts[s] = (shiftCounts[s] || 0) + 1;
      const w = e[14] || 'Unassigned';
      weekOffCounts[w] = (weekOffCounts[w] || 0) + 1;
    });
    const rotOffCount = Object.values(rotOffs).filter((s) => s.size > 0).length;
    return { total, shiftCounts, weekOffCounts, rotOffCount };
  }, [allEmp, rotOffs]);

  const shiftChartData = useMemo(() => Object.entries(stats.shiftCounts).map(([name, value]) => ({ name, value })), [stats]);
  const rotOffTotal = useMemo(() => {
    let total = 0;
    Object.values(rotOffs).forEach((s) => total += s.size);
    return total;
  }, [rotOffs]);
  const weekOffChartData = useMemo(() => {
    const data = Object.entries(stats.weekOffCounts).map(([name, value]) => ({ name, value }));
    if (rotOffTotal > 0) data.push({ name: 'Rotational Off', value: rotOffTotal });
    return data;
  }, [stats, rotOffTotal]);

  const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
  const prevMonth = () => { if (month === 1) { setYear((y) => y - 1); setMonth(12); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear((y) => y + 1); setMonth(1); } else setMonth((m) => m + 1); };

  // ── Edit handlers ──────────────────────────────────────────────────────
  const numDays = new Date(year, month, 0).getDate();

  const openEdit = (emp) => {
    setEditForm({
      shift: emp[13] || '',
      weekOff: emp[14] || '',
      rotEnabled: emp[17] === 'Yes',
      rotDay1: emp[15] ? String(emp[15]) : '',
      rotDay2: emp[16] ? String(emp[16]) : '',
    });
    setEditModal(emp);
  };

  const saveEdit = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      const empId = editModal[0];
      const row = employees.find((e) => e[0] === empId);
      if (!row) return;
      const updated = [...row];
      while (updated.length < 18) updated.push('');
      updated[13] = editForm.shift;
      updated[14] = editForm.weekOff;
      updated[17] = editForm.rotEnabled ? 'Yes' : '';
      const d1 = parseInt(editForm.rotDay1);
      const d2 = parseInt(editForm.rotDay2);
      updated[15] = d1 ? String(d1) : '';
      updated[16] = d2 ? String(d2) : '';
      const sheetRow = empRowIndex[empId];
      if (!sheetRow) { toast.error('Could not find employee row'); setSaving(false); return; }
      await api.updateEmployee(sheetRow, updated);

      // Save / clear rotational off overrides
      const newOverrides = { ...rotOverrides };
      const key = getRotKey(empId);
      if (d1 || d2) {
        if (d1 && d2) newOverrides[key] = [d1, d2];
        else if (d1) newOverrides[key] = [d1];
      } else {
        delete newOverrides[key];
      }
      setRotOverrides(newOverrides);

      toast.success('Shift, week-off & rotational offs updated');
      setEditModal(null);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // ── Matrix filter logic ────────────────────────────────────────────────
  const filteredMatrix = useMemo(() => {
    let list = employees.filter((e) => e[0]);
    if (matrixSearch.trim()) {
      const q = matrixSearch.trim().toLowerCase();
      list = list.filter((e) =>
        (e[0] || '').toLowerCase().includes(q) ||
        (e[1] || '').toLowerCase().includes(q) ||
        (e[4] || '').toLowerCase().includes(q)
      );
    }
    if (matrixFilter === 'no-shift') return list.filter((e) => !e[13]);
    if (matrixFilter === 'no-weekoff') return list.filter((e) => !e[14]);
    if (matrixFilter === 'unassigned') return list.filter((e) => !e[13] && !e[14]);
    return list;
  }, [employees, matrixFilter, matrixSearch]);

  const unassignedCount = useMemo(() =>
    employees.filter((e) => e[0] && (!e[13] || !e[14])).length,
  [employees]);

  // ── Bulk selection helpers ─────────────────────────────────────────────
  const filteredEmpIds = useMemo(() => new Set(filteredMatrix.map((e) => e[0])), [filteredMatrix]);
  const allFilteredSelected = filteredMatrix.length > 0 && filteredMatrix.every((e) => selected.has(e[0]));
  const someFilteredSelected = filteredMatrix.some((e) => selected.has(e[0]));

  const toggleAll = () => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allFilteredSelected) filteredEmpIds.forEach((id) => n.delete(id));
      else filteredMatrix.forEach((e) => n.add(e[0]));
      return n;
    });
  };
  const toggleRow = (empId) => setSelected((prev) => {
    const n = new Set(prev);
    n.has(empId) ? n.delete(empId) : n.add(empId);
    return n;
  });

  const saveBulkAssign = async () => {
    setSaving(true);
    try {
      const updates = [];
      for (const empId of selected) {
        const row = employees.find((e) => e[0] === empId);
        if (!row) continue;
        const updated = [...row];
        if (bulkForm.shift) updated[13] = bulkForm.shift;
        if (bulkForm.weekOff) updated[14] = bulkForm.weekOff;
        const sheetRow = empRowIndex[empId];
        if (!sheetRow) continue;
        updates.push({ row: sheetRow, values: updated });
      }
      if (updates.length) {
        await api.bulkUpdate('EMPLOYEES', updates);
        toast.success(`${updates.length} employees updated`);
      }
      setBulkModal(false);
      setSelected(new Set());
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  function ShiftStatCard({ label, shift, count, sub, icon: Icon, color }) {
    return (
      <div className="card flex items-center gap-4">
        <div className={`p-3 rounded-xl ${color}`}><Icon size={20} className="text-white" /></div>
        <div>
          <p className="text-2xl font-bold text-slate-800 leading-tight">{count}</p>
          <p className="text-sm font-medium text-slate-700">{label}</p>
          {shift && <p className="text-xs text-slate-400 mt-0.5">{shift}</p>}
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    );
  }

  function ShiftStatCardSkeleton() {
    return (
      <div className="card flex items-center gap-2 sm:gap-4">
        <div className="skeleton skeleton-icon-box sm:w-11 sm:h-11" style={{ width: 32, height: 32 }} />
        <div>
          <div className="skeleton sm:w-13 sm:h-7" style={{ width: 40, height: 22 }} />
          <div className="skeleton mt-1 sm:w-24 sm:h-3.5" style={{ width: '80%', height: 11 }} />
          <div className="skeleton mt-0.5 sm:w-20 sm:h-3" style={{ width: '60%', height: 10 }} />
        </div>
      </div>
    );
  }

  function RosterTableSkeleton() {
    const numDays = new Date(year, month, 0).getDate();
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm">
        <table className="min-w-full bg-white text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="th text-xs" style={{ minWidth: 140 }}><div className="skeleton" style={{ width: 80, height: 12 }} /></th>
              <th className="th text-xs" style={{ minWidth: 60 }}><div className="skeleton" style={{ width: 40, height: 12 }} /></th>
              {Array.from({ length: Math.min(numDays, 15) }).map((_, i) => (
                <th key={i} className="th text-xs text-center" style={{ minWidth: 32 }}>
                  <div className="skeleton" style={{ width: 20, height: 12, margin: '0 auto' }} />
                </th>
              ))}
              {numDays > 15 && <th className="th text-xs text-center" style={{ minWidth: 32 }}>…</th>}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, r) => (
              <tr key={r} className="border-b border-slate-50">
                <td className="td"><div className="skeleton" style={{ width: 120, height: 13 }} /></td>
                <td className="td"><div className="skeleton" style={{ width: 28, height: 16, borderRadius: 4 }} /></td>
                {Array.from({ length: Math.min(numDays, 16) }).map((_, c) => (
                  <td key={c} className="td text-center px-1"><div className="skeleton" style={{ width: 16, height: 13, margin: '0 auto' }} /></td>
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="skeleton" style={{ width: 160, height: 24 }} />
          <div className="skeleton mt-1.5" style={{ width: 240, height: 14 }} />
        </div>
        <div className="flex gap-2">
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 160, height: 34, borderRadius: 8 }} />
        </div>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
        <ShiftStatCardSkeleton />
        <ShiftStatCardSkeleton />
        <ShiftStatCardSkeleton />
        <ShiftStatCardSkeleton />
        <ShiftStatCardSkeleton />
        <ShiftStatCardSkeleton />
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: 180, height: 22 }} />
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
        </div>
      </div>
      <RosterTableSkeleton />
    </div>
  );

  return (
    <div className="page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="page-title">Shift Roster</h1>
          <p className="page-sub">{stats.total} employees ({activeEmp.length} active) · 4+2 rotational week-off system</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={load} className="btn-secondary"><RefreshCw size={14} /></button>
          <div className="flex bg-slate-100 p-0.5 rounded-lg">
            <button onClick={() => setView('roster')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === 'roster' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
              <CalendarDays size={14} className="inline mr-1" />Roster
            </button>
            <button onClick={() => setView('distribution')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === 'distribution' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
              <BarChart3 size={14} className="inline mr-1" />Distribution
            </button>
          </div>
        </div>
      </div>

      {/* Stat Cards — dynamic: all shift names from data */}
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
        <ShiftStatCard label="Total Employees" count={stats.total} sub={`${activeEmp.length} active`} icon={Users} color="bg-indigo-500" />
        {(() => {
          const known = new Set(CARD_ORDER);
          const knownCards = CARD_ORDER.filter((n) => (stats.shiftCounts[n] || 0) > 0).map((n) => {
            const def = SHIFT_CARD[n];
            return <ShiftStatCard key={n} label={def.label} shift={def.shift} count={stats.shiftCounts[n]} icon={def.icon} color={def.color} />;
          });
          const customShifts = Object.entries(stats.shiftCounts)
            .filter(([n]) => !known.has(n) && n !== 'Unassigned')
            .map(([n, c], i) => (
              <ShiftStatCard key={n} label={n} count={c} icon={Clock} color={CARD_COLORS[i % CARD_COLORS.length]} />
            ));
          return [...knownCards, ...customShifts];
        })()}
        <ShiftStatCard label="Unassigned" shift="no shift set" count={stats.shiftCounts['Unassigned'] || 0} icon={AlertTriangle} color="bg-red-500" />
      </div>

      {/* Roster View */}
      {view === 'roster' ? (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-3">
              <button onClick={prevMonth} className="btn-secondary p-2 shrink-0"><ChevronLeft size={16} /></button>
              <h2 className="text-lg font-semibold text-slate-700 min-w-[160px] text-center">
                {monthName} {year}
              </h2>
              <button onClick={nextMonth} className="btn-secondary p-2 shrink-0"><ChevronRight size={16} /></button>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-purple-100 border border-purple-200 shrink-0" /> Rotational Off
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-red-100 border border-red-200 shrink-0" /> Week Off
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-green-100 border border-green-200 shrink-0" /> Holiday
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-50 border border-slate-200 shrink-0" /> Sunday
              </span>
              <button onClick={() => setHolidayModal(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline shrink-0">
                Manage Holidays
              </button>
            </div>
          </div>

          {activeEmp.length === 0 ? (
            <div className="card text-center py-12 text-slate-400">No active employees found</div>
          ) : (
            <MonthCalendar year={year} month={month} employees={employees} rotOffs={rotOffs} holidaySet={holidaySet} />
          )}

          {/* 4+2 Summary */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-6">
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">4+2 Week-Off Summary</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between px-4 py-3 bg-purple-50 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-purple-700">Rotational Offs This Month</p>
                    <p className="text-xs text-purple-500">{stats.rotOffCount} employees with rotational offs</p>
                  </div>
                  <span className="text-2xl font-bold text-purple-600">{monthName}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-red-50 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-red-700">Regular Week Offs</p>
                    <p className="text-xs text-red-500">4 weekly offs per employee (rotational basis)</p>
                  </div>
                  <span className="text-2xl font-bold text-red-600">4</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-amber-50 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-amber-700">Additional Offs</p>
                    <p className="text-xs text-amber-500">+2 rotational offs distributed across team</p>
                  </div>
                  <span className="text-2xl font-bold text-amber-600">+2</span>
                </div>
              </div>
            </div>

            <div className="card xl:col-span-2">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Shift & Week-Off Distribution</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th text-xs">Shift</th>
                      <th className="th text-xs">Timing</th>
                      <th className="th text-xs text-center">Count</th>
                      {(settings?.weekoffs || []).map((w) => (
                        <th key={w.name} className="th text-xs text-center">{w.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(settings?.shifts || []).map((s) => {
                      const shiftEmps = activeEmp.filter((e) => e[13] === s.name);
                      return (
                        <tr key={s.name} className="tr">
                          <td className="td font-medium">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${SHIFT_BADGE[s.name] || 'bg-slate-100 text-slate-600'}`}>
                              {s.name}
                            </span>
                          </td>
                          <td className="td text-slate-500">{s.hours || '—'}</td>
                          <td className="td text-center font-semibold">{shiftEmps.length}</td>
                          {(settings?.weekoffs || []).map((w) => (
                            <td key={w.name} className="td text-center">{shiftEmps.filter((e) => e[14] === w.name).length}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Distribution View */
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <PieChartIcon size={16} className="text-indigo-500" /> Shift Distribution
              </h3>
              {shiftChartData.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={shiftChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                      {shiftChartData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-slate-400 text-sm text-center py-8">No data</p>}
            </div>

            <div className="card">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-indigo-500" /> Week-Off Patterns
              </h3>
              {weekOffChartData.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={weekOffChartData} barSize={40}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} name="Employees">
                      {weekOffChartData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-slate-400 text-sm text-center py-8">No data</p>}
            </div>
          </div>

          {/* Employee Shift Matrix with Filters & Edit */}
          <div className="card">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h3 className="text-sm font-semibold text-slate-700">Employee Shift Matrix</h3>
              {unassignedCount > 0 && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg font-medium">
                  {unassignedCount} need assignment
                </span>
              )}
            </div>

            {/* Filter & Search Toolbar */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9 text-sm" placeholder="Search by name, ID, dept…"
                  value={matrixSearch} onChange={(e) => setMatrixSearch(e.target.value)} />
              </div>
              <div className="overflow-x-auto">
                <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg w-fit">
                  {FILTER_OPTS.map((f) => {
                    const active = matrixFilter === f.key;
                    return (
                      <button key={f.key} onClick={() => setMatrixFilter(f.key)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 whitespace-nowrap ${
                          active ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
                        }`}>
                        {f.key !== 'all' && <AlertTriangle size={11} />}
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {matrixFilter !== 'all' && (
                <button onClick={() => { setMatrixFilter('all'); setMatrixSearch(''); }}
                  className="btn-secondary text-xs py-1.5 px-2 gap-1">
                  <FilterX size={12} /> Clear
                </button>
              )}
            </div>

            {/* Bulk action bar */}
            {selected.size > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl mb-4 flex-wrap">
                <span className="text-sm font-semibold text-indigo-700">{selected.size} selected</span>
                <div className="h-4 w-px bg-indigo-200" />
                <button onClick={() => { setBulkForm({ shift: '', weekOff: '' }); setBulkModal(true); }}
                  className="btn-secondary text-xs py-1.5 gap-1.5">
                  <Pencil size={11} /> Assign Shift & Week Off
                </button>
                <button onClick={() => setSelected(new Set())}
                  className="ml-auto text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
                  <FilterX size={12} /> Clear
                </button>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 w-10">
                      <input type="checkbox" className="accent-indigo-600 cursor-pointer"
                        checked={allFilteredSelected}
                        ref={(el) => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected; }}
                        onChange={toggleAll} />
                    </th>
                    <th className="th text-xs">EMP ID</th>
                    <th className="th text-xs">Employee</th>
                    <th className="th text-xs">Department</th>
                    <th className="th text-xs">Shift</th>
                    <th className="th text-xs">Week Off</th>
                    <th className="th text-xs text-center">Rot Day 1</th>
                    <th className="th text-xs text-center">Rot Day 2</th>
                    <th className="th text-xs text-center">Status</th>
                    <th className="th text-xs text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMatrix.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="td text-center text-slate-400 py-12">
                        {matrixSearch ? 'No results match your search' : 'No employees found'}
                      </td>
                    </tr>
                  ) : (
                    filteredMatrix.sort((a, b) => {
                      const order = ['Morning', 'Afternoon', 'Night', 'General'];
                      return (order.indexOf(a[13]) || 99) - (order.indexOf(b[13]) || 99);
                    }).map((emp, idx) => {
                      const noShift = !emp[13];
                      const noWeekOff = !emp[14];
                      const isSelected = selected.has(emp[0]);
                      return (
                        <tr key={`${emp[0]}-${idx}`}
                          className={`border-b border-slate-50 transition-colors ${isSelected ? 'bg-indigo-50/60' : (noShift || noWeekOff) ? 'bg-amber-50/40' : 'hover:bg-indigo-50/30'}`}>
                          <td className="px-3 py-2.5">
                            <input type="checkbox" className="accent-indigo-600 cursor-pointer"
                              checked={isSelected} onChange={() => toggleRow(emp[0])} />
                          </td>
                          <td className="td font-mono text-slate-500">{emp[0]}</td>
                          <td className="td font-medium">
                            <span className="flex items-center gap-1.5">
                              {emp[1]}
                              {(noShift || noWeekOff) && <AlertTriangle size={11} className="text-amber-500 shrink-0" />}
                            </span>
                          </td>
                          <td className="td text-slate-500">{emp[4] || '—'}</td>
                          <td className="td">
                            {noShift ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-500 border border-red-200">
                                Unassigned
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${SHIFT_BADGE[emp[13]] || 'bg-slate-100 text-slate-600'}`}>
                                {emp[13]}
                              </span>
                            )}
                          </td>
                          <td className="td text-slate-500">
                            {noWeekOff ? (
                              <span className="text-red-400 text-[10px] font-medium">Not set</span>
                            ) : emp[14]}
                          </td>
                          <td className="td text-center">
                            {emp[17] === 'Yes'
                              ? emp[15]
                                ? <span className="inline-block px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-semibold">Day {emp[15]}</span>
                                : <span className="text-purple-400 text-[10px]">Auto</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="td text-center">
                            {emp[17] === 'Yes'
                              ? emp[16]
                                ? <span className="inline-block px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-semibold">Day {emp[16]}</span>
                                : <span className="text-purple-400 text-[10px]">Auto</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="td text-center"><Badge value={emp[6]} /></td>
                          <td className="td text-center">
                            <button onClick={() => openEdit(emp)}
                              className="btn-secondary py-1 px-2 text-xs gap-1">
                              <Pencil size={10} /> Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Edit Shift/Week-Off Modal */}
      {editModal && (
        <Modal title={`Edit Shift & Week Off — ${editModal[1] || editModal[0]}`} onClose={() => setEditModal(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Shift</label>
              <select className="input w-full" value={editForm.shift} onChange={(e) => setEditForm((f) => ({ ...f, shift: e.target.value }))}>
                <option value="">— Not Assigned —</option>
                {(settings?.shifts || []).map((s) => (
                  <option key={s.name} value={s.name}>{s.name} ({s.hours})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Week Off</label>
              <select className="input w-full" value={editForm.weekOff} onChange={(e) => setEditForm((f) => ({ ...f, weekOff: e.target.value }))}>
                <option value="">— Not Assigned —</option>
                {(settings?.weekoffs || []).map((w) => (
                  <option key={w.name} value={w.name}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 p-3 bg-purple-50 rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <input type="checkbox" id="modalRotEnabled" className="accent-purple-600 w-4 h-4 cursor-pointer"
                checked={editForm.rotEnabled}
                onChange={(e) => setEditForm((f) => ({ ...f, rotEnabled: e.target.checked, rotDay1: '', rotDay2: '' }))} />
              <label htmlFor="modalRotEnabled" className="text-xs font-semibold text-purple-700 cursor-pointer select-none">
                +2 Additional Rotational Off Days ({monthName} {year})
              </label>
            </div>
            {editForm.rotEnabled && (
              <>
                <p className="text-xs text-purple-500 mb-3">Leave blank to auto-distribute. These are the 2 extra off days beyond the regular weekly off.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Rotational Off Day 1</label>
                    <select className="input w-full" value={editForm.rotDay1} onChange={(e) => setEditForm((f) => ({ ...f, rotDay1: e.target.value }))}>
                      <option value="">— Auto —</option>
                      {Array.from({ length: numDays }, (_, i) => (
                        <option key={i + 1} value={i + 1}>Day {i + 1}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Rotational Off Day 2</label>
                    <select className="input w-full" value={editForm.rotDay2} onChange={(e) => setEditForm((f) => ({ ...f, rotDay2: e.target.value }))}>
                      <option value="">— Auto —</option>
                      {Array.from({ length: numDays }, (_, i) => (
                        <option key={i + 1} value={i + 1}>Day {i + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={saveEdit} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* Holiday Manager Modal */}
      {holidayModal && (
        <Modal title="Manage Holidays" onClose={() => setHolidayModal(false)} wide>
          <HolidayManager toast={toast} year={year} embedded onClose={() => { setHolidayModal(false); load(); }} />
        </Modal>
      )}

      {/* Bulk Assign Modal */}
      {bulkModal && (
        <Modal title={`Assign Shift & Week Off (${selected.size} employees)`} onClose={() => setBulkModal(false)}>
          <p className="text-xs text-slate-500 mb-4">
            Only fields you fill in will be applied. Leave a field empty to skip it.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Shift</label>
              <select className="input w-full" value={bulkForm.shift} onChange={(e) => setBulkForm((f) => ({ ...f, shift: e.target.value }))}>
                <option value="">— Keep unchanged —</option>
                {(settings?.shifts || []).map((s) => (
                  <option key={s.name} value={s.name}>{s.name} ({s.hours})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Week Off</label>
              <select className="input w-full" value={bulkForm.weekOff} onChange={(e) => setBulkForm((f) => ({ ...f, weekOff: e.target.value }))}>
                <option value="">— Keep unchanged —</option>
                {(settings?.weekoffs || []).map((w) => (
                  <option key={w.name} value={w.name}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>
          {selected.size > 0 && (
            <div className="mt-4 p-3 bg-slate-50 rounded-xl">
              <p className="text-xs font-medium text-slate-500 mb-2">Selected ({selected.size}):</p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {[...selected].map((id) => {
                  const emp = employees.find((e) => e[0] === id);
                  return emp ? (
                    <span key={id} className="inline-block px-2 py-0.5 bg-white rounded text-xs text-slate-600 border border-slate-200">
                      {emp[1] || id}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setBulkModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={saveBulkAssign} disabled={saving || (!bulkForm.shift && !bulkForm.weekOff)} className="btn-primary">
              {saving ? 'Saving…' : `Apply to ${selected.size} employees`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
