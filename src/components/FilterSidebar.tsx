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

// A collapsed section that opens on tap and shows a one-line summary of its
// current value when closed - progressive disclosure instead of showing
// every control at once.
function Disclosure({
  label,
  summary,
  defaultOpen,
  children,
}: {
  label: string;
  summary?: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="disclosure">
      <button className="disclosure__header" onClick={() => setOpen(o => !o)}>
        <span className="disclosure__label">{label}</span>
        <span className="disclosure__meta">
          {summary && <span className="disclosure__summary">{summary}</span>}
          <svg
            className={`disclosure__chevron${open ? ' disclosure__chevron--open' : ''}`}
            width="10" height="10" viewBox="0 0 10 10" fill="none"
          >
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && <div className="disclosure__content">{children}</div>}
    </div>
  );
}

interface Suggestion {
  label: string;
  kind: 'cuisine' | 'neighborhood';
}

// Live-filters by free text (name/notes/neighborhood/cuisine) on every
// keystroke same as before. If what's typed matches a known cuisine (directly
// or via a curated synonym) or a neighborhood, it also offers that as a
// suggestion - picking one locks in an exact filter (shown as a removable
// chip in its own row, separate from the text field) and clears the query.
// Chips live outside the input box on purpose - keeping them out of the field
// you're actively typing in.
function TokenSearch({
  search,
  onSearchChange,
  cuisines,
  cuisineType,
  selectedCuisines,
  onSelectCuisine,
  onRemoveCuisine,
  neighborhoods,
  selectedNeighborhoods,
  onSelectNeighborhood,
  onRemoveNeighborhood,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  cuisines: string[];
  cuisineType: Record<string, PlaceType>;
  selectedCuisines: string[];
  onSelectCuisine: (c: string) => void;
  onRemoveCuisine: (c: string) => void;
  neighborhoods: string[];
  selectedNeighborhoods: string[];
  onSelectNeighborhood: (n: string) => void;
  onRemoveNeighborhood: (n: string) => void;
}) {
  const [focused, setFocused] = useState(false);

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

  const q = search.trim().toLowerCase();
  const synonymMatches = q ? (CUISINE_SYNONYMS[q] ?? []).filter(c => cuisines.includes(c)) : [];
  const cuisineMatches = q ? cuisines.filter(c => matchesQuery(c, search)) : [];
  const cuisineSuggestions: Suggestion[] = q
    ? [...new Set([...synonymMatches, ...cuisineMatches])]
        .filter(c => !selectedCuisines.includes(c))
        .map(label => ({ label, kind: 'cuisine' as const }))
    : [];
  const neighborhoodSuggestions: Suggestion[] = q
    ? neighborhoods
        .filter(n => matchesQuery(n, search) && !selectedNeighborhoods.includes(n))
        .map(label => ({ label, kind: 'neighborhood' as const }))
    : [];
  const suggestions = [...cuisineSuggestions, ...neighborhoodSuggestions].slice(0, 8);

  function selectSuggestion(s: Suggestion) {
    if (s.kind === 'cuisine') onSelectCuisine(s.label);
    else onSelectNeighborhood(s.label);
  }

  const hasTags = selectedCuisines.length > 0 || selectedNeighborhoods.length > 0;

  return (
    <div className="token-field">
      {hasTags && (
        <div className="token-field__tags">
          {selectedCuisines.map(c => (
            <button
              key={`c-${c}`}
              className={`token-field__tag token-field__tag--${cuisineType[c] ?? 'restaurant'}`}
              onClick={() => onRemoveCuisine(c)}
            >
              {shortCuisineLabel(c)} <span aria-hidden="true">×</span>
            </button>
          ))}
          {selectedNeighborhoods.map(n => (
            <button
              key={`n-${n}`}
              className="token-field__tag token-field__tag--neighborhood"
              onClick={() => onRemoveNeighborhood(n)}
            >
              {n} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      <input
        className={`filter-search${focused ? ' filter-search--focused' : ''}`}
        type="search"
        placeholder="Name, notes, neighborhood, cuisine…"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {focused && suggestions.length > 0 && (
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
  );
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

  // Only mention filters that are actually set to something non-default - an
  // always-visible summary is less useful once it's several filters bundled
  // into one row instead of one clean value per row.
  const statusSummary = STATUS_OPTIONS.find(o => o.value === filters.visited)?.label;
  const priceSummary = filters.priceLevel.length === 4
    ? undefined
    : filters.priceLevel.length === 0
      ? 'No prices'
      : [...filters.priceLevel].sort().map(l => '$'.repeat(l)).join(' ');
  const moreFiltersParts = [
    filters.visited !== 'all' ? statusSummary : undefined,
    priceSummary,
    filters.openNow ? 'Open now' : undefined,
    filters.hasNotes ? 'Has notes' : undefined,
  ].filter(Boolean);
  const moreFiltersSummary = moreFiltersParts.length ? moreFiltersParts.join(' · ') : undefined;
  const moreFiltersDefaultOpen = moreFiltersParts.length > 0;

  return (
    <aside className="filter-sidebar">
      <div className="filter-sidebar__body">
        <div>
          <div className="filter-section__label-row">
            <div className="filter-section__label">Category</div>
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
          </div>
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
          <TokenSearch
            search={filters.search}
            onSearchChange={search => onChange({ ...filters, search })}
            cuisines={cuisines}
            cuisineType={cuisineType}
            selectedCuisines={filters.cuisine}
            onSelectCuisine={c => onChange({ ...filters, cuisine: [...filters.cuisine, c], search: '' })}
            onRemoveCuisine={c => onChange({ ...filters, cuisine: filters.cuisine.filter(x => x !== c) })}
            neighborhoods={neighborhoods}
            selectedNeighborhoods={filters.neighborhood}
            onSelectNeighborhood={n => onChange({ ...filters, neighborhood: [...filters.neighborhood, n], search: '' })}
            onRemoveNeighborhood={n => onChange({ ...filters, neighborhood: filters.neighborhood.filter(x => x !== n) })}
          />
        </div>

        <Disclosure label="More filters" summary={moreFiltersSummary} defaultOpen={moreFiltersDefaultOpen}>
          <div className="filter-section__label">Status</div>
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
        </Disclosure>

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
