import { api } from './api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toHhmm(mins) {
  if (!mins || isNaN(mins)) return '0h 0m';
  const m = Math.round(Math.abs(parseFloat(mins)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
}

function parseRowDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split('/');
  if (parts.length === 3) {
    const [mo, d, y] = parts;
    const yr = y.length === 2 ? '20' + y : y;
    return `${yr}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function daysBackFromQuestion(q) {
  const explicit = q.match(/(\d+)\s*days?/i);
  if (explicit) return parseInt(explicit[1]);
  if (/\b(this\s+)?month\b/i.test(q)) return 30;
  if (/\b(this\s+)?week\b/i.test(q)) return 7;
  if (/\btoday\b/i.test(q)) return 0;
  return 7; // default look-back
}

// ── Context builder ───────────────────────────────────────────────────────────

export async function buildDataContext(question) {
  const today = new Date().toISOString().slice(0, 10);
  const daysBack = daysBackFromQuestion(question);
  const sections = [];

  sections.push(`Reference date: ${today} | Period requested: ${daysBack === 0 ? 'today only' : `last ${daysBack} days`}`);

  // ── 1. Today's attendance ────────────────────────────────────────────────
  try {
    const att = await api.attendanceToday(today);
    const emps = att?.employees || [];
    if (emps.length > 0) {
      const counts = {};
      let sessions = 0, hrs = 0;
      emps.forEach((e) => {
        const s = e.dayStatus || '?';
        counts[s] = (counts[s] || 0) + 1;
        (e.sessions || []).forEach((sess) => {
          sessions++;
          hrs += parseFloat(sess.hrsWorked) || 0;
        });
      });
      sections.push(
        `ATTENDANCE TODAY (${today}):\n` +
        `  Total staff: ${emps.length}\n` +
        `  Present: ${counts.P || 0}  Absent: ${counts.A || 0}  Leave: ${counts.L || 0}  ` +
        `WFH: ${counts.WFH || 0}  Half-Day: ${counts.HD || 0}  On-Duty: ${counts.OD || 0}  Holiday: ${counts.H || 0}\n` +
        `  Sessions logged: ${sessions}  |  Hours logged: ${toHhmm(hrs)}`
      );
    }
  } catch { /* attendance unavailable */ }

  // ── 2. Project hours for the requested period ────────────────────────────
  try {
    const ph = await api.projectHours();
    const rows = ph.data || [];

    let filtered;
    if (daysBack === 0) {
      filtered = rows.filter((r) => parseRowDate(r[1]) === today);
    } else {
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() - daysBack);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      filtered = rows.filter((r) => {
        const d = parseRowDate(r[1]);
        return d && d >= cutoffStr;
      });
    }

    if (filtered.length > 0) {
      const totalSpent = filtered.reduce((s, r) => s + (parseFloat(r[8]) || 0), 0);
      const totalReq   = filtered.reduce((s, r) => s + (parseFloat(r[9]) || 0), 0);
      const totalAct   = filtered.reduce((s, r) => s + (parseFloat(r[10]) || 0), 0);
      const avgEff     = totalReq > 0 ? (totalAct / totalReq * 100) : 0;

      // Per-employee aggregation
      const empAgg = {};
      filtered.forEach((r) => {
        const name = r[3] || 'Unknown';
        if (!empAgg[name]) empAgg[name] = { spent: 0, req: 0, act: 0 };
        empAgg[name].spent += parseFloat(r[8]) || 0;
        empAgg[name].req   += parseFloat(r[9]) || 0;
        empAgg[name].act   += parseFloat(r[10]) || 0;
      });

      // Per-project aggregation
      const projAgg = {};
      filtered.forEach((r) => {
        const name = r[6] || r[5] || 'Unknown';
        if (!projAgg[name]) projAgg[name] = { spent: 0, sessions: 0 };
        projAgg[name].spent    += parseFloat(r[8]) || 0;
        projAgg[name].sessions += 1;
      });

      const label = daysBack === 0 ? 'Today' : `Last ${daysBack} Days`;

      const topEmps = Object.entries(empAgg)
        .sort((a, b) => b[1].spent - a[1].spent)
        .slice(0, 10)
        .map(([name, d]) => {
          const eff = d.req > 0 ? (d.act / d.req * 100).toFixed(1) + '%' : 'n/a';
          return `    ${name}: ${toHhmm(d.spent)}  eff ${eff}`;
        });

      const topProjs = Object.entries(projAgg)
        .sort((a, b) => b[1].spent - a[1].spent)
        .slice(0, 8)
        .map(([name, d]) => `    ${name}: ${toHhmm(d.spent)} (${d.sessions} sessions)`);

      const effBand = (pct) => pct >= 100 ? 'High (≥100%)' : pct >= 85 ? 'Medium (85–99%)' : 'Low (<85%)';
      const empEffBands = { high: 0, mid: 0, low: 0 };
      Object.values(empAgg).forEach((d) => {
        const pct = d.req > 0 ? d.act / d.req * 100 : 0;
        if (pct >= 100) empEffBands.high++;
        else if (pct >= 85) empEffBands.mid++;
        else empEffBands.low++;
      });

      sections.push(
        `PROJECT HOURS — ${label}:\n` +
        `  Sessions: ${filtered.length}  |  Employees: ${Object.keys(empAgg).length}  |  Projects: ${Object.keys(projAgg).length}\n` +
        `  Total Spent Time  : ${toHhmm(totalSpent)}\n` +
        `  Req Efficiency Hrs: ${toHhmm(totalReq)}\n` +
        `  Act Efficiency Hrs: ${toHhmm(totalAct)}\n` +
        `  Average Efficiency: ${avgEff.toFixed(1)}%\n` +
        `  Efficiency bands: High=${empEffBands.high} | Medium=${empEffBands.mid} | Low=${empEffBands.low}\n\n` +
        `  Top Employees by Hours:\n${topEmps.join('\n')}\n\n` +
        `  Top Projects by Hours:\n${topProjs.join('\n')}`
      );
    } else {
      sections.push(`PROJECT HOURS: No sessions found for ${daysBack === 0 ? 'today' : `the last ${daysBack} days`}.`);
    }
  } catch { /* project hours unavailable */ }

  return sections.join('\n\n---\n\n');
}

export const SYSTEM_PROMPT = `You are an AI assistant embedded in Scan2BIM Tracker — a construction BIM production tracking system.
You are given real-time data snapshots below. Answer the user's question concisely and factually using only that data.
- Use bullet points or short tables when listing multiple values.
- If a metric isn't in the data, say so clearly.
- Keep answers brief (3–8 lines unless a list is needed).
- Do not invent numbers. If data is absent, say "data not available".`;
