import { useState } from 'react';
import type { Filters, PlaceType } from '../types';
import { shortCuisineLabel } from '../lib/cuisineLabel';

interface Props {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onChange: (f: Filters) => void;
  cuisines: string[];
  cuisineType: Record<string, PlaceType>;
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

// Colloquial/cultural terms people actually type that don't match Google's
// formal cuisine taxonomy at all as strings (no synonym-matching algorithm
// bridges "jewish" -> "israeli" - only a curated mapping can). Expand this
// list as more gaps get reported.
const CUISINE_SYNONYMS: Record<string, string[]> = {
  jewish: ['Israeli Restaurant', 'Deli', 'Bagel Shop'],
  kosher: ['Israeli Restaurant', 'Deli'],
  bbq: ['Barbecue Restaurant'],
  barbeque: ['Barbecue Restaurant'],
  'tex-mex': ['Mexican Restaurant'],
  texmex: ['Mexican Restaurant'],
  brunch: ['Breakfast Restaurant'],
  pub: ['Bar', 'Bar And Grill'],
  noodles: ['Ramen Restaurant', 'Chinese Noodle Restaurant', 'Vietnamese Restaurant'],
  boba: ['Taiwanese Restaurant'],
};

// One box does both jobs: it live-filters by free text (name/notes/neighborhood/
// cuisine) on every keystroke same as before, and if what you've typed matches a
// known cuisine (directly or via a curated synonym), it also offers that as a
// suggestion - picking it locks in an exact cuisine filter (shown as a removable
// chip, colored by the type it predominantly belongs to) and clears the query.
function SearchAndCuisine({
  search,
  onSearchChange,
  cuisines,
  cuisineType,
  selectedCuisines,
  onSelectCuisine,
  onCuisinesChange,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  cuisines: string[];
  cuisineType: Record<string, PlaceType>;
  selectedCuisines: string[];
  onSelectCuisine: (c: string) => void;
  onCuisinesChange: (v: string[]) => void;
}) {
  const [focused, setFocused] = useState(false);

  // Word-boundary prefix match, not "contains anywhere" - otherwise "it" would
  // suggest "City Park" (C-it-y) and "Non Profit Organization" (Prof-it). Checks
  // both a whole-string prefix (so "ice cream" matches "Ice Cream Shop") and any
  // single word's start (so "bar" matches "Cocktail Bar", not just names
  // beginning with "Bar").
  function matchesQuery(cuisine: string, query: string): boolean {
    const q = query.toLowerCase().trim();
    const c = cuisine.toLowerCase();
    if (c.startsWith(q)) return true;
    return c.split(/\s+/).some(word => word.startsWith(q));
  }

  const q = search.trim().toLowerCase();
  const synonymMatches = q ? (CUISINE_SYNONYMS[q] ?? []).filter(c => cuisines.includes(c)) : [];
  const directMatches = q ? cuisines.filter(c => matchesQuery(c, search)) : [];
  const suggestions = q
    ? [...new Set([...synonymMatches, ...directMatches])]
        .filter(c => !selectedCuisines.includes(c))
        .slice(0, 8)
    : [];

  return (
    <div className="cuisine-picker">
      {selectedCuisines.length > 0 && (
        <div className="cuisine-picker__tags">
          {selectedCuisines.map(c => (
            <button
              key={c}
              className={`cuisine-picker__tag cuisine-picker__tag--${cuisineType[c] ?? 'restaurant'}`}
              onClick={() => onCuisinesChange(selectedCuisines.filter(x => x !== c))}
            >
              {shortCuisineLabel(c)} <span aria-hidden="true">×</span>
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
              {shortCuisineLabel(c)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilterSidebar({
  open,
  onClose,
  filters,
  onChange,
  cuisines,
  cuisineType,
  defaultFilters,
}: Props) {
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
          <div className="filter-section__label">Category</div>
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
          <SearchAndCuisine
            search={filters.search}
            onSearchChange={search => onChange({ ...filters, search })}
            cuisines={cuisines}
            cuisineType={cuisineType}
            selectedCuisines={filters.cuisine}
            onSelectCuisine={c => onChange({ ...filters, cuisine: [...filters.cuisine, c], search: '' })}
            onCuisinesChange={cuisine => onChange({ ...filters, cuisine })}
          />
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
