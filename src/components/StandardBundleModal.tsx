import React, { useState, useMemo } from 'react';
import { X, Package, Download, Copy, Check, Eye, Code } from 'lucide-react';
import { CodeProject } from '../types';
import { generateStandardBundle, downloadFile } from '../utils/standardBundlePackager';
import { ModalShell } from './ModalShell';

interface StandardBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: CodeProject | null | undefined;
}

export const StandardBundleModal: React.FC<StandardBundleModalProps> = ({
  isOpen,
  onClose,
  project
}) => {
  const [activeView, setActiveView] = useState<'code' | 'preview'>('code');
  const [copied, setCopied] = useState(false);

  const bundledHtml = useMemo(() => {
    if (!project) return '';
    return generateStandardBundle(project);
  }, [project]);

  if (!project) return null;

  const fileSizeKb = (new Blob([bundledHtml]).size / 1024).toFixed(1);

  const handleDownload = () => {
    if (!project) return;
    const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'bundle'}.bundle.html`;
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
    <ModalShell
      id="standard-bundle-modal"
      isOpen={isOpen && !!project}
      onClose={onClose}
      maxWidth="max-w-2xl"
      className="p-4 sm:p-5 space-y-3 sm:space-y-4 max-h-[90vh] h-[85vh] sm:h-auto flex flex-col overflow-hidden text-left"
    >
      {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-[var(--brand-subtle)] text-[var(--brand)]">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">标准 HTML 打包</h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                将所有代码与资源合并为标准 HTML 打包文件（{fileSizeKb} KB）
              </p>
            </div>
          </div>

          <button
            id="btn-close-bundle-modal"
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
              <span>预览</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="btn-copy-html"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] text-xs font-medium press-feedback flex items-center space-x-1 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '已复制' : '复制代码'}</span>
            </button>

            <button
              id="btn-download-bundle-html"
              onClick={handleDownload}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium press-feedback flex items-center space-x-1.5 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载打包文件</span>
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
              title="资源打包预览"
              className="flex-1 w-full h-full min-h-0 border-none bg-white"
              style={{ flex: '1 1 0%', minHeight: '100%', height: '100%', display: 'block' }}
            />
          )}
        </div>

        {/* Footer info */}
        <div className="text-[11px] text-[var(--text-tertiary)] pt-1">
          提示：打包文件已整合项目代码并优先使用本地环境资源。
        </div>
    </ModalShell>
  );
};
