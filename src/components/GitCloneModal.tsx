import React, { useState, useEffect } from 'react';
import { X, GitBranch, GitFork, Lock, AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CodeProject, GitProvider } from '../types';
import { cloneGitHubRepo, cloneGitLabRepo, detectExecutionType, parseGitUrl } from '../services/gitService';

interface GitCloneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCloneSuccess: (project: CodeProject) => void;
}

export const GitCloneModal: React.FC<GitCloneModalProps> = ({
  isOpen,
  onClose,
  onCloneSuccess
}) => {
  const [provider, setProvider] = useState<GitProvider>('github');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [token, setToken] = useState('');
  const [customDomain, setCustomDomain] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Auto detect provider & metadata from URL
  useEffect(() => {
    if (!repoUrl.trim()) return;
    const parsed = parseGitUrl(repoUrl);
    if (parsed) {
      setProvider(parsed.provider);
      if (parsed.branch && !branch) {
        setBranch(parsed.branch);
      }
      if (parsed.customDomain) {
        setCustomDomain(parsed.customDomain);
      }
    }
  }, [repoUrl]);

  const parsedInfo = parseGitUrl(repoUrl);

  const handleClone = async () => {
    if (!repoUrl.trim()) {
      setErrorMsg('请输入有效的 Git 仓库地址');
      return;
    }

    const parsed = parseGitUrl(repoUrl);
    if (!parsed) {
      setErrorMsg('无法解析输入的 Git 地址，请输入如 https://github.com/owner/repo 或 https://gitlab.com/group/repo');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setProgressMsg('正在初始化克隆任务...');

    try {
      let result;
      const targetBranch = branch.trim() || parsed.branch;

      if (parsed.provider === 'github') {
        result = await cloneGitHubRepo({
          owner: parsed.owner,
          repo: parsed.repo,
          branch: targetBranch,
          token: token.trim() || undefined,
          onProgress: (msg) => setProgressMsg(msg)
        });
      } else {
        result = await cloneGitLabRepo({
          projectPath: `${parsed.owner}/${parsed.repo}`,
          branch: targetBranch,
          token: token.trim() || undefined,
          customDomain: customDomain.trim() || parsed.customDomain,
          onProgress: (msg) => setProgressMsg(msg)
        });
      }

      const execType = detectExecutionType(result.files);
      const entryFile = result.files.find(f => f.isEntry) || result.files[0];

      const newProject: CodeProject = {
        id: `proj-git-${Date.now()}`,
        title: result.title,
        description: result.description,
        language: entryFile ? entryFile.language : 'javascript',
        executionType: execType,
        tags: ['Git', parsed.provider === 'github' ? 'GitHub' : 'GitLab'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        files: result.files,
        folders: result.folders,
        activeFileId: entryFile ? entryFile.id : result.files[0]?.id || '',
        gitConfig: {
          provider: parsed.provider,
          repoUrl: parsed.rawUrl,
          owner: parsed.owner,
          repo: parsed.repo,
          branch: result.branch,
          token: token.trim() || undefined,
          customDomain: customDomain.trim() || parsed.customDomain,
          lastSyncedAt: Date.now(),
          lastCommitSha: result.commitSha
        }
      };

      onCloneSuccess(newProject);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '克隆仓库失败，请重试';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
      setProgressMsg('');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340 }}
            className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <GitBranch className="w-4 h-4 text-[var(--brand)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">克隆 Git 仓库</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] press-feedback disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5">
          {/* Provider Selector Tabs */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-secondary)]">代码托管平台</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProvider('github')}
                className={`py-1.5 px-3 rounded-lg border text-xs font-medium flex items-center justify-center space-x-2 transition-colors ${
                  provider === 'github'
                    ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <GitFork className="w-3.5 h-3.5" />
                <span>GitHub</span>
              </button>
              <button
                type="button"
                onClick={() => setProvider('gitlab')}
                className={`py-1.5 px-3 rounded-lg border text-xs font-medium flex items-center justify-center space-x-2 transition-colors ${
                  provider === 'gitlab'
                    ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>GitLab</span>
              </button>
            </div>
          </div>

          {/* Repo URL input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--text-secondary)]">
              仓库地址 (URL 或 组织/仓库名)
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value);
                setErrorMsg('');
              }}
              placeholder={
                provider === 'github'
                  ? '例如: https://github.com/facebook/react 或 owner/repo'
                  : '例如: https://gitlab.com/group/project 或 group/project'
              }
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
              autoFocus
            />
            {parsedInfo && (
              <div className="text-[11px] text-[var(--text-tertiary)] flex items-center space-x-1.5 pt-0.5">
                <CheckCircle2 className="w-3 h-3 text-[var(--brand)]" />
                <span>
                  识别目标: <strong className="text-[var(--text-primary)]">{parsedInfo.owner}/{parsedInfo.repo}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Branch & Custom Domain */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">指定分支 (可选)</label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="默认主分支 (main / master)"
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
              />
            </div>

            {provider === 'gitlab' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">自建 GitLab 域名 (可选)</label>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="https://gitlab.example.com"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                />
              </div>
            )}
          </div>

          {/* Personal Access Token */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center space-x-1">
                <Lock className="w-3 h-3 text-[var(--text-tertiary)]" />
                <span>访问令牌 / Token (私有仓库必填)</span>
              </label>
              <span className="text-[10px] text-[var(--text-tertiary)]">公开仓库可留空</span>
            </div>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={provider === 'github' ? 'GitHub Personal Access Token (ghp_...)' : 'GitLab Access Token (glpat-...)'}
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-[var(--warning-subtle)] border border-[var(--warning)]/30 text-[var(--warning)] text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {/* Progress Indicator */}
          {isLoading && (
            <div className="p-2.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs text-[var(--brand)] flex items-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{progressMsg || '正在处理中...'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[var(--bg-tertiary)] border-t border-[var(--border-subtle)] flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleClone}
            disabled={isLoading}
            className="px-4 py-1.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-semibold rounded-md press-feedback flex items-center space-x-1.5 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>克隆中...</span>
              </>
            ) : (
              <>
                <span>开始克隆</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
