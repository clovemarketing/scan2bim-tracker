const MAP = {
  // Project status
  'in progress': 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  'on hold': 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
  'not started': 'bg-slate-100 text-slate-600',
  // Emp status
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
  resigned: 'bg-red-100 text-red-600',
  probation: 'bg-purple-100 text-purple-700',
  // Attendance
  p: 'bg-emerald-100 text-emerald-700',
  a: 'bg-red-100 text-red-700',
  l: 'bg-orange-100 text-orange-700',
  wfh: 'bg-blue-100 text-blue-700',
  od: 'bg-cyan-100 text-cyan-700',
  hd: 'bg-yellow-100 text-yellow-700',
  h: 'bg-slate-100 text-slate-500',
  // Efficiency
  met: 'bg-emerald-100 text-emerald-700',
  exceeded: 'bg-blue-100 text-blue-700',
  'not met': 'bg-red-100 text-red-700',
  'no log': 'bg-slate-100 text-slate-500',
};

export default function Badge({ value }) {
  const key = String(value ?? '').toLowerCase();
  const cls = MAP[key] || 'bg-slate-100 text-slate-600';
  return <span className={`badge ${cls}`}>{value}</span>;
}
