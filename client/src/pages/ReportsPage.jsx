import { useState } from 'react';
import { Download, FileSpreadsheet, FileBarChart, FileText, Loader2, Calendar, Eye } from 'lucide-react';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import { BASE, getToken } from '../lib/api';

const REPORTS = [
  {
    key: 'project',
    label: 'Project Report',
    desc: 'All projects with efficiency metrics — S.No, Project Name, Status, Client, Hrs, Spent Time, Eff Time, Efficiencies & Lead',
    icon: FileSpreadsheet,
    color: 'from-blue-500 to-blue-600',
    hoverColor: 'shadow-blue-500/25',
  },
  {
    key: 'qaqc',
    label: 'QA/QC Report',
    desc: 'Projects flagged for QA/QC review with hours breakdown and efficiency calculations',
    icon: FileBarChart,
    color: 'from-purple-500 to-purple-600',
    hoverColor: 'shadow-purple-500/25',
  },
  {
    key: 'feedback',
    label: 'Feedback Report',
    desc: 'Client Feedback projects with total spent time, req/act eff hours, and leading person',
    icon: FileText,
    color: 'from-emerald-500 to-emerald-600',
    hoverColor: 'shadow-emerald-500/25',
  },
  {
    key: 'production-efficiency',
    label: 'Production Efficiency',
    desc: 'Per-lead production efficiency — client hrs, spent time, req/act eff, actual & expected efficiency',
    icon: FileBarChart,
    color: 'from-amber-500 to-amber-600',
    hoverColor: 'shadow-amber-500/25',
  },
  {
    key: 'qc-efficiency',
    label: 'QC Efficiency',
    desc: 'QC team efficiency aggregated by lead — hours and efficiency percentages',
    icon: FileBarChart,
    color: 'from-rose-500 to-rose-600',
    hoverColor: 'shadow-rose-500/25',
  },
  {
    key: 'feedback-efficiency',
    label: 'Feedback Efficiency',
    desc: 'Feedback project efficiency aggregated by lead with actual vs expected performance',
    icon: FileBarChart,
    color: 'from-cyan-500 to-cyan-600',
    hoverColor: 'shadow-cyan-500/25',
  },
];

const PRESETS = [
  { label: 'Today',    days: 0  },
  { label: '7 Days',   days: 6  },
  { label: '30 Days',  days: 29 },
  { label: '90 Days',  days: 89 },
  { label: 'All',      days: -1 },
];

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'report.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function ReportsPage({ toast }) {
  const [loading, setLoading] = useState(null);
  const [previewReport, setPreviewReport] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activePreset, setActivePreset] = useState('All');

  const applyPreset = (label, days) => {
    setActivePreset(label);
    if (days === -1) {
      setFromDate('');
      setToDate('');
      return;
    }
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setFromDate(fmt(from));
    setToDate(fmt(to));
  };

  const onFromChange = (v) => { setFromDate(v); setActivePreset(null); };
  const onToChange = (v) => { setToDate(v); setActivePreset(null); };

  const onClear = () => { setFromDate(''); setToDate(''); setActivePreset('All'); };

  const handlePreview = async (report) => {
    setPreviewReport(report);
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      params.set('preview', 'true');
      const qs = params.toString();
      const url = `${BASE}/reports/download/${report.key}?${qs}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load preview');
      }
      const data = await res.json();
      setPreviewData(data);
    } catch (e) {
      toast?.error(e.message);
      setPreviewReport(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async (report) => {
    setLoading(report.key);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const qs = params.toString();
      const url = `${BASE}/reports/download/${report.key}${qs ? '?' + qs : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Download failed');
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const filename = `${report.label.replace(/\s+/g, '_')}.xlsx`;
      downloadFile(objUrl, filename);
      URL.revokeObjectURL(objUrl);
      toast?.success(`${report.label} downloaded`);
    } catch (e) {
      toast?.error(e.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <p className="text-slate-500 text-sm mt-1">
          Download Excel reports with project data, efficiency metrics, and team performance
        </p>
      </div>

      {/* Date Range Filter */}
      <div className="mb-8 bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center gap-3 mb-3">
          <Calendar size={16} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Date Range</span>
          <span className="text-[11px] text-slate-400">(filters project hours by date)</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => onFromChange(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => onToChange(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            />
          </div>
          <div className="h-6 w-px bg-slate-200 mx-1" />
          <div className="flex items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.label, p.days)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-150 ${
                  activePreset === p.label
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={onClear}
              className="text-xs text-slate-400 hover:text-slate-600 ml-auto underline underline-offset-2"
            >
              Clear
            </button>
          )}
        </div>
        {(fromDate || toDate) && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full font-medium">
              <Calendar size={11} />
              {fromDate ? fromDate : '…'} → {toDate ? toDate : '…'}
            </span>
            <span className="text-[11px] text-slate-400">data filtered to this range</span>
          </div>
        )}
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          const isLoading = loading === report.key;
          return (
            <div
              key={report.key}
              className={`
                relative bg-white rounded-2xl border border-slate-200 p-5
                transition-all duration-200
                hover:shadow-lg ${report.hoverColor} hover:-translate-y-0.5 hover:border-transparent
                group
              `}
            >
              {/* Accent bar */}
              <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${report.color} mb-4 transition-all duration-200 group-hover:w-16`} />

              <div className="flex items-start gap-3">
                <div className={`shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${report.color} flex items-center justify-center text-white shadow-sm`}>
                  {isLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Icon size={18} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-800 text-sm">{report.label}</h3>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">{report.desc}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  onClick={() => handlePreview(report)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all duration-150"
                >
                  <Eye size={13} />
                  Preview
                </button>
                <button
                  onClick={() => handleDownload(report)}
                  disabled={isLoading}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-150 ${
                    isLoading
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                  }`}
                >
                  {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  {isLoading ? 'Generating...' : 'Download XLSX'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview Modal */}
      {previewReport && (
        <Modal
          title={previewReport.label}
          onClose={() => { setPreviewReport(null); setPreviewData(null); }}
          wide
        >
          {previewLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-indigo-500" />
              <span className="ml-3 text-sm text-slate-500">Loading preview data...</span>
            </div>
          ) : previewData ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {previewData.rows.length} records
                  {(fromDate || toDate) && (
                    <span className="ml-2 text-xs text-indigo-500">
                      (filtered{fromDate ? ` from ${fromDate}` : ''}{toDate ? ` to ${toDate}` : ''})
                    </span>
                  )}
                </p>
              </div>
              <DataTable
                headers={previewData.headers}
                rows={previewData.rows}
              />
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => handleDownload(previewReport)}
                  className="btn-primary text-sm gap-2"
                >
                  <Download size={15} />
                  Download XLSX
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {/* Info footer */}
      <div className="mt-10 bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <FileSpreadsheet size={20} className="text-indigo-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-indigo-800">About these reports</p>
            <p className="text-xs text-indigo-600 mt-1 leading-relaxed">
              All reports are generated in real-time from the latest Google Sheets data. 
              Efficiency values are calculated as: <strong>Actual Efficiency = Client Hrs ÷ Total Spent Time</strong> and{' '}
              <strong>Expected Efficiency = Client Hrs ÷ Req Eff Time</strong>. 
              Efficiency reports group hours by team lead for production, QC, and feedback work respectively.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
