import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Undo, Redo, Sparkles, Play, Search, Replace, Plus, Trash2,
  FileCode, Check, ArrowRight, CornerDownLeft, GitBranch, Zap, Loader2
} from 'lucide-react';
import { CodeLanguage, CodeProject, EditorSettings, ProjectFile } from '../types';
import { detectLanguage, getFileSizeBytes, formatFileSize, isLargeFile, LARGE_FILE_CHUNK_SIZE } from '../utils/fileUtils';
import { formatCode } from '../utils/codeRunner';
import { SyntaxHighlightedLine } from '../utils/syntaxHighlight';

interface CodeEditorProps {
  project: CodeProject;
  settings: EditorSettings;
  onUpdateFileContent: (fileId: string, newContent: string) => void;
  onSelectFile: (fileId: string) => void;
  onAddNewFile: (name: string, language: CodeLanguage, initialContent?: string) => void;
  onDeleteFile: (fileId: string) => void;
  onRenameFile?: (fileId: string, newName: string) => void;
  onMoveFile?: (fileId: string, newPath: string) => void;
  onCopyFile?: (fileId: string) => void;
  onSetEntryFile?: (fileId: string) => void;
  onDownloadFile?: (fileId: string) => void;
  onOpenGitPush?: () => void;
  onRunCode: () => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  project,
  settings,
  onUpdateFileContent,
  onSelectFile,
  onAddNewFile,
  onDeleteFile,
  onRenameFile,
  onMoveFile,
  onCopyFile,
  onSetEntryFile,
  onDownloadFile,
  onOpenGitPush,
  onRunCode
}) => {
  const activeFile = project.files.find(f => f.id === project.activeFileId) || project.files[0];
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
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);

  const [scrollTop, setScrollTop] = useState(0);
  const [editorHeight, setEditorHeight] = useState(600);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // Quick Format Code
  const handleFormat = () => {
    if (!activeFile) return;
    if (isLarge && !isFullyLoaded) {
      handleLoadAll();
    }
    const formatted = formatCode(rawContent, activeFile.language);
    setContent(formatted);
    onUpdateFileContent(activeFile.id, formatted);
  };

  // Indent with 2 spaces
  const handleIndent = (outdent = false) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const curVal = el.value;

    if (!outdent) {
      insertSymbol('  ');
    } else {
      // Outdent: remove leading spaces on current line
      const lineStart = curVal.lastIndexOf('\n', start - 1) + 1;
      if (curVal.substr(lineStart, 2) === '  ') {
        const nextVal = curVal.substring(0, lineStart) + curVal.substring(lineStart + 2);
        handleChange(nextVal);
      }
    }
  };

  // Find & Replace
  const handleReplaceAll = () => {
    if (!findText || !activeFile) return;
    if (isLarge && !isFullyLoaded) {
      handleLoadAll();
    }
    const targetSource = (isLarge && !isFullyLoaded) ? rawContent : content;
    const nextVal = targetSource.split(findText).join(replaceText);
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

  // Create new file inside project
  const handleCreateFile = () => {
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    const lang = detectLanguage(trimmed);

    onAddNewFile(trimmed, lang);
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
  const buffer = 15;
  const visibleStartIndex = Math.max(0, Math.floor(scrollTop / baseLineHeight) - buffer);
  const visibleEndIndex = Math.min(
    displayedLines.length,
    Math.ceil((scrollTop + editorHeight) / baseLineHeight) + buffer
  );

  const topSpacerHeight = visibleStartIndex * baseLineHeight;
  const bottomSpacerHeight = Math.max(0, (displayedLines.length - visibleEndIndex) * baseLineHeight);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-secondary)]">
      {/* File Tabs & Editor Controls */}
      <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-3 py-2 flex flex-col space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          {/* File Tabs */}
          <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar max-w-[55%]">
            {project.files.map((file) => (
              <div key={file.id} className="flex items-center shrink-0">
                <button
                  onClick={() => onSelectFile(file.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono-code flex items-center space-x-1 transition-colors ${
                    file.id === activeFile?.id
                      ? 'bg-[var(--brand-subtle)] text-[var(--brand)] font-bold border border-[var(--brand-border)]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>{file.name}</span>
                </button>
                {project.files.length > 1 && file.id === activeFile?.id && !file.isEntry && (
                  <button
                    onClick={() => onDeleteFile(file.id)}
                    className="p-1 ml-0.5 text-[var(--text-tertiary)] hover:text-[var(--warning)]"
                    title="删除当前文件"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}

            {/* Add File button */}
            {!showNewFileInput && (
              <button
                onClick={() => setShowNewFileInput(true)}
                className="p-1 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] press-feedback"
                title="添加新文件"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Toolbar */}
          <div className="flex items-center space-x-1 shrink-0">
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
              className="p-1.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] press-feedback text-xs"
              title="格式化代码"
            >
              <Sparkles className="w-3.5 h-3.5" />
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
          </div>
        </div>

        {/* Inline New File Input Form */}
        <AnimatePresence>
          {showNewFileInput && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden flex items-center space-x-2 pt-1.5 border-t border-[var(--border-subtle)]"
            >
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="文件名 (例如: helper.js 或 style.css)"
                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)] font-mono-code focus:outline-none focus:border-[var(--brand)]"
                autoFocus
              />
              <button
                onClick={handleCreateFile}
                className="px-2.5 py-1 bg-[var(--brand)] text-white text-xs font-semibold rounded-lg press-feedback"
              >
                创建
              </button>
              <button
                onClick={() => setShowNewFileInput(false)}
                className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                取消
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Find & Replace Bar */}
        <AnimatePresence>
          {showFindReplace && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden pt-2 border-t border-[var(--border-subtle)] space-y-1.5"
            >
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="查找内容..."
                  className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] font-mono-code focus:outline-none focus:border-[var(--brand)]"
                />
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="替换为..."
                  className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] font-mono-code focus:outline-none focus:border-[var(--brand)]"
                />
                <button
                  onClick={handleReplaceAll}
                  className="px-2.5 py-1 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-medium rounded-lg press-feedback flex items-center space-x-1"
                >
                  <Replace className="w-3 h-3" />
                  <span>全部替换</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Large File Lazy Loading Status Bar */}
      {isLarge && (
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

      {/* Editor Body with Synchronized Line Numbers */}
      <div ref={editorBodyRef} className="flex-1 flex overflow-hidden relative">
        {/* Line Numbers Column (Virtualized) */}
        {settings.lineNumbers && (
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
        <div className="flex-1 relative overflow-hidden bg-[var(--bg-primary)]">
          {/* Syntax Highlight Overlay (Virtualized) */}
          <pre
            ref={highlightRef}
            aria-hidden="true"
            className="absolute inset-0 p-3 font-mono-code m-0 overflow-hidden pointer-events-none break-normal whitespace-pre"
            style={{ 
              fontSize: `${settings.fontSize}px`, 
              lineHeight: `${baseLineHeight}px`, 
              tabSize: settings.tabSize 
            }}
          >
            {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px` }} />}
            <code>
              <SyntaxHighlightedLine 
                code={displayedLines.slice(visibleStartIndex, visibleEndIndex).join('\n')} 
                language={activeFile?.language || 'javascript'} 
                isDark={isDarkTheme} 
                searchQuery={findText}
              />
            </code>
            {bottomSpacerHeight > 0 && <div style={{ height: `${bottomSpacerHeight}px` }} />}
          </pre>

          {/* Real-time Code Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleChange(e.target.value)}
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
              caretColor: 'var(--text-primary)'
            }}
            className="absolute inset-0 w-full h-full p-3 m-0 font-mono-code bg-transparent resize-none focus:outline-none border-none whitespace-pre select-text overflow-auto"
          />
        </div>
      </div>

      {/* Mobile Quick Symbol Access Bar (Floating at bottom of editor) */}
      <div className="bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] px-2 py-1.5 flex items-center space-x-1 overflow-x-auto no-scrollbar shrink-0 shadow-inner">
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
    </div>
  );
};
