import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Pencil, RefreshCw, Settings as SettingsIcon, Users, Briefcase, Clock, FolderKanban } from 'lucide-react';
import { api } from '../lib/api';
import UserManagement from './UserManagement';


const CATEGORIES = [
  { key: 'SHIFT', label: 'Shifts', desc: 'Define work shift names and time ranges', cols: ['Key / Name', 'Value / Hours', 'Description'] },
  { key: 'WEEKOFF', label: 'Week Offs', desc: 'Week-off day options', cols: ['Key / Name', 'Abbreviation', 'Description'] },
  { key: 'DEPT', label: 'Departments', desc: 'Department list', cols: ['Key / Name', '', 'Description'] },
  { key: 'DESIGNATION', label: 'Designations', desc: 'Designation / job titles', cols: ['Key / Name', '', 'Description'] },
  { key: 'ROLE', label: 'Project Roles', desc: 'Roles within a project', cols: ['Key / Name', '', 'Description'] },
  { key: 'EMP_STATUS', label: 'Employee Statuses', desc: 'Employment status options', cols: ['Key / Name', '', 'Description'] },
  { key: 'PROJ_STATUS', label: 'Project Statuses', desc: 'Project status options', cols: ['Key / Name', '', 'Description'] },
  { key: 'ATT', label: 'Attendance Codes', desc: 'Attendance status codes and labels', cols: ['Code', 'Label', 'Description'] },
  { key: 'MAP_STATUS', label: 'Assignment Statuses', desc: 'EMP–Project assignment statuses', cols: ['Key / Name', '', 'Description'] },
  { key: 'PROD_MATRIX', label: 'Productivity Matrix', desc: 'Req Eff hours by experience level (number inputs)', cols: ['Min Exp', 'Max Exp', 'Min Hrs', 'Max Hrs', 'Max Value'] },
];

const GROUPS = [
  { key: 'people', label: 'People & HR', icon: Briefcase, categories: ['DEPT', 'DESIGNATION', 'EMP_STATUS', 'ROLE'] },
  { key: 'time', label: 'Time & Attendance', icon: Clock, categories: ['SHIFT', 'WEEKOFF', 'ATT', 'PROD_MATRIX'] },
  { key: 'project', label: 'Project Config', icon: FolderKanban, categories: ['PROJ_STATUS', 'MAP_STATUS'] },
];

function headerRow(cat, cols) {
  if (cat === 'SHIFT') return ['SHIFT', 'Name', 'Hours', 'Description'];
  if (cat === 'WEEKOFF') return ['WEEKOFF', 'Name', 'Code', 'Description'];
  if (cat === 'PROD_MATRIX') return ['PROD_MATRIX', 'Experience', 'Hours Range', 'Max Value'];
  return [cat, cols[0], '', 'Description'];
}

