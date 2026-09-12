import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { SchoolHoliday } from '../../lib/database.types';

// REQ-30, REQ-33 (screens-and-flows.md 2.17): add/edit/delete school holiday
// date ranges, which suppress roster opening-time slots on their dates
// (REQ-31, REQ-32) -- also covers single-day closures like public holidays
// (requirements.md A13).

export function SchoolHolidaysPage() {
  const [holidays, setHolidays] = useState<SchoolHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [label, setLabel] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editLabel, setEditLabel] = useState('');

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('school_holidays')
      .select('*')
      .order('start_date', { ascending: false })
      .returns<SchoolHoliday[]>();
    if (error) setError(error.message);
    else setHolidays(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!startDate || !endDate) return;
    const { error } = await supabase.from('school_holidays').insert({
      start_date: startDate,
      end_date: endDate,
      label: label.trim() || null
    });
    if (error) {
      setError(error.message);
    } else {
      setStartDate('');
      setEndDate('');
      setLabel('');
      await load();
    }
  }

  function startEditing(h: SchoolHoliday) {
    setEditingId(h.id);
    setEditStart(h.start_date);
    setEditEnd(h.end_date);
    setEditLabel(h.label ?? '');
  }

  async function handleSaveEdit(h: SchoolHoliday) {
    const { error } = await supabase
      .from('school_holidays')
      .update({ start_date: editStart, end_date: editEnd, label: editLabel.trim() || null })
      .eq('id', h.id);
    if (error) {
      setError(error.message);
    } else {
      setEditingId(null);
      await load();
    }
  }

  async function handleDelete(h: SchoolHoliday) {
    if (!window.confirm(`Delete the "${h.label ?? 'holiday'}" period? This can't be undone.`)) {
      return;
    }
    const { error } = await supabase.from('school_holidays').delete().eq('id', h.id);
    if (error) setError(error.message);
    else await load();
  }

  return (
    <div className='page'>
      <h1>School holidays</h1>
      <p className='muted'>
        Date ranges the shop is closed. The roster calendar hides opening-time slots on these dates.
      </p>

      {error && <p className='error'>{error}</p>}
      {loading && <p>Loading…</p>}

      {!loading && (
        <>
          <table>
            <thead>
              <tr>
                <th>Start</th>
                <th>End</th>
                <th>Label</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {holidays.map(h => (
                <tr key={h.id}>
                  {editingId === h.id ? (
                    <>
                      <td>
                        <input
                          type='date'
                          value={editStart}
                          onChange={e => setEditStart(e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type='date'
                          value={editEnd}
                          onChange={e => setEditEnd(e.target.value)}
                        />
                      </td>
                      <td>
                        <input value={editLabel} onChange={e => setEditLabel(e.target.value)} />
                      </td>
                      <td className='list-actions'>
                        <button className='small' onClick={() => handleSaveEdit(h)}>
                          Save
                        </button>
                        <button className='secondary small' onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{h.start_date}</td>
                      <td>{h.end_date}</td>
                      <td>{h.label ?? '—'}</td>
                      <td className='list-actions'>
                        <button className='button small' onClick={() => startEditing(h)}>
                          Edit
                        </button>
                        <button className='danger small' onClick={() => handleDelete(h)}>
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {holidays.length === 0 && (
                <tr>
                  <td colSpan={4} className='muted'>
                    No school holidays set up yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <form className='form-card' onSubmit={handleAdd} style={{ maxWidth: 480 }}>
            <h2 style={{ marginTop: 0 }}>Add a holiday period</h2>
            <div className='field-row'>
              <label className='field'>
                Start date
                <input
                  type='date'
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                />
              </label>
              <label className='field'>
                End date
                <input
                  type='date'
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  required
                />
              </label>
            </div>
            <label className='field'>
              Label (optional)
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder='e.g. Term 3 holidays'
              />
            </label>
            <button type='submit'>Add holiday</button>
          </form>
        </>
      )}
    </div>
  );
}
