import React from 'react';
import { ModalShell } from './ModalShell';
import { CodeLanguage, ExecutionType } from '../types';
import {
  FileCode,
  Terminal,
  Globe,
  BookOpen,
  Database,
  SquareCode,
  Braces,
  Play
} from 'lucide-react';

export interface LanguageOption {
  id: CodeLanguage;
  name: string;
  executionType: ExecutionType;
  description: string;
  icon: React.ReactNode;
}

export const PLAYGROUND_RUNTIMES: LanguageOption[] = [
  {
    id: 'javascript',
    name: 'JavaScript',
    executionType: 'js-sandbox',
    description: 'Web JavaScript 沙箱 (Console / DOM / ES6)',
    icon: <FileCode className="w-5 h-5 text-amber-500 shrink-0" />
  },
  {
    id: 'python',
    name: 'Python 3',
    executionType: 'python-sandbox',
    description: 'Python 3 解释器 (Pyodide WebAssembly / Skulpt)',
    icon: <Terminal className="w-5 h-5 text-blue-500 shrink-0" />
  },
  {
    id: 'html',
    name: 'HTML / Web 网页',
    executionType: 'html-preview',
    description: 'HTML + CSS + JS 完整网页实时渲染预览',
    icon: <Globe className="w-5 h-5 text-emerald-500 shrink-0" />
  },
  {
    id: 'markdown',
    name: 'Markdown',
    executionType: 'markdown-preview',
    description: 'Markdown 文档渲染与排版预览',
    icon: <BookOpen className="w-5 h-5 text-purple-500 shrink-0" />
  },
  {
    id: 'sql',
    name: 'SQL Query',
    executionType: 'sql-sandbox',
    description: 'SQLite 关系型数据库查询与操作',
    icon: <Database className="w-5 h-5 text-cyan-500 shrink-0" />
  },
  {
    id: 'shell',
    name: 'Shell 脚本',
    executionType: 'shell-sandbox',
    description: 'Bash / Shell 脚本执行沙箱',
    icon: <SquareCode className="w-5 h-5 text-slate-400 shrink-0" />
  },
  {
    id: 'json',
    name: 'JSON',
    executionType: 'json-sandbox',
    description: 'JSON 数据校验、解析与树形展示',
    icon: <Braces className="w-5 h-5 text-orange-500 shrink-0" />
  }
];

interface LanguageSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLanguage: (lang: CodeLanguage, executionType: ExecutionType) => void;
  currentLanguage?: CodeLanguage;
}

export const LanguageSelectModal: React.FC<LanguageSelectModalProps> = ({
  isOpen,
  onClose,
  onSelectLanguage,
  currentLanguage
}) => {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="选择运行语言环境"
      icon={<Play className="w-4 h-4 text-[var(--brand)] fill-current" />}
      maxWidth="max-w-md"
    >
      <div className="space-y-2">
        <p className="text-xs text-[var(--text-secondary)] pb-1">
          Playground 内存单文件模式：请选择要用于执行当前代码的语言引擎：
        </p>
        <div className="space-y-1.5">
          {PLAYGROUND_RUNTIMES.map((option) => {
            const isSelected = option.id === currentLanguage;
            return (
              <button
                key={option.id}
                onClick={() => {
                  onSelectLanguage(option.id, option.executionType);
                  onClose();
                }}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-colors press-feedback ${
                  isSelected
                    ? 'border-[var(--brand)] bg-[var(--brand-subtle)]/20'
                    : 'border-[var(--border-subtle)] hover:border-[var(--border-medium)] bg-[var(--bg-secondary)]'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0 pr-2">
                  {option.icon}
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--text-primary)] flex items-center space-x-1.5">
                      <span className="truncate">{option.name}</span>
                      {isSelected && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--brand)] text-white font-medium">
                          当前
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)] truncate mt-0.5">
                      {option.description}
                    </p>
                  </div>
                </div>
                <div className="shrink-0">
                  <span className="text-xs text-[var(--brand)] font-semibold flex items-center space-x-1">
                    <span>运行</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
};
