import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Undo, Redo, Sparkles, Play, Search, Replace, Plus, Trash2,
  FileCode, Check, ArrowRight, CornerDownLeft, GitBranch, Zap, Loader2,
  Maximize2, Minimize2, X, MoreHorizontal, ArrowDown, FileDiff, Columns, Rows, RotateCcw, ChevronDown, ChevronRight,
  Image as ImageIcon, Film, Eye, Code
} from 'lucide-react';
import { CodeLanguage, CodeProject, EditorSettings, ProjectFile, ExecutionType } from '../types';
import { languageRegistry } from '../languages';
import { detectLanguage, getFileSizeBytes, formatFileSize, isLargeFile, LARGE_FILE_CHUNK_SIZE, isImageFile, isVideoFile, isMediaFile, isSvgFile, resolveNewFileName, getDefaultImageContent } from '../utils/fileUtils';
import { formatCode } from '../utils/codeRunner';
import {
  formatCodeAsync,
  handleEnterAutoIndent,
  handleTabAutoIndent,
  handleBackspaceAutoIndent
} from '../utils/autoIndentEngine';
import { SyntaxHighlightedLine } from '../utils/syntaxHighlight';
import {
  buildViewMapping,
  computeFoldRegions,
  indentGuideColumns,
  modelOffsetToViewOffset,
  offsetToLineIndex,
  viewOffsetToModelOffset
} from '../utils/foldUtils';
import { SearchMode, buildSearchRegex, isValidRegex } from '../utils/searchUtils';
import { SearchModeDropdown } from './SearchModeDropdown';
import { PlaygroundLanguageDropdown } from './PlaygroundLanguageDropdown';
import { SuggestionItem, getSuggestionsForWord } from '../utils/suggestionEngine';
import { computeLineDiff } from '../utils/diffUtils';
import { PropertiesModal } from './PropertiesModal';
import { FileTransferModal, TransferMode } from './FileTransferModal';
import { MediaViewer } from './MediaViewer';
import { CustomSelect } from './CustomSelect';
import { IDB_PLACEHOLDER_MARKER } from '../services/storage';

const EMPTY_FOLD_SET: Set<number> = new Set();

// VSCode-style sticky scroll constants
const STICKY_BAR_HEIGHT = 26;
const STICKY_MAX_VISIBLE = 5;
// A block header only attaches once its real code line has scrolled up to the
// sticky position (the content top edge, i.e. above the 12px top padding).
// It detaches and follows the content down when it scrolls back past that line.
const STICKY_ATTACH_Y = 12;

// Fall back to a minimal map for pathological files (region detection is linear,
// so this is only a safety net against truly extreme documents).
const MAX_FOLD_LINES = 100000;

