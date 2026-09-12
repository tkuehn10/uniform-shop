import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// REQ-14: both Admin and User can view current on-hand stock, broken down
// by item and size. This is the first "real" screen — a working end-to-end
// slice through the stack (auth -> RLS -> Postgres -> UI) that the rest of
// Phase 3 (screens-and-flows.md) builds on.

interface StockRow {
  item_size_id: string
  item_name: string
  category: string | null
  size_label: string
  quantity_on_hand: number
}

export function StockPage() {
  const [rows, setRows] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false

    interface JoinedRow {
      id: string
      size_label: string
      quantity_on_hand: number
      items: { name: string; category: string | null } | null
    }

    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('item_sizes')
        .select('id, size_label, quantity_on_hand, items!inner(name, category, active)')
        .eq('active', true)
        .eq('items.active', true)
        .order('sort_order', { ascending: true })
        // Our hand-written Database type (src/lib/database.types.ts) doesn't carry
        // full relationship metadata, so the join's inferred type collapses to
        // `never` — .returns() overrides it. Safe to drop once real generated
        // types are in (see the note at the top of that file).
        .returns<JoinedRow[]>()

      if (cancelled) return
      if (error) {
        setError(error.message)
      } else {
        const mapped: StockRow[] = (data ?? []).map((r) => ({
          item_size_id: r.id,
          item_name: r.items?.name ?? '(unknown item)',
          category: r.items?.category ?? null,
          size_label: r.size_label,
          quantity_on_hand: r.quantity_on_hand,
        }))
        setRows(mapped)
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = rows.filter((r) =>
    `${r.item_name} ${r.category ?? ''} ${r.size_label}`.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="page">
      <h1>Stock</h1>
      <input
        className="search"
        placeholder="Search items…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {loading && <p>Loading…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Size</th>
              <th>On hand</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.item_size_id}>
                <td>{r.item_name}</td>
                <td>{r.category ?? '—'}</td>
                <td>{r.size_label}</td>
                <td>{r.quantity_on_hand}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No items match "{search}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
