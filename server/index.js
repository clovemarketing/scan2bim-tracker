const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const XLSX = require('xlsx');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1aqve6g9hN7sVBiJnFO4cFnpk-nPZu1SsuUzPxM2YAA8';
const KEY_FILE = path.join(__dirname, '..', 'research-analyst-ai-eba40b0ad0e6.json');
const EXCEL_FILE = path.join(__dirname, '..', 'Scan2Bim_March-.xlsx');

const SHEETS = {
  EMPLOYEES: 'EMPLOYEES',
  PROJECTS: 'PROJECTS',
  EMP_MAP: 'EMP_MAP',
  ATTENDANCE: 'ATTENDANCE',
  ATT_STORE: 'ATT_STORE',
  PROJ_HOURS: 'PROJ_HOURS',
  EFF_LOG: 'EFF_LOG',
  SETTINGS: 'SETTINGS',
  USERS: 'USERS',
  QAQC: 'QAQC_PROJECTS',
  FEEDBACK: 'FEEDBACK_PROJECTS',
  INT_FB: 'INT_FEEDBACK_PROJECTS',
  DIV_TARGETS: 'DIV_TARGETS',
  HOLIDAYS: 'HOLIDAYS',
};

// ── Auth ──────────────────────────────────────────────────────────────────────
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];
const auth = process.env.GOOGLE_CREDENTIALS
  ? new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS), scopes: GOOGLE_SCOPES })
  : new google.auth.GoogleAuth({ keyFile: KEY_FILE, scopes: GOOGLE_SCOPES });
const sheetsApi = google.sheets({ version: 'v4', auth });
const driveApi = google.drive({ version: 'v3', auth });

const BACKUP_FOLDER_ID = '0AEfDHofWkDZKUk9PVA'; // shared drive root backup folder

app.use(cors());
app.use(express.json());

// ── Exponential Backoff & Retry ───────────────────────────────────────────────
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 32000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err) {
  if (!err) return false;
  const code = err.code || (err.response?.status);
  if (code === 429 || code === 500 || code === 502 || code === 503 || code === 504) return true;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('rate limit') || msg.includes('quota') || msg.includes('too many requests') || msg.includes('retry');
}

async function withRetry(fn, retriesLeft = MAX_RETRIES) {
  try {
    return await fn();
  } catch (err) {
    if (retriesLeft <= 0 || !isRetryableError(err)) throw err;
    const attempt = MAX_RETRIES - retriesLeft + 1;
    const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
    const jitter = Math.random() * 1000;
    const waitMs = backoff + jitter;
    console.warn(`API rate limit/transient error (attempt ${attempt}/${MAX_RETRIES}), retrying in ${Math.round(waitMs)}ms...`);
    await sleep(waitMs);
    return withRetry(fn, retriesLeft - 1);
  }
}

// ── Sheet Read Cache ───────────────────────────────────────────────────────────
const READ_CACHE_TTL_MS = 15 * 1000;
const _readCache = new Map();

function cacheKey(sheet, range) {
  return `${sheet}!${range}`;
}

function getCached(sheet, range) {
  const key = cacheKey(sheet, range);
  const entry = _readCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > READ_CACHE_TTL_MS) {
    _readCache.delete(key);
    return null;
  }
  return entry.values;
}

function setCached(sheet, range, values) {
  const key = cacheKey(sheet, range);
  _readCache.set(key, { values, at: Date.now() });
}

function invalidateSheetCache(sheet) {
  for (const key of _readCache.keys()) {
    if (key.startsWith(`${sheet}!`)) {
      _readCache.delete(key);
    }
  }
}

function invalidateAllCache() {
  _readCache.clear();
}

// ── Sheet helpers (cached + retry) ────────────────────────────────────────────
async function getValues(sheet, range) {
  const cached = getCached(sheet, range);
  if (cached !== null) return cached;
  const res = await withRetry(() =>
    sheetsApi.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${sheet}!${range}` })
  );
  const values = res.data.values || [];
  setCached(sheet, range, values);
  return values;
}

async function getValuesBatch(ranges) {
  const results = {};
  const toFetch = [];
  const toFetchKeys = [];

  for (const { sheet, range } of ranges) {
    const cached = getCached(sheet, range);
    if (cached !== null) {
      results[`${sheet}!${range}`] = cached;
    } else {
      toFetch.push(`${sheet}!${range}`);
      toFetchKeys.push({ sheet, range });
    }
  }

  if (toFetch.length === 0) return results;

  const res = await withRetry(() =>
    sheetsApi.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges: toFetch })
  );

  const valueRanges = res.data.valueRanges || [];
  for (let i = 0; i < valueRanges.length; i++) {
    const vr = valueRanges[i];
    const keyInfo = toFetchKeys[i];
    const key = vr.range || toFetch[i];
    const values = vr.values || [];
    results[key] = values;
    setCached(keyInfo.sheet, keyInfo.range, values);
  }

  return results;
}

async function setValues(sheet, range, values) {
  await withRetry(() =>
    sheetsApi.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${sheet}!${range}`, valueInputOption: 'USER_ENTERED', requestBody: { values } })
  );
  invalidateSheetCache(sheet);
}

async function setValuesBatch(sheet, dataArray) {
  if (!dataArray.length) return;
  await withRetry(() =>
    sheetsApi.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: dataArray.map((d) => ({ range: `${sheet}!${d.range}`, values: d.values })) },
    })
  );
  invalidateSheetCache(sheet);
}

