import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { ORDER_STATUS_LABELS, ORDER_STATUS_SEQUENCE } from '../../lib/orderStatus';
import type { OrderStatus } from '../../lib/database.types';

// The hub for managing one order through its lifecycle (screens-and-flows.md
// 2.8, 2.9, 2.10): line items with ordered vs. received, the status
// sequence, check-in, invoice steps, a manual override with a confirmation
// warning (REQ-13), and this order's delivery history.

interface OrderInfo {
  id: string;
  order_number: string;
  order_date: string;
  status: OrderStatus;
  invoice_check_note: string | null;
  invoice_sent_date: string | null;
  supplier_name: string;
}

interface LineInfo {
  order_line_id: string;
  item_size_id: string;
  item_name: string;
  size_label: string;
  quantity_ordered: number;
  quantity_received: number;
}

interface DeliveryInfo {
  id: string;
  delivery_date: string;
  received_by_name: string;
  lines: { item_name: string; size_label: string; quantity_received: number }[];
}

export function OrderDetailPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [lines, setLines] = useState<LineInfo[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [checkingIn, setCheckingIn] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, string>>({});

  const [invoiceNote, setInvoiceNote] = useState('');
  const [overrideStatus, setOverrideStatus] = useState<OrderStatus>('order_placed');

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);

    const { data: orderRow, error: orderError } = await supabase
      .from('orders')
      .select('*, suppliers(name)')
      .eq('id', id)
      .single<{
        id: string;
        order_number: string;
        order_date: string;
        status: OrderStatus;
        invoice_check_note: string | null;
        invoice_sent_date: string | null;
        suppliers: { name: string } | null;
      }>();

    if (orderError || !orderRow) {
      setError(orderError?.message ?? 'Order not found.');
      setLoading(false);
      return;
    }

    setOrder({
      id: orderRow.id,
      order_number: orderRow.order_number,
      order_date: orderRow.order_date,
      status: orderRow.status,
      invoice_check_note: orderRow.invoice_check_note,
      invoice_sent_date: orderRow.invoice_sent_date,
      supplier_name: orderRow.suppliers?.name ?? '(unknown supplier)'
    });
    setOverrideStatus(orderRow.status);

    const { data: orderLines } = await supabase
      .from('order_lines')
      .select('id, item_size_id, quantity_ordered, item_sizes(size_label, items(name))')
      .eq('order_id', id)
      .returns<
        {
          id: string;
          item_size_id: string;
          quantity_ordered: number;
          item_sizes: { size_label: string; items: { name: string } | null } | null;
        }[]
      >();

    const lineIds = (orderLines ?? []).map(l => l.id);
    const { data: deliveryLineRows } = lineIds.length
      ? await supabase
          .from('delivery_lines')
          .select('order_line_id, quantity_received')
          .in('order_line_id', lineIds)
      : { data: [] };

    const receivedByLine = new Map<string, number>();
    for (const dl of deliveryLineRows ?? []) {
      receivedByLine.set(
        dl.order_line_id,
        (receivedByLine.get(dl.order_line_id) ?? 0) + dl.quantity_received
      );
    }

    setLines(
      (orderLines ?? []).map(l => ({
        order_line_id: l.id,
        item_size_id: l.item_size_id,
        item_name: l.item_sizes?.items?.name ?? '(unknown item)',
        size_label: l.item_sizes?.size_label ?? '?',
        quantity_ordered: l.quantity_ordered,
        quantity_received: receivedByLine.get(l.id) ?? 0
      }))
    );

    const { data: deliveryRows } = await supabase
      .from('deliveries')
      .select('id, delivery_date, profiles(display_name)')
      .eq('order_id', id)
      .order('delivery_date', { ascending: false })
      .returns<
        { id: string; delivery_date: string; profiles: { display_name: string } | null }[]
      >();

    const deliveryIds = (deliveryRows ?? []).map(d => d.id);
    const { data: allDeliveryLines } = deliveryIds.length
      ? await supabase
          .from('delivery_lines')
          .select(
            'delivery_id, quantity_received, order_lines(item_sizes(size_label, items(name)))'
          )
          .in('delivery_id', deliveryIds)
          .returns<
            {
              delivery_id: string;
              quantity_received: number;
              order_lines: {
                item_sizes: { size_label: string; items: { name: string } | null } | null;
              } | null;
            }[]
          >()
      : { data: [] };

    setDeliveries(
      (deliveryRows ?? []).map(d => ({
        id: d.id,
        delivery_date: d.delivery_date,
        received_by_name: d.profiles?.display_name ?? 'Unknown',
        lines: (allDeliveryLines ?? [])
          .filter(dl => dl.delivery_id === d.id)
          .map(dl => ({
            item_name: dl.order_lines?.item_sizes?.items?.name ?? '(unknown item)',
            size_label: dl.order_lines?.item_sizes?.size_label ?? '?',
            quantity_received: dl.quantity_received
          }))
      }))
    );

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleCheckIn(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    const toInsert = lines
      .map(l => ({
        order_line_id: l.order_line_id,
        quantity_received: Number(receivedQuantities[l.order_line_id] || 0)
      }))
      .filter(l => l.quantity_received > 0);

    if (toInsert.length === 0) {
      setError('Enter a received quantity for at least one line.');
      return;
    }

    setBusy(true);
    setError(null);
    const { data: delivery, error: deliveryError } = await supabase
      .from('deliveries')
      .insert({ order_id: id, delivery_date: deliveryDate, received_by: profile?.id ?? null })
      .select()
      .single();

    if (deliveryError || !delivery) {
      setBusy(false);
      setError(deliveryError?.message ?? 'Failed to record the delivery.');
      return;
    }

    const { error: linesError } = await supabase.from('delivery_lines').insert(
      toInsert.map(l => ({
        delivery_id: delivery.id,
        order_line_id: l.order_line_id,
        quantity_received: l.quantity_received
      }))
    );

    setBusy(false);
    if (linesError) {
      setError(linesError.message);
      return;
    }
    setCheckingIn(false);
    setReceivedQuantities({});
    await load();
  }

  async function handleMarkInvoiceChecked() {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase
      .from('orders')
      .update({ status: 'invoice_checked', invoice_check_note: invoiceNote.trim() || null })
      .eq('id', id);
    setBusy(false);
    if (error) setError(error.message);
    else await load();
  }

  async function handleMarkInvoiceSent() {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'invoice_sent_to_treasurer',
        invoice_sent_date: new Date().toISOString().slice(0, 10)
      })
      .eq('id', id);
    setBusy(false);
    if (error) setError(error.message);
    else await load();
  }

  async function handleClose() {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.from('orders').update({ status: 'closed' }).eq('id', id);
    setBusy(false);
    if (error) setError(error.message);
    else await load();
  }

  async function handleOverride() {
    if (!id || !order) return;
    if (
      !window.confirm(
        `Manually override this order's status to "${ORDER_STATUS_LABELS[overrideStatus]}"? This bypasses the normal flow and won't re-check what's actually been received or invoiced.`
      )
    ) {
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('orders').update({ status: overrideStatus }).eq('id', id);
    setBusy(false);
    if (error) setError(error.message);
    else await load();
  }

  if (loading) return <div className='page'>Loading…</div>;
  if (!order) return <div className='page error'>{error ?? 'Order not found.'}</div>;

  const hasOutstanding = lines.some(l => l.quantity_received < l.quantity_ordered);

  return (
    <div className='page'>
      <div className='page-header'>
        <h1>
          Order {order.order_number} <span className='muted'>— {order.supplier_name}</span>
        </h1>
        <span className={`badge status-${order.status}`}>{ORDER_STATUS_LABELS[order.status]}</span>
      </div>
      <p className='muted'>Ordered {order.order_date}</p>

      {error && <p className='error'>{error}</p>}

      <div className='form-card'>
        <h2>Line items</h2>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Size</th>
              <th>Ordered</th>
              <th>Received</th>
              <th>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.order_line_id}>
                <td>{l.item_name}</td>
                <td>{l.size_label}</td>
                <td>{l.quantity_ordered}</td>
                <td>{l.quantity_received}</td>
                <td>{Math.max(0, l.quantity_ordered - l.quantity_received)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {order.status !== 'closed' && hasOutstanding && (
        <div className='form-card'>
          <div className='page-header'>
            <h2>Check in a delivery</h2>
            <button type='button' className='secondary' onClick={() => setCheckingIn(v => !v)}>
              {checkingIn ? 'Cancel' : 'Check in a delivery'}
            </button>
          </div>
          {checkingIn && (
            <form onSubmit={handleCheckIn}>
              <label className='field' style={{ maxWidth: 200 }}>
                Delivery date
                <input
                  type='date'
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  required
                />
              </label>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Size</th>
                    <th>Outstanding</th>
                    <th>Received now</th>
                  </tr>
                </thead>
                <tbody>
                  {lines
                    .filter(l => l.quantity_received < l.quantity_ordered)
                    .map(l => (
                      <tr key={l.order_line_id}>
                        <td>{l.item_name}</td>
                        <td>{l.size_label}</td>
                        <td>{l.quantity_ordered - l.quantity_received}</td>
                        <td>
                          <input
                            type='number'
                            min='0'
                            max={l.quantity_ordered - l.quantity_received}
                            value={receivedQuantities[l.order_line_id] ?? ''}
                            onChange={e =>
                              setReceivedQuantities(prev => ({
                                ...prev,
                                [l.order_line_id]: e.target.value
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <button type='submit' disabled={busy} style={{ marginTop: '0.75rem' }}>
                {busy ? 'Saving…' : 'Record delivery'}
              </button>
            </form>
          )}
        </div>
      )}

      <div className='form-card'>
        <h2>Invoice & closing</h2>
        <div className='toolbar' style={{ flexWrap: 'wrap' }}>
          {(order.status === 'partially_received' || order.status === 'fully_received') && (
            <div className='field-row' style={{ alignItems: 'flex-end' }}>
              <label className='field' style={{ flex: 2 }}>
                Discrepancy note (optional)
                <input value={invoiceNote} onChange={e => setInvoiceNote(e.target.value)} />
              </label>
              <button type='button' disabled={busy} onClick={handleMarkInvoiceChecked}>
                Mark invoice checked
              </button>
            </div>
          )}
          {order.status === 'invoice_checked' && (
            <button type='button' disabled={busy} onClick={handleMarkInvoiceSent}>
              Mark invoice sent to treasurer
            </button>
          )}
          {order.status === 'invoice_sent_to_treasurer' && (
            <button type='button' disabled={busy} onClick={handleClose}>
              Close order
            </button>
          )}
          {order.status === 'closed' && <p className='muted'>This order is closed.</p>}
        </div>
        {order.invoice_check_note && (
          <p className='muted'>Invoice note: {order.invoice_check_note}</p>
        )}
        {order.invoice_sent_date && (
          <p className='muted'>Invoice sent to treasurer: {order.invoice_sent_date}</p>
        )}
      </div>

      <div className='form-card'>
        <h2>Manual status override</h2>
        <p className='muted'>
          Bypasses the normal flow (REQ-13) — for cases like closing early or correcting a mistaken
          status change.
        </p>
        <div className='field-row' style={{ alignItems: 'flex-end' }}>
          <label className='field'>
            New status
            <select
              value={overrideStatus}
              onChange={e => setOverrideStatus(e.target.value as OrderStatus)}>
              {ORDER_STATUS_SEQUENCE.map(s => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <button type='button' className='secondary' disabled={busy} onClick={handleOverride}>
            Apply override
          </button>
        </div>
      </div>

      <div className='form-card'>
        <h2>Delivery history for this order</h2>
        {deliveries.length === 0 && <p className='muted'>No deliveries yet.</p>}
        {deliveries.map(d => (
          <div key={d.id} style={{ marginBottom: '1rem' }}>
            <strong>{d.delivery_date}</strong>{' '}
            <span className='muted'>— received by {d.received_by_name}</span>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Size</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.item_name}</td>
                    <td>{l.size_label}</td>
                    <td>{l.quantity_received}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <p>
        <Link to='/orders'>&larr; Back to orders</Link>
      </p>
    </div>
  );
}
