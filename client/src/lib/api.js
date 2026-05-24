const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export function getToken() { return localStorage.getItem('s2b_token') || ''; }
export function setToken(t) { t ? localStorage.setItem('s2b_token', t) : localStorage.removeItem('s2b_token'); }

// ── In-memory GET cache (30-second TTL) + in-flight deduplication ─────────────
const _cache = {};    // url → { data, ts }
const _inFlight = {}; // url → Promise
const TTL = 30_000;

function _get(url) {
  const e = _cache[url];
  return e && Date.now() - e.ts < TTL ? e.data : null;
}
function _set(url, data) { _cache[url] = { data, ts: Date.now() }; }
function _bust(...urls) { urls.forEach(u => delete _cache[u]); }
function _bustPrefix(prefix) {
  for (const k of Object.keys(_cache)) if (k.startsWith(prefix)) delete _cache[k];
}
function _bustSheet(sheet) {
  const map = {
    EMPLOYEES: '/employees',
    PROJECTS: '/projects',
    EMP_MAP: '/emp-map',
    PROJ_HOURS: '/project-hours',
    ATTENDANCE: '/attendance',
    ATT_STORE: '/att-store',
  };
  const prefix = map[sheet];
  if (prefix) _bustPrefix(prefix);
}
export function clearApiCache() { for (const k of Object.keys(_cache)) delete _cache[k]; }
// ─────────────────────────────────────────────────────────────────────────────

async function req(url, opts = {}) {
  const method = opts.method || 'GET';
  const headers = {
    'Content-Type': 'application/json',
    ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    ...(opts.headers || {}),
  };

  if (method === 'GET') {
    const cached = _get(url);
    if (cached) return cached;

    if (_inFlight[url]) return _inFlight[url];

    _inFlight[url] = fetch(BASE + url, { headers })
      .then(async res => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Request failed');
        _set(url, json);
        return json;
      })
      .finally(() => { delete _inFlight[url]; });

    return _inFlight[url];
  }

  const res = await fetch(BASE + url, { ...opts, headers });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

