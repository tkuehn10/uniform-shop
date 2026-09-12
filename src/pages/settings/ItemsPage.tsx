import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

// REQ-1, REQ-36: Admin's item management list (screens-and-flows.md 2.4).
// Entry point into item detail/edit (2.3). Archived items are hidden by
// default, with a toggle to reveal them.

interface ItemRow {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  active: boolean;
  totalOnHand: number;
  sizeCount: number;
}

interface JoinedItem {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  active: boolean;
  item_sizes: { quantity_on_hand: number; active: boolean }[];
}

export function ItemsPage() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('items')
      .select('id, name, category, price, active, item_sizes(quantity_on_hand, active)')
      .order('name', { ascending: true })
      .returns<JoinedItem[]>();

    if (error) {
      setError(error.message);
    } else {
      setItems(
        (data ?? []).map(i => ({
          id: i.id,
          name: i.name,
          category: i.category,
          price: i.price,
          active: i.active,
          sizeCount: i.item_sizes.length,
          totalOnHand: i.item_sizes
            .filter(s => s.active)
            .reduce((sum, s) => sum + s.quantity_on_hand, 0)
        }))
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = items
    .filter(i => showArchived || i.active)
    .filter(i => `${i.name} ${i.category ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className='page'>
      <div className='page-header'>
        <h1>Items</h1>
        <Link className='button' to='/settings/items/new'>
          + New item
        </Link>
      </div>

      <div className='toolbar'>
        <input
          className='search'
          placeholder='Search items…'
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label className='checkbox-row'>
          <input
            type='checkbox'
            checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className='error'>{error}</p>}
      {!loading && !error && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Sizes</th>
              <th>On hand</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>{i.category ?? '—'}</td>
                <td>{i.price != null ? `$${i.price.toFixed(2)}` : '—'}</td>
                <td>{i.sizeCount}</td>
                <td>{i.totalOnHand}</td>
                <td>{!i.active && <span className='badge archived'>Archived</span>}</td>
                <td>
                  <Link className='button small' to={`/settings/items/${i.id}`}>
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className='muted'>
                  No items match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
