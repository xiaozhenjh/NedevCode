import React from 'react';
import { X, Moon, Sun } from 'lucide-react';
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 select-none">
      <div className="w-full max-w-md bg-[var(--bg-secondary)] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl border border-[var(--border-subtle)] space-y-4 max-h-[90vh] overflow-y-auto">
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
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onUpdateSettings({ theme: 'light' })}
              className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 press-feedback transition-colors ${
                settings.theme === 'light'
                  ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              <Sun className="w-4 h-4 text-[#ed6f21]" />
              <span className="text-xs">浅色</span>
            </button>

            <button
              onClick={() => onUpdateSettings({ theme: 'dark' })}
              className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 press-feedback transition-colors ${
                settings.theme === 'dark'
                  ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              <Moon className="w-4 h-4 text-[#317af7]" />
              <span className="text-xs">深色</span>
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
          <div className="flex items-center justify-between">
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
              className="text-xs text-[var(--brand)] hover:underline"
            >
              查看协议
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
