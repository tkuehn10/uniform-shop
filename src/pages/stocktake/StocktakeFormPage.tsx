import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { todayIsoDate } from '../../lib/dates';
import type { StocktakeScope } from '../../lib/database.types';

// REQ-15, REQ-16, REQ-17 (screens-and-flows.md 2.12): choose date and scope
// (full, or a chosen subset for a spot stocktake); for each item/size in
// scope, show the expected quantity and a field for the counted quantity.
// On submit the difference is calculated per line and stock is trued up to
// match the count.

interface CatalogRow {
  item_size_id: string;
  item_name: string;
  size_label: string;
  expected: number;
}

interface JoinedRow {
  id: string;
  size_label: string;
  quantity_on_hand: number;
  items: { name: string } | null;
}

export function StocktakeFormPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [date, setDate] = useState(todayIsoDate);
  const [scope, setScope] = useState<StocktakeScope>('full');
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('item_sizes')
        .select('id, size_label, quantity_on_hand, items!inner(name, active)')
        .eq('active', true)
        .eq('items.active', true)
        .order('sort_order', { ascending: true })
        .returns<JoinedRow[]>();
      setCatalog(
        (data ?? []).map(r => ({
          item_size_id: r.id,
          item_name: r.items?.name ?? '(unknown item)',
          size_label: r.size_label,
          expected: r.quantity_on_hand
        }))
      );
    }
    load();
  }, []);

  const inScope = useMemo(
    () => (scope === 'full' ? catalog : catalog.filter(c => selected.has(c.item_size_id))),
    [scope, catalog, selected]
  );

  const filteredForPicker = catalog.filter(c =>
    `${c.item_name} ${c.size_label}`.toLowerCase().includes(search.toLowerCase())
  );

  function toggleSelected(itemSizeId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(itemSizeId)) next.delete(itemSizeId);
      else next.add(itemSizeId);
      return next;
    });
  }

  const allCounted = inScope.length > 0 && inScope.every(r => counts[r.item_size_id]?.trim());

  async function handleSubmit() {
    if (!allCounted) {
      setError('Enter a counted quantity for every line in scope.');
      return;
    }
    setSaving(true);
    setError(null);

    const { data: stocktake, error: stocktakeError } = await supabase
      .from('stocktakes')
      .insert({ stocktake_date: date, scope, created_by: profile?.id ?? null })
      .select()
      .single();

    if (stocktakeError || !stocktake) {
      setSaving(false);
      setError(stocktakeError?.message ?? 'Failed to start the stocktake.');
      return;
    }

    const rows = inScope.map(r => {
      const counted = Number(counts[r.item_size_id]);
      return {
        stocktake_id: stocktake.id,
        item_size_id: r.item_size_id,
        expected_quantity: r.expected,
        counted_quantity: counted,
        calculated_sold: r.expected - counted
      };
    });

    const { error: countsError } = await supabase.from('stocktake_counts').insert(rows);
    setSaving(false);
    if (countsError) {
      setError(countsError.message);
      return;
    }
    navigate(`/stocktake/${stocktake.id}`);
  }

  return (
    <div className='page'>
      <h1>Start a stocktake</h1>

      <div className='form-card'>
        <div className='field-row'>
          <label className='field'>
            Date
            <input type='date' value={date} onChange={e => setDate(e.target.value)} required />
          </label>
          <label className='field'>
            Scope
            <select value={scope} onChange={e => setScope(e.target.value as StocktakeScope)}>
              <option value='full'>Full (every active item/size)</option>
              <option value='spot'>Spot (choose a subset)</option>
            </select>
          </label>
        </div>

        {scope === 'spot' && (
          <>
            <input
              className='search'
              placeholder='Search items to add to this stocktake…'
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Item</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {filteredForPicker.slice(0, 40).map(c => (
                  <tr key={c.item_size_id}>
                    <td>
                      <input
                        type='checkbox'
                        checked={selected.has(c.item_size_id)}
                        onChange={() => toggleSelected(c.item_size_id)}
                      />
                    </td>
                    <td>{c.item_name}</td>
                    <td>{c.size_label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className='muted'>{selected.size} selected</p>
          </>
        )}
      </div>

      {inScope.length > 0 && (
        <div className='form-card'>
          <h2>Enter counted quantities</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Size</th>
                <th>Expected</th>
                <th>Counted</th>
              </tr>
            </thead>
            <tbody>
              {inScope.map(r => (
                <tr key={r.item_size_id}>
                  <td>{r.item_name}</td>
                  <td>{r.size_label}</td>
                  <td>{r.expected}</td>
                  <td>
                    <input
                      type='number'
                      min='0'
                      value={counts[r.item_size_id] ?? ''}
                      onChange={e =>
                        setCounts(prev => ({ ...prev, [r.item_size_id]: e.target.value }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {error && <p className='error'>{error}</p>}
          <button onClick={handleSubmit} disabled={saving || !allCounted}>
            {saving ? 'Saving…' : 'Submit stocktake'}
          </button>
        </div>
      )}
    </div>
  );
}
