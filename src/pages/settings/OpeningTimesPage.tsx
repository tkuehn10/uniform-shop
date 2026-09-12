import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { OpeningTimeSlot } from '../../lib/database.types';

// REQ-25, REQ-29 (screens-and-flows.md 2.16): define/edit the recurring
// weekly pattern of opening times. Editing/removing a slot only affects
// future, not-yet-claimed occurrences going forward -- there's no per-date
// data on this table to retroactively change, so a plain update/soft-disable
// here already has exactly that effect.

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function OpeningTimesPage() {
  const [slots, setSlots] = useState<OpeningTimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dayOfWeek, setDayOfWeek] = useState('2');
  const [startTime, setStartTime] = useState('08:30');
  const [endTime, setEndTime] = useState('09:30');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('opening_time_slots')
      .select('*')
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })
      .returns<OpeningTimeSlot[]>();
    if (error) setError(error.message);
    else setSlots(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from('opening_time_slots').insert({
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
      end_time: endTime
    });
    if (error) {
      setError(error.message);
    } else {
      await load();
    }
  }

  async function handleToggleActive(slot: OpeningTimeSlot) {
    const { error } = await supabase
      .from('opening_time_slots')
      .update({ active: !slot.active })
      .eq('id', slot.id);
    if (error) setError(error.message);
    else await load();
  }

  function startEditing(slot: OpeningTimeSlot) {
    setEditingId(slot.id);
    setEditStart(slot.start_time.slice(0, 5));
    setEditEnd(slot.end_time.slice(0, 5));
  }

  async function handleSaveEdit(slot: OpeningTimeSlot) {
    const { error } = await supabase
      .from('opening_time_slots')
      .update({ start_time: editStart, end_time: editEnd })
      .eq('id', slot.id);
    if (error) {
      setError(error.message);
    } else {
      setEditingId(null);
      await load();
    }
  }

  return (
    <div className='page'>
      <h1>Opening times</h1>
      <p className='muted'>
        The recurring weekly pattern the roster calendar repeats every week. Changes only affect
        future occurrences.
      </p>

      {error && <p className='error'>{error}</p>}
      {loading && <p>Loading…</p>}

      {!loading && (
        <>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {slots.map(s => (
                <tr key={s.id}>
                  <td>{DAY_NAMES[s.day_of_week]}</td>
                  {editingId === s.id ? (
                    <>
                      <td>
                        <input
                          type='time'
                          value={editStart}
                          onChange={e => setEditStart(e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type='time'
                          value={editEnd}
                          onChange={e => setEditEnd(e.target.value)}
                        />
                      </td>
                      <td>{!s.active && <span className='badge archived'>Disabled</span>}</td>
                      <td className='list-actions'>
                        <button className='small' onClick={() => handleSaveEdit(s)}>
                          Save
                        </button>
                        <button className='secondary small' onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{s.start_time.slice(0, 5)}</td>
                      <td>{s.end_time.slice(0, 5)}</td>
                      <td>{!s.active && <span className='badge archived'>Disabled</span>}</td>
                      <td className='list-actions'>
                        <button className='button small' onClick={() => startEditing(s)}>
                          Edit
                        </button>
                        <button className='secondary small' onClick={() => handleToggleActive(s)}>
                          {s.active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {slots.length === 0 && (
                <tr>
                  <td colSpan={5} className='muted'>
                    No opening times set up yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <form className='form-card' onSubmit={handleAdd} style={{ maxWidth: 480 }}>
            <h2 style={{ marginTop: 0 }}>Add a slot</h2>
            <div className='field-row'>
              <label className='field'>
                Day
                <select value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}>
                  {DAY_NAMES.map((name, i) => (
                    <option key={i} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className='field'>
                Start
                <input
                  type='time'
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  required
                />
              </label>
              <label className='field'>
                End
                <input
                  type='time'
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  required
                />
              </label>
            </div>
            <button type='submit'>Add slot</button>
          </form>
        </>
      )}
    </div>
  );
}
