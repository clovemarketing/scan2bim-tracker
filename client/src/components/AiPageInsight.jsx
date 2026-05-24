import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sparkles, X, RefreshCw, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { streamOpenRouter, getOrKey, fetchOrKey, OR_MODELS, DEFAULT_OR_MODEL, LS_OR_MODEL } from '../lib/openrouter';
import { getPageInsight } from '../lib/page-context';

function inlineRender(text) {
  if (!text) return null;
  const regex = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  const parts = text.split(regex);
  return parts.map((p, i) => {
    if (/^\*\*/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^__/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^`/.test(p)) return <code key={i} className="bg-indigo-100 text-indigo-800 text-[11px] px-1 py-0.5 rounded font-mono">{p.slice(1, -1)}</code>;
    if (/^\*/.test(p) && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    if (/^_/.test(p) && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

function MarkdownInsight({ text, loading }) {
  const blocks = useMemo(() => {
    if (!text) return [];
    const lines = text.split('\n');
    const result = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) { result.push({ type: 'space' }); i++; continue; }

      const hm = trimmed.match(/^(#{1,3})\s+(.+)/);
      if (hm) { result.push({ type: 'heading', level: hm[1].length, content: hm[2] }); i++; continue; }

      const lm = trimmed.match(/^(\s*)([-*+])\s+(.+)/);
      if (lm) {
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^([ \t]*)([-*+])\s+(.+)/);
          if (!m) break;
          items.push({ text: m[3], depth: Math.floor(m[1].replace(/\t/g, '  ').length / 2) });
          i++;
        }
        result.push({ type: 'list', items });
        continue;
      }

      if (/^\d+\.\s/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+\.\s/, '').trim());
          i++;
        }
        result.push({ type: 'olist', items });
        continue;
      }

      result.push({ type: 'para', content: trimmed });
      i++;
    }
    return result;
  }, [text]);

  if (!text) return <span className="text-slate-400 animate-pulse">Fetching page data…</span>;

  return (
    <div className="space-y-1">
      {blocks.map((b, bi) => {
        const isLast = bi === blocks.length - 1;
        const cursor = loading && isLast
          ? <span className="inline-block w-1.5 h-3 bg-indigo-400 ml-0.5 animate-pulse rounded-sm align-middle" />
          : null;

        if (b.type === 'space') return <div key={bi} className="h-1" />;
        if (b.type === 'heading') {
          const cls = b.level === 1 ? 'font-bold text-sm' : b.level === 2 ? 'font-semibold text-sm' : 'font-semibold text-xs text-indigo-600';
          return <p key={bi} className={cls}>{inlineRender(b.content)}{cursor}</p>;
        }
        if (b.type === 'para') return <p key={bi} className="leading-relaxed">{inlineRender(b.content)}{cursor}</p>;
        if (b.type === 'list') return (
          <ul key={bi} className="space-y-0 list-disc list-inside">
            {b.items.map((item, ii) => (
              <li key={ii} className="leading-relaxed">{inlineRender(item.text)}</li>
            ))}
            {cursor}
          </ul>
        );
        if (b.type === 'olist') return (
          <ol key={bi} className="space-y-0 list-decimal list-inside">
            {b.items.map((item, ii) => (
              <li key={ii} className="leading-relaxed">{inlineRender(item)}</li>
            ))}
            {cursor}
          </ol>
        );
        return null;
      })}
    </div>
  );
}

const SS_HIDDEN = 'ai_insight_bar_hidden';

export default function AiPageInsight({ page }) {
  const [barHidden, setBarHidden] = useState(() => sessionStorage.getItem(SS_HIDDEN) === '1' || true);
  const [expanded,  setExpanded]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [text,      setText]      = useState('');
  const [error,     setError]     = useState('');
  const [model,     setModel]     = useState(() => {
    const saved = localStorage.getItem(LS_OR_MODEL);
    return saved && OR_MODELS.some((m) => m.id === saved) ? saved : DEFAULT_OR_MODEL;
  });
  const abortRef  = useRef(null);
  const prevPage  = useRef(null);

  useEffect(() => { localStorage.setItem(LS_OR_MODEL, model); }, [model]);

  // Reset insight when page changes
  useEffect(() => {
    if (prevPage.current !== page) {
      prevPage.current = page;
      setText(''); setError(''); setExpanded(false);
      abortRef.current?.abort();
    }
  }, [page]);

  const hideBar = () => { sessionStorage.setItem(SS_HIDDEN, '1'); setBarHidden(true); abortRef.current?.abort(); setLoading(false); };
  const showBar = () => { sessionStorage.removeItem(SS_HIDDEN); setBarHidden(false); };

  const run = useCallback(async () => {
    let key = getOrKey();
    if (!key || key === 'your-key-here') {
      key = await fetchOrKey();
    }
    if (!key || key === 'your-key-here') {
      setError('OpenRouter API key not set. Set VITE_OPENROUTER_API_KEY in env vars on Netlify.');
      setExpanded(true);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true); setError(''); setText(''); setExpanded(true);
    try {
      const { label, systemPrompt, dataText } = await getPageInsight(page);
      if (ctrl.signal.aborted) return;
      const userMsg = `Here is the current data for the ${label} page:\n\n${dataText}\n\nProvide a concise insight summary.`;
      await streamOpenRouter(key, model, systemPrompt, userMsg, (_, full) => {
        if (!ctrl.signal.aborted) setText(full);
      });
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e.message);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [page, model]);



  // ── Bar is hidden — show a tiny re-open pill ──────────────────────────────
  if (barHidden) {
    return (
      <button
        onClick={showBar}
        className="sticky top-2 z-30 ml-3 mt-2 flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-full px-2.5 py-1 shadow-sm transition-colors"
        title="Show AI Insight bar"
      >
        <Sparkles size={11} /> AI Insight
      </button>
    );
  }

  // ── Main bar ──────────────────────────────────────────────────────────────
  return (
    <div className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-sm">

      {/* Toolbar row */}
      <div className="flex items-center gap-2 px-3 py-1.5 min-h-[36px]">
        {/* Trigger button */}
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:text-slate-400 transition-colors"
          title="Generate AI insight for this page"
        >
          <Sparkles size={13} className={loading ? 'animate-pulse' : ''} />
          {loading ? 'Analysing…' : 'AI Insight'}
        </button>

        {/* Expand / collapse / refresh when content exists */}
        {(text || error) && (
          <>
            <button onClick={() => setExpanded((v) => !v)} className="text-slate-400 hover:text-slate-600 transition-colors" title={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {!loading && (
              <button onClick={run} className="text-slate-400 hover:text-indigo-500 transition-colors" title="Regenerate">
                <RefreshCw size={13} />
              </button>
            )}
            <button
              onClick={() => { setText(''); setError(''); setExpanded(false); }}
              className="text-slate-300 hover:text-slate-500 transition-colors"
              title="Clear insight"
            >
              <X size={13} />
            </button>
          </>
        )}

        {/* Right side: model picker + close bar */}
        <div className="ml-auto flex items-center gap-1.5">
          <select
            className="text-xs border border-slate-200 rounded px-1.5 py-0.5 pr-5 bg-white text-slate-600 max-w-[160px] hidden sm:block"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {OR_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          {/* Close the entire bar */}
          <button
            onClick={hideBar}
            className="text-slate-300 hover:text-slate-600 transition-colors ml-1"
            title="Close AI Insight bar"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Insight panel */}
      {expanded && (text || error || loading) && (
        <div className="relative px-4 pb-3 pt-2 bg-indigo-50 border-t border-indigo-100 max-h-56 overflow-y-auto">
          {/* Close button for the panel */}
          <button
            onClick={() => { setText(''); setError(''); setExpanded(false); abortRef.current?.abort(); setLoading(false); }}
            className="absolute top-2 right-3 text-indigo-300 hover:text-indigo-600 transition-colors"
            title="Close insight"
          >
            <X size={14} />
          </button>
          {error ? (
            <div className="flex items-start gap-2 text-xs text-red-600 pr-5">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="text-xs text-slate-700 pr-5">
              <MarkdownInsight text={text} loading={loading} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
