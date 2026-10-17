/**
 * Code folding helpers.
 *
 * Folding is implemented as a pure *view* transform over the model lines:
 *   model lines -> (collapsed set) -> view lines
 *
 * The editor keeps the textarea bound to the view text, and edits are mapped
 * back to model offsets through `viewOffsetToModelOffset`.
 */

/** Indentation (in columns) of a line, expanding tabs to `tabSize`. */
function indentOf(line: string, tabSize: number): number {
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
 * Finds foldable regions using indentation blocks.
 * Returns a map of `headerLineIndex -> endLineIndex (inclusive)`.
 */
export function computeFoldRegions(lines: string[], tabSize: number = 2): Map<number, number> {
  const regions = new Map<number, number>();

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const base = indentOf(lines[i], tabSize);
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue; // blank lines never terminate a block
      if (indentOf(lines[j], tabSize) > base) end = j;
      else break;
    }
    if (end > i) regions.set(i, end);
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
