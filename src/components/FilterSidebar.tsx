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

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented-control">
      {options.map(o => (
        <button
          key={o.value}
          className={`segmented-control__option${value === o.value ? ' segmented-control__option--active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// One token field does both jobs: it live-filters by free text (name/notes/
// neighborhood/cuisine) on every keystroke same as before, and if what you've
// typed matches a known cuisine (directly or via a curated synonym), it also
// offers that as a suggestion - picking it locks in an exact cuisine filter
// (shown as a removable chip inside the same field, colored by the type it
// predominantly belongs to) and clears the query.
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
    <div className="token-field">
      <div className={`token-field__box${focused ? ' token-field__box--focused' : ''}`}>
        {selectedCuisines.map(c => (
          <button
            key={c}
            className={`token-field__tag token-field__tag--${cuisineType[c] ?? 'restaurant'}`}
            onClick={() => onCuisinesChange(selectedCuisines.filter(x => x !== c))}
          >
            {shortCuisineLabel(c)} <span aria-hidden="true">×</span>
          </button>
        ))}
        <input
          className="token-field__input"
          type="search"
          placeholder={selectedCuisines.length ? '' : 'Name, notes, neighborhood, cuisine…'}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
      </div>
      {focused && suggestions.length > 0 && (
        <div className="token-field__suggestions">
          {suggestions.map(c => (
            // onMouseDown (not onClick) fires before the input's onBlur closes this list
            <button key={c} className="token-field__suggestion" onMouseDown={() => onSelectCuisine(c)}>
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

  // Always show the current value, even when it's the default - a collapsed
  // row you can't read is worse than one that's always open.
  const statusSummary = STATUS_OPTIONS.find(o => o.value === filters.visited)?.label;
  const priceSummary = filters.priceLevel.length === 4
    ? 'All'
    : filters.priceLevel.length === 0
      ? 'None'
      : [...filters.priceLevel].sort().map(l => '$'.repeat(l)).join(' ');
  const openNowSummary = filters.openNow ? 'On' : 'Off';

  return (
    <aside className={`filter-sidebar${open ? ' filter-sidebar--open' : ''}`}>
      <div className="filter-sidebar__grabber" />
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

        <Disclosure label="Status" summary={statusSummary} defaultOpen={filters.visited !== 'all'}>
          <SegmentedControl
            options={STATUS_OPTIONS}
            value={filters.visited}
            onChange={visited => onChange({ ...filters, visited })}
          />
        </Disclosure>

        <Disclosure label="Price" summary={priceSummary} defaultOpen={filters.priceLevel.length < 4}>
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
        </Disclosure>

        <Disclosure label="Open now" summary={openNowSummary} defaultOpen={filters.openNow}>
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
