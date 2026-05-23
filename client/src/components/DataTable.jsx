import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, Columns, X } from 'lucide-react';

const PAGE_OPTS = [10, 20, 50, 100];

export default function DataTable({
  headers = [],
  rows = [],
  actions,
  selectable = false,
  bulkActions = [],
  columnControl = false,
  defaultHiddenCols = [],
  storageKey = null,
  alignments = [], // array of 'left' | 'center' | 'right' for each column
  rowIndices = null, // optional: actual sheet row numbers parallel to `rows`
}) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set()); // Set of origIdx (index into `rows`)
  const [hiddenCols, setHiddenCols] = useState(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`col-vis:${storageKey}`);
        if (saved) return new Set(JSON.parse(saved));
      } catch { }
    }
    return new Set(defaultHiddenCols);
  });
  const [pageSize, setPageSize] = useState(20);
  const [showColMenu, setShowColMenu] = useState(false);
  const colMenuRef = useRef(null);

  // Reset page when search or pageSize changes
  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { setPage(1); }, [pageSize]);
  // Clear selection when rows change (data refresh)
  useEffect(() => { setSelected(new Set()); }, [rows]);

  // Persist column visibility to localStorage
  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(`col-vis:${storageKey}`, JSON.stringify([...hiddenCols]));
  }, [hiddenCols, storageKey]);

  // Close column menu on outside click
  useEffect(() => {
    if (!showColMenu) return;
    const h = (e) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setShowColMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showColMenu]);

  // ── Filter & sort with origIdx tracking ──────────────────────────────────────
  const withIdx = useMemo(() => rows.map((row, i) => [i, row]), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return withIdx;
    return withIdx.filter(([, row]) => row.some((c) => String(c ?? '').toLowerCase().includes(q)));
  }, [withIdx, search]);

  const sorted = useMemo(() => {
    if (sortCol === null) return filtered;
    return [...filtered].sort(([, a], [, b]) => {
      const av = String(a[sortCol] ?? ''), bv = String(b[sortCol] ?? '');
      const na = parseFloat(av), nb = parseFloat(bv);
      if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na;
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (i) => {
    if (sortCol === i) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(i); setSortDir('asc'); }
    setPage(1);
  };

  // ── Column visibility ─────────────────────────────────────────────────────────
  const visibleColIndices = useMemo(
    () => headers.map((_, i) => i).filter((i) => !hiddenCols.has(i)),
    [headers, hiddenCols]
  );
  const toggleCol = (i) => setHiddenCols((prev) => {
    const n = new Set(prev);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  });

  // ── Bulk selection ────────────────────────────────────────────────────────────
  const pageOrigIdxs = paginated.map(([idx]) => idx);
  const allPageSelected = pageOrigIdxs.length > 0 && pageOrigIdxs.every((i) => selected.has(i));
  const somePageSelected = pageOrigIdxs.some((i) => selected.has(i));

  const toggleAll = () => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allPageSelected) pageOrigIdxs.forEach((i) => n.delete(i));
      else pageOrigIdxs.forEach((i) => n.add(i));
      return n;
    });
  };
  const toggleRow = (origIdx) => setSelected((prev) => {
    const n = new Set(prev);
    n.has(origIdx) ? n.delete(origIdx) : n.add(origIdx);
    return n;
  });

  // selectedData passed to bulk action handlers: [{row, sheetRow}]
  const selectedData = useMemo(
    () => [...selected].sort((a, b) => a - b).map((i) => ({ row: rows[i], sheetRow: rowIndices ? rowIndices[i] : i + 2 })),
    [selected, rows, rowIndices]
  );

  const clearSelection = () => setSelected(new Set());

  // ── Render helpers ────────────────────────────────────────────────────────────
  const SortIcon = ({ i }) => {
    if (sortCol !== i) return <ChevronsUpDown size={12} className="opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  const getAlignmentClass = (colIndex) => {
    const align = alignments[colIndex];
    if (align === 'center') return 'text-center';
    if (align === 'right') return 'text-right';
    return 'text-left';
  };

  const colSpan = (selectable ? 1 : 0) + visibleColIndices.length + (actions?.renderRow ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap">
         {/* Search */}
         <div className="relative flex-1 min-w-[200px] max-w-xs">
           <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
           <input className="input pl-9 text-sm" placeholder="Search…" value={search}
             onChange={(e) => setSearch(e.target.value)}
             onKeyDown={(e) => { if (e.key === 'Escape') setSearch(''); }} />
           {search && (
             <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
               <X size={13} />
             </button>
           )}
         </div>

        {/* Column control */}
        {columnControl && (
          <div className="relative" ref={colMenuRef}>
            <button onClick={() => setShowColMenu((v) => !v)}
              className={`btn-secondary text-xs gap-1.5 ${hiddenCols.size > 0 ? 'border-indigo-300 text-indigo-600' : ''}`}>
              <Columns size={13} />
              Columns {hiddenCols.size > 0 && <span className="bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0 text-xs">{hiddenCols.size} hidden</span>}
            </button>
            {showColMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-3 min-w-52 max-h-72 overflow-y-auto">
                <p className="text-xs font-medium text-slate-500 mb-2 px-1">Toggle columns</p>
                {headers.map((h, i) => (
                  <label key={i} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                    <input type="checkbox" className="accent-indigo-600" checked={!hiddenCols.has(i)}
                      onChange={() => toggleCol(i)} />
                    <span className="text-sm text-slate-700">{h || `Col ${i + 1}`}</span>
                  </label>
                ))}
                {hiddenCols.size > 0 && (
                  <button onClick={() => setHiddenCols(new Set())}
                    className="mt-2 w-full text-xs text-indigo-600 hover:text-indigo-800 text-center py-1">
                    Show all columns
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-slate-400 ml-auto">
          {filtered.length !== rows.length ? `${filtered.length} of ${rows.length} rows` : `${rows.length} rows`}
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {selectable && selected.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl flex-wrap">
          <span className="text-sm font-semibold text-indigo-700">{selected.size} selected</span>
          <div className="h-4 w-px bg-indigo-200" />
          {bulkActions.map((action, i) => (
            <button key={i}
              onClick={() => action.onClick(selectedData)}
              className={`btn text-xs py-1.5 gap-1.5 ${action.danger ? 'btn-danger' : 'btn-secondary'}`}>
              {action.icon && <action.icon size={12} />}
              {action.label}
            </button>
          ))}
          <button onClick={clearSelection} className="ml-auto text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
            <X size={12} /> Clear
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm">
        <table className="min-w-full bg-white">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {selectable && (
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" className="accent-indigo-600 cursor-pointer"
                    checked={allPageSelected} ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                    onChange={toggleAll} />
                </th>
              )}
              {visibleColIndices.map((ci) => (
                <th key={ci} className="th" onClick={() => handleSort(ci)}>
                  <span className="flex items-center gap-1">{headers[ci]} <SortIcon i={ci} /></span>
                </th>
              ))}
              {actions?.renderRow && <th className="th">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="td text-center text-slate-400 py-12">
                  {search ? 'No results match your search' : 'No records found'}
                </td>
              </tr>
            )             : (
              paginated.map(([origIdx, row], ri) => {
                const isSelected = selected.has(origIdx);
                const sheetRow = rowIndices ? rowIndices[origIdx] : origIdx + 2;
                return (
                  <tr key={origIdx}
                    onClick={() => selectable && toggleRow(origIdx)}
                    className={`border-b border-slate-50 transition-colors cursor-pointer ${isSelected ? 'bg-indigo-50/60' : 'hover:bg-indigo-50/30'}`}>
                    {selectable && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="accent-indigo-600 cursor-pointer"
                          checked={isSelected} onChange={() => toggleRow(origIdx)} />
                      </td>
                    )}
                    {visibleColIndices.map((ci) => (
                      <td key={ci} className={`td ${getAlignmentClass(ci)}`}>
                        {actions?.renderCell ? actions.renderCell(ci, row[ci], row, origIdx, sheetRow) : (row[ci] ?? '')}
                      </td>
                    ))}
                    {actions?.renderRow && (
                      <td className="td" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          {actions.renderRow(row, sheetRow)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <span>{sorted.length} records{selected.size > 0 ? ` · ${selected.size} selected` : ''}</span>
          <span className="text-slate-300">|</span>
          <span className="text-xs text-slate-400">Rows:</span>
          <select className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
            value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_OPTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button className="btn-secondary px-2.5 py-1 text-xs" disabled={page === 1} onClick={() => setPage(1)}>«</button>
            <button className="btn-secondary px-2.5 py-1 text-xs" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹</button>
            <span className="px-3 text-xs">{page} / {totalPages}</span>
            <button className="btn-secondary px-2.5 py-1 text-xs" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
            <button className="btn-secondary px-2.5 py-1 text-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        )}
      </div>
    </div>
  );
}
