import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import PasswordGate from './components/PasswordGate';
import MapView from './components/MapView';
import ListView from './components/ListView';
import FilterSidebar from './components/FilterSidebar';
import LastUpdated from './components/LastUpdated';
import type { PlacesData, Filters, Place } from './types';
import { isOpenNow } from './lib/openNow';

const PlaceFormModal = lazy(() => import('./components/PlaceFormModal'));

const EMPTY_PLACES: Place[] = [];

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
  closedOnly: false,
};

function applyFilters(places: Place[], filters: Filters): Place[] {
  return places.filter(p => {
    // Closed places never mix with the normal view - closedOnly is an
    // exclusive admin mode, not an additive facet.
    if (filters.closedOnly) return !!p.closed;
    if (p.closed) return false;

    const typeMatch =
      (filters.types.includes('restaurant') && p.isRestaurant) ||
      (filters.types.includes('bar') && p.isBar) ||
      (filters.types.includes('snacks') && p.isSnacksDessert);
    if (!typeMatch) return false;

    if (filters.visited === 'been' && !p.hasBeenTo) return false;
    if (filters.visited === 'want' && p.hasBeenTo) return false;

    // A missing priceLevel means Google never returned pricing for this place
    // (~13% of the dataset). Only exclude those once the filter is actually
    // narrowed - otherwise unpriced places can't be confirmed to match the
    // selected levels and would otherwise leak through every price filter.
    if (filters.priceLevel.length < 4 && (!p.priceLevel || !filters.priceLevel.includes(p.priceLevel))) {
      return false;
    }

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
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
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
    if (!role) return;
    const controller = new AbortController();
    setLoadFailed(false);
    fetch('/api/places', { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error('Places request failed');
        return r.json();
      })
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [role, attempt]);

  function logout() {
    fetch('/api/logout', { method: 'POST' }).finally(() => {
      setRole(null);
      setData(null);
      setView('map');
    });
  }

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

  function removePlace(place: Place) {
    setData(d => (d ? { ...d, places: d.places.filter(p => p.id !== place.id) } : d));
    setFormTarget(null);
  }

  const places = data?.places ?? EMPTY_PLACES;
  const mappablePlaces = useMemo(() => places.filter(p => p.lat != null && p.lng != null), [places]);
  const filtered = useMemo(() => applyFilters(mappablePlaces, filters), [mappablePlaces, filters]);
  const cuisines = useMemo(() => [...new Set(places.map(p => p.cuisine).filter(Boolean))].sort() as string[], [places]);
  const neighborhoods = useMemo(() => [...new Set(places.map(p => p.neighborhood).filter(Boolean))].sort(), [places]);

  // Color each cuisine chip by whichever type (restaurant/bar/snack) most of its
  // places actually are, so cuisine chips reinforce the existing type colors
  // instead of introducing an unrelated 4th color.
  const cuisineType = useMemo(() => {
    const totals = new Map<string, { restaurant: number; bar: number; snacks: number }>();
    for (const p of places) {
      if (!p.cuisine) continue;
      const counts = totals.get(p.cuisine) ?? { restaurant: 0, bar: 0, snacks: 0 };
      counts[p.isBar ? 'bar' : p.isSnacksDessert ? 'snacks' : 'restaurant']++;
      totals.set(p.cuisine, counts);
    }
    const types: Record<string, 'restaurant' | 'bar' | 'snacks'> = {};
    for (const [cuisine, counts] of totals) {
      types[cuisine] = counts.bar >= counts.restaurant && counts.bar >= counts.snacks
        ? 'bar' : counts.snacks >= counts.restaurant ? 'snacks' : 'restaurant';
    }
    return types;
  }, [places]);

  if (role === undefined) return null;
  if (!role) return <PasswordGate onSuccess={setRole} />;
  const isAdmin = role === 'admin';

  return (
    <div className="app">
      {loadFailed && <div role="alert">Places could not load. <button onClick={() => setAttempt(n => n + 1)}>Retry</button></div>}
      {data && <FilterSidebar
        filters={filters}
        onChange={setFilters}
        cuisines={cuisines}
        cuisineType={cuisineType}
        neighborhoods={neighborhoods}
        defaultFilters={DEFAULT_FILTERS}
        isAdmin={isAdmin}
        onLogout={logout}
        view={view}
        onViewChange={setView}
        resultCount={filtered.length}
      />}
      <div className="app__content">
        <div hidden={view !== 'map'}>
          <MapView places={filtered} isAdmin={isAdmin} onEdit={setFormTarget} />
        </div>
        {view === 'list' && (
          <ListView
            places={filtered}
            isAdmin={isAdmin}
            onAddRequest={() => setFormTarget('new')}
            onEditRequest={setFormTarget}
          />
        )}
      </div>
      {formTarget && (
        <Suspense fallback={<div role="status">Loading editor…</div>}>
          <PlaceFormModal
            editing={formTarget === 'new' ? null : formTarget}
            onClose={() => setFormTarget(null)}
            onSaved={upsertPlace}
            onDeleted={removePlace}
            neighborhoods={neighborhoods}
          />
        </Suspense>
      )}
      <LastUpdated date={data?.lastUpdated ?? null} />
    </div>
  );
}
