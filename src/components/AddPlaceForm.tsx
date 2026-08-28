import { useState, type FormEvent } from 'react';
import type { Place, PlaceType } from '../types';
import { matchesQuery } from '../lib/matchesQuery';

interface Props {
  editing: Place | null;
  onSaved: (place: Place) => void;
  onDeleted: (place: Place) => void;
  neighborhoods: string[];
}

const TYPES: { key: PlaceType; label: string }[] = [
  { key: 'restaurant', label: 'Restaurant' },
  { key: 'bar', label: 'Bar' },
  { key: 'snacks', label: 'Snacks & Dessert' },
];

export default function AddPlaceForm({ editing, onSaved, onDeleted, neighborhoods }: Props) {
  const [name, setName] = useState(editing?.name ?? '');
  const [types, setTypes] = useState<PlaceType[]>(() => {
    if (!editing) return [];
    const t: PlaceType[] = [];
    if (editing.isRestaurant) t.push('restaurant');
    if (editing.isBar) t.push('bar');
    if (editing.isSnacksDessert) t.push('snacks');
    return t;
  });
  const [neighborhood, setNeighborhood] = useState(editing?.neighborhood ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [hasBeenTo, setHasBeenTo] = useState(editing?.hasBeenTo ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [neighborhoodFocused, setNeighborhoodFocused] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Suggest existing neighborhoods so a typo or slightly different phrasing
  // doesn't silently create a duplicate that fragments the filter list.
  const neighborhoodQuery = neighborhood.trim();
  const neighborhoodSuggestions = neighborhoodQuery
    ? neighborhoods.filter(n => n !== neighborhoodQuery && matchesQuery(n, neighborhoodQuery)).slice(0, 6)
    : [];

  function toggleType(t: PlaceType) {
    setTypes(cur => (cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || types.length === 0) {
      setError('Name and at least one type are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/add-place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id,
          originalName: editing?.name,
          originalNeighborhood: editing?.neighborhood,
          name: name.trim(),
          isRestaurant: types.includes('restaurant'),
          isBar: types.includes('bar'),
          isSnacksDessert: types.includes('snacks'),
          neighborhood: neighborhood.trim(),
          notes: notes.trim(),
          hasBeenTo,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to save place');
      }
      const place: Place = await res.json();
      onSaved(place);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    setDeleting(true);
    setError('');
    try {
      const res = await fetch('/api/delete-place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editing.name, neighborhood: editing.neighborhood }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to delete place');
      }
      onDeleted(editing);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <form className="add-place-form" onSubmit={handleSubmit}>
      <input
        className="filter-search"
        placeholder="Place name"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />
      <div className="filter-toggle-group">
        {TYPES.map(({ key, label }) => (
          <button
            type="button"
            key={key}
            className={`filter-toggle filter-toggle--${key}${types.includes(key) ? ' filter-toggle--active' : ''}`}
            onClick={() => toggleType(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="add-place-form__field">
        <input
          className="filter-search"
          placeholder="Neighborhood"
          value={neighborhood}
          onChange={e => setNeighborhood(e.target.value)}
          onFocus={() => setNeighborhoodFocused(true)}
          onBlur={() => setTimeout(() => setNeighborhoodFocused(false), 150)}
          autoComplete="off"
        />
        {neighborhoodFocused && neighborhoodSuggestions.length > 0 && (
          <div className="token-field__suggestions">
            {neighborhoodSuggestions.map(n => (
              // onMouseDown (not onClick) fires before the input's onBlur closes this list
              <button
                key={n}
                type="button"
                className="token-field__suggestion"
                onMouseDown={() => {
                  setNeighborhood(n);
                  setNeighborhoodFocused(false);
                }}
              >
                <span className="token-field__suggestion-label">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <textarea
        className="add-place-form__notes"
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
      />
      <label className="filter-switch-row">
        <span>I've been here</span>
        <span className="filter-switch">
          <input type="checkbox" checked={hasBeenTo} onChange={e => setHasBeenTo(e.target.checked)} />
          <span className="filter-switch__track" />
        </span>
      </label>

      {error && <div className="add-place-form__error">{error}</div>}

      <button className="add-place-form__submit" type="submit" disabled={loading}>
        {loading ? 'Saving…' : editing ? 'Save changes' : 'Add place'}
      </button>
      <p className="add-place-form__hint">
        {editing
          ? "Updates the Google Sheet and your map now. Everyone else sees it after the next sync."
          : 'Saves to the Google Sheet and shows on your map now. Everyone else sees it after the next sync.'}
      </p>

      {editing && (
        confirmingDelete ? (
          <div className="add-place-form__delete-confirm">
            <span>Delete "{editing.name}"? This removes it from the sheet.</span>
            <div className="add-place-form__delete-confirm-actions">
              <button type="button" className="add-place-form__cancel" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="add-place-form__delete" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="add-place-form__delete-trigger" onClick={() => setConfirmingDelete(true)}>
            Delete place
          </button>
        )
      )}
    </form>
  );
}
