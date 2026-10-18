/**
 * Code folding helpers.
 *
 * Folding is implemented as a pure *view* transform over the model lines:
 *   model lines -> (collapsed set) -> view lines
 *
 * The editor keeps the textarea bound to the view text, and edits are mapped
 * back to model offsets through `viewOffsetToModelOffset`.
 *
 * Fold regions are language aware:
 *   - bracket languages (JS/TS/JSON/CSS/HTML/Python etc.) detect syntax blocks
 *     (`{ … }`, `[ … ]`, JSX elements, `case`/`default` labels) like VSCode;
 *   - other languages (and Python, where indentation is meaningful) fall back
 *     to pure indentation blocks. Both detections are linear in the number of
 *     lines, so large files are no longer special-cased.
 */

import type { CodeLanguage } from '../types';

/** Indentation (in columns) of a line, expanding tabs to `tabSize`. */
export function indentOf(line: string, tabSize: number): number {
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ' ') count += 1;
    else if (ch === '\t') count += tabSize;
    else break;
  }
  return count;
}

/**
 * Column boundaries (1-based, tab-expanded, multiples of `tabSize`) at which
 * VSCode-style indent guides should be drawn for the leading indentation of a
 * line. Example: a 4-space indent with tabSize=2 yields `[2, 4]`.
 */
export function indentGuideColumns(line: string, tabSize: number): number[] {
  const cols: number[] = [];
  let col = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ' ') col += 1;
    else if (ch === '\t') col += tabSize;
    else break;
    if (col > 0 && col % tabSize === 0 && cols[cols.length - 1] !== col) cols.push(col);
  }
  return cols;
}

/**
 * Detects foldable blocks using indentation (linear stack scan).
 * A header is any non-blank line whose indentation is deeper than the
 * following same-or-shallower line, extended to the deepest nested block.
 * Returns a map of `headerLineIndex -> endLineIndex (inclusive)`.
 */
function computeIndentRegions(lines: string[], tabSize: number): Map<number, number> {
  const regions = new Map<number, number>();
  const stack: { indent: number; header: number }[] = [];
  let prevNonBlank = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const ind = indentOf(line, tabSize);
    while (stack.length > 0 && stack[stack.length - 1].indent >= ind) {
      const top = stack.pop()!;
      if (prevNonBlank > top.header) regions.set(top.header, prevNonBlank);
    }
    stack.push({ indent: ind, header: i });
    prevNonBlank = i;
  }

  while (stack.length > 0) {
    const top = stack.pop()!;
    if (prevNonBlank > top.header) regions.set(top.header, prevNonBlank);
  }

  return regions;
}

/** Detects foldable `{ … }` / `[ … ]` blocks with string/comment awareness. */
function computeBracketRegions(lines: string[]): Map<number, number> {
  const regions = new Map<number, number>();
  const stack: { ch: string; line: number }[] = [];
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let j = 0;
    while (j < line.length) {
      const c = line[j];
      const next = line[j + 1];

      if (inBlockComment) {
        if (c === '*' && next === '/') {
          inBlockComment = false;
          j += 2;
          continue;
        }
        j += 1;
        continue;
      }
      // Line comments: skip the rest of the line.
      if (c === '/' && next === '/') break;
      if (c === '/' && next === '*') {
        inBlockComment = true;
        j += 2;
        continue;
      }
      // Strings and template literals.
      if (c === '"' || c === "'" || c === '`') {
        const quote = c;
        j += 1;
        while (j < line.length) {
          const qc = line[j];
          if (qc === '\\') {
            j += 2;
            continue;
          }
          if (qc === quote) {
            j += 1;
            break;
          }
          if (quote === '`' && qc === '$' && line[j + 1] === '{') {
            // Template interpolation opener — balance it like a `{` so the
            // real closing `}` does not corrupt the block stack.
            stack.push({ ch: '`${', line: i });
            j += 2;
            continue;
          }
          j += 1;
        }
        continue;
      }
      if (c === '{' || c === '[') {
        stack.push({ ch: c, line: i });
        j += 1;
        continue;
      }
      const close = c === '}' ? '{' : c === ']' ? '[' : null;
      if (close) {
        if (stack.length > 0) {
          const top = stack[stack.length - 1];
          if (top.ch === '`${') {
            // Interpolation close — no fold region.
            stack.pop();
            j += 1;
            continue;
          }
          // Best effort LIFO; on mismatch drop entries until a matching opener.
          let foundIdx = -1;
          for (let k = stack.length - 1; k >= 0; k--) {
            if (stack[k].ch === close) {
              foundIdx = k;
              break;
            }
          }
          if (foundIdx >= 0) {
            const matched = stack[foundIdx];
            stack.length = foundIdx;
            if (i > matched.line) regions.set(matched.line, i);
          }
        }
        j += 1;
        continue;
      }
      j += 1;
    }
  }

  return regions;
}

