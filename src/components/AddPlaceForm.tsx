import { useState, type FormEvent } from 'react';
import type { Place, PlaceType } from '../types';

interface Props {
  onAdded: (place: Place) => void;
}

const TYPES: { key: PlaceType; label: string }[] = [
  { key: 'restaurant', label: 'Restaurant' },
  { key: 'bar', label: 'Bar' },
  { key: 'snacks', label: 'Snacks & Dessert' },
];

export default function AddPlaceForm({ onAdded }: Props) {
  const [name, setName] = useState('');
  const [types, setTypes] = useState<PlaceType[]>([]);
  const [neighborhood, setNeighborhood] = useState('');
  const [notes, setNotes] = useState('');
  const [hasBeenTo, setHasBeenTo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        throw new Error(body.error ?? 'Failed to add place');
      }
      const place: Place = await res.json();
      onAdded(place);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
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
      <input
        className="filter-search"
        placeholder="Neighborhood"
        value={neighborhood}
        onChange={e => setNeighborhood(e.target.value)}
      />
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
        {loading ? 'Adding…' : 'Add place'}
      </button>
      <p className="add-place-form__hint">
        Saves to the Google Sheet and shows on your map now. Everyone else sees it after the next sync.
      </p>
    </form>
  );
}
