import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GitBranch, AlertCircle, CheckCircle2, Loader2, ArrowRight, ChevronDown } from 'lucide-react';
import { CodeProject, GitProvider } from '../types';
import { cloneGitHubRepo, cloneGitLabRepo, detectExecutionType, loadStoredGitTokens, parseGitUrl } from '../services/gitService';
import { ModalShell } from './ModalShell';

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
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [customDomain, setCustomDomain] = useState('');

  // PAT Token dropdown states
  const [savedTokens, setSavedTokens] = useState<ReturnType<typeof loadStoredGitTokens>>([]);
  const [selectedTokenMode, setSelectedTokenMode] = useState<string>('onetime');
  const [oneTimeToken, setOneTimeToken] = useState<string>('');
  const [isTokenDropdownOpen, setIsTokenDropdownOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Click outside to close custom dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tokenDropdownRef.current && !tokenDropdownRef.current.contains(e.target as Node)) {
        setIsTokenDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update open direction when dropdown opens
  useEffect(() => {
    if (isTokenDropdownOpen && tokenDropdownRef.current) {
      const rect = tokenDropdownRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const spaceBelow = windowHeight - rect.bottom;
      setOpenUpwards(spaceBelow < 180);
    }
  }, [isTokenDropdownOpen]);

  // Load Saved Tokens
  useEffect(() => {
    if (isOpen) {
      const tokens = loadStoredGitTokens();
      setSavedTokens(tokens);
      setIsLoading(false);
      setProgressPct(0);
      setProgressMsg('');
      setErrorMsg('');
      if (tokens.length > 0 && selectedTokenMode === 'onetime' && !oneTimeToken) {
        setSelectedTokenMode(`saved-${tokens[0].id}`);
        if (tokens[0].customDomain) setCustomDomain(tokens[0].customDomain);
      }
    }
  }, [isOpen]);

  // Auto detect provider & metadata from URL
  useEffect(() => {
    if (!repoUrl.trim()) return;
    const parsed = parseGitUrl(repoUrl);
    if (parsed) {
      if (parsed.branch && !branch) {
        setBranch(parsed.branch);
      }
      if (parsed.customDomain) {
        setCustomDomain(parsed.customDomain);
      }
    }
  }, [repoUrl]);

  const parsedInfo = parseGitUrl(repoUrl);

  const activeTokenValue = useMemo(() => {
    if (selectedTokenMode === 'onetime') {
      return oneTimeToken.trim();
    }
    if (selectedTokenMode.startsWith('saved-')) {
      const tokenId = selectedTokenMode.replace('saved-', '');
      const found = savedTokens.find(t => t.id === tokenId);
      return found ? found.token.trim() : oneTimeToken.trim();
    }
    return oneTimeToken.trim();
  }, [selectedTokenMode, oneTimeToken, savedTokens]);

  const activeTokenLabel = useMemo(() => {
    if (selectedTokenMode === 'onetime') {
      return '一次性填入';
    }
    const tokenId = selectedTokenMode.replace('saved-', '');
    const found = savedTokens.find(t => t.id === tokenId);
    return found ? `${found.label} (${found.provider.toUpperCase()})` : '一次性填入';
  }, [selectedTokenMode, savedTokens]);

  const handleClone = async () => {
    if (!repoUrl.trim()) {
      setErrorMsg('请输入有效的 Git 仓库地址');
      return;
    }

    const parsed = parseGitUrl(repoUrl);
    if (!parsed) {
      setErrorMsg('无法解析输入的 Git 地址，请输入例如 https://github.com/owner/repo 或 https://gitlab.com/group/repo');
      return;
    }

    setIsLoading(true);
    setProgressPct(15);
    setErrorMsg('');
    setProgressMsg('正在连接 Git 远程仓库...');

    try {
      let result;
      const targetBranch = branch.trim() || parsed.branch;
      const progressCb = (msg: string) => {
        setProgressMsg(msg);
        if (msg.includes('分支')) setProgressPct(40);
        else if (msg.includes('文件树')) setProgressPct(70);
        else if (msg.includes('完成')) setProgressPct(95);
      };

      if (parsed.provider === 'github') {
        result = await cloneGitHubRepo({
          owner: parsed.owner,
          repo: parsed.repo,
          branch: targetBranch,
          token: activeTokenValue || undefined,
          onProgress: progressCb
        });
      } else {
        result = await cloneGitLabRepo({
          projectPath: `${parsed.owner}/${parsed.repo}`,
          branch: targetBranch,
          token: activeTokenValue || undefined,
          customDomain: customDomain.trim() || parsed.customDomain,
          onProgress: progressCb
        });
      }

      setProgressPct(100);
      setProgressMsg('仓库克隆完成！');

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
          token: activeTokenValue || undefined,
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
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="克隆 Git 仓库"
      icon={<GitBranch className="w-4 h-4 text-blue-500" />}
      isCloseDisabled={isLoading}
      maxWidth="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleClone}
            disabled={isLoading}
            className="px-4 py-2 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium rounded-md press-feedback flex items-center space-x-1.5 disabled:opacity-50 shadow-xs"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                <span>拉取中...</span>
              </>
            ) : (
              <>
                <span>开始克隆</span>
                <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
              </>
            )}
          </button>
        </>
      }
    >
      <div className="p-1 space-y-3">
        {/* Simplified Direct Repo URL input */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--text-secondary)]">
            Git 仓库地址
          </label>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => {
              setRepoUrl(e.target.value);
              setErrorMsg('');
            }}
            placeholder="例如: https://github.com/owner/repo 或 https://gitlab.com/group/repo"
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
            autoFocus
          />
          {parsedInfo && (
            <div className="text-[11px] text-[var(--text-tertiary)] flex items-center space-x-1.5 pt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
              <span>
                目标仓库: <strong className="text-[var(--text-primary)]">{parsedInfo.owner}/{parsedInfo.repo}</strong> ({parsedInfo.provider.toUpperCase()})
              </span>
            </div>
          )}
        </div>

        {/* Branch Input */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--text-secondary)]">指定分支 (可选)</label>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="默认主分支 (main / master)"
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
          />
        </div>

        {/* PAT Token Input */}
        <div className="space-y-1" ref={tokenDropdownRef}>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Access Token (私有仓库可选)</label>
            {savedTokens.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsTokenDropdownOpen(!isTokenDropdownOpen)}
                  className="text-[11px] text-blue-500 hover:text-blue-600 flex items-center space-x-1"
                >
                  <span>{activeTokenLabel}</span>
                  <ChevronDown className="w-3 h-3 text-blue-500" />
                </button>
                {isTokenDropdownOpen && (
                  <div className={`absolute right-0 z-50 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg shadow-lg py-1 w-48 text-xs ${
                    openUpwards ? 'bottom-full mb-1' : 'top-full mt-1'
                  }`}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTokenMode('onetime');
                        setIsTokenDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                    >
                      一次性填入
                    </button>
                    {savedTokens.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTokenMode(`saved-${t.id}`);
                          setIsTokenDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] truncate"
                      >
                        {t.label} ({t.provider.toUpperCase()})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {selectedTokenMode === 'onetime' && (
            <input
              type="password"
              value={oneTimeToken}
              onChange={(e) => setOneTimeToken(e.target.value)}
              placeholder="Personal Access Token"
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
            />
          )}
        </div>

        {/* Progress Bar Track */}
        {isLoading && (
          <div className="p-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span className="flex items-center space-x-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                <span>{progressMsg || '正在拉取代码...'}</span>
              </span>
              <span className="font-mono-code font-semibold text-blue-500">{progressPct}%</span>
            </div>
            <div className="w-full bg-[var(--bg-secondary)] h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${progressPct}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-2 text-xs text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
