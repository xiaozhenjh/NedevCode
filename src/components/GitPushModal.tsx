import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Settings2,
  History,
  KeyRound,
  Plus,
  Trash2,
  Share2,
  Check,
  RefreshCw,
  GitCommit,
  UserCheck,
  ChevronDown,
  Copy,
  FileText
} from 'lucide-react';
import {
  CodeProject,
  GitBranchItem,
  GitCommitItem,
  GitProvider,
  GitRepoConfig,
  GitSavedToken,
  ProjectFile
} from '../types';
import { ModalShell } from './ModalShell';
import {
  addStoredGitToken,
  cloneGitHubRepo,
  cloneGitLabRepo,
  createGitHubGist,
  createRemoteBranch,
  deleteStoredGitToken,
  fetchBranchList,
  fetchCommitHistory,
  loadStoredGitTokens,
  parseGitUrl,
  pushGitHubRepo,
  pushGitLabRepo,
  validateGitToken
} from '../services/gitService';

interface GitPushModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: CodeProject | null;
  onUpdateProjectGit: (projectId: string, gitConfig: GitRepoConfig) => void;
  onPullSuccess?: (projectId: string, files: ProjectFile[], folders: string[], commitSha: string) => void;
}

type ModalTab = 'sync' | 'history' | 'branches' | 'tokens' | 'gist';

