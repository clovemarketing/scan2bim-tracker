import { api } from './api';

function toHhmm(mins) {
  if (!mins || isNaN(mins)) return '0h 0m';
  const m = Math.round(Math.abs(parseFloat(mins)));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60 > 0 ? m % 60 + 'm' : ''}`.trim();
}

function pct(a, b) { return b > 0 ? ((a / b) * 100).toFixed(1) + '%' : 'n/a'; }

function today() { return new Date().toISOString().slice(0, 10); }
function thisMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}

// ── Per-page configs ──────────────────────────────────────────────────────────

const CONFIGS = {

  dashboard: {
    label: 'Dashboard',
    systemPrompt: 'You are a BIM production operations analyst. Given dashboard metrics, provide a concise executive summary: highlight attendance health, production output, efficiency, and 2–3 actionable observations. Use bullet points. Max 8 lines.',
    async fetch() {
      const [dash, att] = await Promise.allSettled([api.dashboard(), api.attendanceToday(today())]);
      return { dash: dash.value, att: att.value };
    },
    buildData({ dash, att }) {
      if (!dash) return 'Dashboard data unavailable.';
      const lines = [
        `Date: ${today()}`,
        `Employees: ${dash.totalEmployees} active | Attendance today: Present=${dash.present} Absent=${dash.absent} Leave=${dash.leave} WFH=${dash.wfh} (${dash.attendanceRate}%)`,
        `Projects: ${dash.inProgress} In-Progress | ${dash.completed} Completed`,
        `Hours today: ${toHhmm(dash.hoursToday)} logged across ${dash.totalPhSessions || 'N/A'} sessions (all-time)`,
        `Overall efficiency (all-time): ${(dash.overallEff * 100).toFixed(1)}% | Total logged: ${toHhmm(dash.totalLoggedHrs)}`,
      ];
      if (dash.projStats?.length) {
        lines.push('\nTop projects by hours spent:');
        dash.projStats.slice(0, 5).forEach((p) =>
          lines.push(`  ${p.projName}: ${toHhmm(p.spent)} spent | eff ${(p.avgEff * 100).toFixed(0)}% | ${p.sessions} sessions`)
        );
      }
      if (dash.empEff?.length) {
        lines.push('\nTop employees by hours:');
        dash.empEff.slice(0, 5).forEach((e) =>
          lines.push(`  ${e.empName}: ${toHhmm(e.totalHrs)} | eff ${(e.avgEff * 100).toFixed(0)}%`)
        );
      }
      return lines.join('\n');
    },
  },

  employees: {
    label: 'Employees',
    systemPrompt: 'You are an HR analyst for a BIM production firm. Summarize the workforce: active vs inactive, department spread, designation mix, and any notable patterns. Use bullet points. Max 8 lines.',
    async fetch() { return api.employees(); },
    buildData(d) {
      const rows = d?.data || [];
      if (!rows.length) return 'No employee data.';
      const active = rows.filter((r) => r[6] === 'Active');
      const depts = {}, designations = {};
      active.forEach((r) => {
        const dep = r[4] || 'Other'; depts[dep] = (depts[dep] || 0) + 1;
        const des = r[5] || 'Other'; designations[des] = (designations[des] || 0) + 1;
      });
      return [
        `Total: ${rows.length} employees | Active: ${active.length} | Inactive: ${rows.length - active.length}`,
        'Departments: ' + Object.entries(depts).map(([k, v]) => `${k}(${v})`).join(', '),
        'Designations: ' + Object.entries(designations).map(([k, v]) => `${k}(${v})`).join(', '),
      ].join('\n');
    },
  },

  projects: {
    label: 'Projects',
    systemPrompt: 'You are a BIM project manager. Summarize the project pipeline: counts by status, client distribution, projects consuming the most hours, and any concerns. Use bullet points. Max 8 lines.',
    async fetch() { return api.projects(); },
    buildData(d) {
      const rows = d?.data || [];
      if (!rows.length) return 'No project data.';
      const statuses = {}, clients = {};
      rows.forEach((r) => {
        const s = r[3] || 'Unknown'; statuses[s] = (statuses[s] || 0) + 1;
        const c = r[2] || 'Unknown'; clients[c] = (clients[c] || 0) + 1;
      });
      const inProg = rows.filter((r) => r[3] === 'In Progress');
      return [
        `Total projects: ${rows.length}`,
        'By status: ' + Object.entries(statuses).map(([k, v]) => `${k}=${v}`).join(' | '),
        `Top clients: ${Object.entries(clients).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}(${v})`).join(', ')}`,
        inProg.length ? `In-Progress projects: ${inProg.map((r) => r[1] || r[0]).slice(0, 8).join(', ')}` : '',
      ].filter(Boolean).join('\n');
    },
  },

  attendance: {
    label: 'Attendance',
    systemPrompt: 'You are an attendance analyst for a BIM team. Summarize today\'s attendance status and flag any concerns (high absenteeism, no sessions logged, etc.). Use bullet points. Max 7 lines.',
    async fetch() { return api.attendanceToday(today()); },
    buildData(d) {
      const emps = d?.employees || [];
      if (!emps.length) return 'No attendance data for today.';
      const counts = {};
      let sessions = 0, hrs = 0;
      emps.forEach((e) => {
        const s = e.dayStatus || '?'; counts[s] = (counts[s] || 0) + 1;
        (e.sessions || []).forEach((se) => { sessions++; hrs += parseFloat(se.hrsWorked) || 0; });
      });
      return [
        `Date: ${today()} | Total staff tracked: ${emps.length}`,
        `Status: Present=${counts.P || 0} | Absent=${counts.A || 0} | Leave=${counts.L || 0} | WFH=${counts.WFH || 0} | HD=${counts.HD || 0} | OD=${counts.OD || 0} | Holiday=${counts.H || 0}`,
        `Sessions logged: ${sessions} | Hours worked: ${toHhmm(hrs)}`,
        (counts.A || 0) > (emps.length * 0.3) ? '⚠ High absenteeism today (>30%)' : '',
      ].filter(Boolean).join('\n');
    },
  },

  'project-hours': {
    label: 'Project Hours',
    systemPrompt: 'You are a BIM production analyst. Given project hours data for the past 7 days, summarize: total production, top contributors, efficiency bands, and any anomalies. Use bullet points. Max 8 lines.',
    async fetch() {
      const [ph, att] = await Promise.allSettled([api.projectHours(), api.attendanceToday(today())]);
      return { ph: ph.value, att: att.value };
    },
    buildData({ ph }) {
      const rows = ph?.data || [];
      if (!rows.length) return 'No project hours data.';
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
      const cutStr = cutoff.toISOString().slice(0, 10);
      const recent = rows.filter((r) => r[1] && r[1] >= cutStr);
      if (!recent.length) return 'No sessions in the last 7 days.';
      const empAgg = {}, projAgg = {};
      let totalSpent = 0, totalReq = 0, totalAct = 0;
      recent.forEach((r) => {
        const sp = parseFloat(r[8]) || 0, rq = parseFloat(r[9]) || 0, ac = parseFloat(r[10]) || 0;
        totalSpent += sp; totalReq += rq; totalAct += ac;
        const en = r[3] || 'Unknown';
        if (!empAgg[en]) empAgg[en] = { spent: 0, req: 0, act: 0 };
        empAgg[en].spent += sp; empAgg[en].req += rq; empAgg[en].act += ac;
        const pn = r[6] || r[5] || 'Unknown';
        if (!projAgg[pn]) projAgg[pn] = 0;
        projAgg[pn] += sp;
      });
      const topEmps = Object.entries(empAgg).sort((a, b) => b[1].spent - a[1].spent).slice(0, 5)
        .map(([n, d]) => `  ${n}: ${toHhmm(d.spent)} (eff ${pct(d.act, d.req)})`);
      const topProjs = Object.entries(projAgg).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([n, v]) => `  ${n}: ${toHhmm(v)}`);
      return [
        `Period: Last 7 days | Sessions: ${recent.length} | Employees: ${Object.keys(empAgg).length}`,
        `Total: Spent=${toHhmm(totalSpent)} | Req Eff=${toHhmm(totalReq)} | Act Eff=${toHhmm(totalAct)} | Overall=${pct(totalAct, totalReq)}`,
        'Top Employees:\n' + topEmps.join('\n'),
        'Top Projects:\n' + topProjs.join('\n'),
      ].join('\n');
    },
  },

  'project-hours-analytics': {
    label: 'Project Hours Analytics',
    systemPrompt: 'You are a BIM production efficiency analyst. Summarize the analytics view: highlight efficiency trends, underperforming employees or projects, and recommendations. Use bullet points. Max 8 lines.',
    async fetch() { return api.projectHours(); },
    buildData(ph) {
      const rows = ph?.data || [];
      if (!rows.length) return 'No analytics data.';
      const empAgg = {};
      rows.forEach((r) => {
        const en = r[3] || 'Unknown';
        if (!empAgg[en]) empAgg[en] = { spent: 0, req: 0, act: 0 };
        empAgg[en].spent += parseFloat(r[8]) || 0;
        empAgg[en].req   += parseFloat(r[9]) || 0;
        empAgg[en].act   += parseFloat(r[10]) || 0;
      });
      const emps = Object.entries(empAgg).map(([n, d]) => ({ n, ...d, eff: d.req > 0 ? d.act / d.req : 0 }));
      const high = emps.filter((e) => e.eff >= 1).length;
      const mid  = emps.filter((e) => e.eff >= 0.85 && e.eff < 1).length;
      const low  = emps.filter((e) => e.eff < 0.85 && e.req > 0).length;
      const totalReq = emps.reduce((s, e) => s + e.req, 0);
      const totalAct = emps.reduce((s, e) => s + e.act, 0);
      const underperformers = emps.filter((e) => e.eff < 0.85 && e.req > 0)
        .sort((a, b) => a.eff - b.eff).slice(0, 3)
        .map((e) => `  ${e.n}: ${(e.eff * 100).toFixed(0)}%`);
      return [
        `All-time sessions: ${rows.length} | Employees: ${emps.length}`,
        `Overall efficiency: ${pct(totalAct, totalReq)}`,
        `Efficiency bands: High(≥100%)=${high} | Medium(85–99%)=${mid} | Low(<85%)=${low}`,
        low > 0 ? 'Low-efficiency employees:\n' + underperformers.join('\n') : '',
      ].filter(Boolean).join('\n');
    },
  },

  'project-progress': {
    label: 'Project Progress',
    systemPrompt: 'You are a BIM project progress analyst. Summarize in-progress projects: hours consumed vs client budget, which are over budget or nearly complete, and prioritization suggestions. Use bullet points. Max 8 lines.',
    async fetch() { return api.inProgressProjects(); },
    buildData(projects) {
      const rows = Array.isArray(projects) ? projects : [];
      if (!rows.length) return 'No in-progress projects.';
      const lines = [`In-Progress Projects: ${rows.length}`];
      const overBudget = rows.filter((r) => {
        const clientHrs = parseFloat(r[7]) || 0;
        const spent = parseFloat(r[8]) || 0;
        return clientHrs > 0 && spent / 60 > clientHrs;
      });
      if (overBudget.length) lines.push(`⚠ Over-budget: ${overBudget.map((r) => r[1] || r[0]).join(', ')}`);
      rows.slice(0, 8).forEach((r) => {
        const clientHrs = parseFloat(r[7]) || 0;
        const spent = (parseFloat(r[8]) || 0) / 60;
        const rem = clientHrs > 0 ? (clientHrs - spent).toFixed(1) : 'N/A';
        lines.push(`  ${r[1] || r[0]} [${r[2] || 'No client'}]: ${spent.toFixed(1)}h spent${clientHrs > 0 ? ` / ${clientHrs}h budget (${rem}h left)` : ''}`);
      });
      return lines.join('\n');
    },
  },

  qaqc: {
    label: 'QA/QC',
    systemPrompt: 'You are a BIM QA/QC analyst. Summarize the QA/QC project pipeline: pending reviews, hours spent on QC, efficiency, and quality risk flags. Use bullet points. Max 8 lines.',
    async fetch() { return api.qaqcProjects(); },
    buildData(d) {
      const rows = d?.data || [];
      if (!rows.length) return 'No QA/QC projects.';
      let totalSpent = 0, totalReq = 0, totalAct = 0;
      rows.forEach((r) => {
        totalSpent += parseFloat(r[8]) || 0;
        totalReq   += parseFloat(r[9]) || 0;
        totalAct   += parseFloat(r[10]) || 0;
      });
      return [
        `QA/QC Projects: ${rows.length}`,
        `Total hours: Spent=${totalSpent.toFixed(1)}h | Req Eff=${totalReq.toFixed(1)}h | Act Eff=${totalAct.toFixed(1)}h`,
        `Overall efficiency: ${pct(totalAct, totalReq)}`,
        'Projects: ' + rows.slice(0, 6).map((r) => `${r[1] || r[0]}(${(parseFloat(r[8]) || 0).toFixed(1)}h)`).join(', '),
      ].join('\n');
    },
  },

  feedbacks: {
    label: 'Feedbacks',
    systemPrompt: 'You are a BIM client feedback analyst. Summarize the feedback project pipeline: active reviews, hours spent addressing feedback, client distribution, and priority concerns. Use bullet points. Max 8 lines.',
    async fetch() { return api.feedbackProjects(); },
    buildData(d) {
      const rows = d?.data || [];
      if (!rows.length) return 'No feedback projects.';
      const clients = {};
      let totalSpent = 0;
      rows.forEach((r) => {
        const c = r[2] || 'Unknown'; clients[c] = (clients[c] || 0) + 1;
        totalSpent += parseFloat(r[8]) || 0;
      });
      return [
        `Feedback Projects: ${rows.length} | Total hours: ${totalSpent.toFixed(1)}h`,
        'Clients: ' + Object.entries(clients).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}(${v})`).join(', '),
        'Recent: ' + rows.slice(0, 5).map((r) => r[1] || r[0]).join(', '),
      ].join('\n');
    },
  },

  'division-targets': {
    label: 'Division Targets',
    systemPrompt: 'You are a BIM division performance analyst. Compare team lead targets vs actual production this month. Identify who is ahead, behind, or at risk. Use bullet points. Max 8 lines.',
    async fetch() {
      const { year, month } = thisMonth();
      const [targets, ph] = await Promise.allSettled([
        api.getDivTargets(year, month),
        api.projectHours(),
      ]);
      return { targets: targets.value, ph: ph.value, year, month };
    },
    buildData({ targets, ph, year, month }) {
      if (!targets) return 'Division targets data unavailable.';
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
      const rows = ph?.data || [];
      const monthRows = rows.filter((r) => r[1] && r[1].startsWith(prefix));
      const leadAgg = {};
      monthRows.forEach((r) => {
        const lead = r[13] || 'Unknown';
        if (!leadAgg[lead]) leadAgg[lead] = 0;
        leadAgg[lead] += parseFloat(r[8]) || 0;
      });
      const divTarget = targets.divisionTarget || 0;
      const tlTargets = targets.targets || {};
      const totalActual = Object.values(leadAgg).reduce((s, v) => s + v, 0);
      const lines = [
        `Month: ${prefix} | Division Target: ${toHhmm(divTarget)} | Actual: ${toHhmm(totalActual)} (${pct(totalActual, divTarget)})`,
      ];
      Object.entries(tlTargets).forEach(([lead, target]) => {
        const actual = leadAgg[lead] || 0;
        const status = actual >= target ? '✓' : actual >= target * 0.8 ? '~' : '⚠';
        lines.push(`  ${status} ${lead}: ${toHhmm(actual)} / ${toHhmm(target)} (${pct(actual, target)})`);
      });
      return lines.join('\n');
    },
  },

  'month-end-summary': {
    label: 'Month-End Summary',
    systemPrompt: 'You are a BIM operations analyst preparing a month-end review. Summarize total production, per-employee performance, efficiency, and outstanding items. Use bullet points. Max 9 lines.',
    async fetch() {
      const { year, month } = thisMonth();
      return api.monthEndSummary(year, month);
    },
    buildData(d) {
      if (!d) return 'Month-end summary data unavailable.';
      const { year, month } = thisMonth();
      const monthLabel = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
      const emps = d.employees || [];
      const totalSpent = emps.reduce((s, e) => s + (e.spent || 0), 0);
      const totalReq   = emps.reduce((s, e) => s + (e.reqEff || 0), 0);
      const totalAct   = emps.reduce((s, e) => s + (e.actEff || 0), 0);
      const topEmps = emps.sort((a, b) => (b.spent || 0) - (a.spent || 0)).slice(0, 5)
        .map((e) => `  ${e.empName || e.empId}: ${toHhmm(e.spent || 0)} (eff ${pct(e.actEff || 0, e.reqEff || 0)})`);
      return [
        `Period: ${monthLabel}`,
        `Total: Spent=${toHhmm(totalSpent)} | Req Eff=${toHhmm(totalReq)} | Act Eff=${toHhmm(totalAct)} | Eff=${pct(totalAct, totalReq)}`,
        `Active employees this month: ${emps.length}`,
        emps.length ? 'Top contributors:\n' + topEmps.join('\n') : '',
      ].filter(Boolean).join('\n');
    },
  },

  'shift-roster': {
    label: 'Shift Roster',
    systemPrompt: 'You are a BIM workforce scheduler. Summarize current shift roster patterns and flag any scheduling gaps or imbalances. Use bullet points. Max 6 lines.',
    async fetch() { return api.employees(); },
    buildData(d) {
      const rows = (d?.data || []).filter((r) => r[6] === 'Active');
      if (!rows.length) return 'No employee data for roster.';
      const shifts = {}, weekOffs = {};
      rows.forEach((r) => {
        const sh = r[13] || 'Default'; shifts[sh] = (shifts[sh] || 0) + 1;
        const wo = r[14] || 'Fri/Sat'; weekOffs[wo] = (weekOffs[wo] || 0) + 1;
      });
      return [
        `Active staff: ${rows.length}`,
        'Shifts: ' + Object.entries(shifts).map(([k, v]) => `${k}(${v})`).join(', '),
        'Week-off patterns: ' + Object.entries(weekOffs).map(([k, v]) => `${k}(${v})`).join(', '),
      ].join('\n');
    },
  },

  data: {
    label: 'Data Management',
    systemPrompt: 'You are a system administrator. Provide a brief status overview of the data management system and any maintenance recommendations.',
    async fetch() { return null; },
    buildData() { return 'Data management page — no live metrics to summarize.'; },
  },

  settings: {
    label: 'Settings',
    systemPrompt: 'You are a system configuration advisor. Review the current settings and provide brief recommendations.',
    async fetch() { return api.settings(); },
    buildData(d) {
      const rows = d?.data || d || [];
      if (!rows.length) return 'Settings data unavailable.';
      return `Settings loaded: ${rows.length} configuration rows.`;
    },
  },
};

// Fallback for unknown pages
const FALLBACK = {
  label: 'Page',
  systemPrompt: 'You are a BIM production analyst. Provide a brief status insight based on available data.',
  async fetch() { return api.dashboard(); },
  buildData(d) { return d ? `Dashboard summary available.` : 'No data available.'; },
};

export async function getPageInsight(page) {
  const cfg = CONFIGS[page] || FALLBACK;
  const raw = await cfg.fetch();
  const dataText = cfg.buildData(raw);
  return { label: cfg.label, systemPrompt: cfg.systemPrompt, dataText };
}
