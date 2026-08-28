import { useState } from 'react';
import type { Filters, PlaceType } from '../types';
import { shortCuisineLabel } from '../lib/cuisineLabel';

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  cuisines: string[];
  cuisineType: Record<string, PlaceType>;
  neighborhoods: string[];
  defaultFilters: Filters;
  view: 'map' | 'list';
  onViewChange: (v: 'map' | 'list') => void;
  resultCount: number;
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

const STATUS_OPTIONS: { value: Filters['visited']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'been', label: 'Visited' },
  { value: 'want', label: 'Want to try' },
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

// Word-boundary prefix match, not "contains anywhere" - otherwise "it" would
// suggest "City Park" (C-it-y) and "Non Profit Organization" (Prof-it). Checks
// both a whole-string prefix (so "ice cream" matches "Ice Cream Shop") and any
// single word's start (so "bar" matches "Cocktail Bar", not just names
// beginning with "Bar").
function matchesQuery(value: string, query: string): boolean {
  const q = query.toLowerCase().trim();
  const v = value.toLowerCase();
  if (v.startsWith(q)) return true;
  return v.split(/\s+/).some(word => word.startsWith(q));
}

interface Suggestion {
  label: string;
  kind: 'cuisine' | 'neighborhood';
}

interface ActiveChip {
  key: string;
  label: string;
  colorClass?: string;
  onRemove: () => void;
}

