import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../auth/AuthContext';
import { hexToDataUrl } from '../lib/photo';

// REQ-23, REQ-24 (screens-and-flows.md 2.5): the main day-to-day screen for
// sales staff. Fast type-ahead search across the full catalog (not just
// category browsing, since the catalog can run into the hundreds of
// item/size combinations), add multiple lines, submit. Shows a warning (not
// a block) if a line would take stock negative. Also shows each item's
// photo (REQ-2) and price for visual confirmation and a running total
// (reference only -- A4, no payment processing).

interface Catalog {
  item_size_id: string;
  item_id: string;
  item_name: string;
  size_label: string;
  quantity_on_hand: number;
  price: number | null;
  photoUrl: string | null;
}

interface JoinedRow {
  id: string;
  size_label: string;
  quantity_on_hand: number;
  items: { id: string; name: string; price: number | null } | null;
}

interface CartLine {
  item_size_id: string;
  item_id: string;
  item_name: string;
  size_label: string;
  quantity_on_hand: number;
  price: number | null;
  photoUrl: string | null;
  quantity: number;
}

export function SalesPage() {
  const { profile } = useAuth();
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadCatalog() {
    setCatalogLoading(true);
    const { data, error } = await supabase
      .from('item_sizes')
      .select('id, size_label, quantity_on_hand, items!inner(id, name, price, active)')
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

    setCatalog(
      data.map(r => ({
        item_size_id: r.id,
        item_id: r.items?.id ?? '',
        item_name: r.items?.name ?? '(unknown item)',
        size_label: r.size_label,
        quantity_on_hand: r.quantity_on_hand,
        price: r.items?.price ?? null,
        photoUrl: r.items?.id ? (photoByItemId.get(r.items.id) ?? null) : null
      }))
    );
    setCatalogLoading(false);
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return catalog
      .filter(c => `${c.item_name} ${c.size_label}`.toLowerCase().includes(q))
      .slice(0, 15);
  }, [search, catalog]);

  function addLine(c: Catalog) {
    setSuccess(null);
    setLines(prev => {
      const existing = prev.find(l => l.item_size_id === c.item_size_id);
      if (existing) {
        return prev.map(l =>
          l.item_size_id === c.item_size_id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          item_size_id: c.item_size_id,
          item_id: c.item_id,
          item_name: c.item_name,
          size_label: c.size_label,
          quantity_on_hand: c.quantity_on_hand,
          price: c.price,
          photoUrl: c.photoUrl,
          quantity: 1
        }
      ];
    });
    setSearch('');
  }

  function updateQuantity(itemSizeId: string, quantity: number) {
    setLines(prev => prev.map(l => (l.item_size_id === itemSizeId ? { ...l, quantity } : l)));
  }

  function removeLine(itemSizeId: string) {
    setLines(prev => prev.filter(l => l.item_size_id !== itemSizeId));
  }

  const wouldGoNegative = lines.some(l => l.quantity > l.quantity_on_hand);
  const totalPrice = lines.reduce((sum, l) => sum + (l.price ?? 0) * l.quantity, 0);

  function formatPrice(price: number | null): string {
    return price != null ? `$${price.toFixed(2)}` : '—';
  }

  async function handleSubmit() {
    if (lines.length === 0) return;
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
              <li key={c.item_size_id}>
                <button type='button' onClick={() => addLine(c)}>
                  {c.photoUrl ? (
                    <img src={c.photoUrl} alt='' className='item-photo small' />
                  ) : (
                    <div className='item-photo placeholder small'>No photo</div>
                  )}
                  <span className='suggestion-text'>
                    {c.item_name} — {c.size_label}{' '}
                    <span className='muted'>{formatPrice(c.price)}</span>{' '}
                    <span className='muted'>({c.quantity_on_hand} on hand)</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lines.length > 0 && (
        <div className='cart-lines'>
          {lines.map(l => (
            <div className='cart-line' key={l.item_size_id}>
              {l.photoUrl ? (
                <img src={l.photoUrl} alt='' className='item-photo small' />
              ) : (
                <div className='item-photo placeholder small'>No photo</div>
              )}
              <div className='cart-line-info'>
                <strong>{l.item_name}</strong> — {l.size_label}{' '}
                <span className='muted'>
                  {formatPrice(l.price)} each · ({l.quantity_on_hand} on hand)
                </span>
                {l.quantity > l.quantity_on_hand && (
                  <div className='warning' style={{ marginTop: '0.35rem' }}>
                    This will take stock negative.
                  </div>
                )}
              </div>
              <input
                type='number'
                min='1'
                value={l.quantity}
                onChange={e => updateQuantity(l.item_size_id, Number(e.target.value) || 1)}
              />
              <span className='cart-line-subtotal'>
                {formatPrice(l.price != null ? l.price * l.quantity : null)}
              </span>
              <button
                type='button'
                className='secondary small'
                onClick={() => removeLine(l.item_size_id)}>
                Remove
              </button>
            </div>
          ))}
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
        <button onClick={handleSubmit} disabled={submitting || lines.length === 0}>
          {submitting ? 'Recording…' : 'Record sale'}
        </button>
      </div>
    </div>
  );
}
