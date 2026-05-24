export function decToHHMM(val) {
  if (val == null || isNaN(val)) return '—';
  const totalMin = Math.round(Math.abs(val) * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const sign = val < 0 ? '-' : '';
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hhmmToDec(val) {
  if (!val || typeof val !== 'string') return 0;
  const parts = val.split(':');
  if (parts.length !== 2) return parseFloat(val) || 0;
  const h = parseInt(parts[0]) || 0;
  const m = parseInt(parts[1]) || 0;
  return h + m / 60;
}
