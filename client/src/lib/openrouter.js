const OR_BASE = 'https://openrouter.ai/api/v1';

export const OR_MODELS = [
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free',            label: 'Nemotron 3 Nano 30B (Free Unlimited)',       vision: false },
  { id: 'nvidia/nemotron-3-super:free',                   label: 'Nemotron 3 Super (Free Unlimited)',           vision: false },
  { id: 'nvidia/nemotron-nano-9b-v2:free',                label: 'Nemotron Nano 9B V2 (Free Unlimited)',       vision: false },
  { id: 'nvidia/nemotron-nano-12b-2-vl:free',             label: 'Nemotron Nano 12B VL (Free · Vision)',       vision: true  },
  { id: 'google/gemma-4-31b:free',                        label: 'Gemma 4 31B (Free · Vision)',                vision: true  },
  { id: 'deepseek/deepseek-v4-flash:free',                label: 'DeepSeek V4 Flash (Free)',                   vision: false },
  { id: 'openrouter/free',                                label: 'Auto: Best Free Model',                      vision: false },
];

export const DEFAULT_OR_MODEL = OR_MODELS[0].id;
export const LS_OR_MODEL = 'or_model';

export function getOrKey() {
  return import.meta.env.VITE_OPENROUTER_API_KEY || '';
}

export async function fetchOrKey() {
  try {
    const res = await fetch('/api/openrouter-key');
    const data = await res.json();
    return data.key || '';
  } catch {
    return '';
  }
}

// images: array of data-URL strings (data:image/...;base64,...)
export async function streamOpenRouter(apiKey, model, systemPrompt, userMessage, onToken, images = []) {
  const userContent = images.length > 0
    ? [
        { type: 'text', text: userMessage },
        ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
      ]
    : userMessage;

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Scan2BIM Tracker',
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`OpenRouter error: ${err}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = '';
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t || t === 'data: [DONE]' || !t.startsWith('data: ')) continue;
      try {
        const json = JSON.parse(t.slice(6));
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) { full += delta; onToken(delta, full); }
      } catch { /* skip malformed */ }
    }
  }
  return full;
}
