import { useState, useEffect, useMemo } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  Marker,
  InfoWindow,
  useMap,
  useMarkerRef,
} from '@vis.gl/react-google-maps';
import type { Place } from '../types';

const NYC_CENTER = { lat: 40.7549, lng: -73.984 };

type PlaceType = 'restaurant' | 'bar' | 'snack';

const PIN_COLORS: Record<PlaceType, string> = {
  restaurant: '#FF6B6B',
  bar: '#4ECDC4',
  snack: '#FFD93D',
};

// A place you haven't been to yet is shown at reduced opacity rather than a
// muddier color, so it stays legible even where many pins overlap.
const WANT_TO_GO_OPACITY = 0.75;

interface Props {
  places: Place[];
  onMenuClick: () => void;
}

interface MarkerWithInfoProps {
  place: Place;
  selected: boolean;
  onSelect: (p: Place | null) => void;
}

function placeType(p: Place): PlaceType {
  if (p.isBar) return 'bar';
  if (p.isSnacksDessert) return 'snack';
  return 'restaurant';
}

// One SVG data URL per pin type, built once and reused for every marker of
// that type - this is what keeps thousands of markers cheap to render as
// plain google.maps.Marker icons instead of per-marker React DOM nodes.
const pinIconCache = new Map<PlaceType, string>();
function pinIconUrl(type: PlaceType): string {
  const cached = pinIconCache.get(type);
  if (cached) return cached;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 22 28">
    <path d="M11 0C4.9 0 0 4.9 0 11c0 8.25 11 17 11 17s11-8.75 11-17c0-6.1-4.9-11-11-11z"
      fill="${PIN_COLORS[type]}" stroke="rgba(0,0,0,0.25)" stroke-width="1.5"/>
  </svg>`;
  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  pinIconCache.set(type, url);
  return url;
}

function MarkerWithInfo({ place, selected, onSelect }: MarkerWithInfoProps) {
  const [markerRef, marker] = useMarkerRef();
  const type = placeType(place);

  return (
    <>
      <Marker
        ref={markerRef}
        position={{ lat: place.lat!, lng: place.lng! }}
        icon={{
          url: pinIconUrl(type),
          scaledSize: new google.maps.Size(22, 28),
          anchor: new google.maps.Point(11, 28),
        }}
        opacity={place.hasBeenTo ? 1 : WANT_TO_GO_OPACITY}
        title={place.name}
        onClick={() => onSelect(selected ? null : place)}
      />

      {selected && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => onSelect(null)}>
          <div className="info-window">
            <div className="info-window__name">{place.name}</div>

            <div className="info-window__facts">
              {[
                place.cuisine,
                place.priceLevel ? '$'.repeat(place.priceLevel) : null,
                place.googleRating != null
                  ? `★ ${place.googleRating.toFixed(1)}${place.googleRatingCount != null ? ` (${place.googleRatingCount.toLocaleString()})` : ''}`
                  : null,
              ].filter(Boolean).join('  ·  ')}
            </div>

            {(place.neighborhood || place.hasBeenTo) && (
              <div className="info-window__row">
                <span className="info-window__neighborhood">{place.neighborhood}</span>
                {place.hasBeenTo && <span className="info-window__badge">Visited</span>}
              </div>
            )}

            <div className="info-window__row">
              {place.weekdayHours && place.weekdayHours.length > 0 ? (
                <span className="info-window__hours">
                  {place.weekdayHours[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]}
                </span>
              ) : (
                <span className="info-window__hours info-window__hours--unknown">Hours unknown</span>
              )}
              {place.placeId && (
                <a
                  // Documented Google Maps URL scheme for linking to a specific
                  // place by ID - the informal "?q=place_id:X" form gets mangled
                  // (treated as literal search text) when the native Maps app
                  // intercepts the link on mobile.
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.placeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="info-window__rating-link"
                >
                  Google reviews
                </a>
              )}
            </div>

            {place.notes && (
              <div className="info-window__notes">{place.notes}</div>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function useInitialCenter() {
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setCenter(NYC_CENTER);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCenter(NYC_CENTER), // denied, unavailable, or timed out
      { timeout: 5000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  return center;
}

function padBounds(b: google.maps.LatLngBounds, factor = 0.3): google.maps.LatLngBounds {
  const ne = b.getNorthEast();
  const sw = b.getSouthWest();
  const latPad = (ne.lat() - sw.lat()) * factor;
  const lngPad = (ne.lng() - sw.lng()) * factor;
  return new google.maps.LatLngBounds(
    { lat: sw.lat() - latPad, lng: sw.lng() - lngPad },
    { lat: ne.lat() + latPad, lng: ne.lng() + lngPad },
  );
}

// Only markers within the current (padded) viewport get rendered - with a
// couple thousand places, rendering every one regardless of pan/zoom is what
// causes the map to stutter.
function useVisiblePlaces(places: Place[]): Place[] {
  const map = useMap();
  const [bounds, setBounds] = useState<google.maps.LatLngBounds | null>(null);

  useEffect(() => {
    if (!map) return;
    const update = () => {
      const b = map.getBounds();
      setBounds(b ? padBounds(b) : null);
    };
    update();
    const listener = map.addListener('idle', update);
    return () => listener.remove();
  }, [map]);

  return useMemo(() => {
    if (!bounds) return places;
    return places.filter(p => bounds.contains({ lat: p.lat!, lng: p.lng! }));
  }, [places, bounds]);
}

function Markers({ places }: { places: Place[] }) {
  const [selected, setSelected] = useState<Place | null>(null);
  const visible = useVisiblePlaces(places);

  return (
    <>
      {visible.map(p => (
        <MarkerWithInfo
          key={p.id}
          place={p}
          selected={selected?.id === p.id}
          onSelect={setSelected}
        />
      ))}
    </>
  );
}

export default function MapView({ places, onMenuClick }: Props) {
  const center = useInitialCenter();

  if (!center) return null; // resolving geolocation (capped at 5s by the timeout above)

  return (
    <div className="map-container">
      <button className="map-menu-btn" onClick={onMenuClick} aria-label="Open filters">
        <span /><span /><span />
      </button>

      <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
        <GoogleMap
          defaultCenter={center}
          defaultZoom={14}
          mapId={import.meta.env.VITE_GOOGLE_MAPS_MAP_ID}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
          style={{ width: '100%', height: '100%' }}
        >
          <Markers places={places} />
        </GoogleMap>
      </APIProvider>
    </div>
  );
}
