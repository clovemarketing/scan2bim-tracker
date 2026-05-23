import { useEffect, useState, useCallback } from 'react';
import {
  Plus, RefreshCw, ShieldCheck, ShieldOff, KeyRound, Loader,
  UserPlus, CloudUpload, CheckCircle, AlertCircle, Clock, Eye, EyeOff,
  Folder, FileText, Download, ChevronRight, ChevronDown, HardDrive,
} from 'lucide-react';
import { api } from '../lib/api';

const ROLES = ['Admin', 'Team Lead'];

const ROLE_META = {
  Admin: {
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-500',
    pages: 'All pages',
  },
  'Team Lead': {
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    pages: 'Employees · Attendance · Division Targets · Shift Roster',
  },
};

const STATUS_CLS = {
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Disabled: 'bg-red-50 text-red-600 border-red-200',
};

function RoleBadge({ role }) {
  const m = ROLE_META[role] || { color: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400', pages: 'Unknown' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold border px-2 py-0.5 rounded-full ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {role}
    </span>
  );
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function BackupFileManager({ toast }) {
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [expanded, setExpanded] = useState({});

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.backupList();
      setMonths(res.months || []);
      // Auto-expand the first (most recent) month folder
      if (res.months?.length && !Object.keys(expanded).length) {
        setExpanded({ [res.months[0].id]: true });
      }
    } catch (e) { toast?.error?.(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList(); }, []);

  const toggleMonth = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center">
        <Loader size={14} className="animate-spin" /> Loading backups…
      </div>
    );
  }

  if (!months.length) {
    return (
      <div className="text-center py-6 text-slate-400">
        <HardDrive size={24} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">No backups found in Google Drive</p>
        <p className="text-xs mt-1">Backups will appear here once the daily auto-backup runs</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {months.map((month) => {
        const isOpen = expanded[month.id];
        const totalSize = month.files.reduce((s, f) => s + (f.size || 0), 0);
        return (
          <div key={month.id} className="border border-slate-100 rounded-xl overflow-hidden">
            {/* Month folder header */}
            <button
              onClick={() => toggleMonth(month.id)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              {isOpen ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
              <Folder size={16} className="text-amber-500 shrink-0" />
              <span className="text-sm font-medium text-slate-700 flex-1">{month.name}</span>
              <span className="text-[11px] text-slate-400">{month.files.length} file{month.files.length > 1 ? 's' : ''}</span>
              <span className="text-[11px] text-slate-400 font-mono">{formatFileSize(totalSize)}</span>
            </button>

            {/* File list */}
            {isOpen && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {month.files.map((file) => (
                  <div key={file.id} className="flex items-center gap-3 px-4 py-2.5 pl-12 hover:bg-slate-50/60 transition-colors">
                    <FileText size={14} className="text-indigo-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">{file.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {formatDate(file.modifiedTime || file.createdTime)}
                        {file.size ? ` · ${formatFileSize(file.size)}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(api.backupDownloadUrl(file.id), {
                            headers: { Authorization: `Bearer ${localStorage.getItem('s2b_token')}` },
                          });
                          if (!res.ok) throw new Error('Download failed');
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = file.name;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch (e) { toast?.error?.(e.message); }
                      }}
                      className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                      title="Download backup"
                    >
                      <Download size={12} /> Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BackupSection({ toast }) {
  const [info, setInfo] = useState(null);
  const [triggering, setTriggering] = useState(false);
  const [showFiles, setShowFiles] = useState(false);

  const fetchStatus = useCallback(async () => {
    try { setInfo(await api.backupStatus()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 15000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  const trigger = async () => {
    setTriggering(true);
    try {
      await api.triggerBackup();
      toast.success('Backup started — check status in a moment');
      setTimeout(fetchStatus, 5000);
    } catch (e) { toast.error(e.message); }
    finally { setTriggering(false); }
  };

  const isRunning = info?.status === 'running';
  const isSuccess = info?.status === 'success';
  const isError = info?.status === 'error';

  return (
    <div className="mt-8 border border-slate-100 rounded-2xl p-5 bg-white">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CloudUpload size={16} className="text-indigo-500" />
          <p className="text-sm font-semibold text-slate-700">Daily Google Drive Backup</p>
        </div>
        <button
          onClick={trigger}
          disabled={triggering || isRunning}
          className="btn-primary py-1.5 text-xs gap-1.5 disabled:opacity-60"
        >
          {triggering || isRunning
            ? <><Loader size={12} className="animate-spin" /> Running…</>
            : <><CloudUpload size={12} /> Backup Now</>}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-slate-400 mb-1">Status</p>
          {!info || !info.status ? (
            <span className="text-slate-400">—</span>
          ) : isRunning ? (
            <span className="flex items-center gap-1.5 text-amber-600 font-semibold"><Loader size={12} className="animate-spin" /> Running</span>
          ) : isSuccess ? (
            <span className="flex items-center gap-1.5 text-emerald-600 font-semibold"><CheckCircle size={12} /> Success</span>
          ) : isError ? (
            <span className="flex items-center gap-1.5 text-red-500 font-semibold"><AlertCircle size={12} /> Failed</span>
          ) : (
            <span className="text-slate-500">—</span>
          )}
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-slate-400 mb-1">Last File</p>
          <p className="text-slate-700 font-medium truncate">{info?.fileName || '—'}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-slate-400 mb-1">Last Run</p>
          <p className="text-slate-700 font-medium">
            {info?.time ? new Date(info.time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
          </p>
        </div>
      </div>

      {isError && info.error && (
        <p className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
          Error: {info.error}
        </p>
      )}

      {/* File manager toggle */}
      <div className="mt-4">
        <button
          onClick={() => setShowFiles((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          {showFiles ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <HardDrive size={12} />
          Backup Files ({showFiles ? 'hide' : 'show'})
        </button>

        {showFiles && (
          <div className="mt-3">
            <BackupFileManager toast={toast} />
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        Auto-runs daily · saves to Google Drive → <span className="font-medium text-slate-500">Month folder / Scan2BIM_YYYY-MM-DD.xlsx</span>
      </p>
    </div>
  );
}

export default function UserManagement({ toast, currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'add' | { type: 'pw', row, name }
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Team Lead' });
  const [pwValue, setPwValue] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setUsers(await api.users()); }
    catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const createUser = async () => {
    if (!form.name || !form.email || !form.password) return toast.error('Name, email and password required');
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    setSaving(true);
    try {
      await api.createUser(form);
      toast.success(`${form.name} added`);
      setModal(null);
      setForm({ name: '', email: '', password: '', role: 'Team Lead' });
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const updateStatus = async (user, status) => {
    try {
      await api.updateUser(user.row, { status });
      toast.success(`${user.name} ${status === 'Active' ? 'enabled' : 'disabled'}`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const updateRole = async (user, role) => {
    try {
      await api.updateUser(user.row, { role });
      toast.success(`${user.name} → ${role}`);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const resetPassword = async () => {
    if (!pwValue || pwValue.length < 6) return toast.error('Password must be at least 6 characters');
    setSaving(true);
    try {
      await api.changePassword(modal.row, pwValue);
      toast.success('Password updated');
      setModal(null);
      setPwValue('');
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-slate-800">User Accounts</h3>
          <p className="text-xs text-slate-400 mt-0.5">Manage login access — stored in Google Sheets (USERS tab)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary py-1.5 px-2.5"><RefreshCw size={13} /></button>
          <button onClick={() => { setModal('add'); setShowPw(false); }} className="btn-primary py-1.5 text-xs gap-1.5">
            <UserPlus size={13} /> Add User
          </button>
        </div>
      </div>

      {/* Role permissions legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {ROLES.map((role) => {
          const m = ROLE_META[role];
          return (
            <div key={role} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${m.color}`}>
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${m.dot}`} />
              <div>
                <p className="text-xs font-semibold">{role}</p>
                <p className="text-[11px] opacity-80 mt-0.5">{m.pages}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* User list */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
          <Loader size={16} className="animate-spin" /> Loading users…
        </div>
      ) : (
        <div className="space-y-2">
          {users.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-8">No users found</p>
          )}
          {users.map((u) => (
            <div key={u.row} className="bg-white border border-slate-100 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <span className="text-indigo-700 font-bold text-sm">{(u.name || '?')[0].toUpperCase()}</span>
              </div>

              {/* Name / email */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                  {u.email === currentUser?.email && (
                    <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-200 px-1.5 py-0.5 rounded font-medium">You</span>
                  )}
                  <RoleBadge role={u.role} />
                  <span className={`text-[11px] font-medium border px-2 py-0.5 rounded-full ${STATUS_CLS[u.status] || STATUS_CLS.Pending}`}>
                    {u.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate">{u.email}</p>
                {u.lastLogin && (
                  <p className="text-[10px] text-slate-300 flex items-center gap-1 mt-0.5">
                    <Clock size={9} /> Last login: {u.lastLogin}
                  </p>
                )}
              </div>

              {/* Role selector */}
              <select
                value={u.role}
                onChange={(e) => updateRole(u, e.target.value)}
                disabled={u.email === currentUser?.email}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>

              {/* Action buttons */}
              <div className="flex gap-1 shrink-0">
                {u.status === 'Pending' && (
                  <button onClick={() => updateStatus(u, 'Active')} title="Approve" className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors">
                    <ShieldCheck size={14} />
                  </button>
                )}
                {u.status === 'Active' && u.email !== currentUser?.email && (
                  <button onClick={() => updateStatus(u, 'Disabled')} title="Disable account" className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                    <ShieldOff size={14} />
                  </button>
                )}
                {u.status === 'Disabled' && (
                  <button onClick={() => updateStatus(u, 'Active')} title="Re-enable account" className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors">
                    <ShieldCheck size={14} />
                  </button>
                )}
                <button
                  onClick={() => { setModal({ type: 'pw', row: u.row, name: u.name }); setPwValue(''); setShowNewPw(false); }}
                  title="Reset password"
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
                >
                  <KeyRound size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Backup section */}
      <BackupSection toast={toast} />

      {/* ── Add User modal ── */}
      {modal === 'add' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-slate-800 mb-5 flex items-center gap-2">
              <Plus size={16} /> Add User
            </h3>
            <div className="space-y-3">
              <div>
                <label className="label">Full Name</label>
                <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="John Doe" />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="john@clovetech.com" />
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    className="input pr-9"
                    type={showPw ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 6 characters"
                  />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  {ROLE_META[form.role]?.pages}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={createUser} disabled={saving} className="btn-primary">
                {saving ? 'Adding…' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset password modal ── */}
      {modal?.type === 'pw' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs">
            <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
              <KeyRound size={16} /> Reset Password
            </h3>
            <p className="text-xs text-slate-400 mb-4">{modal.name}</p>
            <div className="relative">
              <input
                className="input pr-9"
                type={showNewPw ? 'text' : 'password'}
                placeholder="New password (min. 6 chars)"
                value={pwValue}
                onChange={(e) => setPwValue(e.target.value)}
              />
              <button type="button" onClick={() => setShowNewPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={resetPassword} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
