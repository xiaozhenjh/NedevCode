import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw, Terminal, Smartphone, Trash2, AlertCircle } from 'lucide-react';
import { CodeProject, ConsoleLogItem, ExecutionResult } from '../types';
import { buildHtmlBundle } from '../utils/codeRunner';

interface CodeRunnerProps {
  project: CodeProject;
  executionResult: ExecutionResult;
  isExecuting: boolean;
  onRunCode: () => void;
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
  const isHtmlProject = project.executionType === 'html-preview';
  const [runnerView, setRunnerView] = useState<'preview' | 'console'>(
    isHtmlProject ? 'preview' : 'console'
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Automatically adjust view if project changes
  useEffect(() => {
    if (!isHtmlProject && runnerView === 'preview') {
      setRunnerView('console');
    }
  }, [project.id, isHtmlProject]);

  // Scroll logs to bottom on new log
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [executionResult.logs.length]);

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

  const bundledHtml = isHtmlProject ? buildHtmlBundle(project.files) : '';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-primary)]">
      {/* Top Runner Toolbar */}
      <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-3 py-1.5 flex items-center justify-between shrink-0">
        {/* Left: View Mode Controls */}
        <div className="flex items-center space-x-1">
          {isHtmlProject ? (
            <div className="flex items-center space-x-1 bg-[var(--bg-tertiary)] p-0.5 rounded-lg">
              <button
                onClick={() => setRunnerView('preview')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center space-x-1 transition-colors ${
                  runnerView === 'preview'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>预览</span>
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
            <div className="flex items-center space-x-1 text-xs text-[var(--text-secondary)] font-medium">
              <Terminal className="w-3.5 h-3.5" />
              <span>控制台输出</span>
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
            onClick={onRunCode}
            disabled={isExecuting}
            className="px-2.5 py-1 rounded-lg bg-[var(--brand)] text-white text-xs font-medium press-feedback flex items-center space-x-1 hover:bg-[var(--brand-hover)]"
          >
            <RotateCcw className={`w-3 h-3 ${isExecuting ? 'animate-spin' : ''}`} />
            <span>重新运行</span>
          </button>
        </div>
      </div>

      {/* Main Runner Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* HTML Preview */}
        {runnerView === 'preview' && isHtmlProject && (
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            <iframe
              ref={iframeRef}
              srcDoc={bundledHtml}
              sandbox="allow-scripts allow-modals allow-same-origin"
              title="预览"
              className="flex-1 w-full h-full border-none bg-white"
            />
          </div>
        )}

        {/* Console */}
        {(runnerView === 'console' || !isHtmlProject) && (
          <div className="flex-1 flex flex-col h-full bg-[var(--bg-secondary)] overflow-hidden">
            {/* Status bar */}
            {executionResult.executionTimeMs !== undefined && (
              <div className="px-3 py-1 border-b border-[var(--border-subtle)] text-[10px] font-mono-code text-[var(--text-tertiary)] flex justify-between items-center">
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
          </div>
        )}
      </div>
    </div>
  );
};

