# Google Sheets Integration

This project uses the Google Sheets API v4 via the `googleapis` Node.js SDK to store all operational data. Below is a reference of every API method used and how it maps to the application's functionality.

## Sheet Structure (8 sheets)

| Sheet | Columns | Description |
|-------|---------|-------------|
| `EMPLOYEES` | 15 | EMP ID, Full Name, Short Name, Team Lead, Department, Designation, Status, Req Eff Ratio, Work Hours/Day, Phone, Email, Join Date, Remarks, Shift, Week Off |
| `PROJECTS` | 13 | Proj ID, Project Name, Client, Status, Team Lead, Start, End, Client Hrs, Total Spent Hrs, Req Eff Hrs, Act Eff Hrs, Proj Eff Ratio, Remarks |
| `EMP_MAP` | 11 | Map ID, Employee Name, EMP ID, Project Name, Proj ID, Role, Spent Hrs, Eff Ratio, Status, Proj Eff, Team Lead |
| `ATTENDANCE` | 13 | Date, EMP ID, Employee Name, Dept, Day Status, Proj ID, Project Name, Login Time, Logout Time, Hrs Worked, OT Hrs, Session, Remarks |
| `ATT_STORE` | 13 | Same schema as ATTENDANCE (historical archive) |
| `PROJ_HOURS` | 13 | Entry#, Date, EMP ID, Employee Name, Dept, Proj ID, Project Name, Client, Hrs Worked, Req Eff Hrs, Act Eff Hrs, Eff Ratio, Remarks |
| `EFF_LOG` | 12 | Entry#, Date, EMP ID, Employee Name, Dept, Proj ID, Project Name, Hrs Worked, Req Eff Hrs, Act Eff Hrs, Eff Ratio, Remarks |
| `SETTINGS` | 4 | Category, Key, Value, Description — holds shifts, weekoffs, depts, designations, roles, statuses, att codes |

## Auth

```js
const auth = new google.auth.GoogleAuth({
  keyFile: 'path/to/service-account-key.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheetsApi = google.sheets({ version: 'v4', auth });
```

Uses a Google Service Account with the `https://www.googleapis.com/auth/spreadsheets` scope (read/write).

## API Methods Used

### 1. `spreadsheets.values.get` — Read cell ranges

**SDK:** `sheetsApi.spreadsheets.values.get()`

**HTTP:** `GET https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}`

Used in every page to fetch data:

```js
// Fetch full sheet (with header row)
const rows = await getValues('EMPLOYEES', 'A1:O300');

// Fetch data rows only (skip header)
const rows = await getValues('EMPLOYEES', 'A2:O300');

// Fetch a single column (for ID generation)
const rows = await getValues('EMP_MAP', 'A2:A300');

// Check if a row has content
const existing = await getValues('SETTINGS', 'A1:D1');
```

**Helper:**
```js
async function getValues(sheet, range) {
  const res = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheet}!${range}`
  });
  return res.data.values || [];
}
```

---

### 2. `spreadsheets.values.update` — Write cell ranges

**SDK:** `sheetsApi.spreadsheets.values.update()`

**HTTP:** `PUT https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}`

Used for updating a specific row or writing headers:

```js
// Update a single employee row (cols A-O)
await setValues('EMPLOYEES', 'A5:O5', [[empId, name, ...]]);

// Write headers to row 1
await setValues('EMPLOYEES', 'A1', [['EMP ID', 'Full Name', ...]]);

// Write entire settings data (clears + rewrites)
await setValues('SETTINGS', 'A1', [['Category', 'Key', 'Value', 'Description'], ...rows]);

// Update a single cell (day status in attendance)
await sheetsApi.spreadsheets.values.update({
  spreadsheetId: SPREADSHEET_ID,
  range: 'ATTENDANCE!E15',
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [['P']] },
});
```

**Helpers:**
```js
async function setValues(sheet, range, values) {
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheet}!${range}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}
```

---

### 3. `spreadsheets.values.append` — Append rows

**SDK:** `sheetsApi.spreadsheets.values.append()`

**HTTP:** `POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}:append`

Used for creating new records at the end of a sheet:

```js
// Add a new employee
await appendRows('EMPLOYEES', [['EMP001', 'John Doe', ...]]);

// Assign an employee to a project
await appendRows('EMP_MAP', [['MAP001', 'John Doe', 'EMP001', ...]]);

// Log an attendance session
await appendRows('ATTENDANCE', [[date, empId, empName, ...]]);
```

**Important:** `insertDataOption: 'INSERT_ROWS'` shifts existing rows down.

**Helper:**
```js
async function appendRows(sheet, values) {
  await sheetsApi.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheet}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}
