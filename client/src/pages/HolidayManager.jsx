import { useState, useEffect } from 'react';
import { CalendarDays, Plus, Trash2, Loader, Save } from 'lucide-react';
import { api } from '../lib/api';

export default function HolidayManager({ toast, embedded, year: propYear, onClose }) {
  const now = new Date();
  const [year, setYear] = useState(propYear || now.getFullYear());
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getHolidays(year);
      setHolidays(res.holidays || []);
    } catch (e) { toast?.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [year]);

  const addHoliday = () => {
    if (!newDate) return;
    if (holidays.some((h) => h.date === newDate)) {
      toast?.error('Holiday already exists for this date');
      return;
    }
    setHolidays((prev) => [...prev, { date: newDate, name: newName }].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate('');
    setNewName('');
  };

  const removeHoliday = (date) => {
    setHolidays((prev) => prev.filter((h) => h.date !== date));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.saveHolidays(holidays);
      toast?.success('Holidays saved');
      if (onClose) onClose();
    } catch (e) { toast?.error(e.message); }
    finally { setSaving(false); }
  };

  const groupByMonth = {};
  holidays.forEach((h) => {
    const m = h.date.slice(0, 7);
    if (!groupByMonth[m]) groupByMonth[m] = [];
    groupByMonth[m].push(h);
  });

  const content = (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-slate-500" />
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
            className="input text-sm px-2 py-1.5 rounded-lg border border-slate-200">
            {Array.from({ length: 5 }, (_, i) => {
              const y = now.getFullYear() - 1 + i;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
          className="input text-sm px-2 py-1.5 rounded-lg border border-slate-200 w-auto" />
        <input type="text" placeholder="Holiday name" value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="input text-sm px-2 py-1.5 rounded-lg border border-slate-200 flex-1 max-w-[200px]" />
        <button onClick={addHoliday} className="btn btn-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 flex items-center gap-1">
          <Plus size={14} /> Add
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader className="animate-spin text-slate-400" size={24} /></div>
      ) : holidays.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No holidays defined for {year}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
          {Object.entries(groupByMonth).map(([ym, days]) => {
            const monthName = new Date(ym + '-01').toLocaleString('default', { month: 'long', year: 'numeric' });
            return (
              <div key={ym} className="border border-slate-200 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{monthName}</h4>
                <ul className="space-y-1">
                  {days.map((h) => (
                    <li key={h.date} className="flex items-center justify-between text-sm">
                      <span>
                        <span className="text-slate-700 font-medium">{h.date.slice(8, 10)}</span>
                        <span className="text-slate-400 ml-2">{h.name || 'Holiday'}</span>
                      </span>
                      <button onClick={() => removeHoliday(h.date)}
                        className="text-red-400 hover:text-red-600 p-0.5">
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onClose && (
          <button onClick={onClose} className="btn btn-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        )}
        <button onClick={save} disabled={saving}
          className="btn btn-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-1.5 disabled:opacity-50">
          {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
          Save Holidays
        </button>
      </div>
    </div>
  );

  if (embedded) return content;
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <CalendarDays size={20} /> Holiday Calendar
      </h2>
      {content}
    </div>
  );
}
