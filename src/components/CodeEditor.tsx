import React, { useState, useRef, useEffect } from 'react';
import {
  Undo, Redo, Sparkles, Play, Search, Replace, Plus, Trash2,
  FileCode, Check, ArrowRight, CornerDownLeft
} from 'lucide-react';
import { CodeLanguage, CodeProject, EditorSettings, ProjectFile } from '../types';
import { formatCode } from '../utils/codeRunner';
import { SyntaxHighlightedLine } from '../utils/syntaxHighlight';

interface CodeEditorProps {
  project: CodeProject;
  settings: EditorSettings;
  onUpdateFileContent: (fileId: string, newContent: string) => void;
  onSelectFile: (fileId: string) => void;
  onAddNewFile: (name: string, language: CodeLanguage) => void;
  onDeleteFile: (fileId: string) => void;
  onRunCode: () => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  project,
  settings,
  onUpdateFileContent,
  onSelectFile,
  onAddNewFile,
  onDeleteFile,
  onRunCode
}) => {
  const activeFile = project.files.find(f => f.id === project.activeFileId) || project.files[0];
  const [content, setContent] = useState(activeFile?.content || '');
  const [history, setHistory] = useState<string[]>([activeFile?.content || '']);
  const [historyIdx, setHistoryIdx] = useState(0);

  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  // Sync state on file switch
  useEffect(() => {
    if (activeFile) {
      setContent(activeFile.content);
      setHistory([activeFile.content]);
      setHistoryIdx(0);
    }
  }, [activeFile?.id]);

  // Handle textarea text change
  const handleChange = (newVal: string) => {
    setContent(newVal);
    onUpdateFileContent(activeFile.id, newVal);

    // Push history
    const nextHist = history.slice(0, historyIdx + 1);
    nextHist.push(newVal);
    if (nextHist.length > 50) nextHist.shift();
    setHistory(nextHist);
    setHistoryIdx(nextHist.length - 1);
  };

  // Undo / Redo
  const handleUndo = () => {
    if (historyIdx > 0) {
      const targetVal = history[historyIdx - 1];
      setHistoryIdx(historyIdx - 1);
      setContent(targetVal);
      onUpdateFileContent(activeFile.id, targetVal);
    }
  };

  const handleRedo = () => {
    if (historyIdx < history.length - 1) {
      const targetVal = history[historyIdx + 1];
      setHistoryIdx(historyIdx + 1);
      setContent(targetVal);
      onUpdateFileContent(activeFile.id, targetVal);
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
    const formatted = formatCode(content, activeFile.language);
    handleChange(formatted);
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
    if (!findText) return;
    const nextVal = content.split(findText).join(replaceText);
    handleChange(nextVal);
  };

  // Scroll sync between line numbers, highlight overlay & textarea
  const handleScroll = () => {
    if (textareaRef.current) {
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      }
      if (highlightRef.current) {
        highlightRef.current.scrollTop = textareaRef.current.scrollTop;
        highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
    }
  };

  // Create new file inside project
  const handleCreateFile = () => {
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    let lang: CodeLanguage = 'javascript';
    if (trimmed.endsWith('.html')) lang = 'html';
    else if (trimmed.endsWith('.css')) lang = 'css';
    else if (trimmed.endsWith('.json')) lang = 'json';
    else if (trimmed.endsWith('.py')) lang = 'python';
    else if (trimmed.endsWith('.ts')) lang = 'typescript';

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

  const lines = content.split('\n');
  const baseLineHeight = Math.max(20, Math.floor(settings.fontSize * 1.5));

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
        {showNewFileInput && (
          <div className="flex items-center space-x-2 pt-1.5 border-t border-[var(--border-subtle)]">
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
          </div>
        )}

        {/* Find & Replace Bar */}
        {showFindReplace && (
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
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
          </div>
        )}
      </div>

      {/* Editor Body with Synchronized Line Numbers */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Line Numbers Column */}
        {settings.lineNumbers && (
          <div
            ref={lineNumbersRef}
            className="w-11 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] text-right pr-2.5 py-3 font-mono-code text-xs select-none overflow-hidden shrink-0 border-r border-[var(--border-subtle)] opacity-70"
          >
            {lines.map((_, i) => (
              <div key={i} style={{ height: `${baseLineHeight}px`, lineHeight: `${baseLineHeight}px` }}>
                {i + 1}
              </div>
            ))}
          </div>
        )}

        {/* Code Area */}
        <div className="flex-1 relative overflow-hidden bg-[var(--bg-primary)]">
          {/* Syntax Highlight Overlay */}
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
            <code>
              <SyntaxHighlightedLine 
                code={content} 
                language={activeFile?.language || 'javascript'} 
                isDark={settings.theme === 'dark'} 
              />
            </code>
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
