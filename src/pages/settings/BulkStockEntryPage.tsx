import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';

// REQ-34 (screens-and-flows.md 2.4a): the main onboarding screen -- enter
// starting on-hand quantities for every item/size in one spreadsheet-style
// grid, rather than opening each item individually. Saving records each
// changed row as a manual stock adjustment (not a sale or stocktake
// discrepancy), and is safe to revisit later, e.g. after adding a batch of
// brand-new items.

interface Row {
  item_size_id: string;
  item_name: string;
  size_label: string;
  current: number;
  input: string;
}

interface JoinedRow {
  id: string;
  size_label: string;
  quantity_on_hand: number;
  items: { name: string } | null;
}

export function BulkStockEntryPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [note, setNote] = useState('Initial stock setup');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('item_sizes')
        .select('id, size_label, quantity_on_hand, items!inner(name, active)')
        .eq('active', true)
        .eq('items.active', true)
        .order('sort_order', { ascending: true })
        .returns<JoinedRow[]>();
      if (error) {
        setError(error.message);
      } else {
        setRows(
          (data ?? []).map(r => ({
            item_size_id: r.id,
            item_name: r.items?.name ?? '(unknown item)',
            size_label: r.size_label,
            current: r.quantity_on_hand,
            input: String(r.quantity_on_hand)
          }))
        );
      }
      setLoading(false);
    }
    load();
  }, []);

  const changedRows = useMemo(
    () =>
      rows
        .map(r => ({ ...r, delta: Number(r.input) - r.current }))
        .filter(r => r.input.trim() !== '' && !Number.isNaN(Number(r.input)) && r.delta !== 0),
    [rows]
  );

  function updateInput(itemSizeId: string, value: string) {
    setRows(prev => prev.map(r => (r.item_size_id === itemSizeId ? { ...r, input: value } : r)));
  }

  async function handleSave() {
    if (changedRows.length === 0) return;
    if (!note.trim()) {
      setError('A note is required for these stock adjustments.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);

    const inserts = changedRows.map(r => ({
      item_size_id: r.item_size_id,
      quantity_delta: r.delta,
      reason: 'manual_adjustment' as const,
      note: note.trim(),
      created_by: profile?.id ?? null
    }));

    const { error } = await supabase.from('stock_movements').insert(inserts);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSuccess(
      `Updated ${changedRows.length} item/size ${changedRows.length === 1 ? 'row' : 'rows'}.`
    );
    setRows(prev =>
      prev.map(r => {
        const changed = changedRows.find(c => c.item_size_id === r.item_size_id);
        return changed ? { ...r, current: Number(r.input) } : r;
      })
    );
  }

  return (
    <div className='page'>
      <h1>Bulk stock entry</h1>
      <p className='muted'>
        Enter the actual on-hand quantity for each item/size. Only changed rows are saved, as a
        manual stock adjustment with the note below.
      </p>

      <label className='field' style={{ maxWidth: 400 }}>
        Note for this batch
        <input value={note} onChange={e => setNote(e.target.value)} required />
      </label>

      {loading && <p>Loading…</p>}
      {error && <p className='error'>{error}</p>}
      {success && <p className='success'>{success}</p>}

      {!loading && (
        <>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Size</th>
                <th>Current</th>
                <th>New quantity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.item_size_id}>
                  <td>{r.item_name}</td>
                  <td>{r.size_label}</td>
                  <td>{r.current}</td>
                  <td>
                    <input
                      type='number'
                      min='0'
                      value={r.input}
                      onChange={e => updateInput(r.item_size_id, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className='muted'>
                    No active items/sizes yet — add some under Settings → Items first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <button onClick={handleSave} disabled={saving || changedRows.length === 0}>
            {saving
              ? 'Saving…'
              : `Save ${changedRows.length || ''} change${changedRows.length === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    </div>
  );
}
