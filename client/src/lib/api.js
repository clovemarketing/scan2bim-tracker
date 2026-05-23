const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export function getToken() { return localStorage.getItem('s2b_token') || ''; }
export function setToken(t) { t ? localStorage.setItem('s2b_token', t) : localStorage.removeItem('s2b_token'); }

async function req(url, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) };
  const res = await fetch(BASE + url, { ...opts, headers });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

export const api = {
  // Auth
  login: (email, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  verify: () => req('/auth/verify'),
  logout: () => req('/auth/logout', { method: 'POST' }),

  // Users
  users: () => req('/users'),
  createUser: (body) => req('/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (row, body) => req(`/users/${row}`, { method: 'PUT', body: JSON.stringify(body) }),
  changePassword: (row, password) => req(`/users/${row}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),

  // Settings
  settings: () => req('/settings'),
  saveSettings: (rows) => req('/settings', { method: 'PUT', body: JSON.stringify({ rows }) }),

  // Employees
  employees: () => req('/employees'),
  activeEmployees: () => req('/employees/active'),
  addEmployee: (row) => req('/employees', { method: 'POST', body: JSON.stringify(row) }),
  updateEmployee: (rowIdx, row) => req(`/employees/${rowIdx}`, { method: 'PUT', body: JSON.stringify(row) }),
  syncExperience: () => req('/employees/sync-experience', { method: 'POST' }),
  importEmployees: (rows) => req('/employees/import', { method: 'POST', body: JSON.stringify({ rows }) }),

  // Projects
  projects: () => req('/projects'),
  inProgressProjects: () => req('/projects/inprogress'),
  qaqcProjects: () => req('/projects/qaqc'),
  feedbackProjects: () => req('/projects/feedback'),
  internalFeedbackProjects: () => req('/projects/internal-feedback'),
  projectTypes: () => req('/projects/types'),
  addProject: (row) => req('/projects', { method: 'POST', body: JSON.stringify(row) }),
  updateProject: (rowIdx, row) => req(`/projects/${rowIdx}`, { method: 'PUT', body: JSON.stringify(row) }),
  importProjects: (rows) => req('/projects/import', { method: 'POST', body: JSON.stringify({ rows }) }),
  projectTemplateUrl: () => `${BASE}/projects/template`,

  // EMP Map
  empMap: () => req('/emp-map'),
  empMapByEmployee: (empId) => req(`/emp-map/by-employee/${encodeURIComponent(empId)}`),
  empMapByLead: (lead) => req(`/emp-map/by-lead/${encodeURIComponent(lead)}`),
  assignEmp: (body) => req('/emp-map/assign', { method: 'POST', body: JSON.stringify(body) }),
  updateEmpMap: (rowIdx, row) => req(`/emp-map/${rowIdx}`, { method: 'PUT', body: JSON.stringify(row) }),

  // Attendance
  attendanceToday: (date) => req(`/attendance/today${date ? `?date=${date}` : ''}`),
  setAttStatus: (body) => req('/attendance/status', { method: 'POST', body: JSON.stringify(body) }),
  logSession: (body) => req('/attendance/session', { method: 'POST', body: JSON.stringify(body) }),
  deleteSession: (row) => req(`/attendance/session/${row}`, { method: 'DELETE' }),
  editSession: (row, body) => req(`/attendance/session/${row}`, { method: 'PUT', body: JSON.stringify(body) }),
  editStoreSession: (row, body) => req(`/att-store/${row}`, { method: 'PUT', body: JSON.stringify(body) }),
  attendanceRaw: () => req('/attendance'),
  attendanceSummary: (params) => req(`/attendance/summary?${new URLSearchParams(params)}`),
  attStore: () => req('/att-store'),

  // Project Hours
  projectHours: () => req('/project-hours'),
  addProjectHours: (row) => req('/project-hours', { method: 'POST', body: JSON.stringify(row) }),

  // Efficiency
  efficiency: () => req('/efficiency'),

  // Dashboard
  dashboard: () => req('/dashboard'),

  // Team Analytics
  teamAnalytics: () => req('/team-analytics'),

  // Bulk operations
  bulkUpdate: (sheet, updates) => req('/bulk-update', { method: 'POST', body: JSON.stringify({ sheet, updates }) }),
  bulkClearRows: (sheet, rows) => req('/bulk-clear-rows', { method: 'POST', body: JSON.stringify({ sheet, rows }) }),

  // Backup
  backupStatus: () => req('/backup/status'),
  triggerBackup: () => req('/backup', { method: 'POST' }),
  backupList: () => req('/backup/list'),
  backupDownloadUrl: (fileId) => `${BASE}/backup/download/${encodeURIComponent(fileId)}`,

  // Data management
  migrate: () => req('/migrate', { method: 'POST' }),
  clearSheet: (sheet) => req(`/clear/${sheet}`, { method: 'POST' }),
  clearAll: () => req('/clear-all', { method: 'POST' }),
  syncColumns: () => req('/sync-columns', { method: 'POST' }),
  syncFromExcel: () => req('/sync-from-excel', { method: 'POST' }),
};
