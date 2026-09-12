import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

// REQ-3, REQ-4 (screens-and-flows.md 2.7): start a new supplier order --
// supplier name with autocomplete from previously used suppliers (or a new
// one), order number, order date, and a repeatable item/size/quantity line
// picker.

interface SizeOption {
  item_size_id: string;
  item_name: string;
  size_label: string;
}

interface JoinedRow {
  id: string;
  size_label: string;
  items: { name: string } | null;
}

interface LineDraft {
  item_size_id: string;
  quantity: string;
}

export function OrderFormPage() {
  const navigate = useNavigate();
  const [supplierName, setSupplierName] = useState('');
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [orderNumber, setOrderNumber] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sizeOptions, setSizeOptions] = useState<SizeOption[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([{ item_size_id: '', quantity: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: suppliers } = await supabase.from('suppliers').select('name').order('name');
      setSupplierOptions((suppliers ?? []).map(s => s.name));

      const { data: sizes } = await supabase
        .from('item_sizes')
        .select('id, size_label, items!inner(name, active)')
        .eq('active', true)
        .eq('items.active', true)
        .order('sort_order', { ascending: true })
        .returns<JoinedRow[]>();
      setSizeOptions(
        (sizes ?? []).map(s => ({
          item_size_id: s.id,
          item_name: s.items?.name ?? '(unknown item)',
          size_label: s.size_label
        }))
      );
    }
    load();
  }, []);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines(prev => [...prev, { item_size_id: '', quantity: '' }]);
  }

  function removeLine(index: number) {
    setLines(prev => prev.filter((_, i) => i !== index));
  }

  async function resolveSupplierId(name: string): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const { data: existing } = await supabase
      .from('suppliers')
      .select('id')
      .eq('name', trimmed)
      .maybeSingle();
    if (existing) return existing.id;
    const { data: created, error } = await supabase
      .from('suppliers')
      .insert({ name: trimmed })
      .select()
      .single();
    if (error) {
      setError(error.message);
      return null;
    }
    return created.id;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const validLines = lines.filter(l => l.item_size_id && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setError('Add at least one line with an item/size and a quantity greater than zero.');
      return;
    }

    setSaving(true);
    const supplierId = await resolveSupplierId(supplierName);
    if (!supplierId) {
      setSaving(false);
      if (!error) setError('Enter a supplier name.');
      return;
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber.trim(),
        supplier_id: supplierId,
        order_date: orderDate,
        status: 'order_placed'
      })
      .select()
      .single();

    if (orderError || !order) {
      setSaving(false);
      setError(orderError?.message ?? 'Failed to create the order.');
      return;
    }

    const { error: linesError } = await supabase.from('order_lines').insert(
      validLines.map(l => ({
        order_id: order.id,
        item_size_id: l.item_size_id,
        quantity_ordered: Number(l.quantity)
      }))
    );

    setSaving(false);
    if (linesError) {
      setError(linesError.message);
      return;
    }

    navigate(`/orders/${order.id}`);
  }

  return (
    <div className='page'>
      <h1>New supplier order</h1>
      <form className='form-card' onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
        <div className='field-row'>
          <label className='field'>
            Supplier
            <input
              list='supplier-options'
              value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              required
            />
            <datalist id='supplier-options'>
              {supplierOptions.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label className='field'>
            Order number
            <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} required />
          </label>
          <label className='field'>
            Order date
            <input
              type='date'
              value={orderDate}
              onChange={e => setOrderDate(e.target.value)}
              required
            />
          </label>
        </div>

        <h2>Line items</h2>
        {lines.map((line, index) => (
          <div className='field-row' key={index}>
            <label className='field' style={{ flex: 2 }}>
              Item / size
              <select
                value={line.item_size_id}
                onChange={e => updateLine(index, { item_size_id: e.target.value })}>
                <option value=''>Select…</option>
                {sizeOptions.map(s => (
                  <option key={s.item_size_id} value={s.item_size_id}>
                    {s.item_name} — {s.size_label}
                  </option>
                ))}
              </select>
            </label>
            <label className='field'>
              Quantity
              <input
                type='number'
                min='1'
                value={line.quantity}
                onChange={e => updateLine(index, { quantity: e.target.value })}
              />
            </label>
            <button
              type='button'
              className='secondary'
              onClick={() => removeLine(index)}
              disabled={lines.length === 1}>
              Remove
            </button>
          </div>
        ))}
        <button type='button' className='secondary' onClick={addLine}>
          + Add line
        </button>

        {error && <p className='error'>{error}</p>}

        <div style={{ marginTop: '1rem' }}>
          <button type='submit' disabled={saving}>
            {saving ? 'Creating…' : 'Create order'}
          </button>
        </div>
      </form>
    </div>
  );
}
