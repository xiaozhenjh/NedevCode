import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CodeLanguage } from '../types';
import { SearchMode, splitBySearchMatch } from './searchUtils';
import { languageRegistry, Token } from '../languages';

export type { Token };

export function tokenizeCode(code: string, language: string): Token[] {
  return languageRegistry.tokenize(code, language);
}

export const SyntaxHighlightedLine: React.FC<{
  code: string;
  language: CodeLanguage;
  searchQuery?: string;
  searchMode?: SearchMode;
  caseSensitive?: boolean;
  isDark?: boolean;
  showLineNumbers?: boolean;
  startLineNumber?: number;
  /** Explicit line numbers for each rendered line (overrides startLineNumber). */
  lineNumbers?: number[];
  /** Index (within the rendered slice) of the active/current line to highlight. */
  activeLineIndex?: number;
  /** Render an inline fold toggle before the line number (used with word wrap). */
  foldGutter?: boolean;
  /** Per rendered line: whether the line is a foldable block header. */
  foldableLines?: boolean[];
  /** Per rendered line: whether the line's block is currently collapsed. */
  collapsedLines?: boolean[];
  /** Called with the rendered line index when a fold toggle is clicked. */
  onToggleFold?: (index: number) => void;
  /** Per rendered line: indent guide columns (1-based, tab-expanded, in chars). */
  indentGuides?: number[][];
  /** Width (px) of one monospace character. */
  guideCharWidth?: number;
  /** x-offset (px) of the text start inside each line div (gutter + line numbers). */
  guideTextOffset?: number;
  /** Column (in chars) whose guide should render highlighted (current block). */
  activeGuideCol?: number | null;
}> = ({
  code,
  language,
  searchQuery,
  searchMode = 'normal',
  caseSensitive = false,
  isDark = false,
  showLineNumbers = false,
  startLineNumber = 1,
  lineNumbers,
  activeLineIndex,
  foldGutter = false,
  foldableLines,
  collapsedLines,
  onToggleFold,
  indentGuides,
  guideCharWidth,
  guideTextOffset = 0,
  activeGuideCol
}) => {
  const tokens = tokenizeCode(code, language);

  /**
   * Builds a `background-image` value with one 1px vertical guide per indent
   * column. The active column (or the whole active line) uses the highlighted
   * color, mirroring VSCode's "active indent guide".
   */
  const buildLineGuideBackground = (
    cols: number[] | undefined,
    isActive: boolean,
    textOffset: number,
    charWidth: number
  ): string | undefined => {
    if (!cols || cols.length === 0) return undefined;
    const parts: string[] = [];
    for (const col of cols) {
      const x = textOffset + col * charWidth - 1;
      const color = isActive || col === activeGuideCol
        ? 'var(--indent-guide-active)'
        : 'var(--indent-guide)';
      parts.push(
        `linear-gradient(90deg, transparent ${x - 0.5}px, ${color} ${x - 0.5}px, ${color} ${x + 0.5}px, transparent ${x + 0.5}px)`
      );
    }
    return parts.join(', ');
  };

  const lines: { tokens: React.ReactNode[]; id: string }[] = [];
  let currentLineTokens: React.ReactNode[] = [];

  const getColorClass = (type: Token['type']): string => {
    if (isDark) {
      // VS Code Dark Standard Colors
      switch (type) {
        case 'keyword': return 'text-[#569cd6]';
        case 'tag': return 'text-[#569cd6]';
        case 'string': return 'text-[#ce9178]';
        case 'number': return 'text-[#b5cea8]';
        case 'comment': return 'text-[#6a9955]';
        case 'function': return 'text-[#dcdcaa]';
        case 'attr': return 'text-[#9cdcfe]';
        case 'operator': return 'text-[#d4d4d4]';
        case 'punctuation': return 'text-[#d4d4d4]';
        default: return 'text-[#d4d4d4]';
      }
    } else {
      // VS Code Light Standard Colors
      switch (type) {
        case 'keyword': return 'text-[#0000ff]';
        case 'tag': return 'text-[#800000]';
        case 'string': return 'text-[#a31515]';
        case 'number': return 'text-[#098658]';
        case 'comment': return 'text-[#008000]';
        case 'function': return 'text-[#795e26]';
        case 'attr': return 'text-[#ff0000]';
        case 'operator': return 'text-[#000000]';
        case 'punctuation': return 'text-[#000000]';
        default: return 'text-[#000000]';
      }
    }
  };

  tokens.forEach((token, tIdx) => {
    const parts = token.content.split('\n');
    parts.forEach((part, pIdx) => {
      if (pIdx > 0) {
        lines.push({ tokens: currentLineTokens, id: `line-${lines.length}` });
        currentLineTokens = [];
      }
      
      if (part) {
        let content: React.ReactNode = part;
        if (searchQuery && searchQuery.trim()) {
          const matchSegments = splitBySearchMatch(part, searchQuery, searchMode, caseSensitive);
          content = matchSegments.map((seg, sIdx) => 
            seg.isMatch ? (
              <mark key={sIdx} className="bg-[#ed6f21] text-white px-0.5 rounded">
                {seg.text}
              </mark>
            ) : (
              seg.text
            )
          );
        }

        currentLineTokens.push(
          <span key={`${tIdx}-${pIdx}`} className={getColorClass(token.type)}>
            {content}
          </span>
        );
      }
    });
  });
  
  if (currentLineTokens.length > 0 || lines.length === 0 || code.endsWith('\n')) {
    lines.push({ tokens: currentLineTokens, id: `line-${lines.length}` });
  }

  return (
    <>
      {lines.map((line, i) => {
        const isActive = activeLineIndex !== undefined && i === activeLineIndex;
        const lineNumber = lineNumbers ? lineNumbers[i] : startLineNumber + i;
        const isFoldable = foldGutter && !!foldableLines?.[i];
        const isCollapsed = foldGutter && !!collapsedLines?.[i];
        const guideBackground =
          indentGuides && guideCharWidth
            ? buildLineGuideBackground(indentGuides[i], isActive, guideTextOffset, guideCharWidth)
            : undefined;
        return (
          <div
            key={line.id}
            className={`flex ${isActive ? 'bg-[var(--brand-subtle)]' : ''}`}
            style={guideBackground ? { backgroundImage: guideBackground, backgroundRepeat: 'no-repeat' } : undefined}
          >
            {foldGutter &&
              (isFoldable ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onToggleFold?.(i)}
                  title={isCollapsed ? '展开' : '折叠'}
                  className={`pointer-events-auto shrink-0 w-3.5 h-3.5 mr-0.5 flex items-center justify-center rounded press-feedback ${
                    isCollapsed ? 'text-[var(--brand)]' : 'text-[var(--text-tertiary)]'
                  }`}
                >
                  {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              ) : (
                <span className="shrink-0 w-3.5 mr-0.5" />
              ))}
            {showLineNumbers && (
              <div
                className="shrink-0 text-right pr-2 text-[var(--text-tertiary)] select-none opacity-50 font-mono-code text-[12px] w-10"
                style={{ userSelect: 'none' }}
              >
                {lineNumber}
              </div>
            )}
            <div className="flex-1">
              {line.tokens.length > 0 ? line.tokens : <span className="invisible"> </span>}
            </div>
          </div>
        );
      })}
    </>
  );
};
