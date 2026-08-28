import { useState, useEffect } from 'react';
import PasswordGate from './components/PasswordGate';
import MapView from './components/MapView';
import ListView from './components/ListView';
import FilterSidebar from './components/FilterSidebar';
import LastUpdated from './components/LastUpdated';
import PlaceFormModal from './components/PlaceFormModal';
import type { PlacesData, Filters, Place } from './types';
import { isOpenNow } from './lib/openNow';

const DEFAULT_FILTERS: Filters = {
  types: ['restaurant', 'bar', 'snacks'],
  visited: 'all',
  priceLevel: [1, 2, 3, 4],
  openNow: false,
  includeUnknownHours: true,
  cuisine: [],
  neighborhood: [],
  hasNotes: false,
  search: '',
};

function applyFilters(places: Place[], filters: Filters): Place[] {
  return places.filter(p => {
    const typeMatch =
      (filters.types.includes('restaurant') && p.isRestaurant) ||
      (filters.types.includes('bar') && p.isBar) ||
      (filters.types.includes('snacks') && p.isSnacksDessert);
    if (!typeMatch) return false;

    if (filters.visited === 'been' && !p.hasBeenTo) return false;
    if (filters.visited === 'want' && p.hasBeenTo) return false;

    if (p.priceLevel && !filters.priceLevel.includes(p.priceLevel)) return false;

    if (filters.openNow) {
      if (p.openPeriods) {
        if (!isOpenNow(p.openPeriods)) return false;
      } else if (!filters.includeUnknownHours) {
        return false;
      }
    }

    if (filters.cuisine.length && !filters.cuisine.includes(p.cuisine ?? '')) return false;

    if (filters.neighborhood.length && !filters.neighborhood.includes(p.neighborhood)) return false;

    if (filters.hasNotes && !p.notes) return false;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      const tags = (p.cuisineTags ?? []).join(' ');
      const haystack = `${p.name} ${p.notes} ${p.neighborhood} ${p.cuisine ?? ''} ${tags}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

export default function App() {
  const [role, setRole] = useState<'admin' | 'viewer' | null | undefined>(undefined);
  const [data, setData] = useState<PlacesData | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [view, setView] = useState<'map' | 'list'>('map');
  // null = closed, 'new' = add form, a Place = editing that place
  const [formTarget, setFormTarget] = useState<Place | 'new' | null>(null);

  useEffect(() => {
    fetch('/api/verify')
      .then(async r => setRole(r.ok ? ((await r.json()).role ?? null) : null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (role) {
      fetch('/api/places')
        .then(r => r.json())
        .then(setData);
    }
  }, [role]);

  function upsertPlace(place: Place) {
    setData(d => {
      if (!d) return d;
      const exists = d.places.some(p => p.id === place.id);
      return {
        ...d,
        places: exists ? d.places.map(p => (p.id === place.id ? place : p)) : [...d.places, place],
      };
    });
    setFormTarget(null);
  }

  if (role === undefined) return null;
  if (!role) return <PasswordGate onSuccess={setRole} />;
  if (!data) return null;

  const isAdmin = role === 'admin';
  const mappablePlaces = data.places.filter(p => p.lat != null && p.lng != null);
  const filtered = applyFilters(mappablePlaces, filters);
  const cuisines = [...new Set(data.places.map(p => p.cuisine).filter(Boolean))].sort() as string[];
  const neighborhoods = [...new Set(data.places.map(p => p.neighborhood).filter(Boolean))].sort();

  // Color each cuisine chip by whichever type (restaurant/bar/snack) most of its
  // places actually are, so cuisine chips reinforce the existing type colors
  // instead of introducing an unrelated 4th color.
  const cuisineType: Record<string, 'restaurant' | 'bar' | 'snacks'> = {};
  for (const c of cuisines) {
    const counts = { restaurant: 0, bar: 0, snacks: 0 };
    for (const p of data.places) {
      if (p.cuisine !== c) continue;
      if (p.isBar) counts.bar++;
      else if (p.isSnacksDessert) counts.snacks++;
      else counts.restaurant++;
    }
    cuisineType[c] = counts.bar >= counts.restaurant && counts.bar >= counts.snacks
      ? 'bar'
      : counts.snacks >= counts.restaurant
        ? 'snacks'
        : 'restaurant';
  }

  return (
    <div className="app">
      <FilterSidebar
        filters={filters}
        onChange={setFilters}
        cuisines={cuisines}
        cuisineType={cuisineType}
        neighborhoods={neighborhoods}
        defaultFilters={DEFAULT_FILTERS}
        view={view}
        onViewChange={setView}
        resultCount={filtered.length}
      />
      <div className="app__content">
        {view === 'map' ? (
          <MapView
            places={filtered}
            isAdmin={isAdmin}
            onEdit={setFormTarget}
          />
        ) : (
          <ListView
            places={filtered}
            isAdmin={isAdmin}
            onAddRequest={() => setFormTarget('new')}
            onEditRequest={setFormTarget}
          />
        )}
      </div>
      {formTarget && (
        <PlaceFormModal
          editing={formTarget === 'new' ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSaved={upsertPlace}
          neighborhoods={neighborhoods}
        />
      )}
      <LastUpdated date={data.lastUpdated} />
    </div>
  );
}
