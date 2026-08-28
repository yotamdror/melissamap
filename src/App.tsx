import { useState, useEffect } from 'react';
import PasswordGate from './components/PasswordGate';
import MapView from './components/MapView';
import FilterSidebar from './components/FilterSidebar';
import LastUpdated from './components/LastUpdated';
import type { PlacesData, Filters, Place } from './types';
import { isOpenNow } from './lib/openNow';

const DEFAULT_FILTERS: Filters = {
  types: ['restaurant', 'bar', 'snacks'],
  visited: 'all',
  priceLevel: [1, 2, 3, 4],
  openNow: false,
  includeUnknownHours: true,
  borough: '',
  cuisine: [],
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

    if (filters.borough && p.borough !== filters.borough) return false;

    if (filters.cuisine.length && !filters.cuisine.includes(p.cuisine ?? '')) return false;

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
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [data, setData] = useState<PlacesData | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch('/api/verify')
      .then(r => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (authed) {
      fetch('/api/places')
        .then(r => r.json())
        .then(setData);
    }
  }, [authed]);

  if (authed === null) return null;
  if (!authed) return <PasswordGate onSuccess={() => setAuthed(true)} />;
  if (!data) return null;

  const mappablePlaces = data.places.filter(p => p.lat != null && p.lng != null);
  const filtered = applyFilters(mappablePlaces, filters);
  const boroughs = [...new Set(data.places.map(p => p.borough).filter(Boolean))].sort();
  const cuisines = [...new Set(data.places.map(p => p.cuisine).filter(Boolean))].sort() as string[];

  return (
    <div className="app">
      <div
        className={`filter-sidebar__overlay${sidebarOpen ? ' filter-sidebar__overlay--visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <FilterSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        filters={filters}
        onChange={setFilters}
        boroughs={boroughs}
        cuisines={cuisines}
        defaultFilters={DEFAULT_FILTERS}
      />
      <MapView
        places={filtered}
        onMenuClick={() => setSidebarOpen(true)}
      />
      <LastUpdated date={data.lastUpdated} />
    </div>
  );
}
