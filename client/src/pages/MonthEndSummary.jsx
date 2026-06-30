import { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  RefreshCw, Download, Upload, Calendar, Users, Briefcase,
  Clock, Target, TrendingUp, BarChart2,
} from 'lucide-react';
import { api } from '../lib/api';
import { decToHHMM, hhmmToDec } from '../lib/formatters';
import LoadingScreen from '../components/LoadingScreen';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="card flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color || 'bg-indigo-50'}`}><Icon size={18} className={color ? 'text-white' : 'text-indigo-600'} /></div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-800">{value}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

function EffBadge({ val }) {
  const v = parseFloat(val) || 0;
  if (v === 0) return <span className="text-slate-300">—</span>;
  const pct = v * 100;
  const cls = pct >= 100 ? 'text-emerald-600 bg-emerald-50' : pct >= 85 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{pct.toFixed(1)}%</span>;
}

function PctBadge({ val, invert }) {
  const v = parseFloat(val) || 0;
  if (v === 0) return <span className="text-slate-300">—</span>;
  if (invert) {
    const cls = v <= 0 ? 'text-emerald-600 bg-emerald-50' : v <= 20 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
    return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{v.toFixed(1)}%</span>;
  }
  const cls = v >= 100 ? 'text-emerald-600 bg-emerald-50' : v >= 85 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{v.toFixed(1)}%</span>;
}

