import { CodeLanguage, ProjectFile } from '../types';
import { languageRegistry, SuggestionItem } from '../languages';

export type { SuggestionItem };

/**
 * Access language keywords via languageRegistry.
 */
export const LANGUAGE_KEYWORDS: Record<string, SuggestionItem[]> = new Proxy(
  {},
  {
    get: (_target, prop: string) => {
      return languageRegistry.getSuggestions(prop);
    }
  }
);

/**
 * Extract document word identifiers
 */
export function extractDocumentIdentifiers(content: string): string[] {
  if (!content) return [];
  const words = content.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g);
  if (!words) return [];
  const unique = new Set<string>();
  for (const w of words) {
    if (w.length >= 2) unique.add(w);
  }
  return Array.from(unique);
}

/**
 * Get suggestions for the typed word prefix
 */
export function getSuggestionsForWord(
  prefix: string,
  language: CodeLanguage,
  currentFileContent: string,
  projectFiles?: ProjectFile[],
  maxResults = 7
): SuggestionItem[] {
  const cleanPrefix = prefix.trim();
  if (!cleanPrefix || cleanPrefix.length < 1) return [];

  const lowerPrefix = cleanPrefix.toLowerCase();
  const dict = languageRegistry.getSuggestions(language) || [];

  const docWords = extractDocumentIdentifiers(currentFileContent);
  const otherWords = new Set<string>();
  if (projectFiles) {
    for (const f of projectFiles) {
      if (f.content) {
        const words = extractDocumentIdentifiers(f.content);
        for (const w of words) otherWords.add(w);
      }
    }
  }

  const results: SuggestionItem[] = [];
  const seen = new Set<string>();

  // 1. Language Keywords (Prefix match)
  for (const item of dict) {
    if (seen.has(item.label)) continue;
    if (item.label.toLowerCase().startsWith(lowerPrefix)) {
      results.push(item);
      seen.add(item.label);
    }
  }

  // 2. Document Identifiers (Prefix match)
  for (const w of docWords) {
    if (seen.has(w)) continue;
    if (w.toLowerCase().startsWith(lowerPrefix) && w !== cleanPrefix) {
      results.push({ label: w, type: 'identifier', detail: '本文档变量/符号' });
      seen.add(w);
    }
  }

  // 3. Project Identifiers (Prefix match)
  for (const w of otherWords) {
    if (seen.has(w)) continue;
    if (w.toLowerCase().startsWith(lowerPrefix) && w !== cleanPrefix) {
      results.push({ label: w, type: 'identifier', detail: '工程共享符号' });
      seen.add(w);
    }
  }

  // 4. Fallback Contains Match
  if (results.length < maxResults && cleanPrefix.length >= 2) {
    for (const item of dict) {
      if (seen.has(item.label)) continue;
      if (item.label.toLowerCase().includes(lowerPrefix)) {
        results.push(item);
        seen.add(item.label);
      }
    }
    for (const w of docWords) {
      if (seen.has(w)) continue;
      if (w.toLowerCase().includes(lowerPrefix) && w !== cleanPrefix) {
        results.push({ label: w, type: 'identifier', detail: '本文档变量/符号' });
        seen.add(w);
      }
    }
  }

  return results.slice(0, maxResults);
}
