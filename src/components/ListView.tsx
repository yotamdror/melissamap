import { useState } from 'react';
import type { Place } from '../types';
import { shortCuisineLabel } from '../lib/cuisineLabel';
import AddPlaceForm from './AddPlaceForm';

interface Props {
  places: Place[];
  onMenuClick: () => void;
  isAdmin: boolean;
  onPlaceAdded: (place: Place) => void;
}

function PlaceRow({ place }: { place: Place }) {
  const facts = [
    place.cuisine ? shortCuisineLabel(place.cuisine) : null,
    place.priceLevel ? '$'.repeat(place.priceLevel) : null,
    place.googleRating != null ? `★ ${place.googleRating.toFixed(1)}` : null,
  ].filter(Boolean).join('  ·  ');

  return (
    <div className="list-row">
      <div className="list-row__top">
        <span className="list-row__name">{place.name}</span>
        {place.hasBeenTo && <span className="info-window__badge">Visited</span>}
      </div>
      {facts && <div className="list-row__facts">{facts}</div>}
      {place.neighborhood && <div className="list-row__neighborhood">{place.neighborhood}</div>}
      {place.notes && <div className="list-row__notes">{place.notes}</div>}
    </div>
  );
}

export default function ListView({ places, onMenuClick, isAdmin, onPlaceAdded }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="list-view">
      <button className="map-filter-trigger" onClick={onMenuClick} aria-label="Open filters">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Filters
      </button>

      <div className="list-view__scroll">
        {isAdmin && (
          <div className="list-view__admin">
            <button className="list-view__add-btn" onClick={() => setShowAddForm(s => !s)}>
              {showAddForm ? 'Cancel' : '+ Add a place'}
            </button>
            {showAddForm && (
              <AddPlaceForm
                onAdded={place => {
                  onPlaceAdded(place);
                  setShowAddForm(false);
                }}
              />
            )}
          </div>
        )}

        <div className="list-view__count">{places.length} places</div>

        {places.map(p => <PlaceRow key={p.id} place={p} />)}
      </div>
    </div>
  );
}
