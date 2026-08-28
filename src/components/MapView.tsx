import { useState, useEffect } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import type { Place } from '../types';

const NYC_CENTER = { lat: 40.7549, lng: -73.984 };

interface Props {
  places: Place[];
  onMenuClick: () => void;
}

interface MarkerWithInfoProps {
  place: Place;
  selected: boolean;
  onSelect: (p: Place | null) => void;
}

function placeType(p: Place): 'restaurant' | 'bar' | 'snack' {
  if (p.isBar) return 'bar';
  if (p.isSnacksDessert) return 'snack';
  return 'restaurant';
}

function PriceLabel({ level }: { level?: number }) {
  if (!level) return null;
  return <span>{'$'.repeat(level)}</span>;
}

function MarkerWithInfo({ place, selected, onSelect }: MarkerWithInfoProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const type = placeType(place);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: place.lat!, lng: place.lng! }}
        onClick={() => onSelect(selected ? null : place)}
      >
        <div
          className={`marker-pin marker-pin--${type}${!place.hasBeenTo ? ' marker-pin--want' : ''}`}
          title={place.name}
        />
      </AdvancedMarker>

      {selected && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => onSelect(null)}>
          <div className="info-window">
            <div className="info-window__name">{place.name}</div>
            <div className="info-window__meta">
              {place.cuisine && (
                <span className="info-window__badge">{place.cuisine}</span>
              )}
              <PriceLabel level={place.priceLevel} />
              {place.hasBeenTo && <span className="info-window__badge">Been here</span>}
              {place.neighborhood && <span>{place.neighborhood}</span>}
            </div>
            {place.notes && (
              <div className="info-window__notes">{place.notes}</div>
            )}
            {place.weekdayHours && place.weekdayHours.length > 0 ? (
              <div className="info-window__hours">
                {place.weekdayHours[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]}
              </div>
            ) : (
              <div className="info-window__hours info-window__hours--unknown">
                Hours unknown
              </div>
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

export default function MapView({ places, onMenuClick }: Props) {
  const [selected, setSelected] = useState<Place | null>(null);
  const center = useInitialCenter();

  if (!center) return null; // resolving geolocation (capped at 5s by the timeout above)

  return (
    <div className="map-container">
      <button className="map-menu-btn" onClick={onMenuClick} aria-label="Open filters">
        <span /><span /><span />
      </button>

      <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
        <Map
          defaultCenter={center}
          defaultZoom={13}
          mapId={import.meta.env.VITE_GOOGLE_MAPS_MAP_ID}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
          style={{ width: '100%', height: '100%' }}
        >
          {places.map(p => (
            <MarkerWithInfo
              key={p.id}
              place={p}
              selected={selected?.id === p.id}
              onSelect={setSelected}
            />
          ))}
        </Map>
      </APIProvider>
    </div>
  );
}
