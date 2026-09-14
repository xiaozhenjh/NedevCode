import React, { useState, useMemo } from 'react';
import { X, Package, Download, Copy, Check, Eye, Code } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CodeProject } from '../types';
import { generateSingleFileHtml, downloadFile } from '../utils/singleFilePackager';

interface SingleFileBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: CodeProject | null | undefined;
}

export const SingleFileBundleModal: React.FC<SingleFileBundleModalProps> = ({
  isOpen,
  onClose,
  project
}) => {
  const [activeView, setActiveView] = useState<'code' | 'preview'>('code');
  const [copied, setCopied] = useState(false);

  const bundledHtml = useMemo(() => {
    if (!project) return '';
    return generateSingleFileHtml(project);
  }, [project]);

  if (!project) return null;

  const fileSizeKb = (new Blob([bundledHtml]).size / 1024).toFixed(1);

  const handleDownload = () => {
    const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'bundle'}.single.html`;
    downloadFile(filename, bundledHtml, 'text/html');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bundledHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="single-file-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 select-none"
          onClick={onClose}
        >
          <motion.div
            id="single-file-modal-card"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340 }}
            className="w-full max-w-2xl bg-[var(--bg-secondary)] rounded-t-2xl sm:rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-4 sm:p-5 space-y-3 sm:space-y-4 max-h-[90vh] h-[85vh] sm:h-auto flex flex-col overflow-hidden text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-[var(--brand-subtle)] text-[var(--brand)]">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">单文件插件 - 打包单个 HTML</h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                合并所有 HTML/CSS/JS/Python 代码为单个自包含 HTML 文件（{fileSizeKb} KB）
              </p>
            </div>
          </div>

          <button
            id="btn-close-single-file-modal"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] press-feedback transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* View Toggle and Actions */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-1 bg-[var(--bg-tertiary)] p-0.5 rounded-lg">
            <button
              onClick={() => setActiveView('code')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                activeView === 'code'
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>HTML 源码</span>
            </button>

            <button
              onClick={() => setActiveView('preview')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                activeView === 'preview'
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>内嵌预览</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="btn-copy-single-html"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] text-xs font-medium press-feedback flex items-center space-x-1 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '已复制' : '复制代码'}</span>
            </button>

            <button
              id="btn-download-single-html"
              onClick={handleDownload}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium press-feedback flex items-center space-x-1.5 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载单文件 HTML</span>
            </button>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 min-h-[280px] h-[340px] sm:h-[420px] max-h-[60vh] bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-subtle)] overflow-hidden flex flex-col relative">
          {activeView === 'code' ? (
            <textarea
              readOnly
              spellCheck={false}
              value={bundledHtml}
              className="flex-1 w-full h-full min-h-0 p-3 font-mono-code text-xs text-[var(--text-primary)] bg-transparent resize-none focus:outline-none overflow-y-auto leading-relaxed select-text"
              style={{ flex: '1 1 0%', minHeight: '100%', height: '100%', display: 'block' }}
            />
          ) : (
            <iframe
              srcDoc={bundledHtml}
              sandbox="allow-scripts allow-modals allow-same-origin"
              title="单文件预览"
              className="flex-1 w-full h-full min-h-0 border-none bg-white"
              style={{ flex: '1 1 0%', minHeight: '100%', height: '100%', display: 'block' }}
            />
          )}
        </div>

        {/* Footer info */}
        <div className="text-[11px] text-[var(--text-tertiary)] pt-1">
          提示：单文件 HTML 已将全部样式与逻辑内嵌，可在任意桌面或移动端离线直接双击打开运行。
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
