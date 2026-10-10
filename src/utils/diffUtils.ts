export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface SplitDiffRow {
  left?: { lineNumber?: number; content: string; type: 'removed' | 'unchanged' | 'empty' };
  right?: { lineNumber?: number; content: string; type: 'added' | 'unchanged' | 'empty' };
}

export interface DiffResult {
  unifiedLines: DiffLine[];
  splitRows: SplitDiffRow[];
  addedCount: number;
  removedCount: number;
  modified: boolean;
}

export function computeLineDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  if (oldText === newText) {
    const unifiedLines: DiffLine[] = oldLines.map((content, idx) => ({
      type: 'unchanged',
      oldLineNumber: idx + 1,
      newLineNumber: idx + 1,
      content
    }));
    const splitRows: SplitDiffRow[] = oldLines.map((content, idx) => ({
      left: { lineNumber: idx + 1, content, type: 'unchanged' },
      right: { lineNumber: idx + 1, content, type: 'unchanged' }
    }));
    return {
      unifiedLines,
      splitRows,
      addedCount: 0,
      removedCount: 0,
      modified: false
    };
  }

  const n = oldLines.length;
  const m = newLines.length;

  // Protect against huge files for browser responsiveness
  const MAX_LINES = 1200;
  if (n > MAX_LINES || m > MAX_LINES) {
    const unifiedLines: DiffLine[] = [
      ...oldLines.slice(0, 100).map((l, i) => ({ type: 'removed' as const, oldLineNumber: i + 1, content: l })),
      ...newLines.slice(0, 100).map((l, i) => ({ type: 'added' as const, newLineNumber: i + 1, content: l }))
    ];
    return {
      unifiedLines,
      splitRows: [],
      addedCount: m,
      removedCount: n,
      modified: true
    };
  }

  // LCS Matrix
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  const rawDiff: Array<{ type: 'added' | 'removed' | 'unchanged'; oldIdx?: number; newIdx?: number; content: string }> = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      rawDiff.push({
        type: 'unchanged',
        oldIdx: i,
        newIdx: j,
        content: oldLines[i - 1]
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiff.push({
        type: 'added',
        newIdx: j,
        content: newLines[j - 1]
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawDiff.push({
        type: 'removed',
        oldIdx: i,
        content: oldLines[i - 1]
      });
      i--;
    }
  }

  rawDiff.reverse();

  let addedCount = 0;
  let removedCount = 0;

  const unifiedLines: DiffLine[] = rawDiff.map((item) => {
    if (item.type === 'added') addedCount++;
    if (item.type === 'removed') removedCount++;
    return {
      type: item.type,
      oldLineNumber: item.oldIdx,
      newLineNumber: item.newIdx,
      content: item.content
    };
  });

  // Construct Split Diff Rows
  const splitRows: SplitDiffRow[] = [];
  let idx = 0;

  while (idx < rawDiff.length) {
    const item = rawDiff[idx];

    if (item.type === 'unchanged') {
      splitRows.push({
        left: { lineNumber: item.oldIdx, content: item.content, type: 'unchanged' },
        right: { lineNumber: item.newIdx, content: item.content, type: 'unchanged' }
      });
      idx++;
    } else {
      // Gather consecutive removals and additions
      const removedBlock: Array<{ idx: number; content: string }> = [];
      const addedBlock: Array<{ idx: number; content: string }> = [];

      while (idx < rawDiff.length && rawDiff[idx].type !== 'unchanged') {
        if (rawDiff[idx].type === 'removed') {
          removedBlock.push({ idx: rawDiff[idx].oldIdx!, content: rawDiff[idx].content });
        } else if (rawDiff[idx].type === 'added') {
          addedBlock.push({ idx: rawDiff[idx].newIdx!, content: rawDiff[idx].content });
        }
        idx++;
      }

      const maxLen = Math.max(removedBlock.length, addedBlock.length);
      for (let k = 0; k < maxLen; k++) {
        const rem = removedBlock[k];
        const add = addedBlock[k];

        splitRows.push({
          left: rem
            ? { lineNumber: rem.idx, content: rem.content, type: 'removed' }
            : { content: '', type: 'empty' },
          right: add
            ? { lineNumber: add.idx, content: add.content, type: 'added' }
            : { content: '', type: 'empty' }
        });
      }
    }
  }

  return {
    unifiedLines,
    splitRows,
    addedCount,
    removedCount,
    modified: addedCount > 0 || removedCount > 0
  };
}