```

---

### 4. `spreadsheets.values.batchUpdate` — Bulk row updates

**SDK:** `sheetsApi.spreadsheets.values.batchUpdate()`

**HTTP:** `POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values:batchUpdate`

Used for updating multiple rows in one request:

```js
// Update status for 10 employees at once
await sheetsApi.spreadsheets.values.batchUpdate({
  spreadsheetId: SPREADSHEET_ID,
  requestBody: {
    valueInputOption: 'USER_ENTERED',
    data: [
      { range: 'EMPLOYEES!A5:O5', values: [['EMP001', ...]] },
      { range: 'EMPLOYEES!A12:O12', values: [['EMP002', ...]] },
    ],
  },
});
```

**Endpoint:** `POST /api/bulk-update` — accepts `{ sheet, updates: [{ row, values }] }`

---

### 5. `spreadsheets.values.batchClear` — Bulk row deletion

**SDK:** `sheetsApi.spreadsheets.values.batchClear()`

**HTTP:** `POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values:batchClear`

Used for clearing multiple rows:

```js
await sheetsApi.spreadsheets.values.batchClear({
  spreadsheetId: SPREADSHEET_ID,
  requestBody: {
    ranges: ['EMPLOYEES!A5:Z5', 'EMPLOYEES!A12:Z12'],
  },
});
```

**Endpoint:** `POST /api/bulk-clear-rows` — accepts `{ sheet, rows: [sheetRowNum, ...] }`

---

### 6. `spreadsheets.values.clear` — Clear a range

**SDK:** `sheetsApi.spreadsheets.values.clear()`

**HTTP:** `POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}:clear`

Used for wiping entire sheets or single rows:

```js
// Clear all data rows (preserve header)
await clearRange('EMPLOYEES', 'A2:Z5000');

// Clear a single session row
await sheetsApi.spreadsheets.values.clear({
  spreadsheetId: SPREADSHEET_ID,
  range: 'ATTENDANCE!A15:M15',
});
```

**Helper:**
```js
async function clearRange(sheet, range = 'A2:Z5000') {
  await sheetsApi.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheet}!${range}`,
  });
}
```

---

### 7. `spreadsheets.get` — Get spreadsheet metadata

**SDK:** `sheetsApi.spreadsheets.get()`

**HTTP:** `GET https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}`

Used for:

```js
// Check which sheet tabs exist (for ensureSheets / setup)
const ss = await sheetsApi.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
const existingTabs = ss.data.sheets.map((s) => s.properties.title);

// Health check — verify connection + get sheet title
const ss = await sheetsApi.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
const title = ss.data.properties?.title;
```

---

### 8. `spreadsheets.batchUpdate` — Spreadsheet-level operations

**SDK:** `sheetsApi.spreadsheets.batchUpdate()`

**HTTP:** `POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}:batchUpdate`

Used for creating new sheet tabs:

```js
// Add missing sheet tabs
await sheetsApi.spreadsheets.batchUpdate({
  spreadsheetId: SPREADSHEET_ID,
  requestBody: {
    requests: missingTitles.map((title) => ({
      addSheet: { properties: { title } },
    })),
  },
});
```

## Data Flow

```
React UI (port 5173)
  │
  │  fetch('/api/...')
  ▼
Express Server (port 3001)
  │
  │  google.sheets({ version: 'v4', auth })
  ▼
Google Sheets API (sheets.googleapis.com)
  │
  ▼
Google Spreadsheet (ID: 1aqve6g9hN7sVBiJnFO4cFnpk-nPZu1SsuUzPxM2YAA8)
```

The Vite dev server proxies `/api/*` requests to `http://localhost:3001` via `vite.config.js`.

## Settings Cache

Settings are cached in-memory for 5 minutes to reduce API calls:

```js
let _settCache = null;
let _settCacheAt = 0;
// Cache invalidated on settings save or sheet setup
```

## Error Handling

Every API call is wrapped in try/catch. The server returns:

```json
{ "error": "Error message here" }
```

The client `api.js` helper throws on non-OK responses:

```js
async function req(url, opts = {}) {
  const res = await fetch(BASE + url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}
```

## Backup / Restore

- **Export:** `GET /api/export` — reads all 8 sheets and generates an `.xlsx` file
- **Setup:** `POST /api/setup` — recreates missing sheets, writes headers, restores default settings
- **Clear:** `POST /api/clear/:sheet` or `POST /api/clear-all` — wipes data (preserves headers)
