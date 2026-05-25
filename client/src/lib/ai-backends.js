// ── WebLLM (browser-native inference via WebGPU) ─────────────────────────────

export const WEBLLM_MODELS = [
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',    label: 'Phi-3.5 Mini  · 2.2 GB  (Recommended)' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',    label: 'Llama 3.2 3B · 1.9 GB' },
  { id: 'Qwen2.5-3B-Instruct-q4f32_1-MLC',      label: 'Qwen 2.5 3B  · 1.8 GB' },
  { id: 'gemma-2-2b-it-q4f16_1-MLC',            label: 'Gemma 2 2B   · 1.2 GB  (Fastest)' },
  { id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC', label: 'TinyLlama 1.1B · 0.6 GB (Lightest)' },
];

export function supportsWebGPU() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

let _engine = null;
let _loadedModel = null;
let _loadPromise = null;

export async function loadWebLLM(modelId, onProgress) {
  if (_engine && _loadedModel === modelId) return _engine;
  if (_engine) {
    try { await _engine.unload(); } catch { /* ignore */ }
    _engine = null; _loadedModel = null;
  }
  if (_loadPromise) await _loadPromise.catch(() => {});
  const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
  _loadPromise = CreateMLCEngine(modelId, {
    initProgressCallback: (info) => onProgress(info.text, info.progress),
  });
  _engine = await _loadPromise;
  _loadedModel = modelId;
  _loadPromise = null;
  return _engine;
}

// signal: optional AbortSignal to cancel mid-stream
export async function streamWebLLM(engine, systemPrompt, userMessage, onToken, signal = null) {
  const stream = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage  },
    ],
    stream: true,
    temperature: 0.2,
    max_tokens: 800,
  });

  let full = '';
  for await (const chunk of stream) {
    if (signal?.aborted) break;
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) { full += delta; onToken(delta, full); }
  }
  return full;
}

export function unloadWebLLM() {
  if (_engine) { _engine.unload().catch(() => {}); _engine = null; _loadedModel = null; }
}

// ── Ollama (local server — http://localhost:11434) ────────────────────────────

const isLocal = typeof window !== 'undefined' && /^localhost|127\.0\.0\.1|\[::1\]$/.test(window.location.hostname);

export async function checkOllama(host = 'http://localhost:11434') {
  try {
    const url = isLocal
      ? `${host}/api/tags`
      : `/api/ollama/proxy/api/tags?host=${encodeURIComponent(host)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.models || []).map((m) => m.name);
  } catch { return null; }
}

function parseOllamaError(raw = '') {
  try {
    const obj = JSON.parse(raw);
    const msg = obj.error || raw;
    if (msg.includes('unable to load model')) {
      const blob = msg.match(/sha256-[a-f0-9]+/)?.[0] || 'model blob';
      return `Ollama model corrupted (${blob.slice(0, 16)}…). Fix:\n1. Run: ollama rm <model-name>\n2. Run: ollama pull <model-name>\nThen re-select the model here.`;
    }
    if (msg.includes('model') && msg.includes('not found')) {
      return `Ollama model not found. Run: ollama pull <model-name> in your terminal.`;
    }
    return `Ollama: ${msg}`;
  } catch {
    return raw ? `Ollama: ${raw}` : 'Ollama error (unknown)';
  }
}

// images: array of base64 data-URL strings (data:image/...;base64,...)
// signal: optional AbortSignal to cancel mid-stream
export async function streamOllama(host, model, systemPrompt, userMessage, onToken, images = [], signal = null) {
  const userMsg = images.length > 0
    ? { role: 'user', content: userMessage, images: images.map((d) => d.split(',')[1] || d) }
    : { role: 'user', content: userMessage };

  const url = isLocal ? `${host}/api/chat` : `/api/ollama/proxy/api/chat?host=${encodeURIComponent(host)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: 'system', content: systemPrompt }, userMsg],
      options: { temperature: 0.2 },
    }),
    signal,
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => res.statusText);
    throw new Error(parseOllamaError(raw));
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = '';
  let buf = '';

  while (true) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        const delta = json.message?.content || '';
        if (delta) { full += delta; onToken(delta, full); }
        if (json.done) return full;
      } catch { /* skip malformed */ }
    }
  }
  return full;
}