export const GitPushModal: React.FC<GitPushModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProjectGit,
  onPullSuccess
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('sync');

  // Config State
  const [provider, setProvider] = useState<GitProvider>('github');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [customDomain, setCustomDomain] = useState('');
  const [commitMessage, setCommitMessage] = useState('');

  // PAT Selection & Input State
  // selectedTokenMode: 'saved-{id}' | 'onetime'
  const [selectedTokenMode, setSelectedTokenMode] = useState<string>('onetime');
  const [oneTimeToken, setOneTimeToken] = useState<string>('');
  const [isTokenDropdownOpen, setIsTokenDropdownOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);

  // Status & Progress State
  const [isLoading, setIsLoading] = useState(false);
  const [actionType, setActionType] = useState<'push' | 'pull' | 'branches' | 'history' | 'validate' | 'gist' | 'none'>('none');
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successInfo, setSuccessInfo] = useState<{ commitSha: string; commitUrl: string; message: string } | null>(null);
  const [showConfigEdit, setShowConfigEdit] = useState(false);

  // File Staging Selection
  const [stagedFileNames, setStagedFileNames] = useState<Set<string>>(new Set());

  // Branch Management State
  const [branches, setBranches] = useState<GitBranchItem[]>([]);
  const [newBranchName, setNewBranchName] = useState('');

  // Commit History State
  const [commitHistory, setCommitHistory] = useState<GitCommitItem[]>([]);

  // Token Management State
  const [savedTokens, setSavedTokens] = useState<GitSavedToken[]>([]);
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [newTokenValue, setNewTokenValue] = useState('');
  const [newTokenType, setNewTokenType] = useState<GitProvider>('github');
  const [validatedUser, setValidatedUser] = useState<{ username: string; avatarUrl?: string } | null>(null);

  // Gist Export State
  const [gistDesc, setGistDesc] = useState('');
  const [gistPublic, setGistPublic] = useState(false);
  const [gistExportScope, setGistExportScope] = useState<'all' | 'active'>('all');
  const [gistUrl, setGistUrl] = useState<string | null>(null);
  const [gistCopied, setGistCopied] = useState(false);

  // Click outside to close custom dropdown and detect space
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
      // If less than 200px space below, open upwards
      setOpenUpwards(spaceBelow < 200);
    }
  }, [isTokenDropdownOpen]);

  // Initial Sync on Open
  useEffect(() => {
    if (project) {
      if (project.gitConfig) {
        setProvider(project.gitConfig.provider);
        setRepoUrl(project.gitConfig.repoUrl);
        setBranch(project.gitConfig.branch || 'main');
        setCustomDomain(project.gitConfig.customDomain || '');
        setShowConfigEdit(false);
        if (project.gitConfig.token) {
          setOneTimeToken(project.gitConfig.token);
          setSelectedTokenMode('onetime');
        }
      } else {
        setProvider('github');
        setRepoUrl('');
        setBranch('main');
        setCustomDomain('');
        setShowConfigEdit(true);
      }
      setCommitMessage(`Update code in ${project.title} (${new Date().toLocaleDateString()})`);
      setErrorMsg('');
      setSuccessInfo(null);
      setGistUrl(null);
      setGistCopied(false);

      if (project.files) {
        setStagedFileNames(new Set(project.files.map(f => f.name)));
      }
    }
  }, [project, isOpen]);

  // Load Saved Tokens
  useEffect(() => {
    if (isOpen) {
      const tokens = loadStoredGitTokens();
      setSavedTokens(tokens);
      if (tokens.length > 0 && selectedTokenMode === 'onetime' && !oneTimeToken && !project?.gitConfig?.token) {
        // Default to first saved token if available
        setSelectedTokenMode(`saved-${tokens[0].id}`);
      }
    }
  }, [isOpen]);

  const parsedInfo = parseGitUrl(repoUrl);
  const isLinked = !!project?.gitConfig && !showConfigEdit;

  // Resolve actual active token to use
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

  // Staged Files list
  const selectedFilesToCommit = useMemo(() => {
    if (!project?.files) return [];
    return project.files.filter(f => stagedFileNames.has(f.name));
  }, [project?.files, stagedFileNames]);

  // Toggle File Staging
  const toggleStageFile = (fileName: string) => {
    setStagedFileNames(prev => {
      const next = new Set(prev);
      if (next.has(fileName)) {
        next.delete(fileName);
      } else {
        next.add(fileName);
      }
      return next;
    });
  };

  const toggleStageAll = () => {
    if (!project?.files) return;
    if (stagedFileNames.size === project.files.length) {
      setStagedFileNames(new Set());
    } else {
      setStagedFileNames(new Set(project.files.map(f => f.name)));
    }
  };

  // Push Handler
  const handlePush = async () => {
    if (!project || !repoUrl.trim()) {
      if (!repoUrl.trim()) setErrorMsg('请输入远程仓库地址');
      return;
    }

    const parsed = parseGitUrl(repoUrl);
    if (!parsed) {
      setErrorMsg('无效的 Git 仓库地址格式，请核对');
      return;
    }

    if (!activeTokenValue) {
      setErrorMsg(`推送到 ${parsed.provider === 'github' ? 'GitHub' : 'GitLab'} 必须提供 Personal Access Token。`);
      return;
    }

    if (selectedFilesToCommit.length === 0) {
      setErrorMsg('请至少勾选选择一个待提交的文件');
      return;
    }

    const targetBranch = branch.trim() || 'main';
    const msg = commitMessage.trim() || `Update project ${project?.title || ''}`;

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
          token: activeTokenValue,
          files: selectedFilesToCommit,
          commitMessage: msg,
          onProgress: (m) => setProgressMsg(m)
        });
      } else {
        pushResult = await pushGitLabRepo({
          projectPath: `${parsed.owner}/${parsed.repo}`,
          branch: targetBranch,
          token: activeTokenValue,
          files: selectedFilesToCommit,
          commitMessage: msg,
          customDomain: customDomain.trim() || parsed.customDomain,
          onProgress: (m) => setProgressMsg(m)
        });
      }

      const newGitConfig: GitRepoConfig = {
        provider: parsed.provider,
        repoUrl: parsed.rawUrl,
        owner: parsed.owner,
        repo: parsed.repo,
        branch: targetBranch,
        token: activeTokenValue,
        customDomain: customDomain.trim() || parsed.customDomain,
        lastSyncedAt: Date.now(),
        lastCommitSha: pushResult.commitSha,
        lastCommitMessage: msg
      };

      onUpdateProjectGit(project.id, newGitConfig);

      setSuccessInfo({
        commitSha: pushResult.commitSha,
        commitUrl: pushResult.commitUrl,
        message: `成功推送到远程分支 [${targetBranch}]！包含 ${selectedFilesToCommit.length} 个文件。`
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

  // Pull Handler
  const handlePull = async () => {
    if (!project || !repoUrl.trim()) {
      if (!repoUrl.trim()) setErrorMsg('请输入远程仓库地址');
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
          token: activeTokenValue || undefined,
          onProgress: (m) => setProgressMsg(m)
        });
      } else {
        pullResult = await cloneGitLabRepo({
          projectPath: `${parsed.owner}/${parsed.repo}`,
          branch: targetBranch,
          token: activeTokenValue || undefined,
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
        token: activeTokenValue || undefined,
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
        message: `已成功拉取远程分支 [${pullResult.branch}] 的 ${pullResult.files.length} 个最新文件！`
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

  // Fetch Remote Branches
  const handleFetchBranches = async () => {
    if (!parsedInfo) {
      setErrorMsg('请输入有效的远程仓库地址');
      return;
    }
    setIsLoading(true);
    setActionType('branches');
    setErrorMsg('');
    try {
      const list = await fetchBranchList({
        provider: parsedInfo.provider,
        owner: parsedInfo.owner,
        repo: parsedInfo.repo,
        token: activeTokenValue || undefined,
        customDomain: customDomain.trim() || parsedInfo.customDomain
      });
      setBranches(list);
    } catch (err: any) {
      setErrorMsg(err.message || '获取分支列表失败');
    } finally {
      setIsLoading(false);
      setActionType('none');
    }
  };

  // Create Remote Branch
  const handleCreateBranch = async () => {
    if (!parsedInfo || !newBranchName.trim()) return;
    if (!activeTokenValue) {
      setErrorMsg('创建分支需要 Token 权限');
      return;
    }
    setIsLoading(true);
    setActionType('branches');
    setErrorMsg('');
    try {
      const res = await createRemoteBranch({
        provider: parsedInfo.provider,
        owner: parsedInfo.owner,
        repo: parsedInfo.repo,
        newBranch: newBranchName.trim(),
        fromBranch: branch || 'main',
        token: activeTokenValue,
        customDomain: customDomain.trim() || parsedInfo.customDomain
      });
      setBranch(res.name);
      setNewBranchName('');
      handleFetchBranches();
    } catch (err: any) {
      setErrorMsg(err.message || '创建分支失败');
    } finally {
      setIsLoading(false);
      setActionType('none');
    }
  };

  // Fetch Commit History
  const handleFetchCommits = async () => {
    if (!parsedInfo) {
      setErrorMsg('请输入有效的远程仓库地址');
      return;
    }
    setIsLoading(true);
    setActionType('history');
    setErrorMsg('');
    try {
      const history = await fetchCommitHistory({
        provider: parsedInfo.provider,
        owner: parsedInfo.owner,
        repo: parsedInfo.repo,
        branch: branch || 'main',
        token: activeTokenValue || undefined,
        customDomain: customDomain.trim() || parsedInfo.customDomain
      });
      setCommitHistory(history);
    } catch (err: any) {
      setErrorMsg(err.message || '获取提交历史失败');
    } finally {
      setIsLoading(false);
      setActionType('none');
    }
  };

  // Validate and Save PAT Token
  const handleValidateAndSaveToken = async () => {
    if (!newTokenValue.trim()) return;
    setIsLoading(true);
    setActionType('validate');
    setErrorMsg('');
    setValidatedUser(null);
    try {
      const res = await validateGitToken({
        provider: newTokenType,
        token: newTokenValue.trim(),
        customDomain: customDomain.trim()
      });
      setValidatedUser({ username: res.username, avatarUrl: res.avatarUrl });

      const saved = addStoredGitToken({
        label: newTokenLabel.trim() || `${newTokenType.toUpperCase()} (${res.username})`,
        provider: newTokenType,
        token: newTokenValue.trim(),
        customDomain: customDomain.trim(),
        username: res.username,
        avatarUrl: res.avatarUrl
      });

      const updated = loadStoredGitTokens();
      setSavedTokens(updated);
      setSelectedTokenMode(`saved-${saved.id}`);
      setProvider(saved.provider);
      setNewTokenValue('');
      setNewTokenLabel('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Token 验证失败');
    } finally {
      setIsLoading(false);
      setActionType('none');
    }
  };

  const handleDeleteToken = (id: string) => {
    deleteStoredGitToken(id);
    const updated = loadStoredGitTokens();
    setSavedTokens(updated);
    if (selectedTokenMode === `saved-${id}`) {
      setSelectedTokenMode('onetime');
    }
  };

  // Create GitHub Gist
  const handleCreateGist = async () => {
    if (!project?.files || project.files.length === 0) return;
    setIsLoading(true);
    setActionType('gist');
    setErrorMsg('');
    setGistUrl(null);
    setGistCopied(false);
    try {
      let targetFiles = project.files;
      if (gistExportScope === 'active' && project.activeFileId) {
        const active = project.files.find(f => f.id === project.activeFileId);
        if (active) targetFiles = [active];
      }

      const filePayloads = targetFiles.map(f => ({
        filename: f.name,
        content: f.content
      }));

      const res = await createGitHubGist({
        description: gistDesc.trim() || `Exported from Code Studio: ${project.title}`,
        isPublic: gistPublic,
        files: filePayloads,
        token: activeTokenValue || undefined
      });
      setGistUrl(res.htmlUrl);
    } catch (err: any) {
      setErrorMsg(err.message || '创建 Gist 失败');
    } finally {
      setIsLoading(false);
      setActionType('none');
    }
  };

  const handleCopyGistUrl = () => {
    if (gistUrl) {
      navigator.clipboard.writeText(gistUrl);
      setGistCopied(true);
      setTimeout(() => setGistCopied(false), 2500);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Git管理"
      icon={<GitBranch className="w-4 h-4 text-[var(--brand)]" />}
      isCloseDisabled={isLoading}
      maxWidth="max-w-xl"
      scrollable={false}
      className="max-h-[92vh] overflow-hidden flex flex-col"
      headerExtra={
        /* Tabs Bar: horizontal scrollable, no text wrap */
        <div className="px-4 pt-1.5 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] flex items-center space-x-1 shrink-0 overflow-x-auto no-scrollbar scroll-smooth">
          <button
            type="button"
            onClick={() => setActiveTab('sync')}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'sync'
                ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--bg-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>同步</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              if (commitHistory.length === 0 && parsedInfo) {
                handleFetchCommits();
              }
            }}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'history'
                ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--bg-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>提交历史</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('branches');
              if (branches.length === 0 && parsedInfo) {
                handleFetchBranches();
              }
            }}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'branches'
                ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--bg-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>分支管理</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tokens')}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'tokens'
                ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--bg-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>密钥管理</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gist')}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'gist'
                ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--bg-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Gist 导出</span>
          </button>
        </div>
      }
    >

      {/* Body Area */}
      <div className="p-4 space-y-3.5 flex-1 overflow-y-auto min-h-[400px]">
        {/* Error / Success Messages */}
        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-[var(--warning-subtle)] border border-[var(--warning)]/30 text-[var(--warning)] text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

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

        {/* TAB 1: SYNC (同步) */}
        {activeTab === 'sync' && (
          <div className="space-y-3.5">
            {/* Linked Status Card */}
            {isLinked && (
              <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <GitFork className="w-4 h-4 text-[var(--brand)]" />
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
                  {project?.gitConfig && (
                    <button
                      type="button"
                      onClick={() => setShowConfigEdit(false)}
                      className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      取消编辑
                    </button>
                  )}
                </div>

                {/* Provider Buttons */}
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

                {/* Repo URL */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">远程仓库 URL / Path</label>
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

                {/* Branch & Custom Domain */}
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

                {/* Custom PAT Dropdown with '一次性填入' at bottom */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center space-x-1">
                      <Lock className="w-3 h-3 text-[var(--text-tertiary)]" />
                      <span>Personal Access Token</span>
                    </label>
                  </div>

                  <div className="relative" ref={tokenDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsTokenDropdownOpen(!isTokenDropdownOpen)}
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--brand)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] flex items-center justify-between transition-colors press-feedback"
                    >
                      <span className="truncate">{activeTokenLabel}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0 ml-1" />
                    </button>

                    {isTokenDropdownOpen && (
                      <div className={`absolute ${openUpwards ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 right-0 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg shadow-xl z-30 py-1 max-h-48 overflow-y-auto`}>
                        {savedTokens.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setSelectedTokenMode(`saved-${t.id}`);
                              setProvider(t.provider);
                              if (t.customDomain) setCustomDomain(t.customDomain);
                              setIsTokenDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-[var(--bg-tertiary)] transition-colors ${
                              selectedTokenMode === `saved-${t.id}` ? 'text-[var(--brand)] font-semibold' : 'text-[var(--text-primary)]'
                            }`}
                          >
                            <span className="truncate">{t.label}</span>
                            <span className="text-[10px] uppercase font-mono-code text-[var(--brand)] ml-2 shrink-0">
                              {t.provider}
                            </span>
                          </button>
                        ))}

                        {/* One-time token option at bottom */}
                        <div className="border-t border-[var(--border-subtle)] my-1" />
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTokenMode('onetime');
                            setIsTokenDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-[var(--bg-tertiary)] transition-colors ${
                            selectedTokenMode === 'onetime' ? 'text-[var(--brand)] font-semibold' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          <span>一次性填入</span>
                          <span className="text-[10px] text-[var(--text-tertiary)]">临时输入</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* One-time token input box if onetime selected */}
                  {selectedTokenMode === 'onetime' && (
                    <input
                      type="password"
                      value={oneTimeToken}
                      onChange={(e) => setOneTimeToken(e.target.value)}
                      placeholder="在此填入一次性 Token (不会保存到密钥管理器)"
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Custom Checkbox File Staging List */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center space-x-1.5">
                  <FileCode className="w-3.5 h-3.5 text-[var(--brand)]" />
                  <span>暂存文件 ({selectedFilesToCommit.length} / {project?.files?.length || 0})</span>
                </label>
                <button
                  type="button"
                  onClick={toggleStageAll}
                  className="text-[11px] text-[var(--brand)] hover:underline font-medium"
                >
                  {stagedFileNames.size === (project?.files?.length || 0) ? '全部取消' : '全选暂存'}
                </button>
              </div>

              <div className="max-h-32 overflow-y-auto border border-[var(--border-subtle)] rounded-lg p-1.5 bg-[var(--bg-tertiary)] space-y-1">
                {project?.files?.map((file) => {
                  const isStaged = stagedFileNames.has(file.name);
                  return (
                    <div
                      key={file.id}
                      onClick={() => toggleStageFile(file.name)}
                      className="flex items-center justify-between text-xs font-mono-code text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-secondary)] p-1.5 rounded transition-colors select-none"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {/* Custom Checkbox */}
                        <div
                          className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                            isStaged
                              ? 'bg-[var(--brand)] border-[var(--brand)] text-white'
                              : 'bg-[var(--bg-secondary)] border-[var(--border-subtle)]'
                          }`}
                        >
                          {isStaged && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <span className={`truncate ${isStaged ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-tertiary)]'}`}>
                          {file.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-tertiary)] uppercase shrink-0 ml-2">{file.language}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Commit Message Input */}
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
          </div>
        )}

        {/* TAB 2: COMMIT HISTORY (提交历史) */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                远程分支 [{branch}] 最近提交记录 ({commitHistory.length})
              </span>
              <button
                type="button"
                onClick={handleFetchCommits}
                disabled={isLoading}
                className="px-2.5 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-primary)] flex items-center space-x-1 press-feedback border border-[var(--border-subtle)]"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading && actionType === 'history' ? 'animate-spin' : ''}`} />
                <span>刷新提交历史</span>
              </button>
            </div>

            {commitHistory.length > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {commitHistory.map((item) => (
                  <div
                    key={item.sha}
                    className="p-2.5 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-tertiary)]/60 hover:bg-[var(--bg-tertiary)] transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0">
                        {item.authorAvatar && item.authorAvatar.trim() !== '' ? (
                          <img src={item.authorAvatar || undefined} alt={item.authorName} className="w-4 h-4 rounded-full" />
                        ) : (
                          <GitCommit className="w-4 h-4 text-[var(--brand)]" />
                        )}
                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {item.message}
                        </span>
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono-code text-[10px] text-[var(--brand)] hover:underline shrink-0 ml-2"
                      >
                        {item.shortSha}
                      </a>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-subtle)]/50">
                      <span>{item.authorName} {item.authorEmail ? `<${item.authorEmail}>` : ''}</span>
                      <span>{item.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-tertiary)] space-y-2">
                <p>点击上方按钮加载远程分支提交记录</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: BRANCHES (分支管理) */}
        {activeTab === 'branches' && (
          <div className="space-y-3.5">
            {/* Create New Branch Form */}
            <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-tertiary)] space-y-2">
              <span className="text-xs font-semibold text-[var(--text-primary)] block">基于当前分支新建远程分支</span>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="例如: feature/new-ui 或 dev"
                  className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                />
                <button
                  type="button"
                  onClick={handleCreateBranch}
                  disabled={isLoading || !newBranchName.trim()}
                  className="px-3 py-1.5 bg-[var(--brand)] text-white text-xs font-semibold rounded-lg press-feedback disabled:opacity-50 flex items-center space-x-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新建分支</span>
                </button>
              </div>
            </div>

            {/* Remote Branch List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">
                  远程分支列表 ({branches.length})
                </span>
                <button
                  type="button"
                  onClick={handleFetchBranches}
                  disabled={isLoading}
                  className="px-2.5 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-primary)] flex items-center space-x-1 press-feedback border border-[var(--border-subtle)]"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading && actionType === 'branches' ? 'animate-spin' : ''}`} />
                  <span>刷新分支</span>
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 border border-[var(--border-subtle)] rounded-lg p-2 bg-[var(--bg-tertiary)]">
                {branches.length > 0 ? (
                  branches.map((b) => {
                    const isCurrent = b.name === branch;
                    return (
                      <div
                        key={b.name}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono-code transition-colors ${
                          isCurrent
                            ? 'bg-[var(--brand-subtle)] border border-[var(--brand)]/30 text-[var(--brand)] font-bold'
                            : 'hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <GitBranch className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{b.name}</span>
                          {b.isDefault && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-500">DEFAULT</span>
                          )}
                        </div>

                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => setBranch(b.name)}
                            className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-primary)] hover:bg-[var(--brand)] hover:text-white border border-[var(--border-subtle)] transition-colors press-feedback"
                          >
                            切换为目标
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-6 text-xs text-[var(--text-tertiary)]">
                    点击“刷新分支”获取远程仓库所有分支
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TOKENS (密钥管理) */}
        {activeTab === 'tokens' && (
          <div className="space-y-4">
            <div className="space-y-2.5 p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-tertiary)]">
              <span className="text-xs font-bold text-[var(--text-primary)] block">保存 Personal Access Token (PAT)</span>

              {/* Custom Provider Selector (No native select) */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newTokenLabel}
                  onChange={(e) => setNewTokenLabel(e.target.value)}
                  placeholder="Token 标签 (例如: 我的 GitHub)"
                  className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                />
                <div className="grid grid-cols-2 gap-1 bg-[var(--bg-secondary)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setNewTokenType('github')}
                    className={`py-1 rounded text-xs font-medium transition-colors ${
                      newTokenType === 'github'
                        ? 'bg-[var(--brand)] text-white'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    GitHub
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTokenType('gitlab')}
                    className={`py-1 rounded text-xs font-medium transition-colors ${
                      newTokenType === 'gitlab'
                        ? 'bg-[var(--brand)] text-white'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    GitLab
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="password"
                  value={newTokenValue}
                  onChange={(e) => setNewTokenValue(e.target.value)}
                  placeholder="在此填入 PAT Token (ghp_... / glpat-...)"
                  className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                />
                <button
                  type="button"
                  onClick={handleValidateAndSaveToken}
                  disabled={isLoading || !newTokenValue.trim()}
                  className="px-3 py-1.5 bg-[var(--brand)] text-white text-xs font-semibold rounded-lg press-feedback disabled:opacity-50 flex items-center space-x-1 shrink-0"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>校验并保存</span>
                </button>
              </div>

              {validatedUser && (
                <div className="text-[11px] text-emerald-500 font-semibold flex items-center space-x-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>认证成功: {validatedUser.username}</span>
                </div>
              )}

              {/* Saved Tokens List (No '应用填入' button) */}
              {savedTokens.length > 0 && (
                <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">已保存的密钥 ({savedTokens.length})</span>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {savedTokens.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-secondary)] text-xs border border-[var(--border-subtle)]"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className="font-semibold text-[var(--text-primary)] truncate">{t.label}</span>
                          <span className="text-[10px] uppercase font-mono-code text-[var(--brand)] px-1.5 py-0.5 rounded bg-[var(--brand-subtle)]">
                            {t.provider}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDeleteToken(t.id)}
                            className="text-[var(--text-tertiary)] hover:text-rose-400 p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                            title="删除此密钥"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: GIST (Gist 导出独立标签页) */}
        {activeTab === 'gist' && (
          <div className="space-y-3.5">
            <div className="p-3.5 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-tertiary)] space-y-3">
              <div className="flex items-center space-x-2 pb-1 border-b border-[var(--border-subtle)]">
                <Share2 className="w-4 h-4 text-[var(--brand)]" />
                <span className="text-xs font-bold text-[var(--text-primary)]">一键发布为 GitHub Gist 代码片段</span>
              </div>

              {/* Export Scope Selector */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">导出范围</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGistExportScope('all')}
                    className={`p-2 rounded-lg border text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors ${
                      gistExportScope === 'all'
                        ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>整个工程 ({project?.files?.length || 0} 个文件)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGistExportScope('active')}
                    className={`p-2 rounded-lg border text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors ${
                      gistExportScope === 'active'
                        ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>仅当前打开文件</span>
                  </button>
                </div>
              </div>

              {/* Gist Description */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Gist 描述 (Description)</label>
                <input
                  type="text"
                  value={gistDesc}
                  onChange={(e) => setGistDesc(e.target.value)}
                  placeholder={`代码片段: ${project?.title || ''}`}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                />
              </div>

              {/* Custom Styled Switch for Public / Secret */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    {gistPublic ? '公开 Gist (Public)' : '私有 Gist (Secret)'}
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    {gistPublic ? '所有人在 GitHub 上可见并可被搜索引擎检索' : '仅拥有链接者可通过直接 URL 访问'}
                  </span>
                </div>

                {/* Custom Toggle Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={gistPublic}
                  onClick={() => setGistPublic(!gistPublic)}
                  className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 shrink-0 ${
                    gistPublic ? 'bg-[var(--brand)]' : 'bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white transition-transform transform shadow-sm ${
                      gistPublic ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="pt-1 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleCreateGist}
                  disabled={isLoading || !project?.files || project.files.length === 0}
                  className="px-4 py-2 bg-[var(--brand)] text-white text-xs font-semibold rounded-lg press-feedback disabled:opacity-50 flex items-center space-x-1.5 shadow-sm"
                >
                  {isLoading && actionType === 'gist' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在创建 Gist...</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5" />
                      <span>立即发布 Gist</span>
                    </>
                  )}
                </button>
              </div>

              {/* Gist Result Card */}
              {gistUrl && (
                <div className="p-3 rounded-lg bg-[var(--brand-subtle)] border border-[var(--brand)]/30 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--brand)]">Gist 发布成功！</span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleCopyGistUrl}
                        className="px-2 py-1 rounded bg-[var(--bg-primary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs flex items-center space-x-1 border border-[var(--border-subtle)] press-feedback"
                      >
                        {gistCopied ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span className="text-emerald-500">已复制!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>复制链接</span>
                          </>
                        )}
                      </button>

                      <a
                        href={gistUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-[var(--brand)] text-white font-semibold flex items-center space-x-1 text-xs press-feedback"
                      >
                        <span>打开 Gist</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  <div className="font-mono-code text-[11px] text-[var(--text-secondary)] break-all select-all bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-subtle)]">
                    {gistUrl}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-3 bg-[var(--bg-tertiary)] border-t border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <div>
          {parsedInfo && activeTab === 'sync' && (
            <button
              type="button"
              onClick={handlePull}
              disabled={isLoading}
              className="px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-semibold rounded-lg press-feedback flex items-center space-x-1.5 disabled:opacity-50"
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
            className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg disabled:opacity-50"
          >
            关闭
          </button>

          {activeTab === 'sync' && (
            <button
              type="button"
              onClick={handlePush}
              disabled={isLoading}
              className="px-4 py-1.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-semibold rounded-lg press-feedback flex items-center space-x-1.5 disabled:opacity-50 shadow-sm"
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
          )}
        </div>
      </div>
    </ModalShell>
  );
};
