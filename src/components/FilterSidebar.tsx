import type { Filters, PlaceType } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onChange: (f: Filters) => void;
  boroughs: string[];
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

export default function FilterSidebar({ open, onClose, filters, onChange, boroughs, defaultFilters }: Props) {
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
          <input
            className="filter-search"
            type="search"
            placeholder="Name, notes, neighborhood…"
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
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
                {v === 'all' ? 'All' : v === 'been' ? 'Been there' : 'Want to go'}
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
