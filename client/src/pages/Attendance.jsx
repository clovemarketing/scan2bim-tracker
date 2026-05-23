import { useEffect, useState, useMemo, useRef } from 'react';
import { RefreshCw, Plus, Trash2, Clock, ChevronDown, ChevronRight, Search, Timer, Pencil, Columns } from 'lucide-react';
import { api } from '../lib/api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';

const STATUS_OPTS = ['P','A','L','WFH','OD','HD','H'];
const STATUS_LABELS = { P:'Present', A:'Absent', L:'Leave', WFH:'Work From Home', OD:'On Duty', HD:'Half Day', H:'Holiday' };
const PAGE_OPTS = [10, 20, 50, 100, 'All'];

function autoColon(val) {
  const digits = val.replace(/[^\d]/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ':' + digits.slice(2);
}

function fmtHrs(val) {
  const total = Math.round(parseFloat(val) || 0);
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function toDecimalHrs(hrs, mins) {
  return Math.round((parseInt(hrs || 0) + parseInt(mins || 0) / 60) * 100) / 100;
}

export default function Attendance({ toast, currentUser }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [empData, setEmpData] = useState([]);
  const [inProgProjects, setInProgProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionModal, setSessionModal] = useState(null);
  const [sessionForm, setSessionForm] = useState({ projId:'', projName:'', hrsHhmm:'', miscHhmm:'', actEffHrs:'', remarks:'' });
  const [savingSession, setSavingSession] = useState(false);
  const [editModal, setEditModal] = useState(null); // { emp, sess }
  const [editForm, setEditForm] = useState({ projId:'', projName:'', hrsHhmm:'', miscHhmm:'', actEffHrs:'', remarks:'' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [statusSaving, setStatusSaving] = useState({});
  const [empAssignments, setEmpAssignments] = useState({});
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [tlFilter, setTlFilter] = useState('All');
  const [projFilter, setProjFilter] = useState('All');
  const [tlMap, setTlMap] = useState({});
  const [tab, setTab] = useState('today');
  const [history, setHistory] = useState({ headers:[], data:[] });
  const [histPage, setHistPage] = useState(0);
  const [histPageSize, setHistPageSize] = useState(10);
  const [histHiddenCols, setHistHiddenCols] = useState(() => {
    try {
      const s = localStorage.getItem('att_hist_hidden_cols');
      if (s) return new Set(JSON.parse(s));
    } catch {}
    return new Set();
  });
  const [histFilterEmp, setHistFilterEmp] = useState('All');
  const [histDateFrom, setHistDateFrom] = useState('');
  const [histDateTo, setHistDateTo] = useState('');
  const [histPreset, setHistPreset] = useState('all');
  const [histFilterDept, setHistFilterDept] = useState('All');
  const [histFilterTl, setHistFilterTl] = useState('All');
  const [todayPage, setTodayPage] = useState(0);
  const [todayPageSize, setTodayPageSize] = useState(10);
  const [showHistColMenu, setShowHistColMenu] = useState(false);
  const colMenuRef = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setShowHistColMenu(false); };
    if (showHistColMenu) { document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler); }
  }, [showHistColMenu]);
  useEffect(() => {
    try { localStorage.setItem('att_hist_hidden_cols', JSON.stringify([...histHiddenCols])); } catch {}
  }, [histHiddenCols]);
  const [empRows, setEmpRows] = useState([]);
  const [projTypeMap, setProjTypeMap] = useState({}); // projId → { isQaqc, isClientFb }
  const [histTypeFilter, setHistTypeFilter] = useState('All'); // All | QC | Feedback | Regular
  const [projToEmployees, setProjToEmployees] = useState({}); // projId → Set<empId>

  const load = async () => {
    setLoading(true);
    try {
      const [att, projs, empRes, typeMap, empMapData] = await Promise.all([
        api.attendanceToday(date),
        api.inProgressProjects(),
        api.employees(),
        api.projectTypes().catch(() => ({})),
        api.empMap().catch(() => ({ data: [] })),
      ]);
      setEmpData(att.employees || []);
      setInProgProjects(projs);
      setProjTypeMap(typeMap || {});
      const rows = empRes.data || [];
      setEmpRows(rows);
      const map = {};
      rows.forEach((r) => { if (r[0] && r[3]) map[r[0]] = r[3]; });
      setTlMap(map);
      const pMap = {};
      (empMapData.data || []).forEach((r) => {
        const projId = r[4], empId = r[2];
        if (projId && empId) {
          if (!pMap[projId]) pMap[projId] = new Set();
          pMap[projId].add(empId);
        }
      });
      setProjToEmployees(pMap);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const loadHistory = async () => {
    try { const d = await api.attStore(); setHistory(d); setHistPage(0); }
    catch (e) { toast.error(e.message); }
    setEmpRows((prev) => prev);
  };

  const employeeRatioMap = useMemo(() => {
    const m = {};
    (Array.isArray(empRows) ? empRows : []).forEach((e) => {
      if (e[0]) m[e[0]] = parseFloat(e[7]) || 0.75;
    });
    return m;
  }, [empRows]);

  useEffect(() => { load(); }, [date]);
  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab]);
  useEffect(() => { setTodayPage(0); }, [search, deptFilter, tlFilter]);

  const filteredEmp = useMemo(() => {
    let result = empData;
    if (deptFilter !== 'All') result = result.filter((e) => e.dept === deptFilter);
    if (tlFilter !== 'All') result = result.filter((e) => tlMap[e.empId] === tlFilter);
    if (projFilter !== 'All') {
      const assigned = projToEmployees[projFilter] || new Set();
      result = result.filter((e) => assigned.has(e.empId) || e.sessions.some((s) => s.projId === projFilter));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((e) =>
        e.empId.toLowerCase().includes(q) ||
        e.empName.toLowerCase().includes(q) ||
        (e.dept || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [empData, search, deptFilter, tlFilter, tlMap, projFilter, projToEmployees]);

  const summary = useMemo(() => {
    const counts = { P:0, A:0, L:0, WFH:0, OD:0, HD:0, H:0, total: filteredEmp.length };
    filteredEmp.forEach((e) => { if (e.dayStatus) counts[e.dayStatus] = (counts[e.dayStatus]||0)+1; });
    return counts;
  }, [filteredEmp]);

  const totalHrs = useMemo(() =>
    filteredEmp.reduce((s, e) => s + e.sessions.reduce((ss, sess) => ss + (parseFloat(sess.hrsWorked)||0), 0), 0),
  [filteredEmp]);

  const totalOt = useMemo(() =>
    filteredEmp.reduce((s, e) => s + e.sessions.reduce((ss, sess) => ss + (parseFloat(sess.otHrs)||0), 0), 0),
  [filteredEmp]);

  const feedbackHrs = useMemo(() => {
    let qc = 0, intFb = 0, clientFb = 0;
    filteredEmp.forEach((e) => {
      e.sessions.forEach((sess) => {
        const hrs = parseFloat(sess.hrsWorked) || 0;
        const flags = projTypeMap[sess.projId] || {};
        if (flags.isQaqc) qc += hrs;
        if (flags.isInternalFb) intFb += hrs;
        if (flags.isClientFb) clientFb += hrs;
      });
    });
    return { qc, intFb, clientFb };
  }, [filteredEmp, projTypeMap]);

  const deptOptions = useMemo(() => {
    return [...new Set(empData.map((e) => e.dept).filter(Boolean))].sort();
  }, [empData]);

  const tlOptions = useMemo(() => {
    return [...new Set(Object.values(tlMap))].sort();
  }, [tlMap]);

  // ── History-computed summary ──────────────────────────────────────────
  const histDeptOptions = useMemo(() => {
    const raw = history.data || [];
    return [...new Set(raw.map((r) => r[3]).filter(Boolean))].sort();
  }, [history]);

  const histTlOptions = useMemo(() => {
    const raw = history.data || [];
    const ids = [...new Set(raw.map((r) => r[1]).filter(Boolean))];
    return [...new Set(ids.map((id) => tlMap[id]).filter(Boolean))].sort();
  }, [history, tlMap]);

  const histFilteredData = useMemo(() => {
    const raw = history.data || [];
    return raw.filter((r) => {
      if (histFilterEmp !== 'All' && r[2] !== histFilterEmp) return false;
      if (histFilterDept !== 'All' && r[3] !== histFilterDept) return false;
      if (histFilterTl !== 'All' && tlMap[r[1]] !== histFilterTl) return false;
      if (histDateFrom && r[0] < histDateFrom) return false;
      if (histDateTo && r[0] > histDateTo) return false;
      if (histTypeFilter !== 'All' && r[5]) {
        const flags = projTypeMap[r[5]] || {};
        if (histTypeFilter === 'QC' && !flags.isQaqc) return false;
        if (histTypeFilter === 'Feedback' && !flags.isClientFb) return false;
        if (histTypeFilter === 'Regular' && (flags.isQaqc || flags.isClientFb)) return false;
      }
      return true;
    });
  }, [history, histFilterEmp, histFilterDept, histFilterTl, histDateFrom, histDateTo, tlMap, histTypeFilter, projTypeMap]);

  const histSummary = useMemo(() => {
    const seen = {};
    histFilteredData.forEach((r) => {
      const key = `${r[0]}__${r[1]}`;
      if (!seen[key] && r[4]) seen[key] = r[4];
    });
    const statuses = Object.values(seen);
    return {
      total: statuses.length,
      P: statuses.filter((s) => s === 'P').length,
      A: statuses.filter((s) => s === 'A').length,
      L: statuses.filter((s) => s === 'L').length,
      WFH: statuses.filter((s) => s === 'WFH').length,
      OD: statuses.filter((s) => s === 'OD').length,
      HD: statuses.filter((s) => s === 'HD').length,
      H: statuses.filter((s) => s === 'H').length,
    };
  }, [histFilteredData]);

  const histTotalHrs = useMemo(() =>
    histFilteredData.reduce((s, r) => s + (parseFloat(r[9]) || 0), 0),
  [histFilteredData]);

  const histTotalOt = useMemo(() =>
    histFilteredData.reduce((s, r) => s + (parseFloat(r[10]) || 0), 0),
  [histFilteredData]);

  const setStatus = async (emp, status) => {
    setStatusSaving((p) => ({ ...p, [emp.empId]: true }));
    try {
      await api.setAttStatus({ date, empId: emp.empId, empName: emp.empName, dept: emp.dept, status });
      setEmpData((prev) => prev.map((e) => e.empId === emp.empId ? { ...e, dayStatus: status } : e));
    } catch (e) { toast.error(e.message); }
    finally { setStatusSaving((p) => ({ ...p, [emp.empId]: false })); }
  };

  const openSessionModal = async (emp) => {
    setSessionForm({ projId:'', projName:'', hrsHhmm:'08:30', miscHhmm:'', actEffHrs:'', remarks:'' });
    try {
      const maps = await api.empMapByEmployee(emp.empId);
      const assignedIds = maps.map((m) => m[4]);
      const filteredProjs = assignedIds.length > 0 ? inProgProjects.filter((p) => assignedIds.includes(p[0])) : inProgProjects;
      setEmpAssignments((prev) => ({ ...prev, [emp.empId]: filteredProjs }));
    } catch { setEmpAssignments((prev) => ({ ...prev, [emp.empId]: inProgProjects })); }
    setSessionModal(emp);
  };

  function parseHhmm(val) {
    if (!val || !val.includes(':')) return NaN;
    const [h, m] = val.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return NaN;
    return h * 60 + m;
  }

  const saveSession = async () => {
    if (!sessionForm.projId) return toast.error('Select a project');
    const totalHrsWorked = parseHhmm(sessionForm.hrsHhmm);
    if (isNaN(totalHrsWorked) || totalHrsWorked <= 0) return toast.error('Enter hours worked in HH:MM format');
    const miscHrsParsed = parseHhmm(sessionForm.miscHhmm);
    const miscHrs = isNaN(miscHrsParsed) ? 0 : miscHrsParsed;
    setSavingSession(true);
    try {
      const proj = inProgProjects.find((p) => p[0] === sessionForm.projId);
      await api.logSession({
        date,
        empId: sessionModal.empId, empName: sessionModal.empName, dept: sessionModal.dept,
        dayStatus: sessionModal.dayStatus || 'P',
        projId: sessionForm.projId, projName: proj?.[1] || sessionForm.projName,
        hrsWorked: totalHrsWorked,
        actEffHrs: parseHhmm(sessionForm.actEffHrs) || 0,
        miscHrs,
        remarks: sessionForm.remarks,
      });
      toast.success('Session logged successfully');
      setSessionModal(null);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSavingSession(false); }
  };

  const deleteSession = async (sheetRow) => {
    if (!confirm('Delete this session entry?')) return;
    try {
      await api.deleteSession(sheetRow);
      toast.success('Session deleted');
      load();
    } catch (e) { toast.error(e.message); }
  };

  function toHhmm(val) {
    const total = Math.round(parseFloat(val) || 0);
    const hrs = Math.floor(total / 60);
    const mins = total % 60;
    return `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
  }

  const openEditModal = (emp, sess) => {
    setEditForm({
      projId: sess.projId || '',
      projName: sess.projName || '',
      hrsHhmm: toHhmm(sess.hrsWorked),
      miscHhmm: parseFloat(sess.otHrs) > 0 ? toHhmm(sess.otHrs) : '',
      actEffHrs: parseFloat(sess.actEffHrs) > 0 ? toHhmm(sess.actEffHrs) : '',
      remarks: sess.remarks || '',
    });
    setEditModal({ emp, sess, source: 'today' });
  };

  const openHistEditModal = (r) => {
    // sheetRow is appended at index 14 by the server; if missing, data needs a refresh
    const sheetRow = r[14];
    if (sheetRow == null) {
      toast.error('Row reference missing — click Refresh and try again');
      return;
    }
    const safeProjId = (r[5] === '—' ? '' : r[5]) || '';
    const safeProjName = (r[6] === '—' ? '' : r[6]) || '';
    setEditForm({
      projId: safeProjId,
      projName: safeProjName,
      hrsHhmm: toHhmm(r[9]),
      miscHhmm: parseFloat(r[10]) > 0 ? toHhmm(r[10]) : '',
      actEffHrs: parseFloat(r[13]) > 0 ? toHhmm(r[13]) : '',
      remarks: r[12] || '',
    });
    setEditModal({
      emp: { empId: r[1], empName: r[2], dept: r[3] },
      sess: { sheetRow, session: r[11], projId: safeProjId, projName: safeProjName },
      source: 'archive',
      histDate: r[0],
    });
  };

  const saveEditSession = async () => {
    if (!editForm.projId) return toast.error('Select a project');
    const hrsWorked = parseHhmm(editForm.hrsHhmm);
    if (isNaN(hrsWorked) || hrsWorked <= 0) return toast.error('Enter hours in HH:MM format');
    const miscHrsParsed = parseHhmm(editForm.miscHhmm);
    const miscHrs = isNaN(miscHrsParsed) ? 0 : miscHrsParsed;
    setSavingEdit(true);
    try {
      const proj = inProgProjects.find((p) => p[0] === editForm.projId);
      const actEffHrsParsed = parseHhmm(editForm.actEffHrs);
      const payload = {
        date: editModal.source === 'archive' ? editModal.histDate : date,
        empId: editModal.emp.empId,
        empName: editModal.emp.empName,
        dept: editModal.emp.dept,
        projId: editForm.projId,
        projName: proj?.[1] || editForm.projName,
        hrsWorked,
        miscHrs,
        actEffHrs: isNaN(actEffHrsParsed) ? '' : actEffHrsParsed,
        remarks: editForm.remarks,
      };
      if (editModal.source === 'archive') {
        await api.editStoreSession(editModal.sess.sheetRow, payload);
      } else {
        await api.editSession(editModal.sess.sheetRow, payload);
      }
      toast.success('Session updated');
      setEditModal(null);
      if (editModal.source === 'archive') loadHistory(); else load();
    } catch (e) { toast.error(e.message); }
    finally { setSavingEdit(false); }
  };

  const projsForModal = sessionModal ? (empAssignments[sessionModal.empId] || inProgProjects) : [];
  const toggleExpand = (empId) => setExpanded((p) => ({ ...p, [empId]: !p[empId] }));

  // Live preview in modal
  const previewHrs = parseHhmm(sessionForm.hrsHhmm);
  const previewOt  = parseHhmm(sessionForm.miscHhmm);

  const BADGE_COLOR = { P:'bg-emerald-100 text-emerald-700', A:'bg-red-100 text-red-700', L:'bg-orange-100 text-orange-700', WFH:'bg-blue-100 text-blue-700', OD:'bg-cyan-100 text-cyan-700', HD:'bg-yellow-100 text-yellow-700', H:'bg-slate-100 text-slate-500' };

  const sf = (key, val) => setSessionForm((f) => ({ ...f, [key]: val }));

  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function shiftDate(days) {
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  const applyHistPreset = (preset) => {
    setHistPreset(preset);
    setHistPage(0);
    if (preset === 'all') {
      setHistDateFrom(''); setHistDateTo('');
    } else if (preset === 'today') {
      setHistDateFrom(todayStr()); setHistDateTo(todayStr());
    } else if (preset === 'yesterday') {
      setHistDateFrom(shiftDate(-1)); setHistDateTo(shiftDate(-1));
    } else if (preset === 'last7') {
      setHistDateFrom(shiftDate(-6)); setHistDateTo(todayStr());
    } else if (preset === 'last30') {
      setHistDateFrom(shiftDate(-29)); setHistDateTo(todayStr());
    } else if (preset === 'custom') {
      // keep existing dates or default to today
      if (!histDateFrom) setHistDateFrom(todayStr());
      if (!histDateTo) setHistDateTo(todayStr());
    }
  };

  return (
    <div className="page">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">Attendance</h1>
          <p className="page-sub">Daily register with multi-project session logging</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" className="input w-40 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
          <button onClick={load} className="btn-secondary"><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Summary pills */}
      {(() => {
        const s = tab === 'history' ? histSummary : summary;
        const h = tab === 'history' ? histTotalHrs : totalHrs;
        const o = tab === 'history' ? histTotalOt : totalOt;
        const fb = tab === 'history' ? { qc: 0, intFb: 0, clientFb: 0 } : feedbackHrs;
        return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-5">
          {[
            { label:'Total',    val: s.total,    cls:'bg-slate-50 text-slate-700 border-slate-200' },
            { label:'Present',  val: s.P||0,     cls:'bg-emerald-50 text-emerald-700 border-emerald-100' },
            { label:'Absent',   val: s.A||0,     cls:'bg-red-50 text-red-700 border-red-100' },
            { label:'Leave',    val: s.L||0,     cls:'bg-orange-50 text-orange-700 border-orange-100' },
            { label:'WFH',      val: s.WFH||0,   cls:'bg-blue-50 text-blue-700 border-blue-100' },
            { label:'OD',       val: s.OD||0,    cls:'bg-cyan-50 text-cyan-700 border-cyan-100' },
            { label:'Half Day', val: s.HD||0,    cls:'bg-yellow-50 text-yellow-700 border-yellow-100' },
            { label:'Hrs',      val: fmtHrs(h),  cls:'bg-indigo-50 text-indigo-700 border-indigo-100' },
            { label:'OT Hrs',   val: fmtHrs(o),  cls:'bg-amber-50 text-amber-700 border-amber-100' },
            { label:'QC Hrs',   val: fmtHrs(fb.qc),  cls:'bg-amber-50 text-amber-700 border-amber-100' },
            { label:'Int FB Hrs', val: fmtHrs(fb.intFb), cls:'bg-violet-50 text-violet-700 border-violet-100' },
            { label:'Client FB Hrs', val: fmtHrs(fb.clientFb), cls:'bg-cyan-50 text-cyan-700 border-cyan-100' },
          ].map(({ label, val, cls }) => (
            <div key={label} className={`rounded-xl border px-3 py-2.5 ${cls}`}>
              <p className="text-xl font-bold leading-tight">{val}</p>
              <p className="text-xs font-medium opacity-75">{label}</p>
            </div>
          ))}
        </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1 w-fit">
        {[['today',"Today's Register"],['history','Archive History']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab===k?'bg-white shadow text-slate-800':'text-slate-500 hover:text-slate-700'}`}>{l}</button>
        ))}
      </div>

      {tab === 'today' && (
        loading ? <p className="text-slate-400 animate-pulse">Loading…</p> : (
          <>
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9 text-sm" placeholder="Search employee, ID or dept…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="input w-44 text-xs" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="All">All Departments</option>
              {deptOptions.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className="input w-44 text-xs" value={tlFilter} onChange={(e) => setTlFilter(e.target.value)}>
              <option value="All">All Team Leads</option>
              {tlOptions.map((t) => <option key={t}>{t}</option>)}
            </select>
            <select className="input w-52 text-xs" value={projFilter} onChange={(e) => setProjFilter(e.target.value)}>
              <option value="All">All Projects</option>
              {inProgProjects.map((p) => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
            </select>
            {(deptFilter !== 'All' || tlFilter !== 'All' || projFilter !== 'All' || search) && (
              <button className="btn-secondary text-xs" onClick={() => { setDeptFilter('All'); setTlFilter('All'); setProjFilter('All'); setSearch(''); }}>Clear</button>
            )}
          </div>
          <div className="rounded-xl border border-slate-100 shadow-sm overflow-hidden bg-white">
            <table className="min-w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="th w-8"></th>
                  <th className="th">EMP ID</th>
                  <th className="th">Employee Name</th>
                  <th className="th">Dept</th>
                  <th className="th">Shift</th>
                  <th className="th">Day Status</th>
                  <th className="th">Sessions / Hrs</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const tPs = todayPageSize === 'All' ? filteredEmp.length : parseInt(todayPageSize);
                  const tPc = Math.max(1, Math.ceil(filteredEmp.length / tPs));
                  const tSafe = Math.min(todayPage, tPc - 1);
                  const pageEmps = tPs >= filteredEmp.length ? filteredEmp : filteredEmp.slice(tSafe * tPs, (tSafe + 1) * tPs);
                  return pageEmps.map((emp) => {
                  const isExp = expanded[emp.empId];
                  const empHrs = emp.sessions.reduce((s,x) => s + (parseFloat(x.hrsWorked)||0), 0);
                  const empOt  = emp.sessions.reduce((s,x) => s + (parseFloat(x.otHrs)||0), 0);
                  return [
                    <tr key={emp.empId} className="tr">
                      <td className="td">
                        {emp.sessions.length > 0 && (
                          <button onClick={() => toggleExpand(emp.empId)} className="p-0.5 text-slate-400 hover:text-slate-600">
                            {isExp ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                          </button>
                        )}
                      </td>
                      <td className="td font-mono text-xs text-slate-500">{emp.empId}</td>
                      <td className="td font-medium">{emp.empName}</td>
                      <td className="td text-slate-500">{emp.dept}</td>
                      <td className="td text-xs text-slate-400">{emp.shift || '—'}</td>
                      <td className="td">
                        <select
                          value={emp.dayStatus || ''}
                          disabled={statusSaving[emp.empId]}
                          onChange={(e) => setStatus(emp, e.target.value)}
                          className={`text-xs font-medium rounded-full px-2 py-1 border-0 outline-none cursor-pointer ${BADGE_COLOR[emp.dayStatus] || 'bg-slate-100 text-slate-500'}`}
                        >
                          <option value="">— Mark —</option>
                          {STATUS_OPTS.map((s) => <option key={s} value={s}>{s} – {STATUS_LABELS[s]}</option>)}
                        </select>
                      </td>
                      <td className="td">
                        {emp.sessions.length > 0 ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-slate-600 font-medium">
                              {emp.sessions.length} session(s) · {fmtHrs(empHrs)}
                            </span>
                            {empOt > 0 && (
                              <span className="text-xs bg-amber-50 text-amber-600 font-semibold px-1.5 py-0.5 rounded">
                                OT {fmtHrs(empOt)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">No sessions</span>
                        )}
                      </td>
                      <td className="td">
                        <button onClick={() => openSessionModal(emp)} className="btn-primary py-1 px-2.5 text-xs gap-1">
                          <Plus size={11}/> Session
                        </button>
                      </td>
                    </tr>,

                    isExp && emp.sessions.map((sess, si) => {
                      const pFlags = projTypeMap[sess.projId] || {};
                      return (
                      <tr key={`${emp.empId}-sess-${si}`} className="bg-indigo-50/40 border-b border-indigo-100">
                        <td className="td" colSpan={2}></td>
                        <td className="td text-xs" colSpan={2}>
                          <div className="flex items-center gap-1.5 text-indigo-700">
                            <Clock size={11}/> Session {sess.session}
                            {pFlags.isQaqc && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold text-[10px] leading-none">QC</span>}
                            {pFlags.isClientFb && <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-bold text-[10px] leading-none">FB</span>}
                          </div>
                        </td>
                        <td className="td text-xs font-medium text-slate-700" colSpan={2}>
                          {sess.projName} <span className="text-slate-400">({sess.projId})</span>
                        </td>
                        <td className="td text-xs">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 font-semibold text-indigo-600">
                              <Timer size={11}/> {fmtHrs(sess.hrsWorked)}
                            </span>
                            {parseFloat(sess.otHrs) > 0 && (
                              <span className="bg-amber-50 text-amber-600 font-semibold px-1.5 py-0.5 rounded text-xs">
                                OT {fmtHrs(sess.otHrs)}
                              </span>
                            )}
                            {sess.remarks && (
                              <span className="text-slate-400 italic truncate max-w-[120px]">{sess.remarks}</span>
                            )}
                          </div>
                        </td>
                        <td className="td">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditModal(emp, sess)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                              <Pencil size={12}/>
                            </button>
                            <button onClick={() => deleteSession(sess.sheetRow)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })
                  ];
                });
                })()}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 px-1">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Rows:</label>
              <select className="input w-20 text-xs" value={todayPageSize} onChange={(e) => { setTodayPageSize(e.target.value); setTodayPage(0); }}>
                {PAGE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {(() => {
              const tPs = todayPageSize === 'All' ? filteredEmp.length : parseInt(todayPageSize);
              const tPc = Math.max(1, Math.ceil(filteredEmp.length / tPs));
              const tSafe = Math.min(todayPage, tPc - 1);
              if (tPc <= 1) return null;
              return (
                <div className="flex items-center gap-1">
                  <button onClick={() => setTodayPage(0)} disabled={tSafe === 0}
                    className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">«</button>
                  <button onClick={() => setTodayPage((p) => p - 1)} disabled={tSafe === 0}
                    className="px-3 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
                  <span className="px-3 py-1 text-xs font-medium text-slate-700 bg-indigo-50 rounded border border-indigo-100">{tSafe + 1} / {tPc}</span>
                  <button onClick={() => setTodayPage((p) => p + 1)} disabled={tSafe >= tPc - 1}
                    className="px-3 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
                  <button onClick={() => setTodayPage(tPc - 1)} disabled={tSafe >= tPc - 1}
                    className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">»</button>
                </div>
              );
            })()}
          </div>
          </>
        )
      )}

      {tab === 'history' && (() => {
        const allHeaders = history.headers.length
          ? history.headers
          : ['Date','EMP ID','Name','Dept','Status','Proj ID','Project','Hrs Worked','OT Hrs','Session','Remarks','Act Eff Hrs'];
        const rawData = history.data || [];

        const HIST_EXTRA = [
          { key: 'reqEffHrs', label: 'Req Eff Hrs', compute: (r) => {
            const spent = parseFloat(r[9]) || 0;
            const rawRatio = employeeRatioMap[r[1]] || 0.75;
            const ratio = rawRatio > 1 ? rawRatio / 100 : rawRatio;
            return +(spent * ratio).toFixed(2);
          }},
          { key: 'empEff', label: 'Emp Eff %', compute: (r) => {
            const act = parseFloat(r[13]) || 0;
            const spent = parseFloat(r[9]) || 0;
            const rawRatio = employeeRatioMap[r[1]] || 0.75;
            const ratio = rawRatio > 1 ? rawRatio / 100 : rawRatio;
            const req = +(spent * ratio).toFixed(2);
            return req > 0 ? +((act / req) * 100).toFixed(1) : null;
          }},
        ];

        const fullHeaders = [...allHeaders, ...HIST_EXTRA.map((e) => e.label)];
        const visibleIdx = fullHeaders.map((_, i) => i).filter((i) => i >= allHeaders.length || !histHiddenCols.has(i));
        const finalCols = visibleIdx.map((i) => ({
          i,
          label: fullHeaders[i],
          isExtra: i >= allHeaders.length,
          extra: i >= allHeaders.length ? HIST_EXTRA[i - allHeaders.length] : null,
        }));

        const histEmpOptions = [...new Set(rawData.map((r) => r[2]).filter(Boolean))].sort();

        const histPs = histPageSize === 'All' ? histFilteredData.length : parseInt(histPageSize);
        const pageCount = Math.max(1, Math.ceil(histFilteredData.length / histPs));
        const safePage = Math.min(histPage, pageCount - 1);
        const pageData  = histPs >= histFilteredData.length ? histFilteredData : histFilteredData.slice(safePage * histPs, (safePage + 1) * histPs);

        return (
          <div>
            {/* Archive filters */}
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Period</label>
                <div className="flex items-center gap-2">
                  <select className="input w-36 text-xs" value={histPreset} onChange={(e) => { applyHistPreset(e.target.value); }}>
                    <option value="all">All Records</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last7">Last 7 Days</option>
                    <option value="last30">Last 30 Days</option>
                    <option value="custom">Custom</option>
                  </select>
                  {histPreset === 'custom' && (
                    <>
                      <input type="date" className="input w-36 text-xs" value={histDateFrom} onChange={(e) => { setHistDateFrom(e.target.value); setHistPage(0); }} placeholder="dd-mm-yyyy" />
                      <span className="text-xs text-slate-400">→</span>
                      <input type="date" className="input w-36 text-xs" value={histDateTo} onChange={(e) => { setHistDateTo(e.target.value); setHistPage(0); }} placeholder="dd-mm-yyyy" />
                    </>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Employee</label>
                <select className="input w-44 text-xs" value={histFilterEmp} onChange={(e) => { setHistFilterEmp(e.target.value); setHistPage(0); }}>
                  <option value="All">All Employees</option>
                  {histEmpOptions.map((n) => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Department</label>
                <select className="input w-40 text-xs" value={histFilterDept} onChange={(e) => { setHistFilterDept(e.target.value); setHistPage(0); }}>
                  <option value="All">All Departments</option>
                  {histDeptOptions.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Team Lead</label>
                <select className="input w-40 text-xs" value={histFilterTl} onChange={(e) => { setHistFilterTl(e.target.value); setHistPage(0); }}>
                  <option value="All">All Team Leads</option>
                  {histTlOptions.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium mb-1 block">Log Type</label>
                <select className="input w-36 text-xs" value={histTypeFilter} onChange={(e) => { setHistTypeFilter(e.target.value); setHistPage(0); }}>
                  <option value="All">All Types</option>
                  <option value="Regular">Regular</option>
                  <option value="QC">QC</option>
                  <option value="Feedback">Feedback</option>
                </select>
              </div>
              {(histFilterEmp !== 'All' || histFilterDept !== 'All' || histFilterTl !== 'All' || histDateFrom || histDateTo || histTypeFilter !== 'All') && (
                <button className="btn-secondary text-xs self-end" onClick={() => { setHistFilterEmp('All'); setHistFilterDept('All'); setHistFilterTl('All'); setHistDateFrom(''); setHistDateTo(''); setHistTypeFilter('All'); setHistPage(0); }}>
                  Clear
                </button>
              )}
              <div className="text-xs text-slate-400 ml-auto">
                {histFilteredData.length} records
              </div>
            </div>

            {/* Column control */}
            <div className="flex items-center justify-between mb-2">
              <div className="relative" ref={colMenuRef}>
                <button onClick={() => setShowHistColMenu((p) => !p)} className="btn-secondary text-xs flex items-center gap-1.5">
                  <Columns size={13} /> Columns
                </button>
                {showHistColMenu && (
                  <div className="absolute left-0 z-20 mt-1 w-52 rounded-xl border bg-white p-3 shadow-lg">
                    <p className="text-xs font-semibold text-slate-500 mb-2">Show / Hide Columns</p>
                    {fullHeaders.map((h, i) => (
                      <label key={i} className="flex items-center gap-2 text-xs mb-1.5 last:mb-0">
                        <input type="checkbox" className="accent-indigo-600 cursor-pointer"
                          checked={!histHiddenCols.has(i) || i >= allHeaders.length}
                          disabled={i < allHeaders.length ? false : true}
                          onChange={() => {
                            setHistHiddenCols((prev) => {
                              const n = new Set(prev);
                              if (n.has(i)) n.delete(i); else n.add(i);
                              return n;
                            });
                          }} />
                        {h}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500">Rows:</label>
                <select className="input w-20 text-xs" value={histPageSize} onChange={(e) => { setHistPageSize(e.target.value); setHistPage(0); }}>
                  {PAGE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {finalCols.map((col) => <th key={col.i} className="th">{col.label}</th>)}
                    {currentUser?.role === 'Admin' && <th className="th w-16">Edit</th>}
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((r, i) => {
                    const rFlags = projTypeMap[r[5]] || {};
                    return (
                    <tr key={i} className={`tr ${rFlags.isQaqc ? 'bg-amber-50/30' : rFlags.isClientFb ? 'bg-violet-50/30' : ''}`}>
                      {finalCols.map((col) => {
                        if (col.isExtra) {
                          const val = col.extra.compute(r);
                          if (col.extra.key === 'empEff') {
                            return <td key={col.i} className="td">{val != null ? `${val}%` : '—'}</td>;
                          }
                          const total = Math.round(val || 0);
                          const h = Math.floor(total / 60);
                          const m = total % 60;
                          return <td key={col.i} className="td">{total > 0 ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` : '—'}</td>;
                        }
                        // Show QC/FB label inline with project name col (index 6)
                        if (col.i === 6 && r[5]) {
                          return (
                            <td key={col.i} className="td">
                              <span className="flex items-center gap-1.5">
                                {r[col.i]}
                                {rFlags.isQaqc && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold text-[10px] leading-none">QC</span>}
                                {rFlags.isClientFb && <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-bold text-[10px] leading-none">FB</span>}
                              </span>
                            </td>
                          );
                        }
                        return <td key={col.i} className="td">{r[col.i]}</td>;
                      })}
                      {currentUser?.role === 'Admin' && (
                        <td className="td">
                          <button onClick={() => openHistEditModal(r)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded">
                            <Pencil size={12}/>
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                  {pageData.length === 0 && (
                    <tr><td colSpan={finalCols.length + (currentUser?.role === 'Admin' ? 1 : 0)} className="td text-center text-slate-400 py-8">No history records</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-between mt-3 px-1">
                <p className="text-xs text-slate-400">
                  {safePage * histPs + 1}–{Math.min((safePage + 1) * histPs, histFilteredData.length)} of {histFilteredData.length} records
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setHistPage(0)} disabled={safePage === 0}
                    className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">«</button>
                  <button onClick={() => setHistPage((p) => p - 1)} disabled={safePage === 0}
                    className="px-3 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
                  <span className="px-3 py-1 text-xs font-medium text-slate-700 bg-indigo-50 rounded border border-indigo-100">{safePage + 1} / {pageCount}</span>
                  <button onClick={() => setHistPage((p) => p + 1)} disabled={safePage >= pageCount - 1}
                    className="px-3 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
                  <button onClick={() => setHistPage(pageCount - 1)} disabled={safePage >= pageCount - 1}
                    className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">»</button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Edit Session Modal */}
      {editModal && (
        <Modal title={`Edit Session — ${editModal.emp.empName}`} onClose={() => setEditModal(null)}>
          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 rounded-lg text-sm text-indigo-700 font-medium">
              {editModal.emp.empId} · {editModal.emp.dept} · Session {editModal.sess.session} · {editModal.source === 'archive' ? editModal.histDate : date}
            </div>

            <div>
              <label className="label">Project *</label>
              <select className="input" value={editForm.projId} onChange={(e) => {
                const p = inProgProjects.find((x) => x[0] === e.target.value);
                setEditForm((f) => ({ ...f, projId: e.target.value, projName: p?.[1] || '' }));
              }}>
                <option value="">— Select Project —</option>
                {inProgProjects.map((p) => <option key={p[0]} value={p[0]}>{p[1]} ({p[0]})</option>)}
              </select>
            </div>

            <div>
              <label className="label">Hours Worked * (HH:MM)</label>
              <input
                type="text" placeholder="08:30"
                className="input text-center text-lg font-semibold"
                value={editForm.hrsHhmm}
                onChange={(e) => setEditForm((f) => ({ ...f, hrsHhmm: autoColon(e.target.value) }))}
              />
            </div>

            {(() => { const ph = parseHhmm(editForm.hrsHhmm); const po = parseHhmm(editForm.miscHhmm); return !isNaN(ph) && ph > 0 && (
              <div className="p-3 rounded-lg flex items-center justify-between text-sm font-medium bg-indigo-50 text-indigo-700">
                <span className="flex items-center gap-2"><Clock size={15}/>{fmtHrs(ph)} worked</span>
                {!isNaN(po) && po > 0 && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-semibold text-xs">Misc: {fmtHrs(po)}</span>}
              </div>
            ); })()}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Act Eff Hrs (HH:MM)</label>
                <input type="text" placeholder="00:00" className="input" value={editForm.actEffHrs} onChange={(e) => setEditForm((f) => ({ ...f, actEffHrs: autoColon(e.target.value) }))} />
              </div>
              <div>
                <label className="label">Misc Hrs (OT) (HH:MM)</label>
                <input type="text" placeholder="00:00" className="input" value={editForm.miscHhmm} onChange={(e) => setEditForm((f) => ({ ...f, miscHhmm: autoColon(e.target.value) }))} />
              </div>
            </div>

            <div>
              <label className="label">Remarks</label>
              <input className="input" value={editForm.remarks} onChange={(e) => setEditForm((f) => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={saveEditSession} disabled={savingEdit} className="btn-primary">
              {savingEdit ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* Session Modal */}
      {sessionModal && (
        <Modal title={`Log Session — ${sessionModal.empName}`} onClose={() => setSessionModal(null)}>
          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 rounded-lg text-sm text-indigo-700 font-medium">
              {sessionModal.empId} · {sessionModal.dept} · {date}
            </div>

            {/* Project */}
            <div>
              <label className="label">Project *</label>
              <select className="input" value={sessionForm.projId} onChange={(e) => {
                const p = projsForModal.find((x) => x[0] === e.target.value);
                sf('projId', e.target.value); sf('projName', p?.[1] || '');
              }}>
                <option value="">— Select In-Progress Project —</option>
                {projsForModal.map((p) => <option key={p[0]} value={p[0]}>{p[1]} ({p[0]})</option>)}
              </select>
              {projsForModal.length === 0 && <p className="text-xs text-amber-600 mt-1">No in-progress projects found</p>}
            </div>

            {/* Hours Worked - HH:MM */}
            <div>
              <label className="label">Hours Worked * (HH:MM)</label>
              <input
                type="text" placeholder="08:30"
                className="input text-center text-lg font-semibold"
                value={sessionForm.hrsHhmm}
                onChange={(e) => sf('hrsHhmm', autoColon(e.target.value))}
              />
            </div>

            {/* Live preview */}
            {!isNaN(previewHrs) && previewHrs > 0 && (
              <div className="p-3 rounded-lg flex items-center justify-between text-sm font-medium bg-indigo-50 text-indigo-700">
                <span className="flex items-center gap-2">
                  <Clock size={15}/>
                  {fmtHrs(previewHrs)} worked
                </span>
                {!isNaN(previewOt) && previewOt > 0 && (
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-semibold text-xs">
                    Misc: {fmtHrs(previewOt)}
                  </span>
                )}
              </div>
            )}

            {/* Act Eff Hrs + Misc Hrs (OT) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Act Eff Hrs (HH:MM)</label>
                <input type="text" placeholder="HH:MM" className="input" value={sessionForm.actEffHrs} onChange={(e) => sf('actEffHrs', autoColon(e.target.value))} />
              </div>
              <div>
                <label className="label">Misc Hrs (OT) (HH:MM)</label>
                <input type="text" placeholder="00:00" className="input" value={sessionForm.miscHhmm} onChange={(e) => sf('miscHhmm', autoColon(e.target.value))} />
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="label">Remarks</label>
              <input className="input" value={sessionForm.remarks} onChange={(e) => sf('remarks', e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setSessionModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={saveSession} disabled={savingSession} className="btn-primary">
              {savingSession ? 'Saving…' : 'Log Session'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
