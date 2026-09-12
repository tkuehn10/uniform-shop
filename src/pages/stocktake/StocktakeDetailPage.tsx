import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { StocktakeScope } from '../../lib/database.types';

// REQ-18 (screens-and-flows.md 2.13): review a completed stocktake -- date,
// scope, and each line's expected/counted/calculated-sold figures.

interface CountLine {
  item_name: string;
  size_label: string;
  expected_quantity: number;
  counted_quantity: number;
  calculated_sold: number;
}

export function StocktakeDetailPage() {
  const { id } = useParams();
  const [date, setDate] = useState('');
  const [scope, setScope] = useState<StocktakeScope | null>(null);
  const [lines, setLines] = useState<CountLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const stocktakeId = id;
    async function load() {
      setLoading(true);
      const { data: stocktake, error } = await supabase
        .from('stocktakes')
        .select('stocktake_date, scope')
        .eq('id', stocktakeId)
        .single();
      if (error || !stocktake) {
        setError(error?.message ?? 'Stocktake not found.');
        setLoading(false);
        return;
      }
      setDate(stocktake.stocktake_date);
      setScope(stocktake.scope);

      const { data: counts } = await supabase
        .from('stocktake_counts')
        .select(
          'expected_quantity, counted_quantity, calculated_sold, item_sizes(size_label, items(name))'
        )
        .eq('stocktake_id', stocktakeId)
        .returns<
          {
            expected_quantity: number;
            counted_quantity: number;
            calculated_sold: number;
            item_sizes: { size_label: string; items: { name: string } | null } | null;
          }[]
        >();

      setLines(
        (counts ?? []).map(c => ({
          item_name: c.item_sizes?.items?.name ?? '(unknown item)',
          size_label: c.item_sizes?.size_label ?? '?',
          expected_quantity: c.expected_quantity,
          counted_quantity: c.counted_quantity,
          calculated_sold: c.calculated_sold
        }))
      );
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <div className='page'>Loading…</div>;
  if (error) return <div className='page error'>{error}</div>;

  return (
    <div className='page'>
      <h1>Stocktake — {date}</h1>
      <p className='muted' style={{ textTransform: 'capitalize' }}>
        {scope} stocktake
      </p>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Size</th>
            <th>Expected</th>
            <th>Counted</th>
            <th>Sold/adjusted</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.item_name}</td>
              <td>{l.size_label}</td>
              <td>{l.expected_quantity}</td>
              <td>{l.counted_quantity}</td>
              <td>{l.calculated_sold}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        <Link to='/stocktake'>&larr; Back to stocktakes</Link>
      </p>
    </div>
  );
}