export default function FilterSidebar({
  filters,
  onChange,
  cuisines,
  cuisineType,
  neighborhoods,
  defaultFilters,
  view,
  onViewChange,
  resultCount,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

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

  // Live search + suggestions - reachable directly from the always-visible
  // bar, not gated behind opening the full sheet.
  const q = filters.search.trim().toLowerCase();
  const synonymMatches = q ? (CUISINE_SYNONYMS[q] ?? []).filter(c => cuisines.includes(c)) : [];
  const cuisineMatches = q ? cuisines.filter(c => matchesQuery(c, filters.search)) : [];
  const cuisineSuggestions: Suggestion[] = q
    ? [...new Set([...synonymMatches, ...cuisineMatches])]
        .filter(c => !filters.cuisine.includes(c))
        .map(label => ({ label, kind: 'cuisine' as const }))
    : [];
  const neighborhoodSuggestions: Suggestion[] = q
    ? neighborhoods
        .filter(n => matchesQuery(n, filters.search) && !filters.neighborhood.includes(n))
        .map(label => ({ label, kind: 'neighborhood' as const }))
    : [];
  const suggestions = [...cuisineSuggestions, ...neighborhoodSuggestions].slice(0, 8);

  function selectSuggestion(s: Suggestion) {
    if (s.kind === 'cuisine') {
      onChange({ ...filters, cuisine: [...filters.cuisine, s.label], search: '' });
    } else {
      onChange({ ...filters, neighborhood: [...filters.neighborhood, s.label], search: '' });
    }
  }

  const priceSummary = filters.priceLevel.length === 0
    ? 'No prices'
    : [...filters.priceLevel].sort().map(l => '$'.repeat(l)).join(' ');

  // Every non-default facet becomes one uniformly removable chip - clicking
  // any of them resets just that facet, no need to open the sheet just to
  // clear one thing.
  const chips: ActiveChip[] = [];
  if (filters.types.length < TYPES.length) {
    const label = TYPES.filter(t => filters.types.includes(t.key)).map(t => t.label).join(', ') || 'No categories';
    chips.push({ key: 'types', label, onRemove: () => onChange({ ...filters, types: defaultFilters.types }) });
  }
  for (const c of filters.cuisine) {
    chips.push({
      key: `c-${c}`,
      label: shortCuisineLabel(c),
      colorClass: `token-field__tag--${cuisineType[c] ?? 'restaurant'}`,
      onRemove: () => onChange({ ...filters, cuisine: filters.cuisine.filter(x => x !== c) }),
    });
  }
  for (const n of filters.neighborhood) {
    chips.push({
      key: `n-${n}`,
      label: n,
      colorClass: 'token-field__tag--neighborhood',
      onRemove: () => onChange({ ...filters, neighborhood: filters.neighborhood.filter(x => x !== n) }),
    });
  }
  if (filters.visited !== 'all') {
    chips.push({
      key: 'visited',
      label: STATUS_OPTIONS.find(o => o.value === filters.visited)!.label,
      onRemove: () => onChange({ ...filters, visited: 'all' }),
    });
  }
  if (filters.priceLevel.length < PRICE_LEVELS.length) {
    chips.push({ key: 'price', label: priceSummary, onRemove: () => onChange({ ...filters, priceLevel: defaultFilters.priceLevel }) });
  }
  if (filters.openNow) {
    chips.push({ key: 'openNow', label: 'Open now', onRemove: () => onChange({ ...filters, openNow: false }) });
  }
  if (filters.hasNotes) {
    chips.push({ key: 'hasNotes', label: 'Has notes', onRemove: () => onChange({ ...filters, hasNotes: false }) });
  }

  return (
    <>
      <div className="filter-bar">
        <div className="filter-bar__row">
          <div className="filter-bar__search-wrap">
            <svg className="filter-bar__search-icon" width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11.5 11.5L15 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              className="filter-bar__input"
              type="search"
              placeholder="Search or filter"
              value={filters.search}
              onChange={e => onChange({ ...filters, search: e.target.value })}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            />
            {searchFocused && suggestions.length > 0 && (
              <div className="token-field__suggestions">
                {suggestions.map(s => (
                  // onMouseDown (not onClick) fires before the input's onBlur closes this list
                  <button
                    key={`${s.kind}-${s.label}`}
                    className="token-field__suggestion"
                    onMouseDown={() => selectSuggestion(s)}
                  >
                    <span>{s.kind === 'cuisine' ? shortCuisineLabel(s.label) : s.label}</span>
                    <span className="token-field__suggestion-kind">{s.kind === 'cuisine' ? 'Cuisine' : 'Neighborhood'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="view-toggle">
            <button
              className={`view-toggle__option${view === 'map' ? ' view-toggle__option--active' : ''}`}
              onClick={() => onViewChange('map')}
            >
              Map
            </button>
            <button
              className={`view-toggle__option${view === 'list' ? ' view-toggle__option--active' : ''}`}
              onClick={() => onViewChange('list')}
            >
              List
            </button>
          </div>

          <button className="filter-bar__settings" onClick={() => setSheetOpen(true)} aria-label="More filters">
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v2M8 13v2M2.5 4.5l1.4 1.4M12.1 10.1l1.4 1.4M1 8h2M13 8h2M2.5 11.5l1.4-1.4M12.1 5.9l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            {chips.length > 0 && <span className="filter-bar__badge">{chips.length}</span>}
          </button>
        </div>

        <div className="filter-bar__count">{resultCount.toLocaleString()} places</div>

        {chips.length > 0 && (
          <div className="filter-bar__chips">
            {chips.map(c => (
              <button
                key={c.key}
                className={`token-field__tag ${c.colorClass ?? 'token-field__tag--neutral'}`}
                onClick={c.onRemove}
              >
                {c.label} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {sheetOpen && (
        <div className="place-modal">
          <div className="place-modal__backdrop" onClick={() => setSheetOpen(false)} />
          <div className="place-modal__sheet">
            <div className="place-modal__header">
              <span className="filter-sidebar__title">Filters</span>
              <button className="filter-sidebar__close" onClick={() => setSheetOpen(false)} aria-label="Close">×</button>
            </div>

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

            <div className="filter-section__label filter-section__label--spaced">Status</div>
            <div className="filter-toggle-group">
              {STATUS_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  className={`filter-toggle${filters.visited === value ? ' filter-toggle--active' : ''}`}
                  onClick={() => onChange({ ...filters, visited: value })}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="filter-section__label filter-section__label--spaced">Price</div>
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

            <div className="filter-toggle-group filter-toggle-group--spaced">
              <button
                className={`filter-toggle${filters.openNow ? ' filter-toggle--active' : ''}`}
                onClick={() => onChange({ ...filters, openNow: !filters.openNow })}
              >
                Open now
              </button>
              <button
                className={`filter-toggle${filters.hasNotes ? ' filter-toggle--active' : ''}`}
                onClick={() => onChange({ ...filters, hasNotes: !filters.hasNotes })}
              >
                Has notes
              </button>
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

            <button
              className="filter-reset filter-reset--spaced"
              onClick={() => onChange(defaultFilters)}
            >
              Reset filters
            </button>
          </div>
        </div>
      )}
    </>
  );
}
