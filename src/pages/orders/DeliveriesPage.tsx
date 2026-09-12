import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

// REQ-9 (screens-and-flows.md 2.10): a shop-wide delivery history across all
// orders, separate from the per-order history shown on the order detail page.

interface DeliveryRow {
  id: string;
  delivery_date: string;
  order_id: string;
  order_number: string;
  supplier_name: string;
  received_by_name: string;
  total_received: number;
}

export function DeliveriesPage() {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: deliveries, error } = await supabase
        .from('deliveries')
        .select(
          'id, delivery_date, order_id, orders(order_number, suppliers(name)), profiles(display_name)'
        )
        .order('delivery_date', { ascending: false })
        .returns<
          {
            id: string;
            delivery_date: string;
            order_id: string;
            orders: { order_number: string; suppliers: { name: string } | null } | null;
            profiles: { display_name: string } | null;
          }[]
        >();

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const deliveryIds = (deliveries ?? []).map(d => d.id);
      const { data: lines } = deliveryIds.length
        ? await supabase
            .from('delivery_lines')
            .select('delivery_id, quantity_received')
            .in('delivery_id', deliveryIds)
        : { data: [] };

      const totals = new Map<string, number>();
      for (const l of lines ?? []) {
        totals.set(l.delivery_id, (totals.get(l.delivery_id) ?? 0) + l.quantity_received);
      }

      setRows(
        (deliveries ?? []).map(d => ({
          id: d.id,
          delivery_date: d.delivery_date,
          order_id: d.order_id,
          order_number: d.orders?.order_number ?? '?',
          supplier_name: d.orders?.suppliers?.name ?? '(unknown supplier)',
          received_by_name: d.profiles?.display_name ?? 'Unknown',
          total_received: totals.get(d.id) ?? 0
        }))
      );
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className='page'>
      <div className='page-header'>
        <h1>Delivery history</h1>
        <Link className='button' to='/orders'>
          &larr; Back to orders
        </Link>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className='error'>{error}</p>}
      {!loading && !error && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Order #</th>
              <th>Supplier</th>
              <th>Received by</th>
              <th>Total units</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.delivery_date}</td>
                <td>{r.order_number}</td>
                <td>{r.supplier_name}</td>
                <td>{r.received_by_name}</td>
                <td>{r.total_received}</td>
                <td>
                  <Link className='button small' to={`/orders/${r.order_id}`}>
                    Open order
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className='muted'>
                  No deliveries recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
