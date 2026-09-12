import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { ORDER_STATUS_LABELS } from '../../lib/orderStatus';
import type { OrderStatus } from '../../lib/database.types';

// REQ-5 (screens-and-flows.md 2.6): list all supplier orders with order
// number, supplier, date, and status; filter/search; entry point to create a
// new order or open an existing one.

interface OrderRow {
  id: string;
  order_number: string;
  order_date: string;
  status: OrderStatus;
  supplier_name: string;
}

interface JoinedRow {
  id: string;
  order_number: string;
  order_date: string;
  status: OrderStatus;
  suppliers: { name: string } | null;
}

export function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, order_date, status, suppliers(name)')
        .order('order_date', { ascending: false })
        .returns<JoinedRow[]>();
      if (error) {
        setError(error.message);
      } else {
        setOrders(
          (data ?? []).map(o => ({
            id: o.id,
            order_number: o.order_number,
            order_date: o.order_date,
            status: o.status,
            supplier_name: o.suppliers?.name ?? '(unknown supplier)'
          }))
        );
      }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = orders
    .filter(o => statusFilter === 'all' || o.status === statusFilter)
    .filter(o =>
      `${o.order_number} ${o.supplier_name}`.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div className='page'>
      <div className='page-header'>
        <h1>Supplier orders</h1>
        <div className='toolbar'>
          <Link className='button' to='/orders/deliveries'>
            Delivery history
          </Link>
          <Link className='button' to='/orders/new'>
            + New order
          </Link>
        </div>
      </div>

      <div className='toolbar'>
        <input
          className='search'
          placeholder='Search order # or supplier…'
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as OrderStatus | 'all')}>
          <option value='all'>All statuses</option>
          {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className='error'>{error}</p>}
      {!loading && !error && (
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Supplier</th>
              <th>Date</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map(o => (
              <tr key={o.id}>
                <td>{o.order_number}</td>
                <td>{o.supplier_name}</td>
                <td>{o.order_date}</td>
                <td>
                  <span className={`badge status-${o.status}`}>
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                </td>
                <td>
                  <Link className='button small' to={`/orders/${o.id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className='muted'>
                  No orders match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
