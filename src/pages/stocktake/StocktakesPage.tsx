import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { StocktakeScope } from '../../lib/database.types';

// REQ-18 (screens-and-flows.md 2.11): list past stocktakes with date and
// scope; entry point to start a new one or view a past one's results.

interface StocktakeRow {
  id: string;
  stocktake_date: string;
  scope: StocktakeScope;
  line_count: number;
}

export function StocktakesPage() {
  const [rows, setRows] = useState<StocktakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('stocktakes')
        .select('id, stocktake_date, scope, stocktake_counts(id)')
        .order('stocktake_date', { ascending: false })
        .returns<
          {
            id: string;
            stocktake_date: string;
            scope: StocktakeScope;
            stocktake_counts: { id: string }[];
          }[]
        >();
      if (error) {
        setError(error.message);
      } else {
        setRows(
          (data ?? []).map(s => ({
            id: s.id,
            stocktake_date: s.stocktake_date,
            scope: s.scope,
            line_count: s.stocktake_counts.length
          }))
        );
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className='page'>
      <div className='page-header'>
        <h1>Stocktakes</h1>
        <Link className='button' to='/stocktake/new'>
          + Start stocktake
        </Link>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className='error'>{error}</p>}
      {!loading && !error && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Scope</th>
              <th>Lines counted</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id}>
                <td>{s.stocktake_date}</td>
                <td style={{ textTransform: 'capitalize' }}>{s.scope}</td>
                <td>{s.line_count}</td>
                <td>
                  <Link className='button small' to={`/stocktake/${s.id}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className='muted'>
                  No stocktakes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
