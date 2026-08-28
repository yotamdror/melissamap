// Word-boundary prefix match, not "contains anywhere" - otherwise "it" would
// suggest "City Park" (C-it-y) and "Non Profit Organization" (Prof-it). Checks
// both a whole-string prefix (so "ice cream" matches "Ice Cream Shop") and any
// single word's start (so "bar" matches "Cocktail Bar", not just names
// beginning with "Bar").
export function matchesQuery(value: string, query: string): boolean {
  const q = query.toLowerCase().trim();
  const v = value.toLowerCase();
  if (v.startsWith(q)) return true;
  return v.split(/\s+/).some(word => word.startsWith(q));
}
