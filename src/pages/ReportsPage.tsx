import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { downloadCsv, toCsv } from '../lib/csv';
import { addDaysIso, todayIsoDate } from '../lib/dates';

// REQ-19, REQ-20, REQ-21, REQ-22 (screens-and-flows.md 2.14): units sold per
// item/size over a period, a date-range picker with quick presets, viewed
// per item/size or (via the total row) shop-wide, and a CSV export.

interface ReportRow {
  item_size_id: string;
  item_name: string;
  size_label: string;
  quantity_sold: number;
}

interface JoinedRow {
  item_size_id: string;
  quantity: number;
  item_sizes: { size_label: string; items: { name: string } | null } | null;
}

type Preset = 'today' | 'month' | 'year' | 'custom';

export function ReportsPage() {
  const today = todayIsoDate();
  const monthStart = today.slice(0, 7) + '-01';
  const yearStart = today.slice(0, 4) + '-01-01';

  const [preset, setPreset] = useState<Preset>('month');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  function applyPreset(next: Preset) {
    setPreset(next);
    if (next === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (next === 'month') {
      setStartDate(monthStart);
      setEndDate(today);
    } else if (next === 'year') {
      setStartDate(yearStart);
      setEndDate(today);
    }
  }

  async function runReport() {
    setLoading(true);
    setError(null);
    setHasRun(true);

    const rangeStart = `${startDate}T00:00:00`;
    const rangeEndExclusive = `${addDaysIso(endDate, 1)}T00:00:00`;

    const { data, error } = await supabase
      .from('sale_lines')
      .select('item_size_id, quantity, sales!inner(sold_at), item_sizes(size_label, items(name))')
      .gte('sales.sold_at', rangeStart)
      .lt('sales.sold_at', rangeEndExclusive)
      .returns<JoinedRow[]>();

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const totals = new Map<string, ReportRow>();
    for (const r of data ?? []) {
      const key = r.item_size_id;
      const existing = totals.get(key);
      if (existing) {
        existing.quantity_sold += r.quantity;
      } else {
        totals.set(key, {
          item_size_id: key,
          item_name: r.item_sizes?.items?.name ?? '(unknown item)',
          size_label: r.item_sizes?.size_label ?? '?',
          quantity_sold: r.quantity
        });
      }
    }

    setRows(Array.from(totals.values()).sort((a, b) => b.quantity_sold - a.quantity_sold));
    setLoading(false);
  }

  const shopWideTotal = rows.reduce((sum, r) => sum + r.quantity_sold, 0);

  function handleExport() {
    const csv = toCsv(
      ['Item', 'Size', 'Quantity sold'],
      rows.map(r => [r.item_name, r.size_label, r.quantity_sold])
    );
    downloadCsv(`sales-report_${startDate}_to_${endDate}.csv`, csv);
  }

  return (
    <div className='page'>
      <h1>Sales reports</h1>

      <div className='form-card'>
        <div className='field-row'>
          <label className='field'>
            Preset
            <select value={preset} onChange={e => applyPreset(e.target.value as Preset)}>
              <option value='today'>Today</option>
              <option value='month'>This month</option>
              <option value='year'>This year</option>
              <option value='custom'>Custom range</option>
            </select>
          </label>
          <label className='field'>
            From
            <input
              type='date'
              value={startDate}
              onChange={e => {
                setPreset('custom');
                setStartDate(e.target.value);
              }}
            />
          </label>
          <label className='field'>
            To
            <input
              type='date'
              value={endDate}
              onChange={e => {
                setPreset('custom');
                setEndDate(e.target.value);
              }}
            />
          </label>
          <button type='button' onClick={runReport} disabled={loading}>
            {loading ? 'Running…' : 'Run report'}
          </button>
        </div>
      </div>

      {error && <p className='error'>{error}</p>}

      {hasRun && !loading && !error && (
        <>
          <div className='toolbar'>
            <p className='muted' style={{ margin: 0 }}>
              {startDate} to {endDate} — {shopWideTotal} units sold across {rows.length} item/size
              line{rows.length === 1 ? '' : 's'}
            </p>
            <button
              type='button'
              className='secondary'
              onClick={handleExport}
              disabled={rows.length === 0}>
              Export CSV
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Size</th>
                <th>Quantity sold</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.item_size_id}>
                  <td>{r.item_name}</td>
                  <td>{r.size_label}</td>
                  <td>{r.quantity_sold}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className='muted'>
                    No sales in this period.
                  </td>
                </tr>
              )}
              {rows.length > 0 && (
                <tr>
                  <td colSpan={2}>
                    <strong>Shop-wide total</strong>
                  </td>
                  <td>
                    <strong>{shopWideTotal}</strong>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
