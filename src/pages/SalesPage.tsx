import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../auth/AuthContext';
import { hexToDataUrl } from '../lib/photo';
import type { ItemCategory } from '../lib/database.types';

// REQ-23, REQ-24 (screens-and-flows.md 2.5): the main day-to-day screen for
// sales staff. Fast type-ahead search across the full catalog, plus small
// per-category buttons (Tops/Bottoms/Hats/Socks) that expand into a photo
// grid of every item in that category, for quick selection without typing.
// Add multiple lines, submit. Also shows each item's photo (REQ-2) and
// price for visual confirmation and a running total (reference only --
// A4, no payment processing).
//
// Both the search suggestions and the category grid show one entry per
// *item*, not per item/size -- sizes are picked afterwards from a dropdown
// on the cart line itself (showing on-hand as muted info rather than a
// separate warning), and a size must be chosen before the sale can be
// submitted.

interface SizeOption {
  item_size_id: string;
  size_label: string;
  quantity_on_hand: number;
}

interface CatalogItem {
  item_id: string;
  item_name: string;
  price: number | null;
  category: ItemCategory;
  photoUrl: string | null;
  sizes: SizeOption[];
}

interface JoinedRow {
  id: string;
  size_label: string;
  quantity_on_hand: number;
  items: { id: string; name: string; price: number | null; category: ItemCategory } | null;
}

const CATEGORIES: ItemCategory[] = ['Tops', 'Bottoms', 'Hats', 'Socks'];

interface CartLine {
  lineId: string;
  item_id: string;
  item_name: string;
  price: number | null;
  photoUrl: string | null;
  sizes: SizeOption[];
  item_size_id: string; // '' until a size is chosen
  quantity: number;
}

