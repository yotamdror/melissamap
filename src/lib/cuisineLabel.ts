// Display-only shortening (e.g. "Italian Restaurant" -> "Italian"). The
// underlying filter/match value stays the full Google-taxonomy string - only
// what's rendered gets trimmed.
const GENERIC_SUFFIXES = ['Restaurant', 'Shop', 'Bar', 'House', 'Store', 'Organization'];

export function shortCuisineLabel(cuisine: string): string {
  const words = cuisine.split(' ');
  if (words.length > 1 && GENERIC_SUFFIXES.includes(words[words.length - 1])) {
    return words.slice(0, -1).join(' ');
  }
  return cuisine;
}
