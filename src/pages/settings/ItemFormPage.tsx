import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { compressImageFile, hexToDataUrl } from '../../lib/photo';
import type { ItemSize } from '../../lib/database.types';

// REQ-1, REQ-2, REQ-35, REQ-36, REQ-37 (screens-and-flows.md 2.3): create/edit
// an item's details, manage its sizes, adjust stock with a required note, and
// archive/restore the item or an individual size.

export function ItemFormPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [active, setActive] = useState(true);
  const [sizes, setSizes] = useState<ItemSize[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newSizeLabel, setNewSizeLabel] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);

  const [adjustingSizeId, setAdjustingSizeId] = useState<string | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);

  async function loadSizes(itemId: string) {
    const { data } = await supabase
      .from('item_sizes')
      .select('*')
      .eq('item_id', itemId)
      .order('sort_order', { ascending: true })
      .returns<ItemSize[]>();
    setSizes(data ?? []);
  }

  useEffect(() => {
    if (!id) return;
    const itemId = id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.from('items').select('*').eq('id', itemId).single();
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setName(data.name);
      setCategory(data.category ?? '');
      setPrice(data.price != null ? String(data.price) : '');
      setActive(data.active);

      const { data: photo } = await supabase
        .from('item_photos')
        .select('*')
        .eq('item_id', itemId)
        .maybeSingle();
      if (!cancelled && photo) {
        setPhotoUrl(hexToDataUrl(photo.image_data, photo.content_type));
      }

      await loadSizes(itemId);
      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      name: name.trim(),
      category: category.trim() || null,
      price: price.trim() ? Number(price) : null
    };

    if (isNew) {
      const { data, error } = await supabase.from('items').insert(payload).select().single();
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      navigate(`/settings/items/${data.id}`, { replace: true });
      return;
    }

    const { error } = await supabase.from('items').update(payload).eq('id', id);
    setSaving(false);
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Saved.');
    }
  }

  async function handleToggleActive() {
    if (!id) return;
    const { error } = await supabase.from('items').update({ active: !active }).eq('id', id);
    if (error) {
      setError(error.message);
    } else {
      setActive(!active);
    }
  }

  async function handleAddSize(e: FormEvent) {
    e.preventDefault();
    if (!id || !newSizeLabel.trim()) return;
    const sortOrder = sizes.length;
    const { error } = await supabase
      .from('item_sizes')
      .insert({ item_id: id, size_label: newSizeLabel.trim(), sort_order: sortOrder });
    if (error) {
      setError(error.message);
    } else {
      setNewSizeLabel('');
      await loadSizes(id);
    }
  }

  async function handleToggleSizeActive(size: ItemSize) {
    const { error } = await supabase
      .from('item_sizes')
      .update({ active: !size.active })
      .eq('id', size.id);
    if (error) {
      setError(error.message);
    } else if (id) {
      await loadSizes(id);
    }
  }

  async function handlePhotoChange(file: File) {
    if (!id) return;
    setPhotoBusy(true);
    setError(null);
    try {
      const compressed = await compressImageFile(file);
      const { error } = await supabase.from('item_photos').upsert({
        item_id: id,
        image_data: compressed.bytesHex,
        content_type: compressed.contentType,
        byte_size: compressed.byteSize
      });
      if (error) {
        setError(error.message);
      } else {
        setPhotoUrl(hexToDataUrl(compressed.bytesHex, compressed.contentType));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process photo.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleRemovePhoto() {
    if (!id) return;
    setPhotoBusy(true);
    const { error } = await supabase.from('item_photos').delete().eq('item_id', id);
    setPhotoBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setPhotoUrl(null);
    }
  }

  async function handleAdjustStock(e: FormEvent, size: ItemSize) {
    e.preventDefault();
    const delta = Number(adjustDelta);
    if (!delta || !adjustNote.trim()) {
      setError('Enter a non-zero quantity and a note.');
      return;
    }
    setAdjustBusy(true);
    setError(null);
    const { error } = await supabase.from('stock_movements').insert({
      item_size_id: size.id,
      quantity_delta: delta,
      reason: 'manual_adjustment',
      note: adjustNote.trim(),
      created_by: profile?.id ?? null
    });
    setAdjustBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setAdjustingSizeId(null);
      setAdjustDelta('');
      setAdjustNote('');
      if (id) await loadSizes(id);
    }
  }

  if (loading) return <div className='page'>Loading…</div>;

  return (
    <div className='page'>
      <div className='page-header'>
        <h1>{isNew ? 'New item' : name}</h1>
        {!isNew && (
          <button className='secondary' onClick={handleToggleActive} type='button'>
            {active ? 'Archive item' : 'Restore item'}
          </button>
        )}
      </div>
      {!isNew && !active && <p className='badge archived'>Archived</p>}

      <form className='form-card' onSubmit={handleSave}>
        <label className='field'>
          Name
          <input value={name} onChange={e => setName(e.target.value)} required />
        </label>
        <div className='field-row'>
          <label className='field'>
            Category
            <input value={category} onChange={e => setCategory(e.target.value)} />
          </label>
          <label className='field'>
            Price (reference only)
            <input
              type='number'
              step='0.01'
              min='0'
              value={price}
              onChange={e => setPrice(e.target.value)}
            />
          </label>
        </div>
        {error && <p className='error'>{error}</p>}
        {success && <p className='success'>{success}</p>}
        <button type='submit' disabled={saving}>
          {saving ? 'Saving…' : isNew ? 'Create item' : 'Save changes'}
        </button>
      </form>

      {!isNew && (
        <>
          <div className='form-card'>
            <h2>Photo</h2>
            {photoUrl ? (
              <img src={photoUrl} alt={name} className='item-photo' />
            ) : (
              <div className='item-photo placeholder'>No photo</div>
            )}
            <div className='field-row' style={{ marginTop: '0.75rem' }}>
              <input
                type='file'
                accept='image/*'
                disabled={photoBusy}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoChange(file);
                  e.target.value = '';
                }}
              />
              {photoUrl && (
                <button
                  type='button'
                  className='secondary'
                  disabled={photoBusy}
                  onClick={handleRemovePhoto}>
                  Remove photo
                </button>
              )}
            </div>
          </div>

          <div className='form-card'>
            <h2>Sizes</h2>
            <table>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>On hand</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sizes.map(s => (
                  <Fragment key={s.id}>
                    <tr>
                      <td>{s.size_label}</td>
                      <td>{s.quantity_on_hand}</td>
                      <td>{!s.active && <span className='badge archived'>Archived</span>}</td>
                      <td className='list-actions'>
                        <button
                          type='button'
                          className='button small'
                          onClick={() =>
                            setAdjustingSizeId(adjustingSizeId === s.id ? null : s.id)
                          }>
                          Adjust stock
                        </button>
                        <button
                          type='button'
                          className='secondary small'
                          onClick={() => handleToggleSizeActive(s)}>
                          {s.active ? 'Archive' : 'Restore'}
                        </button>
                      </td>
                    </tr>
                    {adjustingSizeId === s.id && (
                      <tr key={`${s.id}-adjust`}>
                        <td colSpan={4}>
                          <form
                            className='field-row'
                            style={{ alignItems: 'flex-end' }}
                            onSubmit={e => handleAdjustStock(e, s)}>
                            <label className='field'>
                              Quantity change (+/-)
                              <input
                                type='number'
                                value={adjustDelta}
                                onChange={e => setAdjustDelta(e.target.value)}
                                required
                              />
                            </label>
                            <label className='field' style={{ flex: 2 }}>
                              Note (required)
                              <input
                                value={adjustNote}
                                onChange={e => setAdjustNote(e.target.value)}
                                required
                              />
                            </label>
                            <button type='submit' disabled={adjustBusy}>
                              {adjustBusy ? 'Saving…' : 'Apply'}
                            </button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {sizes.length === 0 && (
                  <tr>
                    <td colSpan={4} className='muted'>
                      No sizes yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <form className='field-row' style={{ marginTop: '1rem' }} onSubmit={handleAddSize}>
              <label className='field'>
                New size label
                <input value={newSizeLabel} onChange={e => setNewSizeLabel(e.target.value)} />
              </label>
              <button type='submit'>Add size</button>
            </form>
          </div>
        </>
      )}

      <p>
        <Link to='/settings/items'>&larr; Back to items</Link>
      </p>
    </div>
  );
}
