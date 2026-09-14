import React from 'react';
import { X, Moon, Sun, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EditorSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EditorSettings;
  onUpdateSettings: (newSettings: Partial<EditorSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const handleOpenPrivacyExternal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = 'https://agreement-drcn.hispace.dbankcloud.cn/index.html?lang=zh&agreementId=2028614000513680192';

    const win = window as any;
    // 1. Check native hybrid app bridges (Android / HarmonyOS / WebView)
    if (typeof win.android?.openBrowser === 'function') {
      win.android.openBrowser(url);
      return;
    }
    if (typeof win.Android?.openBrowser === 'function') {
      win.Android.openBrowser(url);
      return;
    }
    if (typeof win.Android?.openExternalBrowser === 'function') {
      win.Android.openExternalBrowser(url);
      return;
    }
    if (typeof win.jsBridge?.openBrowser === 'function') {
      win.jsBridge.openBrowser(url);
      return;
    }
    if (typeof win.JSBridge?.openExternal === 'function') {
      win.JSBridge.openExternal(url);
      return;
    }
    if (win.webkit?.messageHandlers?.openBrowser?.postMessage) {
      win.webkit.messageHandlers.openBrowser.postMessage(url);
      return;
    }

    // 2. Try _system target (Cordova / InAppBrowser / Capacitor for external system browser)
    try {
      const sysWin = window.open(url, '_system');
      if (sysWin && !sysWin.closed) return;
    } catch {
      // ignore
    }

    // 3. Fallback to window.open with _blank and noopener
    try {
      const newWin = window.open(url, '_blank', 'noopener=yes,noreferrer=yes');
      if (newWin && !newWin.closed) return;
    } catch {
      // ignore
    }

    // 4. Fallback anchor tag click with external target
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 select-none"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340 }}
            className="w-full max-w-md bg-[var(--bg-secondary)] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl border border-[var(--border-subtle)] space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">设置</h2>
              <button
                onClick={onClose}
                className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] press-feedback"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

        {/* Theme Settings */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--text-secondary)]">主题</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onUpdateSettings({ theme: 'light' })}
              className={`p-2.5 rounded-xl border flex flex-col items-center justify-center space-y-1.5 press-feedback transition-colors ${
                settings.theme === 'light'
                  ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              <Sun className="w-4 h-4 text-[#ed6f21]" />
              <span className="text-[11px]">浅色</span>
            </button>

            <button
              onClick={() => onUpdateSettings({ theme: 'dark' })}
              className={`p-2.5 rounded-xl border flex flex-col items-center justify-center space-y-1.5 press-feedback transition-colors ${
                settings.theme === 'dark'
                  ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              <Moon className="w-4 h-4 text-[#317af7]" />
              <span className="text-[11px]">深色</span>
            </button>

            <button
              onClick={() => onUpdateSettings({ theme: 'system' })}
              className={`p-2.5 rounded-xl border flex flex-col items-center justify-center space-y-1.5 press-feedback transition-colors ${
                settings.theme === 'system'
                  ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-[#317af7] to-[#ed6f21]" />
              <span className="text-[11px]">自动跟随</span>
            </button>
          </div>
        </div>

        {/* Font Size Settings */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-medium text-[var(--text-secondary)]">字号</label>
            <span className="text-xs font-mono-code text-[var(--brand)]">{settings.fontSize}px</span>
          </div>
          <div className="flex items-center space-x-2">
            {[12, 14, 16, 18].map((size) => (
              <button
                key={size}
                onClick={() => onUpdateSettings({ fontSize: size })}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono-code transition-colors press-feedback ${
                  settings.fontSize === size
                    ? 'bg-[var(--brand)] text-white font-medium'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                {size}px
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
          {/* Python Engine Settings */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Python 运行引擎</label>
              <span className="text-[11px] text-[var(--brand)] font-mono-code">
                {settings.pythonEngine === 'wasm'
                  ? '强制 Wasm'
                  : settings.pythonEngine === 'skulpt'
                  ? '强制纯 JS'
                  : '自动检测'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => onUpdateSettings({ pythonEngine: 'auto' })}
                className={`p-2 rounded-lg border text-left flex flex-col justify-between press-feedback transition-colors ${
                  (settings.pythonEngine || 'auto') === 'auto'
                    ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                <span className="text-xs font-medium">自动检测</span>
                <span className="text-[10px] opacity-75 mt-0.5 leading-tight">优先 Wasm 降级纯 JS</span>
              </button>

              <button
                onClick={() => onUpdateSettings({ pythonEngine: 'wasm' })}
                className={`p-2 rounded-lg border text-left flex flex-col justify-between press-feedback transition-colors ${
                  settings.pythonEngine === 'wasm'
                    ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                <span className="text-xs font-medium">Pyodide</span>
                <span className="text-[10px] opacity-75 mt-0.5 leading-tight">Wasm 完整内核</span>
              </button>

              <button
                onClick={() => onUpdateSettings({ pythonEngine: 'skulpt' })}
                className={`p-2 rounded-lg border text-left flex flex-col justify-between press-feedback transition-colors ${
                  settings.pythonEngine === 'skulpt'
                    ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                <span className="text-xs font-medium">Skulpt</span>
                <span className="text-[10px] opacity-75 mt-0.5 leading-tight">纯 JS 兼容模式</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-[var(--text-primary)]">行号显示</span>
            <button
              onClick={() => onUpdateSettings({ lineNumbers: !settings.lineNumbers })}
              className={`w-10 h-5 rounded-full transition-colors relative press-feedback ${
                settings.lineNumbers ? 'bg-[var(--brand)]' : 'bg-[var(--text-disabled)]'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.lineNumbers ? 'transform translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-primary)]">缩进空格</span>
            <div className="flex space-x-1">
              {[2, 4].map((size) => (
                <button
                  key={size}
                  onClick={() => onUpdateSettings({ tabSize: size })}
                  className={`px-2.5 py-1 rounded text-xs font-mono-code ${
                    settings.tabSize === size
                      ? 'bg-[var(--brand)] text-white font-medium'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                  }`}
                >
                  {size} 格
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
            <span className="text-xs text-[var(--text-secondary)]">隐私政策与条款</span>
            <a
              href="https://agreement-drcn.hispace.dbankcloud.cn/index.html?lang=zh&agreementId=2028614000513680192"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleOpenPrivacyExternal}
              className="text-xs text-[var(--brand)] hover:underline flex items-center space-x-1"
              title="在外部浏览器打开隐私政策"
            >
              <span>查看协议</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
};
