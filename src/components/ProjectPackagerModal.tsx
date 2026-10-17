import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package,
  FileArchive,
  Globe,
  Smartphone,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  GitBranch,
  Terminal,
  BookOpen,
  Database,
  Box,
  Check,
  ChevronDown,
  History,
  Copy,
  FileText,
  Trash2,
  RefreshCw,
  Settings
} from 'lucide-react';
import { CodeProject } from '../types';
import { ModalShell } from './ModalShell';
import {
  packagerRegistry,
  PackagerDefinition,
  PackagingProgress,
  triggerBlobDownload
} from '../packagers';
import { loadStoredGitTokens } from '../services/gitService';
import { checkGitHubTokenScopes, GitHubTokenInfo } from '../services/githubCloudBuildRunner';
import {
  getBuildRecords,
  deleteBuildRecord,
  triggerDownloadLog,
  triggerDownloadArtifact,
  BuildRecord,
  saveBuildRecord
} from '../services/buildHistoryService';

interface ProjectPackagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: CodeProject;
  onUpdateProjectGitConfig?: (projectId: string, gitConfig: NonNullable<CodeProject['gitConfig']>) => void;
}

export const ProjectPackagerModal: React.FC<ProjectPackagerModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProjectGitConfig
}) => {
  const [activeTab, setActiveTab] = useState<'build' | 'history'>('build');
  const [buildMode, setBuildMode] = useState<'local' | 'cloud'>('local');

  // 动态获取匹配当前项目语言的打包器
  const availablePackagers = useMemo(() => {
    return packagerRegistry.getPackagersForProject(project, buildMode);
  }, [project, buildMode]);

  const [selectedPackagerId, setSelectedPackagerId] = useState<string>('');

  // 自动选择第一个可用的打包器
  useEffect(() => {
    if (availablePackagers.length > 0) {
      if (!availablePackagers.some((p) => p.id === selectedPackagerId)) {
        setSelectedPackagerId(availablePackagers[0].id);
      }
    } else {
      setSelectedPackagerId('');
    }
  }, [availablePackagers, selectedPackagerId]);

  const currentPackager = useMemo(() => {
    return packagerRegistry.get(selectedPackagerId);
  }, [selectedPackagerId]);

  // 通用自定义打包参数 (自动使用默认值，也允许用户修改)
  const [appName, setAppName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [entryFile, setEntryFile] = useState('');
  const [extraConfig, setExtraConfig] = useState<Record<string, any>>({});
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  // GitHub 云构建参数
  const [token, setToken] = useState('');
  const [branch, setBranch] = useState('main');
  const [savedTokens, setSavedTokens] = useState<ReturnType<typeof loadStoredGitTokens>>([]);
  const [selectedTokenMode, setSelectedTokenMode] = useState<string>('onetime');
  const [isTokenDropdownOpen, setIsTokenDropdownOpen] = useState(false);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);

  // 令牌权限校验状态 (判断是否具备 delete_repo 权限)
  const [tokenCheckState, setTokenCheckState] = useState<{
    checking: boolean;
    checked: boolean;
    info?: GitHubTokenInfo;
  }>({
    checking: false,
    checked: false
  });

  // 用户指定的仓库名称 (当令牌缺少 delete_repo 时要求用户输入)
  const [customRepoName, setCustomRepoName] = useState('');

  // 实时执行状态与日志
  const [progress, setProgress] = useState<PackagingProgress>({
    step: '',
    percent: 0,
    status: 'idle'
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [lastBuiltArtifact, setLastBuiltArtifact] = useState<{
    filename: string;
    githubRunUrl?: string;
    downloadUrl?: string;
    blob?: Blob;
    isTemporaryRepo?: boolean;
    repoName?: string;
  } | null>(null);

  // 本地构建历史列表
  const [historyRecords, setHistoryRecords] = useState<BuildRecord[]>([]);
  const [copiedLogToast, setCopiedLogToast] = useState(false);
  const terminalLogEndRef = useRef<HTMLDivElement>(null);

  // 刷新本地构建记录
  const loadHistory = async () => {
    try {
      const records = await getBuildRecords(project.id);
      setHistoryRecords(records);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, project.id]);

  // 当弹窗打开时初始化参数
  useEffect(() => {
    if (isOpen) {
      setProgress({ step: '', percent: 0, status: 'idle' });
      setErrorMsg('');
      setLastBuiltArtifact(null);

      // 初始化默认值
      setAppName(project.title || 'app');
      setVersion('1.0.0');

      // 智能探测主入口
      const detected =
        project.files.find((f) => f.isEntry)?.name ||
        project.files.find((f) => f.name === 'main.py' || f.name === 'app.py' || f.name === 'index.html' || f.name === 'index.js')?.name ||
        project.files[0]?.name ||
        'main.py';
      setEntryFile(detected);

      // 初始化默认建议的构建仓库名
      const safeTitle = (project.title || 'app').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      setCustomRepoName(`${safeTitle}-build`);

      // 加载本地已保存的 Git 令牌
      const tokens = loadStoredGitTokens();
      setSavedTokens(tokens);

      if (project.gitConfig?.token) {
        setToken(project.gitConfig.token);
      } else if (tokens.length > 0) {
        const ghToken = tokens.find((t) => t.provider === 'github') || tokens[0];
        if (ghToken) {
          setSelectedTokenMode(`saved-${ghToken.id}`);
          setToken(ghToken.token);
        }
      }
    }
  }, [isOpen, project]);

  // 点击外部关闭 Token 下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tokenDropdownRef.current && !tokenDropdownRef.current.contains(e.target as Node)) {
        setIsTokenDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeTokenValue = useMemo(() => {
    if (selectedTokenMode === 'onetime') {
      return token.trim();
    }
    if (selectedTokenMode.startsWith('saved-')) {
      const tokenId = selectedTokenMode.replace('saved-', '');
      const found = savedTokens.find((t) => t.id === tokenId);
      return found ? found.token.trim() : token.trim();
    }
    return token.trim();
  }, [selectedTokenMode, token, savedTokens]);

  const activeTokenLabel = useMemo(() => {
    if (selectedTokenMode === 'onetime') {
      return '一次性填入';
    }
    const tokenId = selectedTokenMode.replace('saved-', '');
    const found = savedTokens.find((t) => t.id === tokenId);
    return found ? `${found.label} (${found.provider.toUpperCase()})` : '一次性填入';
  }, [selectedTokenMode, savedTokens]);

  // 当 Token 改变时，自动校验权限及 delete_repo 范围
  useEffect(() => {
    if (!activeTokenValue || buildMode !== 'cloud') {
      setTokenCheckState({ checking: false, checked: false });
      return;
    }

    let isMounted = true;
    setTokenCheckState({ checking: true, checked: false });

    const timer = setTimeout(async () => {
      const info = await checkGitHubTokenScopes(activeTokenValue);
      if (isMounted) {
        setTokenCheckState({
          checking: false,
          checked: true,
          info
        });
      }
    }, 600);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [activeTokenValue, buildMode]);

  // 控制日志窗口自动滚动到底部
  useEffect(() => {
    if (progress.status === 'running' && terminalLogEndRef.current) {
      terminalLogEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [progress.allLogs, progress.status]);

  // 开始执行打包
  const handleStartBuild = async () => {
    if (!selectedPackagerId) return;

    setErrorMsg('');
    setLastBuiltArtifact(null);
    setProgress({
      step: '正在初始化打包任务...',
      percent: 5,
      status: 'running',
      allLogs: `[${new Date().toLocaleTimeString()}] 开始执行打包任务: ${currentPackager?.name || selectedPackagerId}\n`
    });

    const startTime = Date.now();

    try {
      const targetPackager = packagerRegistry.get(selectedPackagerId);
      if (!targetPackager) {
        throw new Error('未找到选中的打包器');
      }

      // 验证云端打包必要前置条件
      if (buildMode === 'cloud') {
        if (!activeTokenValue) {
          throw new Error('云端打包需要提供具有 workflow 权限的 GitHub Access Token');
        }

        // 如果令牌没有 delete_repo 权限，必须提供有效的新仓库名称
        if (tokenCheckState.checked && tokenCheckState.info && !tokenCheckState.info.hasDeleteRepo) {
          if (!customRepoName.trim()) {
            throw new Error('当前令牌缺少删除仓库权限，请输入新建的构建仓库名称');
          }
        }
      }

      const result = await targetPackager.package(
        project,
        {
          token: activeTokenValue,
          branch: branch.trim() || 'main',
          appName: appName.trim() || project.title,
          version: version.trim() || '1.0.0',
          entryFile: entryFile.trim(),
          customRepoName: customRepoName.trim(),
          hasDeleteRepoPermission: tokenCheckState.info?.hasDeleteRepo ?? false,
          isTemporaryRepo: tokenCheckState.info?.hasDeleteRepo ?? false,
          extraConfig,
          onUpdateGitConfig: (newGitConfig) => {
            // 只有不是临时仓库时才更新项目 Git 关联
            if (!tokenCheckState.info?.hasDeleteRepo && onUpdateProjectGitConfig) {
              onUpdateProjectGitConfig(project.id, newGitConfig);
            }
          }
        },
        (p) => setProgress(p)
      );

      // 本地单机产物自动触发客户端直接下载
      if (result.blob && result.filename) {
        triggerBlobDownload(result.blob, result.filename);
      }

      // 如果是本地打包，在此持久化保存构建日志与产物
      if (buildMode === 'local') {
        const durationMs = Date.now() - startTime;
        await saveBuildRecord({
          id: `build-local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          projectId: project.id,
          projectName: project.title,
          packagerId: targetPackager.id,
          packagerName: targetPackager.name,
          category: 'local',
          timestamp: Date.now(),
          status: 'success',
          durationMs,
          logs: progress.allLogs || `本地打包完成: ${result.filename}`,
          steps: [{ name: '本地编译压缩', status: 'success', duration: `${(durationMs / 1000).toFixed(1)}s` }],
          artifactName: result.filename,
          artifactSize: result.blob?.size,
          artifactBlob: result.blob
        });
      }

      setLastBuiltArtifact({
        filename: result.filename,
        githubRunUrl: result.githubRunUrl,
        downloadUrl: result.downloadUrl,
        blob: result.blob,
        isTemporaryRepo: result.isTemporaryRepo,
        repoName: result.repoName
      });

      setProgress((prev) => ({
        ...prev,
        status: 'success',
        githubRunUrl: result.githubRunUrl,
        downloadUrl: result.downloadUrl
      }));

      // 刷新历史
      loadHistory();
    } catch (err: any) {
      const msg = err.message || '打包流程异常中断，请检查配置与网络';
      setErrorMsg(msg);
      setProgress((prev) => ({
        ...prev,
        step: '打包失败',
        percent: 0,
        status: 'error',
        allLogs: `${prev.allLogs || ''}\n[${new Date().toLocaleTimeString()}] 错误: ${msg}\n`
      }));

      // 保存失败记录至本地
      const durationMs = Date.now() - startTime;
      await saveBuildRecord({
        id: `build-err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        projectId: project.id,
        projectName: project.title,
        packagerId: selectedPackagerId,
        packagerName: currentPackager?.name || selectedPackagerId,
        category: buildMode,
        timestamp: Date.now(),
        status: 'failure',
        durationMs,
        error: msg,
        logs: progress.allLogs || msg,
        steps: progress.steps || []
      }).catch(() => {});

      loadHistory();
    }
  };

  const copyLogsToClipboard = () => {
    if (!progress.allLogs) return;
    navigator.clipboard.writeText(progress.allLogs);
    setCopiedLogToast(true);
    setTimeout(() => setCopiedLogToast(false), 2000);
  };

  const renderPackagerIcon = (icon: PackagerDefinition['icon']) => {
    switch (icon) {
      case 'FileArchive':
        return <FileArchive className="w-4 h-4 text-blue-500" />;
      case 'Globe':
        return <Globe className="w-4 h-4 text-blue-500" />;
      case 'Terminal':
        return <Terminal className="w-4 h-4 text-blue-500" />;
      case 'BookOpen':
        return <BookOpen className="w-4 h-4 text-blue-500" />;
      case 'Database':
        return <Database className="w-4 h-4 text-blue-500" />;
      case 'Smartphone':
        return <Smartphone className="w-4 h-4 text-blue-500" />;
      case 'Box':
        return <Box className="w-4 h-4 text-blue-500" />;
      default:
        return <Package className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="项目打包与导出"
      icon={<Package className="w-4 h-4 text-blue-500" />}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* 顶部标签栏：打包方案 vs 本地构建历史与产物 */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setActiveTab('build')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all press-feedback flex items-center space-x-1.5 ${
                activeTab === 'build'
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-semibold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-blue-500" />
              <span>打包方案</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('history');
                loadHistory();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all press-feedback flex items-center space-x-1.5 relative ${
                activeTab === 'history'
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-semibold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <History className="w-3.5 h-3.5 text-blue-500" />
              <span>构建记录</span>
              {historyRecords.length > 0 && (
                <span className="px-1.5 py-0.2 bg-blue-500/10 text-blue-500 text-[10px] font-mono-code rounded">
                  {historyRecords.length}
                </span>
              )}
            </button>
          </div>

          <div className="text-[11px] text-[var(--text-tertiary)]">
            当前工程: <strong className="text-[var(--text-primary)]">{project.language.toUpperCase()}</strong>
          </div>
        </div>

        {activeTab === 'history' ? (
          /* 历史记录与本地保存的日志与产物视图 */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>即使 GitHub 临时仓库已彻底删除，日志与制品依然完整保存在本地。</span>
              <button
                type="button"
                onClick={loadHistory}
                className="text-blue-500 hover:text-blue-600 flex items-center space-x-1"
              >
                <RefreshCw className="w-3 h-3 text-blue-500" />
                <span>刷新记录</span>
              </button>
            </div>

            {historyRecords.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--text-tertiary)] border border-dashed border-[var(--border-subtle)] rounded-xl">
                暂无打包构建历史。请在「打包方案」中选择并触发打包。
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {historyRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl text-xs space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-[var(--text-primary)]">{rec.packagerName}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              rec.status === 'success'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {rec.status === 'success' ? '构建成功' : '构建失败'}
                          </span>
                          <span className="text-[10px] text-[var(--text-tertiary)]">
                            {rec.category === 'cloud' ? 'GitHub 云构建' : '本地打包'}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-tertiary)] font-mono-code">
                          {new Date(rec.timestamp).toLocaleString()} · 耗时 {(rec.durationMs / 1000).toFixed(1)}s
                          {rec.isTemporaryRepo ? ' · 临时仓库已销毁' : ''}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        {rec.artifactName && (
                          <button
                            type="button"
                            onClick={() => triggerDownloadArtifact(rec)}
                            className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-[11px] font-medium flex items-center space-x-1 shadow-xs"
                            title="下载已在本地保存的制品"
                          >
                            <Download className="w-3 h-3 text-white" />
                            <span>下载产物</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => triggerDownloadLog(rec)}
                          className="px-2 py-1 bg-[var(--bg-secondary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded text-[11px] font-medium flex items-center space-x-1"
                          title="导出完整构建日志文本"
                        >
                          <FileText className="w-3 h-3 text-blue-500" />
                          <span>下载日志</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            await deleteBuildRecord(rec.id);
                            loadHistory();
                          }}
                          className="p-1 text-[var(--text-tertiary)] hover:text-rose-500 rounded"
                          title="删除该条记录"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {rec.error && (
                      <div className="p-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[11px] rounded">
                        错误原因: {rec.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* 打包构建配置与执行视图 */
          <div className="space-y-4">
            {/* 打包模式切换 */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setBuildMode('local')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all press-feedback ${
                  buildMode === 'local'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Download className="w-3.5 h-3.5 text-blue-500" />
                <span>本地打包</span>
              </button>
              <button
                type="button"
                onClick={() => setBuildMode('cloud')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all press-feedback ${
                  buildMode === 'cloud'
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5 text-blue-500" />
                <span>云端打包</span>
              </button>
            </div>

            {/* 动态打包器格式选择 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  {buildMode === 'local' ? '选择打包方案：' : '选择云端打包构件：'}
                </label>
                <span className="text-[11px] text-[var(--text-tertiary)] font-mono-code">
                  {availablePackagers.length} 个可用插件
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {availablePackagers.map((pkg) => {
                  const isSelected = selectedPackagerId === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelectedPackagerId(pkg.id)}
                      className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all relative press-feedback ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-2 mb-1.5 pr-6">
                          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                            {renderPackagerIcon(pkg.icon)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                              {pkg.name}
                            </div>
                            <div className="text-[10px] text-[var(--text-tertiary)] font-mono-code">
                              产物后缀: {pkg.artifactExtension}
                            </div>
                          </div>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                          {pkg.description}
                        </p>
                      </div>

                      {isSelected && (
                        <div className="absolute top-2.5 right-2.5 w-4 h-4 bg-white border border-blue-500 rounded-full flex items-center justify-center shadow-xs">
                          <Check className="w-2.5 h-2.5 text-blue-500" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 参数配置区域：允许用户提供自定义信息，也自动提供默认值 */}
            <div className="p-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
                  className="flex items-center space-x-1.5 text-xs font-medium text-[var(--text-primary)] hover:text-blue-500"
                >
                  <Settings className="w-3.5 h-3.5 text-blue-500" />
                  <span>打包参数配置</span>
                  <ChevronDown className={`w-3 h-3 text-blue-500 transition-transform ${showAdvancedConfig ? 'rotate-180' : ''}`} />
                </button>
                <span className="text-[11px] text-[var(--text-tertiary)] font-mono-code">默认参数</span>
              </div>

              {showAdvancedConfig && (
                <div className="space-y-2.5 pt-1 border-t border-[var(--border-subtle)]">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-secondary)]">制品/应用名称</label>
                      <input
                        type="text"
                        value={appName}
                        onChange={(e) => setAppName(e.target.value)}
                        placeholder="输入应用名称"
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-secondary)]">版本号</label>
                      <input
                        type="text"
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        placeholder="输入版本号"
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-secondary)]">主入口脚本</label>
                      <input
                        type="text"
                        value={entryFile}
                        onChange={(e) => setEntryFile(e.target.value)}
                        placeholder="输入主入口文件"
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* 针对当前打包器的特定自定义字段渲染 */}
                  {currentPackager?.fields && currentPackager.fields.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[var(--border-subtle)]">
                      {currentPackager.fields.map((field) => (
                        <div key={field.key} className="space-y-1">
                          <label className="text-[11px] text-[var(--text-secondary)]">{field.label}</label>
                          {field.type === 'boolean' ? (
                            <label className="flex items-center space-x-2 py-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={extraConfig[field.key] ?? field.defaultValue}
                                onChange={(e) => setExtraConfig({ ...extraConfig, [field.key]: e.target.checked })}
                                className="rounded text-blue-500 focus:ring-blue-500"
                              />
                              <span className="text-xs text-[var(--text-primary)]">{field.helpText || field.label}</span>
                            </label>
                          ) : (
                            <input
                              type={field.type === 'number' ? 'number' : 'text'}
                              value={extraConfig[field.key] ?? field.defaultValue}
                              onChange={(e) =>
                                setExtraConfig({
                                  ...extraConfig,
                                  [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value
                                })
                              }
                              placeholder={field.placeholder}
                              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* GitHub 云打包专项凭证与生命周期配置 */}
            {buildMode === 'cloud' && (
              <div className="p-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-xs font-medium text-[var(--text-primary)]">
                    <GitBranch className="w-3.5 h-3.5 text-blue-500" />
                    <span>GitHub 云端配置</span>
                  </div>
                  <span className="text-[11px] text-[var(--text-tertiary)]">权限检测</span>
                </div>

                {/* Token 选择与检测 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1" ref={tokenDropdownRef}>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-[var(--text-secondary)]">Personal Access Token *</label>
                      {savedTokens.length > 0 && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setIsTokenDropdownOpen(!isTokenDropdownOpen)}
                            className="text-[11px] text-blue-500 hover:text-blue-600 flex items-center space-x-0.5"
                          >
                            <span>{activeTokenLabel}</span>
                            <ChevronDown className="w-3 h-3 text-blue-500" />
                          </button>
                          {isTokenDropdownOpen && (
                            <div className="absolute right-0 bottom-full mb-1 z-50 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg shadow-lg py-1 w-44 text-xs">
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
                                    setToken(t.token);
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
                    {selectedTokenMode === 'onetime' ? (
                      <input
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="输入访问令牌"
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                      />
                    ) : (
                      <div className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] font-mono-code truncate">
                        已加载已保存令牌 ({activeTokenLabel})
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--text-secondary)]">目标构建分支</label>
                    <input
                      type="text"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="输入分支名称"
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* 关键逻辑提示：根据 delete_repo 权限处理仓库生命周期 */}
                {tokenCheckState.checking ? (
                  <div className="p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs flex items-center space-x-2 text-[var(--text-secondary)]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    <span>正在检测令牌权限与 delete_repo 作用域...</span>
                  </div>
                ) : tokenCheckState.checked && tokenCheckState.info?.valid ? (
                  tokenCheckState.info.hasDeleteRepo ? (
                    /* 拥有 delete_repo 权限：临时仓库自动删除，不关联 */
                    <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs space-y-1">
                      <div className="flex items-center space-x-1.5 font-medium text-blue-500">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                        <span>令牌具备删除仓库权限 (临时隔离构建)</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                        使用隔离临时仓库打包，构建完成后自动删除该临时仓库，不关联项目。日志与产物自动保存在本地。
                      </p>
                    </div>
                  ) : (
                    /* 没有 delete_repo 权限：提示用户输入新仓库名字 */
                    <div className="p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs space-y-2">
                      <div className="flex items-center space-x-1.5 text-[var(--text-primary)] font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-blue-500" />
                        <span>令牌无删除仓库权限：请输入新建仓库名称</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                        当前令牌无删除仓库权限，无法自动清理临时仓库，打包后将保留该仓库。请输入新仓库名称：
                      </p>
                      <div className="flex items-center space-x-2 pt-1">
                        <input
                          type="text"
                          value={customRepoName}
                          onChange={(e) => setCustomRepoName(e.target.value)}
                          placeholder="输入新仓库名称"
                          className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )
                ) : null}
              </div>
            )}

            {/* 打包进行中：进度条与实时步骤追踪 */}
            {progress.status === 'running' && (
              <div className="p-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl space-y-2.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span className="flex items-center space-x-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    <span className="font-medium text-[var(--text-primary)]">{progress.step}</span>
                  </span>
                  <span className="font-mono-code font-semibold text-blue-500">{progress.percent}%</span>
                </div>

                <div className="w-full bg-[var(--bg-secondary)] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${progress.percent}%` }}
                  ></div>
                </div>

                {/* 步骤清单展示 */}
                {progress.steps && progress.steps.length > 0 && (
                  <div className="space-y-1 pt-1 max-h-36 overflow-y-auto">
                    {progress.steps.map((st, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-[11px] py-0.5 px-2 rounded bg-[var(--bg-secondary)]"
                      >
                        <div className="flex items-center space-x-1.5">
                          {st.status === 'success' ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : st.status === 'running' ? (
                            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                          ) : st.status === 'failure' ? (
                            <AlertCircle className="w-3 h-3 text-rose-500" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-[var(--border-subtle)]" />
                          )}
                          <span
                            className={
                              st.status === 'running'
                                ? 'text-blue-500 font-medium'
                                : st.status === 'success'
                                ? 'text-[var(--text-primary)]'
                                : 'text-[var(--text-tertiary)]'
                            }
                          >
                            {st.name}
                          </span>
                        </div>
                        {st.duration && <span className="text-[10px] text-[var(--text-tertiary)] font-mono-code">{st.duration}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 自动化实时终端日志展示窗口 */}
            {progress.allLogs && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 text-[var(--text-secondary)] font-medium">
                    <Terminal className="w-3.5 h-3.5 text-blue-500" />
                    <span>打包过程控制台日志</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {copiedLogToast && (
                      <span className="text-[11px] text-emerald-500 font-medium">已复制日志</span>
                    )}
                    <button
                      type="button"
                      onClick={copyLogsToClipboard}
                      className="text-[11px] text-blue-500 hover:text-blue-600 flex items-center space-x-1"
                    >
                      <Copy className="w-3 h-3 text-blue-500" />
                      <span>复制</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-[#0d1117] text-[#c9d1d9] font-mono-code text-[11px] rounded-xl max-h-48 overflow-y-auto leading-relaxed border border-[var(--border-subtle)] select-text">
                  <pre className="whitespace-pre-wrap">{progress.allLogs}</pre>
                  <div ref={terminalLogEndRef} />
                </div>
              </div>
            )}

            {/* 成功状态展示 */}
            {progress.status === 'success' && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-2 text-xs">
                <div className="flex items-center space-x-1.5 text-blue-500 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-blue-500" />
                  <span>打包任务成功完成！</span>
                </div>
                <p className="text-[var(--text-secondary)]">{progress.step}</p>
                {lastBuiltArtifact?.filename && (
                  <div className="text-[11px] text-[var(--text-primary)] font-mono-code">
                    生成产物: <strong>{lastBuiltArtifact.filename}</strong>
                  </div>
                )}
                {lastBuiltArtifact?.isTemporaryRepo && (
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    临时构建仓库已自动彻底销毁，产物与日志已本地永久保存。
                  </div>
                )}
                <div className="flex items-center space-x-2 pt-1">
                  {lastBuiltArtifact?.blob && (
                    <button
                      type="button"
                      onClick={() => triggerBlobDownload(lastBuiltArtifact.blob!, lastBuiltArtifact.filename)}
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-xs shadow-xs flex items-center space-x-1"
                    >
                      <Download className="w-3.5 h-3.5 text-white" />
                      <span>再次下载产物</span>
                    </button>
                  )}
                  {progress.githubRunUrl && (
                    <a
                      href={progress.githubRunUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg font-medium text-xs"
                    >
                      <span>在 GitHub Actions 中查看构建</span>
                      <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-1.5 text-xs text-rose-600 dark:text-rose-400">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] pl-6">
                  打包可能因语法错误、缺失依赖或远程 Runner 超时而中断，您可在上方控制台日志中查看详细报错信息，并在配置中调整后重新打包。
                </p>
              </div>
            )}

            {/* 底栏操作按钮 */}
            <div className="flex items-center space-x-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={onClose}
                disabled={progress.status === 'running'}
                className="flex-1 py-2.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs font-medium press-feedback border border-[var(--border-subtle)] disabled:opacity-50"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={handleStartBuild}
                disabled={progress.status === 'running' || !selectedPackagerId}
                className="flex-1 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium press-feedback shadow-xs flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                {progress.status === 'running' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>打包中...</span>
                  </>
                ) : (
                  <>
                    <Package className="w-3.5 h-3.5 text-white" />
                    <span>立即打包</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