/** Detects foldable JSX element blocks (`<Tag …>…</Tag>`, nested aware). */
function computeJSXRegions(lines: string[]): Map<number, number> {
  const regions = new Map<number, number>();
  const stack: { tag: string; line: number }[] = [];
  const tagRe = /<\/?([A-Za-z][A-Za-z0-9._-]*)\b[^>]*>/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(line)) !== null) {
      const full = m[0];
      const tag = m[1];
      const isClosing = full.startsWith('</');
      const selfClosing = !isClosing && full.slice(-2) === '/>';
      if (selfClosing) continue;
      if (isClosing) {
        let foundIdx = -1;
        for (let k = stack.length - 1; k >= 0; k--) {
          if (stack[k].tag === tag) {
            foundIdx = k;
            break;
          }
        }
        if (foundIdx >= 0) {
          const matched = stack[foundIdx];
          stack.length = foundIdx;
          if (i > matched.line) regions.set(matched.line, i);
        }
      } else {
        stack.push({ tag, line: i });
      }
    }
  }

  return regions;
}

/** Detects `case …:` / `default:` label blocks (JS switch & Python match). */
function computeCaseRegions(lines: string[], tabSize: number): Map<number, number> {
  const regions = new Map<number, number>();
  const markers: { line: number; indent: number }[] = [];
  const labelRe = /^(?:case\b[^:]*|default)\s*:/;

  for (let i = 0; i < lines.length; i++) {
    if (labelRe.test(lines[i].trim())) {
      markers.push({ line: i, indent: indentOf(lines[i], tabSize) });
    }
  }
  if (markers.length === 0) return regions;

  const stack: { line: number; indent: number }[] = [];
  for (const m of markers) {
    while (stack.length > 0 && stack[stack.length - 1].indent >= m.indent) {
      const top = stack.pop()!;
      if (m.line - 1 > top.line) regions.set(top.line, m.line - 1);
    }
    stack.push(m);
  }

  // Remaining trailing labels extend to the last content line. A trailing
  // closing-brace line (e.g. the `}` ending a `switch`) belongs to the outer
  // block, not to the case body, so it is excluded like VSCode does.
  let last = lines.length - 1;
  while (last >= 0) {
    const t = lines[last].trim();
    if (t === '' || /^[}\])]+$/.test(t)) {
      last--;
    } else {
      break;
    }
  }
  while (stack.length > 0) {
    const top = stack.pop()!;
    if (last > top.line) regions.set(top.line, last);
  }

  return regions;
}

const BRACKET_LANGS = new Set<CodeLanguage>([
  'javascript',
  'typescript',
  'json',
  'css',
  'html',
  'python',
  'jsx',
  'tsx'
]);
const JSX_LANGS = new Set<CodeLanguage>(['javascript', 'typescript', 'html', 'jsx', 'tsx']);
const CASE_LANGS = new Set<CodeLanguage>(['javascript', 'typescript', 'python', 'jsx', 'tsx']);

function mergeRegions(target: Map<number, number>, source: Map<number, number>): void {
  source.forEach((end, start) => {
    const existing = target.get(start);
    // Prefer the widest region when multiple detections share a header line.
    if (existing === undefined || end > existing) target.set(start, end);
  });
}

/**
 * Finds foldable regions for the given language.
 * Returns a map of `headerLineIndex -> endLineIndex (inclusive)`.
 */
