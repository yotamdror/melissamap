export interface OpenPeriod {
  day: number;   // 0 = Sunday
  open: string;  // "HHMM" 24-hour
  close: string; // "HHMM" 24-hour
}

export interface Place {
  id: string;
  name: string;
  // From sheet
  hasBeenTo: boolean;
  isRestaurant: boolean;
  isSnacksDessert: boolean;
  isBar: boolean;
  notes: string;
  neighborhood: string;
  borough: string;
  city: string;
  // Enriched by Places API
  lat?: number;
  lng?: number;
  placeId?: string;
  address?: string;
  cuisine?: string;
  // All matched cuisine/type tags (searchable), not just the display cuisine
  cuisineTags?: string[];
  priceLevel?: 1 | 2 | 3 | 4;
  googleRating?: number;
  googleRatingCount?: number;
  openPeriods?: OpenPeriod[];
  weekdayHours?: string[];
}

export interface PlacesData {
  lastUpdated: string | null;
  places: Place[];
}

export type PlaceType = 'restaurant' | 'bar' | 'snacks';

export interface Filters {
  types: PlaceType[];
  visited: 'all' | 'been' | 'want';
  priceLevel: number[];
  openNow: boolean;
  includeUnknownHours: boolean;
  cuisine: string[];
  search: string;
}
