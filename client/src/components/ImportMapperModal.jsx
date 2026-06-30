import { useState, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle2, AlertCircle, CircleDashed, ChevronDown, ChevronUp } from 'lucide-react';
import Modal from './Modal';

function autoMap(systemCols, excelHeaders) {
  const map = {};
  systemCols.forEach((col, sysIdx) => {
    const sysKey = col.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchIdx = excelHeaders.findIndex((h) => {
      const hKey = (h || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      return hKey === sysKey || hKey.includes(sysKey) || sysKey.includes(hKey);
    });
    if (matchIdx >= 0) map[sysIdx] = matchIdx;
  });
  return map;
}

function parseWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const result = {};
        wb.SheetNames.forEach((name) => {
          const ws = wb.Sheets[name];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          result[name] = {
            headers: (raw[0] || []).map(String),
            rows: raw.slice(1).filter((r) => r.some((c) => c !== '' && c != null)),
          };
        });
        resolve({ sheetNames: wb.SheetNames, sheets: result });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ── Upload step ───────────────────────────────────────────────────────────────
function UploadZone({ onFile, templateUrl }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handle = (file) => { if (file) onFile(file); };

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer select-none ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
      >
        <div className={`mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center ${dragging ? 'bg-indigo-100' : 'bg-slate-100'}`}>
          <Upload size={26} className={dragging ? 'text-indigo-500' : 'text-slate-400'} />
        </div>
        <p className="text-sm font-medium text-slate-700 mb-1">Drop your Excel file here</p>
        <p className="text-xs text-slate-400">or click to browse · .xlsx, .xls</p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => { handle(e.target.files[0]); e.target.value = ''; }} />
      </div>

      {templateUrl && (
        <p className="text-center text-xs text-slate-400">
          Need a template?{' '}
          <a href={templateUrl} className="text-indigo-600 font-medium hover:underline" target="_blank" rel="noreferrer">
            Download blank template →
          </a>
        </p>
      )}
    </div>
  );
}

