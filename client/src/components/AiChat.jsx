import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Square, Bot, User, RefreshCw, Zap, Server, Settings, Image, XCircle } from 'lucide-react';
import {
  WEBLLM_MODELS, supportsWebGPU,
  loadWebLLM, streamWebLLM, unloadWebLLM,
  checkOllama, streamOllama,
} from '../lib/ai-backends';
import { buildDataContext, SYSTEM_PROMPT } from '../lib/ai-context';
import { getPageInsight } from '../lib/page-context';

// ── Quick prompts ─────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  'How much production today?',
  'Attendance summary today',
  'Efficiency summary last 7 days',
  'Production last 5 days',
  'Top employees this week',
  'Production last 30 days',
];

const LS_BACKEND  = 'ai_backend';
const LS_WL_MODEL = 'ai_wl_model';
const LS_OL_HOST  = 'ai_ol_host';
const LS_OL_MODEL = 'ai_ol_model';

// ── Markdown renderer ─────────────────────────────────────────────────────────

function inlineRender(text) {
  if (!text) return null;
  const regex = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  const parts = text.split(regex);
  return parts.map((p, i) => {
    if (/^(\*\*|__)/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^`/.test(p)) return <code key={i} className="bg-slate-200 text-slate-800 text-[11px] px-1 py-0.5 rounded font-mono">{p.slice(1, -1)}</code>;
    if (/^(\*|_)/.test(p) && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

function parseTableRow(line) {
  const t = line.trim();
  const inner = t.startsWith('|') ? t.slice(1) : t;
  const cleaned = inner.endsWith('|') ? inner.slice(0, -1) : inner;
  return cleaned.split('|').map((c) => c.trim());
}

function isSeparatorRow(line) {
  return /^[\s|:\-]+$/.test(line) && line.includes('-');
}

function MarkdownContent({ text, streaming }) {
  // Empty + still streaming → show dots inside the bubble until first token arrives
  if (!text) return streaming ? <ThinkingDots /> : null;

  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith('```')) j++;
      blocks.push({ type: 'code', lang, content: lines.slice(i + 1, j).join('\n') });
      i = j + 1;
      continue;
    }

    // Table: triggered when current line has | and next line is a separator row
    if (trimmed.includes('|') && isSeparatorRow(lines[i + 1] || '')) {
      const tableLines = [];
      let k = i;
      while (k < lines.length && lines[k].trim().includes('|')) {
        if (!isSeparatorRow(lines[k])) tableLines.push(lines[k]);
        k++;
      }
      if (tableLines.length >= 1) {
        const [headerLine, ...dataLines] = tableLines;
        blocks.push({ type: 'table', headers: parseTableRow(headerLine), rows: dataLines.map(parseTableRow) });
        i = k;
        continue;
      }
    }

    // Heading
    const hm = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      blocks.push({ type: 'heading', level: hm[1].length, content: hm[2] });
      i++; continue;
    }

    // Bullet list
    const bm = line.match(/^(\s*)([-*+])\s(.+)/);
    if (bm) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^([ \t]*)([-*+])\s(.+)/);
        if (!m) break;
        // treat tab as 2 spaces for depth calculation
        const indent = m[1].replace(/\t/g, '  ');
        items.push({ text: m[3], depth: Math.floor(indent.length / 2) });
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s/, '').trim());
        i++;
      }
      blocks.push({ type: 'olist', items });
      continue;
    }

    // Empty line
    if (!trimmed) { blocks.push({ type: 'space' }); i++; continue; }

    // Paragraph
    blocks.push({ type: 'para', content: trimmed });
    i++;
  }

  return (
    <div className="space-y-1.5 min-w-0">
      {blocks.map((b, bi) => {
        const isLast = bi === blocks.length - 1;
        const cursor = streaming && isLast
          ? <span className="inline-block w-1.5 h-3 bg-indigo-400 ml-0.5 animate-pulse rounded-sm align-middle" />
          : null;

        if (b.type === 'space') return <div key={bi} className="h-1" />;

        if (b.type === 'heading') {
          const cls = b.level === 1 ? 'font-bold text-sm' : b.level === 2 ? 'font-semibold text-sm' : 'font-semibold text-xs text-slate-600';
          return <p key={bi} className={cls}>{inlineRender(b.content)}{cursor}</p>;
        }

        if (b.type === 'para') return (
          <p key={bi} className="text-sm leading-relaxed">
            {inlineRender(b.content)}{cursor}
          </p>
        );

        if (b.type === 'list') return (
          <ul key={bi} className="space-y-0.5">
            {b.items.map((item, ii) => (
              <li key={ii} className="flex gap-2 text-sm" style={{ paddingLeft: `${item.depth * 14}px` }}>
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-current opacity-50 shrink-0" />
                <span className="leading-relaxed">{inlineRender(item.text)}</span>
              </li>
            ))}
            {cursor && <li>{cursor}</li>}
          </ul>
        );

        if (b.type === 'olist') return (
          <ol key={bi} className="space-y-0.5">
            {b.items.map((item, ii) => (
              <li key={ii} className="flex gap-2 text-sm">
                <span className="text-slate-400 shrink-0 tabular-nums">{ii + 1}.</span>
                <span className="leading-relaxed">{inlineRender(item.text)}</span>
              </li>
            ))}
            {cursor && <li>{cursor}</li>}
          </ol>
        );

        if (b.type === 'code') return (
          <pre key={bi} className="bg-slate-100 rounded-lg p-2.5 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-slate-800">
            {b.content}{cursor}
          </pre>
        );

        if (b.type === 'table') return (
          <div key={bi} className="overflow-x-auto rounded-lg border border-slate-200 text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  {b.headers.map((h, hi) => (
                    <th key={hi} className="px-2.5 py-1.5 text-left font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                      {inlineRender(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-slate-100 last:border-0 odd:bg-white even:bg-slate-50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2.5 py-1.5 text-slate-700">{inlineRender(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {cursor}
          </div>
        );

        return null;
      })}
    </div>
  );
}

// ── Three-dot thinking indicator ──────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-end gap-1 h-5 px-1">
      {[0, 160, 320].map((delay, i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
          style={{ animationDelay: `${delay}ms`, animationDuration: '0.9s' }}
        />
      ))}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MsgBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
          <Bot size={14} className="text-indigo-600" />
        </div>
      )}
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm min-w-0 ${
        isUser
          ? 'bg-indigo-600 text-white rounded-br-sm'
          : 'bg-white border border-slate-100 text-slate-800 rounded-bl-sm shadow-sm'
      }`}>
        {/* Attached images */}
        {msg.images?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {msg.images.map((src, i) => (
              <img key={i} src={src} alt="attachment" className="max-h-36 max-w-full rounded-lg object-contain border border-white/30" />
            ))}
          </div>
        )}
        {/* Content */}
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        ) : (
          <MarkdownContent text={msg.content} streaming={msg.streaming} />
        )}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
          <User size={14} className="text-slate-500" />
        </div>
      )}
    </div>
  );
}

// ── Main chat component ───────────────────────────────────────────────────────

export default function AiChat({ page = 'dashboard' }) {
  const [open, setOpen]       = useState(false);
  const [backend, setBackend] = useState(() => localStorage.getItem(LS_BACKEND) || 'ollama');
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: "Hi! I can answer questions about your production, attendance, and efficiency.\n\nTry: **How much production today?** or **Efficiency last 7 days**.",
  }]);
  const [input,   setInput]   = useState('');
  const [thinking, setThinking] = useState(false);
  const [pendingImages, setPendingImages] = useState([]); // data-URL strings
  const [isDragging, setIsDragging] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const panelRef = useRef(null);
  const abortRef = useRef(null);

  // ── WebLLM state ──────────────────────────────────────────────────────────
  const [wlModel,    setWlModel]    = useState(() => localStorage.getItem(LS_WL_MODEL) || WEBLLM_MODELS[0].id);
  const [wlStatus,   setWlStatus]   = useState('idle');
  const [wlProgress, setWlProgress] = useState({ text: '', pct: 0 });
  const wlEngineRef = useRef(null);
  const webgpu = supportsWebGPU();

  // ── Ollama state ──────────────────────────────────────────────────────────
  const [olHost,      setOlHost]      = useState(() => localStorage.getItem(LS_OL_HOST) || 'http://localhost:11434');
  const [olModel,     setOlModel]     = useState(() => localStorage.getItem(LS_OL_MODEL) || '');
  const [olModels,    setOlModels]    = useState(null);
  const [olChecking,  setOlChecking]  = useState(false);
  const [showOlCfg,   setShowOlCfg]  = useState(false);

  // Persist prefs
  useEffect(() => { localStorage.setItem(LS_BACKEND,  backend);  }, [backend]);
  useEffect(() => { localStorage.setItem(LS_WL_MODEL, wlModel);  }, [wlModel]);
  useEffect(() => { localStorage.setItem(LS_OL_HOST,  olHost);   }, [olHost]);
  useEffect(() => { localStorage.setItem(LS_OL_MODEL, olModel);  }, [olModel]);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Check Ollama on open
  useEffect(() => {
    if (open && backend === 'ollama' && olModels === null) probeOllama();
  }, [open, backend]);

  const probeOllama = async () => {
    setOlChecking(true);
    const models = await checkOllama(olHost);
    setOlModels(models ?? []);
    if (models?.length && !olModel) setOlModel(models[0]);
    setOlChecking(false);
  };

  const loadModel = async () => {
    if (!webgpu) return;
    setWlStatus('loading');
    setWlProgress({ text: 'Starting…', pct: 0 });
    try {
      const engine = await loadWebLLM(wlModel, (text, pct) =>
        setWlProgress({ text, pct: Math.round((pct || 0) * 100) })
      );
      wlEngineRef.current = engine;
      setWlStatus('ready');
    } catch (e) {
      setWlStatus('error');
      setWlProgress({ text: e.message, pct: 0 });
    }
  };

  // ── Image helpers ─────────────────────────────────────────────────────────

  const readImageFile = useCallback((file) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPendingImages((prev) => [...prev, ev.target.result]);
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback((e) => {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    files.forEach(readImageFile);
  }, [readImageFile]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    Array.from(e.dataTransfer.files || []).forEach(readImageFile);
  }, [readImageFile]);

  // ── Message helpers ───────────────────────────────────────────────────────

  const addMsg = (role, content, images = [], streaming = false) => {
    const id = Date.now() + Math.random();
    setMessages((prev) => [...prev, { id, role, content, images, streaming }]);
    return id;
  };

  const updateMsg = (id, content, streaming = false) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, content, streaming } : m));
  };

  // ── Stop generation ───────────────────────────────────────────────────────

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── Send ──────────────────────────────────────────────────────────────────

  const send = useCallback(async (text) => {
    const q = (text || input).trim();
    const imgs = [...pendingImages];
    if ((!q && !imgs.length) || thinking) return;

    setInput('');
    setPendingImages([]);
    setThinking(true);
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

    addMsg('user', q || '📎 (image)', imgs);

    // Build combined context: general live data + current page data
    let context = '(data unavailable)';
    try {
      const question = q || 'Summarise what is happening in the system.';
      const [generalRes, pageRes] = await Promise.allSettled([
        buildDataContext(question),
        getPageInsight(page),
      ]);
      const parts = [];
      if (generalRes.status === 'fulfilled' && generalRes.value) parts.push(generalRes.value);
      if (pageRes.status === 'fulfilled') {
        const { label, dataText } = pageRes.value;
        if (dataText) parts.push(`CURRENT PAGE — ${label}:\n${dataText}`);
      }
      if (parts.length) context = parts.join('\n\n---\n\n');
    } catch { /* keep default */ }

    // Truncate context for small WebLLM models to prevent overwhelming them
    const maxCtxLen = backend === 'webllm' ? 1400 : 5000;
    if (context.length > maxCtxLen) {
      context = context.slice(0, maxCtxLen) + '\n…(data truncated for model context limit)';
    }

    const ctxBlock = `=== LIVE DATA ===\n${context}\n=================\n\nQuestion: ${q || 'Describe what you see in the image(s).'}`;
    const replyId = addMsg('assistant', '', [], true);

    // Create a fresh AbortController for this generation
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const onToken = (_, full) => {
        if (!ctrl.signal.aborted) updateMsg(replyId, full, true);
      };

      if (backend === 'webllm') {
        if (!wlEngineRef.current) throw new Error('Model not loaded — click "Load Model" first.');
        if (imgs.length) throw new Error('Image input is not supported by WebLLM. Switch to Ollama with a vision model (e.g. llava).');
        await streamWebLLM(wlEngineRef.current, SYSTEM_PROMPT, ctxBlock, onToken, ctrl.signal);
      } else {
        if (!olModels?.length) throw new Error('Ollama not reachable. Start Ollama and refresh.');
        const model = olModel || olModels[0];
        await streamOllama(olHost, model, SYSTEM_PROMPT, ctxBlock, onToken, imgs, ctrl.signal);
      }
    } catch (e) {
      // AbortError = user stopped; don't show an error message
      if (!ctrl.signal.aborted && e.name !== 'AbortError') {
        updateMsg(replyId, `⚠ ${e.message}`, false);
      }
    } finally {
      // Always finalize the message (remove streaming cursor)
      setMessages((prev) => prev.map((m) => m.id === replyId ? { ...m, streaming: false } : m));
      setThinking(false);
    }
  }, [input, pendingImages, thinking, backend, page, wlEngineRef, olHost, olModel, olModels]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-5 right-5 z-50 rounded-full shadow-lg flex items-center justify-center transition-all ${open ? 'bg-slate-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
        style={{ width: 52, height: 52 }}
        title="AI Assistant"
      >
        {open ? <X size={20} className="text-white" /> : <MessageCircle size={22} className="text-white" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className={`fixed bottom-20 right-5 z-50 flex flex-col w-[380px] max-w-[calc(100vw-1.5rem)] h-[580px] max-h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-2xl border overflow-hidden transition-colors ${isDragging ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-200'}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay hint */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-indigo-50/90 flex flex-col items-center justify-center rounded-2xl pointer-events-none">
              <Image size={32} className="text-indigo-400 mb-2" />
              <p className="text-sm text-indigo-600 font-medium">Drop image to attach</p>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white shrink-0">
            <Bot size={18} />
            <span className="font-semibold text-sm flex-1">AI Assistant</span>
            <div className="flex gap-1 bg-indigo-700 rounded-lg p-0.5">
              <button
                onClick={() => { setBackend('ollama'); if (olModels === null) probeOllama(); }}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${backend === 'ollama' ? 'bg-white text-indigo-700' : 'text-indigo-200 hover:text-white'}`}
                title="Ollama (local server)"
              >
                <Server size={11} /> Ollama
              </button>
              <button
                onClick={() => setBackend('webllm')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${backend === 'webllm' ? 'bg-white text-indigo-700' : 'text-indigo-200 hover:text-white'}`}
                title="WebLLM (browser inference)"
              >
                <Zap size={11} /> WebLLM
              </button>
            </div>
          </div>

          {/* Backend status / config bar */}
          {backend === 'ollama' && (
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-xs shrink-0">
              {olChecking ? (
                <><ThinkingDots /><span className="text-slate-400 ml-1">Checking…</span></>
              ) : olModels === null ? (
                <span className="text-slate-400">Ollama status unknown</span>
              ) : olModels.length === 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                  <span className="text-red-600">Ollama not reachable</span>
                  <button onClick={probeOllama} className="ml-auto text-slate-500 hover:text-slate-700"><RefreshCw size={11} /></button>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-emerald-700">Ready</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <select
                      className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 max-w-[140px] truncate"
                      value={olModel}
                      onChange={(e) => setOlModel(e.target.value)}
                    >
                      {olModels.map((m) => <option key={m}>{m}</option>)}
                    </select>
                    <button onClick={() => setShowOlCfg((v) => !v)} className="text-slate-400 hover:text-slate-600">
                      <Settings size={12} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {showOlCfg && backend === 'ollama' && (
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs flex gap-2 items-center shrink-0">
              <span className="text-slate-500 whitespace-nowrap">Host:</span>
              <input
                className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 min-w-0"
                value={olHost}
                onChange={(e) => setOlHost(e.target.value)}
                onBlur={probeOllama}
                placeholder="http://localhost:11434"
              />
            </div>
          )}

          {backend === 'webllm' && (
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs shrink-0">
              {!webgpu ? (
                <p className="text-amber-600">⚠ Your browser doesn&apos;t support WebGPU. Use Chrome 113+ or switch to Ollama.</p>
              ) : wlStatus === 'idle' ? (
                <div className="flex items-center gap-2">
                  <select
                    className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white text-slate-700"
                    value={wlModel}
                    onChange={(e) => { setWlModel(e.target.value); setWlStatus('idle'); }}
                  >
                    {WEBLLM_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <button onClick={loadModel} className="shrink-0 bg-indigo-600 text-white rounded-lg px-3 py-1 text-xs font-medium hover:bg-indigo-700">Load</button>
                </div>
              ) : wlStatus === 'loading' ? (
                <div>
                  <div className="flex justify-between text-slate-500 mb-1">
                    <span className="truncate max-w-[240px]">{wlProgress.text}</span>
                    <span>{wlProgress.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${wlProgress.pct}%` }} />
                  </div>
                </div>
              ) : wlStatus === 'ready' ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-emerald-700 truncate">{WEBLLM_MODELS.find((m) => m.id === wlModel)?.label}</span>
                  <button onClick={() => { unloadWebLLM(); wlEngineRef.current = null; setWlStatus('idle'); }} className="ml-auto text-slate-400 hover:text-red-500 text-xs">Unload</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-red-600 truncate">{wlProgress.text || 'Error loading model'}</span>
                  <button onClick={() => setWlStatus('idle')} className="ml-auto text-slate-500 hover:text-slate-700 text-xs">Retry</button>
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50 min-h-0">
            {messages.map((m) => <MsgBubble key={m.id ?? m.content} msg={m} />)}

            {/* Thinking indicator with hover-stop */}
            {thinking && !messages.at(-1)?.streaming && (
              <div className="flex gap-2 justify-start group">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={14} className="text-indigo-600" />
                </div>
                <div className="relative bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm flex items-center min-w-[70px]">
                  <ThinkingDots />
                  {/* Hover overlay: stop button */}
                  <button
                    onClick={stop}
                    className="absolute inset-0 rounded-2xl rounded-bl-sm flex items-center justify-center gap-1.5 bg-white/95 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium text-red-500 hover:text-red-700"
                    title="Stop generating"
                  >
                    <Square size={12} fill="currentColor" /> Stop
                  </button>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 2 && (
            <div className="px-3 pb-2 pt-1.5 flex flex-wrap gap-1.5 border-t border-slate-100 bg-white shrink-0">
              {QUICK_PROMPTS.map((q) => (
                <button key={q} onClick={() => send(q)} disabled={thinking}
                  className="text-xs px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 text-slate-600 transition-colors disabled:opacity-40">
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Pending image thumbnails */}
          {pendingImages.length > 0 && (
            <div className="px-3 pt-2 pb-1 flex flex-wrap gap-2 border-t border-slate-100 bg-white shrink-0">
              {pendingImages.map((src, i) => (
                <div key={i} className="relative group">
                  <img src={src} alt="" className="h-16 w-16 object-cover rounded-lg border border-slate-200" />
                  <button
                    onClick={() => setPendingImages((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <XCircle size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input row */}
          <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-white flex gap-2 items-end shrink-0">
            <textarea
              ref={textareaRef}
              rows={1}
              className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-slate-400 bg-slate-50 max-h-28 min-h-[38px]"
              placeholder={pendingImages.length ? 'Ask about the image… (or paste another)' : 'Ask about production, efficiency, attendance…'}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={handleKey}
              onPaste={handlePaste}
              disabled={thinking}
            />
            {thinking ? (
              <button
                onClick={stop}
                className="w-9 h-9 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shrink-0"
                title="Stop generating"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!input.trim() && !pendingImages.length}
                className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white flex items-center justify-center transition-colors shrink-0"
              >
                <Send size={15} />
              </button>
            )}
          </div>
          {/* Paste hint */}
          <p className="text-center text-[10px] text-slate-300 pb-1.5 -mt-1 bg-white shrink-0">
            Paste or drag &amp; drop images to attach
          </p>
        </div>
      )}
    </>
  );
}
