export type SearchMode = 'normal' | 'regex' | 'fuzzy';

/**
 * Escapes special characters in a string for regular expression construction.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts a wildcard string (e.g. *.tsx, file?.js) into a valid regex pattern.
 */
export function wildcardToRegex(pattern: string): string {
  return pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*?')
    .replace(/\?/g, '.');
}

/**
 * Validates whether a regex or wildcard pattern string is syntactically usable.
 */
export function isValidRegex(pattern: string): boolean {
  if (!pattern) return true;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    try {
      new RegExp(wildcardToRegex(pattern));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Builds a RegExp instance based on the query and chosen search mode.
 * In 'regex' mode, wildcard patterns (* and ?) are seamlessly supported and merged.
 */
export function buildSearchRegex(
  query: string,
  mode: SearchMode,
  caseSensitive: boolean = false,
  global: boolean = true
): RegExp | null {
  if (!query) return null;

  const flags = (global ? 'g' : '') + (caseSensitive ? '' : 'i');

  try {
    if (mode === 'regex') {
      try {
        return new RegExp(query, flags);
      } catch {
        // Fallback: convert wildcard patterns (* and ?) to regex equivalents
        return new RegExp(wildcardToRegex(query), flags);
      }
    }

    if (mode === 'fuzzy') {
      // Fuzzy match: characters must appear in order
      const chars = query
        .split('')
        .filter((c) => c.length > 0)
        .map(escapeRegex);
      if (chars.length === 0) return null;
      return new RegExp(chars.join('.*?'), flags);
    }

    // Default: 'normal' substring match
    return new RegExp(escapeRegex(query), flags);
  } catch {
    return null;
  }
}

/**
 * Checks whether a given string matches the search query and mode.
 */
export function matchesSearch(
  text: string,
  query: string,
  mode: SearchMode,
  caseSensitive: boolean = false
): boolean {
  if (!query || !query.trim()) return true;
  if (!text) return false;

  const regex = buildSearchRegex(query.trim(), mode, caseSensitive, false);
  if (!regex) return false;
  return regex.test(text);
}

/**
 * Splits a text into matched and non-matched segments for highlighting.
 */
export function splitBySearchMatch(
  text: string,
  query: string,
  mode: SearchMode,
  caseSensitive: boolean = false
): { text: string; isMatch: boolean }[] {
  if (!text) return [];
  if (!query) return [{ text, isMatch: false }];

  const regex = buildSearchRegex(query, mode, caseSensitive, true);
  if (!regex) return [{ text, isMatch: false }];

  const parts: { text: string; isMatch: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  try {
    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;
      const matchStr = match[0];

      if (matchStr.length === 0) {
        regex.lastIndex++;
        continue;
      }

      if (matchIndex > lastIndex) {
        parts.push({ text: text.substring(lastIndex, matchIndex), isMatch: false });
      }
      parts.push({ text: matchStr, isMatch: true });
      lastIndex = matchIndex + matchStr.length;

      // Prevent infinite loops if regex doesn't advance
      if (!regex.global) break;
    }

    if (lastIndex < text.length) {
      parts.push({ text: text.substring(lastIndex), isMatch: false });
    }
  } catch {
    return [{ text, isMatch: false }];
  }

  return parts;
}