export function SalesPage() {
  const { profile } = useAuth();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<ItemCategory | null>(null);

  async function loadCatalog() {
    setCatalogLoading(true);
    const { data, error } = await supabase
      .from('item_sizes')
      .select('id, size_label, quantity_on_hand, items!inner(id, name, price, active, category)')
      .eq('active', true)
      .eq('items.active', true)
      .order('sort_order', { ascending: true })
      .returns<JoinedRow[]>();

    if (error || !data) {
      setCatalogLoading(false);
      return;
    }

    const itemIds = Array.from(new Set(data.map(r => r.items?.id).filter(Boolean))) as string[];
    const photoByItemId = new Map<string, string>();
    if (itemIds.length > 0) {
      const { data: photos } = await supabase
        .from('item_photos')
        .select('item_id, image_data, content_type')
        .in('item_id', itemIds);
      for (const p of photos ?? []) {
        photoByItemId.set(p.item_id, hexToDataUrl(p.image_data, p.content_type));
      }
    }

    const byItem = new Map<string, CatalogItem>();
    for (const r of data) {
      const itemId = r.items?.id;
      if (!itemId) continue;
      let entry = byItem.get(itemId);
      if (!entry) {
        entry = {
          item_id: itemId,
          item_name: r.items?.name ?? '(unknown item)',
          price: r.items?.price ?? null,
          category: r.items?.category ?? 'Tops',
          photoUrl: photoByItemId.get(itemId) ?? null,
          sizes: []
        };
        byItem.set(itemId, entry);
      }
      entry.sizes.push({
        item_size_id: r.id,
        size_label: r.size_label,
        quantity_on_hand: r.quantity_on_hand
      });
    }

    setCatalog(Array.from(byItem.values()));
    setCatalogLoading(false);
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return catalog.filter(c => c.item_name.toLowerCase().includes(q)).slice(0, 15);
  }, [search, catalog]);

  const categoryItems = useMemo(() => {
    if (!expandedCategory) return [];
    return catalog.filter(c => c.category === expandedCategory);
  }, [expandedCategory, catalog]);

  function toggleCategory(cat: ItemCategory) {
    setExpandedCategory(prev => (prev === cat ? null : cat));
  }

  function addLine(c: CatalogItem) {
    setSuccess(null);
    setLines(prev => [
      ...prev,
      {
        lineId: crypto.randomUUID(),
        item_id: c.item_id,
        item_name: c.item_name,
        price: c.price,
        photoUrl: c.photoUrl,
        sizes: c.sizes,
        item_size_id: '',
        quantity: 1
      }
    ]);
    setSearch('');
    setExpandedCategory(null);
  }

  function updateLineSize(lineId: string, itemSizeId: string) {
    setLines(prev => prev.map(l => (l.lineId === lineId ? { ...l, item_size_id: itemSizeId } : l)));
  }

  function updateQuantity(lineId: string, quantity: number) {
    setLines(prev => prev.map(l => (l.lineId === lineId ? { ...l, quantity } : l)));
  }

  function removeLine(lineId: string) {
    setLines(prev => prev.filter(l => l.lineId !== lineId));
  }

  function selectedSize(l: CartLine): SizeOption | null {
    return l.sizes.find(s => s.item_size_id === l.item_size_id) ?? null;
  }

  const missingSize = lines.some(l => !l.item_size_id);
  const wouldGoNegative = lines.some(l => {
    const size = selectedSize(l);
    return size && l.quantity > size.quantity_on_hand;
  });
  const totalPrice = lines.reduce((sum, l) => sum + (l.price ?? 0) * l.quantity, 0);

  function formatPrice(price: number | null): string {
    return price != null ? `$${price.toFixed(2)}` : '—';
  }

  async function handleSubmit() {
    if (lines.length === 0) return;
    if (missingSize) {
      setError('Choose a size for every line before recording the sale.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({ created_by: profile?.id ?? null })
      .select()
      .single();

    if (saleError || !sale) {
      setSubmitting(false);
      setError(saleError?.message ?? 'Failed to start the sale.');
      return;
    }

    const { error: linesError } = await supabase.from('sale_lines').insert(
      lines.map(l => ({
        sale_id: sale.id,
        item_size_id: l.item_size_id,
        quantity: l.quantity
      }))
    );

    setSubmitting(false);
    if (linesError) {
      setError(linesError.message);
      return;
    }

    setSuccess(`Sale recorded: ${lines.length} line${lines.length === 1 ? '' : 's'}.`);
    setLines([]);
    loadCatalog();
  }

  return (
    <div className='page'>
      <h1>Record a sale</h1>

      <div style={{ position: 'relative', maxWidth: 480 }}>
        <input
          className='search'
          placeholder='Search items by name…'
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={catalogLoading}
        />
        {suggestions.length > 0 && (
          <ul className='suggestion-list'>
            {suggestions.map(c => (
              <li key={c.item_id}>
                <button type='button' onClick={() => addLine(c)}>
                  {c.photoUrl ? (
                    <img src={c.photoUrl} alt='' className='item-photo small' />
                  ) : (
                    <div className='item-photo placeholder small'>No photo</div>
                  )}
                  <span className='suggestion-text'>
                    {c.item_name} <span className='muted'>{formatPrice(c.price)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className='category-buttons'>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            type='button'
            className={expandedCategory === cat ? 'small' : 'secondary small'}
            onClick={() => toggleCategory(cat)}>
            {cat}
          </button>
        ))}
      </div>

      {expandedCategory && (
        <div className='category-items'>
          {categoryItems.length === 0 ? (
            <p className='muted'>No items in {expandedCategory}.</p>
          ) : (
            categoryItems.map(c => (
              <button
                type='button'
                key={c.item_id}
                className='category-item'
                onClick={() => addLine(c)}>
                {c.photoUrl ? (
                  <img src={c.photoUrl} alt='' className='item-photo' />
                ) : (
                  <div className='item-photo placeholder'>No photo</div>
                )}
                <span>{c.item_name}</span>
                <span className='muted'>{formatPrice(c.price)}</span>
              </button>
            ))
          )}
        </div>
      )}

      {lines.length > 0 && (
        <div className='cart-lines'>
          {lines.map(l => {
            const size = selectedSize(l);
            return (
              <div className='cart-line' key={l.lineId}>
                {l.photoUrl ? (
                  <img src={l.photoUrl} alt='' className='item-photo small' />
                ) : (
                  <div className='item-photo placeholder small'>No photo</div>
                )}
                <div className='cart-line-info'>
                  <strong>{l.item_name}</strong>{' '}
                  <span className='muted'>{formatPrice(l.price)} each</span>
                  {!l.item_size_id && <div className='warning'>Choose a size to continue.</div>}
                  {size && (
                    <div className='muted' style={{ marginTop: '0.35rem' }}>
                      {size.quantity_on_hand} on hand
                    </div>
                  )}
                </div>
                <select
                  value={l.item_size_id}
                  onChange={e => updateLineSize(l.lineId, e.target.value)}
                  required>
                  <option value='' disabled>
                    Select size…
                  </option>
                  {l.sizes.map(s => (
                    <option key={s.item_size_id} value={s.item_size_id}>
                      {s.size_label}
                    </option>
                  ))}
                </select>
                <input
                  type='number'
                  min='1'
                  value={l.quantity}
                  onChange={e => updateQuantity(l.lineId, Number(e.target.value) || 1)}
                />
                <span className='cart-line-subtotal'>
                  {formatPrice(l.price != null ? l.price * l.quantity : null)}
                </span>
                <button
                  type='button'
                  className='secondary small'
                  onClick={() => removeLine(l.lineId)}>
                  Remove
                </button>
              </div>
            );
          })}
          <div className='cart-total'>
            Total: <strong>{formatPrice(totalPrice)}</strong>
          </div>
        </div>
      )}

      {error && <p className='error'>{error}</p>}
      {success && <p className='success'>{success}</p>}
      {wouldGoNegative && lines.length > 0 && (
        <p className='warning'>One or more lines will take stock negative — still allowed.</p>
      )}

      <div>
        <button onClick={handleSubmit} disabled={submitting || lines.length === 0 || missingSize}>
          {submitting ? 'Recording…' : 'Record sale'}
        </button>
      </div>
    </div>
  );
}