async function appendRows(sheet, values) {
  await withRetry(() =>
    sheetsApi.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `${sheet}!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values } })
  );
  invalidateSheetCache(sheet);
}

async function clearRange(sheet, range = 'A2:Z5000') {
  await withRetry(() =>
    sheetsApi.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `${sheet}!${range}` })
  );
  invalidateSheetCache(sheet);
}
async function ensureSheets() {
  const ss = await sheetsApi.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = ss.data.sheets.map((s) => s.properties.title);
  const missing = Object.values(SHEETS).filter((n) => !existing.includes(n));
  const requests = [];
  const headerWrites = [];
  if (missing.length) {
    missing.forEach((title) => requests.push({ addSheet: { properties: { title } } }));
  }
  if (requests.length) {
    await sheetsApi.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });
  }
  // Ensure header rows exist for all known sheets
  const headerSpecs = [
    { sheet: SHEETS.PROJECTS, range: 'A1:X1', expected: PROJ_HEADERS_NEW },
    { sheet: SHEETS.EMPLOYEES, range: 'A1:S1', expected: EMP_HEADERS },
    { sheet: SHEETS.PROJ_HOURS, range: 'A1:N1', expected: ['Entry#', 'Date', 'EMP ID', 'Employee Name', 'Dept', 'Proj ID', 'Project Name', 'Client', 'Hrs Worked', 'Req Eff Hrs', 'Act Eff Hrs', 'Eff Ratio', 'Remarks', 'Team Lead'] },
    { sheet: SHEETS.EMP_MAP, range: 'A1:K1', expected: MAP_HEADERS },
    { sheet: SHEETS.ATT_STORE, range: 'A1:N1', expected: ATT_STORE_HEADERS },
    { sheet: SHEETS.ATTENDANCE, range: 'A1:N1', expected: ATT_HEADERS },
    { sheet: SHEETS.EFF_LOG, range: 'A1:L1', expected: ['Entry#', 'Date', 'EMP ID', 'Employee Name', 'Dept', 'Proj ID', 'Project Name', 'Hrs Worked', 'Req Eff Hrs', 'Act Eff Hrs', 'Eff Ratio', 'Remarks'] },
    { sheet: SHEETS.QAQC, range: 'A1:K1', expected: QAQC_HEADERS },
    { sheet: SHEETS.FEEDBACK, range: 'A1:L1', expected: FEEDBACK_HEADERS },
    { sheet: SHEETS.INT_FB, range: 'A1:K1', expected: INT_FB_HEADERS },
    { sheet: SHEETS.DIV_TARGETS, range: 'A1:F1', expected: ['Entry#', 'Year', 'Month', 'Team Lead', 'Target Hrs', 'Updated At'] },
    { sheet: SHEETS.HOLIDAYS, range: 'A1:D1', expected: ['Entry#', 'Date', 'Holiday Name', 'Updated At'] },
  ];
  for (const { sheet, range, expected } of headerSpecs) {
    try {
      const existingHeader = await getValues(sheet, range);
      const current = existingHeader[0] || [];
      const matches = expected.every((h, i) => current[i] === h);
      if (!matches) {
        await setValues(sheet, range, [expected]);
      }
    } catch {
      await setValues(sheet, range, [expected]);
    }
  }
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'scan2bim-dev-secret-change-in-production';

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function generateSalt() { return crypto.randomBytes(16).toString('hex'); }
function verifyPassword(password, hash, salt) {
  try { return crypto.timingSafeEqual(Buffer.from(hashPassword(password, salt), 'hex'), Buffer.from(hash, 'hex')); }
  catch { return false; }
}
function createToken(name, email, role) {
  const payload = Buffer.from(JSON.stringify({ name, email, role, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const dot = token.lastIndexOf('.');
  if (dot === -1) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'base64url'), Buffer.from(expected, 'base64url')))
      return res.status(401).json({ error: 'Unauthorized' });
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return res.status(401).json({ error: 'Session expired' });
    req.user = data;
    next();
  } catch { return res.status(401).json({ error: 'Unauthorized' }); }
}

const USERS_HEADERS = ['Name', 'Email', 'Password Hash', 'Salt', 'Role', 'Status', 'Created At', 'Last Login'];

async function seedInitialUser() {
  try {
    const header = await getValues(SHEETS.USERS, 'A1:H1');
    if (!header.length || !header[0][0]) await setValues(SHEETS.USERS, 'A1', [USERS_HEADERS]);
    const data = await getValues(SHEETS.USERS, 'A2:H200');
    if (data.some((r) => r[1] === 'subharam.v@clovetech.com')) return;
    const salt = generateSalt();
    const hash = hashPassword('Yuva8856@', salt);
    await appendRows(SHEETS.USERS, [['Yuva Subharam', 'subharam.v@clovetech.com', hash, salt, 'Admin', 'Active', todayStr(), '']]);
    console.log('Seeded initial admin: subharam.v@clovetech.com');
  } catch (e) { console.warn('User seed warning:', e.message); }
}

async function seedTeamLeadUser() {
  try {
    const data = await getValues(SHEETS.USERS, 'A2:H200');
    if (data.some((r) => r[1] === 'teamlead@clovetech.com')) return;
    const salt = generateSalt();
    const hash = hashPassword('Cl0ve@123', salt);
    await appendRows(SHEETS.USERS, [['Team Lead', 'teamlead@clovetech.com', hash, salt, 'Team Lead', 'Active', todayStr(), '']]);
    console.log('Seeded team lead: teamlead@clovetech.com');
  } catch (e) { console.warn('Team lead seed warning:', e.message); }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

function calcExpMonths(joinDateStr) {
  if (!joinDateStr) return null;
  const join = new Date(joinDateStr);
  if (isNaN(join.getTime())) return null;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth()));
}
function expToYymm(months) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${String(y).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function getMatrixForExp(months, prodMatrix) {
  const DEFAULT = [
    { label: '>2 years', max: 8 },
    { label: '1.5 - 2 years', max: 6 },
    { label: '1 - 1.5 years', max: 5 },
    { label: '0.5 - 1 years', max: 4.5 },
    { label: '0 - 0.5 years', max: 2 },
  ];
  const matrix = prodMatrix && prodMatrix.length ? prodMatrix : DEFAULT;
  const decYrs = months / 12;
  for (const x of matrix) {
    const label = x.label || '';
    const gM = label.match(/^>\s*([\d.]+)/);
    const dM = label.match(/^([\d.]+)\s*-\s*([\d.]+)/);
    if (gM) { if (decYrs > parseFloat(gM[1])) return x; }
    else if (dM) { const lo = parseFloat(dM[1]), hi = parseFloat(dM[2]); if (decYrs >= lo && decYrs <= hi) return x; }
  }
  return null;
}

function expToJoinDate(years, months) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - (years * 12 + months), now.getDate());
  return d.toISOString().slice(0, 10);
}

function calcHours(login, logout) {
  if (!login || !logout) return 0;
  const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let diff = toMins(logout) - toMins(login);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

function toRows(headers, objects) {
  return objects.map((o) => headers.map((h) => o[h] ?? ''));
}

// ── Write-back cooldowns ──────────────────────────────────────────────────────
const PROJ_WRITEBACK_COOLDOWN_MS = 5 * 60 * 1000;
let _lastProjWriteBack = 0;

// ── Settings cache ────────────────────────────────────────────────────────────
let _settCache = null;
let _settCacheAt = 0;

const DEFAULT_SETTINGS_ROWS = [
  ['Category', 'Key', 'Value', 'Description'],
  ['SHIFT', 'Morning', '08:00-16:00', 'Morning shift'],
  ['SHIFT', 'Afternoon', '16:00-00:00', 'Afternoon shift'],
  ['SHIFT', 'Night', '00:00-08:00', 'Night shift'],
  ['SHIFT', 'General', '09:00-18:00', 'General / Flexible'],
  ['WEEKOFF', 'Sunday', 'SUN', 'Sunday only'],
  ['WEEKOFF', 'Saturday-Sunday', 'SAT-SUN', 'Saturday & Sunday'],
  ['WEEKOFF', 'Monday', 'MON', 'Monday only'],
  ['DEPT', 'BIM', '', 'Building Information Modelling'],
  ['DEPT', 'HSB', '', 'HSB Department'],
  ['DEPT', 'ARCH', '', 'Architecture'],
  ['DEPT', 'MEP', '', 'Mechanical Electrical Plumbing'],
  ['DEPT', 'Management', '', 'Management'],
  ['DEPT', 'Admin', '', 'Administration'],
  ['DESIGNATION', 'Engineer', '', ''],
  ['DESIGNATION', 'Senior Engineer', '', ''],
  ['DESIGNATION', 'Lead Engineer', '', ''],
  ['DESIGNATION', 'Manager', '', ''],
  ['DESIGNATION', 'Project Manager', '', ''],
  ['DESIGNATION', 'Director', '', ''],
  ['DESIGNATION', 'Intern', '', ''],
  ['ROLE', 'Lead', '', ''],
  ['ROLE', 'Engineer', '', ''],
  ['ROLE', 'Senior Engineer', '', ''],
  ['ROLE', 'Checker', '', ''],
  ['ROLE', 'Coordinator', '', ''],
  ['ROLE', 'Support', '', ''],
  ['ROLE', 'Trainee', '', ''],
  ['EMP_STATUS', 'Active', '', 'Currently employed'],
  ['EMP_STATUS', 'Inactive', '', 'On extended leave'],
  ['EMP_STATUS', 'Resigned', '', 'Left the organisation'],
  ['EMP_STATUS', 'Probation', '', 'Probation period'],
  ['PROJ_STATUS', 'In Progress', '', 'Actively being worked on'],
  ['PROJ_STATUS', 'Completed', '', 'Fully delivered'],
  ['PROJ_STATUS', 'On Hold', '', 'Paused'],
  ['PROJ_STATUS', 'Not Started', '', 'Awaiting kick-off'],
  ['PROJ_STATUS', 'Cancelled', '', 'Dropped'],
  ['ATT', 'P', 'Present', ''],
  ['ATT', 'A', 'Absent', ''],
  ['ATT', 'L', 'Leave', ''],
  ['ATT', 'WFH', 'Work From Home', ''],
  ['ATT', 'OD', 'On Duty (Outstation)', ''],
  ['ATT', 'HD', 'Half Day', ''],
  ['ATT', 'H', 'Holiday', ''],
  ['MAP_STATUS', 'Active', '', ''],
  ['MAP_STATUS', 'Completed', '', ''],
  ['MAP_STATUS', 'Removed', '', ''],
  ['PROD_MATRIX', '>2 years', '6.5 to 8', 'Max: 8'],
  ['PROD_MATRIX', '1.5 - 2 years', '4.5 to 6', 'Max: 6'],
  ['PROD_MATRIX', '1 - 1.5 years', '4 to 5', 'Max: 5'],
  ['PROD_MATRIX', '0.5 - 1 years', '3.5 to 4.5', 'Max: 4.5'],
  ['PROD_MATRIX', '0 - 0.5 years', '1 to 2', 'Max: 2'],
];

async function fetchSettings() {
  if (_settCache && Date.now() - _settCacheAt < 5 * 60 * 1000) return _settCache;
  const rows = await getValues(SHEETS.SETTINGS, 'A2:D500');
  if (!rows.length) {
    await setValues(SHEETS.SETTINGS, 'A1', DEFAULT_SETTINGS_ROWS);
    _settCache = parseSettingsRows(DEFAULT_SETTINGS_ROWS.slice(1));
  } else {
    _settCache = parseSettingsRows(rows);
  }
  _settCacheAt = Date.now();
  return _settCache;
}

function parseSettingsRows(rows) {
  const s = { shifts: [], weekoffs: [], depts: [], designations: [], roles: [], empStatuses: [], projStatuses: [], attStatuses: [], mapStatuses: [], prodMatrix: [], alignments: {} };
  rows.forEach(([cat, key, val, desc]) => {
    if (!cat || !key) return;
    switch (cat) {
      case 'SHIFT': s.shifts.push({ name: key, hours: val || '', desc: desc || '' }); break;
      case 'WEEKOFF': s.weekoffs.push({ name: key, code: val || '', desc: desc || '' }); break;
      case 'DEPT': s.depts.push(key); break;
      case 'DESIGNATION': s.designations.push(key); break;
      case 'ROLE': s.roles.push(key); break;
      case 'EMP_STATUS': s.empStatuses.push(key); break;
      case 'PROJ_STATUS': s.projStatuses.push(key); break;
      case 'ATT': s.attStatuses.push({ code: key, label: val || key, desc: desc || '' }); break;
      case 'MAP_STATUS': s.mapStatuses.push(key); break;
      case 'PROD_MATRIX': s.prodMatrix.push({ label: key, range: val || '', max: parseFloat(desc?.replace('Max:','')?.trim()) || 0 }); break;
      case 'ALIGN': s.alignments[key] = val ? val.split(',') : []; break;
    }
  });
  return s;
}

// ── Lazy init (serverless-safe) ───────────────────────────────────────────────
let _initPromise = null;
app.use((req, res, next) => {
  if (!_initPromise) {
    _initPromise = ensureSheets()
      .then(() => seedInitialUser())
      .then(() => seedTeamLeadUser())
      .then(() => scheduleBackup())
      .then(() => scheduleExpSync())
      .catch((e) => console.warn('Init warning:', e.message));
  }
  _initPromise.then(() => next()).catch(() => next());
});

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const rows = await getValues(SHEETS.USERS, 'A2:H200');
    const idx = rows.findIndex((r) => (r[1] || '').toLowerCase() === email.toLowerCase());
    if (idx < 0) return res.status(401).json({ error: 'Invalid email or password' });
    const r = rows[idx];
    if (r[5] !== 'Active') return res.status(403).json({ error: r[5] === 'Pending' ? 'Account pending approval' : 'Account is disabled' });
    if (!verifyPassword(password, r[2], r[3])) return res.status(401).json({ error: 'Invalid email or password' });
    const token = createToken(r[0], r[1], r[4]);
    sheetsApi.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${SHEETS.USERS}!H${idx + 2}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[todayStr()]] } }).catch(() => {});
    res.json({ token, name: r[0], email: r[1], role: r[4] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/verify', requireAuth, (req, res) => {
  res.json({ name: req.user.name, email: req.user.email, role: req.user.role });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

// ── USERS ─────────────────────────────────────────────────────────────────────
app.get('/api/users', requireAuth, async (req, res) => {
  try {
    const rows = await getValues(SHEETS.USERS, 'A2:H200');
    res.json(rows.filter((r) => r[0]).map((r, i) => ({
      row: i + 2, name: r[0], email: r[1], role: r[4] || 'User', status: r[5] || 'Pending', createdAt: r[6] || '', lastLogin: r[7] || '',
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', requireAuth, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
    const existing = await getValues(SHEETS.USERS, 'A2:B200');
    if (existing.some((r) => (r[1] || '').toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: 'Email already registered' });
    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    await appendRows(SHEETS.USERS, [[name, email, hash, salt, role || 'User', 'Active', todayStr(), '']]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:row', requireAuth, async (req, res) => {
  try {
    const rowNum = parseInt(req.params.row);
    if (isNaN(rowNum)) return res.status(400).json({ error: 'Invalid row number' });
    const existing = await getValues(SHEETS.USERS, `A${rowNum}:H${rowNum}`);
    if (!existing.length) return res.status(404).json({ error: 'User not found' });
    const r = [...existing[0]]; while (r.length < 8) r.push('');
    const { name, role, status } = req.body;
    if (name) r[0] = name;
    if (role) r[4] = role;
    if (status) r[5] = status;
    await setValues(SHEETS.USERS, `A${rowNum}:H${rowNum}`, [r]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:row/password', requireAuth, async (req, res) => {
  try {
    const rowNum = parseInt(req.params.row);
    if (isNaN(rowNum)) return res.status(400).json({ error: 'Invalid row number' });
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    await setValues(SHEETS.USERS, `C${rowNum}:D${rowNum}`, [[hash, salt]]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SETTINGS ──────────────────────────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
  try { res.json(await fetchSettings()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings', async (req, res) => {
  try {
    _settCache = null;
    const { rows } = req.body; // raw [Category, Key, Value, Description] rows
    const full = [['Category', 'Key', 'Value', 'Description'], ...rows];
    await clearRange(SHEETS.SETTINGS, 'A1:D500');
    await setValues(SHEETS.SETTINGS, 'A1', full);
    _settCache = null;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EMPLOYEES ─────────────────────────────────────────────────────────────────
// Headers (19 cols): EMP ID|Full Name|…|Rot Off Enabled|Experience
const EMP_HEADERS = ['EMP ID', 'Full Name', 'Short Name', 'Team Lead', 'Department', 'Designation', 'Status', 'Req Eff Ratio', 'Work Hours/Day', 'Phone', 'Email', 'Join Date', 'Remarks', 'Shift', 'Week Off', 'Rot Off Day 1', 'Rot Off Day 2', 'Rot Off Enabled', 'Experience'];

app.get('/api/employees', async (req, res) => {
  try {
    const rows = await getValues(SHEETS.EMPLOYEES, 'A1:S300');
    if (!rows.length) return res.json({ headers: EMP_HEADERS, data: [] });
    const [, ...data] = rows;
    const result = { headers: EMP_HEADERS, data: [], rowIndices: [] };
    data.forEach((r, i) => {
      if (!r[0] && !r[1]) return;
      while (r.length < 19) r.push('');
      const rawId = (r[0] || '').trim();
      if (!rawId || rawId.toLowerCase() === 'trainee') {
        r[0] = `T${String(i + 1).padStart(3, '0')}`;
      }
      result.data.push(r);
      result.rowIndices.push(i + 2);
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/employees/active', async (req, res) => {
  try {
    const rows = await getValues(SHEETS.EMPLOYEES, 'A1:S300');
    if (!rows.length) return res.json([]);
    const [, ...data] = rows;
    const active = [];
    data.forEach((r, i) => {
      const name = (r[1] || '').trim();
      const status = (r[6] || '').trim();
      if ((r[0] || name) && status === 'Active') {
        const row = [...r];
        while (row.length < 19) row.push('');
        const rawId = (row[0] || '').trim();
        if (!rawId || rawId.toLowerCase() === 'trainee') {
          row[0] = `T${String(i + 1).padStart(3, '0')}`;
        }
        active.push(row);
      }
    });
    res.json(active);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees', async (req, res) => {
  try { await appendRows(SHEETS.EMPLOYEES, [req.body]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/employees/:row', async (req, res) => {
  try { await setValues(SHEETS.EMPLOYEES, `A${req.params.row}:S${req.params.row}`, [req.body]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees/import', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows || !rows.length) return res.status(400).json({ error: 'No rows provided' });
    const padded = rows.map((r) => {
      const row = [...r];
      while (row.length < 19) row.push('');
      return row;
    });
    await appendRows(SHEETS.EMPLOYEES, padded);
    res.json({ success: true, count: padded.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees/sync-experience', requireAuth, async (req, res) => {
  try {
    const result = await syncEmployeeExperience();
    lastExpSyncMonth = `${new Date().getFullYear()}-${new Date().getMonth()}`;
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees/backfill-req-eff', requireAuth, async (req, res) => {
  try {
    const sett = await fetchSettings();
    const rows = await getValues(SHEETS.EMPLOYEES, 'A2:S300');
    if (!rows.length) return res.json({ success: true, updated: 0 });
    const updates = [];
    rows.forEach((row, i) => {
      const joinDate = (row[11] || '').trim();
      const expStr = (row[18] || '').trim();
      let months = null;
      let newJoinDate = joinDate;
      // If join date exists, calculate experience from it
      if (joinDate) {
        months = calcExpMonths(joinDate);
      }
      // If no join date but experience exists, calculate months from exp and derive join date
      if (months === null && expStr) {
        const parts = expStr.split(':');
        if (parts.length === 2) {
          const y = parseInt(parts[0]), m = parseInt(parts[1]);
          if (!isNaN(y) && !isNaN(m)) {
            months = y * 12 + m;
            newJoinDate = expToJoinDate(y, m);
          }
        }
      }
      if (months === null) return;
      const newExp = expToYymm(months);
      const entry = getMatrixForExp(months, sett.prodMatrix);
      const newRatio = entry && entry.max > 0 ? parseFloat((entry.max / 0.08).toFixed(1)) : null;
      const oldExp = row[18] || '';
      const oldRatio = parseFloat(row[7] || 0);
      const expChanged = oldExp !== newExp;
      const ratioChanged = newRatio !== null && Math.abs(oldRatio - newRatio) > 0.05;
      const joinDateChanged = newJoinDate !== joinDate;
      if (expChanged || ratioChanged || joinDateChanged) {
        const newRow = [...row];
        while (newRow.length < 19) newRow.push('');
        newRow[18] = newExp;
        if (newRatio !== null) newRow[7] = String(newRatio);
        if (joinDateChanged) newRow[11] = newJoinDate;
        updates.push({ sheetRow: i + 2, values: newRow });
      }
    });
    if (updates.length) {
      const batchUpdates = updates.map(({ sheetRow, values }) => ({
        range: `A${sheetRow}:S${sheetRow}`,
        values: [values],
      }));
      await setValuesBatch(SHEETS.EMPLOYEES, batchUpdates);
    }
    res.json({ success: true, updated: updates.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PROJECTS ──────────────────────────────────────────────────────────────────
// Headers (24 cols, A–X): basic(A-L) | computed(M-O) | feedback/qaqc(P-U) | assigned(V-X)
const PROJ_HEADERS_NEW = [
  'Proj ID', 'Project Name', 'Client', 'Status', 'Team Lead',
  'Start (Day#)', 'End (Day#)', 'Client Hrs', 'Total Spent Hrs',
  'Req Eff Hrs', 'Act Eff Hrs', 'Remarks', 'Remaining Hrs',
  'Proj Efficiency', 'Proj Actual Eff',
  'Internal Feedback', 'Internal FB Count', 'Internal FB Hrs',
  'Client Feedback', 'Client FB Hrs', 'QA/QC',
  'QA/QC Assigned Person', 'FB Internal Assigned Person', 'FB Client Assigned Person',
];

// QAQC_PROJECTS sheet headers (11 cols)
// Efficiency: Actual = (ClientHrs/TotalSpent)/10 | Exp = (ClientHrs/ReqEff)/10
const QAQC_HEADERS = [
  'Proj ID', 'Project Name', 'Status', 'Client',
  'Hrs From Client', 'Total Spent Time', 'Req Eff Time', 'Act Eff Time',
  'Project Actual Efficiency', 'Project Efficiency (Exp)', 'Leading Person',
];

// FEEDBACK_PROJECTS sheet headers (12 cols)
// Efficiency: Actual = (TotalSpent/ClientHrs)*100 | Exp = (ReqEff/ClientHrs)*100
const FEEDBACK_HEADERS = [
  'Proj ID', 'Project Name', 'Status', 'Client',
  'Hrs From Client', 'Total Spent Time', 'Req Eff Time', 'Act Eff Time',
  'Client Feedback Hrs', 'Project Actual Efficiency', 'Project Efficiency (Exp)', 'Leading Person',
];

// INT_FEEDBACK_PROJECTS sheet headers (11 cols — no "Client Feedback Hrs" column)
const INT_FB_HEADERS = [
  'Proj ID', 'Project Name', 'Status', 'Client',
  'Hrs From Client', 'Total Spent Time', 'Req Eff Time', 'Act Eff Time',
  'Project Actual Efficiency', 'Project Efficiency (Exp)', 'Leading Person',
];

async function computeProjectHours() {
  const rows = await getValues(SHEETS.PROJ_HOURS, 'A2:N2000');
  const map = {};
  rows.filter((r) => r[5] && r[8]).forEach((r) => {
    const pid = r[5];
    if (!map[pid]) map[pid] = { spent: 0, reqEff: 0, actEff: 0, firstDate: null, lastDate: null };
    map[pid].spent  += parseFloat(r[8]) || 0;
    map[pid].reqEff += parseFloat(r[9]) || 0;
    map[pid].actEff += parseFloat(r[10]) || 0;
    const d = r[1];
    if (d) {
      if (!map[pid].firstDate || d < map[pid].firstDate) map[pid].firstDate = d;
      if (!map[pid].lastDate  || d > map[pid].lastDate)  map[pid].lastDate  = d;
    }
  });
  return { map, rows };
}

// Helper: derive derived project name(s) from a project row (24 cols)
function deriveProjectNames(proj) {
  const baseId = proj[0] || '';
  const baseName = proj[1] || baseId;
  const names = [];
  if (proj[20] === 'Yes')     names.push({ key: `${baseId}-QC`, label: `${baseName}-QC` });
  if (proj[15] === 'Yes')     names.push({ key: `${baseId}-FB-Int`, label: `${baseName}-FB-Int` });
  if (proj[18] === 'Yes')     names.push({ key: `${baseId}-FB-Client`, label: `${baseName}-FB-Client` });
  return names;
}

// Helper: detect if a proj ID is a derived project (ending in -QC, -FB-Int, -FB-Client)
function isDerivedProjId(pid) {
  return /-(QC|FB-Int|FB-Client)$/.test(pid);
}
// Helper: get base project ID from a derived ID (e.g., "P001-QC" → "P001")
function baseFromDerived(pid) {
  return pid.replace(/-(QC|FB-Int|FB-Client)$/, '');
}
// Helper: get the type suffix from a derived ID
function typeFromDerived(pid) {
  const m = pid.match(/-(QC|FB-Int|FB-Client)$/);
  return m ? m[1] : null;
}

// Helper: sync the summary sheet corresponding to a derived project ID
function syncDerivedSheet(projId) {
  if (!projId) return;
  if (projId.endsWith('-QC')) syncQaqcSheet().catch(() => {});
  else if (projId.endsWith('-FB-Int')) syncInternalFeedbackSheet().catch(() => {});
  else if (projId.endsWith('-FB-Client')) syncFeedbackSheet().catch(() => {});
}

// ── QAQC / Feedback summary sheet sync helpers ────────────────────────────
// Re-reads PROJ_HOURS + EMPLOYEES, computes per-project aggregates with
// per-employee req eff ratio, and writes to the dedicated summary sheet.
async function syncQaqcSheet() {
  try {
    const [projRows, phRows, empRows] = await Promise.all([
      getValues(SHEETS.PROJECTS, 'A2:X300'),
      getValues(SHEETS.PROJ_HOURS, 'A2:N2000'),
      getValues(SHEETS.EMPLOYEES, 'A2:S300'),
    ]);
    const empRatioMap = {};
    const empNameMap = {};
    empRows.forEach((r) => { if (r[0]) { empRatioMap[r[0]] = parseEffRatio(r[7]) || 0.75; } });
    const qaqcRows = [];
    projRows.forEach((r) => {
      if (!r[0] || r[20] !== 'Yes') return;
      while (r.length < 24) r.push('');
      const derivedId = `${r[0]}-QC`;
      const clientHrs = parseFloat(r[7]) || 0;
      let totalSpent = 0, totalReqEff = 0, totalActEff = 0;
      phRows.filter((ph) => ph[5] === derivedId && ph[2]).forEach((ph) => {
        const h = parseFloat(ph[8]) || 0;
        const eId = ph[2];
        totalSpent += h;
        totalReqEff += h * (empRatioMap[eId] || 0.75);
        totalActEff += parseFloat(ph[10]) || 0;
      });
      const actualEff = totalSpent > 0 ? +(((clientHrs / (totalSpent / 60)) / 10).toFixed(2)) : '';
      const expEff = totalReqEff > 0 ? +(((clientHrs / (totalReqEff / 60)) / 10).toFixed(2)) : '';
      const leadingPerson = r[21] || r[4] || '';
      qaqcRows.push([r[0], r[1], r[3], r[2], clientHrs || '', +(totalSpent).toFixed(2), +(totalReqEff).toFixed(2), +(totalActEff).toFixed(2), actualEff, expEff, leadingPerson]);
    });
    await clearRange(SHEETS.QAQC, 'A1:K500');
    await setValues(SHEETS.QAQC, 'A1', [QAQC_HEADERS, ...qaqcRows]);
  } catch (e) { console.error('syncQaqcSheet error:', e.message); }
}

async function syncFeedbackSheet() {
  try {
    const [projRows, phRows, empRows] = await Promise.all([
      getValues(SHEETS.PROJECTS, 'A2:X300'),
      getValues(SHEETS.PROJ_HOURS, 'A2:N2000'),
      getValues(SHEETS.EMPLOYEES, 'A2:S300'),
    ]);
    const empRatioMap = {};
    empRows.forEach((r) => { if (r[0]) { empRatioMap[r[0]] = parseEffRatio(r[7]) || 0.75; } });
    const fbRows = [];
    projRows.forEach((r) => {
      if (!r[0] || r[18] !== 'Yes') return;
      while (r.length < 24) r.push('');
      const derivedId = `${r[0]}-FB-Client`;
      const clientHrs = parseFloat(r[7]) || 0;
      let totalSpent = 0, totalReqEff = 0, totalActEff = 0;
      phRows.filter((ph) => ph[5] === derivedId && ph[2]).forEach((ph) => {
        const h = parseFloat(ph[8]) || 0;
        const eId = ph[2];
        totalSpent += h;
        totalReqEff += h * (empRatioMap[eId] || 0.75);
        totalActEff += parseFloat(ph[10]) || 0;
      });
      const clientFbHrs = parseFloat(r[19]) || 0;
      const actualEff = clientHrs > 0 ? +((totalSpent / 60 / clientHrs).toFixed(2)) : '';
      const expEff = clientHrs > 0 ? +((totalReqEff / 60 / clientHrs).toFixed(2)) : '';
      const leadingPerson = r[23] || r[4] || '';
      fbRows.push([r[0], r[1], r[3], r[2], clientHrs || '', +(totalSpent).toFixed(2), +(totalReqEff).toFixed(2), +(totalActEff).toFixed(2), clientFbHrs || '', actualEff, expEff, leadingPerson]);
    });
    await clearRange(SHEETS.FEEDBACK, 'A1:L500');
    await setValues(SHEETS.FEEDBACK, 'A1', [FEEDBACK_HEADERS, ...fbRows]);
  } catch (e) { console.error('syncFeedbackSheet error:', e.message); }
}

async function syncInternalFeedbackSheet() {
  try {
    const [projRows, phRows, empRows] = await Promise.all([
      getValues(SHEETS.PROJECTS, 'A2:X300'),
      getValues(SHEETS.PROJ_HOURS, 'A2:N2000'),
      getValues(SHEETS.EMPLOYEES, 'A2:S300'),
    ]);
    const empRatioMap = {};
    empRows.forEach((r) => { if (r[0]) { empRatioMap[r[0]] = parseEffRatio(r[7]) || 0.75; } });
    const intFbRows = [];
    projRows.forEach((r) => {
      if (!r[0] || r[15] !== 'Yes') return;
      while (r.length < 24) r.push('');
      const derivedId = `${r[0]}-FB-Int`;
      const clientHrs = parseFloat(r[7]) || 0;
      let totalSpent = 0, totalReqEff = 0, totalActEff = 0;
      phRows.filter((ph) => ph[5] === derivedId && ph[2]).forEach((ph) => {
        const h = parseFloat(ph[8]) || 0;
        const eId = ph[2];
        totalSpent += h;
        totalReqEff += h * (empRatioMap[eId] || 0.75);
        totalActEff += parseFloat(ph[10]) || 0;
      });
      const actualEff = totalSpent > 0 ? +(((clientHrs / (totalSpent / 60)) / 10).toFixed(2)) : '';
      const expEff = totalReqEff > 0 ? +(((clientHrs / (totalReqEff / 60)) / 10).toFixed(2)) : '';
      const leadingPerson = r[22] || r[4] || '';
      intFbRows.push([r[0], r[1], r[3], r[2], clientHrs || '', +(totalSpent).toFixed(2), +(totalReqEff).toFixed(2), +(totalActEff).toFixed(2), actualEff, expEff, leadingPerson]);
    });
    await clearRange(SHEETS.INT_FB, 'A1:K500');
    await setValues(SHEETS.INT_FB, 'A1', [INT_FB_HEADERS, ...intFbRows]);
  } catch (e) { console.error('syncInternalFeedbackSheet error:', e.message); }
}

app.get('/api/projects', async (req, res) => {
  try {
    const [projRows, { map: hoursMap }] = await Promise.all([getValues(SHEETS.PROJECTS, 'A1:X300'), computeProjectHours()]);
    if (!projRows.length) return res.json({ headers: PROJ_HEADERS_NEW, data: [] });
    const [gsHeader, ...data] = projRows;
    // Detect old 14-col layout: col 11 was Proj Eff Ratio (not Remarks)
    const oldStructure = /eff.*ratio|proj.*eff/i.test(gsHeader[11] || '');
    const result = { headers: PROJ_HEADERS_NEW, data: [], rowIndices: [] };
    const writeBack = [];
    data.forEach((r, i) => {
      if (!r[0]) return;
      const clientHrs  = parseFloat(r[7]) || 0;
      // Include hours from derived projects (attendance logged against -QC, -FB-Int, -FB-Client)
      const ph    = hoursMap[r[0]]              || { spent: 0, reqEff: 0, actEff: 0 };
      const qcH   = hoursMap[`${r[0]}-QC`]      || { spent: 0, reqEff: 0, actEff: 0 };
      const fbIH  = hoursMap[`${r[0]}-FB-Int`]  || { spent: 0, reqEff: 0, actEff: 0 };
      const fbCH  = hoursMap[`${r[0]}-FB-Client`] || { spent: 0, reqEff: 0, actEff: 0 };
      const spentHrs   = ph.spent + qcH.spent + fbIH.spent + fbCH.spent;
      const reqEffHrs  = ph.reqEff + qcH.reqEff + fbIH.reqEff + fbCH.reqEff;
      const actEffHrs  = ph.actEff + qcH.actEff + fbIH.actEff + fbCH.actEff;
      const remarks      = oldStructure ? (r[12] || '') : (r[11] || '');
      const remainingHrs = clientHrs > 0 ? +(clientHrs - spentHrs / 60).toFixed(2) : '';
      const projEff      = reqEffHrs > 0 ? +(clientHrs / (reqEffHrs / 60)).toFixed(4) : '';
      const projActEff   = spentHrs  > 0 ? +(clientHrs / (spentHrs / 60)).toFixed(4)  : '';
      const row = [...r.slice(0, 11)];
      while (row.length < 11) row.push('');
      row[8]  = spentHrs.toFixed(2);
      row[9]  = reqEffHrs.toFixed(2);
      row[10] = actEffHrs.toFixed(2);
      row[11] = remarks;
      row[12] = remainingHrs;
      row[13] = projEff;
      row[14] = projActEff;
      // Preserve feedback/qaqc cols P–U (indices 15–20)
      for (let ci = 15; ci <= 20; ci++) row[ci] = r[ci] || '';
      // Preserve assigned persons cols V–X (indices 21–23)
      row[21] = r[21] || '';
      row[22] = r[22] || '';
      row[23] = r[23] || '';
      if (ph?.firstDate) row[5] = parseInt(ph.firstDate.split('-')[2], 10);
      if (ph?.lastDate)  row[6] = parseInt(ph.lastDate.split('-')[2],  10);
      result.data.push(row);
      result.rowIndices.push(i + 2);
      const n = i + 2;
      writeBack.push(
        { range: `${SHEETS.PROJECTS}!F${n}`,  values: [[row[5]]] },
        { range: `${SHEETS.PROJECTS}!G${n}`,  values: [[row[6]]] },
        { range: `${SHEETS.PROJECTS}!I${n}`,  values: [[row[8]]] },
        { range: `${SHEETS.PROJECTS}!J${n}`,  values: [[row[9]]] },
        { range: `${SHEETS.PROJECTS}!K${n}`,  values: [[row[10]]] },
        { range: `${SHEETS.PROJECTS}!L${n}`,  values: [[remarks]] },
        { range: `${SHEETS.PROJECTS}!M${n}`,  values: [[remainingHrs]] },
        { range: `${SHEETS.PROJECTS}!N${n}`,  values: [[projEff]] },
        { range: `${SHEETS.PROJECTS}!O${n}`,  values: [[projActEff]] },
      );
    });
    res.json(result);
    const now = Date.now();
    const shouldWriteBack = oldStructure || (now - _lastProjWriteBack > PROJ_WRITEBACK_COOLDOWN_MS);
    if (!shouldWriteBack) return;

    _lastProjWriteBack = now;

    // Write back computed columns + migrate header if old structure (non-blocking, rate-limited)
    const headerUpdate = oldStructure
      ? withRetry(() => sheetsApi.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `${SHEETS.PROJECTS}!A1:X1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [PROJ_HEADERS_NEW] } })).catch(() => {})
      : Promise.resolve();
    if (writeBack.length) {
      headerUpdate.then(() =>
        setValuesBatch(SHEETS.PROJECTS, writeBack).catch(() => {})
      );
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/projects/inprogress', async (req, res) => {
  try {
    const rows = await getValues(SHEETS.PROJECTS, 'A2:X300');
    const live = rows.filter((r) => r[0] && r[3] === 'In Progress').map((r) => { while (r.length < 24) r.push(''); return r; });
    // Also include derived projects (virtual entries) with assigned person info
    const derived = [];
    live.forEach((r) => {
      const dNames = deriveProjectNames(r);
      dNames.forEach((d) => {
        // Map the type suffix to the assigned person column
        // -QC  → r[21] (QA/QC Assigned Person)
        // -FB-Int → r[22] (FB Internal Assigned Person)
        // -FB-Client → r[23] (FB Client Assigned Person)
        const typeMap = { 'QC': 21, 'FB-Int': 22, 'FB-Client': 23 };
        const suffix = d.key.split('-').slice(1).join('-'); // e.g. "QC", "FB-Int", "FB-Client"
        const personCol = typeMap[suffix] !== undefined ? parseInt(r[typeMap[suffix]]) || 0 : 0;
        const assignedPerson = typeMap[suffix] !== undefined ? (r[typeMap[suffix]] || '') : '';
        // Use assigned person as team lead for this derived entry so attendance dropdown shows project
        derived.push([d.key, d.label, r[2] || '', 'In Progress', assignedPerson || r[4] || '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', assignedPerson || '', '', '']);
      });
    });
    res.json([...live, ...derived]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET projects flagged for QA/QC (col U = 'Yes'), includes assigned person (col V)
// Returns teamMembersMap: { projId: [{empId, empName, hrs, empReqEff}] } with per-employee req eff
app.get('/api/projects/qaqc', async (req, res) => {
  try {
    const [projRows, { map: hoursMap, rows: phRows }, empRows] = await Promise.all([
      getValues(SHEETS.PROJECTS, 'A2:X300'),
      computeProjectHours(),
      getValues(SHEETS.EMPLOYEES, 'A2:S300'),
    ]);
    // Build employee req eff ratio map <col 7>
    const empRatioMap = {};
    const empNameMap = {};
    empRows.forEach((r) => { if (r[0]) { empRatioMap[r[0]] = parseEffRatio(r[7]) || 0.75; empNameMap[r[0]] = r[1] || r[0]; } });

    const teamMembersMap = {};
    const logEntries = {};  // per-session entries keyed by derivedId
    const data = [];
    const rowIndices = [];
    projRows.forEach((r, i) => {
      if (!r[0] || r[20] !== 'Yes') return;
      while (r.length < 24) r.push('');
      const qcH   = hoursMap[`${r[0]}-QC`]      || { spent: 0, reqEff: 0, actEff: 0 };
      const clientHrs = parseFloat(r[7]) || 0;
      const spentHrs  = qcH.spent;  // ONLY derived QC hours
      const actEffHrs = qcH.actEff;

      // Compute per-employee breakdown from PROJ_HOURS matching derived QC project ID
      const derivedId = `${r[0]}-QC`;
      const tmAcc = {};
      const entries = [];
      phRows.filter((ph) => ph[5] === derivedId && ph[2]).forEach((ph) => {
        const eId = ph[2];
        const h = parseFloat(ph[8]) || 0;
        if (!tmAcc[eId]) tmAcc[eId] = { empId: eId, empName: empNameMap[eId] || ph[3] || eId, hrs: 0, empReqEff: 0 };
        tmAcc[eId].hrs += h;
        tmAcc[eId].empReqEff += h * (empRatioMap[eId] || 0.75);
        // Per-session entry
        entries.push({
          date: ph[1] || '',
          empId: eId,
          empName: empNameMap[eId] || ph[3] || eId,
          hrsWorked: +h.toFixed(2),
          reqEffHrs: +(h * (empRatioMap[eId] || 0.75)).toFixed(2),
          actEffHrs: parseFloat(ph[10]) || 0,
          teamLead: ph[13] || r[21] || r[4] || '',
        });
      });
      const teamMembers = Object.values(tmAcc).map((t) => ({ ...t, hrs: +t.hrs.toFixed(2), empReqEff: +t.empReqEff.toFixed(2) })).sort((a, b) => b.hrs - a.hrs);
      teamMembersMap[derivedId] = teamMembers;
      logEntries[derivedId] = entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      // Compute project-level req eff from per-employee breakdown (hrs × each emp's req eff ratio)
      const reqEffHrs = Object.values(tmAcc).reduce((s, t) => s + t.empReqEff, 0);

      const out = [...r];
      out[8]  = spentHrs.toFixed(2);
      out[9]  = reqEffHrs.toFixed(2);
      out[10] = actEffHrs.toFixed(2);
      out[12] = clientHrs > 0 ? +(clientHrs - spentHrs / 60).toFixed(2) : '';
      data.push(out);
      rowIndices.push(i + 2);  // spreadsheet row = array index + 2 (A2 is first data row)
    });
    res.json({ data, rowIndices, teamMembersMap, logEntries });
    syncQaqcSheet().catch(() => {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET projects flagged for Internal Feedback (col P = 'Yes'), uses derived FB-Int hours
app.get('/api/projects/internal-feedback', async (req, res) => {
  try {
    const [projRows, { map: hoursMap, rows: phRows }, empRows] = await Promise.all([
      getValues(SHEETS.PROJECTS, 'A2:X300'),
      computeProjectHours(),
      getValues(SHEETS.EMPLOYEES, 'A2:S300'),
    ]);
    // Build employee req eff ratio map
    const empRatioMap = {};
    const empNameMap = {};
    empRows.forEach((r) => { if (r[0]) { empRatioMap[r[0]] = parseEffRatio(r[7]) || 0.75; empNameMap[r[0]] = r[1] || r[0]; } });

    const teamMembersMap = {};
    const logEntries = {};  // per-session entries keyed by derivedId
    const data = [];
    const rowIndices = [];
    projRows.forEach((r, i) => {
      if (!r[0] || r[15] !== 'Yes') return;
      while (r.length < 24) r.push('');
      const fbIH  = hoursMap[`${r[0]}-FB-Int`]       || { spent: 0, reqEff: 0, actEff: 0 };
      const clientHrs = parseFloat(r[7]) || 0;
      const spentHrs  = fbIH.spent;  // ONLY derived FB-Int hours
      const actEffHrs = fbIH.actEff;

      // Compute per-employee breakdown
      const derivedId = `${r[0]}-FB-Int`;
      const tmAcc = {};
      const entries = [];
      phRows.filter((ph) => ph[5] === derivedId && ph[2]).forEach((ph) => {
        const eId = ph[2];
        const h = parseFloat(ph[8]) || 0;
        if (!tmAcc[eId]) tmAcc[eId] = { empId: eId, empName: empNameMap[eId] || ph[3] || eId, hrs: 0, empReqEff: 0 };
        tmAcc[eId].hrs += h;
        tmAcc[eId].empReqEff += h * (empRatioMap[eId] || 0.75);
        // Per-session entry
        entries.push({
          date: ph[1] || '',
          empId: eId,
          empName: empNameMap[eId] || ph[3] || eId,
          hrsWorked: +h.toFixed(2),
          reqEffHrs: +(h * (empRatioMap[eId] || 0.75)).toFixed(2),
          actEffHrs: parseFloat(ph[10]) || 0,
          teamLead: ph[13] || r[22] || r[4] || '',
          remarks: ph[12] || '',
        });
      });
      const teamMembers = Object.values(tmAcc).map((t) => ({ ...t, hrs: +t.hrs.toFixed(2), empReqEff: +t.empReqEff.toFixed(2) })).sort((a, b) => b.hrs - a.hrs);
      teamMembersMap[derivedId] = teamMembers;
      logEntries[derivedId] = entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      // Compute project-level req eff from per-employee breakdown (hrs × each emp's req eff ratio)
      const reqEffHrs = Object.values(tmAcc).reduce((s, t) => s + t.empReqEff, 0);

      const out = [...r];
      out[8]  = spentHrs.toFixed(2);
      out[9]  = reqEffHrs.toFixed(2);
      out[10] = actEffHrs.toFixed(2);
      out[12] = clientHrs > 0 ? +(clientHrs - spentHrs / 60).toFixed(2) : '';
      data.push(out);
      rowIndices.push(i + 2);
    });
    res.json({ data, rowIndices, teamMembersMap, logEntries });
    syncInternalFeedbackSheet().catch(() => {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/projects/feedback', async (req, res) => {
  try {
    const [projRows, { map: hoursMap, rows: phRows }, empRows] = await Promise.all([
      getValues(SHEETS.PROJECTS, 'A2:X300'),
      computeProjectHours(),
      getValues(SHEETS.EMPLOYEES, 'A2:S300'),
    ]);
    // Build employee req eff ratio map
    const empRatioMap = {};
    const empNameMap = {};
    empRows.forEach((r) => { if (r[0]) { empRatioMap[r[0]] = parseEffRatio(r[7]) || 0.75; empNameMap[r[0]] = r[1] || r[0]; } });

    const teamMembersMap = {};
    const logEntries = {};  // per-session entries keyed by derivedId
    const data = [];
    const rowIndices = [];
    projRows.forEach((r, i) => {
      if (!r[0] || r[18] !== 'Yes') return;
      while (r.length < 24) r.push('');
      const fbCH  = hoursMap[`${r[0]}-FB-Client`]          || { spent: 0, reqEff: 0, actEff: 0 };
      const clientHrs = parseFloat(r[7]) || 0;
      const spentHrs  = fbCH.spent;  // ONLY derived FB-Client hours
      const actEffHrs = fbCH.actEff;

      // Compute per-employee breakdown
      const derivedId = `${r[0]}-FB-Client`;
      const tmAcc = {};
      const entries = [];
      phRows.filter((ph) => ph[5] === derivedId && ph[2]).forEach((ph) => {
        const eId = ph[2];
        const h = parseFloat(ph[8]) || 0;
        if (!tmAcc[eId]) tmAcc[eId] = { empId: eId, empName: empNameMap[eId] || ph[3] || eId, hrs: 0, empReqEff: 0 };
        tmAcc[eId].hrs += h;
        tmAcc[eId].empReqEff += h * (empRatioMap[eId] || 0.75);
        // Per-session entry
        entries.push({
          date: ph[1] || '',
          empId: eId,
          empName: empNameMap[eId] || ph[3] || eId,
          hrsWorked: +h.toFixed(2),
          reqEffHrs: +(h * (empRatioMap[eId] || 0.75)).toFixed(2),
          actEffHrs: parseFloat(ph[10]) || 0,
          teamLead: ph[13] || r[23] || r[4] || '',
          remarks: ph[12] || '',
        });
      });
      const teamMembers = Object.values(tmAcc).map((t) => ({ ...t, hrs: +t.hrs.toFixed(2), empReqEff: +t.empReqEff.toFixed(2) })).sort((a, b) => b.hrs - a.hrs);
      teamMembersMap[derivedId] = teamMembers;
      logEntries[derivedId] = entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      // Compute project-level req eff from per-employee breakdown (hrs × each emp's req eff ratio)
      const reqEffHrs = Object.values(tmAcc).reduce((s, t) => s + t.empReqEff, 0);

      const out = [...r];
      out[8]  = spentHrs.toFixed(2);
      out[9]  = reqEffHrs.toFixed(2);
      out[10] = actEffHrs.toFixed(2);
      out[12] = clientHrs > 0 ? +(clientHrs - spentHrs / 60).toFixed(2) : '';
      data.push(out);
      rowIndices.push(i + 2);
    });
    res.json({ data, rowIndices, teamMembersMap, logEntries });
    syncFeedbackSheet().catch(() => {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET all projects with type flags (used by attendance for QC/Feedback labels)
// Also includes derived project IDs (e.g., P001-QC → isQaqc=true, P001-FB-Client → isClientFb=true)
app.get('/api/projects/types', async (req, res) => {
  try {
    const rows = await getValues(SHEETS.PROJECTS, 'A2:X300');
    const map = {};
    rows.filter((r) => r[0]).forEach((r) => {
      // Parent project ID itself is NOT flagged — only derived suffix IDs carry the type flag.
      // This prevents the main project's log entries from leaking into QC/FB filters.
      if (r[20] === 'Yes') map[`${r[0]}-QC`] = { isQaqc: true, isClientFb: false, isInternalFb: false };
      if (r[15] === 'Yes') map[`${r[0]}-FB-Int`] = { isQaqc: false, isClientFb: false, isInternalFb: true };
      if (r[18] === 'Yes') map[`${r[0]}-FB-Client`] = { isQaqc: false, isClientFb: true, isInternalFb: false };
    });
    res.json(map);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects', async (req, res) => {
  try {
    // form sends 21 fields: [0-11 basic, 12-17 feedback/qaqc, 18-20 assigned persons]
    // sheet layout:        [0-11 basic, 12-14 computed, 15-20 feedback/qaqc, 21-23 assigned persons]
    const data = [...req.body];
    while (data.length < 21) data.push('');
    const sheetRow = [
      ...data.slice(0, 12),  // A–L basic
      '', '', '',             // M–O computed (left blank on insert)
      data[12] || '',         // P Internal Feedback
      data[13] || '',         // Q Internal FB Count
      data[14] || '',         // R Internal FB Hrs
      data[15] || '',         // S Client Feedback
      data[16] || '',         // T Client FB Hrs
      data[17] || '',         // U QA/QC
      data[18] || '',         // V QA/QC Assigned Person
      data[19] || '',         // W FB Internal Assigned Person
      data[20] || '',         // X FB Client Assigned Person
    ];
    await appendRows(SHEETS.PROJECTS, [sheetRow]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/projects/:row', async (req, res) => {
  try {
    const rowNum = parseInt(req.params.row);
    if (isNaN(rowNum)) return res.status(400).json({ error: 'Invalid row number' });
    // form sends 21 fields: [0-11 basic, 12-17 feedback/qaqc, 18-20 assigned persons]
    const data = [...req.body];
    while (data.length < 21) data.push('');
    await setValues(SHEETS.PROJECTS, `A${rowNum}:L${rowNum}`, [data.slice(0, 12)]);
    await setValues(SHEETS.PROJECTS, `P${rowNum}:U${rowNum}`, [data.slice(12, 18)]);
    await setValues(SHEETS.PROJECTS, `V${rowNum}:X${rowNum}`, [data.slice(18, 21)]);
    res.json({ success: true });
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sync-columns — ensure all GS sheet headers match frontend tables; migrate PROJECTS data to 15-col layout
app.post('/api/sync-columns', async (req, res) => {
  try {
    const results = [];

    // ── 1. PROJECTS — full data migration to 21-col layout ───────────────────
    const [projHeader, projData, { map: hoursMap }] = await Promise.all([
      getValues(SHEETS.PROJECTS, 'A1:U1'),
      getValues(SHEETS.PROJECTS, 'A2:U300'),
      computeProjectHours(),
    ]);
    const oldStructure = projHeader.length && /eff.*ratio|proj.*eff/i.test(projHeader[0]?.[11] || '');
    const newProjRows = projData.filter((r) => r[0]).map((r) => {
      const clientHrs = parseFloat(r[7]) || 0;
      const ph = hoursMap[r[0]];
      const spentHrs  = ph ? ph.spent  : (parseFloat(r[8])  || 0);
      const reqEffHrs = ph ? ph.reqEff : (parseFloat(r[9])  || 0);
      const actEffHrs = ph ? ph.actEff : (parseFloat(r[10]) || 0);
      const remarks   = oldStructure ? (r[12] || '') : (r[11] || '');
      const startDay  = ph?.firstDate ? parseInt(ph.firstDate.split('-')[2], 10) : (r[5] || '');
      const endDay    = ph?.lastDate  ? parseInt(ph.lastDate.split('-')[2],  10) : (r[6] || '');
      return [
        r[0], r[1], r[2], r[3], r[4], startDay, endDay, r[7],
        spentHrs.toFixed(2), reqEffHrs.toFixed(2), actEffHrs.toFixed(2),
        remarks,
        clientHrs > 0 ? +(clientHrs - spentHrs / 60).toFixed(2) : '',
        reqEffHrs > 0 ? +(clientHrs / (reqEffHrs / 60)).toFixed(4) : '',
        spentHrs  > 0 ? +(clientHrs / (spentHrs / 60)).toFixed(4)  : '',
        r[15] || '', r[16] || '', r[17] || '', // Internal Feedback fields
        r[18] || '', r[19] || '',              // Client Feedback fields
        r[20] || '',                            // QA/QC
      ];
    });
    await clearRange(SHEETS.PROJECTS, 'A1:U300');
    await setValues(SHEETS.PROJECTS, 'A1', [PROJ_HEADERS_NEW, ...newProjRows]);
    results.push({ sheet: 'PROJECTS', rows: newProjRows.length, note: oldStructure ? 'Migrated to 21-col layout + recomputed' : 'Recomputed all values' });

    // ── 2. All other sheets — header-only sync (never touches data rows) ─────
    const headerSpecs = [
      { sheet: SHEETS.EMPLOYEES, range: 'A1:S1', expected: EMP_HEADERS },
      { sheet: SHEETS.PROJ_HOURS, range: 'A1:N1', expected: ['Entry#', 'Date', 'EMP ID', 'Employee Name', 'Dept', 'Proj ID', 'Project Name', 'Client', 'Hrs Worked', 'Req Eff Hrs', 'Act Eff Hrs', 'Eff Ratio', 'Remarks', 'Team Lead'] },
      { sheet: SHEETS.EMP_MAP, range: 'A1:K1', expected: MAP_HEADERS },
      { sheet: SHEETS.ATT_STORE, range: 'A1:N1', expected: ATT_STORE_HEADERS },
      { sheet: SHEETS.ATTENDANCE, range: 'A1:N1', expected: ATT_HEADERS },
      { sheet: SHEETS.EFF_LOG, range: 'A1:L1', expected: ['Entry#', 'Date', 'EMP ID', 'Employee Name', 'Dept', 'Proj ID', 'Project Name', 'Hrs Worked', 'Req Eff Hrs', 'Act Eff Hrs', 'Eff Ratio', 'Remarks'] },
      { sheet: SHEETS.DIV_TARGETS, range: 'A1:F1', expected: ['Entry#', 'Year', 'Month', 'Team Lead', 'Target Hrs', 'Updated At'] },
    ];

    for (const { sheet, range, expected } of headerSpecs) {
      const existing = await getValues(sheet, range);
      const current = existing[0] || [];
      const matches = expected.every((h, i) => current[i] === h);
      if (!matches) {
        await setValues(sheet, 'A1', [expected]);
        results.push({ sheet, note: `Headers updated (${expected.length} cols)` });
      } else {
        results.push({ sheet, note: 'Headers OK' });
      }
    }

    // ── 3. QAQC_PROJECTS — rebuilt using per-employee req eff ratio ──────────
    await syncQaqcSheet();
    results.push({ sheet: SHEETS.QAQC, note: 'Rebuilt with per-employee req eff ratio' });

    // ── 4. FEEDBACK_PROJECTS — rebuilt using per-employee req eff ratio ───────
    await syncFeedbackSheet();
    results.push({ sheet: SHEETS.FEEDBACK, note: 'Rebuilt with per-employee req eff ratio' });

    // ── 5. INT_FEEDBACK_PROJECTS — rebuilt using per-employee req eff ratio ──
    await syncInternalFeedbackSheet();
    results.push({ sheet: SHEETS.INT_FB, note: 'Rebuilt with per-employee req eff ratio' });

    res.json({ success: true, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sync/qaqc — manually trigger QAQC_PROJECTS sheet rebuild
app.post('/api/sync/qaqc', async (req, res) => {
  try {
    await syncQaqcSheet();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sync/feedback — manually trigger FEEDBACK_PROJECTS sheet rebuild
app.post('/api/sync/feedback', async (req, res) => {
  try {
    await syncFeedbackSheet();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sync/internal-feedback — manually trigger INT_FEEDBACK_PROJECTS sheet rebuild
app.post('/api/sync/internal-feedback', async (req, res) => {
  try {
    await syncInternalFeedbackSheet();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sync-from-excel — import all sheets from SCAN2BIM TRACKER.xlsx
app.post('/api/sync-from-excel', async (req, res) => {
  try {
    const xlFile = path.join(__dirname, '..', 'SCAN2BIM TRACKER.xlsx');
    await ensureSheets();
    const wb = XLSX.readFile(xlFile, { cellDates: true });
    const results = [];
    const sheetMap = [
      { xl: 'EMPLOYEES', gs: SHEETS.EMPLOYEES },
      { xl: 'PROJECTS',  gs: SHEETS.PROJECTS },
      { xl: 'EMP_MAP',   gs: SHEETS.EMP_MAP },
      { xl: 'PROJ_HOURS',gs: SHEETS.PROJ_HOURS },
      { xl: 'ATT_STORE', gs: SHEETS.ATT_STORE },
      { xl: 'EFF_LOG',   gs: SHEETS.EFF_LOG },
      { xl: 'DIV_TARGETS', gs: SHEETS.DIV_TARGETS },
    ];
    for (const { xl, gs } of sheetMap) {
      const ws = wb.Sheets[xl];
      if (!ws) { results.push({ sheet: gs, skipped: true, note: `"${xl}" not in Excel` }); continue; }
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      const rows = raw.filter((r) => r.some((c) => c !== '' && c != null))
                      .map((r) => r.map((c) => (c == null ? '' : String(c))));
      if (!rows.length) { results.push({ sheet: gs, skipped: true, note: 'empty' }); continue; }
      await clearRange(gs, 'A1:Z5000');
      await setValues(gs, 'A1', rows);
      results.push({ sheet: gs, rows: rows.length });
    }
    _settCache = null;
    res.json({ success: true, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects/import', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows || !rows.length) return res.status(400).json({ error: 'No rows provided' });
    const padded = rows.map((r) => {
      const row = [...r];
      while (row.length < 14) row.push('');
      return row;
    });
    await appendRows(SHEETS.PROJECTS, padded);
    res.json({ success: true, count: padded.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/projects/template', async (req, res) => {
  try {
    const headers = ['Proj ID', 'Project Name', 'Client', 'Status', 'Team Lead', 'Start (Day#)', 'End (Day#)', 'Client Hrs', 'Total Spent Hrs', 'Req Eff Hrs', 'Act Eff Hrs', 'Proj Eff %', 'Remarks', 'Remaining Hrs'];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ['P001', 'Sample Project', 'Client Name', 'In Progress', 'John Doe', '1', '30', '100', '80', '90', '85', '111.11', '', '20']]);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, 'PROJECTS');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="projects_template.xlsx"');
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EMP MAP ───────────────────────────────────────────────────────────────────
// Headers (11 cols): Map ID|Employee Name|EMP ID|Project Name|Proj ID|Role|Spent Hrs|Eff Ratio|Status|Proj Eff|Team Lead
const MAP_HEADERS = ['Map ID', 'Employee Name', 'EMP ID', 'Project Name', 'Proj ID', 'Role', 'Spent Hrs', 'Eff Ratio', 'Status', 'Proj Eff', 'Team Lead'];

app.get('/api/emp-map', async (req, res) => {
  try {
    const rows = await getValues(SHEETS.EMP_MAP, 'A1:K2000');
    if (!rows.length) return res.json({ headers: MAP_HEADERS, data: [] });
    const [, ...data] = rows;
    const result = { headers: MAP_HEADERS, data: [], rowIndices: [] };
    data.forEach((r, i) => {
      if (!r[0]) return;
      while (r.length < 11) r.push('');
      result.data.push(r);
      result.rowIndices.push(i + 2);
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/emp-map/by-employee/:empId', async (req, res) => {
  try {
    const rows = await getValues(SHEETS.EMP_MAP, 'A2:K2000');
    const matches = rows.filter((r) => r[2] === req.params.empId && r[8] === 'Active').map((r) => { while (r.length < 11) r.push(''); return r; });
    res.json(matches);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/emp-map/by-lead/:lead', async (req, res) => {
  try {
    const rows = await getValues(SHEETS.EMP_MAP, 'A2:K2000');
    const matches = rows.filter((r) => r[10] === req.params.lead).map((r) => { while (r.length < 11) r.push(''); return r; });
    res.json(matches);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/emp-map/assign', async (req, res) => {
  try {
    const { empName, empId, projName, projId, role, teamLead } = req.body;
    // Generate next Map ID
    const rows = await getValues(SHEETS.EMP_MAP, 'A2:A2000');
    const nextNum = rows.filter((r) => r[0]).length + 1;
    const mapId = `MAP${String(nextNum).padStart(3, '0')}`;
    await appendRows(SHEETS.EMP_MAP, [[mapId, empName, empId, projName, projId, role, '0', '1', 'Active', '', teamLead]]);
    res.json({ success: true, mapId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/emp-map/:row', async (req, res) => {
  try {
    const rowNum = parseInt(req.params.row);
    if (isNaN(rowNum)) return res.status(400).json({ error: 'Invalid row number' });
    await setValues(SHEETS.EMP_MAP, `A${rowNum}:K${rowNum}`, [req.body]); res.json({ success: true });
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ATTENDANCE ────────────────────────────────────────────────────────────────
// Multi-session format (14 cols):
// Date|EMP ID|Employee Name|Dept|Day Status|Proj ID|Project Name|Login Time|Logout Time|Hrs Worked|OT Hrs|Session|Remarks|Act Eff Hrs
const ATT_HEADERS = ['Date', 'EMP ID', 'Employee Name', 'Dept', 'Day Status', 'Proj ID', 'Project Name', 'Login Time', 'Logout Time', 'Hrs Worked', 'OT Hrs', 'Session', 'Remarks', 'Act Eff Hrs'];
const ATT_STORE_HEADERS = ['Date', 'EMP ID', 'Employee Name', 'Dept', 'Day Status', 'Proj ID', 'Project Name', 'Login Time', 'Logout Time', 'Hrs Worked', 'OT Hrs', 'Session', 'Remarks', 'Act Eff Hrs'];

// GET today grouped by employee
app.get('/api/attendance/today', async (req, res) => {
  try {
    const date = req.query.date || todayStr();
    const [attRows, empRows] = await Promise.all([
      getValues(SHEETS.ATTENDANCE, 'A2:N5000'),
      getValues(SHEETS.EMPLOYEES, 'A2:O300'),
    ]);
    const byEmp = {};
    empRows.forEach((r, ei) => {
      if (!r[0] && !r[1]) return;
      const rawId = (r[0] || '').trim();
      const empId = (rawId && rawId.toLowerCase() !== 'trainee') ? rawId : `T${String(ei + 1).padStart(3, '0')}`;
      byEmp[empId] = { empId, empName: r[1] || '', dept: r[4] || '', shift: r[13] || '', weekOff: r[14] || '', dayStatus: '', sessions: [], rowIndices: [] };
    });
    attRows.forEach((r, idx) => {
      if (r[0] !== date || !r[1]) return;
      const empId = r[1];
      if (!byEmp[empId]) byEmp[empId] = { empId, empName: r[2], dept: r[3], shift: '', weekOff: '', dayStatus: r[4] || '', sessions: [], rowIndices: [] };
      byEmp[empId].dayStatus = r[4] || byEmp[empId].dayStatus;
      byEmp[empId].rowIndices.push(idx + 2);
      if (r[5]) {
        byEmp[empId].sessions.push({ projId: r[5], projName: r[6], loginTime: r[7], logoutTime: r[8], hrsWorked: r[9], otHrs: r[10], session: r[11], remarks: r[12], actEffHrs: r[13] || '', sheetRow: idx + 2 });
      }
    });
    res.json({ date, employees: Object.values(byEmp) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST: set day status for an employee
app.post('/api/attendance/status', async (req, res) => {
  try {
    const { date, empId, empName, dept, status } = req.body;
    const attRows = await getValues(SHEETS.ATTENDANCE, 'A2:M5000');
    // Find existing rows for this employee on this date
    const existing = attRows.reduce((acc, r, i) => { if (r[0] === date && r[1] === empId) acc.push(i + 2); return acc; }, []);
    if (existing.length) {
      // Update dayStatus in all existing rows using BATCH
      const updates = existing.map((rowNum) => ({ range: `E${rowNum}`, values: [[status]] }));
      await setValuesBatch(SHEETS.ATTENDANCE, updates);
    } else {
      // Create status-only row (no session)
      await appendRows(SHEETS.ATTENDANCE, [[date, empId, empName, dept, status, '', '', '', '', '', '', '', '', '']]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST: log a session (direct hours entry)
app.post('/api/attendance/session', async (req, res) => {
  try {
    const { date, empId, empName, dept, dayStatus, projId, projName, hrsWorked: hrsBody, actEffHrs, miscHrs, remarks } = req.body;
    const hrsWorked = Math.round(parseFloat(hrsBody) * 100) / 100 || 0;
    const otHrs = miscHrs !== undefined ? (Math.round(parseFloat(miscHrs) * 100) / 100) || 0 : +(Math.max(0, hrsWorked - 9)).toFixed(2);
    // Session number for this employee today
    const attRows = await getValues(SHEETS.ATTENDANCE, 'A2:M5000');
    const existingSessions = attRows.filter((r) => r[0] === date && r[1] === empId && r[5]);
    const sessionNum = existingSessions.length + 1;
    // Update dayStatus in existing rows if any
    if (dayStatus) {
      const statusRows = attRows.reduce((acc, r, i) => { if (r[0] === date && r[1] === empId) acc.push(i + 2); return acc; }, []);
      if (statusRows.length) {
        const updates = statusRows.map((rowNum) => ({ range: `E${rowNum}`, values: [[dayStatus]] }));
        await setValuesBatch(SHEETS.ATTENDANCE, updates);
      }
    }
    // Append session row (login/logout cols left blank to preserve column positions)
    const attActEffHrs = actEffHrs !== undefined ? parseFloat(actEffHrs) || 0 : 0;
    const row = [date, empId, empName, dept, dayStatus || 'P', projId, projName, '', '', hrsWorked, otHrs, sessionNum, remarks || '', attActEffHrs];
    await appendRows(SHEETS.ATTENDANCE, [row]);
    // Write to PROJ_HOURS
    if (projId && hrsWorked > 0) {
      const phRows = await getValues(SHEETS.PROJ_HOURS, 'A2:A2000');
      const nextPh = phRows.filter((r) => r[0]).length + 1;
      const empData = await getValues(SHEETS.EMPLOYEES, 'A2:O300');
      const emp = empData.find((r) => r[0] === empId) || [];
      const reqEffRatio2 = parseEffRatio(emp[7]) || 0.75;
      const reqEffHrs = +(hrsWorked * reqEffRatio2).toFixed(2);
      const projData = await getValues(SHEETS.PROJECTS, 'A2:M300');
      const proj = projData.find((r) => r[0] === projId) || [];
      const client = proj[2] || '';
      const teamLead = emp[3] || '';
      const actEffHrsVal = actEffHrs !== undefined ? parseFloat(actEffHrs) || 0 : reqEffHrs;
      const eff = actEffHrsVal > 0 && reqEffHrs > 0 ? +(actEffHrsVal / reqEffHrs).toFixed(4) : 0;
      await appendRows(SHEETS.PROJ_HOURS, [[nextPh, date, empId, empName, dept, projId, projName, client, hrsWorked, reqEffHrs, actEffHrsVal, eff, remarks || '', teamLead]]);
    }
    res.json({ success: true, hrsWorked });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE: remove a session row (also removes linked PROJ_HOURS row)
app.delete('/api/attendance/session/:row', async (req, res) => {
  try {
    const rowNum = parseInt(req.params.row);
    if (isNaN(rowNum)) return res.status(400).json({ error: 'Invalid row number' });
    // Read attendance row to find linked PROJ_HOURS record
    const attData = await getValues(SHEETS.ATTENDANCE, `A${rowNum}:N${rowNum}`);
    const attRow = attData?.[0];
    if (attRow && attRow[0] && attRow[1] && attRow[5]) {
      const date = (attRow[0] || '').trim();
      const empId = (attRow[1] || '').trim();
      const projId = (attRow[5] || '').trim();
      const phRows = await getValues(SHEETS.PROJ_HOURS, 'A2:N5000');
      const matchIdx = phRows.findIndex(
        (pr) => (pr[1] || '').trim() === date && (pr[2] || '').trim() === empId && (pr[5] || '').trim() === projId
      );
      if (matchIdx !== -1) {
        const phRowNum = matchIdx + 2;
        await clearRange(SHEETS.PROJ_HOURS, `A${phRowNum}:N${phRowNum}`);
      }
    }
    await clearRange(SHEETS.ATTENDANCE, `A${rowNum}:N${rowNum}`);
    syncDerivedSheet(attRow?.[5] || '');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT: edit a session row (updates project, hrs, OT, actEffHrs, remarks)
app.put('/api/attendance/session/:row', async (req, res) => {
  try {
    const rowNum = parseInt(req.params.row);
    if (isNaN(rowNum)) return res.status(400).json({ error: 'Invalid row number' });
    const { date, empId, empName, dept, projId, projName, hrsWorked: hrsBody, miscHrs, actEffHrs, remarks } = req.body;
    const hrsWorked = Math.round(parseFloat(hrsBody) * 100) / 100 || 0;
    const otHrs = miscHrs !== undefined ? (Math.round(parseFloat(miscHrs) * 100) / 100) || 0 : +(Math.max(0, hrsWorked - 9)).toFixed(2);

    // Update ATTENDANCE row
    const actVal = actEffHrs !== undefined && actEffHrs !== '' ? Math.round(parseFloat(actEffHrs) * 100) / 100 : null;
    await sheetsApi.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `${SHEETS.ATTENDANCE}!F${rowNum}:G${rowNum}`, values: [[projId, projName]] },
          { range: `${SHEETS.ATTENDANCE}!J${rowNum}:K${rowNum}`, values: [[hrsWorked, otHrs]] },
          { range: `${SHEETS.ATTENDANCE}!M${rowNum}`, values: [[remarks || '']] },
          { range: `${SHEETS.ATTENDANCE}!N${rowNum}`, values: [[actVal !== null ? actVal : '']] },
        ],
      },
    });

    // Update PROJ_HOURS when actEffHrs is provided
    if (actVal !== null && date && empId) {
      const phRows = await getValues(SHEETS.PROJ_HOURS, 'A2:N5000');
      const matchIdx = phRows.findIndex(
        (pr) => (pr[1] || '').trim() === date.trim() && (pr[2] || '').trim() === empId.trim() && (pr[5] || '').trim() === projId.trim()
      );
      const prevReq = matchIdx !== -1 ? parseFloat(phRows[matchIdx][9]) || 0 : 0;
      const eff = actVal > 0 && prevReq > 0 ? +(actVal / prevReq).toFixed(4) : 0;
      if (matchIdx !== -1) {
        const phRowNum = matchIdx + 2;
        await sheetsApi.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: [
              { range: `${SHEETS.PROJ_HOURS}!I${phRowNum}`, values: [[hrsWorked]] },
              { range: `${SHEETS.PROJ_HOURS}!K${phRowNum}:L${phRowNum}`, values: [[actVal, eff]] },
              { range: `${SHEETS.PROJ_HOURS}!M${phRowNum}`, values: [[remarks || '']] },
            ],
          },
        });
      } else {
        // No existing PROJ_HOURS row — append one
        const phRows2 = await getValues(SHEETS.PROJ_HOURS, 'A2:A5000');
        const nextPh = phRows2.filter((r) => r[0]).length + 1;
        const empData = await getValues(SHEETS.EMPLOYEES, 'A2:O300');
        const emp = empData.find((r) => (r[0] || '').trim() === empId.trim()) || [];
      const reqEffRatio2 = parseEffRatio(emp[7]) || 0.75;
      const reqEffHrs = +(hrsWorked * reqEffRatio2).toFixed(2);
        const projData = await getValues(SHEETS.PROJECTS, 'A2:M300');
        const proj = projData.find((r) => (r[0] || '').trim() === projId.trim()) || [];
        const newEff = actVal > 0 && reqEffHrs > 0 ? +(actVal / reqEffHrs).toFixed(4) : 0;
        await appendRows(SHEETS.PROJ_HOURS, [[nextPh, date, empId, empName || emp[1] || '', dept || emp[4] || '', projId, projName, proj[2] || '', hrsWorked, reqEffHrs, actVal, newEff, remarks || '', emp[3] || '']]);
      }
    }

    syncDerivedSheet(projId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET attendance raw (for history/archive tabs)
app.get('/api/attendance', async (req, res) => {
  try {
    const rows = await getValues(SHEETS.ATTENDANCE, 'A2:N5000');
    const data = rows.map((r, i) => {
      if (!r[0] || !r[1]) return null;
      const padded = r.slice();
      while (padded.length < 14) padded.push('');
      padded.push(i + 2);
      return padded;
    }).filter(Boolean);
    res.json({ headers: ATT_HEADERS, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET attendance summary with date filter
app.get('/api/attendance/summary', async (req, res) => {
  try {
    const { filter = 'today', from, to } = req.query;
    const today = todayStr();
    let fromDate, toDate;
    if (filter === 'today') { fromDate = toDate = today; }
    else if (filter === 'week') {
      const d = new Date(); d.setDate(d.getDate() - 6);
      fromDate = d.toISOString().slice(0, 10); toDate = today;
    } else if (filter === 'month') {
      fromDate = today.slice(0, 7) + '-01'; toDate = today;
    } else if (filter === 'custom') { fromDate = from; toDate = to; }
    const attRows = await getValues(SHEETS.ATTENDANCE, 'A2:M5000');
    const inRange = attRows.filter((r) => r[0] && r[1] && r[0] >= fromDate && r[0] <= toDate);
    // Deduplicate per employee per date for status counts (take the status from first row per emp-date)
    const seenStatus = {};
    inRange.forEach((r) => {
      const key = `${r[0]}__${r[1]}`;
      if (!seenStatus[key] && r[4]) seenStatus[key] = r[4];
    });
    const statuses = Object.values(seenStatus);
    const present = statuses.filter((s) => s === 'P').length;
    const absent = statuses.filter((s) => s === 'A').length;
    const leave = statuses.filter((s) => s === 'L').length;
    const wfh = statuses.filter((s) => s === 'WFH').length;
    const hd = statuses.filter((s) => s === 'HD').length;
    const od = statuses.filter((s) => s === 'OD').length;
    const holiday = statuses.filter((s) => s === 'H').length;
    // By date
    const byDate = {};
    Object.entries(seenStatus).forEach(([key, st]) => {
      const [date] = key.split('__');
      if (!byDate[date]) byDate[date] = { date, P: 0, A: 0, L: 0, WFH: 0, HD: 0, OD: 0, H: 0 };
      byDate[date][st] = (byDate[date][st] || 0) + 1;
    });
    // By employee
    const byEmp = {};
    Object.entries(seenStatus).forEach(([key, st]) => {
      const [date, empId] = key.split('__');
      const row = inRange.find((r) => r[0] === date && r[1] === empId);
      if (!byEmp[empId]) byEmp[empId] = { empId, empName: row?.[2] || empId, P: 0, A: 0, L: 0, WFH: 0, total: 0 };
      byEmp[empId][st] = (byEmp[empId][st] || 0) + 1;
      byEmp[empId].total++;
    });
    res.json({ fromDate, toDate, present, absent, leave, wfh, hd, od, holiday, total: statuses.length, byDate: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)), byEmployee: Object.values(byEmp).sort((a, b) => b.P - a.P) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PROJECT HOURS ──────────────────────────────────────────────────────────────
app.get('/api/project-hours', async (req, res) => {
  try {
    const rows = await getValues(SHEETS.PROJ_HOURS, 'A1:N2000');
    if (!rows.length) return res.json({ headers: [], data: [] });
    const [headers, ...data] = rows;
    const result = { headers, data: [], rowIndices: [] };
    data.forEach((r, i) => {
      if (!r[0]) return;
      result.data.push(r);
      result.rowIndices.push(i + 2);
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/project-hours', async (req, res) => {
  try {
    const row = [...req.body];
    // Auto-fill Team Lead (col 13) from EMPLOYEES if missing
    if (row.length < 14 || !row[13]) {
      const empId = row[2];
      if (empId) {
        const empRows = await getValues(SHEETS.EMPLOYEES, 'A2:P300');
        const emp = empRows.find((r) => r[0] === empId);
        if (emp && emp[3]) {
          while (row.length < 14) row.push('');
          row[13] = emp[3];
        }
      }
    }
    await appendRows(SHEETS.PROJ_HOURS, [row]);
    res.json({ success: true });
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EFFICIENCY LOG ────────────────────────────────────────────────────────────
app.get('/api/efficiency', async (req, res) => {
  try {
    const rows = await getValues(SHEETS.EFF_LOG, 'A1:L2000');
    if (!rows.length) return res.json({ headers: [], data: [] });
    const [headers, ...data] = rows;
    res.json({ headers, data: data.filter((r) => r[0]) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ATT STORE ─────────────────────────────────────────────────────────────────
app.get('/api/att-store', async (req, res) => {
  try {
    const rows = await getValues(SHEETS.ATT_STORE, 'A1:N2000');
    if (!rows.length) return res.json({ headers: [], data: [] });
    const [headers, ...dataRows] = rows;
    // Pad to 14 cols then append sheet row number at index 14 so the client can always find it
    const data = dataRows.map((r, i) => {
      if (!r[0]) return null;
      const padded = r.slice();
      while (padded.length < 14) padded.push('');
      padded.push(i + 2);
      return padded;
    }).filter(Boolean);
    res.json({ headers, data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/att-store/:row', requireAuth, async (req, res) => {
  try {
    const rowNum = parseInt(req.params.row);
    if (isNaN(rowNum)) return res.status(400).json({ error: 'Invalid row number' });
    const { projId, projName, hrsWorked: hrsBody, miscHrs, actEffHrs, remarks } = req.body;
    const hrsWorked = Math.round(parseFloat(hrsBody) * 100) / 100 || 0;
    const otHrs = miscHrs !== undefined ? (Math.round(parseFloat(miscHrs) * 100) / 100) || 0 : +(Math.max(0, hrsWorked - 9)).toFixed(2);
    const actVal = actEffHrs !== undefined && actEffHrs !== '' ? Math.round(parseFloat(actEffHrs) * 100) / 100 : null;
    await sheetsApi.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `${SHEETS.ATT_STORE}!F${rowNum}:G${rowNum}`, values: [[projId, projName]] },
          { range: `${SHEETS.ATT_STORE}!J${rowNum}:K${rowNum}`, values: [[hrsWorked, otHrs]] },
          { range: `${SHEETS.ATT_STORE}!M${rowNum}`, values: [[remarks || '']] },
          { range: `${SHEETS.ATT_STORE}!N${rowNum}`, values: [[actVal !== null ? actVal : '']] },
        ],
      },
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DIVISION TARGETS ─────────────────────────────────────────────────────────
app.get('/api/div-targets', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth();
    const rows = await getValues(SHEETS.DIV_TARGETS, 'A2:F2000');
    let divisionTarget = 0;
    const targets = {};
    rows.forEach((r) => {
      if (parseInt(r[1]) === year && parseInt(r[2]) === month && r[3]) {
        if (r[3] === '__DIVISION__') {
          divisionTarget = parseFloat(r[4]) || 0;
        } else {
          targets[r[3]] = parseFloat(r[4]) || 0;
        }
      }
    });
    res.json({ year, month, divisionTarget, targets });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/div-targets', async (req, res) => {
  try {
    const { year, month, divisionTarget, targets } = req.body;
    if (year == null || month == null) return res.status(400).json({ error: 'Missing year or month' });
    const rows = await getValues(SHEETS.DIV_TARGETS, 'A2:F2000');
    const now = todayStr();
    const existing = {};
    rows.forEach((r, i) => {
      if (parseInt(r[1]) === parseInt(year) && parseInt(r[2]) === parseInt(month) && r[3]) {
        existing[r[3]] = i + 2;
      }
    });
    const batchData = [];
    // upsert division-level target
    if (divisionTarget != null) {
      const dtVal = parseFloat(divisionTarget) || 0;
      if (existing['__DIVISION__']) {
        batchData.push({ range: `${SHEETS.DIV_TARGETS}!D${existing['__DIVISION__']}:F${existing['__DIVISION__']}`, values: [['__DIVISION__', dtVal, now]] });
      } else {
        const entryNum = rows.filter((r) => r[0]).length + 1;
        await appendRows(SHEETS.DIV_TARGETS, [[entryNum, year, month, '__DIVISION__', dtVal, now]]);
      }
    }
    // upsert team-level targets
    const nextEntry = rows.filter((r) => r[0]).length + 1;
    let entryNum = nextEntry;
    for (const [tl, val] of Object.entries(targets || {})) {
      const targetHrs = parseFloat(val) || 0;
      if (existing[tl]) {
        batchData.push({ range: `${SHEETS.DIV_TARGETS}!D${existing[tl]}:F${existing[tl]}`, values: [[tl, targetHrs, now]] });
      } else {
        await appendRows(SHEETS.DIV_TARGETS, [[entryNum++, year, month, tl, targetHrs, now]]);
      }
    }
    if (batchData.length) {
      await sheetsApi.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: batchData },
      });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── HOLIDAYS ──────────────────────────────────────────────────────────────────
app.get('/api/holidays', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const rows = await getValues(SHEETS.HOLIDAYS, 'A2:D2000');
    const holidays = rows
      .filter((r) => r[1] && r[1].startsWith(String(year)))
      .map((r) => ({ date: r[1], name: r[2] || '' }))
      .sort((a, b) => a.date.localeCompare(b.date));
    res.json({ year, holidays });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/holidays', async (req, res) => {
  try {
    const { holidays } = req.body;
    if (!Array.isArray(holidays)) return res.status(400).json({ error: 'holidays array required' });
    const rows = await getValues(SHEETS.HOLIDAYS, 'A2:D2000');
    const existingMap = {};
    rows.forEach((r, i) => { if (r[1]) existingMap[r[1]] = i + 2; });
    const now = todayStr();
    const appendData = [];
    const updateData = [];
    let nextEntry = rows.filter((r) => r[0]).length + 1;
    for (const h of holidays) {
      if (!h.date) continue;
      const name = h.name || '';
      if (existingMap[h.date]) {
        updateData.push({ range: `${SHEETS.HOLIDAYS}!B${existingMap[h.date]}:D${existingMap[h.date]}`, values: [[h.date, name, now]] });
      } else {
        appendData.push([nextEntry++, h.date, name, now]);
      }
    }
    // Remove holidays not in the submitted list (clear their cells)
    const submittedDates = new Set(holidays.filter((h) => h.date).map((h) => h.date));
    const staleRanges = [];
    rows.forEach((r, i) => {
      if (r[1] && !submittedDates.has(r[1])) staleRanges.push({ range: `${SHEETS.HOLIDAYS}!A${i + 2}:D${i + 2}`, values: [['', '', '', '']] });
    });
    if (updateData.length) {
      await sheetsApi.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: updateData },
      });
    }
    if (appendData.length) {
      await appendRows(SHEETS.HOLIDAYS, appendData);
    }
    if (staleRanges.length) {
      await sheetsApi.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: staleRanges },
      });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function parseEffRatio(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const s = String(v).replace('%', '');
  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return n > 5 ? n / 100 : n; // handle both "75" (percent) and "0.75" (ratio)
}

app.get('/api/dashboard', async (req, res) => {
  try {
    const [empRows, projRows, attRows, phRows, empMapRows] = await Promise.all([
      getValues(SHEETS.EMPLOYEES, 'A2:O300'),
      getValues(SHEETS.PROJECTS, 'A2:X300'),
      getValues(SHEETS.ATTENDANCE, 'A2:N5000'),
      getValues(SHEETS.PROJ_HOURS, 'A2:N2000'),
      getValues(SHEETS.EMP_MAP, 'A2:K2000'),
    ]);
    const today = todayStr();
    const activeEmp = empRows.filter((r) => r[0] && r[6] === 'Active');
    const inProg = projRows.filter((r) => r[0] && r[3] === 'In Progress');
    const completed = projRows.filter((r) => r[0] && r[3] === 'Completed');
    const onHold = projRows.filter((r) => r[0] && r[3] === 'On Hold');
    const todayRows = attRows.filter((r) => r[0] === today && r[1]);
    const seenToday = {};
    todayRows.forEach((r) => { if (r[4] && !seenToday[r[1]]) seenToday[r[1]] = r[4]; });
    const present = Object.values(seenToday).filter((s) => s === 'P').length;
    const absent = Object.values(seenToday).filter((s) => s === 'A').length;
    const leave = Object.values(seenToday).filter((s) => s === 'L').length;
    const wfh = Object.values(seenToday).filter((s) => s === 'WFH').length;
    const hoursToday = todayRows.reduce((s, r) => s + (parseFloat(r[9]) || 0), 0);
    const depts = {};
    activeEmp.forEach((e) => { const d = e[4] || 'Other'; depts[d] = (depts[d] || 0) + 1; });
    const projStatus = [
      { name: 'In Progress', value: inProg.length, color: '#6366f1' },
      { name: 'Completed', value: completed.length, color: '#22c55e' },
      { name: 'On Hold', value: onHold.length, color: '#f59e0b' },
    ].filter((p) => p.value > 0);

    // ── Project-wise hours aggregation from PROJ_HOURS ──────────────────────
    const hoursMap = {};
    const validPhRows = phRows.filter((r) => r[5]); // must have projId (col 5)
    validPhRows.forEach((r) => {
      const id = r[5];
      if (!hoursMap[id]) hoursMap[id] = { projId: id, projName: r[6] || id, spent: 0, reqEff: 0, actEff: 0, sessions: 0, effSum: 0, effCount: 0, firstDate: null, lastDate: null };
      hoursMap[id].spent  += parseFloat(r[8]) || 0;
      hoursMap[id].reqEff += parseFloat(r[9]) || 0;
      hoursMap[id].actEff += parseFloat(r[10]) || 0;
      hoursMap[id].sessions++;
      const d = r[1];
      if (d) {
        if (!hoursMap[id].firstDate || d < hoursMap[id].firstDate) hoursMap[id].firstDate = d;
        if (!hoursMap[id].lastDate  || d > hoursMap[id].lastDate)  hoursMap[id].lastDate  = d;
      }
      const eff = parseEffRatio(r[11]);
      if (!isNaN(eff) && eff > 0) { hoursMap[id].effSum += eff; hoursMap[id].effCount++; }
    });
    const projStats = Object.values(hoursMap).map((p) => {
      const proj = projRows.find((r) => r[0] === p.projId);
      const clientHrs = parseFloat(proj?.[7]) || 0;
      const remaining = clientHrs > 0 ? +(clientHrs - p.spent / 60).toFixed(1) : null;
      const avgEff = p.reqEff > 0 ? +(p.actEff / p.reqEff) : 0;
      return { projId: p.projId, projName: p.projName, client: proj?.[2] || '', status: proj?.[3] || '', spent: +p.spent.toFixed(1), reqEff: +p.reqEff.toFixed(1), actEff: +p.actEff.toFixed(1), clientHrs, remaining, avgEff: +avgEff.toFixed(4), sessions: p.sessions };
    }).sort((a, b) => b.spent - a.spent).slice(0, 15);

    // ── Employee efficiency aggregation ──────────────────────────────────────
    const empEffMap = {};
    validPhRows.forEach((r) => {
      if (!r[2]) return;
      const id = r[2];
      if (!empEffMap[id]) empEffMap[id] = { empId: id, empName: r[3] || id, dept: r[4] || '', totalHrs: 0, reqEff: 0, actEff: 0, sessions: 0 };
      empEffMap[id].totalHrs += parseFloat(r[8]) || 0;
      empEffMap[id].reqEff += parseFloat(r[9]) || 0;
      empEffMap[id].actEff += parseFloat(r[10]) || 0;
      empEffMap[id].sessions++;
    });
    const empEff = Object.values(empEffMap).map((e) => ({
      empId: e.empId, empName: e.empName, dept: e.dept,
      totalHrs: +e.totalHrs.toFixed(1), sessions: e.sessions,
      avgEff: e.reqEff > 0 ? +(e.actEff / e.reqEff).toFixed(4) : 0,
    })).sort((a, b) => b.totalHrs - a.totalHrs).slice(0, 20);

    // ── Overall efficiency metrics ───────────────────────────────────────────
    const overallReqEff = validPhRows.reduce((s, r) => s + (parseFloat(r[9]) || 0), 0);
    const overallActEff = validPhRows.reduce((s, r) => s + (parseFloat(r[10]) || 0), 0);
    const overallEff = overallReqEff > 0 ? +(overallActEff / overallReqEff).toFixed(4) : 0;
    const totalLoggedHrs = validPhRows.reduce((s, r) => s + (parseFloat(r[8]) || 0), 0);

    // ── Gantt chart data (projects with full dates + team members) ───────────
    const ganttProjRows = projRows.filter((r) => r[0] && (r[3] === 'In Progress' || r[3] === 'Completed' || r[3] === 'On Hold'));
    const ganttData = ganttProjRows.map((r) => {
      const h = hoursMap[r[0]] || { firstDate: null, lastDate: null, spent: 0, reqEff: 0, actEff: 0 };
      // If no dates in hours, use day# from sheet (col 5/6) with current year/month as fallback
      let firstDate = h.firstDate;
      let lastDate  = h.lastDate;
      if (!firstDate && r[5]) {
        const now = new Date();
        const day = String(r[5]).padStart(2, '0');
        firstDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${day}`;
      }
      if (!lastDate && r[6]) {
        const now = new Date();
        const day = String(r[6]).padStart(2, '0');
        lastDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${day}`;
      }
      return {
        projId: r[0], projName: r[1] || r[0], client: r[2] || '', status: r[3] || '',
        teamLead: r[4] || '',
        firstDate,
        lastDate,
        clientHrs: parseFloat(r[7]) || 0,
        spentHrs: +(h.spent || 0).toFixed(1),
        reqEffHrs: +(h.reqEff || 0).toFixed(1),
        actEffHrs: +(h.actEff || 0).toFixed(1),
      };
    }).sort((a, b) => {
      // Sort by start date (earliest first), then by name
      if (a.firstDate && b.firstDate) return a.firstDate.localeCompare(b.firstDate);
      if (a.firstDate) return -1;
      if (b.firstDate) return 1;
      return a.projName.localeCompare(b.projName);
    });

    // ── Build team members per project from EMP_MAP ──────────────────────────
    const projTeamMap = {};
    empMapRows.filter((r) => r[0] && (r[8] === 'Active' || r[8] === 'Completed')).forEach((r) => {
      const pid = r[4];
      if (!projTeamMap[pid]) projTeamMap[pid] = [];
      projTeamMap[pid].push({
        empId: r[2] || '', empName: r[1] || r[2] || '', role: r[5] || '',
        status: r[8] || '', teamLead: r[10] || '',
        spentHrs: parseFloat(r[6]) || 0,
      });
    });

    res.json({
      totalEmployees: activeEmp.length, inProgress: inProg.length, completed: completed.length, totalProjects: projRows.filter((r) => r[0]).length,
      present, absent, leave, wfh, attendanceRate: activeEmp.length > 0 ? +((present / activeEmp.length) * 100).toFixed(1) : 0, hoursToday: +hoursToday.toFixed(1),
      projStatus, deptChart: Object.entries(depts).map(([name, value]) => ({ name, value })), activeProjects: inProg.slice(0, 6),
      recentAtt: attRows.filter((r) => r[0] && r[5]).slice(-8).reverse(),
      projStats, empEff, overallEff, totalLoggedHrs: +totalLoggedHrs.toFixed(1), totalPhSessions: validPhRows.length,
      ganttData,
      projTeamMap,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TEAM ANALYTICS ───────────────────────────────────────────────────────────

app.get('/api/team-analytics', async (req, res) => {
  try {
    const [phRows, empMapRows, projRows, empRows] = await Promise.all([
      getValues(SHEETS.PROJ_HOURS, 'A2:N2000'),
      getValues(SHEETS.EMP_MAP, 'A2:K2000'),
      getValues(SHEETS.PROJECTS, 'A2:M300'),
      getValues(SHEETS.EMPLOYEES, 'A2:O300'),
    ]);

    // Lookup maps
    const projMeta = {};
    projRows.forEach((r) => {
      if (!r[0]) return;
      projMeta[r[0]] = { projId: r[0], projName: r[1] || r[0], client: r[2] || '', status: r[3] || '', clientHrs: parseFloat(r[7]) || 0 };
    });

    const empMeta = {};
    // empLeadMap: empId → team lead from EMPLOYEES col 3 (general assignment)
    const empLeadMap = {};
    empRows.forEach((r) => {
      if (!r[0]) return;
      empMeta[r[0]] = { empId: r[0], empName: r[1] || r[0], dept: r[4] || '' };
      if (r[3]) empLeadMap[r[0]] = r[3];
    });

    // empProjLead[empId][projId] = leadName from EMP_MAP col 10, fallback to EMPLOYEES col 3
    const empProjLead = {};
    empMapRows.forEach((r) => {
      const empId = r[2], projId = r[4], lead = r[10] || empLeadMap[r[2]] || '';
      if (!empId || !projId) return;
      if (!empProjLead[empId]) empProjLead[empId] = {};
      empProjLead[empId][projId] = lead;
    });

    // Helper: resolve team lead with 3-tier priority
    // 1. EMP_MAP (per emp+project)  2. PROJ_HOURS stored col 13  3. EMPLOYEES general
    const resolveLead = (empId, projId, phLead) =>
      empProjLead[empId]?.[projId] || phLead || empLeadMap[empId] || '';

    // Aggregate PROJ_HOURS per employee+project; store the ph-level team lead from col 13
    const aggMap = {};
    phRows.filter((r) => r[2] && r[5]).forEach((r) => {
      const key = `${r[2]}|${r[5]}`;
      if (!aggMap[key]) aggMap[key] = { empId: r[2], empName: r[3] || r[2], projId: r[5], spent: 0, reqEff: 0, actEff: 0, phLead: r[13] || '' };
      aggMap[key].spent  += parseFloat(r[8])  || 0;
      aggMap[key].reqEff += parseFloat(r[9])  || 0;
      aggMap[key].actEff += parseFloat(r[10]) || 0;
      if (!aggMap[key].phLead && r[13]) aggMap[key].phLead = r[13];
    });

    // ── byProject ──────────────────────────────────────────────────────────────
    const projAgg = {};
    Object.values(aggMap).forEach(({ empId, empName, projId, spent, reqEff, actEff, phLead }) => {
      const meta = projMeta[projId] || { projId, projName: projId, client: '', status: '', clientHrs: 0 };
      const emp  = empMeta[empId]  || { empId, empName, dept: '' };
      const lead = resolveLead(empId, projId, phLead);
      if (!projAgg[projId]) projAgg[projId] = { ...meta, employees: {}, totalSpent: 0, totalReqEff: 0, totalActEff: 0 };
      projAgg[projId].totalSpent  += spent;
      projAgg[projId].totalReqEff += reqEff;
      projAgg[projId].totalActEff += actEff;
      projAgg[projId].employees[empId] = {
        empId, empName: emp.empName, dept: emp.dept, leadName: lead,
        spent: +spent.toFixed(2), reqEff: +reqEff.toFixed(2), actEff: +actEff.toFixed(2),
        empEff: reqEff > 0 ? +(actEff / reqEff).toFixed(4) : 0,
      };
    });

    const byProject = Object.values(projAgg).map((p) => {
      const empList = Object.values(p.employees);
      const empCount = empList.length;
      const clientHrsPerEmp = empCount > 0 && p.clientHrs > 0 ? +(p.clientHrs / empCount).toFixed(2) : 0;
      const projEff   = p.totalReqEff > 0 ? +(p.clientHrs / (p.totalReqEff / 60)).toFixed(4) : 0;
      const actualEff = p.totalSpent  > 0 ? +(p.clientHrs / (p.totalSpent / 60)).toFixed(4)  : 0;
      return {
        projId: p.projId, projName: p.projName, client: p.client, status: p.status, clientHrs: p.clientHrs,
        totalSpent: +p.totalSpent.toFixed(2), totalReqEff: +p.totalReqEff.toFixed(2), totalActEff: +p.totalActEff.toFixed(2),
        projEff, actualEff, empCount, clientHrsPerEmp,
        employees: empList.map((e) => ({ ...e, clientHrsShare: clientHrsPerEmp })).sort((a, b) => b.spent - a.spent),
      };
    }).sort((a, b) => b.totalSpent - a.totalSpent);

    // ── byLead ─────────────────────────────────────────────────────────────────
    const leadAgg = {};
    byProject.forEach((proj) => {
      proj.employees.forEach((emp) => {
        const lead = emp.leadName || '(Unassigned)';
        if (!leadAgg[lead]) leadAgg[lead] = { leadName: lead, projectMap: {}, employeeMap: {} };
        if (!leadAgg[lead].projectMap[proj.projId]) {
          leadAgg[lead].projectMap[proj.projId] = {
            projId: proj.projId, projName: proj.projName, status: proj.status, clientHrs: proj.clientHrs,
            spent: 0, reqEff: 0, actEff: 0, empIds: new Set(),
          };
        }
        const lp = leadAgg[lead].projectMap[proj.projId];
        lp.spent  += emp.spent;  lp.reqEff += emp.reqEff;  lp.actEff += emp.actEff;
        lp.empIds.add(emp.empId);
        if (!leadAgg[lead].employeeMap[emp.empId]) {
          leadAgg[lead].employeeMap[emp.empId] = { empId: emp.empId, empName: emp.empName, dept: emp.dept, spent: 0, reqEff: 0, actEff: 0 };
        }
        const le = leadAgg[lead].employeeMap[emp.empId];
        le.spent += emp.spent;  le.reqEff += emp.reqEff;  le.actEff += emp.actEff;
      });
    });

    const byLead = Object.values(leadAgg).map((lead) => {
      const projects = Object.values(lead.projectMap).map((p) => ({
        projId: p.projId, projName: p.projName, status: p.status, clientHrs: p.clientHrs,
        spent: +p.spent.toFixed(2), reqEff: +p.reqEff.toFixed(2), actEff: +p.actEff.toFixed(2),
        empCount: p.empIds.size,
        projEff:   p.reqEff > 0 ? +(p.clientHrs / (p.reqEff / 60)).toFixed(4) : 0,
        actualEff: p.spent  > 0 ? +(p.clientHrs / (p.spent / 60)).toFixed(4)  : 0,
      })).sort((a, b) => b.spent - a.spent);

      const employees = Object.values(lead.employeeMap).map((e) => ({
        empId: e.empId, empName: e.empName, dept: e.dept,
        spent: +e.spent.toFixed(2), reqEff: +e.reqEff.toFixed(2), actEff: +e.actEff.toFixed(2),
        avgEff: e.reqEff > 0 ? +(e.actEff / e.reqEff).toFixed(4) : 0,
      })).sort((a, b) => b.spent - a.spent);

      const totals = employees.reduce((t, e) => ({ spent: t.spent + e.spent, reqEff: t.reqEff + e.reqEff, actEff: t.actEff + e.actEff }), { spent: 0, reqEff: 0, actEff: 0 });
      const clientHrs = projects.reduce((s, p) => s + p.clientHrs, 0);
      return {
        leadName: lead.leadName, projects, employees,
        totals: { clientHrs, spent: +totals.spent.toFixed(2), reqEff: +totals.reqEff.toFixed(2), actEff: +totals.actEff.toFixed(2) },
      };
    }).sort((a, b) => b.totals.spent - a.totals.spent);

    // ── byEmployee ─────────────────────────────────────────────────────────────
    const empAgg = {};
    Object.values(aggMap).forEach(({ empId, empName, projId, spent, reqEff, actEff, phLead }) => {
      const emp  = empMeta[empId]  || { empId, empName, dept: '' };
      const proj = projMeta[projId] || { projId, projName: projId, client: '', status: '', clientHrs: 0 };
      const lead = resolveLead(empId, projId, phLead);
      if (!empAgg[empId]) empAgg[empId] = { empId, empName: emp.empName, dept: emp.dept, leadName: lead, projects: [] };
      empAgg[empId].projects.push({
        projId, projName: proj.projName, status: proj.status, clientHrs: proj.clientHrs,
        spent: +spent.toFixed(2), reqEff: +reqEff.toFixed(2), actEff: +actEff.toFixed(2),
        empEff: reqEff > 0 ? +(actEff / reqEff).toFixed(4) : 0,
      });
    });

    const byEmployee = Object.values(empAgg).map((e) => {
      const t = e.projects.reduce((s, p) => ({ spent: s.spent + p.spent, reqEff: s.reqEff + p.reqEff, actEff: s.actEff + p.actEff }), { spent: 0, reqEff: 0, actEff: 0 });
      return {
        ...e, projects: e.projects.sort((a, b) => b.spent - a.spent),
        totals: { spent: +t.spent.toFixed(2), reqEff: +t.reqEff.toFixed(2), actEff: +t.actEff.toFixed(2), avgEff: t.reqEff > 0 ? +(t.actEff / t.reqEff).toFixed(4) : 0 },
      };
    }).sort((a, b) => b.totals.spent - a.totals.spent);

    res.json({ byProject, byLead, byEmployee });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MONTH END SUMMARY ────────────────────────────────────────────────────────
function workingDaysInMonth(year, month, holidayDates) {
  const days = new Date(year, month + 1, 0).getDate();
  const holidays = holidayDates ? new Set(holidayDates) : new Set();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const day = new Date(year, month, d).getDay();
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (day !== 0 && day !== 6 && !holidays.has(ds)) count++;
  }
  return count;
}

app.get('/api/month-end-summary', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth();
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const holidayRows = await getValues(SHEETS.HOLIDAYS, 'A2:D2000');
    const holidayDates = holidayRows.filter((r) => r[1] && r[1].startsWith(String(year))).map((r) => r[1]);
    const wd = workingDaysInMonth(year, month, holidayDates);

    const [empRows, projRows, phRows] = await Promise.all([
      getValues(SHEETS.EMPLOYEES, 'A2:T300'),
      getValues(SHEETS.PROJECTS, 'A2:X300'),
      getValues(SHEETS.PROJ_HOURS, 'A2:N5000'),
    ]);

    const monthPhRows = phRows.filter((r) => r[1] && r[1].startsWith(prefix) && r[2] && r[5]);

    // ── Employee lookup ─────────────────────────────────────────────────
    const empMeta = {};
    empRows.forEach((r) => {
      if (!r[0]) return;
      empMeta[r[0]] = {
        name: r[1] || r[0], dept: r[4] || '', teamLead: r[3] || '',
        designation: r[5] || '', status: r[6] || 'Active',
        reqEffRatio: parseEffRatio(r[7]) || 0.75, workHrsDay: parseFloat(r[8]) || 8,
        experience: r[18] || '',
      };
    });

    // ── Project lookup ──────────────────────────────────────────────────
    const projMeta = {};
    projRows.forEach((r) => {
      if (!r[0]) return;
      projMeta[r[0]] = {
        name: r[1] || r[0], client: r[2] || '', status: r[3] || '',
        teamLead: r[4] || '', clientHrs: parseFloat(r[7]) || 0,
        cumulativeSpentHrs: parseFloat(r[8]) || 0,
        remainingHrs: parseFloat(r[12]),
      };
    });

    // ── Aggregate PROJ_HOURS per employee ───────────────────────────────
    const empAgg = {};
    monthPhRows.forEach((r) => {
      const id = r[2];
      if (!empAgg[id]) empAgg[id] = { empId: id, projs: {}, spent: 0, reqEff: 0, actEff: 0, sessions: 0 };
      empAgg[id].spent  += parseFloat(r[8]) || 0;
      empAgg[id].reqEff += parseFloat(r[9]) || 0;
      empAgg[id].actEff += parseFloat(r[10]) || 0;
      empAgg[id].sessions++;
      const pid = r[5];
      const sh = (parseFloat(r[8]) || 0) / 60;
      if (!empAgg[id].projs[pid]) empAgg[id].projs[pid] = 0;
      empAgg[id].projs[pid] += sh;
    });

    // ── Aggregate PROJ_HOURS per project ────────────────────────────────
    const projAgg = {};
    monthPhRows.forEach((r) => {
      const id = r[5];
      if (!projAgg[id]) projAgg[id] = { projId: id, spent: 0, reqEff: 0, actEff: 0, sessions: 0, emps: new Set() };
      projAgg[id].spent    += parseFloat(r[8]) || 0;
      projAgg[id].reqEff   += parseFloat(r[9]) || 0;
      projAgg[id].actEff   += parseFloat(r[10]) || 0;
      projAgg[id].sessions++;
      projAgg[id].emps.add(r[2]);
    });

    // ── Calculate client hours per employee (proportional allocation) ───
    const empClientHrs = {};
    Object.entries(projAgg).forEach(([pid, pa]) => {
      const pm = projMeta[pid];
      if (!pm || !pm.clientHrs) return;
      Object.entries(empAgg).forEach(([eid, ea]) => {
        const empSpentOnProj = ea.projs[pid] || 0; // already in hours
        if (empSpentOnProj <= 0) return;
        const totalProjSpent = pa.spent / 60; // convert minutes to hours
        if (totalProjSpent <= 0) return;
        const alloc = pm.clientHrs * (empSpentOnProj / totalProjSpent);
        empClientHrs[eid] = (empClientHrs[eid] || 0) + alloc;
      });
    });

    // ── Build employee summary ──────────────────────────────────────────
    const employeeSummary = empRows.filter((r) => r[0]).map((r) => {
      const id = r[0];
      const meta = empMeta[id];
      const agg = empAgg[id];
      const spentHrs = agg ? +(agg.spent / 60).toFixed(2) : 0;
      const targetHrs = +(meta.workHrsDay * meta.reqEffRatio * wd).toFixed(2);
      const clientHrs = +(empClientHrs[id] || 0).toFixed(2);
      return {
        empId: id, name: meta.name, dept: meta.dept,
        teamLead: meta.teamLead, designation: meta.designation,
        status: meta.status, reqEffRatio: meta.reqEffRatio,
        workHrsDay: meta.workHrsDay, targetHrs,
        spentHrs, reqEffHrs: agg ? +(agg.reqEff).toFixed(2) : 0,
        actEffHrs: agg ? +(agg.actEff).toFixed(2) : 0,
        clientHrs, sessions: agg ? agg.sessions : 0,
        achievedPct: targetHrs > 0 ? +((clientHrs / targetHrs) * 100).toFixed(1) : 0,
        gapHrs: +(targetHrs - clientHrs).toFixed(2),
        experience: meta.experience,
      };
    });

    // ── Build project summary ───────────────────────────────────────────
    const projectSummary = projRows.filter((r) => r[0]).map((r) => {
      const id = r[0];
      const pa = projAgg[id];
      const pm = projMeta[id];
      const monthSpentHrs = pa ? +(pa.spent / 60).toFixed(2) : 0;
      const monthReqEffHrs = pa ? +(pa.reqEff).toFixed(2) : 0;
      const monthActEffHrs = pa ? +(pa.actEff).toFixed(2) : 0;
      const monthRemaining = pm.clientHrs > 0 ? +(pm.clientHrs - pm.cumulativeSpentHrs).toFixed(2) : null;
      return {
        projId: id, projName: pm.name, client: pm.client,
        status: pm.status, teamLead: pm.teamLead,
        clientHrs: pm.clientHrs,
        cumulativeSpentHrs: pm.cumulativeSpentHrs,
        monthSpentHrs, monthReqEffHrs, monthActEffHrs,
        monthSessions: pa ? pa.sessions : 0,
        monthEmployees: pa ? pa.emps.size : 0,
        monthRemaining,
        monthEff: monthReqEffHrs > 0 ? +(monthActEffHrs / monthReqEffHrs).toFixed(4) : 0,
      };
    });

    // ── Next month carry-over data ──────────────────────────────────────
    const nextMonthProjects = projRows.filter((r) => {
      if (!r[0]) return false;
      const remaining = projMeta[r[0]].remainingHrs;
      return remaining !== null && remaining !== undefined && remaining > 0 && r[3] !== 'Completed';
    }).map((r) => {
      const pm = projMeta[r[0]];
      return {
        projId: r[0], projName: pm.name, client: pm.client,
        teamLead: pm.teamLead, clientHrs: pm.clientHrs,
        totalSpentToDate: pm.cumulativeSpentHrs,
        remainingClientHrs: pm.remainingHrs,
        status: pm.status,
      };
    });

    const nextMonthEmployees = empRows.filter((r) => r[0] && r[6] === 'Active').map((r) => {
      const m = empMeta[r[0]];
      return {
        empId: r[0], name: m.name, dept: m.dept,
        teamLead: m.teamLead, designation: m.designation,
        reqEffRatio: m.reqEffRatio, workHrsDay: m.workHrsDay,
        experience: m.experience,
      };
    });

    // ── Totals ──────────────────────────────────────────────────────────
    const totals = {
      totalSpentHrs: +projectSummary.reduce((s, p) => s + p.monthSpentHrs, 0).toFixed(2),
      totalClientHrs: +projectSummary.reduce((s, p) => s + p.clientHrs, 0).toFixed(2),
      totalRemainingHrs: +projectSummary.reduce((s, p) => s + (p.monthRemaining || 0), 0).toFixed(2),
    };

    res.json({ year, month, employeeSummary, projectSummary, nextMonthProjects, nextMonthEmployees, totals });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── BULK OPERATIONS ───────────────────────────────────────────────────────────

// Bulk update: update full rows for multiple sheet rows
app.post('/api/bulk-update', async (req, res) => {
  try {
    const { sheet, updates } = req.body; // updates: [{row: sheetRowNum, values: [...]}]
    const name = SHEETS[sheet.toUpperCase()];
    if (!name) return res.status(400).json({ error: 'Unknown sheet' });
    await sheetsApi.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates.map(({ row, values }) => ({ range: `${name}!A${row}:Z${row}`, values: [values] })),
      },
    });
    res.json({ success: true, count: updates.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk clear rows (soft-delete by clearing cell content)
app.post('/api/bulk-clear-rows', async (req, res) => {
  try {
    const { sheet, rows } = req.body; // rows: [sheetRowNum, ...]
    const name = SHEETS[sheet.toUpperCase()];
    if (!name) return res.status(400).json({ error: 'Unknown sheet' });
    await sheetsApi.spreadsheets.values.batchClear({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { ranges: rows.map((r) => `${name}!A${r}:Z${r}`) },
    });
    res.json({ success: true, count: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MIGRATE ───────────────────────────────────────────────────────────────────
app.post('/api/migrate', async (req, res) => {
  try {
    await ensureSheets();
    const wb = XLSX.readFile(EXCEL_FILE, { cellDates: true });
    const results = [];
    const migrations = [
      { xlSheet: '📋 EMPLOYEES', gsSheet: SHEETS.EMPLOYEES, headerRow: 1, cols: 13 },
      { xlSheet: '📁 PROJECTS', gsSheet: SHEETS.PROJECTS, headerRow: 1, cols: 14 },
      { xlSheet: '🔗 EMP-PROJECT MAP', gsSheet: SHEETS.EMP_MAP, headerRow: 1, cols: 10 },
      { xlSheet: '📊 ATT DATA STORE', gsSheet: SHEETS.ATT_STORE, headerRow: 2, cols: 14 },
      { xlSheet: '📝 PROJECT HOURS', gsSheet: SHEETS.PROJ_HOURS, headerRow: 4, cols: 14 },
      { xlSheet: '📝 EFFICIENCY LOG', gsSheet: SHEETS.EFF_LOG, headerRow: 4, cols: 12 },
    ];
    for (const m of migrations) {
      const ws = wb.Sheets[m.xlSheet];
      if (!ws) { results.push({ sheet: m.gsSheet, skipped: true }); continue; }
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
      const rows = raw.slice(m.headerRow - 1).map((r) => r.slice(0, m.cols).map((c) => (c == null ? '' : String(c)))).filter((r) => r.some((c) => c.trim() !== ''));
      if (rows.length) { await setValues(m.gsSheet, 'A1', rows); results.push({ sheet: m.gsSheet, rows: rows.length }); }
    }
    // Initialize SETTINGS with defaults
    const sett = await getValues(SHEETS.SETTINGS, 'A1:D1');
    if (!sett.length || !sett[0][0]) {
      await setValues(SHEETS.SETTINGS, 'A1', DEFAULT_SETTINGS_ROWS);
    }
    // Reset ATTENDANCE with new headers
    await clearRange(SHEETS.ATTENDANCE, 'A1:N5000');
    await setValues(SHEETS.ATTENDANCE, 'A1', [ATT_HEADERS]);
    results.push({ sheet: 'ATTENDANCE', note: 'reset with new multi-session schema' });
    _settCache = null;
    res.json({ success: true, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clear/:sheet', async (req, res) => {
  try {
    const name = SHEETS[req.params.sheet.toUpperCase()];
    if (!name) return res.status(400).json({ error: 'Unknown sheet' });
    await clearRange(name);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clear-all', async (req, res) => {
  try { await Promise.all(Object.values(SHEETS).map((n) => clearRange(n))); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Setup / Reset Sheet Templates ─────────────────────────────────────────────
const SHEET_HEADERS = {
  [SHEETS.EMPLOYEES]: { cols: 19, headers: ['EMP ID', 'Full Name', 'Short Name', 'Team Lead', 'Department', 'Designation', 'Status', 'Req Eff Ratio', 'Work Hours/Day', 'Phone', 'Email', 'Join Date', 'Remarks', 'Shift', 'Week Off', 'Rot Off Day 1', 'Rot Off Day 2', 'Rot Off Enabled', 'Experience'] },
  [SHEETS.PROJECTS]: { cols: 24, headers: PROJ_HEADERS_NEW },
  [SHEETS.EMP_MAP]: { cols: 11, headers: ['Map ID', 'Employee Name', 'EMP ID', 'Project Name', 'Proj ID', 'Role', 'Spent Hrs', 'Eff Ratio', 'Status', 'Proj Eff', 'Team Lead'] },
  [SHEETS.ATTENDANCE]: { cols: 14, headers: ['Date', 'EMP ID', 'Employee Name', 'Dept', 'Day Status', 'Proj ID', 'Project Name', 'Login Time', 'Logout Time', 'Hrs Worked', 'OT Hrs', 'Session', 'Remarks', 'Act Eff Hrs'] },
  [SHEETS.ATT_STORE]: { cols: 14, headers: ['Date', 'EMP ID', 'Employee Name', 'Dept', 'Day Status', 'Proj ID', 'Project Name', 'Login Time', 'Logout Time', 'Hrs Worked', 'OT Hrs', 'Session', 'Remarks', 'Act Eff Hrs'] },
  [SHEETS.PROJ_HOURS]: { cols: 14, headers: ['Entry#', 'Date', 'EMP ID', 'Employee Name', 'Dept', 'Proj ID', 'Project Name', 'Client', 'Hrs Worked', 'Req Eff Hrs', 'Act Eff Hrs', 'Eff Ratio', 'Remarks', 'Team Lead'] },
  [SHEETS.EFF_LOG]: { cols: 12, headers: ['Entry#', 'Date', 'EMP ID', 'Employee Name', 'Dept', 'Proj ID', 'Project Name', 'Hrs Worked', 'Req Eff Hrs', 'Act Eff Hrs', 'Eff Ratio', 'Remarks'] },
  [SHEETS.QAQC]: { cols: 11, headers: QAQC_HEADERS },
  [SHEETS.FEEDBACK]: { cols: 12, headers: FEEDBACK_HEADERS },
  [SHEETS.INT_FB]: { cols: 11, headers: INT_FB_HEADERS },
  [SHEETS.DIV_TARGETS]: { cols: 6, headers: ['Entry#', 'Year', 'Month', 'Team Lead', 'Target Hrs', 'Updated At'] },
  [SHEETS.SETTINGS]: { cols: 4, headers: ['Category', 'Key', 'Value', 'Description'] },
};

app.post('/api/setup', async (req, res) => {
  try {
    const ss = await sheetsApi.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const existingTabs = ss.data.sheets.map((s) => s.properties.title);
    const report = [];

    // Step 1 — ensure all sheet tabs exist
    const missing = Object.values(SHEETS).filter((n) => !existingTabs.includes(n));
    if (missing.length) {
      await sheetsApi.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
      });
      report.push({ step: 'tabs', detail: `Created missing sheets: ${missing.join(', ')}` });
    }

    // Step 2 — check & write headers for each sheet
    for (const [sheetKey, config] of Object.entries(SHEET_HEADERS)) {
      const tabName = SHEETS[sheetKey] || sheetKey;
      const existing = await getValues(tabName, 'A1:Z1');
      const hasHeaders = existing.length > 0 && existing[0].length > 0 && existing[0].some((c) => c);
      const letter = String.fromCharCode(64 + config.cols);

      if (!hasHeaders) {
        await setValues(tabName, 'A1', [config.headers]);
        report.push({ step: 'headers', detail: `${tabName}: wrote headers (${config.cols} cols)` });
      }

      // Step 3 — for SETTINGS, restore defaults if data rows are empty
      if (tabName === SHEETS.SETTINGS) {
        const dataRows = await getValues(tabName, 'A2:D500');
        if (!dataRows.length || !dataRows.some((r) => r[0])) {
          await clearRange(tabName, 'A2:Z500');
          const defaultData = DEFAULT_SETTINGS_ROWS.slice(1);
          if (defaultData.length) {
            await setValues(tabName, `A2`, defaultData);
            report.push({ step: 'data', detail: 'SETTINGS: restored default rows' });
          }
        }
      }

      // Step 4 — for ATTENDANCE, ensure it starts with headers only (clear data if no headers existed)
      if (tabName === SHEETS.ATTENDANCE && !hasHeaders) {
        await clearRange(tabName, 'A2:Z5000');
        report.push({ step: 'cleanup', detail: 'ATTENDANCE: data range cleared' });
      }
    }

    _settCache = null;
    res.json({ success: true, report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Export All Sheets to Excel ────────────────────────────────────────────────
app.get('/api/export', async (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const sheets = [
      { key: SHEETS.EMPLOYEES, name: 'EMPLOYEES' },
      { key: SHEETS.PROJECTS, name: 'PROJECTS' },
      { key: SHEETS.EMP_MAP, name: 'EMP_MAP' },
      { key: SHEETS.ATTENDANCE, name: 'ATTENDANCE' },
      { key: SHEETS.ATT_STORE, name: 'ATT_STORE' },
      { key: SHEETS.PROJ_HOURS, name: 'PROJ_HOURS' },
      { key: SHEETS.EFF_LOG, name: 'EFF_LOG' },
      { key: SHEETS.QAQC, name: 'QAQC_PROJECTS' },
      { key: SHEETS.FEEDBACK, name: 'FEEDBACK_PROJECTS' },
      { key: SHEETS.DIV_TARGETS, name: 'DIV_TARGETS' },
      { key: SHEETS.SETTINGS, name: 'SETTINGS' },
    ];
    for (const { key, name } of sheets) {
      const rows = await getValues(key, 'A1:Z5000');
      if (rows.length) {
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, name);
      }
    }
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const date = todayStr();
    res.setHeader('Content-Disposition', `attachment; filename="scan2bim-backup-${date}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Backup ────────────────────────────────────────────────────────────────────
const { Readable } = require('stream');
let lastBackupInfo = { date: null, status: null, fileName: null, time: null, error: null };

async function getDriveFolder(name, parentId) {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const list = await driveApi.files.list({ q, fields: 'files(id,name)', supportsAllDrives: true, includeItemsFromAllDrives: true });
  if (list.data.files.length) return list.data.files[0].id;
  const folder = await driveApi.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id', supportsAllDrives: true,
  });
  return folder.data.id;
}

async function runBackup() {
  const today = todayStr();
  try {
    lastBackupInfo = { ...lastBackupInfo, status: 'running', date: today };

    // Build XLSX from all sheets
    const wb = XLSX.utils.book_new();
    for (const sheetName of Object.values(SHEETS)) {
      try {
        const data = await getValues(sheetName, 'A1:Z5000');
        const ws = XLSX.utils.aoa_to_sheet(data.length ? data : [[]]);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      } catch { /* skip missing sheet */ }
    }
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Month folder name e.g. "May 2026"
    const now = new Date();
    const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const monthFolderId = await getDriveFolder(monthName, BACKUP_FOLDER_ID);

    const fileName = `Scan2BIM_${today}.xlsx`;

    // Overwrite if file already exists
    const existing = await driveApi.files.list({
      q: `name='${fileName}' and '${monthFolderId}' in parents and trashed=false`,
      fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    if (existing.data.files.length) {
      await driveApi.files.update({
        fileId: existing.data.files[0].id,
        media: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: Readable.from(buffer) },
        supportsAllDrives: true,
      });
    } else {
      await driveApi.files.create({
        requestBody: { name: fileName, parents: [monthFolderId] },
        media: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: Readable.from(buffer) },
        fields: 'id', supportsAllDrives: true,
      });
    }

    lastBackupInfo = { date: today, status: 'success', fileName, time: new Date().toISOString(), error: null };
    console.log(`Backup complete: ${fileName}`);
  } catch (e) {
    lastBackupInfo = { date: today, status: 'error', fileName: null, time: new Date().toISOString(), error: e.message };
    console.error('Backup failed:', e.message);
  }
}

function scheduleBackup() {
  const checkAndRun = () => {
    const today = todayStr();
    if (lastBackupInfo.date !== today || lastBackupInfo.status === 'error') {
      runBackup().catch(console.error);
    }
  };
  setTimeout(checkAndRun, 30 * 1000);           // run 30 s after startup
  setInterval(checkAndRun, 60 * 60 * 1000);     // re-check every hour
}

app.get('/api/backup/status', requireAuth, (req, res) => {
  res.json(lastBackupInfo);
});

app.post('/api/backup', requireAuth, async (req, res) => {
  if (lastBackupInfo.status === 'running') return res.status(409).json({ error: 'Backup already running' });
  runBackup().catch(console.error);             // non-blocking
  res.json({ message: 'Backup started' });
});

// GET /api/backup/list — list all backup files organized by month folder
app.get('/api/backup/list', requireAuth, async (req, res) => {
  try {
    // 1. List all month folders in the backup root
    const foldersRes = await driveApi.files.list({
      q: `'${BACKUP_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name,createdTime)',
      supportsAllDrives: true, includeItemsFromAllDrives: true,
      orderBy: 'name desc',
    });
    const months = [];
    for (const folder of foldersRes.data.files || []) {
      // 2. List backup files in each month folder
      const filesRes = await driveApi.files.list({
        q: `'${folder.id}' in parents and name contains 'Scan2BIM_' and trashed=false`,
        fields: 'files(id,name,size,createdTime,modifiedTime,webContentLink)',
        supportsAllDrives: true, includeItemsFromAllDrives: true,
        orderBy: 'name desc',
      });
      const files = (filesRes.data.files || []).map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size ? parseInt(f.size) : 0,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        downloadUrl: `/api/backup/download/${f.id}`,
      }));
      if (files.length > 0) {
        months.push({ id: folder.id, name: folder.name, files });
      }
    }
    res.json({ success: true, months });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/backup/download/:fileId — download a single backup file
app.get('/api/backup/download/:fileId', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const meta = await driveApi.files.get({
      fileId,
      fields: 'name,mimeType',
      supportsAllDrives: true,
    });
    const stream = await driveApi.files.get({
      fileId,
      alt: 'media',
      supportsAllDrives: true,
    }, { responseType: 'stream' });
    res.setHeader('Content-Disposition', `attachment; filename="${meta.data.name}"`);
    res.setHeader('Content-Type', meta.data.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    stream.data.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Experience Auto-Sync ──────────────────────────────────────────────────────
let lastExpSyncMonth = null;

async function syncEmployeeExperience() {
  const settings = await fetchSettings();
  const rows = await getValues(SHEETS.EMPLOYEES, 'A2:S300');
  if (!rows.length) return { updated: 0 };

  const updates = [];
  rows.forEach((row, i) => {
    const joinDate = (row[11] || '').trim();
    const expStr = (row[18] || '').trim();
    let months = null;
    let newJoinDate = joinDate;
    // If join date exists, calculate experience from it (auto-increments each month)
    if (joinDate) {
      months = calcExpMonths(joinDate);
    }
    // If no join date but experience exists, derive months and fill join date
    if (months === null && expStr) {
      const parts = expStr.split(':');
      if (parts.length === 2) {
        const y = parseInt(parts[0]), m = parseInt(parts[1]);
        if (!isNaN(y) && !isNaN(m)) {
          months = y * 12 + m;
          newJoinDate = expToJoinDate(y, m);
        }
      }
    }
    if (months === null) return;

    const newExp = expToYymm(months);
    const entry = getMatrixForExp(months, settings.prodMatrix);
    const newRatio = entry && entry.max > 0 ? parseFloat((entry.max / 0.08).toFixed(1)) : null;

    const oldExp = row[18] || '';
    const oldRatio = parseFloat(row[7] || 0);
    const expChanged = oldExp !== newExp;
    const ratioChanged = newRatio !== null && Math.abs(oldRatio - newRatio) > 0.05;
    const joinDateChanged = newJoinDate !== joinDate;

    if (expChanged || ratioChanged || joinDateChanged) {
      const newRow = [...row];
      while (newRow.length < 19) newRow.push('');
      newRow[18] = newExp;
      if (newRatio !== null) newRow[7] = String(newRatio);
      if (joinDateChanged) newRow[11] = newJoinDate;
      updates.push({ sheetRow: i + 2, values: newRow });
    }
  });

  if (updates.length) {
    const batchUpdates = updates.map(({ sheetRow, values }) => ({
      range: `A${sheetRow}:S${sheetRow}`,
      values: [values],
    }));
    await setValuesBatch(SHEETS.EMPLOYEES, batchUpdates);
  }
  return { updated: updates.length };
}

function scheduleExpSync() {
  const checkAndRun = () => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
    if (lastExpSyncMonth !== monthKey) {
      syncEmployeeExperience()
        .then((r) => { lastExpSyncMonth = monthKey; console.log(`Exp sync: ${r.updated} rows updated`); })
        .catch((e) => console.warn('Exp sync warning:', e.message));
    }
  };
  setTimeout(checkAndRun, 90 * 1000);            // 90 s after startup
  setInterval(checkAndRun, 12 * 60 * 60 * 1000); // re-check every 12 hours
}

// ── Static (production) ───────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production' && !process.env.NETLIFY) {
  const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// ── Health & Ping ────────────────────────────────────────────────────────────
app.get('/api/ping', async (req, res) => {
  if (process.env.NETLIFY) {
    try {
      const ss = await sheetsApi.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      res.json({ status: 'ok', spreadsheetId: SPREADSHEET_ID, title: ss.data.properties?.title || 'Untitled' });
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  } else {
    res.json({ status: 'ok' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const ss = await sheetsApi.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const title = ss.data.properties?.title || 'Untitled';
    res.json({ status: 'connected', spreadsheetId: SPREADSHEET_ID, title, sheetCount: ss.data.sheets?.length || 0 });
  } catch (e) {
    res.json({ status: 'disconnected', spreadsheetId: SPREADSHEET_ID, error: e.message });
  }
});

// ── OpenRouter key proxy ──────────────────────────────────────────────────────
// Serves the API key at runtime so it works from Netlify env vars (no rebuild needed)
app.get('/api/openrouter-key', (req, res) => {
  res.json({ key: process.env.VITE_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '' });
});

// ── Ollama proxy ──────────────────────────────────────────────────────────────
// Proxies Ollama requests through the server to avoid CORS on deployed sites
const http = require('http');

function ollamaProxy(req, res) {
  const host = req.query.host || 'http://localhost:11434';
  const target = host.replace(/\/+$/, '');
  const path = req.params[0] || '';

  const options = {
    hostname: new URL(target).hostname,
    port: new URL(target).port || 11434,
    path: '/' + path,
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      'Transfer-Encoding': 'chunked',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    res.status(502).json({ error: 'Ollama unreachable' });
  });

  if (req.method !== 'GET' && req.body) {
    proxyReq.write(JSON.stringify(req.body));
  }
  proxyReq.end();
}

app.get('/api/ollama/proxy/*', ollamaProxy);
app.post('/api/ollama/proxy/*', ollamaProxy);

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => console.log(`API → http://0.0.0.0:${PORT}`));
}


// ── REPORTS (Excel Downloads) ────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/reports/download/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const wb = XLSX.utils.book_new();

    const pct = (v, d) => (v !== '' && v != null && !isNaN(v) ? (+v * 100).toFixed(0) + '%' : d || '');

    // ══ Date range filtering ════════════════════════════════════════════════
    const { from, to, preview } = req.query;
    const hasDateFilter = from || to;
    const isPreview = preview === 'true';

    const [projRows, { map: rawHoursMap, rows: phRowsRaw }, empRows] = await Promise.all([
      getValues(SHEETS.PROJECTS, 'A2:X300'),
      computeProjectHours(),
      getValues(SHEETS.EMPLOYEES, 'A2:S300'),
    ]);

    // Apply date range filter to phRows if specified
    const phRows = hasDateFilter
      ? phRowsRaw.filter((r) => {
          const d = r[1];
          if (!d) return false;
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        })
      : phRowsRaw;

    // Rebuild hoursMap from filtered rows
    const hoursMap = hasDateFilter
      ? (() => {
          const m = {};
          phRows.filter((r) => r[5] && r[8]).forEach((r) => {
            const pid = r[5];
            if (!m[pid]) m[pid] = { spent: 0, reqEff: 0, actEff: 0 };
            m[pid].spent  += parseFloat(r[8]) || 0;
            m[pid].reqEff += parseFloat(r[9]) || 0;
            m[pid].actEff += parseFloat(r[10]) || 0;
          });
          return m;
        })()
      : rawHoursMap;

    const empRatioMap = {};
    empRows.forEach((r) => { if (r[0]) { empRatioMap[r[0]] = parseEffRatio(r[7]) || 0.75; } });

    const projMeta = {};
    projRows.forEach((r) => {
      if (!r[0]) return;
      projMeta[r[0]] = { lead: r[4] || '', clientHrs: parseFloat(r[7]) || 0 };
    });

    // Append date range to filename if filtered
    const dateSuffix = hasDateFilter ? ` (${from || '…'} – ${to || '…'})` : '';

    let previewHeaders, previewRows;

    function aggregateByLead(phFilter) {
      const leadAgg = {};
      phRows.filter(phFilter).forEach((ph) => {
        const projId = ph[5];
        const hrs = parseFloat(ph[8]) || 0;
        const re = parseFloat(ph[9]) || 0;
        const ae = parseFloat(ph[10]) || 0;
        const baseId = isDerivedProjId(projId) ? baseFromDerived(projId) : projId;
        const meta = projMeta[baseId] || { lead: '(Unassigned)', clientHrs: 0 };
        if (!leadAgg[meta.lead]) {
          leadAgg[meta.lead] = { leadName: meta.lead, clientHrs: 0, spent: 0, reqEff: 0, actEff: 0, seenProjs: {} };
        }
        const l = leadAgg[meta.lead];
        l.spent += hrs;
        l.reqEff += re;
        l.actEff += ae;
        if (!l.seenProjs[baseId]) {
          l.seenProjs[baseId] = true;
          l.clientHrs += meta.clientHrs;
        }
      });
      return Object.values(leadAgg).map((l) => ({
        leadName: l.leadName,
        clientHrs: +l.clientHrs.toFixed(2),
        spent: +l.spent.toFixed(2),
        reqEff: +l.reqEff.toFixed(2),
        actEff: +l.actEff.toFixed(2),
        actualEff: l.spent > 0 ? +(l.clientHrs / l.spent).toFixed(4) : 0,
        expEff: l.reqEff > 0 ? +(l.clientHrs / l.reqEff).toFixed(4) : 0,
      })).sort((a, b) => b.spent - a.spent);
    }

    if (type === 'project') {
      const rows = [];
      projRows.forEach((r, i) => {
        if (!r[0]) return;
        const ph  = hoursMap[r[0]]              || { spent: 0, reqEff: 0, actEff: 0 };
        const qc  = hoursMap[r[0]+'-QC']        || { spent: 0, reqEff: 0, actEff: 0 };
        const fi  = hoursMap[r[0]+'-FB-Int']    || { spent: 0, reqEff: 0, actEff: 0 };
        const fc  = hoursMap[r[0]+'-FB-Client'] || { spent: 0, reqEff: 0, actEff: 0 };
        const sp  = ph.spent + qc.spent + fi.spent + fc.spent;
        const re  = ph.reqEff + qc.reqEff + fi.reqEff + fc.reqEff;
        const ae  = ph.actEff + qc.actEff + fi.actEff + fc.actEff;
        const ch  = parseFloat(r[7]) || 0;
        rows.push([i+1, r[1]||'', r[3]||'', r[2]||'', ch||0,
          +sp.toFixed(2), +re.toFixed(2), +ae.toFixed(2),
          pct(sp>0?+(ch/sp).toFixed(4):0), pct(re>0?+(ch/re).toFixed(4):0), r[4]||'']);
      });
      previewHeaders = ['S.No','Project Name','Status','Client','Hrs From Client','Total Spent Time','Req Eff Time','Act Eff Time','Project Actual Efficiency','Efficiency (Exp)','Leading Person'];
      previewRows = rows;
      if (isPreview) return res.json({ headers: previewHeaders, rows: previewRows });
      const ws = XLSX.utils.aoa_to_sheet([previewHeaders, ...rows]);
      ws['!cols'] = [{wch:5},{wch:32},{wch:14},{wch:12},{wch:14},{wch:16},{wch:14},{wch:14},{wch:24},{wch:22},{wch:16}];
      XLSX.utils.book_append_sheet(wb, ws, 'Project Report');
    } else if (type === 'qaqc') {
      const rows = [];
      projRows.forEach((r, i) => {
        if (!r[0] || r[20] !== 'Yes') return;
        const qc  = hoursMap[r[0]+'-QC'] || { spent: 0, reqEff: 0, actEff: 0 };
        const ch  = parseFloat(r[7]) || 0;
        const sp  = qc.spent;
        const ae  = qc.actEff;
        const did = r[0]+'-QC';
        let er = 0;
        phRows.filter(p=>p[5]===did&&p[2]).forEach(p=>{er+=(parseFloat(p[8])||0)*(empRatioMap[p[2]]||0.75);});
        rows.push([i+1, r[1]||'', r[3]||'', r[2]||'', ch||0,
          +sp.toFixed(2), +er.toFixed(2), +ae.toFixed(2),
          pct(sp>0?+((ch/sp)/10).toFixed(4):0), pct(er>0?+((ch/er)/10).toFixed(4):0), r[21]||r[4]||'']);
      });
      previewHeaders = ['S.No','Project Name','Status','Client','Hrs From Client','Total Spent Time','Req Eff Time','Act Eff Time','Project Actual Efficiency','Efficiency (Exp)','Leading Person'];
      previewRows = rows;
      if (isPreview) return res.json({ headers: previewHeaders, rows: previewRows });
      const ws = XLSX.utils.aoa_to_sheet([previewHeaders, ...rows]);
      ws['!cols'] = [{wch:5},{wch:32},{wch:14},{wch:12},{wch:14},{wch:16},{wch:14},{wch:14},{wch:24},{wch:22},{wch:16}];
      XLSX.utils.book_append_sheet(wb, ws, 'QAQC Report');
    } else if (type === 'feedback') {
      const rows = [];
      projRows.forEach((r, i) => {
        if (!r[0] || r[18] !== 'Yes') return;
        const fc  = hoursMap[r[0]+'-FB-Client'] || { spent: 0, reqEff: 0, actEff: 0 };
        const ch  = parseFloat(r[7]) || 0;
        const sp  = fc.spent;
        const ae  = fc.actEff;
        const did = r[0]+'-FB-Client';
        let er = 0;
        phRows.filter(p=>p[5]===did&&p[2]).forEach(p=>{er+=(parseFloat(p[8])||0)*(empRatioMap[p[2]]||0.75);});
        rows.push([i+1, r[1]||'', r[3]||'', r[2]||'', ch||0,
          +sp.toFixed(2), +er.toFixed(2), +ae.toFixed(2),
          pct(sp>0?+(sp/ch).toFixed(4):0), pct(er>0?+(er/ch).toFixed(4):0), r[23]||r[4]||'']);
      });
      previewHeaders = ['S.No','Project Name','Status','Client','Hrs From Client','Total Spent Time','Req Eff Time','Act Eff Time','Project Actual Efficiency','Efficiency (Exp)','Leading Person'];
      previewRows = rows;
      if (isPreview) return res.json({ headers: previewHeaders, rows: previewRows });
      const ws = XLSX.utils.aoa_to_sheet([previewHeaders, ...rows]);
      ws['!cols'] = [{wch:5},{wch:32},{wch:14},{wch:12},{wch:14},{wch:16},{wch:14},{wch:14},{wch:24},{wch:22},{wch:16}];
      XLSX.utils.book_append_sheet(wb, ws, 'Feedback Report');
    } else if (type === 'production-efficiency') {
      const leads = aggregateByLead(p=>p[2]&&p[5]&&!isDerivedProjId(p[5]));
      previewHeaders = ['Lead','Hrs From Client','Total Spent Time','Req Eff Time','Act Eff Time','Actual Efficiency','Efficiency as per experience'];
      previewRows = leads.map(l=>[l.leadName,l.clientHrs,l.spent,l.reqEff,l.actEff,pct(l.actualEff),pct(l.expEff)]);
      if (isPreview) return res.json({ headers: previewHeaders, rows: previewRows });
      const ws = XLSX.utils.aoa_to_sheet([previewHeaders, ...previewRows]);
      ws['!cols'] = [{wch:20},{wch:14},{wch:16},{wch:14},{wch:14},{wch:18},{wch:26}];
      XLSX.utils.book_append_sheet(wb, ws, 'Production Efficiency');
    } else if (type === 'qc-efficiency') {
      const leads = aggregateByLead(p=>p[2]&&p[5]&&p[5].endsWith('-QC'));
      previewHeaders = ['Lead','Hrs From Client','Total Spent Time','Req Eff Time','Act Eff Time','Actual Efficiency','Efficiency as per experience'];
      previewRows = leads.map(l=>[l.leadName,l.clientHrs,l.spent,l.reqEff,l.actEff,pct((l.actualEff||0)/10),pct((l.expEff||0)/10)]);
      if (isPreview) return res.json({ headers: previewHeaders, rows: previewRows });
      const ws = XLSX.utils.aoa_to_sheet([previewHeaders, ...previewRows]);
      ws['!cols'] = [{wch:20},{wch:14},{wch:16},{wch:14},{wch:14},{wch:18},{wch:26}];
      XLSX.utils.book_append_sheet(wb, ws, 'QC Efficiency');
    } else if (type === 'feedback-efficiency') {
      const leads = aggregateByLead(p=>p[2]&&p[5]&&p[5].endsWith('-FB-Client'));
      previewHeaders = ['Lead','Hrs From Client','Total Spent Time','Req Eff Time','Act Eff Time','Actual Efficiency','Efficiency as per experience'];
      previewRows = leads.map(l=>[l.leadName,l.clientHrs,l.spent,l.reqEff,l.actEff,pct(l.spent>0?l.spent/l.clientHrs:0),pct(l.reqEff>0?l.reqEff/l.clientHrs:0)]);
      if (isPreview) return res.json({ headers: previewHeaders, rows: previewRows });
      const ws = XLSX.utils.aoa_to_sheet([previewHeaders, ...previewRows]);
      ws['!cols'] = [{wch:20},{wch:14},{wch:16},{wch:14},{wch:14},{wch:18},{wch:26}];
      XLSX.utils.book_append_sheet(wb, ws, 'Feedback Efficiency');
    } else {
      return res.status(400).json({ error: 'Unknown report type.' });
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const names = { project: 'Project_Report', qaqc: 'QAQC_Report', feedback: 'Feedback_Report', 'production-efficiency': 'Production_Efficiency', 'qc-efficiency': 'QC_Efficiency', 'feedback-efficiency': 'Feedback_Efficiency' };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const baseName = names[type] || 'Report';
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}${dateSuffix}.xlsx"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


module.exports = app;

// ─────────────────────────────────────────────────────────────────────────────