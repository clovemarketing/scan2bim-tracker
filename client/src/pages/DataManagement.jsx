import { useState } from 'react';
import { Download, Trash2, AlertTriangle, Loader, Database, Wrench, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { api } from '../lib/api';

const SHEETS = [
  { key: 'EMPLOYEES', label: 'Employees', desc: 'Employee master data' },
  { key: 'PROJECTS', label: 'Projects', desc: 'Project registry' },
  { key: 'EMP_MAP', label: 'EMP–Project Map', desc: 'Assignment mapping' },
  { key: 'ATTENDANCE', label: 'Attendance Today', desc: "Today's attendance register" },
  { key: 'ATT_STORE', label: 'Attendance Archive', desc: 'Historical attendance records' },
  { key: 'PROJ_HOURS', label: 'Project Hours', desc: 'Hours log entries' },
  { key: 'EFF_LOG', label: 'Efficiency Log', desc: 'Daily efficiency records' },
  { key: 'QAQC', label: 'QA/QC Projects', desc: 'QA/QC analytics sheet' },
  { key: 'FEEDBACK', label: 'Client Feedback', desc: 'Client feedback projects' },
  { key: 'INT_FB', label: 'Internal Feedback', desc: 'Internal feedback projects' },
];

export default function DataManagement({ toast }) {
  const [exporting, setExporting] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [setupReport, setSetupReport] = useState(null);
  const [clearing, setClearing] = useState(null);
  const [confirmClear, setConfirmClear] = useState(null);
  const [syncingCols, setSyncingCols] = useState(false);
  const [syncColsResult, setSyncColsResult] = useState(null);
  const [syncingExcel, setSyncingExcel] = useState(false);
  const [syncExcelResult, setSyncExcelResult] = useState(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/export');
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scan2bim-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded');
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleSetup = async () => {
    setSettingUp(true);
    setSetupReport(null);
    try {
      const res = await fetch('/api/setup', { method: 'POST' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const data = await res.json();
      setSetupReport(data.report);
      toast.success('Sheet setup complete');
    } catch (e) {
      toast.error('Setup failed: ' + e.message);
    } finally {
      setSettingUp(false);
    }
  };

  const handleSyncColumns = async () => {
    setSyncingCols(true);
    setSyncColsResult(null);
    try {
      const data = await api.syncColumns();
      setSyncColsResult(data.results);
      toast.success('Column sync complete');
    } catch (e) {
      toast.error('Sync failed: ' + e.message);
    } finally {
      setSyncingCols(false);
    }
  };

  const handleSyncFromExcel = async () => {
    setSyncingExcel(true);
    setSyncExcelResult(null);
    try {
      const data = await api.syncFromExcel();
      setSyncExcelResult(data.results);
      toast.success('Excel sync complete');
    } catch (e) {
      toast.error('Sync from Excel failed: ' + e.message);
    } finally {
      setSyncingExcel(false);
    }
  };

  const handleClear = async (key) => {
    setClearing(key);
    setConfirmClear(null);
    try {
      if (key === 'ALL') {
        await api.clearAll();
        toast.success('All sheets cleared');
      } else {
        await api.clearSheet(key);
        toast.success(`${key} cleared`);
      }
    } catch (e) {
      toast.error('Clear failed: ' + e.message);
    } finally {
      setClearing(null);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Data Management</h1>
      <p className="page-sub">Export backup · manage Google Sheets data</p>

      {/* Action cards — 2-column grid on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

      {/* Export Section */}
      <section className="card h-full">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-emerald-100 rounded-xl">
            <Download size={24} className="text-emerald-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Export Backup</h2>
            <p className="text-sm text-slate-500 mb-4">
              Downloads all connected Google Sheets data as a single <span className="font-medium text-slate-700">.xlsx</span> file
              for backup. Includes all 8 sheets (Employees, Projects, EMP Map, Attendance, Attendance Archive,
              Project Hours, Efficiency Log, Settings).
            </p>
            <button onClick={handleExport} disabled={exporting} className="btn-success">
              {exporting ? (
                <><Loader size={15} className="animate-spin" /> Exporting…</>
              ) : (
                <><Download size={15} /> Export Backup (.xlsx)</>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Setup Sheet */}
      <section className="card h-full">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-100 rounded-xl">
            <Wrench size={24} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Setup Sheet Templates</h2>
            <p className="text-sm text-slate-500 mb-4">
              Ensures all 8 sheet tabs exist with correct headers. Restores default settings rows if missing.
              Use this if sheet structure gets corrupted or data goes missing.
            </p>
            <button onClick={handleSetup} disabled={settingUp} className="btn-secondary text-amber-700 border-amber-200 hover:bg-amber-50">
              {settingUp ? (
                <><Loader size={15} className="animate-spin" /> Setting up…</>
              ) : (
                <><Wrench size={15} /> Setup Sheets</>
              )}
            </button>
            {setupReport && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs font-semibold text-amber-700 mb-2">Setup Report</p>
                <ul className="space-y-1">
                  {setupReport.map((r, i) => (
                    <li key={i} className="text-xs text-amber-600 flex items-start gap-2">
                      <span className="font-medium capitalize shrink-0 w-16">{r.step}</span>
                      <span>{r.detail}</span>
                    </li>
                  ))}
                  {setupReport.length === 0 && <li className="text-xs text-amber-500">All sheets already set up correctly</li>}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Sync Columns */}
      <section className="card h-full md:col-span-2">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-100 rounded-xl">
            <RefreshCw size={24} className="text-indigo-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Sync Google Sheet Columns</h2>
            <p className="text-sm text-slate-500 mb-4">
              Migrates the PROJECTS sheet to the new 15-column layout (adds Remarks, Remaining Hrs, Proj Efficiency, Proj Actual Eff) and recomputes all calculated values from Project Hours data.
              Also ensures PROJ_HOURS has the Team Lead header. Run once after initial setup.
            </p>
            <button onClick={handleSyncColumns} disabled={syncingCols} className="btn-primary">
              {syncingCols ? (
                <><Loader size={15} className="animate-spin" /> Syncing…</>
              ) : (
                <><RefreshCw size={15} /> Sync Columns</>
              )}
            </button>
            {syncColsResult && (
              <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                <p className="text-xs font-semibold text-indigo-700 mb-2">Sync Results</p>
                <ul className="space-y-1">
                  {syncColsResult.map((r, i) => (
                    <li key={i} className="text-xs text-indigo-600 flex items-start gap-2">
                      <span className="font-medium shrink-0 w-24">{r.sheet}</span>
                      <span>{r.skipped ? `Skipped — ${r.note}` : r.note || `${r.rows} rows updated`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      </div>

      {/* Sheets Overview */}
      <section className="card mb-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Database size={18} className="text-slate-400" /> Google Sheets
        </h2>
        <p className="text-xs text-slate-400 mb-3 font-mono break-all">
          Spreadsheet ID: 1aqve6g9hN7sVBiJnFO4cFnpk-nPZu1SsuUzPxM2YAA8
        </p>
        <div className="divide-y divide-slate-50">
          {SHEETS.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>
              <button
                onClick={() => setConfirmClear(key)}
                disabled={clearing === key}
                className="btn-secondary text-xs text-red-600 border-red-100 hover:bg-red-50 gap-1.5 py-1.5"
              >
                {clearing === key ? (
                  <Loader size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
                Clear
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Clear All */}
      <section className="card border-red-100 bg-red-50/30">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-100 rounded-xl">
            <AlertTriangle size={22} className="text-red-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-red-700 mb-1">Clear All Sheets</h2>
            <p className="text-sm text-red-500 mb-4">
              Removes all data rows from every sheet. Headers are preserved. This cannot be undone.
            </p>
            <button
              onClick={() => setConfirmClear('ALL')}
              disabled={clearing === 'ALL'}
              className="btn-danger"
            >
              {clearing === 'ALL' ? (
                <><Loader size={14} className="animate-spin" /> Clearing…</>
              ) : (
                <><Trash2 size={14} /> Clear All Sheets</>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Confirm Dialog */}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setConfirmClear(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <h3 className="font-semibold text-slate-800">Confirm Clear</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              {confirmClear === 'ALL'
                ? 'This will clear data from ALL sheets. Are you sure?'
                : `This will clear all data from the "${confirmClear}" sheet. Are you sure?`}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmClear(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => handleClear(confirmClear)} className="btn-danger">
                Yes, Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
