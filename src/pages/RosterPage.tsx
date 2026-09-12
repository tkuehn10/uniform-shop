import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../auth/AuthContext';
import type { OpeningTimeSlot, RosterClaim, SchoolHoliday } from '../lib/database.types';

// REQ-26, REQ-27, REQ-28, REQ-31 (screens-and-flows.md 2.15): a calendar of
// upcoming opening-time slots. Open slots show a "claim" action; claimed
// slots show the name and an "un-claim" action; dates within a school
// holiday period are visually marked as closed and not claimable (REQ-32).

const WEEKS_AHEAD = 6;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DayEntry {
  date: string;
  holidayLabel: string | null;
  slots: {
    slot: OpeningTimeSlot;
    claim: RosterClaim | null;
  }[];
}

export function RosterPage() {
  const { profile } = useAuth();
  const [slots, setSlots] = useState<OpeningTimeSlot[]>([]);
  const [holidays, setHolidays] = useState<SchoolHoliday[]>([]);
  const [claims, setClaims] = useState<RosterClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [claimName, setClaimName] = useState('');
  const [busy, setBusy] = useState(false);

  const rangeStart = useMemo(() => isoDate(new Date()), []);
  const rangeEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + WEEKS_AHEAD * 7);
    return isoDate(d);
  }, []);

  async function load() {
    setLoading(true);
    setError(null);

    const [{ data: slotData, error: slotError }, { data: holidayData }, { data: claimData }] =
      await Promise.all([
        supabase.from('opening_time_slots').select('*').eq('active', true),
        supabase
          .from('school_holidays')
          .select('*')
          .lte('start_date', rangeEnd)
          .gte('end_date', rangeStart),
        supabase
          .from('roster_claims')
          .select('*')
          .gte('occurrence_date', rangeStart)
          .lte('occurrence_date', rangeEnd)
      ]);

    if (slotError) {
      setError(slotError.message);
      setLoading(false);
      return;
    }

    setSlots(slotData ?? []);
    setHolidays(holidayData ?? []);
    setClaims(claimData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days: DayEntry[] = useMemo(() => {
    const result: DayEntry[] = [];
    const start = new Date(rangeStart + 'T00:00:00');
    for (let i = 0; i < WEEKS_AHEAD * 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = isoDate(d);
      const dayOfWeek = d.getDay();

      const holiday = holidays.find(h => dateStr >= h.start_date && dateStr <= h.end_date);
      if (holiday) {
        result.push({ date: dateStr, holidayLabel: holiday.label ?? 'School holiday', slots: [] });
        continue;
      }

      const daySlots = slots
        .filter(s => s.day_of_week === dayOfWeek)
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .map(slot => ({
          slot,
          claim:
            claims.find(c => c.opening_time_slot_id === slot.id && c.occurrence_date === dateStr) ??
            null
        }));

      if (daySlots.length > 0) {
        result.push({ date: dateStr, holidayLabel: null, slots: daySlots });
      }
    }
    return result;
  }, [rangeStart, slots, holidays, claims]);

  function keyFor(slotId: string, date: string) {
    return `${slotId}__${date}`;
  }

  async function handleClaim(slot: OpeningTimeSlot, date: string) {
    if (!claimName.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('roster_claims').insert({
      opening_time_slot_id: slot.id,
      occurrence_date: date,
      claimed_name: claimName.trim(),
      claimed_by: profile?.id ?? null
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setClaimingKey(null);
    setClaimName('');
    await load();
  }

  async function handleUnclaim(claim: RosterClaim) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('roster_claims').delete().eq('id', claim.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  }

  if (loading) return <div className='page'>Loading…</div>;

  return (
    <div className='page'>
      <h1>Roster</h1>
      {error && <p className='error'>{error}</p>}

      {days.length === 0 && (
        <p className='muted'>No opening-time slots configured yet — set them up under Settings.</p>
      )}

      {days.map(day => {
        const date = new Date(day.date + 'T00:00:00');
        const label = `${DAY_NAMES[date.getDay()]} ${day.date}`;
        return (
          <div className='form-card' key={day.date}>
            <h2 style={{ marginTop: 0 }}>{label}</h2>
            {day.holidayLabel ? (
              <p className='badge archived'>Closed — {day.holidayLabel}</p>
            ) : (
              <div className='cart-lines'>
                {day.slots.map(({ slot, claim }) => {
                  const key = keyFor(slot.id, day.date);
                  return (
                    <div className='cart-line' key={key}>
                      <div className='cart-line-info'>
                        {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                        {claim && (
                          <>
                            {' '}
                            — <strong>{claim.claimed_name}</strong>
                          </>
                        )}
                      </div>
                      {claim ? (
                        <button
                          type='button'
                          className='secondary small'
                          disabled={busy}
                          onClick={() => handleUnclaim(claim)}>
                          Un-claim
                        </button>
                      ) : claimingKey === key ? (
                        <>
                          <input
                            placeholder='Name'
                            value={claimName}
                            onChange={e => setClaimName(e.target.value)}
                            style={{ width: '10rem' }}
                          />
                          <button
                            type='button'
                            className='small'
                            disabled={busy || !claimName.trim()}
                            onClick={() => handleClaim(slot, day.date)}>
                            Save
                          </button>
                        </>
                      ) : (
                        <button
                          type='button'
                          className='button small'
                          onClick={() => {
                            setClaimingKey(key);
                            setClaimName('');
                          }}>
                          Claim
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
