import { useState } from 'react';
import type { Filters, PlaceType } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onChange: (f: Filters) => void;
  boroughs: string[];
  cuisines: string[];
  defaultFilters: Filters;
}

const TYPES: { key: PlaceType; label: string }[] = [
  { key: 'restaurant', label: 'Restaurants' },
  { key: 'bar', label: 'Bars' },
  { key: 'snacks', label: 'Snacks & Dessert' },
];

const PRICE_LEVELS = [
  { value: 1, label: '$' },
  { value: 2, label: '$$' },
  { value: 3, label: '$$$' },
  { value: 4, label: '$$$$' },
];

// One box does both jobs: it live-filters by free text (name/notes/neighborhood/
// cuisine) on every keystroke same as before, and if what you've typed matches a
// known cuisine, it also offers that as a suggestion - picking it locks in an
// exact cuisine filter (shown as a removable chip) and clears the free-text query.
function SearchAndCuisine({
  search,
  onSearchChange,
  cuisines,
  selectedCuisines,
  onSelectCuisine,
  onCuisinesChange,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  cuisines: string[];
  selectedCuisines: string[];
  onSelectCuisine: (c: string) => void;
  onCuisinesChange: (v: string[]) => void;
}) {
  const [focused, setFocused] = useState(false);

  const suggestions = search.trim()
    ? cuisines
        .filter(c => !selectedCuisines.includes(c) && c.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 8)
    : [];

  return (
    <div className="cuisine-picker">
      {selectedCuisines.length > 0 && (
        <div className="cuisine-picker__tags">
          {selectedCuisines.map(c => (
            <button
              key={c}
              className="cuisine-picker__tag"
              onClick={() => onCuisinesChange(selectedCuisines.filter(x => x !== c))}
            >
              {c} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      <input
        className="filter-search"
        type="search"
        placeholder="Name, notes, neighborhood, cuisine…"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {focused && suggestions.length > 0 && (
        <div className="cuisine-picker__suggestions">
          {suggestions.map(c => (
            // onMouseDown (not onClick) fires before the input's onBlur closes this list
            <button key={c} className="cuisine-picker__suggestion" onMouseDown={() => onSelectCuisine(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilterSidebar({ open, onClose, filters, onChange, boroughs, cuisines, defaultFilters }: Props) {
  function toggleType(type: PlaceType) {
    const types = filters.types.includes(type)
      ? filters.types.filter(t => t !== type)
      : [...filters.types, type];
    onChange({ ...filters, types });
  }

  function togglePrice(level: number) {
    const priceLevel = filters.priceLevel.includes(level)
      ? filters.priceLevel.filter(p => p !== level)
      : [...filters.priceLevel, level];
    onChange({ ...filters, priceLevel });
  }

  return (
    <aside className={`filter-sidebar${open ? ' filter-sidebar--open' : ''}`}>
      <div className="filter-sidebar__header">
        <span className="filter-sidebar__title">Filters</span>
        <button className="filter-sidebar__close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="filter-sidebar__body">
        <div>
          <div className="filter-section__label">Search</div>
          <SearchAndCuisine
            search={filters.search}
            onSearchChange={search => onChange({ ...filters, search })}
            cuisines={cuisines}
            selectedCuisines={filters.cuisine}
            onSelectCuisine={c => onChange({ ...filters, cuisine: [...filters.cuisine, c], search: '' })}
            onCuisinesChange={cuisine => onChange({ ...filters, cuisine })}
          />
        </div>

        <div>
          <div className="filter-section__label">Type</div>
          <div className="filter-toggle-group">
            {TYPES.map(({ key, label }) => (
              <button
                key={key}
                className={`filter-toggle filter-toggle--${key}${filters.types.includes(key) ? ' filter-toggle--active' : ''}`}
                onClick={() => toggleType(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="filter-section__label">Status</div>
          <div className="filter-toggle-group">
            {(['all', 'been', 'want'] as const).map(v => (
              <button
                key={v}
                className={`filter-toggle${filters.visited === v ? ' filter-toggle--active' : ''}`}
                onClick={() => onChange({ ...filters, visited: v })}
              >
                {v === 'all' ? 'All' : v === 'been' ? 'Visited' : 'Want to try'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="filter-section__label">Price</div>
          <div className="filter-toggle-group">
            {PRICE_LEVELS.map(({ value, label }) => (
              <button
                key={value}
                className={`filter-toggle${filters.priceLevel.includes(value) ? ' filter-toggle--active' : ''}`}
                onClick={() => togglePrice(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="filter-section__label">Borough</div>
          <select
            className="filter-select"
            value={filters.borough}
            onChange={e => onChange({ ...filters, borough: e.target.value })}
          >
            <option value="">All boroughs</option>
            {boroughs.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="filter-switch-row">
            <span>Open now</span>
            <label className="filter-switch">
              <input
                type="checkbox"
                checked={filters.openNow}
                onChange={e => onChange({ ...filters, openNow: e.target.checked })}
              />
              <span className="filter-switch__track" />
            </label>
          </div>
          {filters.openNow && (
            <div className="filter-switch-row filter-switch-row--nested">
              <span>Include places with unknown hours</span>
              <label className="filter-switch">
                <input
                  type="checkbox"
                  checked={filters.includeUnknownHours}
                  onChange={e => onChange({ ...filters, includeUnknownHours: e.target.checked })}
                />
                <span className="filter-switch__track" />
              </label>
            </div>
          )}
        </div>

        <button
          className="filter-reset"
          onClick={() => onChange(defaultFilters)}
        >
          Reset filters
        </button>
      </div>
    </aside>
  );
}