export function computeFoldRegions(
  lines: string[],
  tabSize: number = 2,
  language?: CodeLanguage
): Map<number, number> {
  const lang = (language ? String(language).toLowerCase() : 'plaintext') as CodeLanguage;
  const regions = new Map<number, number>();

  // Python (and languages without syntax blocks) fold by indentation;
  // bracket languages fold by syntax blocks, matching VSCode.
  const useIndent = lang === 'python' || !BRACKET_LANGS.has(lang);
  if (useIndent) mergeRegions(regions, computeIndentRegions(lines, tabSize));
  if (BRACKET_LANGS.has(lang)) {
    mergeRegions(regions, computeBracketRegions(lines));
    if (JSX_LANGS.has(lang)) mergeRegions(regions, computeJSXRegions(lines));
    if (CASE_LANGS.has(lang)) mergeRegions(regions, computeCaseRegions(lines, tabSize));
  }

  return regions;
}

export interface ViewMapping {
  /** Text lines currently rendered in the editor. */
  viewLines: string[];
  /** Joined view text bound to the textarea value. */
  viewText: string;
  /** view line index -> model line index */
  viewToModel: number[];
  /** model line index -> view line index (or -1 when hidden) */
  modelToView: number[];
  /** char offset at which each view line starts */
  viewLineStarts: number[];
  /** char offset at which each model line starts */
  modelLineStarts: number[];
}

/** Builds the model <-> view line mapping for the given collapsed headers. */
export function buildViewMapping(
  modelLines: string[],
  collapsed: Set<number>,
  regions: Map<number, number>
): ViewMapping {
  const hidden = new Set<number>();
  collapsed.forEach((start) => {
    const end = regions.get(start);
    if (end !== undefined) {
      for (let k = start + 1; k <= end; k++) hidden.add(k);
    }
  });

  const viewToModel: number[] = [];
  const modelToView: number[] = new Array(modelLines.length).fill(-1);
  for (let i = 0; i < modelLines.length; i++) {
    if (hidden.has(i)) continue;
    modelToView[i] = viewToModel.length;
    viewToModel.push(i);
  }

  const viewLines = viewToModel.map((mi) => modelLines[mi]);
  const viewText = viewLines.join('\n');

  const viewLineStarts: number[] = [];
  let acc = 0;
  for (const line of viewLines) {
    viewLineStarts.push(acc);
    acc += line.length + 1;
  }

  const modelLineStarts: number[] = [];
  acc = 0;
  for (const line of modelLines) {
    modelLineStarts.push(acc);
    acc += line.length + 1;
  }

  return { viewLines, viewText, viewToModel, modelToView, viewLineStarts, modelLineStarts };
}

/** Greatest index `i` such that `starts[i] <= offset`, clamped to `[0, len-1]`. */
export function offsetToLineIndex(starts: number[], offset: number): number {
  if (starts.length === 0) return 0;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Maps a caret offset in the view text to the equivalent model offset. */
export function viewOffsetToModelOffset(
  offset: number,
  mapping: ViewMapping,
  modelLines: string[]
): number {
  const { viewLines, viewLineStarts, viewToModel, modelLineStarts } = mapping;
  if (viewLines.length === 0) return 0;

  const clamped = Math.max(0, Math.min(offset, mapping.viewText.length));
  const vl = offsetToLineIndex(viewLineStarts, clamped);
  const ml = viewToModel[vl];
  if (ml === undefined || ml >= modelLines.length) {
    const last = modelLines.length - 1;
    return last >= 0 ? modelLineStarts[last] + modelLines[last].length : 0;
  }
  const col = clamped - viewLineStarts[vl];
  return modelLineStarts[ml] + Math.min(col, modelLines[ml].length);
}

/** Maps a model offset to the equivalent caret offset in the view text. */
export function modelOffsetToViewOffset(
  offset: number,
  mapping: ViewMapping,
  modelLines: string[]
): number {
  const { viewLineStarts, modelToView, modelLineStarts } = mapping;
  if (modelLines.length === 0) return 0;

  const total = modelLineStarts[modelLines.length - 1] + modelLines[modelLines.length - 1].length;
  const clamped = Math.max(0, Math.min(offset, total));
  const ml = offsetToLineIndex(modelLineStarts, clamped);
  const vl = modelToView[ml];
  if (vl >= 0) {
    const col = clamped - modelLineStarts[ml];
    return viewLineStarts[vl] + Math.min(col, modelLines[ml].length);
  }
  // Hidden line -> snap to the start of the next visible line (or end of view).
  for (let j = ml + 1; j < modelToView.length; j++) {
    if (modelToView[j] >= 0) return viewLineStarts[modelToView[j]];
  }
  return mapping.viewText.length;
}