export const api = {
  // Auth
  login: async (email, password) => {
    const r = await req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    clearApiCache();
    return r;
  },
  verify: () => req('/auth/verify'),
  logout: async () => {
    const r = await req('/auth/logout', { method: 'POST' });
    clearApiCache();
    return r;
  },

  // Users
  users: () => req('/users'),
  createUser: (body) => req('/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (row, body) => req(`/users/${row}`, { method: 'PUT', body: JSON.stringify(body) }),
  changePassword: (row, password) => req(`/users/${row}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),

  // Settings
  settings: () => req('/settings'),
  saveSettings: async (rows) => {
    const r = await req('/settings', { method: 'PUT', body: JSON.stringify({ rows }) });
    _bust('/settings');
    return r;
  },

  // Employees
  employees: () => req('/employees'),
  activeEmployees: () => req('/employees/active'),
  addEmployee: async (row) => {
    const r = await req('/employees', { method: 'POST', body: JSON.stringify(row) });
    _bustPrefix('/employees');
    return r;
  },
  updateEmployee: async (rowIdx, row) => {
    const r = await req(`/employees/${rowIdx}`, { method: 'PUT', body: JSON.stringify(row) });
    _bustPrefix('/employees');
    return r;
  },
  syncExperience: async () => {
    const r = await req('/employees/sync-experience', { method: 'POST' });
    _bustPrefix('/employees');
    return r;
  },
  backfillReqEff: async () => {
    const r = await req('/employees/backfill-req-eff', { method: 'POST' });
    _bustPrefix('/employees');
    return r;
  },
  importEmployees: async (rows) => {
    const r = await req('/employees/import', { method: 'POST', body: JSON.stringify({ rows }) });
    _bustPrefix('/employees');
    return r;
  },

  // Projects
  projects: () => req('/projects'),
  inProgressProjects: () => req('/projects/inprogress'),
  qaqcProjects: () => req('/projects/qaqc'),
  feedbackProjects: () => req('/projects/feedback'),
  internalFeedbackProjects: () => req('/projects/internal-feedback'),
  projectTypes: () => req('/projects/types'),
  addProject: async (row) => {
    const r = await req('/projects', { method: 'POST', body: JSON.stringify(row) });
    _bustPrefix('/projects');
    return r;
  },
  updateProject: async (rowIdx, row) => {
    const r = await req(`/projects/${rowIdx}`, { method: 'PUT', body: JSON.stringify(row) });
    _bustPrefix('/projects');
    return r;
  },
  importProjects: async (rows) => {
    const r = await req('/projects/import', { method: 'POST', body: JSON.stringify({ rows }) });
    _bustPrefix('/projects');
    return r;
  },
  projectTemplateUrl: () => `${BASE}/projects/template`,

  // EMP Map
  empMap: () => req('/emp-map'),
  empMapByEmployee: (empId) => req(`/emp-map/by-employee/${encodeURIComponent(empId)}`),
  empMapByLead: (lead) => req(`/emp-map/by-lead/${encodeURIComponent(lead)}`),
  assignEmp: async (body) => {
    const r = await req('/emp-map/assign', { method: 'POST', body: JSON.stringify(body) });
    _bustPrefix('/emp-map');
    return r;
  },
  updateEmpMap: async (rowIdx, row) => {
    const r = await req(`/emp-map/${rowIdx}`, { method: 'PUT', body: JSON.stringify(row) });
    _bustPrefix('/emp-map');
    return r;
  },

  // Attendance
  attendanceToday: (date) => req(`/attendance/today${date ? `?date=${date}` : ''}`),
  setAttStatus: async (body) => {
    const r = await req('/attendance/status', { method: 'POST', body: JSON.stringify(body) });
    _bustPrefix('/attendance');
    return r;
  },
  logSession: async (body) => {
    const r = await req('/attendance/session', { method: 'POST', body: JSON.stringify(body) });
    _bustPrefix('/attendance');
    return r;
  },
  deleteSession: async (row) => {
    const r = await req(`/attendance/session/${row}`, { method: 'DELETE' });
    _bustPrefix('/attendance');
    return r;
  },
  editSession: async (row, body) => {
    const r = await req(`/attendance/session/${row}`, { method: 'PUT', body: JSON.stringify(body) });
    _bustPrefix('/attendance');
    return r;
  },
  editStoreSession: async (row, body) => {
    const r = await req(`/att-store/${row}`, { method: 'PUT', body: JSON.stringify(body) });
    _bust('/att-store');
    _bustPrefix('/attendance');
    return r;
  },
  attendanceRaw: () => req('/attendance'),
  attendanceSummary: (params) => req(`/attendance/summary?${new URLSearchParams(params)}`),
  attStore: () => req('/att-store'),

  // Project Hours
  projectHours: () => req('/project-hours'),
  addProjectHours: async (row) => {
    const r = await req('/project-hours', { method: 'POST', body: JSON.stringify(row) });
    _bust('/project-hours');
    return r;
  },

  // Efficiency
  efficiency: () => req('/efficiency'),

  // Dashboard
  dashboard: () => req('/dashboard'),
  monthEndSummary: (year, month) => req(`/month-end-summary?year=${year}&month=${month}`),

  // Team Analytics
  teamAnalytics: () => req('/team-analytics'),

  // Division Targets
  getDivTargets: (year, month) => req(`/div-targets?year=${year}&month=${month}`),
  saveDivTargets: (year, month, divisionTarget, targets) => req('/div-targets', { method: 'POST', body: JSON.stringify({ year, month, divisionTarget, targets }) }),

  // Holidays
  getHolidays: (year) => req(`/holidays?year=${year}`),
  saveHolidays: (holidays) => req('/holidays', { method: 'POST', body: JSON.stringify({ holidays }) }),

  // Bulk operations — bust cache based on the sheet being written
  bulkUpdate: async (sheet, updates) => {
    const r = await req('/bulk-update', { method: 'POST', body: JSON.stringify({ sheet, updates }) });
    _bustSheet(sheet);
    return r;
  },
  bulkClearRows: async (sheet, rows) => {
    const r = await req('/bulk-clear-rows', { method: 'POST', body: JSON.stringify({ sheet, rows }) });
    _bustSheet(sheet);
    return r;
  },

  // Backup
  backupStatus: () => req('/backup/status'),
  triggerBackup: () => req('/backup', { method: 'POST' }),
  backupList: () => req('/backup/list'),
  backupDownloadUrl: (fileId) => `${BASE}/backup/download/${encodeURIComponent(fileId)}`,

  // Summary sheet sync
  syncQaqc: async () => {
    const r = await req('/sync/qaqc', { method: 'POST' });
    _bustPrefix('/projects');
    return r;
  },
  syncFeedback: async () => {
    const r = await req('/sync/feedback', { method: 'POST' });
    _bustPrefix('/projects');
    return r;
  },
  syncInternalFeedback: async () => {
    const r = await req('/sync/internal-feedback', { method: 'POST' });
    _bustPrefix('/projects');
    return r;
  },

  // Data management
  migrate: () => req('/migrate', { method: 'POST' }),
  clearSheet: async (sheet) => {
    const r = await req(`/clear/${sheet}`, { method: 'POST' });
    clearApiCache();
    return r;
  },
  clearAll: async () => {
    const r = await req('/clear-all', { method: 'POST' });
    clearApiCache();
    return r;
  },
  syncColumns: () => req('/sync-columns', { method: 'POST' }),
  syncFromExcel: async () => {
    const r = await req('/sync-from-excel', { method: 'POST' });
    clearApiCache();
    return r;
  },
};
