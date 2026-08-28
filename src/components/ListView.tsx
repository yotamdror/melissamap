import type { Place } from '../types';
import { shortCuisineLabel } from '../lib/cuisineLabel';

interface Props {
  places: Place[];
  isAdmin: boolean;
  onAddRequest: () => void;
  onEditRequest: (place: Place) => void;
}

// Mirrors MapView's InfoWindow content exactly - same facts, same rating +
// reviews link, same hours line - so switching views doesn't lose information.
function PlaceRow({ place, isAdmin, onEdit }: { place: Place; isAdmin: boolean; onEdit: (p: Place) => void }) {
  const facts = [
    place.cuisine ? shortCuisineLabel(place.cuisine) : null,
    place.priceLevel ? '$'.repeat(place.priceLevel) : null,
    place.googleRating != null ? `★ ${place.googleRating.toFixed(1)}` : null,
  ].filter(Boolean).join('  ·  ');

  const todayHours = place.weekdayHours && place.weekdayHours.length > 0
    ? place.weekdayHours[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
    : null;

  return (
    <div className="list-row">
      <div className="list-row__top">
        <span className="list-row__name">{place.name}</span>
        <div className="list-row__top-right">
          {place.hasBeenTo && <span className="info-window__badge">Visited</span>}
          {isAdmin && (
            <button className="list-row__edit" onClick={() => onEdit(place)} aria-label={`Edit ${place.name}`}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2.5l2 2L5 13l-2.5.5.5-2.5 8.5-8.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {(place.googleRating != null || facts) && (
        <div className="list-row__facts">
          {facts}
          {place.placeId && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.placeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="info-window__rating-link list-row__reviews-link"
            >
              Google reviews
            </a>
          )}
        </div>
      )}

      {place.neighborhood && <div className="list-row__neighborhood">{place.neighborhood}</div>}

      {todayHours ? (
        <div className="list-row__hours">{todayHours}</div>
      ) : (
        <div className="list-row__hours info-window__hours--unknown">Hours unknown</div>
      )}

      {place.notes && <div className="list-row__notes">{place.notes}</div>}
    </div>
  );
}

export default function ListView({ places, isAdmin, onAddRequest, onEditRequest }: Props) {
  return (
    <div className="list-view">
      <div className="list-view__scroll">
        {isAdmin && (
          <button className="list-view__add-btn" onClick={onAddRequest}>
            + Add a place
          </button>
        )}

        {places.map(p => (
          <PlaceRow key={p.id} place={p} isAdmin={isAdmin} onEdit={onEditRequest} />
        ))}
      </div>
    </div>
  );
}