export default function MonthEndSummary({ toast }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  const [expandedEmp, setExpandedEmp] = useState(null);
  const [divisionTarget, setDivisionTarget] = useState(0);
  const [teamTargets, setTeamTargets] = useState({});
  const [closingExporting, setClosingExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [result, dt] = await Promise.all([
        api.monthEndSummary(year, month),
        api.getDivTargets(year, month),
      ]);
      setData(result);
      setDivisionTarget(dt.divisionTarget ?? 0);
      setTeamTargets(dt.targets || {});
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [year, month]);

  const monthLabel = `${MONTHS[month]} ${year}`;
  const nextMonthLabel = month === 11 ? `${MONTHS[0]} ${year + 1}` : `${MONTHS[(month + 1) % 12]} ${month === 11 ? year + 1 : year}`;
  const nextMonthFullLabel = month === 11 ? `${MONTHS_FULL[0]} ${year + 1}` : `${MONTHS_FULL[month + 1]} ${year}`;

  // ── Export closing month data (team-lead-wise, with QA/QC & feedback) ──
  const exportCloseMonth = async () => {
    if (!data || closingExporting) return;
    setClosingExporting(true);
    try {
      const [qaqcRes, fbRes, intFbRes] = await Promise.all([
        api.qaqcProjects(),
        api.feedbackProjects(),
        api.internalFeedbackProjects(),
      ]);

      const wb = XLSX.utils.book_new();
      const w = (n) => ({ wch: n });
      const pct = (num, den) => den > 0 ? +((num / den) * 100).toFixed(1) : 0;
      const byTL = (a, b) =>
        (a[4] || a.teamLead || '').localeCompare(b[4] || b.teamLead || '') ||
        (a[0] || a.projId || a.empId || '').localeCompare(b[0] || b.projId || b.empId || '');

      // ── 1. SUMMARY ────────────────────────────────────────────────────
      const activeEmps   = data.employeeSummary.filter((e) => e.sessions > 0).length;
      const activeProjs  = data.projectSummary.filter((p) => p.monthSpentHrs > 0).length;
      const totalSpent   = data.totals.totalSpentHrs;
      const totalClient  = data.totals.totalClientHrs;
      const totalReq     = +(data.employeeSummary.reduce((s, e) => s + e.reqEffHrs, 0) / 60).toFixed(2);
      const totalAct     = +(data.employeeSummary.reduce((s, e) => s + e.actEffHrs, 0) / 60).toFixed(2);
      const summaryAoa = [
        [`Closing Month Summary — ${MONTHS_FULL[month]} ${year}`],
        [],
        ['Metric', 'Value'],
        ['Active Employees', activeEmps, `of ${data.employeeSummary.length} total`],
        ['In Progress Projects', activeProjs, `of ${data.projectSummary.length} total`],
        ['Total Spent Hrs', totalSpent],
        ['Total Client Hrs', totalClient],
        ['Req Eff Hrs', totalReq],
        ['Act Eff Hrs', totalAct],
        ['Overall Eff %', totalReq > 0 ? +((totalAct / totalReq) * 100).toFixed(1) : 0],
        ['Division Target Hrs', divisionTarget],
        ['Carry-over Projects', data.nextMonthProjects.length],
        ['Remaining Client Hrs', data.totals.totalRemainingHrs],
        [],
        ['Team Lead Targets'],
        ['Team Lead', 'Target Hrs'],
        ...Object.entries(teamTargets).sort(([a],[b]) => a.localeCompare(b)).map(([tl, hrs]) => [tl, hrs]),
      ];
      const sumWS = XLSX.utils.aoa_to_sheet(summaryAoa);
      sumWS['!cols'] = [30, 14, 22].map(w);
      XLSX.utils.book_append_sheet(wb, sumWS, 'Summary');

      // ── 2. BY TEAM LEAD ───────────────────────────────────────────────
      const tlMap = {};
      const ensureTL = (tl) => { if (!tlMap[tl]) tlMap[tl] = { emps: [], projs: [] }; };
      data.employeeSummary.forEach((e) => { const tl = e.teamLead || 'Unassigned'; ensureTL(tl); tlMap[tl].emps.push(e); });
      data.projectSummary.forEach((p) => { const tl = p.teamLead || 'Unassigned'; ensureTL(tl); tlMap[tl].projs.push(p); });

      const tlHeaders = ['Team Lead', 'Target Hrs', 'Total Emps', 'Active Emps', 'Projects Active', `${monthLabel} Spent Hrs`, 'Client Hrs Allocated', 'Req Eff Hrs', 'Act Eff Hrs', 'Req Eff %', 'Actual Eff %', 'Emp Avg Eff', 'Client Hrs Earned', 'Achieved %'];
      const tlRows = Object.entries(tlMap).sort(([a],[b]) => a.localeCompare(b)).map(([tl, d]) => {
        const target        = teamTargets[tl] || 0;
        const activeE       = d.emps.filter((e) => e.sessions > 0).length;
        const activeP       = d.projs.filter((p) => p.monthSpentHrs > 0).length;
        const monthSpent    = +d.projs.reduce((s, p) => s + p.monthSpentHrs, 0).toFixed(2);
        const clientAlloc   = +d.projs.reduce((s, p) => s + p.clientHrs, 0).toFixed(2);
        const empSpent      = +d.emps.reduce((s, e) => s + e.spentHrs, 0).toFixed(2);
        const reqEff        = +(d.emps.reduce((s, e) => s + e.reqEffHrs, 0) / 60).toFixed(2);
        const actEff        = +(d.emps.reduce((s, e) => s + e.actEffHrs, 0) / 60).toFixed(2);
        const clientEarned  = +d.emps.reduce((s, e) => s + e.clientHrs, 0).toFixed(2);
        const achieved      = target > 0 ? +((clientEarned / target) * 100).toFixed(1) : 0;
        return [tl, target, d.emps.length, activeE, activeP, monthSpent, clientAlloc, reqEff, actEff,
          pct(reqEff, empSpent), pct(actEff, empSpent), pct(actEff, reqEff),
          clientEarned, achieved];
      });
      const tlWS = XLSX.utils.aoa_to_sheet([tlHeaders, ...tlRows]);
      tlWS['!cols'] = [22, 12, 11, 11, 14, 14, 16, 12, 12, 10, 11, 11, 14, 10].map(w);
      XLSX.utils.book_append_sheet(wb, tlWS, 'By Team Lead');

      // ── 3. EMPLOYEE SUMMARY (sorted by team lead) ─────────────────────
      const empHeaders = ['EMP ID', 'Employee Name', 'Department', 'Team Lead', 'Designation', 'Status', 'Target Hrs', 'Spent Hrs', 'Req Eff Hrs', 'Act Eff Hrs', 'Req Eff %', 'Actual Eff %', 'Emp Avg Eff', 'Client Hrs Earned', 'Sessions', 'Achieved %', 'Gap Hrs'];
      const empRows = [...data.employeeSummary]
        .sort((a, b) => (a.teamLead || '').localeCompare(b.teamLead || '') || a.name.localeCompare(b.name))
        .map((e) => {
          const reqH = +(e.reqEffHrs / 60).toFixed(2);
          const actH = +(e.actEffHrs / 60).toFixed(2);
          return [
            e.empId, e.name, e.dept, e.teamLead, e.designation, e.status,
            e.targetHrs, e.spentHrs, reqH, actH,
            pct(reqH, e.spentHrs), pct(actH, e.spentHrs), pct(actH, reqH),
            e.clientHrs, e.sessions, e.achievedPct, e.gapHrs,
          ];
        });
      const empWS = XLSX.utils.aoa_to_sheet([empHeaders, ...empRows]);
      empWS['!cols'] = [13, 24, 16, 20, 18, 10, 11, 10, 12, 12, 10, 11, 11, 14, 9, 11, 9].map(w);
      XLSX.utils.book_append_sheet(wb, empWS, 'Employee Summary');

      // ── 4. PROJECT SUMMARY (sorted by team lead) ──────────────────────
      const projHeaders = ['Proj ID', 'Project Name', 'Client', 'Status', 'Team Lead', 'Client Hrs', 'Cumulative Spent Hrs', `${monthLabel} Spent Hrs`, 'Req Eff Hrs', 'Act Eff Hrs', 'Sessions', 'Employees', 'Remaining Hrs', 'Eff %'];
      const projRows = [...data.projectSummary]
        .sort(byTL)
        .map((p) => [
          p.projId, p.projName, p.client, p.status, p.teamLead,
          p.clientHrs, p.cumulativeSpentHrs, p.monthSpentHrs,
          +(p.monthReqEffHrs / 60).toFixed(2), +(p.monthActEffHrs / 60).toFixed(2),
          p.monthSessions, p.monthEmployees, p.monthRemaining,
          p.monthEff ? +(p.monthEff * 100).toFixed(1) : 0,
        ]);
      const projWS = XLSX.utils.aoa_to_sheet([projHeaders, ...projRows]);
      projWS['!cols'] = [10, 32, 14, 12, 20, 10, 16, 14, 12, 12, 9, 9, 13, 8].map(w);
      XLSX.utils.book_append_sheet(wb, projWS, 'Project Summary');

      // ── 5. QA/QC PROJECTS (sorted by team lead) ───────────────────────
      // r[8]=SpentMin, r[9]=ReqEffMin, r[10]=ActEffMin — all in MINUTES
      const qaqcHeaders = ['Proj ID', 'Project Name', 'Client', 'Status', 'Team Lead', 'Client Hrs', 'QC Spent Hrs', 'QC Req Eff Hrs', 'QC Act Eff Hrs', 'Req Eff %', 'Actual Eff %', 'Emp Avg Eff', 'Remaining Hrs', 'Leading Person'];
      const qaqcRows = [...(qaqcRes.data || [])]
        .sort(byTL)
        .map((r) => {
          const sp = +((parseFloat(r[8]) || 0) / 60).toFixed(2);
          const rq = +((parseFloat(r[9]) || 0) / 60).toFixed(2);
          const ac = +((parseFloat(r[10]) || 0) / 60).toFixed(2);
          return [
            r[0], r[1], r[2], r[3], r[4],
            parseFloat(r[7]) || 0, sp, rq, ac,
            pct(rq, sp), pct(ac, sp), pct(ac, rq),
            parseFloat(r[12]) || 0, r[21] || r[4] || '',
          ];
        });
      const qaqcWS = XLSX.utils.aoa_to_sheet([qaqcHeaders, ...qaqcRows]);
      qaqcWS['!cols'] = [10, 32, 14, 12, 20, 10, 13, 14, 14, 10, 11, 11, 13, 20].map(w);
      XLSX.utils.book_append_sheet(wb, qaqcWS, 'QA-QC Projects');

      // ── 6. CLIENT FEEDBACK (sorted by team lead) ──────────────────────
      const fbHeaders = ['Proj ID', 'Project Name', 'Client', 'Status', 'Team Lead', 'Client Hrs', 'FB Spent Hrs', 'FB Req Eff Hrs', 'FB Act Eff Hrs', 'Req Eff %', 'Actual Eff %', 'Emp Avg Eff', 'Client FB Hrs', 'Remaining Hrs', 'Leading Person'];
      const fbRows = [...(fbRes.data || [])]
        .sort(byTL)
        .map((r) => {
          const sp = +((parseFloat(r[8]) || 0) / 60).toFixed(2);
          const rq = +((parseFloat(r[9]) || 0) / 60).toFixed(2);
          const ac = +((parseFloat(r[10]) || 0) / 60).toFixed(2);
          return [
            r[0], r[1], r[2], r[3], r[4],
            parseFloat(r[7]) || 0, sp, rq, ac,
            pct(rq, sp), pct(ac, sp), pct(ac, rq),
            parseFloat(r[19]) || 0, parseFloat(r[12]) || 0, r[23] || r[4] || '',
          ];
        });
      const fbWS = XLSX.utils.aoa_to_sheet([fbHeaders, ...fbRows]);
      fbWS['!cols'] = [10, 32, 14, 12, 20, 10, 13, 14, 14, 10, 11, 11, 12, 13, 20].map(w);
      XLSX.utils.book_append_sheet(wb, fbWS, 'Client Feedback');

      // ── 7. INTERNAL FEEDBACK (sorted by team lead) ────────────────────
      const intFbHeaders = ['Proj ID', 'Project Name', 'Client', 'Status', 'Team Lead', 'Client Hrs', 'Int FB Spent Hrs', 'Int FB Req Eff Hrs', 'Int FB Act Eff Hrs', 'Req Eff %', 'Actual Eff %', 'Emp Avg Eff', 'Remaining Hrs', 'Leading Person'];
      const intFbRows = [...(intFbRes.data || [])]
        .sort(byTL)
        .map((r) => {
          const sp = +((parseFloat(r[8]) || 0) / 60).toFixed(2);
          const rq = +((parseFloat(r[9]) || 0) / 60).toFixed(2);
          const ac = +((parseFloat(r[10]) || 0) / 60).toFixed(2);
          return [
            r[0], r[1], r[2], r[3], r[4],
            parseFloat(r[7]) || 0, sp, rq, ac,
            pct(rq, sp), pct(ac, sp), pct(ac, rq),
            parseFloat(r[12]) || 0, r[22] || r[4] || '',
          ];
        });
      const intFbWS = XLSX.utils.aoa_to_sheet([intFbHeaders, ...intFbRows]);
      intFbWS['!cols'] = [10, 32, 14, 12, 20, 10, 16, 18, 18, 10, 11, 11, 13, 20].map(w);
      XLSX.utils.book_append_sheet(wb, intFbWS, 'Internal Feedback');

      // ── 8. EMP × PROJECT DETAIL (sorted by team lead → employee) ──────
      const phDetHeaders = ['Team Lead', 'EMP ID', 'Employee Name', 'Department', 'Project ID', 'Project Name', 'Client', 'Cumul Spent Hrs', 'Cumul Req Eff Hrs', 'Cumul Act Eff Hrs', 'Req Eff %', 'Actual Eff %', 'Emp Avg Eff'];
      const phDetRows = [...(data.consolidatedProjHrs || [])]
        .sort((a, b) => (a.teamLead || '').localeCompare(b.teamLead || '') || (a.empId || '').localeCompare(b.empId || '') || (a.projId || '').localeCompare(b.projId || ''))
        .map((e) => {
          const sp = +(e.spent / 60).toFixed(2);
          const rq = +(e.reqEff / 60).toFixed(2);
          const ac = +(e.actEff / 60).toFixed(2);
          return [
            e.teamLead, e.empId, e.empName, e.dept,
            e.projId, e.projName, e.client,
            sp, rq, ac,
            pct(rq, sp), pct(ac, sp), pct(ac, rq),
          ];
        });
      const phDetWS = XLSX.utils.aoa_to_sheet([phDetHeaders, ...phDetRows]);
      phDetWS['!cols'] = [20, 13, 24, 14, 10, 32, 14, 14, 16, 16, 10, 11, 11].map(w);
      XLSX.utils.book_append_sheet(wb, phDetWS, 'Emp x Project Detail');

      XLSX.writeFile(wb, `Closing_Data_${monthLabel.replace(' ', '_')}.xlsx`);
      toast.success(
        `Closing month data exported — ${data.projectSummary.length} projects · ${data.employeeSummary.length} employees · ${(qaqcRes.data||[]).length} QA/QC · ${(fbRes.data||[]).length} client FB · ${(intFbRes.data||[]).length} int FB`
      );
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    } finally {
      setClosingExporting(false);
    }
  };

  // ── Export next month import template ────────────────────────────────
  const exportNextMonth = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    const carryOver = data.nextMonthProjects.length > 0
      ? data.nextMonthProjects
      : data.projectSummary
          .filter((p) => p.status === 'In Progress' && p.clientHrs > 0 && p.clientHrs - p.cumulativeSpentHrs > 0)
          .map((p) => ({
            projId: p.projId,
            projName: p.projName,
            client: p.client,
            teamLead: p.teamLead,
            clientHrs: p.clientHrs,
            totalSpentToDate: p.cumulativeSpentHrs,
            remainingClientHrs: +(p.clientHrs - p.cumulativeSpentHrs).toFixed(2),
            status: p.status,
          }));

    const closingProjMap = {};
    data.projectSummary.forEach((p) => { closingProjMap[p.projId] = p; });

    // ── Sheet 1: PROJECTS — import-ready, matches Projects import template ──
    // 'Total Spent Hrs' (col I) is pre-filled with cumulative spent so the
    // new month continues from where the closing month left off.
    const projImportHeaders = ['Proj ID', 'Project Name', 'Client', 'Status', 'Team Lead', 'Start (Day#)', 'End (Day#)', 'Client Hrs', 'Total Spent Hrs', 'Req Eff Hrs', 'Act Eff Hrs', 'Proj Eff %', 'Remarks', 'Remaining Hrs'];
    const projImportRows = carryOver.map((p) => [
      p.projId,
      `${p.projName} | ${nextMonthFullLabel}`,
      p.client,
      'In Progress',
      p.teamLead,
      '', '',
      p.clientHrs,
      p.totalSpentToDate,   // cumulative — carries over to next month
      '', '', '', '',
      p.remainingClientHrs,
    ]);
    const projImportWS = XLSX.utils.aoa_to_sheet([projImportHeaders, ...projImportRows]);
    projImportWS['!cols'] = projImportHeaders.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, projImportWS, 'PROJECTS');

    // ── Sheet 2: Reference — full carry-over detail for checking ──────────
    const refHeaders = ['Proj ID', 'Project Name', 'Client', 'Team Lead', 'Original Client Hrs', `${MONTHS[month]} ${year} Spent Hrs`, 'Cumulative Spent Hrs', 'Remaining Hrs', 'Status'];
    const refRows = carryOver.map((p) => {
      const closing = closingProjMap[p.projId] || {};
      return [
        p.projId,
        p.projName,
        p.client,
        p.teamLead,
        p.clientHrs,
        closing.monthSpentHrs != null ? +closing.monthSpentHrs.toFixed(2) : 0,
        p.totalSpentToDate,
        p.remainingClientHrs,
        p.status,
      ];
    });
    const refWS = XLSX.utils.aoa_to_sheet([refHeaders, ...refRows]);
    refWS['!cols'] = refHeaders.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, refWS, 'Carry-Over Reference');

    // ── Sheet 3: EMPLOYEES — active employees for next month ──────────────
    const empHeaders = ['EMP ID', 'Employee Name', 'Department', 'Team Lead', 'Designation', 'Req Eff Ratio', 'Work Hrs/Day', 'Experience'];
    const empRows = data.nextMonthEmployees.map((e) => [
      e.empId, e.name, e.dept, e.teamLead, e.designation,
      e.reqEffRatio, e.workHrsDay, e.experience,
    ]);
    const empWS = XLSX.utils.aoa_to_sheet([empHeaders, ...empRows]);
    empWS['!cols'] = empHeaders.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, empWS, 'Next Month Employees');

    // ── Sheet 4: PROJ_HOURS — one consolidated row per (employee × project) ──
    // Contains cumulative totals for all months up to closing month.
    // Import this via Sync from Excel to seed the new month's PROJ_HOURS,
    // so the running cumulative is preserved after clearing individual sessions.
    const phImportHeaders = ['#', 'Date', 'EMP ID', 'Employee Name', 'Department', 'Project ID', 'Project Name', 'Client', 'Spent Hrs', 'Req Eff Hrs', 'Act Eff Hrs', 'Eff %', 'Remarks', 'Team Lead'];
    const closeDate = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;
    const phImportRows = (data.consolidatedProjHrs || []).map((e, i) => {
      const effPct = e.reqEff > 0 ? +((e.actEff / e.reqEff) * 100).toFixed(1) : 0;
      return [
        i + 1,
        closeDate,
        e.empId, e.empName, e.dept,
        e.projId, e.projName, e.client,
        e.spent,   // minutes (matches PROJ_HOURS storage unit)
        e.reqEff,  // minutes
        e.actEff,  // minutes
        effPct,
        `Carry-over ${MONTHS[month]} ${year}`,
        e.teamLead,
      ];
    });
    const phImportWS = XLSX.utils.aoa_to_sheet([phImportHeaders, ...phImportRows]);
    phImportWS['!cols'] = phImportHeaders.map((_, i) => ({ wch: i < 2 ? 6 : i >= 6 ? 22 : 14 }));
    XLSX.utils.book_append_sheet(wb, phImportWS, 'PROJ_HOURS');

    XLSX.writeFile(wb, `Next_Month_Import_${nextMonthFullLabel.replace(' ', '_')}.xlsx`);
    toast.success(`Next month import exported — ${carryOver.length} projects · ${(data.consolidatedProjHrs || []).length} emp×project sessions`);
  };

  // ── Derived stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!data) return null;
    const activeEmps = data.employeeSummary.filter((e) => e.status === 'Active' && e.sessions > 0).length;
    const totalTarget = data.employeeSummary.reduce((s, e) => s + e.targetHrs, 0);
    const totalAchieved = data.employeeSummary.reduce((s, e) => s + e.achievedPct * e.targetHrs / 100, 0);
    const divTargetVal = parseFloat(divisionTarget) || 0;
    const teamTargetTotal = Object.values(teamTargets).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const effectiveTarget = divTargetVal || teamTargetTotal;
    const totalReqEffMin = data.employeeSummary.reduce((s, e) => s + e.reqEffHrs, 0);
    const totalActEffMin = data.employeeSummary.reduce((s, e) => s + e.actEffHrs, 0);
    const totalReqEffHrs = totalReqEffMin / 60;
    const totalActEffHrs = totalActEffMin / 60;
    // When a division target is set, use it as the canonical display value for
    // "Total Target Hrs" so both stat cards show the same number. Employees whose
    // team has no div-target fall back to prod-matrix capacity on the server,
    // which can push the raw employee sum above the division target.
    const displayTotalTarget = effectiveTarget > 0 ? effectiveTarget : +totalTarget.toFixed(2);
    return {
      activeEmps,
      totalTarget: displayTotalTarget,
      totalAchieved: +totalAchieved.toFixed(2),
      totalReqEffHrs: +totalReqEffHrs.toFixed(2),
      totalActEffHrs: +totalActEffHrs.toFixed(2),
      effRatio: totalReqEffMin > 0 ? +((totalActEffMin / totalReqEffMin) * 100).toFixed(1) : 0,
      inProgressProjs: data.projectSummary.filter((p) => p.status === 'In Progress').length,
      carryOverProjs: data.nextMonthProjects.length,
      divisionTarget: effectiveTarget,
      achievedVsDivision: effectiveTarget > 0 ? +(data.totals.totalClientHrs / effectiveTarget * 100).toFixed(1) : 0,
      teamTargets,
    };
  }, [data, divisionTarget, teamTargets]);

  if (!data) return (
    <LoadingScreen message="Compiling summary" words={['totals', 'reports', 'analytics', 'summaries', 'totals']} />
  );

  return (
    <div className="page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="page-title">Month End Summary</h1>
          <p className="page-sub">Consolidated project & employee data for {monthLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-1">
            <select className="text-sm border-0 bg-transparent focus:outline-none px-2 py-1" value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="text-sm border-0 bg-transparent focus:outline-none px-2 py-1" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={load} className="btn-secondary" title="Refresh"><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────── */}
      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatCard icon={Users} label="Active Employees" value={stats.activeEmps} sub={`of ${data.employeeSummary.length} total`} color="bg-indigo-500" />
            <StatCard icon={Briefcase} label="In Progress Projects" value={stats.inProgressProjs} sub={`of ${data.projectSummary.length} total`} color="bg-violet-500" />
            <StatCard icon={Target} label="Total Target Hrs" value={decToHHMM(stats.totalTarget)} sub={stats.divisionTarget > 0 ? 'assigned per div targets' : 'prod-matrix capacity'} color="bg-amber-500" />
            <StatCard icon={Target} label="Division Target" value={stats.divisionTarget > 0 ? decToHHMM(stats.divisionTarget) : 'Not set'} sub={stats.achievedVsDivision > 0 ? `${stats.achievedVsDivision}% client hrs achieved` : 'not set for this month'} color="bg-purple-500" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard icon={Clock} label="Total Spent Hrs" value={decToHHMM(data.totals.totalSpentHrs)} sub={`in ${monthLabel}`} color="bg-emerald-500" />
            <StatCard icon={TrendingUp} label="Total Client Hrs" value={decToHHMM(data.totals.totalClientHrs)} sub="allocated" color="bg-blue-500" />
            <StatCard icon={TrendingUp} label="Req Eff vs Act Eff" value={`${decToHHMM(stats.totalReqEffHrs)} / ${decToHHMM(stats.totalActEffHrs)}`} sub={`${stats.effRatio}% efficiency`} color="bg-cyan-500" />
            <StatCard icon={BarChart2} label="Carry-over Projects" value={data.nextMonthProjects.length} sub={`${decToHHMM(data.totals.totalRemainingHrs)} hrs remaining`} color="bg-rose-500" />
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={exportCloseMonth} disabled={closingExporting} className="btn-primary flex items-center gap-2">
          <Download size={14} /> {closingExporting ? 'Exporting…' : 'Export Closing Month Data'}
        </button>
        <button onClick={exportNextMonth} className="btn-secondary flex items-center gap-2">
          <Upload size={14} /> Export Next Month Import Template
        </button>
      </div>

      <div className="overflow-x-auto mb-5">
        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-xl w-fit">
          {[
            { key: 'summary', label: 'Summary View', icon: BarChart2 },
            { key: 'employees', label: 'Employee Details', icon: Users },
            { key: 'projects', label: 'Project Details', icon: Briefcase },
            { key: 'next-month', label: 'Next Month Data', icon: Calendar },
          ].map((tab) => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SUMMARY VIEW                                                     */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Users size={15} className="text-indigo-500" /> Employee Target vs Achievement
              </h3>
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Employee</th>
                    <th className="th text-right">Target Hrs</th>
                    <th className="th text-right">Spent Hrs</th>
                    <th className="th text-right">Client Hrs</th>
                    <th className="th text-center">Achieved</th>
                    <th className="th text-center">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employeeSummary.filter((e) => e.sessions > 0).slice(0, 15).map((e, i) => (
                    <tr key={i} className="tr cursor-pointer" onClick={() => setExpandedEmp(expandedEmp === e.empId ? null : e.empId)}>
                      <td className="td font-medium">
                        <p>{e.name}</p>
                        <p className="text-slate-400 font-normal">{e.empId}</p>
                      </td>
                      <td className="td text-right text-slate-600">{decToHHMM(e.targetHrs)}</td>
                      <td className="td text-right font-semibold text-indigo-600">{decToHHMM(e.spentHrs)}</td>
                      <td className="td text-right text-blue-600">{decToHHMM(e.clientHrs)}</td>
                      <td className="td text-center"><PctBadge val={e.achievedPct} /></td>
                      <td className="td text-center">
                        <span className={e.gapHrs <= 0 ? 'text-emerald-600' : 'text-red-500'}>{e.gapHrs > 0 ? `-${decToHHMM(e.gapHrs)}` : decToHHMM(Math.abs(e.gapHrs))}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-2">
              {data.employeeSummary.filter((e) => e.sessions > 0).slice(0, 15).map((e, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="font-semibold text-slate-800 truncate">{e.name}</div>
                      <div className="text-slate-400 font-mono text-[10px]">{e.empId}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <PctBadge val={e.achievedPct} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-slate-500">
                    <span>Target: {decToHHMM(e.targetHrs)}</span>
                    <span>Spent: {decToHHMM(e.spentHrs)}</span>
                    <span>Client: {decToHHMM(e.clientHrs)}</span>
                  </div>
                  <div className="flex justify-end mt-1">
                    <span className={e.gapHrs <= 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
                      Gap: {e.gapHrs > 0 ? `-${decToHHMM(e.gapHrs)}` : `+${decToHHMM(Math.abs(e.gapHrs))}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {data.employeeSummary.filter((e) => e.sessions > 0).length > 15 && (
              <p className="text-xs text-slate-400 mt-2 text-center">Showing top 15 — switch to Employee Details tab for full list</p>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Briefcase size={15} className="text-violet-500" /> Project Monthly Closure
              </h3>
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Project</th>
                    <th className="th text-right">Client Hrs</th>
                    <th className="th text-right">Month Spent</th>
                    <th className="th text-right">Remaining</th>
                    <th className="th text-center">Status</th>
                    <th className="th text-center">Eff</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projectSummary.filter((p) => p.monthSpentHrs > 0).slice(0, 15).map((p, i) => (
                    <tr key={i} className="tr">
                      <td className="td font-medium max-w-[160px]">
                        <p className="truncate" title={p.projName}>{p.projName}</p>
                        <p className="text-slate-400 font-normal">{p.projId}</p>
                      </td>
                      <td className="td text-right text-blue-600 font-semibold">{decToHHMM(p.clientHrs)}</td>
                      <td className="td text-right text-indigo-600">{decToHHMM(p.monthSpentHrs)}</td>
                      <td className={`td text-right font-semibold ${p.monthRemaining !== null && p.monthRemaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {p.monthRemaining !== null ? decToHHMM(p.monthRemaining) : '—'}
                      </td>
                      <td className="td text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${p.status === 'In Progress' ? 'bg-indigo-50 text-indigo-700' : p.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="td text-center"><EffBadge val={p.monthEff} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-2">
              {data.projectSummary.filter((p) => p.monthSpentHrs > 0).slice(0, 15).map((p, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="font-semibold text-slate-800 truncate">{p.projName}</div>
                      <div className="text-slate-400 font-mono text-[10px]">{p.projId}</div>
                    </div>
                    <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs font-semibold ${p.status === 'In Progress' ? 'bg-indigo-50 text-indigo-700' : p.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-slate-500 flex-wrap">
                    <span>Client: <strong className="text-blue-600">{decToHHMM(p.clientHrs)}</strong></span>
                    <span>Spent: <strong className="text-indigo-600">{decToHHMM(p.monthSpentHrs)}</strong></span>
                    <span>Rem: <strong className={p.monthRemaining !== null && p.monthRemaining > 0 ? 'text-amber-600' : 'text-emerald-600'}>{p.monthRemaining !== null ? decToHHMM(p.monthRemaining) : '—'}</strong></span>
                    <span>Eff: <EffBadge val={p.monthEff} /></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card xl:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Calendar size={15} className="text-amber-500" /> Carry-over to {nextMonthLabel}
              </h3>
              <span className="text-xs text-slate-400">{data.nextMonthProjects.length} projects with remaining hours</span>
            </div>
            {data.nextMonthProjects.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">No projects with remaining client hours to carry over.</p>
            ) : (<>
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Project</th>
                      <th className="th">Client</th>
                      <th className="th">Team Lead</th>
                      <th className="th text-right">Client Hrs</th>
                      <th className="th text-right">Spent To Date</th>
                      <th className="th text-right">Remaining Hrs</th>
                      <th className="th text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.nextMonthProjects.map((p, i) => (
                      <tr key={i} className="tr">
                        <td className="td font-medium max-w-[160px]">
                          <p className="truncate" title={p.projName}>{p.projName}</p>
                          <p className="text-slate-400 font-normal">{p.projId}</p>
                        </td>
                        <td className="td text-slate-500">{p.client}</td>
                        <td className="td text-slate-500">{p.teamLead}</td>
                        <td className="td text-right text-blue-600">{decToHHMM(p.clientHrs)}</td>
                        <td className="td text-right text-indigo-600">{decToHHMM(p.totalSpentToDate)}</td>
                        <td className="td text-right font-semibold text-amber-600">{decToHHMM(p.remainingClientHrs)}</td>
                        <td className="td text-center">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-2">
                {data.nextMonthProjects.map((p, i) => (
                  <div key={i} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="font-semibold text-slate-800 truncate">{p.projName}</div>
                        <div className="text-slate-400 font-mono text-[10px]">{p.projId}</div>
                      </div>
                      <span className="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">{p.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-slate-500">
                      {p.client && <span>Client: {p.client}</span>}
                      {p.teamLead && <span>Lead: {p.teamLead}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-slate-500 flex-wrap">
                      <span>Hrs: <strong className="text-blue-600">{decToHHMM(p.clientHrs)}</strong></span>
                      <span>Spent: <strong className="text-indigo-600">{decToHHMM(p.totalSpentToDate)}</strong></span>
                      <span>Rem: <strong className="text-amber-600">{decToHHMM(p.remainingClientHrs)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* EMPLOYEE DETAILS                                                 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'employees' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Employee Performance — {monthLabel}</h3>
            <span className="text-xs text-slate-400">{data.employeeSummary.filter((e) => e.sessions > 0).length} employees with activity</span>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">EMP ID</th>
                  <th className="th">Name</th>
                  <th className="th">Dept</th>
                  <th className="th">Team Lead</th>
                  <th className="th text-right" title="Proportional share of team's division target by prod-matrix capacity">Target Hrs</th>
                  <th className="th text-right">Spent Hrs</th>
                  <th className="th text-right">Req Eff Hrs</th>
                  <th className="th text-right">Act Eff Hrs</th>
                  <th className="th text-right">Client Hrs</th>
                  <th className="th text-center">Sessions</th>
                  <th className="th text-center">Achieved %</th>
                  <th className="th text-center">Gap</th>
                </tr>
              </thead>
              <tbody>
                {data.employeeSummary.filter((e) => e.sessions > 0).length === 0 ? (
                  <tr><td colSpan={12} className="td text-center text-slate-400 py-6">No employee activity for {monthLabel}</td></tr>
                ) : data.employeeSummary.filter((e) => e.sessions > 0).map((e, i) => (
                  <tr key={i} className="tr">
                    <td className="td text-slate-500">{e.empId}</td>
                    <td className="td font-medium">{e.name}</td>
                    <td className="td text-slate-500">{e.dept || '—'}</td>
                    <td className="td text-slate-500">{e.teamLead || '—'}</td>
                    <td className="td text-right text-slate-600">{decToHHMM(e.targetHrs)}</td>
                    <td className="td text-right font-semibold text-indigo-600">{decToHHMM(e.spentHrs)}</td>
                    <td className="td text-right text-violet-600">{e.reqEffHrs > 0 ? decToHHMM(e.reqEffHrs / 60) : '—'}</td>
                    <td className="td text-right text-cyan-600">{e.actEffHrs > 0 ? decToHHMM(e.actEffHrs / 60) : '—'}</td>
                    <td className="td text-right text-blue-600">{decToHHMM(e.clientHrs)}</td>
                    <td className="td text-center text-slate-500">{e.sessions}</td>
                    <td className="td text-center"><PctBadge val={e.achievedPct} /></td>
                    <td className="td text-center">
                      <span className={e.gapHrs <= 0 ? 'text-emerald-600 font-semibold' : 'text-red-500'}>
                        {e.gapHrs > 0 ? `-${decToHHMM(e.gapHrs)}` : `+${decToHHMM(Math.abs(e.gapHrs))}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td className="td font-semibold" colSpan={4}>Total</td>
                  <td className="td text-right font-semibold">{decToHHMM(data.employeeSummary.reduce((s, e) => s + e.targetHrs, 0))}</td>
                  <td className="td text-right font-semibold text-indigo-600">{decToHHMM(data.employeeSummary.reduce((s, e) => s + e.spentHrs, 0))}</td>
                  <td className="td text-right font-semibold text-violet-600">{decToHHMM(data.employeeSummary.reduce((s, e) => s + e.reqEffHrs, 0) / 60)}</td>
                  <td className="td text-right font-semibold text-cyan-600">{decToHHMM(data.employeeSummary.reduce((s, e) => s + e.actEffHrs, 0) / 60)}</td>
                  <td className="td text-right font-semibold text-blue-600">{decToHHMM(data.employeeSummary.reduce((s, e) => s + e.clientHrs, 0))}</td>
                  <td className="td text-center font-semibold">{data.employeeSummary.reduce((s, e) => s + e.sessions, 0)}</td>
                  <td className="td text-center" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="md:hidden space-y-2">
            {data.employeeSummary.filter((e) => e.sessions > 0).length === 0 ? (
              <p className="text-center text-slate-400 py-6 text-sm">No employee activity for {monthLabel}</p>
            ) : data.employeeSummary.filter((e) => e.sessions > 0).map((e, i) => (
              <div key={i} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="font-semibold text-slate-800 truncate">{e.name}</div>
                    <div className="text-slate-400 font-mono text-[10px]">{e.empId}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <PctBadge val={e.achievedPct} />
                  </div>
                </div>
                <div className="text-slate-500 mt-0.5">
                  {[e.dept, e.teamLead].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400">Target</p>
                    <p className="text-xs font-medium text-slate-600">{decToHHMM(e.targetHrs)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400">Spent</p>
                    <p className="text-xs font-medium text-indigo-600">{decToHHMM(e.spentHrs)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400">Client</p>
                    <p className="text-xs font-medium text-blue-600">{decToHHMM(e.clientHrs)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400">Req Eff</p>
                    <p className="text-xs font-medium text-violet-600">{e.reqEffHrs > 0 ? decToHHMM(e.reqEffHrs / 60) : '—'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400">Act Eff</p>
                    <p className="text-xs font-medium text-cyan-600">{e.actEffHrs > 0 ? decToHHMM(e.actEffHrs / 60) : '—'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400">Sessions</p>
                    <p className="text-xs font-medium text-slate-600">{e.sessions}</p>
                  </div>
                </div>
                <div className="flex justify-end mt-1">
                  <span className={e.gapHrs <= 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
                    Gap: {e.gapHrs > 0 ? `-${decToHHMM(e.gapHrs)}` : `+${decToHHMM(Math.abs(e.gapHrs))}`}
                  </span>
                </div>
              </div>
            ))}
            {data.employeeSummary.filter((e) => e.sessions > 0).length > 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                <div className="flex items-center justify-between font-semibold">
                  <span>Total</span>
                  <div className="flex gap-2 text-right">
                    <span>{decToHHMM(data.employeeSummary.reduce((s, e) => s + e.targetHrs, 0))}</span>
                    <span className="text-indigo-600">{decToHHMM(data.employeeSummary.reduce((s, e) => s + e.spentHrs, 0))}</span>
                    <span className="text-blue-600">{decToHHMM(data.employeeSummary.reduce((s, e) => s + e.clientHrs, 0))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* PROJECT DETAILS                                                  */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'projects' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Project Monthly Closure — {monthLabel}</h3>
            <span className="text-xs text-slate-400">{data.projectSummary.filter((p) => p.monthSpentHrs > 0).length} projects with activity</span>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Project</th>
                  <th className="th">Client</th>
                  <th className="th">Team Lead</th>
                  <th className="th text-center">Status</th>
                  <th className="th text-right">Client Hrs</th>
                  <th className="th text-right">Cumulative Spent</th>
                  <th className="th text-right">Month Spent</th>
                  <th className="th text-right">Month Req Eff</th>
                  <th className="th text-right">Month Act Eff</th>
                  <th className="th text-right">Remaining Hrs</th>
                  <th className="th text-center">Month Eff</th>
                  <th className="th text-center">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {data.projectSummary.filter((p) => p.monthSpentHrs > 0).length === 0 ? (
                  <tr><td colSpan={12} className="td text-center text-slate-400 py-6">No project activity for {monthLabel}</td></tr>
                ) : data.projectSummary.filter((p) => p.monthSpentHrs > 0).map((p, i) => (
                  <tr key={i} className="tr">
                    <td className="td font-medium max-w-[160px]">
                      <p className="truncate" title={p.projName}>{p.projName}</p>
                      <p className="text-slate-400 font-normal">{p.projId}</p>
                    </td>
                    <td className="td text-slate-500 max-w-[100px] truncate">{p.client}</td>
                    <td className="td text-slate-500">{p.teamLead || '—'}</td>
                    <td className="td text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${p.status === 'In Progress' ? 'bg-indigo-50 text-indigo-700' : p.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : p.status === 'On Hold' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="td text-right text-blue-600 font-semibold">{decToHHMM(p.clientHrs)}</td>
                    <td className="td text-right text-slate-600">{decToHHMM(p.cumulativeSpentHrs)}</td>
                    <td className="td text-right font-semibold text-indigo-600">{decToHHMM(p.monthSpentHrs)}</td>
                    <td className="td text-right text-violet-600">{p.monthReqEffHrs > 0 ? decToHHMM(p.monthReqEffHrs / 60) : '—'}</td>
                    <td className="td text-right text-cyan-600">{p.monthActEffHrs > 0 ? decToHHMM(p.monthActEffHrs / 60) : '—'}</td>
                    <td className={`td text-right font-semibold ${p.monthRemaining !== null && p.monthRemaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {p.monthRemaining !== null ? decToHHMM(p.monthRemaining) : '—'}
                    </td>
                    <td className="td text-center"><EffBadge val={p.monthEff} /></td>
                    <td className="td text-center text-slate-500">{p.monthSessions}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td className="td font-semibold" colSpan={4}>Total</td>
                  <td className="td text-right font-semibold text-blue-600">{decToHHMM(data.totals.totalClientHrs)}</td>
                  <td className="td text-right font-semibold text-slate-600">{decToHHMM(data.projectSummary.reduce((s, p) => s + p.cumulativeSpentHrs, 0))}</td>
                  <td className="td text-right font-semibold text-indigo-600">{decToHHMM(data.totals.totalSpentHrs)}</td>
                  <td className="td text-right font-semibold text-violet-600">{decToHHMM(data.projectSummary.reduce((s, p) => s + p.monthReqEffHrs, 0) / 60)}</td>
                  <td className="td text-right font-semibold text-cyan-600">{decToHHMM(data.projectSummary.reduce((s, p) => s + p.monthActEffHrs, 0) / 60)}</td>
                  <td className="td text-right font-semibold text-amber-600">{decToHHMM(data.totals.totalRemainingHrs)}</td>
                  <td className="td" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="md:hidden space-y-2">
            {data.projectSummary.filter((p) => p.monthSpentHrs > 0).length === 0 ? (
              <p className="text-center text-slate-400 py-6 text-sm">No project activity for {monthLabel}</p>
            ) : data.projectSummary.filter((p) => p.monthSpentHrs > 0).map((p, i) => (
              <div key={i} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="font-semibold text-slate-800 truncate">{p.projName}</div>
                    <div className="text-slate-400 font-mono text-[10px]">{p.projId}</div>
                  </div>
                  <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs font-semibold ${p.status === 'In Progress' ? 'bg-indigo-50 text-indigo-700' : p.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : p.status === 'On Hold' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'}`}>
                    {p.status}
                  </span>
                </div>
                <div className="text-slate-500 mt-0.5">
                  {[p.client, p.teamLead].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1.5">
                  <div className="text-slate-500">Client: <strong className="text-blue-600">{decToHHMM(p.clientHrs)}</strong></div>
                  <div className="text-slate-500">Cumul: <strong className="text-slate-600">{decToHHMM(p.cumulativeSpentHrs)}</strong></div>
                  <div className="text-slate-500">Spent: <strong className="text-indigo-600">{decToHHMM(p.monthSpentHrs)}</strong></div>
                  <div className="text-slate-500">Req: <strong className="text-violet-600">{p.monthReqEffHrs > 0 ? decToHHMM(p.monthReqEffHrs / 60) : '—'}</strong></div>
                  <div className="text-slate-500">Act: <strong className="text-cyan-600">{p.monthActEffHrs > 0 ? decToHHMM(p.monthActEffHrs / 60) : '—'}</strong></div>
                  <div className="text-slate-500">Rem: <strong className={p.monthRemaining !== null && p.monthRemaining > 0 ? 'text-amber-600' : 'text-emerald-600'}>{p.monthRemaining !== null ? decToHHMM(p.monthRemaining) : '—'}</strong></div>
                </div>
                <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-slate-50">
                  <span className="text-slate-500">Sessions: {p.monthSessions}</span>
                  <span className="text-slate-500">Eff: <EffBadge val={p.monthEff} /></span>
                </div>
              </div>
            ))}
            {data.projectSummary.filter((p) => p.monthSpentHrs > 0).length > 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                <div className="flex items-center justify-between font-semibold">
                  <span>Total</span>
                  <div className="flex gap-2 text-right">
                    <span className="text-blue-600">{decToHHMM(data.totals.totalClientHrs)}</span>
                    <span className="text-indigo-600">{decToHHMM(data.totals.totalSpentHrs)}</span>
                    <span className="text-amber-600">{decToHHMM(data.totals.totalRemainingHrs)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* NEXT MONTH DATA                                                  */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'next-month' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Briefcase size={15} className="text-amber-500" /> Projects with Remaining Hrs
              </h3>
              <span className="text-xs text-slate-400">Import into {nextMonthLabel}</span>
            </div>
            {data.nextMonthProjects.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">No projects to carry over.</p>
            ) : (<>
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Proj ID</th>
                      <th className="th">Name</th>
                      <th className="th">Client</th>
                      <th className="th">Lead</th>
                      <th className="th text-right">Client Hrs</th>
                      <th className="th text-right">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.nextMonthProjects.map((p, i) => (
                      <tr key={i} className="tr">
                        <td className="td text-slate-500">{p.projId}</td>
                        <td className="td font-medium max-w-[140px] truncate" title={p.projName}>{p.projName}</td>
                        <td className="td text-slate-500 max-w-[100px] truncate">{p.client}</td>
                        <td className="td text-slate-500">{p.teamLead}</td>
                        <td className="td text-right text-blue-600">{decToHHMM(p.clientHrs)}</td>
                        <td className="td text-right font-semibold text-amber-600">{decToHHMM(p.remainingClientHrs)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td className="td font-semibold" colSpan={4}>Total</td>
                      <td className="td text-right font-semibold text-blue-600">{decToHHMM(data.nextMonthProjects.reduce((s, p) => s + p.clientHrs, 0))}</td>
                      <td className="td text-right font-semibold text-amber-600">{decToHHMM(data.nextMonthProjects.reduce((s, p) => s + p.remainingClientHrs, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="md:hidden space-y-2">
                {data.nextMonthProjects.map((p, i) => (
                  <div key={i} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="font-semibold text-slate-800 truncate">{p.projName}</div>
                        <div className="text-slate-400 font-mono text-[10px]">{p.projId}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-slate-500">
                      {p.client && <span>Client: {p.client}</span>}
                      {p.teamLead && <span>Lead: {p.teamLead}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-slate-500">
                      <span>Hrs: <strong className="text-blue-600">{decToHHMM(p.clientHrs)}</strong></span>
                      <span>Rem: <strong className="text-amber-600">{decToHHMM(p.remainingClientHrs)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </>)}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Users size={15} className="text-indigo-500" /> Active Employees for {nextMonthLabel}
              </h3>
              <span className="text-xs text-slate-400">{data.nextMonthEmployees.length} employees</span>
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">EMP ID</th>
                    <th className="th">Name</th>
                    <th className="th">Dept</th>
                    <th className="th">Team Lead</th>
                    <th className="th text-right">Eff Ratio</th>
                    <th className="th text-right">Hrs/Day</th>
                  </tr>
                </thead>
                <tbody>
                  {data.nextMonthEmployees.map((e, i) => (
                    <tr key={i} className="tr">
                      <td className="td text-slate-500">{e.empId}</td>
                      <td className="td font-medium">{e.name}</td>
                      <td className="td text-slate-500">{e.dept || '—'}</td>
                      <td className="td text-slate-500">{e.teamLead || '—'}</td>
                      <td className="td text-right text-slate-600">{(e.reqEffRatio * 100).toFixed(0)}%</td>
                      <td className="td text-right text-slate-600">{e.workHrsDay}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-2">
              {data.nextMonthEmployees.map((e, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="font-semibold text-slate-800 truncate">{e.name}</div>
                      <div className="text-slate-400 font-mono text-[10px]">{e.empId}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-slate-500">
                    {e.dept && <span>Dept: {e.dept}</span>}
                    {e.teamLead && <span>Lead: {e.teamLead}</span>}
                    <span>Eff: {(e.reqEffRatio * 100).toFixed(0)}%</span>
                    <span>Hrs/Day: {e.workHrsDay}h</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card xl:col-span-2 bg-indigo-50 border-indigo-200">
            <h3 className="text-sm font-semibold text-indigo-700 mb-2">How to use this data</h3>
            <ol className="text-xs text-indigo-600 space-y-1 list-decimal list-inside">
              <li><strong>Export Closing Month</strong> — Archive the full employee and project summary for {monthLabel}.</li>
              <li><strong>Export Next Month Import</strong> — Downloads an Excel with 4 sheets:
                <ul className="list-disc list-inside ml-4 mt-0.5 space-y-0.5">
                  <li><strong>PROJECTS</strong> — import-ready with carry-over projects and cumulative spent hrs</li>
                  <li><strong>PROJ_HOURS</strong> — one consolidated row per employee × project with all-time cumulative hours (minutes), date = {monthLabel} close</li>
                  <li><strong>Carry-Over Reference</strong> — detail view for verification</li>
                  <li><strong>Next Month Employees</strong> — active employee list</li>
                </ul>
              </li>
              <li>Clear existing <strong>PROJ_HOURS</strong> data if starting fresh, then go to <strong>Data Management → Sync from Excel</strong> and upload the downloaded file. Both <strong>PROJECTS</strong> and <strong>PROJ_HOURS</strong> sheets will be imported.</li>
              <li>The imported <strong>PROJ_HOURS</strong> preserves the cumulative baseline — new sessions logged next month add on top of these totals automatically.</li>
              <li>Projects marked <strong>Completed</strong> or with <strong>0 remaining hours</strong> are excluded from the PROJECTS carry-over sheet.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
