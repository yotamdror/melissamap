// Google Places text search occasionally returns a similarly named venue even
// when the neighborhood is included. Keep narrowly scoped, address-qualified
// queries here so cache rebuilds and admin edits resolve the intended listing.
const PLACE_SEARCH_QUERY_OVERRIDES: Readonly<Record<string, string>> = {
  'manetta-s-fine-foods':
    "Manetta's Ristorante, 10-76 Jackson Ave, Long Island City, NY 11101",
};

export function getPlaceSearchQuery(
  id: string,
  name: string,
  locationPart: string,
): string {
  return PLACE_SEARCH_QUERY_OVERRIDES[id] ?? `${name}, ${locationPart}`;
}