function decYrsToYymm(v) {
  const total = Math.round(parseFloat(v || 0) * 12);
  return `${String(Math.floor(total / 12)).padStart(2, '0')}:${String(total % 12).padStart(2, '0')}`;
}
function yymmToDecYrs(s) {
  if (!s || !s.includes(':')) return parseFloat(s) || 0;
  const [y, m] = s.split(':').map(Number);
  return Math.round((y + (m || 0) / 12) * 100) / 100;
}
function decHrsToHhmm(v) {
  const n = parseFloat(v || 0);
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function hhmmToDecHrs(s) {
  if (!s || !s.includes(':')) return parseFloat(s) || 0;
  const [h, m] = s.split(':').map(Number);
  return Math.round((h + (m || 0) / 60) * 100) / 100;
}

export default function Settings({ toast, currentUser }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeGroup, setActiveGroup] = useState('people');
  const [activeTab, setActiveTab] = useState('DEPT');
  const [editingTab, setEditingTab] = useState(null);

  const switchGroup = (groupKey) => {
    setEditingTab(null);
    if (groupKey === 'users') {
      setActiveGroup('users');
      setActiveTab('USERS');
    } else {
      setActiveGroup(groupKey);
      const group = GROUPS.find(g => g.key === groupKey);
      if (group) setActiveTab(group.categories[0]);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const s = await api.settings();
      const raw = [];
      s.shifts.forEach((x) => raw.push(['SHIFT', x.name, x.hours, x.desc]));
      s.weekoffs.forEach((x) => raw.push(['WEEKOFF', x.name, x.code, x.desc]));
      s.depts.forEach((x) => raw.push(['DEPT', x, '', '']));
      s.designations.forEach((x) => raw.push(['DESIGNATION', x, '', '']));
      s.roles.forEach((x) => raw.push(['ROLE', x, '', '']));
      s.empStatuses.forEach((x) => raw.push(['EMP_STATUS', x, '', '']));
      s.projStatuses.forEach((x) => raw.push(['PROJ_STATUS', x, '', '']));
      s.attStatuses.forEach((x) => raw.push(['ATT', x.code, x.label, x.desc]));
      s.mapStatuses.forEach((x) => raw.push(['MAP_STATUS', x, '', '']));
      const defaultProdMatrix = [
        { label: '>2 years', range: '6.5 to 8', max: '8' },
        { label: '1.5 - 2 years', range: '4.5 to 6', max: '6' },
        { label: '1 - 1.5 years', range: '4 to 5', max: '5' },
        { label: '6months - 1year', range: '3.5 to 4.5', max: '4.5' },
        { label: '0 - 6months', range: '1 to 2', max: '2' },
      ];
      const pm = s.prodMatrix && s.prodMatrix.length > 0 ? s.prodMatrix : defaultProdMatrix;
      pm.forEach((x) => raw.push(['PROD_MATRIX', x.label, x.range, `Max: ${x.max}`]));
      setRows(raw);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const saveCategory = async () => {
    setSaving(true);
    try { await api.saveSettings(rows); toast.success(`${cat?.label} saved`); setEditingTab(null); }
    catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const cat = CATEGORIES.find((c) => c.key === activeTab);
  const tabRows = rows.filter((r) => r[0] === activeTab);
  const tabIndices = rows.reduce((acc, r, i) => { if (r[0] === activeTab) acc.push(i); return acc; }, []);
  const hasValueCol = activeTab === 'SHIFT' || activeTab === 'WEEKOFF' || activeTab === 'ATT' || activeTab === 'PROD_MATRIX';
  const colCount = hasValueCol ? 4 : 3;

  const addRow = () => setRows((prev) => [...prev, activeTab === 'PROD_MATRIX' ? [activeTab, '0 - 0 years', '0 to 0', 'Max: 0'] : [activeTab, '', '', '']]);

  const updateRow = (globalIdx, col, val) => setRows((prev) => {
    const n = [...prev];
    n[globalIdx] = [...n[globalIdx]];
    n[globalIdx][col] = val;
    return n;
  });

  const removeRow = (globalIdx) => setRows((prev) => prev.filter((_, i) => i !== globalIdx));

  const colHeaders = cat?.cols || ['Key / Name', 'Value / Code', 'Description'];
  const colGrid = hasValueCol ? '1.5fr 1.5fr 1.5fr 0.4fr' : '1.5fr 2fr 0.4fr';

  return (
    <div className="page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2"><SettingsIcon size={22} /> Settings</h1>
          <p className="page-sub">Master reference for all dropdown values across the application</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={load} className="btn-secondary shrink-0"><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Main group navigation */}
      <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl mb-4 flex-wrap">
        {GROUPS.map((g) => (
          <button key={g.key} onClick={() => switchGroup(g.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeGroup === g.key
                ? 'bg-white shadow text-slate-800'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}>
            <g.icon size={14} /> {g.label}
          </button>
        ))}
        <button onClick={() => switchGroup('users')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
            activeGroup === 'users'
              ? 'bg-white shadow text-slate-800'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
          }`}>
          <Users size={14} /> Users
        </button>
      </div>

      {/* Sub-category tabs */}
      {activeGroup !== 'users' && (
        <div className="flex gap-1 bg-slate-50 p-0.5 rounded-lg mb-5 flex-wrap">
          {(GROUPS.find(g => g.key === activeGroup)?.categories || []).map((catKey) => {
            const c = CATEGORIES.find(cat => cat.key === catKey);
            const count = rows.filter(r => r[0] === catKey).length;
            return (
              <button key={catKey} onClick={() => { setActiveTab(catKey); setEditingTab(null); }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === catKey
                    ? 'bg-white shadow-sm text-slate-800'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}>
                {c?.label || catKey}
                <span className="text-[10px] text-slate-400">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Editor panel */}
      {activeGroup === 'users' ? (
        <div className="card">
          <UserManagement toast={toast} currentUser={currentUser} />
        </div>
      ) : (
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-slate-800 truncate">{cat?.label}</h2>
              <p className="text-sm text-slate-400 truncate">{cat?.desc}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
              {editingTab === activeTab ? (
                <>
                  <button onClick={addRow} className="btn-secondary py-1.5 px-2.5 sm:px-3 text-xs">
                    <Plus size={13} /> Add Row
                  </button>
                  <button onClick={() => { load(); setEditingTab(null); }} className="btn-secondary py-1.5 px-2.5 sm:px-3 text-xs">
                    Cancel
                  </button>
                  <button onClick={saveCategory} disabled={saving} className="btn-primary py-1.5 px-2.5 sm:px-3 text-xs">
                    <Save size={13} /> {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <button onClick={() => setEditingTab(activeTab)} className="btn-secondary py-1.5 px-2.5 sm:px-3 text-xs">
                  <Pencil size={13} /> Edit
                </button>
              )}
            </div>
          </div>

          {(function() {
            if (loading) {
              return (
                <div className="space-y-5">
                  {/* Header skeletons */}
                  <div className="space-y-2">
                    <div className="skeleton h-5 w-44" />
                    <div className="skeleton h-3 w-60" />
                  </div>
                  {/* Button skeleton */}
                  <div className="flex justify-end">
                    <div className="skeleton h-7 w-16 rounded-lg" />
                  </div>
                  {/* Table skeleton - header row */}
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex gap-4">
                      <div className="skeleton h-3 w-28" />
                      <div className="skeleton h-3 w-20" />
                      <div className="skeleton h-3 w-32" />
                    </div>
                    {/* Data rows */}
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex gap-4 px-4 py-3 border-b border-slate-50">
                        <div className="skeleton h-3 flex-1" />
                        <div className="skeleton h-3 flex-1" />
                        <div className="skeleton h-3 flex-1" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            if (tabRows.length === 0) {
              return (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-sm font-medium">No {cat?.label.toLowerCase()} defined</p>
                  {editingTab === activeTab && <p className="text-xs mt-1">Click "Add Row" to create the first entry</p>}
                </div>
              );
            }
            if (editingTab === activeTab) {
              if (activeTab === 'PROD_MATRIX') {
                return (<>
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100">
                    <div className="bg-slate-50 px-3 sm:px-4 py-2.5 border-b border-slate-100 min-w-[550px]"
                      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 0.3fr', gap: '0.75rem' }}>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Min Exp (YY:MM)</span>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Max Exp (YY:MM)</span>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Min Hrs (HH:MM)</span>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Max Hrs (HH:MM)</span>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Max Val (HH:MM)</span>
                      <span></span>
                    </div>
                    {tabIndices.map((globalIdx, ti) => {
                      const row = rows[globalIdx];
                      const label = row[1] || '';
                      let minExp = 0, maxExp = 99;
                      const dM = label.match(/^([\d.]+)\s*-\s*([\d.]+)/);
                      const gM = label.match(/^>\s*([\d.]+)/);
                      if (dM) { minExp = parseFloat(dM[1]); maxExp = parseFloat(dM[2]); }
                      else if (gM) { minExp = parseFloat(gM[1]); maxExp = 99; }
                      const rng = row[2] || '';
                      const rP = rng.split('to').map(s => parseFloat(s.trim()));
                      const minHrs = !isNaN(rP[0]) ? rP[0] : 0;
                      const maxHrs = !isNaN(rP[1]) ? rP[1] : 0;
                      const maxVal = parseFloat((row[3] || '').replace('Max:', '').trim()) || 0;
                      return (
                        <div key={ti} className="px-3 sm:px-4 py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors min-w-[550px]"
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 0.3fr', gap: '0.75rem', alignItems: 'center' }}>
                          <input type="text" placeholder="YY:MM" className="input text-sm py-1.5" value={decYrsToYymm(minExp)}
                            onChange={(e) => { const v = yymmToDecYrs(e.target.value); updateRow(globalIdx, 1, maxExp >= 99 ? `>${v} years` : `${v} - ${maxExp} years`); }} />
                          <input type="text" placeholder="YY:MM (∞=blank)" className="input text-sm py-1.5" value={maxExp >= 99 ? '' : decYrsToYymm(maxExp)}
                            onChange={(e) => { const v = e.target.value ? yymmToDecYrs(e.target.value) : 99; updateRow(globalIdx, 1, v >= 99 ? `>${minExp} years` : `${minExp} - ${v} years`); }} />
                          <input type="text" placeholder="HH:MM" className="input text-sm py-1.5" value={decHrsToHhmm(minHrs)}
                            onChange={(e) => { const v = hhmmToDecHrs(e.target.value); updateRow(globalIdx, 2, `${v} to ${maxHrs}`); }} />
                          <input type="text" placeholder="HH:MM" className="input text-sm py-1.5" value={decHrsToHhmm(maxHrs)}
                            onChange={(e) => { const v = hhmmToDecHrs(e.target.value); updateRow(globalIdx, 2, `${minHrs} to ${v}`); }} />
                          <input type="text" placeholder="HH:MM" className="input text-sm py-1.5" value={decHrsToHhmm(maxVal)}
                            onChange={(e) => { const v = hhmmToDecHrs(e.target.value); updateRow(globalIdx, 3, `Max: ${v}`); }} />
                          <button onClick={() => removeRow(globalIdx)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors justify-self-end">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="md:hidden space-y-2">
                    {tabIndices.map((globalIdx, ti) => {
                      const row = rows[globalIdx];
                      const label = row[1] || '';
                      let minExp = 0, maxExp = 99;
                      const dM = label.match(/^([\d.]+)\s*-\s*([\d.]+)/);
                      const gM = label.match(/^>\s*([\d.]+)/);
                      if (dM) { minExp = parseFloat(dM[1]); maxExp = parseFloat(dM[2]); }
                      else if (gM) { minExp = parseFloat(gM[1]); maxExp = 99; }
                      const rng = row[2] || '';
                      const rP = rng.split('to').map(s => parseFloat(s.trim()));
                      const minHrs = !isNaN(rP[0]) ? rP[0] : 0;
                      const maxHrs = !isNaN(rP[1]) ? rP[1] : 0;
                      const maxVal = parseFloat((row[3] || '').replace('Max:', '').trim()) || 0;
                      return (
                        <div key={ti} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Min Exp</label>
                                  <input type="text" placeholder="YY:MM" className="input text-sm py-1.5 w-full" value={decYrsToYymm(minExp)}
                                    onChange={(e) => { const v = yymmToDecYrs(e.target.value); updateRow(globalIdx, 1, maxExp >= 99 ? `>${v} years` : `${v} - ${maxExp} years`); }} />
                                </div>
                                <div>
                                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Max Exp</label>
                                  <input type="text" placeholder="YY:MM (∞)" className="input text-sm py-1.5 w-full" value={maxExp >= 99 ? '' : decYrsToYymm(maxExp)}
                                    onChange={(e) => { const v = e.target.value ? yymmToDecYrs(e.target.value) : 99; updateRow(globalIdx, 1, v >= 99 ? `>${minExp} years` : `${minExp} - ${v} years`); }} />
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Min Hrs</label>
                                  <input type="text" placeholder="HH:MM" className="input text-sm py-1.5 w-full" value={decHrsToHhmm(minHrs)}
                                    onChange={(e) => { const v = hhmmToDecHrs(e.target.value); updateRow(globalIdx, 2, `${v} to ${maxHrs}`); }} />
                                </div>
                                <div>
                                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Max Hrs</label>
                                  <input type="text" placeholder="HH:MM" className="input text-sm py-1.5 w-full" value={decHrsToHhmm(maxHrs)}
                                    onChange={(e) => { const v = hhmmToDecHrs(e.target.value); updateRow(globalIdx, 2, `${minHrs} to ${v}`); }} />
                                </div>
                                <div>
                                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Max Val</label>
                                  <input type="text" placeholder="HH:MM" className="input text-sm py-1.5 w-full" value={decHrsToHhmm(maxVal)}
                                    onChange={(e) => { const v = hhmmToDecHrs(e.target.value); updateRow(globalIdx, 3, `Max: ${v}`); }} />
                                </div>
                              </div>
                            </div>
                            <button onClick={() => removeRow(globalIdx)}
                              className="shrink-0 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>);
              }
              return (<>
                <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100">
                  <div className="bg-slate-50 px-3 sm:px-4 py-2.5 border-b border-slate-100 min-w-[400px]"
                    style={{ display: 'grid', gridTemplateColumns: hasValueCol ? '1.5fr 1.5fr 1.5fr 0.4fr' : '1.5fr 2fr 0.4fr', gap: '0.5rem' }}>
                    {hasValueCol ? (
                      <>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{colHeaders[0]}</span>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{colHeaders[1]}</span>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{colHeaders[2]}</span>
                        <span></span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{colHeaders[0]}</span>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{colHeaders[2]}</span>
                        <span></span>
                      </>
                    )}
                  </div>
                  {tabIndices.map((globalIdx, ti) => {
                    const row = rows[globalIdx];
                    return (
                      <div key={ti}
                        className={`px-3 sm:px-4 py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors min-w-[400px]`}
                        style={{ display: 'grid', gridTemplateColumns: colGrid, gap: '0.5rem', alignItems: 'center' }}>
                        <input className="input text-sm py-1.5" placeholder={colHeaders[0]} value={row[1]}
                          onChange={(e) => updateRow(globalIdx, 1, e.target.value)} />
                        {hasValueCol && (
                          <input className="input text-sm py-1.5" placeholder={colHeaders[1]} value={row[2]}
                            onChange={(e) => updateRow(globalIdx, 2, e.target.value)} />
                        )}
                        <input className="input text-sm py-1.5" placeholder="Description (optional)" value={row[3]}
                          onChange={(e) => updateRow(globalIdx, 3, e.target.value)} />
                        <button onClick={() => removeRow(globalIdx)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors justify-self-end">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="md:hidden space-y-2">
                  {tabIndices.map((globalIdx, ti) => {
                    const row = rows[globalIdx];
                    return (
                      <div key={ti} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-2">
                            <div>
                              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{colHeaders[0]}</label>
                              <input className="input text-sm py-1.5 w-full" placeholder={colHeaders[0]} value={row[1]}
                                onChange={(e) => updateRow(globalIdx, 1, e.target.value)} />
                            </div>
                            {hasValueCol && (
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{colHeaders[1]}</label>
                                <input className="input text-sm py-1.5 w-full" placeholder={colHeaders[1]} value={row[2]}
                                  onChange={(e) => updateRow(globalIdx, 2, e.target.value)} />
                              </div>
                            )}
                            <div>
                              <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Description</label>
                              <input className="input text-sm py-1.5 w-full" placeholder="Description (optional)" value={row[3]}
                                onChange={(e) => updateRow(globalIdx, 3, e.target.value)} />
                            </div>
                          </div>
                          <button onClick={() => removeRow(globalIdx)}
                            className="shrink-0 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>);
            }
            if (activeTab === 'PROD_MATRIX') {
              return (<>
                <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100">
                  <div className="bg-slate-50 px-3 sm:px-4 py-2.5 border-b border-slate-100 min-w-[500px]"
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '0.5rem 0.75rem' }}>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Min Exp</span>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Max Exp</span>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Min Hrs</span>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Max Hrs</span>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Max Val</span>
                  </div>
                  {tabIndices.map((globalIdx, ti) => {
                    const row = rows[globalIdx];
                    const label = row[1] || '';
                    let minExp = 0, maxExp = 99;
                    const dM = label.match(/^([\d.]+)\s*-\s*([\d.]+)/);
                    const gM = label.match(/^>\s*([\d.]+)/);
                    if (dM) { minExp = parseFloat(dM[1]); maxExp = parseFloat(dM[2]); }
                    else if (gM) { minExp = parseFloat(gM[1]); maxExp = 99; }
                    const rng = row[2] || '';
                    const rP = rng.split('to').map(s => parseFloat(s.trim()));
                    const minHrs = !isNaN(rP[0]) ? rP[0] : 0;
                    const maxHrs = !isNaN(rP[1]) ? rP[1] : 0;
                    const maxVal = parseFloat((row[3] || '').replace('Max:', '').trim()) || 0;
                    return (
                      <div key={ti} className="px-3 sm:px-4 py-2 border-b border-slate-50 last:border-0 min-w-[500px]"
                        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '0.5rem 0.75rem', alignItems: 'center' }}>
                        <span className="text-sm font-mono text-slate-700">{decYrsToYymm(minExp)}</span>
                        <span className="text-sm font-mono text-slate-700">{maxExp >= 99 ? '∞' : decYrsToYymm(maxExp)}</span>
                        <span className="text-sm font-mono text-slate-500">{decHrsToHhmm(minHrs)}</span>
                        <span className="text-sm font-mono text-slate-500">{decHrsToHhmm(maxHrs)}</span>
                        <span className="text-sm font-mono text-slate-500">{decHrsToHhmm(maxVal)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="md:hidden space-y-2">
                  {tabIndices.map((globalIdx, ti) => {
                    const row = rows[globalIdx];
                    const label = row[1] || '';
                    let minExp = 0, maxExp = 99;
                    const dM = label.match(/^([\d.]+)\s*-\s*([\d.]+)/);
                    const gM = label.match(/^>\s*([\d.]+)/);
                    if (dM) { minExp = parseFloat(dM[1]); maxExp = parseFloat(dM[2]); }
                    else if (gM) { minExp = parseFloat(gM[1]); maxExp = 99; }
                    const rng = row[2] || '';
                    const rP = rng.split('to').map(s => parseFloat(s.trim()));
                    const minHrs = !isNaN(rP[0]) ? rP[0] : 0;
                    const maxHrs = !isNaN(rP[1]) ? rP[1] : 0;
                    const maxVal = parseFloat((row[3] || '').replace('Max:', '').trim()) || 0;
                    return (
                      <div key={ti} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                        <div className="flex gap-3 flex-wrap">
                          <span>Min Exp: <strong className="font-mono text-slate-700">{decYrsToYymm(minExp)}</strong></span>
                          <span>Max Exp: <strong className="font-mono text-slate-700">{maxExp >= 99 ? '∞' : decYrsToYymm(maxExp)}</strong></span>
                        </div>
                        <div className="flex gap-3 flex-wrap mt-0.5">
                          <span>Min Hrs: <strong className="font-mono text-slate-500">{decHrsToHhmm(minHrs)}</strong></span>
                          <span>Max Hrs: <strong className="font-mono text-slate-500">{decHrsToHhmm(maxHrs)}</strong></span>
                          <span>Max Val: <strong className="font-mono text-slate-500">{decHrsToHhmm(maxVal)}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>);
            }
            return (<>
              <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100">
                <div className="bg-slate-50 px-3 sm:px-4 py-2.5 border-b border-slate-100 min-w-[400px]"
                  style={{ display: 'grid', gridTemplateColumns: hasValueCol ? '1.5fr 1.5fr 1.5fr' : '1.5fr 2fr', gap: '0.5rem' }}>
                  {hasValueCol ? (
                    <>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{colHeaders[0]}</span>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{colHeaders[1]}</span>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{colHeaders[2]}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{colHeaders[0]}</span>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{colHeaders[2]}</span>
                    </>
                  )}
                </div>
                {tabIndices.map((globalIdx, ti) => {
                  const row = rows[globalIdx];
                  return (
                    <div key={ti}
                      className="px-3 sm:px-4 py-2 border-b border-slate-50 last:border-0 min-w-[400px]"
                      style={{ display: 'grid', gridTemplateColumns: hasValueCol ? '1.5fr 1.5fr 1.5fr' : '1.5fr 2fr', gap: '0.5rem', alignItems: 'center' }}>
                      <span className="text-sm text-slate-700">{row[1]}</span>
                      {hasValueCol && <span className="text-sm text-slate-500 font-mono">{row[2] || '—'}</span>}
                      <span className="text-sm text-slate-400">{row[3] || '—'}</span>
                    </div>
                  );
                })}
              </div>
              <div className="md:hidden space-y-2">
                {tabIndices.map((globalIdx, ti) => {
                  const row = rows[globalIdx];
                  return (
                    <div key={ti} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                      <div className="font-semibold text-slate-800">{row[1]}</div>
                      {hasValueCol && <div className="mt-0.5 text-slate-500 font-mono">{row[2] || '—'}</div>}
                      <div className="mt-0.5 text-slate-400">{row[3] || '—'}</div>
                    </div>
                  );
                })}
              </div>
            </>);
          })()}
        </div>
      )}
    </div>
  );
}
