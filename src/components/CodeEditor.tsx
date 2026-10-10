import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Undo, Redo, Sparkles, Play, Search, Replace, Plus, Trash2,
  FileCode, Check, ArrowRight, CornerDownLeft, GitBranch, Zap, Loader2,
  Maximize2, Minimize2, X, MoreHorizontal, ArrowDown, FileDiff, Columns, Rows, RotateCcw, ChevronDown,
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
import { SearchMode, buildSearchRegex, isValidRegex } from '../utils/searchUtils';
import { SearchModeDropdown } from './SearchModeDropdown';
import { PlaygroundLanguageDropdown } from './PlaygroundLanguageDropdown';
import { SuggestionItem, getSuggestionsForWord } from '../utils/suggestionEngine';
import { computeLineDiff } from '../utils/diffUtils';
import { PropertiesModal } from './PropertiesModal';
import { FileTransferModal, TransferMode } from './FileTransferModal';
import { MediaViewer } from './MediaViewer';
import { IDB_PLACEHOLDER_MARKER } from '../services/storage';

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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const editorBodyRef = useRef<HTMLDivElement>(null);

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
    const newVal = e.target.value;
    const { selectionStart, selectionEnd } = e.target;
    
    // Save cursor position for restoration after state sync
    selectionRef.current = { start: selectionStart, end: selectionEnd };
    
    handleChange(newVal);
    updateSuggestions(newVal, selectionEnd);
  };

  const handleTextareaCursorMove = () => {
    if (textareaRef.current) {
      const pos = textareaRef.current.selectionEnd;
      updateSuggestions(content, pos);
    }
  };

  const [isFormatting, setIsFormatting] = useState(false);

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  const displayedLines = useMemo(() => content.split('\n'), [content]);
  const baseLineHeight = Math.max(20, Math.floor(settings.fontSize * 1.5));

  // Virtualization window calculations
  // Disable virtualization when word wrap is enabled to ensure correct line rendering and sync
  const isWrapping = settings.wrapLines;
  const buffer = 15;
  const visibleStartIndex = isWrapping ? 0 : Math.max(0, Math.floor(scrollTop / baseLineHeight) - buffer);
  const visibleEndIndex = isWrapping ? displayedLines.length : Math.min(
    displayedLines.length,
    Math.ceil((scrollTop + editorHeight) / baseLineHeight) + buffer
  );

  const topSpacerHeight = isWrapping ? 0 : visibleStartIndex * baseLineHeight;
  const bottomSpacerHeight = isWrapping ? 0 : Math.max(0, (displayedLines.length - visibleEndIndex) * baseLineHeight);

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
          <div ref={editorBodyRef} className="flex-1 flex overflow-hidden relative code-editor-body">
        {showDiffMode && diffResult ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-primary)]">
            {/* Diff Header Bar */}
            <div className="px-3 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 select-none">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="font-semibold text-[var(--text-secondary)]">对比基准:</span>
                <select
                  value={diffBaselineSource}
                  onChange={(e) => setDiffBaselineSource(e.target.value)}
                  className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] font-mono-code focus:outline-none"
                >
                  <option value="initial">初始版本 (Baseline)</option>
                  {project.files.filter(f => f.id !== activeFile?.id).map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
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
            {/* Line Numbers Column (Virtualized) - Only for non-wrapping mode */}
            {settings.lineNumbers && !settings.wrapLines && (
              <div
                ref={lineNumbersRef}
                className="w-12 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] text-right pr-2.5 py-3 font-mono-code text-xs select-none overflow-hidden shrink-0 border-r border-[var(--border-subtle)] opacity-70"
              >
                {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px` }} />}
                {displayedLines.slice(visibleStartIndex, visibleEndIndex).map((_, i) => {
                  const lineNum = visibleStartIndex + i + 1;
                  return (
                    <div key={lineNum} style={{ height: `${baseLineHeight}px`, lineHeight: `${baseLineHeight}px` }}>
                      {lineNum}
                    </div>
                  );
                })}
                {bottomSpacerHeight > 0 && <div style={{ height: `${bottomSpacerHeight}px` }} />}
              </div>
            )}

            {/* Code Area */}
            <div className="flex-1 relative overflow-hidden bg-[var(--bg-primary)] code-editor-body">
              {/* Syntax Highlight Overlay (Virtualized) */}
              <pre
                ref={highlightRef}
                aria-hidden="true"
                className={`absolute inset-0 font-mono-code m-0 overflow-hidden pointer-events-none break-normal ${settings.wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}
                style={{ 
                  fontSize: `${settings.fontSize}px`, 
                  lineHeight: `${baseLineHeight}px`, 
                  tabSize: settings.tabSize,
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  paddingRight: '12px',
                  paddingLeft: '12px'
                }}
              >
                {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px` }} />}
                <code>
                  <SyntaxHighlightedLine 
                    code={displayedLines.slice(visibleStartIndex, visibleEndIndex).join('\n')} 
                    language={activeFile?.language || 'javascript'} 
                    isDark={isDarkTheme} 
                    searchQuery={findText}
                    searchMode={searchMode}
                    caseSensitive={caseSensitive}
                    showLineNumbers={settings.wrapLines && settings.lineNumbers}
                    startLineNumber={visibleStartIndex + 1}
                  />
                </code>
                {bottomSpacerHeight > 0 && <div style={{ height: `${bottomSpacerHeight}px` }} />}
              </pre>

              {/* Real-time Code Textarea */}
              <textarea
                ref={textareaRef}
                value={content}
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
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  paddingRight: '12px',
                  paddingLeft: settings.wrapLines && settings.lineNumbers ? '60px' : '12px'
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
          onUpdateFileContent={onUpdateFileContent}
          onAddNewFile={onAddNewFile}
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