/** easeOutCubic — shared by the smooth jump animation and its interruption check. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Shared-element style sticky animations. The bar follows the scroll direction;
// each item is a flying duplicate of its real code line: it slides up from the
// line's actual Y offset into the bar on attach (enter) and slides back down to
// the same offset on release (exit). No opacity is animated — pure Y flight.
const stickyBarVariants = {
  enter: (dir: number) => ({ y: dir * 10 }),
  center: { y: 0 },
  exit: (dir: number) => ({ y: -dir * 10 })
};

const stickyItemVariants = {
  // fly is the real on-screen Y of the header line: enter flies up from that
  // spot into the bar (clamped so a header already above the viewport simply
  // appears), exit flies back down to the line's current position on release.
  enter: (fly: number) => ({ y: Math.max(fly, 0) }),
  center: { y: 0 },
  exit: (fly: number) => ({ y: Math.max(fly, 0) })
};

interface CodeEditorProps {
  project: CodeProject;
  settings: EditorSettings;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onUpdateFileContent: (fileId: string, newContent: string) => void;
  onSelectFile: (fileId: string) => void;
  onAddNewFile: (name: string, language: CodeLanguage, initialContent?: string) => void;
  onDeleteFile: (fileId: string) => void;
  onRenameFile?: (fileId: string, newName: string) => void;
  onMoveFile?: (fileId: string, newPath: string) => void;
  onCopyFile?: (fileId: string, targetPath?: string) => void;
  onUpdateFileEncoding?: (fileId: string, encoding: string) => void;
  onSetEntryFile?: (fileId: string) => void;
  onDownloadFile?: (fileId: string) => void;
  onOpenGitPush?: () => void;
  onOpenLangSelect?: () => void;
  onSelectPlaygroundLanguage?: (lang: CodeLanguage, executionType: ExecutionType) => void;
  onRunCode: () => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  project,
  settings,
  isFullscreen,
  onToggleFullscreen,
  onUpdateFileContent,
  onSelectFile,
  onAddNewFile,
  onDeleteFile,
  onRenameFile,
  onMoveFile,
  onCopyFile,
  onUpdateFileEncoding,
  onSetEntryFile,
  onDownloadFile,
  onOpenGitPush,
  onOpenLangSelect,
  onSelectPlaygroundLanguage,
  onRunCode
}) => {
  const [internalIsFullscreen, setInternalIsFullscreen] = useState(false);
  const isFS = isFullscreen !== undefined ? isFullscreen : internalIsFullscreen;
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [movingFile, setMovingFile] = useState<ProjectFile | null>(null);
  const [transferMode, setTransferMode] = useState<TransferMode>('move');

  const handleToggleFS = useCallback(() => {
    if (onToggleFullscreen) {
      onToggleFullscreen();
    } else {
      setInternalIsFullscreen(prev => !prev);
    }
  }, [onToggleFullscreen]);

  // Press Esc to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFS) {
        handleToggleFS();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFS, handleToggleFS]);

  const activeFile = project.files.find(f => f.id === project.activeFileId) || project.files[0];
  const isImage = activeFile ? isImageFile(activeFile.name, activeFile.content) : false;
  const isVideo = activeFile ? isVideoFile(activeFile.name, activeFile.content) : false;
  const isSvg = activeFile ? isSvgFile(activeFile.name) : false;
  const [svgCodeMode, setSvgCodeMode] = useState(false);
  const isMediaActive = (isImage || isVideo) && !(isSvg && svgCodeMode);

  useEffect(() => {
    setSvgCodeMode(false);
  }, [activeFile?.id]);

  const rawContent = activeFile?.content || '';
  const rawLines = useMemo(() => rawContent.split('\n'), [rawContent]);
  const isLarge = isLargeFile(rawContent, rawLines.length);

  const [loadedLineCount, setLoadedLineCount] = useState<number>(() => {
    return isLarge ? Math.min(LARGE_FILE_CHUNK_SIZE, rawLines.length) : rawLines.length;
  });

  const [content, setContent] = useState(() => {
    if (isLarge) {
      return rawLines.slice(0, Math.min(LARGE_FILE_CHUNK_SIZE, rawLines.length)).join('\n');
    }
    return rawContent;
  });

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [history, setHistory] = useState<string[]>([content]);
  const [historyIdx, setHistoryIdx] = useState(0);

  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('normal');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);

  // Diff viewer states
  const [showDiffMode, setShowDiffMode] = useState(false);
  const [diffBaselineSource, setDiffBaselineSource] = useState<string>('initial');
  const [diffLayout, setDiffLayout] = useState<'split' | 'inline'>('split');
  const initialContentMapRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (activeFile && initialContentMapRef.current[activeFile.id] === undefined) {
      initialContentMapRef.current[activeFile.id] = activeFile.content;
    }
  }, [activeFile?.id, activeFile?.content]);

  const baselineContent = useMemo(() => {
    if (diffBaselineSource === 'initial') {
      return initialContentMapRef.current[activeFile?.id || ''] ?? activeFile?.content ?? '';
    }
    const target = project.files.find(f => f.id === diffBaselineSource);
    return target ? target.content : (initialContentMapRef.current[activeFile?.id || ''] ?? '');
  }, [diffBaselineSource, activeFile, project.files]);

  const diffResult = useMemo(() => {
    if (!showDiffMode) return null;
    return computeLineDiff(baselineContent, content);
  }, [showDiffMode, baselineContent, content]);

  // Auto-suggestion engine states
  const [activeSuggestions, setActiveSuggestions] = useState<SuggestionItem[]>([]);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number>(0);
  const [prefixRange, setPrefixRange] = useState<{ start: number; end: number; prefix: string }>({ start: 0, end: 0, prefix: '' });

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [findText, searchMode, caseSensitive]);

  const { matchCount, isRegexValid } = useMemo(() => {
    if (!findText.trim()) return { matchCount: 0, isRegexValid: true };
    if (searchMode === 'regex' && !isValidRegex(findText)) {
      return { matchCount: 0, isRegexValid: false };
    }
    const regex = buildSearchRegex(findText, searchMode, caseSensitive, true);
    if (!regex) return { matchCount: 0, isRegexValid: true };
    const matches = (content || '').match(regex);
    return { matchCount: matches ? matches.length : 0, isRegexValid: true };
  }, [findText, searchMode, caseSensitive, content]);

  const [scrollTop, setScrollTop] = useState(0);
  const [editorHeight, setEditorHeight] = useState(600);

  // VSCode-style sticky scroll UI states
  const [stickyHover, setStickyHover] = useState<{ start: number; end: number; label: string } | null>(null);
  const [stickyMenu, setStickyMenu] = useState<{ x: number; y: number; start: number; end: number; label: string } | null>(null);
  const [stickyExpanded, setStickyExpanded] = useState(false);
  const [stickyCopied, setStickyCopied] = useState<'path' | 'code' | null>(null);
  const prevScrollTopRef = useRef(0);
  const stickyDirRef = useRef<1 | -1>(1);
  const expandedAnchorRef = useRef<number | null>(null);
  const smoothScrollRef = useRef<{
    raf: number;
    from: number;
    delta: number;
    start: number;
    duration: number;
    cancelled: boolean;
    lastValue: number;
  } | null>(null);

  // Respect prefers-reduced-motion for sticky enter/exit & ellipsis animations
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    setPrefersReducedMotion(mq.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  // Track scroll direction for the shared-element style sticky animation
  useEffect(() => {
    if (scrollTop > prevScrollTopRef.current) stickyDirRef.current = 1;
    else if (scrollTop < prevScrollTopRef.current) stickyDirRef.current = -1;
    prevScrollTopRef.current = scrollTop;
  }, [scrollTop]);

  // Code folding + active line tracking
  const [collapsedFolds, setCollapsedFolds] = useState<Set<number>>(new Set());
  const [cursorViewLine, setCursorViewLine] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const pendingModelSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const editorBodyRef = useRef<HTMLDivElement>(null);
  // Sticky overlay root. It covers the first text row, so its hit testing is
  // suspended momentarily while probing the top-of-viewport caret.
  const stickyOverlayRef = useRef<HTMLDivElement | null>(null);

  const isFullyLoaded = loadedLineCount >= rawLines.length;

  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    if (settings.theme === 'dark') return true;
    if (settings.theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (settings.theme === 'dark') setIsDarkTheme(true);
    else if (settings.theme === 'light') setIsDarkTheme(false);
    else {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => setIsDarkTheme(e.matches);
      setIsDarkTheme(mediaQuery.matches);
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [settings.theme]);

  // Monitor editor body dimensions for virtualization
  useEffect(() => {
    if (!editorBodyRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setEditorHeight(entry.contentRect.height);
        }
      }
    });
    observer.observe(editorBodyRef.current);
    return () => observer.disconnect();
  }, []);

  // Restore cursor position after content update
  React.useLayoutEffect(() => {
    if (textareaRef.current && selectionRef.current) {
      const { start, end } = selectionRef.current;
      textareaRef.current.setSelectionRange(start, end);
      selectionRef.current = null;
    }
  }, [content]);

  // Sync state on file switch or project switch
  useEffect(() => {
    if (activeFile) {
      const linesArr = activeFile.content.split('\n');
      const fileIsLarge = isLargeFile(activeFile.content, linesArr.length);
      const initialLoaded = fileIsLarge ? Math.min(LARGE_FILE_CHUNK_SIZE, linesArr.length) : linesArr.length;
      
      setLoadedLineCount(initialLoaded);

      const initialSlice = fileIsLarge 
        ? linesArr.slice(0, initialLoaded).join('\n') 
        : activeFile.content;

      setContent(initialSlice);
      setHistory([initialSlice]);
      setHistoryIdx(0);
      setScrollTop(0);
      setCollapsedFolds(new Set());
      setCursorViewLine(0);

      if (textareaRef.current) {
        textareaRef.current.scrollTop = 0;
        textareaRef.current.scrollLeft = 0;
      }
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = 0;
      }
      if (highlightRef.current) {
        highlightRef.current.scrollTop = 0;
        highlightRef.current.scrollLeft = 0;
      }
    }
  }, [project.id, activeFile?.id]);

  // Sync content when IndexedDB finishes loading real content replacing [IDB_STORED]
  useEffect(() => {
    if (activeFile && content === IDB_PLACEHOLDER_MARKER && activeFile.content !== IDB_PLACEHOLDER_MARKER) {
      const linesArr = activeFile.content.split('\n');
      const fileIsLarge = isLargeFile(activeFile.content, linesArr.length);
      const initialLoaded = fileIsLarge ? Math.min(LARGE_FILE_CHUNK_SIZE, linesArr.length) : linesArr.length;
      setLoadedLineCount(initialLoaded);
      const initialSlice = fileIsLarge ? linesArr.slice(0, initialLoaded).join('\n') : activeFile.content;
      setContent(initialSlice);
      setHistory([initialSlice]);
      setHistoryIdx(0);
    }
  }, [activeFile?.content, content]);

  // Lazy loading next chunk
  const handleLoadMore = useCallback((count = LARGE_FILE_CHUNK_SIZE) => {
    if (loadedLineCount >= rawLines.length || isLoadingMore) return;
    setIsLoadingMore(true);

    const nextCount = Math.min(rawLines.length, loadedLineCount + count);
    setLoadedLineCount(nextCount);

    const nextSlice = rawLines.slice(0, nextCount).join('\n');
    setContent(nextSlice);

    setTimeout(() => {
      setIsLoadingMore(false);
    }, 120);
  }, [loadedLineCount, rawLines, isLoadingMore]);

  // Load entire file content at once
  const handleLoadAll = useCallback(() => {
    setLoadedLineCount(rawLines.length);
    setContent(rawContent);
  }, [rawLines.length, rawContent]);

  // Handle textarea text change
  const handleChange = (newVal: string) => {
    setContent(newVal);

    if (activeFile) {
      if (isLarge && !isFullyLoaded) {
        // Retain un-loaded tail lines
        const remaining = rawLines.slice(loadedLineCount).join('\n');
        const fullContent = remaining ? `${newVal}\n${remaining}` : newVal;
        onUpdateFileContent(activeFile.id, fullContent);
      } else {
        onUpdateFileContent(activeFile.id, newVal);
      }
    }

    // Push history
    const nextHist = history.slice(0, historyIdx + 1);
    nextHist.push(newVal);
    if (nextHist.length > 50) nextHist.shift();
    setHistory(nextHist);
    setHistoryIdx(nextHist.length - 1);
  };

  // Suggestion engine calculation
  const updateSuggestions = useCallback((text: string, pos: number) => {
    if (pos <= 0 || !text) {
      setActiveSuggestions([]);
      return;
    }
    const beforeCursor = text.slice(0, pos);
    const match = /[a-zA-Z0-9_$-]+$/.exec(beforeCursor);
    if (!match) {
      setActiveSuggestions([]);
      return;
    }
    const prefix = match[0];
    const start = pos - prefix.length;
    setPrefixRange({ start, end: pos, prefix });

    if (prefix.length >= 1) {
      const list = getSuggestionsForWord(
        prefix,
        activeFile?.language || 'javascript',
        text,
        project.files
      );
      setActiveSuggestions(list);
      setSelectedSuggestionIdx(0);
    } else {
      setActiveSuggestions([]);
    }
  }, [activeFile?.language, project.files]);

  const applySuggestion = useCallback((item: SuggestionItem) => {
    if (!textareaRef.current) return;
    const { start, end } = prefixRange;
    const insertText = item.insertText || item.label;

    const before = content.substring(0, start);
    const after = content.substring(end);
    const newContent = before + insertText + after;

    handleChange(newContent);
    setActiveSuggestions([]);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        let newPos = start + insertText.length;
        if (insertText.endsWith('();') || insertText.endsWith('()')) {
          newPos = start + insertText.length - (insertText.endsWith('();') ? 2 : 1);
        } else if (insertText.includes('\n  \n')) {
          newPos = start + insertText.indexOf('\n  \n') + 3;
        }
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  }, [content, prefixRange, handleChange]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const target = e.target;
    const newVal = target.value;

    if (foldedMode) {
      // Folded view: map the edit (which happened in view space) back onto the model.
      const oldView = viewText;
      let a = 0;
      const maxA = Math.min(oldView.length, newVal.length);
      while (a < maxA && oldView[a] === newVal[a]) a++;
      let b = 0;
      while (b < maxA - a && oldView[oldView.length - 1 - b] === newVal[newVal.length - 1 - b]) b++;

      const modelA = viewOffsetToModelOffset(a, viewMapping, modelLines);
      const modelB = viewOffsetToModelOffset(oldView.length - b, viewMapping, modelLines);

      // A deletion that spans a collapsed block would silently drop the hidden lines.
      // In that case just expand and let the user see what they are editing.
      const startLine = offsetToLineIndex(viewMapping.modelLineStarts, modelA);
      const endLine = offsetToLineIndex(viewMapping.modelLineStarts, modelB);
      let crossesHidden = false;
      for (let i = startLine + 1; i <= endLine; i++) {
        if (viewMapping.modelToView[i] === -1) {
          crossesHidden = true;
          break;
        }
      }
      if (crossesHidden) {
        pendingModelSelectionRef.current = { start: modelB, end: modelB };
        setCollapsedFolds(new Set());
        return;
      }

      const inserted = newVal.substring(a, newVal.length - b);
      const removed = content.substring(modelA, modelB);
      const newModel = content.substring(0, modelA) + inserted + content.substring(modelB);

      // Keep fold headers pointing at the right lines; expand any fold being edited.
      const editedLine = offsetToLineIndex(viewMapping.modelLineStarts, modelA);
      const delta =
        inserted.split('\n').length - 1 - (removed.split('\n').length - 1);
      setCollapsedFolds((prev) => {
        const next = new Set<number>();
        prev.forEach((c) => {
          if (c < editedLine) next.add(c);
          else if (c > editedLine) next.add(c + delta);
          // c === editedLine -> auto expand
        });
        return next;
      });

      const caret = a + inserted.length;
      selectionRef.current = { start: caret, end: caret };
      handleChange(newModel);
      syncCursorLine(newVal, caret);
      return;
    }

    const { selectionStart, selectionEnd } = target;
    // Save cursor position for restoration after state sync
    selectionRef.current = { start: selectionStart, end: selectionEnd };

    handleChange(newVal);
    updateSuggestions(newVal, selectionEnd);
    syncCursorLine(newVal, selectionEnd);
  };

  const handleTextareaCursorMove = () => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionEnd;
    syncCursorLine(viewText, pos);
    if (foldedMode) {
      setActiveSuggestions([]);
      return;
    }
    updateSuggestions(content, pos);
  };

  const [isFormatting, setIsFormatting] = useState(false);

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Folded view: keep native typing / Enter / Backspace (onChange remaps them back),
    // but Tab must not move focus out of the editor.
    if (foldedMode) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const el = e.currentTarget;
        const size = settings.tabSize || 2;
        const spaces = ' '.repeat(size);
        const modelA = viewOffsetToModelOffset(el.selectionStart, viewMapping, modelLines);
        const modelB = viewOffsetToModelOffset(el.selectionEnd, viewMapping, modelLines);
        const newModel = content.substring(0, modelA) + spaces + content.substring(modelB);
        const caret = el.selectionStart + size;
        selectionRef.current = { start: caret, end: caret };
        handleChange(newModel);
        syncCursorLine(viewText, caret);
      }
      return;
    }

    // 1. Suggestions priority
    if (activeSuggestions.length > 0) {
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        applySuggestion(activeSuggestions[selectedSuggestionIdx]);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIdx((prev) => (prev + 1) % activeSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIdx((prev) => (prev - 1 + activeSuggestions.length) % activeSuggestions.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setActiveSuggestions([]);
        return;
      }
    }

    const isAutoIndentEnabled = settings.autoIndent !== false;
    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const tabSize = settings.tabSize || 2;
    const lang = activeFile?.language || 'javascript';

    // 2. Tab / Shift+Tab Smart Indent & Outdent
    if (e.key === 'Tab') {
      e.preventDefault();
      const res = handleTabAutoIndent(content, start, end, e.shiftKey, tabSize);
      if (res.handled) {
        handleChange(res.newContent);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(res.newCursorStart, res.newCursorEnd);
          }
        }, 0);
      }
      return;
    }

    // 3. Enter Smart Auto-Indent
    if (e.key === 'Enter' && isAutoIndentEnabled && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const res = handleEnterAutoIndent(content, start, end, lang, tabSize);
      if (res.handled) {
        handleChange(res.newContent);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(res.newCursorStart, res.newCursorEnd);
          }
        }, 0);
      }
      return;
    }

    // 4. Backspace Smart Tab Width Deletion
    if (e.key === 'Backspace' && isAutoIndentEnabled && start === end) {
      const res = handleBackspaceAutoIndent(content, start, end, tabSize);
      if (res.handled) {
        e.preventDefault();
        handleChange(res.newContent);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(res.newCursorStart, res.newCursorEnd);
          }
        }, 0);
        return;
      }
    }

    // 5. Re-format Shortcut (Alt + Shift + F or Ctrl + Shift + I / Cmd + Shift + I)
    if (
      (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i'))
    ) {
      e.preventDefault();
      handleFormat();
      return;
    }
  };

  // Undo / Redo
  const handleUndo = () => {
    expandAllFolds();
    if (historyIdx > 0 && activeFile) {
      const targetVal = history[historyIdx - 1];
      setHistoryIdx(historyIdx - 1);
      setContent(targetVal);
      if (isLarge && !isFullyLoaded) {
        const remaining = rawLines.slice(loadedLineCount).join('\n');
        const fullContent = remaining ? `${targetVal}\n${remaining}` : targetVal;
        onUpdateFileContent(activeFile.id, fullContent);
      } else {
        onUpdateFileContent(activeFile.id, targetVal);
      }
    }
  };

  const handleRedo = () => {
    expandAllFolds();
    if (historyIdx < history.length - 1 && activeFile) {
      const targetVal = history[historyIdx + 1];
      setHistoryIdx(historyIdx + 1);
      setContent(targetVal);
      if (isLarge && !isFullyLoaded) {
        const remaining = rawLines.slice(loadedLineCount).join('\n');
        const fullContent = remaining ? `${targetVal}\n${remaining}` : targetVal;
        onUpdateFileContent(activeFile.id, fullContent);
      } else {
        onUpdateFileContent(activeFile.id, targetVal);
      }
    }
  };

  // Insert Quick Symbol at cursor position
  const insertSymbol = (symbol: string) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (foldedMode) {
      const modelA = viewOffsetToModelOffset(start, viewMapping, modelLines);
      const modelB = viewOffsetToModelOffset(end, viewMapping, modelLines);
      const newModel = content.substring(0, modelA) + symbol + content.substring(modelB);
      const caret = start + symbol.length;
      selectionRef.current = { start: caret, end: caret };
      handleChange(newModel);
      syncCursorLine(viewText, caret);
      return;
    }

    const curVal = el.value;
    const nextVal = curVal.substring(0, start) + symbol + curVal.substring(end);
    handleChange(nextVal);

    // Reposition cursor
    setTimeout(() => {
      el.focus();
      const newPos = start + symbol.length;
      el.setSelectionRange(newPos, newPos);
    }, 10);
  };

  // Quick Format & Auto-Indent Code
  const handleFormat = async () => {
    if (!activeFile || isFormatting) return;
    expandAllFolds();
    if (isLarge && !isFullyLoaded) {
      handleLoadAll();
    }
    setIsFormatting(true);
    try {
      const formatted = await formatCodeAsync(content, activeFile.language, settings.tabSize || 2);
      setContent(formatted);
      onUpdateFileContent(activeFile.id, formatted);
    } catch {
      const fallback = formatCode(content, activeFile.language, settings.tabSize || 2);
      setContent(fallback);
      onUpdateFileContent(activeFile.id, fallback);
    } finally {
      setIsFormatting(false);
    }
  };

  // Indent or Outdent with configured Tab Size
  const handleIndent = (outdent = false) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const tabSize = settings.tabSize || 2;

    if (foldedMode) {
      const modelA = viewOffsetToModelOffset(start, viewMapping, modelLines);
      const modelB = viewOffsetToModelOffset(end, viewMapping, modelLines);
      const res = handleTabAutoIndent(content, modelA, modelB, outdent, tabSize);
      if (res.handled) {
        const vs = modelOffsetToViewOffset(res.newCursorStart, viewMapping, modelLines);
        const ve = modelOffsetToViewOffset(res.newCursorEnd, viewMapping, modelLines);
        selectionRef.current = { start: vs, end: ve };
        handleChange(res.newContent);
        syncCursorLine(viewText, vs);
      }
      return;
    }

    const res = handleTabAutoIndent(content, start, end, outdent, tabSize);
    if (res.handled) {
      handleChange(res.newContent);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(res.newCursorStart, res.newCursorEnd);
        }
      }, 0);
    }
  };

  // Find & Replace
  const handleReplaceAll = () => {
    if (!findText || !activeFile) return;
    expandAllFolds();
    if (isLarge && !isFullyLoaded) {
      handleLoadAll();
    }
    const targetSource = (isLarge && !isFullyLoaded) ? rawContent : content;
    const regex = buildSearchRegex(findText, searchMode, caseSensitive, true);
    if (!regex) return;
    const nextVal = targetSource.replace(regex, replaceText);
    setContent(nextVal);
    onUpdateFileContent(activeFile.id, nextVal);
  };

  const handleReplaceOne = () => {
    if (!findText || !activeFile) return;
    expandAllFolds();
    if (isLarge && !isFullyLoaded) {
      handleLoadAll();
    }
    const targetSource = (isLarge && !isFullyLoaded) ? rawContent : content;
    const regex = buildSearchRegex(findText, searchMode, caseSensitive, false);
    if (!regex) return;
    const nextVal = targetSource.replace(regex, replaceText);
    setContent(nextVal);
    onUpdateFileContent(activeFile.id, nextVal);
  };

  // Scroll sync between line numbers, highlight overlay & textarea + bottom detection for lazy load
  const handleScroll = () => {
    if (textareaRef.current) {
      const st = textareaRef.current.scrollTop;
      const sl = textareaRef.current.scrollLeft;

      // Cancel an in-flight smooth sticky jump only when the scroll was made by
      // hand. The jump animation moves the scroll offset itself and therefore
      // fires scroll events too; mistaking those for manual scrolling used to
      // abort the jump right after its first frame.
      const sm = smoothScrollRef.current;
      if (sm) {
        // The jump animation writes the scroll offset itself, so its own scroll
        // events report exactly the value it last wrote. Any other offset means a
        // real manual scroll and should abort the jump.
        if (Math.abs(st - sm.lastValue) > 1) {
          cancelAnimationFrame(sm.raf);
          smoothScrollRef.current = null;
        }
      }

      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = st;
      }
      if (highlightRef.current) {
        highlightRef.current.scrollTop = st;
        highlightRef.current.scrollLeft = sl;
      }
      setScrollTop(st);

      // Auto lazy load when scrolling near bottom
      if (isLarge && !isFullyLoaded && !isLoadingMore) {
        const { scrollHeight, clientHeight } = textareaRef.current;
        if (scrollHeight - (st + clientHeight) < 350) {
          handleLoadMore(LARGE_FILE_CHUNK_SIZE);
        }
      }
    }
  };

  // Find next occurrence in editor
  const handleFindNext = () => {
    if (!findText.trim() || !content || matchCount === 0 || !isRegexValid) return;
    expandAllFolds();
    const regex = buildSearchRegex(findText, searchMode, caseSensitive, true);
    if (!regex) return;

    const matches: { start: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      matches.push({ start: m.index, end: m.index + m[0].length });
      if (!regex.global) break;
    }

    if (matches.length === 0) return;

    const textarea = textareaRef.current;
    const currentCursor = textarea ? textarea.selectionEnd : 0;

    let nextIdx = matches.findIndex((matchItem) => matchItem.start > currentCursor);
    if (nextIdx === -1) {
      nextIdx = 0; // Wrap around
    }

    const targetMatch = matches[nextIdx];
    setCurrentMatchIndex(nextIdx + 1);

    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(targetMatch.start, targetMatch.end);

      const lineIndex = content.substring(0, targetMatch.start).split('\n').length - 1;
      const lineHeightCalc = Math.max(20, Math.floor(settings.fontSize * 1.5));
      const targetScrollTop = Math.max(0, (lineIndex - 4) * lineHeightCalc);
      textarea.scrollTop = targetScrollTop;
      handleScroll();
    }
  };

  // Create new file inside project
  const handleCreateFile = () => {
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    const name = resolveNewFileName(trimmed, project?.files || []);
    const lang = detectLanguage(name);
    const initialContent = isImageFile(name) ? getDefaultImageContent(name) : undefined;

    onAddNewFile(name, lang, initialContent);
    setNewFileName('');
    setShowNewFileInput(false);
  };

  // Mobile quick symbols list
  const isPythonFile = activeFile?.language === 'python' || activeFile?.name.endsWith('.py');
  const quickSymbols = isPythonFile
    ? [
        ':', '(', ')', '[', ']', '=', '#', '"', "'", ',', '.',
        'def ', 'return ', 'if ', 'elif ', 'else:', 'for ', 'in ',
        'print(', 'len(', 'range(', 'True', 'False', 'None', 'import '
      ]
    : [
        '{', '}', '(', ')', '[', ']', '=', ';', ':', '<', '>', '/',
        '$', "'", '"', '+', '-', '*', '.', ',', '!', '=>', 'const ',
        'let ', 'function ', 'return ', 'console.log('
      ];

  const modelLines = useMemo(() => content.split('\n'), [content]);
  const baseLineHeight = Math.max(20, Math.floor(settings.fontSize * 1.5));

  // Measured monospace character width — used to position indent guides.
  const monoCharWidth = useMemo(() => {
    const fallback = Math.max(6, Math.ceil(settings.fontSize * 0.6));
    if (typeof document === 'undefined') return fallback;
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return fallback;
      ctx.font = `${settings.fontSize}px "Fira Code", Menlo, Monaco, Consolas, "Courier New", monospace`;
      return Math.max(6, Math.ceil(ctx.measureText('0').width));
    } catch {
      return fallback;
    }
  }, [settings.fontSize]);

  // Code folding is a pure view transform over the model lines. It works with
  // or without word wrap; the only difference is where the fold toggles render.
  // Region detection is language aware (indent blocks for Python/plain text,
  // syntax blocks for bracket languages) and linear, so it is safe for large
  // files too.
  const foldingEnabled = !!settings.codeFolding;
  const foldRegions = useMemo(
    () =>
      modelLines.length > MAX_FOLD_LINES
        ? new Map<number, number>()
        : computeFoldRegions(modelLines, settings.tabSize || 2, activeFile?.language),
    [modelLines, settings.tabSize, activeFile?.language]
  );
  const viewMapping = useMemo(
    () => buildViewMapping(modelLines, foldingEnabled ? collapsedFolds : EMPTY_FOLD_SET, foldRegions),
    [modelLines, foldingEnabled, collapsedFolds, foldRegions]
  );
  const viewLines = viewMapping.viewLines;
  const viewText = viewMapping.viewText;
  const foldedMode = foldingEnabled && viewLines.length < modelLines.length;

  // Indent guides (VSCode-style vertical reference lines). The "active" guide
  // follows the deepest indent block containing the cursor line, so the whole
  // current block boundary is highlighted like VSCode's active indent guide.
  const indentGuidesEnabled = settings.indentGuides !== false;
  const cursorModelLine =
    viewMapping.viewToModel[Math.min(cursorViewLine, viewLines.length - 1)] ?? 0;
  const activeGuideCol = useMemo(() => {
    if (!indentGuidesEnabled) return null;
    let deepestHeader: number | null = null;
    foldRegions.forEach((end, start) => {
      if (start <= cursorModelLine && cursorModelLine <= end) {
        if (deepestHeader === null || start > deepestHeader) deepestHeader = start;
      }
    });
    const targetLine = deepestHeader !== null ? modelLines[deepestHeader] : modelLines[cursorModelLine];
    const cols = indentGuideColumns(targetLine ?? '', settings.tabSize || 2);
    return cols.length > 0 ? cols[cols.length - 1] : null;
  }, [indentGuidesEnabled, foldRegions, cursorModelLine, modelLines, settings.tabSize]);

  // Keep the tracked cursor line inside the (possibly folded) view.
  useEffect(() => {
    setCursorViewLine((prev) => Math.max(0, Math.min(prev, viewLines.length - 1)));
  }, [viewLines.length]);

  // Clear folds when folding is no longer active.
  useEffect(() => {
    if (!foldingEnabled) setCollapsedFolds((prev) => (prev.size ? new Set() : prev));
  }, [foldingEnabled]);

  // Clear stale suggestions while folded.
  useEffect(() => {
    if (foldedMode) setActiveSuggestions([]);
  }, [foldedMode]);

  /** Updates the highlighted line from a caret offset within the view text. */
  const syncCursorLine = useCallback((text: string, offset: number) => {
    let line = 0;
    const end = Math.min(offset, text.length);
    for (let i = 0; i < end; i++) {
      if (text[i] === '\n') line++;
    }
    setCursorViewLine(line);
  }, []);

  const toggleFold = (modelIndex: number) => {
    const el = textareaRef.current;
    if (el) {
      pendingModelSelectionRef.current = {
        start: viewOffsetToModelOffset(el.selectionStart, viewMapping, modelLines),
        end: viewOffsetToModelOffset(el.selectionEnd, viewMapping, modelLines)
      };
    }
    setCollapsedFolds((prev) => {
      const next = new Set(prev);
      if (next.has(modelIndex)) next.delete(modelIndex);
      else next.add(modelIndex);
      return next;
    });
  };

  const expandAllFolds = () => {
    setCollapsedFolds((prev) => (prev.size ? new Set() : prev));
  };

  // Restore caret after fold changes (keeps the view mapping in sync).
  React.useLayoutEffect(() => {
    const pending = pendingModelSelectionRef.current;
    if (pending && textareaRef.current) {
      const s = foldedMode ? modelOffsetToViewOffset(pending.start, viewMapping, modelLines) : pending.start;
      const e = foldedMode ? modelOffsetToViewOffset(pending.end, viewMapping, modelLines) : pending.end;
      textareaRef.current.setSelectionRange(s, e);
      pendingModelSelectionRef.current = null;
      syncCursorLine(viewText, s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewText]);

  // Word-wrap alignment guard.
  // The textarea's scrollbar (styled globally at 5px) is reserved inside its own
  // content box, which narrows the width available for wrapping by exactly that
  // amount - and it appears/disappears as the content grows past a screenful
  // (i.e. right when word wrap is toggled). The highlight overlay is a
  // `overflow-hidden` element and therefore would keep the full width, so long
  // wrapped lines would break at a different column and the caret (which the
  // browser lays out inside the textarea) would visibly drift away from its
  // glyph. Reserving the same amount on the overlay keeps both content boxes
  // identical in every state.
  const [editorScrollbarWidth, setEditorScrollbarWidth] = useState(0);
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const gutter = el.offsetWidth - el.clientWidth;
    setEditorScrollbarWidth((prev) => (prev === gutter ? prev : Math.max(0, gutter)));
  }, [showDiffMode, activeFile?.id, settings.wrapLines, settings.fontSize, editorHeight]);

  // Virtualization window calculations
  // Disable virtualization when word wrap is enabled to ensure correct line rendering and sync
  const isWrapping = settings.wrapLines;
  const buffer = 15;
  const visibleStartIndex = isWrapping ? 0 : Math.max(0, Math.floor(scrollTop / baseLineHeight) - buffer);
  const visibleEndIndex = isWrapping ? viewLines.length : Math.min(
    viewLines.length,
    Math.ceil((scrollTop + editorHeight) / baseLineHeight) + buffer
  );

  const topSpacerHeight = isWrapping ? 0 : visibleStartIndex * baseLineHeight;
  const bottomSpacerHeight = isWrapping ? 0 : Math.max(0, (viewLines.length - visibleEndIndex) * baseLineHeight);

  // Active line highlight (non-wrapping overlay only; wrapping uses per-line rendering)
  const activeLineEnabled = settings.highlightActiveLine === true;
  const gutterToggleWidth = foldingEnabled ? 16 : 0;
  const inlineNumberWidth = isWrapping && settings.lineNumbers ? 40 : 0;
  // 行号列按最大位数取宽，配合左侧固定宽的折叠列，使折叠按钮紧贴侧栏左缘
  const lineNumDigits = String(Math.max(1, modelLines.length)).length;
  const lineNumColWidth = Math.max(2, lineNumDigits) * 7.5 + 8;
  const gutterWidth = gutterToggleWidth + (settings.lineNumbers ? lineNumColWidth : 0);
  const codePaddingLeft = isWrapping ? 12 + gutterToggleWidth + inlineNumberWidth : 12;
  const activeLineTop = 12 + cursorViewLine * baseLineHeight - scrollTop;
  const showActiveLineOverlay =
    activeLineEnabled && !isWrapping && activeLineTop > -baseLineHeight && activeLineTop < editorHeight;

  // Sticky scroll (VSCode-style): show the enclosing indentation blocks of the
  // line near the top of the viewport. In wrap mode each model line can span
  // several visual rows, so the anchor (the first row that is at least partly
  // visible, matching the non-wrapping formula below) is recovered from the
  // caret position at the very top edge of the textarea; in old WebViews without
  // hit testing it falls back to the cursor line.
  const stickyScrollEnabled = settings.stickyScroll !== false;

  const getViewLineAtViewportTop = useCallback((): number => {
    const el = textareaRef.current;
    if (!el) return cursorViewLine;
    const rect = el.getBoundingClientRect();
    const x = rect.left + 24; // inside the code padding
    // Two sample points, 12.5px apart, both reading the same textarea:
    //   edgeY — the very top edge of the text area, i.e. the row that is even
    //           partially visible; this is the line VSCode pins as the anchor,
    //           and it is the same row the non-wrapping formula below derives
    //           from scrollTop (`floor((scrollTop - 12) / lineHeight)`).
    //   padY  — just below the 12px top padding; the row that is fully visible.
    // The edge sample only replaces the padding sample while it stays within one
    // row of it, so a degenerate engine answer (e.g. offset 0 far into the
    // document) can never make the sticky chain worse than the padding sample.
    const edgeY = rect.top + 0.5;
    const padY = rect.top + 13;
    const clamp = (v: number) => Math.max(0, Math.min(v, viewLines.length - 1));
    const probe = (pointY: number): number | null => {
      if (typeof document === 'undefined') return null;
      const doc = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node | null; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };
      try {
        if (doc.caretPositionFromPoint) {
          const pos = doc.caretPositionFromPoint(x, pointY);
          if (pos && pos.offsetNode === el) {
            return clamp(offsetToLineIndex(viewMapping.viewLineStarts, pos.offset));
          }
        } else if (doc.caretRangeFromPoint) {
          const range = doc.caretRangeFromPoint(x, pointY);
          if (range && range.startContainer === el) {
            return clamp(offsetToLineIndex(viewMapping.viewLineStarts, range.startOffset));
          }
        }
      } catch {
        /* fall through to the outer fallbacks */
      }
      return null;
    };
    const probeWithOverlaySuspended = (pointY: number): number | null => {
      let line = probe(pointY);
      if (line === null) {
        // The sticky overlay itself sits on the first text row, so the hit test
        // above can land on the overlay instead of the textarea; that would drop
        // the anchor to the cursor line and make the bar flicker away. Suspend
        // the overlay's hit testing for a single probe so the anchor keeps
        // pointing at the top row of the code area.
        const overlay = stickyOverlayRef.current;
        if (overlay) {
          const previous = overlay.style.pointerEvents;
          overlay.style.pointerEvents = 'none';
          line = probe(pointY);
          overlay.style.pointerEvents = previous;
        }
      }
      return line;
    };
    const padLine = probeWithOverlaySuspended(padY);
    const edgeLine = probeWithOverlaySuspended(edgeY);
    let line = padLine;
    if (edgeLine !== null && padLine !== null && edgeLine <= padLine && padLine - edgeLine <= 1) {
      line = edgeLine;
    }
    // Last resort when hit testing is unavailable: approximate the top row from
    // the scroll offset (the cursor can be anywhere, so it is a worse guess).
    return line ?? Math.max(0, Math.floor((scrollTop - 12) / baseLineHeight));
  }, [baseLineHeight, cursorViewLine, scrollTop, viewLines.length, viewMapping.viewLineStarts]);

  const stickyAnchorViewLine = isWrapping
    ? getViewLineAtViewportTop()
    : Math.max(0, Math.floor((scrollTop - 12) / baseLineHeight));
  const stickyAnchorModelLine =
    viewMapping.viewToModel[Math.min(stickyAnchorViewLine, viewLines.length - 1)] ?? 0;

  const stickyChain = useMemo(() => {
    if (!stickyScrollEnabled) return [] as number[];
    const chain: number[] = [];
    // Innermost scope that contains the anchor line...
    let best = -1;
    foldRegions.forEach((end, start) => {
      if (start <= stickyAnchorModelLine && end >= stickyAnchorModelLine && start > best) best = start;
    });
    // ...then walk strictly outward. A region's key IS its header line, so the
    // ancestor search must exclude the region itself (`start < child`): with
    // `start <= child` it re-matches the same region and the walk stalls at the
    // innermost level, losing the whole nesting stack VSCode shows.
    let guard = 0;
    while (best !== -1 && guard++ < 80) {
      chain.push(best);
      const child = best;
      best = -1;
      foldRegions.forEach((end, start) => {
        if (start < child && end >= child && start > best) best = start;
      });
    }
    return chain; // innermost first
  }, [stickyScrollEnabled, stickyAnchorModelLine, foldRegions]);

  // Full chain as render items (innermost first; depth 0 = innermost).
  // A header only attaches once its real code line has scrolled up to the
  // sticky position (the 12px content top edge), and detaches again when the
  // line scrolls back past it. `fly` is the live on-screen Y of the header
  // line — it gates attach/release and seeds the shared-element flight.
  const stickyItems = useMemo(() => {
    const m2v = viewMapping.modelToView;
    return stickyChain
      .map((start, idx) => {
        const hv = m2v[start];
        const fly = hv === undefined || hv < 0
          ? Number.POSITIVE_INFINITY
          : 12 + hv * baseLineHeight - scrollTop;
        return {
          start,
          end: foldRegions.get(start) ?? start,
          label: modelLines[start]?.trim() || '…',
          depth: idx,
          fly
        };
      })
      .filter((item) => item.fly <= STICKY_ATTACH_Y);
  }, [stickyChain, foldRegions, modelLines, viewMapping.modelToView, baseLineHeight, scrollTop]);

  // Display order is outermost -> innermost.
  const stickyOuterFirst = useMemo(() => [...stickyItems].reverse(), [stickyItems]);
  const stickyVisible = useMemo(
    () => (stickyExpanded ? stickyOuterFirst : stickyOuterFirst.slice(-STICKY_MAX_VISIBLE)),
    [stickyExpanded, stickyOuterFirst]
  );
  const stickyHasCollapsed = !stickyExpanded && stickyOuterFirst.length > STICKY_MAX_VISIBLE;

  // Full path hint for a hovered/menu item (outermost -> target item).
  const stickyPathFor = useCallback(
    (start: number): string => {
      const idx = stickyItems.findIndex((i) => i.start === start);
      if (idx === -1 || stickyItems.length === 0) return '';
      return [...stickyItems].reverse().slice(0, stickyItems.length - idx).map((i) => i.label).join(' > ');
    },
    [stickyItems]
  );

  // Auto-collapse the expanded sticky list when the innermost block changes.
  useEffect(() => {
    if (stickyExpanded && expandedAnchorRef.current !== null && stickyChain.length > 0) {
      if (stickyChain[0] !== expandedAnchorRef.current) {
        expandedAnchorRef.current = null;
        setStickyExpanded(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickyChain, stickyExpanded]);

  // Animation profile for sticky enter/exit, honouring prefers-reduced-motion.
  const stickyT = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: 'easeOut' as const };

  // Mini gutter column width matches the real line-number gutter.
  const stickyMiniGutterWidth = isWrapping ? lineNumColWidth : gutterWidth;

  // Jump from the sticky bar to a block's line. The jump itself must not summon
  // the soft keyboard: the caret is only moved while the text area already had
  // focus (keyboard up → stays up), otherwise the editor only scrolls and the
  // caret stays untouched (no focus change → no keyboard).
  const smoothJumpToModelLine = (modelLine: number) => {
    const vl = viewMapping.modelToView[modelLine];
    const el = textareaRef.current;
    if (vl === undefined || vl < 0 || !el) return;
    if (document.activeElement === el) {
      el.focus({ preventScroll: true });
      const start = viewMapping.viewLineStarts[vl];
      el.setSelectionRange(start, start);
      setCursorViewLine(vl);
    }

    const target = Math.max(0, vl * baseLineHeight - baseLineHeight);
    const from = el.scrollTop;
    const delta = target - from;
    if (Math.abs(delta) < 2 || prefersReducedMotion) {
      el.scrollTop = target;
      setScrollTop(el.scrollTop);
      return;
    }
    const sm = smoothScrollRef.current;
    if (sm) {
      cancelAnimationFrame(sm.raf);
      smoothScrollRef.current = null;
    }
    const s = {
      raf: 0,
      from,
      delta,
      start: performance.now(),
      duration: Math.max(140, Math.min(340, Math.abs(delta) * 0.18)),
      cancelled: false,
      lastValue: from
    };
    smoothScrollRef.current = s;
    const step = (now: number) => {
      if (!smoothScrollRef.current || smoothScrollRef.current !== s || s.cancelled) return;
      const p = Math.min(1, (now - s.start) / s.duration);
      el.scrollTop = s.from + s.delta * easeOutCubic(p);
      // Record exactly what we wrote so handleScroll can tell the animation's own
      // scroll events apart from a real manual scroll that should abort the jump.
      s.lastValue = el.scrollTop;
      setScrollTop(el.scrollTop);
      if (p < 1) s.raf = requestAnimationFrame(step);
      else smoothScrollRef.current = null;
    };
    s.raf = requestAnimationFrame(step);
  };

  const copyText = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through to the legacy path */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const openStickyMenu = (
    e: React.MouseEvent,
    item: { start: number; end: number; label: string }
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setStickyHover(null);
    setStickyCopied(null);
    setStickyMenu({ x: e.clientX, y: e.clientY, start: item.start, end: item.end, label: item.label });
  };

  const stickyMenuRef = useRef<HTMLDivElement>(null);

  // Close the sticky context menu on outside click / Esc / blur.
  useEffect(() => {
    if (!stickyMenu) return;
    const onDown = (e: MouseEvent) => {
      if (stickyMenuRef.current && !stickyMenuRef.current.contains(e.target as Node)) {
        setStickyMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStickyMenu(null);
    };
    const onBlur = () => setStickyMenu(null);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [stickyMenu]);

  // Briefly keep the "copied ✓" feedback visible, then close the menu.
  useEffect(() => {
    if (!stickyCopied) return;
    const t = window.setTimeout(() => {
      setStickyCopied(null);
      setStickyMenu(null);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [stickyCopied]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-secondary)]">
      {/* Editor Control Bar (Second topbar) - Hidden in Fullscreen mode */}
      <AnimatePresence>
        {!isFS && (
          <motion.div
            key="editor-control-topbar"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] shrink-0"
          >
            <div className="px-3 py-2 flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                {/* Active File Label */}
                <div className="flex items-center space-x-1.5 text-xs text-[var(--text-secondary)] font-mono-code font-medium truncate max-w-[50%]">
                  {project.id === 'playground' ? (
                    <PlaygroundLanguageDropdown
                      currentLanguage={activeFile?.language || project.language}
                      hasSelectedLanguage={project.hasSelectedLanguage}
                      onSelectLanguage={(lang, execType) => {
                        if (onSelectPlaygroundLanguage) {
                          onSelectPlaygroundLanguage(lang, execType);
                        } else if (onOpenLangSelect) {
                          onOpenLangSelect();
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsPropertiesOpen(true)}
                      className="flex items-center space-x-1.5 hover:text-[var(--text-primary)] transition-colors group cursor-pointer text-left truncate press-feedback"
                      title="点击打开文件属性与编码设置"
                    >
                      {isImage ? (
                        <ImageIcon className="w-3.5 h-3.5 shrink-0 text-[var(--brand)] group-hover:scale-105 transition-transform" />
                      ) : isVideo ? (
                        <Film className="w-3.5 h-3.5 shrink-0 text-purple-500 group-hover:scale-105 transition-transform" />
                      ) : (
                        <FileCode className="w-3.5 h-3.5 shrink-0 text-[var(--brand)] group-hover:scale-105 transition-transform" />
                      )}
                      <span className="truncate group-hover:underline underline-offset-2">{activeFile?.name || '代码编辑器'}</span>
                    </button>
                  )}
                </div>

                {/* Quick Toolbar */}
                <div className="flex items-center space-x-1 shrink-0">
                  {isMediaActive ? (
                    <>
                      {isSvg && (
                        <button
                          type="button"
                          onClick={() => setSvgCodeMode(true)}
                          className="px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs flex items-center space-x-1 press-feedback"
                          title="切换至 SVG 源码编辑"
                        >
                          <Code className="w-3.5 h-3.5 text-[var(--brand)]" />
                          <span className="hidden sm:inline">编辑源码</span>
                        </button>
                      )}

                      <button
                        onClick={handleToggleFS}
                        className={`p-1.5 rounded-lg text-xs press-feedback flex items-center space-x-1 ${
                          isFS
                            ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border border-[var(--brand-border)] font-medium'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                        title={isFS ? '退出全屏' : '全屏模式'}
                      >
                        {isFS ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>

                      {onOpenGitPush && (
                        <button
                          onClick={onOpenGitPush}
                          className={`p-1.5 rounded-lg text-xs press-feedback flex items-center space-x-1 ${
                            project.gitConfig
                              ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border border-[var(--brand-border)]'
                              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                          title={project.gitConfig ? `Git (${project.gitConfig.branch}) - 推送代码` : 'Git 远程推送与同步'}
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          {project.gitConfig && (
                            <span className="text-[10px] font-mono-code hidden sm:inline">{project.gitConfig.branch}</span>
                          )}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {isSvg && (
                        <button
                          type="button"
                          onClick={() => setSvgCodeMode(false)}
                          className="px-2 py-1 rounded-lg bg-[var(--brand-subtle)] border border-[var(--brand-border)] text-[var(--brand)] text-xs font-medium flex items-center space-x-1 press-feedback"
                          title="切换回矢量图像预览"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">查看预览</span>
                        </button>
                      )}

                      <button
                        onClick={handleUndo}
                        disabled={historyIdx <= 0}
                        className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] disabled:opacity-35 press-feedback text-xs"
                        title="撤销"
                      >
                        <Undo className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={handleRedo}
                        disabled={historyIdx >= history.length - 1}
                        className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] disabled:opacity-35 press-feedback text-xs"
                        title="重做"
                      >
                        <Redo className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={handleFormat}
                        disabled={isFormatting}
                        className={`p-1.5 rounded-lg text-xs press-feedback transition-colors ${
                          isFormatting
                            ? 'bg-[var(--brand-subtle)] text-[var(--brand)]'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:text-[var(--brand)]'
                        }`}
                        title="格式化与自动缩进代码 (Alt+Shift+F)"
                      >
                        {isFormatting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => setShowFindReplace(!showFindReplace)}
                        className={`p-1.5 rounded-lg text-xs press-feedback ${
                          showFindReplace
                            ? 'bg-[var(--brand-subtle)] text-[var(--brand)]'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                        }`}
                        title="查找与替换"
                      >
                        <Search className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setShowDiffMode(!showDiffMode)}
                        className={`p-1.5 rounded-lg text-xs press-feedback flex items-center space-x-1 ${
                          showDiffMode
                            ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border border-[var(--brand-border)] font-medium'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                        title={showDiffMode ? '退出代码差异对比' : '代码差异对比 (Diff)'}
                      >
                        <FileDiff className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={handleToggleFS}
                        className={`p-1.5 rounded-lg text-xs press-feedback flex items-center space-x-1 ${
                          isFS
                            ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border border-[var(--brand-border)] font-medium'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                        title={isFS ? '退出全屏' : '全屏模式'}
                      >
                        {isFS ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>

                      {onOpenGitPush && (
                        <button
                          onClick={onOpenGitPush}
                          className={`p-1.5 rounded-lg text-xs press-feedback flex items-center space-x-1 ${
                            project.gitConfig
                              ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border border-[var(--brand-border)]'
                              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                          title={project.gitConfig ? `Git (${project.gitConfig.branch}) - 推送代码` : 'Git 远程推送与同步'}
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          {project.gitConfig && (
                            <span className="text-[10px] font-mono-code hidden sm:inline">{project.gitConfig.branch}</span>
                          )}
                        </button>
                      )}

                      <button
                        onClick={onRunCode}
                        className="px-2.5 py-1 rounded-lg bg-[var(--brand)] text-white text-xs font-semibold press-feedback flex items-center space-x-1"
                        title="立即运行"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>运行</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Find & Replace Bar (Stacked Vertically) */}
              <AnimatePresence>
                {showFindReplace && !isMediaActive && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden pt-2 border-t border-[var(--border-subtle)] space-y-2"
                  >
                    {/* Top Row: Find Input */}
                    <div className="flex items-center space-x-1.5">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                        <input
                          type="text"
                          value={findText}
                          onChange={(e) => setFindText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleFindNext();
                            }
                          }}
                          placeholder={
                            searchMode === 'regex'
                              ? '正则/通配符查找 (如: .*\\.tsx$ 或 *.ts)...'
                              : searchMode === 'fuzzy'
                                ? '模糊查找 (按字符匹配)...'
                                : '查找内容 (按回车或点查找下一个)...'
                          }
                          className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg pl-8 pr-20 py-1.5 text-xs text-[var(--text-primary)] font-mono-code focus:outline-none focus:border-[var(--brand)]"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1 pointer-events-none">
                          {findText && (
                            <span className={`text-[10px] font-mono-code px-1.5 py-0.5 rounded ${
                              !isRegexValid 
                                ? 'bg-red-500/20 text-red-400'
                                : matchCount > 0 
                                  ? 'bg-[var(--brand)] text-white' 
                                  : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)]'
                            }`}>
                              {!isRegexValid ? '正则有误' : currentMatchIndex > 0 ? `${currentMatchIndex}/${matchCount}` : `${matchCount} 匹配`}
                            </span>
                          )}
                        </div>
                      </div>

                      <SearchModeDropdown
                        mode={searchMode}
                        onModeChange={setSearchMode}
                        caseSensitive={caseSensitive}
                        onCaseSensitiveChange={setCaseSensitive}
                      />
                    </div>

                    {/* Middle Row: Replace Input (Dedicated Full-Width Row) */}
                    <div className="relative w-full">
                      <Replace className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                      <input
                        type="text"
                        value={replaceText}
                        onChange={(e) => setReplaceText(e.target.value)}
                        placeholder="替换为..."
                        className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] font-mono-code focus:outline-none focus:border-[var(--brand)]"
                      />
                    </div>

                    {/* Bottom Row: Actions */}
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      {/* Left: Find Next button (Bottom-Left) */}
                      <button
                        type="button"
                        onClick={handleFindNext}
                        disabled={!findText.trim() || matchCount === 0 || !isRegexValid}
                        className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium rounded-lg press-feedback flex items-center space-x-1.5 border border-[var(--border-subtle)] shrink-0 transition-colors"
                        title="跳转并选中下一个匹配项 (或按 Enter)"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                        <span>查找下一个</span>
                      </button>

                      {/* Right: Replace Current & Replace All Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleReplaceOne}
                          disabled={!findText || matchCount === 0 || !isRegexValid}
                          className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--text-primary)] text-xs font-medium rounded-lg press-feedback flex items-center space-x-1 border border-[var(--border-subtle)] shrink-0 transition-colors"
                          title="替换当前匹配项"
                        >
                          <span>替换当前</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleReplaceAll}
                          disabled={!findText || matchCount === 0 || !isRegexValid}
                          className="px-2.5 py-1.5 bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium rounded-lg press-feedback flex items-center space-x-1 shadow-sm shrink-0 transition-colors"
                          title="替换所有匹配项"
                        >
                          <Replace className="w-3 h-3" />
                          <span>全部替换</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Large File Lazy Loading Status Bar */}
      {isLarge && !isMediaActive && (
        <div className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] px-3 py-1.5 flex items-center justify-between text-xs shrink-0 select-none">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30">
              <Zap className="w-3 h-3 mr-1" /> 大文件懒加载
            </span>
            <span className="text-[var(--text-secondary)] text-xs">
              已加载 <span className="font-mono font-medium text-[var(--text-primary)]">{loadedLineCount.toLocaleString()}</span> / 共 <span className="font-mono">{rawLines.length.toLocaleString()}</span> 行
              <span className="ml-1 text-[var(--text-tertiary)]">({formatFileSize(getFileSizeBytes(rawContent))})</span>
            </span>
            {isLoadingMore && (
              <span className="inline-flex items-center text-xs text-[var(--brand)] space-x-1 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>正在加载...</span>
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {!isFullyLoaded ? (
              <>
                <button
                  onClick={() => handleLoadMore(LARGE_FILE_CHUNK_SIZE)}
                  disabled={isLoadingMore}
                  className="px-2 py-0.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs press-feedback border border-[var(--border-subtle)] transition-colors disabled:opacity-50"
                  title={`加载下 ${LARGE_FILE_CHUNK_SIZE} 行`}
                >
                  + 加载下 {LARGE_FILE_CHUNK_SIZE} 行
                </button>
                <button
                  onClick={handleLoadAll}
                  className="px-2.5 py-0.5 rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium press-feedback transition-colors"
                  title="一次性加载全部文件内容"
                >
                  全部加载 ({rawLines.length} 行)
                </button>
              </>
            ) : (
              <span className="text-[11px] text-[var(--text-tertiary)] flex items-center space-x-1">
                <Check className="w-3 h-3 text-emerald-500" />
                <span>已加载全部内容</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Editor Body with Synchronized Line Numbers or Media Viewer */}
      {isMediaActive && activeFile ? (
        <MediaViewer
          file={activeFile}
          project={project}
          onUpdateFileContent={onUpdateFileContent}
          onAddNewFile={onAddNewFile}
          onDownloadFile={onDownloadFile}
          isSvgCodeMode={isSvg && svgCodeMode}
          onToggleSvgMode={isSvg ? () => setSvgCodeMode(!svgCodeMode) : undefined}
          isFullscreen={isFS}
          onToggleFullscreen={handleToggleFS}
        />
      ) : (
        <>
          {/* Editor Body with Synchronized Line Numbers */}
          <div ref={editorBodyRef} className="flex-1 flex overflow-hidden relative code-editor-body min-h-0">
        {showDiffMode && diffResult ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-primary)]">
            {/* Diff Header Bar */}
            <div className="px-3 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 select-none">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="font-semibold text-[var(--text-secondary)]">对比基准:</span>
                <CustomSelect
                  value={diffBaselineSource}
                  onChange={(val) => setDiffBaselineSource(String(val))}
                  options={[
                    { value: 'initial', label: '初始版本 (Baseline)' },
                    ...project.files
                      .filter((f) => f.id !== activeFile?.id)
                      .map((f) => ({ value: f.id, label: f.name }))
                  ]}
                  className="w-48"
                />
                <div className="flex items-center space-x-1.5 font-mono text-[11px]">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 font-semibold">
                    +{diffResult.addedCount}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 font-semibold">
                    -{diffResult.removedCount}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setDiffLayout(diffLayout === 'split' ? 'inline' : 'split')}
                  className="px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs flex items-center space-x-1 border border-[var(--border-subtle)] press-feedback shrink-0"
                  title="切换并排/行内视图"
                >
                  {diffLayout === 'split' ? <Columns className="w-3.5 h-3.5" /> : <Rows className="w-3.5 h-3.5" />}
                  <span>{diffLayout === 'split' ? '并排对比' : '行内对比'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleChange(baselineContent);
                    setShowDiffMode(false);
                  }}
                  disabled={!diffResult.modified}
                  className="px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] disabled:opacity-40 text-xs flex items-center space-x-1 border border-[var(--border-subtle)] press-feedback shrink-0"
                  title="还原为基准版本内容"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                  <span>还原</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDiffMode(false)}
                  className="px-2 py-1 rounded-lg bg-[var(--brand)] text-white text-xs font-semibold press-feedback shrink-0"
                >
                  退出
                </button>
              </div>
            </div>

            {/* Diff Content View */}
            <div className="flex-1 overflow-auto font-mono-code text-xs leading-relaxed select-text">
              {diffLayout === 'split' ? (
                <div className="min-w-full grid grid-cols-2 divide-x divide-[var(--border-subtle)]">
                  {/* Left Column (Baseline) */}
                  <div className="overflow-hidden">
                    <div className="px-2 py-1 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] text-[10px] font-semibold uppercase sticky top-0 z-10 border-b border-[var(--border-subtle)] truncate">
                      基准版本 (Baseline)
                    </div>
                    {diffResult.splitRows.map((row, rIdx) => {
                      const isRemoved = row.left?.type === 'removed';
                      return (
                        <div
                          key={`l-${rIdx}`}
                          className={`flex items-start px-2 py-0.5 ${
                            isRemoved ? 'bg-rose-500/15 text-rose-300' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          <span className="w-7 shrink-0 text-right pr-2 text-[var(--text-tertiary)] select-none opacity-50">
                            {row.left?.lineNumber ?? ''}
                          </span>
                          <span className="w-4 shrink-0 select-none text-rose-400 font-bold">
                            {isRemoved ? '-' : ''}
                          </span>
                          <span className="whitespace-pre break-all flex-1">{row.left?.content || ' '}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right Column (Current) */}
                  <div className="overflow-hidden">
                    <div className="px-2 py-1 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] text-[10px] font-semibold uppercase sticky top-0 z-10 border-b border-[var(--border-subtle)] truncate">
                      当前修改 (Current)
                    </div>
                    {diffResult.splitRows.map((row, rIdx) => {
                      const isAdded = row.right?.type === 'added';
                      return (
                        <div
                          key={`r-${rIdx}`}
                          className={`flex items-start px-2 py-0.5 ${
                            isAdded ? 'bg-emerald-500/15 text-emerald-300' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          <span className="w-7 shrink-0 text-right pr-2 text-[var(--text-tertiary)] select-none opacity-50">
                            {row.right?.lineNumber ?? ''}
                          </span>
                          <span className="w-4 shrink-0 select-none text-emerald-400 font-bold">
                            {isAdded ? '+' : ''}
                          </span>
                          <span className="whitespace-pre break-all flex-1">{row.right?.content || ' '}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Inline Unified View */
                <div className="min-w-full">
                  <div className="px-2 py-1 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] text-[10px] font-semibold uppercase sticky top-0 z-10 border-b border-[var(--border-subtle)]">
                    统一行内差异视图 (Unified Diff)
                  </div>
                  {diffResult.unifiedLines.map((line, lIdx) => {
                    const isAdded = line.type === 'added';
                    const isRemoved = line.type === 'removed';
                    return (
                      <div
                        key={`u-${lIdx}`}
                        className={`flex items-start px-2 py-0.5 ${
                          isAdded
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : isRemoved
                            ? 'bg-rose-500/15 text-rose-300'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        <span className="w-7 shrink-0 text-right pr-1 text-[var(--text-tertiary)] select-none opacity-40">
                          {line.oldLineNumber ?? ''}
                        </span>
                        <span className="w-7 shrink-0 text-right pr-2 text-[var(--text-tertiary)] select-none opacity-40">
                          {line.newLineNumber ?? ''}
                        </span>
                        <span className={`w-4 shrink-0 select-none font-bold ${
                          isAdded ? 'text-emerald-400' : isRemoved ? 'text-rose-400' : 'text-transparent'
                        }`}>
                          {isAdded ? '+' : isRemoved ? '-' : ' '}
                        </span>
                        <span className="whitespace-pre break-all flex-1">{line.content || ' '}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Line Number / Fold Gutter (Virtualized) - Only for non-wrapping mode */}
            {!settings.wrapLines && (settings.lineNumbers || foldingEnabled) && (
              <div
                ref={lineNumbersRef}
                style={{ width: `${gutterWidth}px` }}
                className={`bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] py-3 font-mono-code text-xs select-none overflow-hidden shrink-0 border-r border-[var(--border-subtle)] opacity-70`}
              >
                {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px` }} />}
                {viewLines.slice(visibleStartIndex, visibleEndIndex).map((_, i) => {
                  const viewIdx = visibleStartIndex + i;
                  const modelIdx = viewMapping.viewToModel[viewIdx];
                  const lineNum = modelIdx + 1;
                  const foldable = foldingEnabled && foldRegions.has(modelIdx);
                  const isCollapsed = collapsedFolds.has(modelIdx);
                  const isCurrent = viewIdx === cursorViewLine;
                  return (
                    <div
                      key={viewIdx}
                      style={{ height: `${baseLineHeight}px`, lineHeight: `${baseLineHeight}px` }}
                      className="flex items-center"
                    >
                      {foldingEnabled && (
                        <span className="shrink-0 flex items-center" style={{ width: `${gutterToggleWidth}px` }}>
                          {foldable && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => toggleFold(modelIdx)}
                              title={isCollapsed ? '展开' : '折叠'}
                              className={`w-3.5 h-3.5 flex items-center justify-center rounded press-feedback ${
                                isCollapsed ? 'text-[var(--brand)]' : 'text-[var(--text-tertiary)]'
                              }`}
                            >
                              {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          )}
                        </span>
                      )}
                      {settings.lineNumbers && (
                        <span
                          style={{ width: `${lineNumColWidth}px` }}
                          className={`shrink-0 text-right pr-1.5 ${isCurrent ? 'text-[var(--brand)] opacity-100 font-semibold' : ''}`}
                        >
                          {lineNum}
                        </span>
                      )}
                    </div>
                  );
                })}
                {bottomSpacerHeight > 0 && <div style={{ height: `${bottomSpacerHeight}px` }} />}
              </div>
            )}

            {/* Code Area */}
            <div className="flex-1 relative overflow-hidden bg-[var(--bg-primary)] code-editor-body">
              {/* VSCode-style sticky scroll — overlaid on the code area, whose coordinate space its absolute offsets assume */}
              {!showDiffMode && stickyScrollEnabled && stickyItems.length > 0 && (
                <AnimatePresence initial={false} custom={stickyDirRef.current}>
                  <motion.div
                    ref={stickyOverlayRef}
                    key="sticky-bar"
                    custom={stickyDirRef.current}
                    variants={stickyBarVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={stickyT}
                    className="absolute top-0 left-0 right-0 z-30 select-none"
                    onMouseLeave={() => setStickyHover(null)}
                  >
                    {/* Frosted bar surface */}
                    <div
                      className="overflow-hidden rounded-b-md border-b border-[var(--border-subtle)] shadow-lg"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 82%, transparent)',
                        WebkitBackdropFilter: 'blur(10px)',
                        backdropFilter: 'blur(10px)'
                      }}
                    >
                      {stickyExpanded ? (
                        <motion.div
                          key="sticky-expanded"
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          transition={stickyT}
                          className="flex flex-col max-h-[32vh] overflow-y-auto no-scrollbar"
                        >
                          <AnimatePresence initial={false} custom={stickyDirRef.current}>
                            {stickyVisible.map((item, idx) => (
                              <motion.button
                                key={`v-${item.start}`}
                                type="button"
                                custom={item.fly}
                                variants={stickyItemVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={stickyT}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => smoothJumpToModelLine(item.start)}
                                onMouseEnter={() => setStickyHover({ start: item.start, end: item.end, label: item.label })}
                                onContextMenu={(e) => openStickyMenu(e, item)}
                                title={stickyPathFor(item.start)}
                                className="flex items-center min-w-0 w-full text-left font-mono-code text-[11px] text-[var(--text-secondary)] press-feedback hover:bg-[var(--bg-tertiary)]/60"
                              >
                                <span
                                  className="shrink-0 text-right font-mono-code text-[9px] text-[var(--text-tertiary)] tabular-nums pr-1.5"
                                  style={{ width: stickyMiniGutterWidth, paddingLeft: isWrapping ? 0 : gutterToggleWidth }}
                                >
                                  {item.start + 1}
                                </span>
                                {idx > 0 && <span className="w-px shrink-0 self-stretch bg-[var(--border-medium)]" />}
                                <span
                                  className="truncate py-1 pr-2"
                                  style={{ paddingLeft: idx === 0 ? 6 : 8 + (idx - 1) * 10 }}
                                >
                                  {item.label}
                                </span>
                              </motion.button>
                            ))}
                          </AnimatePresence>
                          <button
                            type="button"
                            onClick={() => setStickyExpanded(false)}
                            className="flex items-center gap-1 px-2 py-1 text-[9px] text-[var(--text-tertiary)] hover:text-[var(--brand)] press-feedback border-t border-[var(--border-subtle)]"
                          >
                            <ChevronDown className="w-3 h-3" /> 收起
                          </button>
                        </motion.div>
                      ) : (
                        <div className="flex items-center px-1" style={{ height: STICKY_BAR_HEIGHT }}>
                          {stickyHasCollapsed && (
                            <motion.button
                              type="button"
                              custom={0}
                              variants={stickyItemVariants}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              transition={stickyT}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                expandedAnchorRef.current = stickyItems[0]?.start ?? null;
                                setStickyExpanded(true);
                              }}
                              title="展开全部外层块"
                              className="shrink-0 flex items-center justify-center w-5 h-5 rounded text-[10px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--brand)] press-feedback"
                            >
                              •••
                            </motion.button>
                          )}
                          <AnimatePresence initial={false} custom={stickyDirRef.current}>
                            {stickyVisible.map((item, idx) => {
                              const isInnermost = idx === stickyVisible.length - 1;
                              return (
                                <motion.button
                                  key={`h-${item.start}`}
                                  type="button"
                                  custom={item.fly}
                                  variants={stickyItemVariants}
                                  initial="enter"
                                  animate="center"
                                  exit="exit"
                                  transition={stickyT}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => smoothJumpToModelLine(item.start)}
                                  onMouseEnter={() => setStickyHover({ start: item.start, end: item.end, label: item.label })}
                                  onContextMenu={(e) => openStickyMenu(e, item)}
                                  className={`flex items-center min-w-0 shrink font-mono-code text-[11px] truncate press-feedback rounded ${
                                isInnermost ? 'text-[var(--brand)]' : 'text-[var(--text-secondary)]'
                              }`}
                                >
                                  <span
                                    className="shrink-0 text-right font-mono-code text-[9px] text-[var(--text-tertiary)] tabular-nums pr-1.5"
                                    style={{ width: stickyMiniGutterWidth, paddingLeft: isWrapping ? 0 : gutterToggleWidth }}
                                  >
                                    {item.start + 1}
                                  </span>
                                  {idx > 0 && <span className="w-px shrink-0 self-stretch bg-[var(--border-medium)]" />}
                                  <span
                                    className="truncate py-0.5 pr-1"
                                    style={{ paddingLeft: idx === 0 ? 4 : 8 + (idx - 1) * 10 }}
                                  >
                                    {item.label}
                                  </span>
                                </motion.button>
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>

                    {/* Full-path tooltip (follows the hovered item) */}
                    {stickyHover && !stickyMenu && (
                      <div className="absolute top-full left-1 mt-0.5 z-40 max-w-xs pointer-events-none rounded-md border border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/95 px-2 py-1 font-mono-code text-[10px] text-[var(--text-secondary)] shadow-lg">
                        <div className="truncate">{stickyPathFor(stickyHover.start)}</div>
                        <div className="mt-0.5 text-[var(--text-tertiary)] tabular-nums">行 {stickyHover.start + 1}</div>
                      </div>
                    )}

                    {/* Context menu */}
                    {stickyMenu && (
                      <div
                        ref={stickyMenuRef}
                        className="fixed z-[80] min-w-[160px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-secondary)] shadow-2xl py-1 text-xs"
                        style={{ left: stickyMenu.x, top: stickyMenu.y }}
                      >
                        <div className="px-2.5 py-1 text-[10px] text-[var(--text-tertiary)] truncate border-b border-[var(--border-subtle)] mb-1">
                          {stickyMenu.label} · 行 {stickyMenu.start + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() => { smoothJumpToModelLine(stickyMenu.start); setStickyMenu(null); }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] press-feedback flex items-center gap-1.5"
                        >
                          <ArrowDown className="w-3 h-3 text-[var(--text-tertiary)] shrink-0" />
                          跳转到该块
                        </button>
                        <button
                          type="button"
                          onClick={() => { void copyText(stickyPathFor(stickyMenu.start)).then((ok) => ok && setStickyCopied('path')); }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] press-feedback"
                        >
                          {stickyCopied === 'path' ? '已复制路径 ✓' : '复制完整路径'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void copyText(modelLines.slice(stickyMenu.start, stickyMenu.end + 1).join('\n')).then((ok) => ok && setStickyCopied('code'));
                          }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] press-feedback"
                        >
                          {stickyCopied === 'code' ? '已复制代码 ✓' : '复制块代码'}
                        </button>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}

              {/* Hover block highlight (code area only, non-wrapping) */}
              {!showDiffMode && !isWrapping && stickyHover && !stickyMenu && (() => {
                const sv = viewMapping.modelToView[stickyHover.start];
                const ev = viewMapping.modelToView[stickyHover.end];
                if (sv === undefined || ev === undefined || sv < 0 || ev < 0) return null;
                const top = 12 + sv * baseLineHeight - scrollTop;
                const height = (ev - sv + 1) * baseLineHeight;
                if (top > editorHeight || top + height < 0) return null;
                return (
                  <div
                    className="absolute pointer-events-none z-10"
                    style={{ left: `${gutterWidth}px`, right: 0, top, height, backgroundColor: 'var(--brand-subtle)' }}
                  />
                );
              })()}

              {/* Active line highlight */}
              {showActiveLineOverlay && (
                <div
                  className="absolute left-0 right-0 pointer-events-none bg-[var(--brand-subtle)]"
                  style={{ top: `${activeLineTop}px`, height: `${baseLineHeight}px` }}
                />
              )}

              {/* Indent guides overlay (non-wrapping mode) */}
              {indentGuidesEnabled && !isWrapping && (
                <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                  {(() => {
                    const segments: {
                      key: string;
                      left: number;
                      top: number;
                      width: number;
                      height: number;
                      active: boolean;
                      radius?: string;
                    }[] = [];
                    const textLeft = 12;
                    const tabSize = settings.tabSize || 2;
                    for (let vi = visibleStartIndex; vi < visibleEndIndex; vi++) {
                      const cols = indentGuideColumns(viewLines[vi], tabSize);
                      if (cols.length === 0) continue;
                      const y = 12 + vi * baseLineHeight - scrollTop;
                      if (y + baseLineHeight < 0 || y > editorHeight) continue;
                      const modelIdx = viewMapping.viewToModel[vi];
                      const isCursorLine = vi === cursorViewLine;
                      const isFoldable = foldingEnabled && modelIdx !== undefined && foldRegions.has(modelIdx);
                      const deepest = cols[cols.length - 1];
                      for (const col of cols) {
                        segments.push({
                          key: `g-${vi}-${col}`,
                          left: Math.max(0, textLeft + col * monoCharWidth - 1),
                          top: Math.round(y),
                          width: 1,
                          height: baseLineHeight,
                          active: isCursorLine || col === activeGuideCol
                        });
                      }
                      // VSCode shows a small dot on foldable header lines, marking
                      // the deepest indent level where the fold toggle lives.
                      if (isFoldable) {
                        segments.push({
                          key: `d-${vi}-${deepest}`,
                          left: Math.max(0, textLeft + deepest * monoCharWidth - 3),
                          top: Math.round(y + (baseLineHeight - 6) / 2),
                          width: 6,
                          height: 6,
                          active: isCursorLine || deepest === activeGuideCol,
                          radius: '50%'
                        });
                      }
                    }
                    return segments.map((seg) => (
                      <div
                        key={seg.key}
                        className="absolute"
                        style={{
                          left: `${seg.left}px`,
                          top: `${seg.top}px`,
                          width: `${seg.width}px`,
                          height: `${seg.height}px`,
                          background: seg.active ? 'var(--indent-guide-active)' : 'var(--indent-guide)',
                          borderRadius: seg.radius
                        }}
                      />
                    ));
                  })()}
                </div>
              )}

              {/* Syntax Highlight Overlay (Virtualized) */}
              <pre
                ref={highlightRef}
                aria-hidden="true"
                className={`absolute inset-0 font-mono-code m-0 overflow-hidden pointer-events-none ${settings.wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} ${settings.wrapLines && foldingEnabled ? 'z-10' : ''}`}
                style={{ 
                  fontSize: `${settings.fontSize}px`, 
                  lineHeight: `${baseLineHeight}px`, 
                  tabSize: settings.tabSize,
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  // Keep the overlay's content box exactly as wide as the textarea's:
                  // the textarea reserves its scrollbar inside its own content box.
                  paddingRight: `${12 + editorScrollbarWidth}px`,
                  paddingLeft: '12px'
                }}
              >
                {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px` }} />}
                <code>
                  <SyntaxHighlightedLine 
                    code={viewLines.slice(visibleStartIndex, visibleEndIndex).join('\n')} 
                    language={activeFile?.language || 'javascript'} 
                    isDark={isDarkTheme} 
                    searchQuery={findText}
                    searchMode={searchMode}
                    caseSensitive={caseSensitive}
                    wrap={isWrapping}
                    showLineNumbers={settings.wrapLines && settings.lineNumbers}
                    startLineNumber={visibleStartIndex + 1}
                    lineNumbers={viewMapping.viewToModel.slice(visibleStartIndex, visibleEndIndex).map((m) => m + 1)}
                    activeLineIndex={settings.wrapLines && activeLineEnabled ? cursorViewLine : undefined}
                    foldGutter={settings.wrapLines && foldingEnabled}
                    foldableLines={
                      settings.wrapLines && foldingEnabled
                        ? viewMapping.viewToModel.slice(visibleStartIndex, visibleEndIndex).map((m) => foldRegions.has(m))
                        : undefined
                    }
                    collapsedLines={
                      settings.wrapLines && foldingEnabled
                        ? viewMapping.viewToModel.slice(visibleStartIndex, visibleEndIndex).map((m) => collapsedFolds.has(m))
                        : undefined
                    }
                    indentGuides={
                      indentGuidesEnabled && settings.wrapLines
                        ? viewMapping.viewToModel.slice(visibleStartIndex, visibleEndIndex)
                            .map((_, i) => indentGuideColumns(viewLines[visibleStartIndex + i], settings.tabSize || 2))
                        : undefined
                    }
                    guideCharWidth={indentGuidesEnabled && settings.wrapLines ? monoCharWidth : undefined}
                    guideTextOffset={settings.wrapLines ? gutterToggleWidth + inlineNumberWidth : 0}
                    activeGuideCol={indentGuidesEnabled && settings.wrapLines ? activeGuideCol : undefined}
                    onToggleFold={
                      settings.wrapLines && foldingEnabled
                        ? (idx: number) => {
                            const m = viewMapping.viewToModel[visibleStartIndex + idx];
                            if (m !== undefined) toggleFold(m);
                          }
                        : undefined
                    }
                  />
                </code>
                {bottomSpacerHeight > 0 && <div style={{ height: `${bottomSpacerHeight}px` }} />}
              </pre>

              {/* Real-time Code Textarea */}
              <textarea
                ref={textareaRef}
                value={viewText}
                onChange={handleTextareaChange}
                onKeyUp={handleTextareaCursorMove}
                onClick={handleTextareaCursorMove}
                onSelect={handleTextareaCursorMove}
                onKeyDown={handleTextareaKeyDown}
                onScroll={handleScroll}
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                style={{ 
                  fontSize: `${settings.fontSize}px`, 
                  lineHeight: `${baseLineHeight}px`, 
                  tabSize: settings.tabSize,
                  color: 'transparent',
                  caretColor: 'var(--text-primary)',
                  // Always reserve the scrollbar so the wrap width never changes
                  // when the content starts/stops overflowing (see the note on
                  // editorScrollbarWidth above).
                  overflowY: 'scroll',
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  paddingRight: '12px',
                  paddingLeft: `${codePaddingLeft}px`
                }}
                className={`absolute inset-0 w-full h-full m-0 font-mono-code bg-transparent resize-none focus:outline-none border-none select-text overflow-auto ${settings.wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}
              />
            </div>
          </>
        )}
      </div>

      {/* Auto-Suggestion Recommendation Bar */}
      <AnimatePresence>
        {activeSuggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.12 }}
            className="bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] px-2 py-1.5 flex items-center space-x-1.5 overflow-x-auto no-scrollbar shrink-0 shadow-lg z-20"
          >
            <div className="flex items-center space-x-1 text-[10px] font-semibold text-[var(--brand)] px-1.5 py-0.5 rounded bg-[var(--brand-subtle)] shrink-0 select-none">
              <Sparkles className="w-3 h-3" />
              <span>建议</span>
            </div>

            {activeSuggestions.map((item, idx) => {
              const isSelected = idx === selectedSuggestionIdx;
              return (
                <button
                  key={item.label + idx}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(item);
                  }}
                  onClick={() => applySuggestion(item)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono-code shrink-0 flex items-center space-x-1.5 transition-colors press-feedback ${
                    isSelected
                      ? 'bg-[var(--brand)] text-white font-medium shadow-sm'
                      : 'bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)]'
                  }`}
                >
                  <span className="font-semibold">{item.label}</span>
                  {item.detail && (
                    <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-[var(--text-tertiary)]'}`}>
                      {item.detail}
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Quick Symbol Access Bar (Floating at bottom of editor) */}
      <div className="bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] px-2 py-1.5 flex items-center space-x-1 overflow-x-auto no-scrollbar shrink-0 shadow-inner">
        <AnimatePresence>
          {isFS && (
            <motion.button
              key="exit-fs-bottom-btn"
              initial={{ opacity: 0, scale: 0.85, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.85, x: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleToggleFS}
              className="px-2.5 py-1 rounded-md bg-[var(--brand)] text-white text-xs font-medium flex items-center space-x-1 shrink-0 press-feedback shadow-sm mr-1.5"
              title="退出全屏 (Esc)"
            >
              <Minimize2 className="w-3.5 h-3.5 shrink-0" />
              <span>退出全屏</span>
            </motion.button>
          )}
        </AnimatePresence>

        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleIndent(false)}
          className="px-2.5 py-1 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-mono-code shrink-0 press-feedback font-medium"
          title="缩进 Tab"
        >
          Tab
        </button>

        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleIndent(true)}
          className="px-2.5 py-1 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-mono-code shrink-0 press-feedback font-medium"
          title="减少缩进 Shift+Tab"
        >
          &lt;-
        </button>

        {quickSymbols.map((sym) => (
          <button
            key={sym}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertSymbol(sym)}
            className="px-2.5 py-1 rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-mono-code shrink-0 press-feedback font-medium"
          >
            {sym}
          </button>
        ))}
      </div>
    </>
  )}

  {/* Properties Modal */}
      {activeFile && (
        <PropertiesModal
          isOpen={isPropertiesOpen}
          onClose={() => setIsPropertiesOpen(false)}
          target={{ type: 'file', file: activeFile }}
          project={project}
          onUpdateEncoding={onUpdateFileEncoding}
          onRenameFile={onRenameFile}
          onDownloadFile={onDownloadFile}
          onSetEntryFile={onSetEntryFile}
          onDeleteFile={onDeleteFile}
          onMoveFile={(file) => {
            setTransferMode('move');
            setMovingFile(file);
          }}
          onCopyFile={(file) => {
            setTransferMode('copy');
            setMovingFile(file);
          }}
        />
      )}

      {/* File Transfer Modal for Move/Copy from Properties */}
      <FileTransferModal
        isOpen={!!movingFile}
        onClose={() => setMovingFile(null)}
        file={movingFile}
        mode={transferMode}
        existingFolders={project.folders || []}
        allFiles={project.files || []}
        onConfirm={(fileId, newPath) => {
          if (transferMode === 'move') {
            if (onMoveFile) onMoveFile(fileId, newPath);
          } else {
            if (onCopyFile) onCopyFile(fileId, newPath);
          }
          setMovingFile(null);
        }}
      />
    </div>
  );
};
