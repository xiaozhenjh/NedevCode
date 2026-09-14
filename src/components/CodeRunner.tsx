import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw, Terminal, Smartphone, Trash2, AlertCircle, CornerDownLeft, Send, FileText, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeProject, ConsoleLogItem, ExecutionResult } from '../types';
import { buildHtmlBundle } from '../utils/codeRunner';
import { getProjectEntryFile, resolveRuntimeFromEntryFile } from '../utils/fileUtils';

interface CodeRunnerProps {
  project: CodeProject;
  executionResult: ExecutionResult;
  isExecuting: boolean;
  onRunCode: (onPrompt?: (promptMsg: string) => Promise<string>) => void;
  onClearLogs: () => void;
  onAddLog: (log: ConsoleLogItem) => void;
}

export const CodeRunner: React.FC<CodeRunnerProps> = ({
  project,
  executionResult,
  isExecuting,
  onRunCode,
  onClearLogs,
  onAddLog
}) => {
  const entryFile = getProjectEntryFile(project.files);
  const runtimeResolution = resolveRuntimeFromEntryFile(entryFile);
  const isHtmlProject = runtimeResolution.runtime === 'html-preview';
  const isMarkdownProject = runtimeResolution.runtime === 'markdown-preview';
  const hasPreview = isHtmlProject || isMarkdownProject;

  const [runnerView, setRunnerView] = useState<'preview' | 'console'>(
    hasPreview ? 'preview' : 'console'
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Input prompt modal state for Python input()
  const [isPromptActive, setIsPromptActive] = useState(false);
  const [promptMessage, setPromptMessage] = useState('');
  const [promptValue, setPromptValue] = useState('');
  const promptResolverRef = useRef<((val: string) => void) | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);

  // Automatically adjust view if project changes
  useEffect(() => {
    if (!hasPreview && runnerView === 'preview') {
      setRunnerView('console');
    }
  }, [project.id, hasPreview]);

  // Scroll logs to bottom on new log
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [executionResult.logs.length, isPromptActive]);

  // Focus prompt input when requested
  useEffect(() => {
    if (isPromptActive) {
      setTimeout(() => {
        promptInputRef.current?.focus();
      }, 50);
    }
  }, [isPromptActive]);

  // Listen to postMessage logs from iframe
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      if (event.data && (event.data.type === 'APP_CONSOLE_LOG' || event.data.type === 'ARK_CONSOLE_LOG')) {
        const item: ConsoleLogItem = {
          id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          level: event.data.level || 'log',
          message: event.data.message || '',
          timestamp: event.data.timestamp || Date.now()
        };
        onAddLog(item);
      }
    };

    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [onAddLog]);

  // Prompt handler for Python input()
  const handlePrompt = (promptText: string): Promise<string> => {
    return new Promise((resolve) => {
      setPromptMessage(promptText || '请输入:');
      setPromptValue('');
      setIsPromptActive(true);
      promptResolverRef.current = resolve;
    });
  };

  const handlePromptSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = promptValue;
    setIsPromptActive(false);
    onAddLog({
      id: 'input-' + Date.now(),
      level: 'log',
      message: `${promptMessage ? promptMessage + ' ' : ''}${val}`,
      timestamp: Date.now()
    });
    if (promptResolverRef.current) {
      promptResolverRef.current(val);
      promptResolverRef.current = null;
    }
    setPromptValue('');
  };

  const handleTriggerRun = () => {
    onRunCode(handlePrompt);
  };

  const bundledHtml = isHtmlProject ? buildHtmlBundle(project.files, project.npmPackages || []) : '';

  const markdownContent = isMarkdownProject ? (entryFile?.content || '') : '';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-primary)]">
      {/* Top Runner Toolbar */}
      <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-3 py-1.5 flex items-center justify-between shrink-0">
        {/* Left: View Mode Controls */}
        <div className="flex items-center space-x-1">
          {hasPreview ? (
            <div className="flex items-center space-x-1 bg-[var(--bg-tertiary)] p-0.5 rounded-lg">
              <button
                onClick={() => setRunnerView('preview')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center space-x-1 transition-colors ${
                  runnerView === 'preview'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {isMarkdownProject ? (
                  <FileText className="w-3.5 h-3.5" />
                ) : (
                  <Smartphone className="w-3.5 h-3.5" />
                )}
                <span>{isMarkdownProject ? '文档预览' : '预览'}</span>
              </button>

              <button
                onClick={() => setRunnerView('console')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center space-x-1 transition-colors ${
                  runnerView === 'console'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>控制台</span>
                {executionResult.logs.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--brand-subtle)] text-[var(--brand)]">
                    {executionResult.logs.length}
                  </span>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-xs text-[var(--text-secondary)] font-medium">
              <Terminal className="w-3.5 h-3.5" />
              <span>控制台输出</span>
              {project.packages && project.packages.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--brand)] font-mono-code">
                  Py包: {project.packages.length}
                </span>
              )}
              {project.npmPackages && project.npmPackages.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--brand)] font-mono-code">
                  NPM包: {project.npmPackages.length}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-1.5">
          {runnerView === 'console' && executionResult.logs.length > 0 && (
            <button
              onClick={onClearLogs}
              className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded press-feedback"
              title="清空日志"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={handleTriggerRun}
            disabled={isExecuting}
            className="px-2.5 py-1 rounded-lg bg-[var(--brand)] text-white text-xs font-medium press-feedback flex items-center space-x-1 hover:bg-[var(--brand-hover)]"
          >
            <RotateCcw className={`w-3 h-3 ${isExecuting ? 'animate-spin' : ''}`} />
            <span>{isExecuting ? '正在执行...' : '重新运行'}</span>
          </button>
        </div>
      </div>

      {/* Main Runner Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <AnimatePresence mode="wait">
          {/* HTML Preview */}
          {runnerView === 'preview' && isHtmlProject && (
            <motion.div
              key={`preview-html-${project.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col bg-white overflow-hidden"
            >
              <iframe
                ref={iframeRef}
                srcDoc={bundledHtml}
                sandbox="allow-scripts allow-modals allow-same-origin"
                title="预览"
                className="flex-1 w-full h-full border-none bg-white"
              />
            </motion.div>
          )}

          {/* Markdown Preview */}
          {runnerView === 'preview' && isMarkdownProject && (
            <motion.div
              key={`preview-markdown-${project.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[var(--bg-primary)] text-[var(--text-primary)] select-text"
            >
              <div className="max-w-3xl mx-auto markdown-body">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-xl sm:text-2xl font-bold border-b border-[var(--border-subtle)] pb-2 mb-4 mt-6 first:mt-0 text-[var(--text-primary)]">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-lg sm:text-xl font-bold border-b border-[var(--border-subtle)] pb-1 mb-3 mt-5 text-[var(--text-primary)]">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-base sm:text-lg font-semibold mb-2 mt-4 text-[var(--text-primary)]">
                        {children}
                      </h3>
                    ),
                    h4: ({ children }) => (
                      <h4 className="text-sm sm:text-base font-semibold mb-2 mt-3 text-[var(--text-primary)]">
                        {children}
                      </h4>
                    ),
                    p: ({ children }) => (
                      <p className="leading-relaxed mb-3 text-xs sm:text-sm text-[var(--text-primary)]">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside mb-3 space-y-1 text-xs sm:text-sm text-[var(--text-primary)]">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside mb-3 space-y-1 text-xs sm:text-sm text-[var(--text-primary)]">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-[var(--brand)] pl-3 py-1.5 my-3 bg-[var(--bg-tertiary)] rounded-r text-xs sm:text-sm text-[var(--text-secondary)] italic">
                        {children}
                      </blockquote>
                    ),
                    code: ({ inline, className, children, ...props }: any) => {
                      if (inline) {
                        return (
                          <code
                            className="bg-[var(--bg-tertiary)] text-[var(--brand)] px-1.5 py-0.5 rounded text-xs font-mono-code border border-[var(--border-subtle)]"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      }
                      return (
                        <pre className="bg-[var(--bg-tertiary)] p-3 rounded-lg overflow-x-auto text-xs font-mono-code my-3 border border-[var(--border-subtle)] text-[var(--text-primary)]">
                          <code>{children}</code>
                        </pre>
                      );
                    },
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-4 border border-[var(--border-subtle)] rounded-lg">
                        <table className="min-w-full divide-y divide-[var(--border-subtle)] text-xs text-left">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-[var(--bg-tertiary)] font-semibold text-[var(--text-primary)]">
                        {children}
                      </thead>
                    ),
                    th: ({ children }) => (
                      <th className="px-3 py-2 border-b border-[var(--border-subtle)] font-medium text-[var(--text-primary)]">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-2 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                        {children}
                      </td>
                    ),
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--brand)] hover:underline"
                      >
                        {children}
                      </a>
                    ),
                    hr: () => <hr className="my-5 border-[var(--border-subtle)]" />,
                    input: ({ type, checked, ...props }: any) => {
                      if (type === 'checkbox') {
                        return (
                          <input
                            type="checkbox"
                            checked={checked}
                            readOnly
                            className="mr-2 accent-[var(--brand)] rounded"
                            {...props}
                          />
                        );
                      }
                      return <input type={type} {...props} />;
                    }
                  }}
                >
                  {markdownContent || '*(空文档)*'}
                </Markdown>
              </div>
            </motion.div>
          )}

          {/* Console */}
          {(runnerView === 'console' || !hasPreview) && (
            <motion.div
              key="console"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col h-full bg-[var(--bg-secondary)] overflow-hidden"
            >
            {/* Status bar */}
            {executionResult.executionTimeMs !== undefined && (
              <div className="px-3 py-1 border-b border-[var(--border-subtle)] text-[10px] font-mono-code text-[var(--text-tertiary)] flex justify-between items-center shrink-0">
                <span>状态: {executionResult.status === 'error' ? '异常' : '就绪'}</span>
                <span>耗时 {executionResult.executionTimeMs}ms</span>
              </div>
            )}

            {/* Logs List Viewport */}
            <div
              ref={logsContainerRef}
              className="flex-1 overflow-y-auto p-3 space-y-1 font-mono-code text-xs bg-[var(--bg-secondary)] select-text"
            >
              {/* Return value */}
              {executionResult.returnValue !== undefined && (
                <div className="p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs mb-2">
                  <div className="text-[10px] text-[var(--text-tertiary)] mb-0.5">
                    返回值:
                  </div>
                  <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                    {String(executionResult.returnValue)}
                  </pre>
                </div>
              )}

              {/* Error message */}
              {executionResult.error && (
                <div className="p-2.5 rounded bg-[var(--warning-subtle)] border border-[var(--warning)] text-[var(--warning)] text-xs mb-2">
                  <div className="font-semibold flex items-center space-x-1 mb-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>执行错误</span>
                  </div>
                  <div className="leading-relaxed">
                    {executionResult.error.message}
                  </div>
                  {executionResult.error.line && (
                    <div className="text-[10px] mt-1 opacity-80">
                      位置: 第 {executionResult.error.line} 行, 第 {executionResult.error.column || 0} 列
                    </div>
                  )}
                </div>
              )}

              {executionResult.logs.length === 0 && !executionResult.error && executionResult.returnValue === undefined ? (
                <div className="py-12 text-center text-[var(--text-tertiary)] text-xs space-y-1">
                  <p>无控制台输出</p>
                </div>
              ) : (
                executionResult.logs.map((log) => {
                  const timeStr = new Date(log.timestamp).toTimeString().split(' ')[0];

                  return (
                    <div
                      key={log.id}
                      className={`flex items-start space-x-2 py-1 px-1.5 rounded text-xs ${
                        log.level === 'error'
                          ? 'bg-[var(--warning-subtle)] text-[var(--warning)]'
                          : log.level === 'warn'
                          ? 'bg-[var(--alert-subtle)] text-[var(--alert)]'
                          : log.level === 'system'
                          ? 'text-[var(--text-tertiary)] italic'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="text-[10px] text-[var(--text-tertiary)] select-none shrink-0 pt-0.5">
                        {timeStr}
                      </span>

                      <div className="flex-1 whitespace-pre-wrap break-all leading-relaxed font-mono-code">
                        {log.message}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Interactive Python input() bar */}
            <AnimatePresence>
              {isPromptActive && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden p-2.5 bg-[var(--bg-tertiary)] border-t border-[var(--border-subtle)] shrink-0 select-none"
                >
                  <div className="text-[11px] text-[var(--text-secondary)] font-mono-code mb-1 flex items-center space-x-1">
                    <Terminal className="w-3 h-3 text-[var(--brand)]" />
                    <span>等待用户输入: {promptMessage}</span>
                  </div>
                  <form onSubmit={handlePromptSubmit} className="flex space-x-1.5">
                    <input
                      ref={promptInputRef}
                      type="text"
                      value={promptValue}
                      onChange={(e) => setPromptValue(e.target.value)}
                      placeholder="输入内容后按回车提交..."
                      className="flex-1 px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] focus:border-[var(--brand)] rounded-lg text-xs font-mono-code text-[var(--text-primary)] outline-none"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium rounded-lg press-feedback flex items-center space-x-1"
                    >
                      <CornerDownLeft className="w-3.5 h-3.5" />
                      <span>发送</span>
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
};
