import React from 'react';
import { Settings, GitBranch, GitFork } from 'lucide-react';
import { CodeProject } from '../types';

interface HeaderProps {
  activeProject: CodeProject | null | undefined;
  onOpenSettings: () => void;
  onOpenGitPush?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeProject,
  onOpenSettings,
  onOpenGitPush
}) => {
  return (
    <header className="w-full bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-4 py-2.5 flex items-center justify-between z-30 shrink-0 select-none">
      <div className="flex items-center space-x-2 min-w-0">
        <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
          {activeProject ? activeProject.title : '代码空间'}
        </span>
        {activeProject?.gitConfig && (
          <button
            onClick={onOpenGitPush}
            className="text-[11px] font-mono-code px-2 py-0.5 rounded bg-[var(--brand-subtle)] text-[var(--brand)] border border-[var(--brand-border)] hover:bg-[var(--brand)] hover:text-white transition-colors flex items-center space-x-1 shrink-0"
            title="点击打开 Git 远程管理"
          >
            {activeProject.gitConfig.provider === 'github' ? (
              <GitFork className="w-3 h-3" />
            ) : (
              <GitBranch className="w-3 h-3" />
            )}
            <span className="truncate max-w-[120px]">{activeProject.gitConfig.branch}</span>
          </button>
        )}
      </div>

      <div className="flex items-center space-x-1 shrink-0">
        <button
          id="btn-header-settings"
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] press-feedback transition-colors"
          title="设置"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};