// ── Mapping step ──────────────────────────────────────────────────────────────
function MappingStep({
  fileName, sheetNames, selectedSheet, onSheetChange,
  systemCols, requiredCols, excelHeaders, mapping, onMappingChange,
  mappedRows, extraOptions,
  onBack, onImport, importing,
}) {
  const [previewOpen, setPreviewOpen] = useState(true);

  const mapped    = Object.keys(mapping).length;
  const reqMissing = requiredCols.filter((i) => mapping[i] === undefined);
  const canImport  = reqMissing.length === 0 && mappedRows.length > 0;

  const mappedCols = systemCols.map((h, i) => ({ h, i })).filter(({ i }) => mapping[i] !== undefined);

  return (
    <div className="flex flex-col gap-4">

      {/* File + sheet bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileSpreadsheet size={16} className="text-indigo-500 shrink-0" />
          <span className="text-xs font-medium text-slate-700 truncate">{fileName}</span>
        </div>
        {sheetNames.length > 1 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-500">Sheet:</span>
            <select
              className="input text-xs py-1 w-auto"
              value={selectedSheet}
              onChange={(e) => onSheetChange(e.target.value)}
            >
              {sheetNames.map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={12} /> {mapped} matched
        </span>
        {reqMissing.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">
            <AlertCircle size={12} /> {reqMissing.length} required missing
          </span>
        )}
        {systemCols.length - mapped > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
            <CircleDashed size={12} /> {systemCols.length - mapped} skipped
          </span>
        )}
        <span className="ml-auto text-xs text-slate-400">{mappedRows.length} rows to import</span>
      </div>

      {/* Column mapping table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_1fr] bg-slate-50 border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <span>System Column</span>
          <span />
          <span>Excel Column</span>
        </div>
        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
          {systemCols.map((col, sysIdx) => {
            const isReq    = requiredCols.includes(sysIdx);
            const isMapped = mapping[sysIdx] !== undefined;
            const isReqMissing = isReq && !isMapped;

            return (
              <div
                key={sysIdx}
                className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2 transition-colors ${
                  isMapped ? 'bg-emerald-50/40' : isReqMissing ? 'bg-red-50/40' : ''
                }`}
              >
                {/* System col */}
                <div className="flex items-center gap-2 min-w-0">
                  {isMapped
                    ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    : isReqMissing
                      ? <AlertCircle size={13} className="text-red-400 shrink-0" />
                      : <CircleDashed size={13} className="text-slate-300 shrink-0" />
                  }
                  <span className={`text-xs truncate ${isMapped ? 'text-emerald-800 font-medium' : isReqMissing ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                    {col}
                  </span>
                  {isReq && (
                    <span className="shrink-0 text-[10px] font-semibold text-red-400 bg-red-50 border border-red-200 px-1 rounded">req</span>
                  )}
                </div>

                {/* Arrow */}
                <ArrowRight size={13} className={isMapped ? 'text-emerald-400' : 'text-slate-200'} />

                {/* Excel col select */}
                <select
                  className={`input text-xs py-1 ${isMapped ? 'border-emerald-200 bg-emerald-50/60' : isReqMissing ? 'border-red-200' : ''}`}
                  value={mapping[sysIdx] !== undefined ? mapping[sysIdx] : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    onMappingChange((prev) => {
                      const next = { ...prev };
                      if (val === '') delete next[sysIdx];
                      else next[sysIdx] = parseInt(val);
                      return next;
                    });
                  }}
                >
                  <option value="">— Skip —</option>
                  {excelHeaders.map((h, i) => (
                    <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Extra options slot (e.g. "replace" checkbox) */}
      {extraOptions && <div>{extraOptions}</div>}

      {/* Preview */}
      {mappedRows.length > 0 && mappedCols.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <span>Preview — first {Math.min(mappedRows.length, 5)} of {mappedRows.length} rows · {mappedCols.length} mapped columns</span>
            {previewOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {previewOpen && (
            <div className="overflow-x-auto max-h-44">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {mappedCols.map(({ h }) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mappedRows.slice(0, 5).map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      {mappedCols.map(({ i }) => (
                        <td key={i} className="px-3 py-1.5 truncate max-w-[160px] text-slate-700">
                          {row[i] || <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <button type="button" onClick={onBack} className="btn-secondary text-xs">← Back</button>
        <div className="flex items-center gap-2">
          {reqMissing.length > 0 && (
            <span className="text-xs text-red-500">
              Map required: {reqMissing.map((i) => systemCols[i]).join(', ')}
            </span>
          )}
          <button
            type="button"
            onClick={onImport}
            disabled={importing || !canImport}
            className="btn-primary"
          >
            {importing ? 'Importing…' : `Import ${mappedRows.length} rows →`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export default function ImportMapperModal({
  open,
  onClose,
  title,
  systemCols,
  requiredCols = [],
  preferredSheet,
  templateUrl,
  extraOptions,
  onImport,
  importing = false,
}) {
  const [step, setStep]               = useState('upload');
  const [fileName, setFileName]       = useState('');
  const [sheetDataMap, setSheetDataMap] = useState({});
  const [sheetNames, setSheetNames]   = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [excelData, setExcelData]     = useState([]);
  const [mapping, setMapping]         = useState({});

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setSheetDataMap({});
    setSheetNames([]);
    setSelectedSheet('');
    setExcelHeaders([]);
    setExcelData([]);
    setMapping({});
  }, []);

  const applySheet = useCallback((all, name) => {
    const sd = all[name];
    if (!sd) return;
    setExcelHeaders(sd.headers);
    setExcelData(sd.rows);
    setSelectedSheet(name);
    setMapping(autoMap(systemCols, sd.headers));
  }, [systemCols]);

  const handleFile = useCallback(async (file) => {
    try {
      const { sheetNames: names, sheets } = await parseWorkbook(file);
      if (!names.length) return;
      setFileName(file.name);
      setSheetDataMap(sheets);
      setSheetNames(names);
      // Auto-pick preferred sheet, else first sheet
      const pick = preferredSheet && names.includes(preferredSheet) ? preferredSheet : names[0];
      applySheet(sheets, pick);
      setStep('mapping');
    } catch (err) {
      console.error(err);
    }
  }, [applySheet, preferredSheet]);

  const mappedRows = useMemo(() => {
    if (!excelData.length || !Object.keys(mapping).length) return [];
    return excelData.map((row) => {
      const sysRow = Array(systemCols.length).fill('');
      Object.entries(mapping).forEach(([sysIdx, exIdx]) => {
        sysRow[parseInt(sysIdx)] = row[exIdx] !== undefined ? String(row[exIdx]) : '';
      });
      return sysRow;
    });
  }, [excelData, mapping, systemCols.length]);

  if (!open) return null;

  return (
    <Modal
      title={title}
      onClose={() => { reset(); onClose(); }}
      wide
    >
      {step === 'upload' ? (
        <UploadZone onFile={handleFile} templateUrl={templateUrl} />
      ) : (
        <MappingStep
          fileName={fileName}
          sheetNames={sheetNames}
          selectedSheet={selectedSheet}
          onSheetChange={(name) => applySheet(sheetDataMap, name)}
          systemCols={systemCols}
          requiredCols={requiredCols}
          excelHeaders={excelHeaders}
          mapping={mapping}
          onMappingChange={setMapping}
          mappedRows={mappedRows}
          extraOptions={extraOptions}
          onBack={reset}
          onImport={() => onImport(mappedRows)}
          importing={importing}
        />
      )}
    </Modal>
  );
}
