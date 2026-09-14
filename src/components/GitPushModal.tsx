import React, { useState, useEffect } from 'react';
import {
  X,
  GitBranch,
  UploadCloud,
  DownloadCloud,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  GitFork,
  FileCode,
  Settings2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CodeProject, GitProvider, GitRepoConfig, ProjectFile } from '../types';
import {
  cloneGitHubRepo,
  cloneGitLabRepo,
  parseGitUrl,
  pushGitHubRepo,
  pushGitLabRepo
} from '../services/gitService';

interface GitPushModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: CodeProject | null;
  onUpdateProjectGit: (projectId: string, gitConfig: GitRepoConfig) => void;
  onPullSuccess?: (projectId: string, files: ProjectFile[], folders: string[], commitSha: string) => void;
}

export const GitPushModal: React.FC<GitPushModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProjectGit,
  onPullSuccess
}) => {
  const [provider, setProvider] = useState<GitProvider>('github');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [commitMessage, setCommitMessage] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [actionType, setActionType] = useState<'push' | 'pull' | 'none'>('none');
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successInfo, setSuccessInfo] = useState<{ commitSha: string; commitUrl: string; message: string } | null>(null);
  const [showConfigEdit, setShowConfigEdit] = useState(false);

  // Sync state when project changes or modal opens
  useEffect(() => {
    if (project) {
      if (project.gitConfig) {
        setProvider(project.gitConfig.provider);
        setRepoUrl(project.gitConfig.repoUrl);
        setBranch(project.gitConfig.branch || 'main');
        setToken(project.gitConfig.token || '');
        setCustomDomain(project.gitConfig.customDomain || '');
        setShowConfigEdit(false);
      } else {
        // Defaults if no git config
        setProvider('github');
        setRepoUrl('');
        setBranch('main');
        setToken('');
        setCustomDomain('');
        setShowConfigEdit(true);
      }
      setCommitMessage(`Update code in ${project.title} (${new Date().toLocaleDateString()})`);
      setErrorMsg('');
      setSuccessInfo(null);
    }
  }, [project, isOpen]);

  if (!project) return null;

  const parsedInfo = parseGitUrl(repoUrl);
  const isLinked = !!project.gitConfig && !showConfigEdit;

  const handlePush = async () => {
    if (!repoUrl.trim()) {
      setErrorMsg('请输入远程仓库地址');
      return;
    }

    const parsed = parseGitUrl(repoUrl);
    if (!parsed) {
      setErrorMsg('无效的 Git 仓库地址格式，请核对');
      return;
    }

    if (!token.trim()) {
      setErrorMsg(`推送到 ${parsed.provider === 'github' ? 'GitHub' : 'GitLab'} 必须提供具有写入权限的 Personal Access Token。`);
      return;
    }

    const targetBranch = branch.trim() || 'main';
    const msg = commitMessage.trim() || `Update project ${project.title}`;

    setIsLoading(true);
    setActionType('push');
    setErrorMsg('');
    setSuccessInfo(null);
    setProgressMsg('正在准备推送到远程仓库...');

    try {
      let pushResult;
      if (parsed.provider === 'github') {
        pushResult = await pushGitHubRepo({
          owner: parsed.owner,
          repo: parsed.repo,
          branch: targetBranch,
          token: token.trim(),
          files: project.files,
          commitMessage: msg,
          onProgress: (m) => setProgressMsg(m)
        });
      } else {
        pushResult = await pushGitLabRepo({
          projectPath: `${parsed.owner}/${parsed.repo}`,
          branch: targetBranch,
          token: token.trim(),
          files: project.files,
          commitMessage: msg,
          customDomain: customDomain.trim() || parsed.customDomain,
          onProgress: (m) => setProgressMsg(m)
        });
      }

      // Update project git config
      const newGitConfig: GitRepoConfig = {
        provider: parsed.provider,
        repoUrl: parsed.rawUrl,
        owner: parsed.owner,
        repo: parsed.repo,
        branch: targetBranch,
        token: token.trim(),
        customDomain: customDomain.trim() || parsed.customDomain,
        lastSyncedAt: Date.now(),
        lastCommitSha: pushResult.commitSha,
        lastCommitMessage: msg
      };

      onUpdateProjectGit(project.id, newGitConfig);

      setSuccessInfo({
        commitSha: pushResult.commitSha,
        commitUrl: pushResult.commitUrl,
        message: `代码已成功推送到远程分支 [${targetBranch}]！`
      });
      setShowConfigEdit(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '推送失败，请检查网络或 Token 权限';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
      setActionType('none');
      setProgressMsg('');
    }
  };

  const handlePull = async () => {
    if (!repoUrl.trim()) {
      setErrorMsg('请输入远程仓库地址');
      return;
    }

    const parsed = parseGitUrl(repoUrl);
    if (!parsed) {
      setErrorMsg('无效的 Git 仓库地址格式');
      return;
    }

    const targetBranch = branch.trim() || 'main';

    setIsLoading(true);
    setActionType('pull');
    setErrorMsg('');
    setSuccessInfo(null);
    setProgressMsg('正在从远程仓库拉取最新代码...');

    try {
      let pullResult;
      if (parsed.provider === 'github') {
        pullResult = await cloneGitHubRepo({
          owner: parsed.owner,
          repo: parsed.repo,
          branch: targetBranch,
          token: token.trim() || undefined,
          onProgress: (m) => setProgressMsg(m)
        });
      } else {
        pullResult = await cloneGitLabRepo({
          projectPath: `${parsed.owner}/${parsed.repo}`,
          branch: targetBranch,
          token: token.trim() || undefined,
          customDomain: customDomain.trim() || parsed.customDomain,
          onProgress: (m) => setProgressMsg(m)
        });
      }

      const newGitConfig: GitRepoConfig = {
        provider: parsed.provider,
        repoUrl: parsed.rawUrl,
        owner: parsed.owner,
        repo: parsed.repo,
        branch: pullResult.branch,
        token: token.trim() || undefined,
        customDomain: customDomain.trim() || parsed.customDomain,
        lastSyncedAt: Date.now(),
        lastCommitSha: pullResult.commitSha
      };

      onUpdateProjectGit(project.id, newGitConfig);

      if (onPullSuccess) {
        onPullSuccess(project.id, pullResult.files, pullResult.folders, pullResult.commitSha);
      }

      setSuccessInfo({
        commitSha: pullResult.commitSha || 'latest',
        commitUrl:
          parsed.provider === 'github'
            ? `https://github.com/${parsed.owner}/${parsed.repo}/tree/${pullResult.branch}`
            : `https://gitlab.com/${parsed.owner}/${parsed.repo}/-/tree/${pullResult.branch}`,
        message: `已同步拉取远程分支 [${pullResult.branch}] 的 ${pullResult.files.length} 个最新文件！`
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '拉取代码失败';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
      setActionType('none');
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
            className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl w-full max-w-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <GitBranch className="w-4 h-4 text-[var(--brand)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Git 远程管理与代码推送</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] press-feedback disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3.5 max-h-[78vh] overflow-y-auto">
          {/* Linked Status Card */}
          {isLinked && (
            <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {project.gitConfig?.provider === 'github' ? (
                    <GitFork className="w-4 h-4 text-[var(--brand)]" />
                  ) : (
                    <GitBranch className="w-4 h-4 text-[var(--brand)]" />
                  )}
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    {project.gitConfig?.owner}/{project.gitConfig?.repo}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--brand-subtle)] text-[var(--brand)] font-mono-code">
                    {project.gitConfig?.branch}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowConfigEdit(true)}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--brand)] flex items-center space-x-1"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>修改配置</span>
                </button>
              </div>

              {project.gitConfig?.lastSyncedAt && (
                <div className="text-[11px] text-[var(--text-tertiary)] flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]">
                  <span>上次同步: {new Date(project.gitConfig.lastSyncedAt).toLocaleString()}</span>
                  {project.gitConfig.lastCommitSha && (
                    <span className="font-mono-code text-[10px]">
                      SHA: {project.gitConfig.lastCommitSha.slice(0, 7)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Config Settings Form */}
          {(!isLinked || showConfigEdit) && (
            <div className="space-y-3 p-3 bg-[var(--bg-tertiary)]/50 border border-[var(--border-subtle)] rounded-lg">
              <div className="flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]">
                <span className="text-xs font-semibold text-[var(--text-primary)]">远程仓库配置</span>
                {project.gitConfig && (
                  <button
                    type="button"
                    onClick={() => setShowConfigEdit(false)}
                    className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    取消编辑
                  </button>
                )}
              </div>

              {/* Provider Selection */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProvider('github')}
                  className={`py-1.5 px-3 rounded-lg border text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors ${
                    provider === 'github'
                      ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                  }`}
                >
                  <GitFork className="w-3.5 h-3.5" />
                  <span>GitHub</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('gitlab')}
                  className={`py-1.5 px-3 rounded-lg border text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors ${
                    provider === 'gitlab'
                      ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                  }`}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>GitLab</span>
                </button>
              </div>

              {/* Remote Repo URL */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">远程仓库 URL</label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder={
                    provider === 'github'
                      ? '例如: https://github.com/owner/repo 或 owner/repo'
                      : '例如: https://gitlab.com/group/repo'
                  }
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                />
              </div>

              {/* Branch and custom domain */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">目标分支</label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main 或 master"
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
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
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                    />
                  </div>
                )}
              </div>

              {/* Token */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center space-x-1">
                    <Lock className="w-3 h-3 text-[var(--text-tertiary)]" />
                    <span>Personal Access Token</span>
                  </label>
                  <span className="text-[10px] text-[var(--text-tertiary)]">需要 repo / write 权限</span>
                </div>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={provider === 'github' ? 'GitHub Token (ghp_...)' : 'GitLab Token (glpat-...)'}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                />
              </div>
            </div>
          )}

          {/* Files to commit overview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center space-x-1.5">
                <FileCode className="w-3.5 h-3.5 text-[var(--brand)]" />
                <span>待同步文件 ({project.files.length} 个文件)</span>
              </label>
              <span className="text-[10px] text-[var(--text-tertiary)]">将完整提交当前工程所有文件</span>
            </div>

            <div className="max-h-24 overflow-y-auto border border-[var(--border-subtle)] rounded-lg p-2 bg-[var(--bg-tertiary)] space-y-1">
              {project.files.map((file) => (
                <div key={file.id} className="flex items-center justify-between text-xs font-mono-code text-[var(--text-secondary)]">
                  <span className="truncate pr-2">{file.name}</span>
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase shrink-0">{file.language}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Commit Message */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--text-secondary)]">提交信息 (Commit Message)</label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="简要说明本次代码修改..."
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-[var(--warning-subtle)] border border-[var(--warning)]/30 text-[var(--warning)] text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {/* Success Message */}
          {successInfo && (
            <div className="p-3 rounded-lg bg-[var(--brand-subtle)] border border-[var(--brand)]/30 text-xs space-y-2">
              <div className="flex items-start space-x-2 text-[var(--brand)]">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-semibold">{successInfo.message}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--brand)]/20">
                <span className="text-[var(--text-secondary)] font-mono-code">
                  SHA: {successInfo.commitSha.slice(0, 10)}
                </span>
                <a
                  href={successInfo.commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--brand)] hover:underline flex items-center space-x-1 font-semibold"
                >
                  <span>在远程查看</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="p-2.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs text-[var(--brand)] flex items-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{progressMsg || '正在处理中...'}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-[var(--bg-tertiary)] border-t border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            {parsedInfo && (
              <button
                type="button"
                onClick={handlePull}
                disabled={isLoading}
                className="px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold rounded-md press-feedback flex items-center space-x-1.5 disabled:opacity-50"
                title="从远程拉取覆盖本地代码"
              >
                {isLoading && actionType === 'pull' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <DownloadCloud className="w-3.5 h-3.5 text-[var(--brand)]" />
                )}
                <span>拉取最新 (Pull)</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md disabled:opacity-50"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={handlePush}
              disabled={isLoading}
              className="px-4 py-1.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-semibold rounded-md press-feedback flex items-center space-x-1.5 disabled:opacity-50 shadow-sm"
            >
              {isLoading && actionType === 'push' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在推送...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>推送到远程 (Push)</span>
                </>
              )}
            </button>
          </div>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
