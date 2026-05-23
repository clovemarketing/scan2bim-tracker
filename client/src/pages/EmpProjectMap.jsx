import { useEffect, useState, useMemo } from 'react';
import { Plus, UserCheck, UserX, RefreshCw, Pencil, Users, Search } from 'lucide-react';
import { api } from '../lib/api';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

const MAP_HEADERS = ['Map ID', 'Employee', 'EMP ID', 'Project', 'Proj ID', 'Role', 'Team Lead', 'Status'];

export default function EmpProjectMap({ toast }) {
  const [mappings, setMappings] = useState([]);
  const [rowIndices, setRowIndices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState({ roles: [], mapStatuses: [], alignments: {} });
  const [loading, setLoading] = useState(true);
  const [filterLead, setFilterLead] = useState('All');
  const [filterProj, setFilterProj] = useState('All');
  const [filterStatus, setFilterStatus] = useState('Active');
  const [assignModal, setAssignModal] = useState(false);
  const [bulkAssignModal, setBulkAssignModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [form, setForm] = useState({ empId: '', projId: '', role: 'Engineer', teamLead: '', status: 'Active' });
  const [bulkForm, setBulkForm] = useState({ projId: '', role: 'Engineer', teamLead: '', search: '' });
  const [selectedEmps, setSelectedEmps] = useState(new Set());
  const [editForm, setEditForm] = useState({ role: '', teamLead: '', status: '' });
  const [leadMappings, setLeadMappings] = useState([]);
  const [assignSelected, setAssignSelected] = useState(new Set());
  const [assignSearch, setAssignSearch] = useState('');
  const [projRowMap, setProjRowMap] = useState({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [m, e, ip, full, s] = await Promise.all([api.empMap(), api.activeEmployees(), api.inProgressProjects(), api.projects(), api.settings()]);
      setMappings(m.data || []);
      setRowIndices(m.rowIndices || []);
      setEmployees(e);
      setProjects(ip);
      setSettings(s);
      const rowMap = {};
      (full.data || []).forEach((r, i) => { if (r[0]) rowMap[r[0]] = full.rowIndices[i]; });
      setProjRowMap(rowMap);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // EMP ID → Team Lead from employees (activeEmployees has col 3 = Team Lead)
  const empTlMap = useMemo(() => {
    const m = {};
    employees.forEach((e) => { if (e[0]) m[e[0]] = e[3] || ''; });
    return m;
  }, [employees]);

  const teamLeads = useMemo(() => {
    const fromMap = mappings.map((m) => m[10]).filter(Boolean);
    const fromEmp = employees.map((e) => e[3]).filter(Boolean);
    return [...new Set([...fromMap, ...fromEmp])].sort();
  }, [mappings, employees]);

  const filteredProjects = useMemo(() => projects, [projects]);

  const assignedEmpIds = useMemo(() => {
    if (!form.projId) return new Set();
    return new Set(mappings.filter((m) => m[4] === form.projId && m[8] === 'Active').map((m) => m[2]));
  }, [mappings, form.projId]);

  const availableEmps = employees.filter((e) => !assignedEmpIds.has(e[0]));

  const assignAvailableEmps = useMemo(() => {
    if (!form.projId) return [];
    const assigned = new Set(mappings.filter((m) => m[4] === form.projId && m[8] === 'Active').map((m) => m[2]));
    return employees.filter((e) => !assigned.has(e[0]));
  }, [employees, mappings, form.projId]);

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

  // ── Bulk assign helpers ────────────────────────────────────────────────
  const bulkAvailableEmps = useMemo(() => {
    if (!bulkForm.projId) return [];
    const assigned = new Set(mappings.filter((m) => m[4] === bulkForm.projId && m[8] === 'Active').map((m) => m[2]));
    return employees.filter((e) => !assigned.has(e[0]));
  }, [employees, mappings, bulkForm.projId]);

  const filteredBulkEmps = useMemo(() => {
    if (!bulkForm.search.trim()) return bulkAvailableEmps;
    const q = bulkForm.search.trim().toLowerCase();
    return bulkAvailableEmps.filter((e) =>
      (e[0] || '').toLowerCase().includes(q) ||
      (e[1] || '').toLowerCase().includes(q) ||
      (e[4] || '').toLowerCase().includes(q)
    );
  }, [bulkAvailableEmps, bulkForm.search]);

  const allFilteredSelected = filteredBulkEmps.length > 0 && filteredBulkEmps.every((e) => selectedEmps.has(e[0]));
  const someFilteredSelected = filteredBulkEmps.some((e) => selectedEmps.has(e[0]));

  const toggleBulkAll = () => {
    setSelectedEmps((prev) => {
      const n = new Set(prev);
      if (allFilteredSelected) filteredBulkEmps.forEach((e) => n.delete(e[0]));
      else filteredBulkEmps.forEach((e) => n.add(e[0]));
      return n;
    });
  };

  const bulkAssign = async () => {
    if (!bulkForm.projId || selectedEmps.size === 0) return toast.error('Select a project and at least one employee');
    setSaving(true);
    try {
      const proj = projects.find((p) => p[0] === bulkForm.projId);
      let count = 0;
      for (const empId of selectedEmps) {
        const emp = employees.find((e) => e[0] === empId);
        if (!emp) continue;
        await api.assignEmp({
          empName: emp[1], empId: emp[0], projName: proj[1], projId: proj[0],
          role: bulkForm.role, teamLead: bulkForm.teamLead || proj[4] || '',
        });
        count++;
      }
      toast.success(`${count} employees assigned to "${proj[1]}"`);
      if (bulkForm.teamLead && projRowMap[bulkForm.projId]) {
        const sheetRow = projRowMap[bulkForm.projId];
        const projData = projects.find((p) => p[0] === bulkForm.projId);
        if (projData && projData[4] !== bulkForm.teamLead) {
          const updated = projData.slice(0, 13);
          while (updated.length < 13) updated.push('');
          updated[4] = bulkForm.teamLead;
          await api.updateProject(sheetRow, updated).catch(() => {});
        }
      }
      setBulkAssignModal(false);
      setBulkForm({ projId: '', role: 'Engineer', teamLead: '', search: '' });
      setSelectedEmps(new Set());
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // Filtered view of mappings — use EMP_MAP team lead, fall back to EMPLOYEES
  const displayed = useMemo(() => mappings.filter((m) => {
    if (filterLead !== 'All') {
      const tl = m[10] || empTlMap[m[2]] || '';
      if (tl !== filterLead) return false;
    }
    if (filterProj !== 'All' && m[4] !== filterProj) return false;
    if (filterStatus !== 'All' && m[8] !== filterStatus) return false;
    return true;
  }), [mappings, filterLead, filterProj, filterStatus, empTlMap]);

  // Display rows: enrich Team Lead col from EMPLOYEES when EMP_MAP col 10 is blank
  const displayRows = useMemo(
    () => displayed.map((m) => [m[0], m[1], m[2], m[3], m[4], m[5], m[10] || empTlMap[m[2]] || '—', m[8]]),
    [displayed, empTlMap]
  );

  const allLeads = useMemo(() => {
    const fromMap = mappings.map((m) => m[10]).filter(Boolean);
    const fromEmp = employees.map((e) => e[3]).filter(Boolean);
    return [...new Set([...fromMap, ...fromEmp])].sort();
  }, [mappings, employees]);
  const allProjsInMap = useMemo(() => {
    const seen = new Set();
    return mappings.filter((m) => { if (seen.has(m[4])) return false; seen.add(m[4]); return true; })
      .map((m) => ({ id: m[4], name: m[3] || m[4] }));
  }, [mappings]);

  const roles = settings.roles?.length ? settings.roles : ['Lead', 'Engineer', 'Senior Engineer', 'Checker', 'Coordinator'];
  const mapStatuses = ['Active', 'Completed', 'Removed'];

  // Build mapId → sheetRow for fast lookup
  const rowIdxMap = useMemo(() => {
    const m = {};
    mappings.forEach((r, i) => { if (r[0]) m[r[0]] = rowIndices[i]; });
    return m;
  }, [mappings, rowIndices]);

  // rowIndices parallel to displayRows (for DataTable)
  const displayRowIndices = useMemo(
    () => displayed.map((m) => rowIdxMap[m[0]] || 0),
    [displayed, rowIdxMap]
  );

  const setStatus = async (origIdx, newStatus) => {
    try {
      const m = displayed[origIdx];
      const sheetRow = rowIdxMap[m[0]];
      if (!sheetRow) return;
      const updated = [...m]; updated[8] = newStatus;
      await api.updateEmpMap(sheetRow, updated);
      toast.success(`Assignment ${newStatus === 'Active' ? 'activated' : 'deactivated'}`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const openEdit = (origIdx) => {
    const m = displayed[origIdx];
    const sheetRow = rowIdxMap[m[0]] || 0;
    setEditModal({ origIdx, mapping: m, sheetRow });
    setEditForm({ role: m[5], teamLead: m[10], status: m[8] });
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updated = [...editModal.mapping];
      updated[5] = editForm.role;
      updated[10] = editForm.teamLead;
      updated[8] = editForm.status;
      await api.updateEmpMap(editModal.sheetRow, updated);
      toast.success('Assignment updated');
      setEditModal(null);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const assign = async () => {
    if (!form.projId || assignSelected.size === 0) return toast.error('Select project and at least one employee');
    setSaving(true);
    try {
      const proj = projects.find((p) => p[0] === form.projId);
      let count = 0;
      for (const empId of assignSelected) {
        const emp = employees.find((e) => e[0] === empId);
        if (!emp) continue;
        const alreadyMapped = mappings.some((m) => m[2] === empId && m[4] === form.projId && m[8] === 'Active');
        if (alreadyMapped) continue;
        await api.assignEmp({
          empName: emp[1], empId: emp[0], projName: proj[1], projId: proj[0],
          role: form.role, teamLead: form.teamLead || proj[4] || '',
        });
        count++;
      }
      toast.success(`${count} employee${count !== 1 ? 's' : ''} assigned to "${proj[1]}"`);
      if (form.teamLead && projRowMap[form.projId]) {
        const sheetRow = projRowMap[form.projId];
        const projData = projects.find((p) => p[0] === form.projId);
        if (projData && projData[4] !== form.teamLead) {
          const updated = projData.slice(0, 13);
          while (updated.length < 13) updated.push('');
          updated[4] = form.teamLead;
          await api.updateProject(sheetRow, updated).catch(() => {});
        }
      }
      setAssignModal(false);
      setForm({ empId: '', projId: '', role: 'Engineer', teamLead: '', status: 'Active' });
      setAssignSelected(new Set());
      setLeadMappings([]);
      setAssignSearch('');
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const bulkSetStatus = async (selectedData, status) => {
    if (!confirm(`Set ${selectedData.length} assignment(s) to "${status}"?`)) return;
    try {
      const updates = selectedData.map((d) => {
        const origIdx = displayRowIndices.indexOf(d.sheetRow);
        if (origIdx === -1) return null;
        const m = displayed[origIdx];
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">EMP – Project Assignments</h1>
          <p className="page-sub">{mappings.length} assignments · assign employees to projects via team lead</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary"><RefreshCw size={14} /></button>
          <button onClick={() => setBulkAssignModal(true)} className="btn-secondary"><Users size={14} /> Bulk Assign</button>
          <button onClick={() => setAssignModal(true)} className="btn-primary"><Plus size={14} /> Assign Employee</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-5 flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">Team Lead</label>
          <select className="input w-40" value={filterLead} onChange={(e) => setFilterLead(e.target.value)}>
            <option>All</option>
            {allLeads.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Project</label>
          <select className="input w-56" value={filterProj} onChange={(e) => setFilterProj(e.target.value)}>
            <option>All</option>
            {allProjsInMap.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input w-32" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option>All</option>
            {mapStatuses.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="text-sm text-slate-500 self-end pb-2 ml-auto">{displayed.length} results</div>
      </div>

      {loading ? <p className="text-slate-400 animate-pulse">Loading…</p> : (
        <DataTable
          headers={MAP_HEADERS}
          rows={displayRows}
          rowIndices={displayRowIndices}
          columnControl
          storageKey="emp-map"
          selectable
          defaultHiddenCols={[2, 4]}
          alignments={(settings?.alignments || {})['EMP_MAP'] || []}
          bulkActions={[
            { label: 'Activate', icon: UserCheck, onClick: (sel) => bulkSetStatus(sel, 'Active') },
            { label: 'Remove', icon: UserX, danger: true, onClick: (sel) => bulkSetStatus(sel, 'Removed') },
          ]}
          actions={{
            renderCell: (ci, val) => ci === 7 ? <Badge value={val} /> : val,
            renderRow: (row, sheetRow) => {
              const origIdx = displayRowIndices.indexOf(sheetRow);
              if (origIdx === -1) return null;
              const isActive = displayed[origIdx]?.[8] === 'Active';
              return (
                <>
                  <button onClick={() => openEdit(origIdx)} className="btn-secondary py-1 px-2 text-xs gap-1">
                    <Pencil size={11} /> Edit
                  </button>
                  <button
                    onClick={() => setStatus(origIdx, isActive ? 'Removed' : 'Active')}
                    className={`btn py-1 px-2 text-xs gap-1 ${isActive ? 'btn-secondary text-red-600 border-red-100 hover:bg-red-50' : 'btn-secondary text-emerald-600 border-emerald-100 hover:bg-emerald-50'}`}
                  >
                    {isActive ? <><UserX size={11} /> Remove</> : <><UserCheck size={11} /> Activate</>}
                  </button>
                </>
              );
            },
          }}
        />
      )}

      {/* Edit Modal */}
      {editModal && (
        <Modal title="Edit Assignment" onClose={() => setEditModal(null)}>
          <div className="mb-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
            <span className="font-medium">{editModal.mapping[1]}</span> → <span className="font-medium">{editModal.mapping[3]}</span>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label">Role</label>
              <select className="input" value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}>
                {roles.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Team Lead</label>
              <select className="input" value={editForm.teamLead} onChange={(e) => setEditForm((f) => ({ ...f, teamLead: e.target.value }))}>
                <option value="">— Select —</option>
                {teamLeads.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                {mapStatuses.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={saveEdit} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* Assign Modal */}
      {assignModal && (
        <Modal title="Assign Employee to Project" onClose={() => {
          setAssignModal(false);
          setForm({ empId: '', projId: '', role: 'Engineer', teamLead: '', status: 'Active' });
          setAssignSelected(new Set());
          setLeadMappings([]);
          setAssignSearch('');
        }} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Team Lead (from Employees)</label>
                <select className="input" value={form.teamLead} onChange={async (e) => {
                  const val = e.target.value;
                  setForm((f) => ({ ...f, teamLead: val, projId: '' }));
                  setAssignSearch('');
                  if (val) {
                    const underLead = employees.filter((emp) => emp[3] === val && emp[6] === 'Active');
                    setAssignSelected(new Set(underLead.map((emp) => emp[0])));
                    try {
                      const mapped = await api.empMapByLead(val);
                      setLeadMappings(mapped);
                    } catch {
                      setLeadMappings([]);
                    }
                  } else {
                    setAssignSelected(new Set());
                    setLeadMappings([]);
                  }
                }}>
                  <option value="">— All leads —</option>
                  {teamLeads.map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Project (In Progress) *</label>
                <select className="input" value={form.projId} onChange={(e) => {
                  setForm((f) => ({ ...f, projId: e.target.value }));
                }}>
                  <option value="">— Select project —</option>
                  {filteredProjects.map((p) => <option key={p[0]} value={p[0]}>{p[1]} ({p[0]})</option>)}
                </select>
              </div>
            </div>

            {form.projId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">
                    Select Employees ({assignSelected.size} of {assignAvailableEmps.length} available)
                  </label>
                  {form.teamLead && (
                    <span className="text-xs text-slate-400">
                      {employees.filter((e) => e[3] === form.teamLead && e[6] === 'Active').length} under {form.teamLead}
                    </span>
                  )}
                </div>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input pl-9 text-sm" placeholder="Search employees…"
                    value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} />
                </div>
                <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto">
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
                          const isUnderLead = form.teamLead && emp[3] === form.teamLead;
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
                                {isUnderLead ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-medium">
                                    ✓
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
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
                      const emp = employees.find((e) => e[0] === id);
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
              setForm({ empId: '', projId: '', role: 'Engineer', teamLead: '', status: 'Active' });
              setAssignSelected(new Set());
              setLeadMappings([]);
              setAssignSearch('');
            }} className="btn-secondary">Cancel</button>
            <button onClick={assign} disabled={saving || !form.projId || assignSelected.size === 0} className="btn-primary">
              {saving ? 'Assigning…' : `Assign ${assignSelected.size} employee${assignSelected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </Modal>
      )}

      {/* Bulk Assign Modal */}
      {bulkAssignModal && (
        <Modal title="Bulk Assign Employees to Project" onClose={() => {
          setBulkAssignModal(false);
          setBulkForm({ projId: '', role: 'Engineer', teamLead: '', search: '' });
          setSelectedEmps(new Set());
        }} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Team Lead (filter)</label>
                <select className="input" value={bulkForm.teamLead} onChange={(e) => setBulkForm((f) => ({ ...f, teamLead: e.target.value, projId: '' }))}>
                  <option value="">— All leads —</option>
                  {teamLeads.map((l) => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Project (In Progress) *</label>
                <select className="input" value={bulkForm.projId} onChange={(e) => {
                  setBulkForm((f) => ({ ...f, projId: e.target.value }));
                  setSelectedEmps(new Set());
                }}>
                  <option value="">— Select project —</option>
                  {(bulkForm.teamLead ? projects.filter((p) => p[4] === bulkForm.teamLead) : projects).map((p) => (
                    <option key={p[0]} value={p[0]}>{p[1]} ({p[0]})</option>
                  ))}
                </select>
              </div>
            </div>

            {bulkForm.projId && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Select Employees ({selectedEmps.size} of {bulkAvailableEmps.length} available)</label>
                    <span className="text-xs text-slate-400">
                      {mappings.filter((m) => m[4] === bulkForm.projId && m[8] === 'Active').length} already assigned
                    </span>
                  </div>
                  <div className="relative mb-2">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input className="input pl-9 text-sm" placeholder="Search employees…"
                      value={bulkForm.search} onChange={(e) => setBulkForm((f) => ({ ...f, search: e.target.value }))} />
                  </div>
                  <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto">
                    {filteredBulkEmps.length === 0 ? (
                      <p className="text-center text-slate-400 text-sm py-8">No available employees</p>
                    ) : (
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 w-10">
                              <input type="checkbox" className="accent-indigo-600 cursor-pointer"
                                checked={allFilteredSelected}
                                ref={(el) => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected; }}
                                onChange={toggleBulkAll} />
                            </th>
                            <th className="text-left px-2 py-2 font-semibold text-slate-500">EMP ID</th>
                            <th className="text-left px-2 py-2 font-semibold text-slate-500">Name</th>
                            <th className="text-left px-2 py-2 font-semibold text-slate-500">Department</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredBulkEmps.map((emp) => {
                            const checked = selectedEmps.has(emp[0]);
                            return (
                              <tr key={emp[0]} className={`border-b border-slate-50 ${checked ? 'bg-indigo-50/60' : 'hover:bg-indigo-50/30'}`}>
                                <td className="px-3 py-2">
                                  <input type="checkbox" className="accent-indigo-600 cursor-pointer"
                                    checked={checked} onChange={() => setSelectedEmps((prev) => {
                                      const n = new Set(prev);
                                      n.has(emp[0]) ? n.delete(emp[0]) : n.add(emp[0]);
                                      return n;
                                    })} />
                                </td>
                                <td className="px-2 py-2 font-mono text-slate-500">{emp[0]}</td>
                                <td className="px-2 py-2 font-medium">{emp[1]}</td>
                                <td className="px-2 py-2 text-slate-500">{emp[4] || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {selectedEmps.size > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 rounded-xl max-h-20 overflow-y-auto">
                    {[...selectedEmps].map((id) => {
                      const emp = employees.find((e) => e[0] === id);
                      return emp ? (
                        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded text-xs text-slate-600 border border-slate-200">
                          {emp[1] || id}
                          <button onClick={() => setSelectedEmps((prev) => { const n = new Set(prev); n.delete(id); return n; })}
                            className="text-slate-400 hover:text-red-500 ml-0.5">&times;</button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => { setBulkAssignModal(false); setBulkForm({ projId: '', role: 'Engineer', teamLead: '', search: '' }); setSelectedEmps(new Set()); }}
              className="btn-secondary">Cancel</button>
            <button onClick={bulkAssign} disabled={saving || !bulkForm.projId || selectedEmps.size === 0} className="btn-primary">
              {saving ? 'Assigning…' : `Assign ${selectedEmps.size} employee${selectedEmps.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
