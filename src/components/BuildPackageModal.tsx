import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Globe,
  FileCode,
  Smartphone,
  FileArchive,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  GitBranch,
  KeyRound,
  ShieldCheck,
  Cpu,
  BookOpen,
  Info,
  RefreshCw,
  Play,
  Check,
  Layers,
  ArrowRight
} from 'lucide-react';
import { CodeProject, GitHubWorkflowRun, GitHubArtifact, GitHubReleaseItem, GitSavedToken } from '../types';
import { ModalShell } from './ModalShell';
import {
  buildStandaloneHtml,
  buildWebDistZip,
  buildPwaZip,
  buildSourceZip,
  downloadBlob,
  downloadTextFile
} from '../utils/localPackager';
import {
  generateApkWorkflowYaml,
  injectApkWorkflowIntoProject,
  fetchGitHubWorkflowRuns,
  triggerGitHubWorkflow,
  fetchGitHubRunArtifacts,
  fetchGitHubReleases,
  parseGitUrl,
  loadStoredGitTokens
} from '../services/gitService';

interface BuildPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: CodeProject | null;
  onUpdateProject?: (updatedProject: CodeProject) => void;
  onShowToast?: (message: string) => void;
}

type PackageTab = 'local' | 'github-apk' | 'research';

export const BuildPackageModal: React.FC<BuildPackageModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProject,
  onShowToast
}) => {
  const [activeTab, setActiveTab] = useState<PackageTab>('local');

  // Local build states
  const [isBuildingLocal, setIsBuildingLocal] = useState<string | null>(null);
  const [buildProgressText, setBuildProgressText] = useState<string>('');
  const [buildProgressPercent, setBuildProgressPercent] = useState<number>(0);

  // GitHub Actions APK states
  const [repoUrl, setRepoUrl] = useState<string>('');
  const [branch, setBranch] = useState<string>('main');
  const [selectedTokenMode, setSelectedTokenMode] = useState<string>('onetime');
  const [oneTimeToken, setOneTimeToken] = useState<string>('');
  const [savedTokens, setSavedTokens] = useState<GitSavedToken[]>([]);
  
  const [isInjectingWorkflow, setIsInjectingWorkflow] = useState<boolean>(false);
  const [isTriggeringBuild, setIsTriggeringBuild] = useState<boolean>(false);
  const [isFetchingRuns, setIsFetchingRuns] = useState<boolean>(false);
  
  const [workflowRuns, setWorkflowRuns] = useState<GitHubWorkflowRun[]>([]);
  const [releases, setReleases] = useState<GitHubReleaseItem[]>([]);
  const [selectedRunArtifacts, setSelectedRunArtifacts] = useState<{ runId: number; artifacts: GitHubArtifact[] } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Synchronize repo url from project gitConfig
  useEffect(() => {
    if (project?.gitConfig) {
      setRepoUrl(project.gitConfig.repoUrl || '');
      setBranch(project.gitConfig.branch || 'main');
    }
    const tokens = loadStoredGitTokens();
    setSavedTokens(tokens);
    const githubToken = tokens.find(t => t.provider === 'github');
    if (githubToken) {
      setSelectedTokenMode(`saved-${githubToken.id}`);
    }
  }, [project]);

  // Check if project already has the workflow file
  const hasWorkflowFile = useMemo(() => {
    if (!project?.files) return false;
    return project.files.some(f => f.name === '.github/workflows/build-apk.yml');
  }, [project?.files]);

  // Current active GitHub Token
  const activeToken = useMemo(() => {
    if (selectedTokenMode.startsWith('saved-')) {
      const tokenId = selectedTokenMode.replace('saved-', '');
      const t = savedTokens.find(item => item.id === tokenId);
      return t ? t.token : '';
    }
    return oneTimeToken.trim();
  }, [selectedTokenMode, savedTokens, oneTimeToken]);

  // Parsed GitHub repo coordinates
  const parsedRepo = useMemo(() => {
    if (!repoUrl.trim()) return null;
    const parsed = parseGitUrl(repoUrl.trim());
    if (parsed && parsed.provider === 'github') {
      return parsed;
    }
    return null;
  }, [repoUrl]);

  // Trigger local builds
  const handleBuildLocal = async (type: 'standalone' | 'web-dist' | 'pwa' | 'source') => {
    if (!project) return;
    setIsBuildingLocal(type);
    setBuildProgressPercent(10);
    setBuildProgressText('准备打包环境与项目资源...');

    try {
      if (type === 'standalone') {
        const { content, filename } = await buildStandaloneHtml(project, (msg, pct) => {
          setBuildProgressText(msg);
          setBuildProgressPercent(pct);
        });
        downloadTextFile(content, filename);
        onShowToast?.(`已成功导出单文件独立应用: ${filename}`);
      } else if (type === 'web-dist') {
        const { blob, filename } = await buildWebDistZip(project, (msg, pct) => {
          setBuildProgressText(msg);
          setBuildProgressPercent(pct);
        });
        downloadBlob(blob, filename);
        onShowToast?.(`已成功导出 Web 生产静态发布包: ${filename}`);
      } else if (type === 'pwa') {
        const { blob, filename } = await buildPwaZip(project, (msg, pct) => {
          setBuildProgressText(msg);
          setBuildProgressPercent(pct);
        });
        downloadBlob(blob, filename);
        onShowToast?.(`已成功导出 PWA 离线安装包: ${filename}`);
      } else if (type === 'source') {
        const { blob, filename } = await buildSourceZip(project, (msg, pct) => {
          setBuildProgressText(msg);
          setBuildProgressPercent(pct);
        });
        downloadBlob(blob, filename);
        onShowToast?.(`已成功导出标准工程源码包: ${filename}`);
      }
    } catch (err: any) {
      console.error('Local build error:', err);
      alert(`打包失败: ${err.message || '未知错误'}`);
    } finally {
      setIsBuildingLocal(null);
      setBuildProgressPercent(0);
      setBuildProgressText('');
    }
  };

  // Inject APK workflow into project files
  const handleInjectWorkflow = () => {
    if (!project) return;
    setIsInjectingWorkflow(true);
    try {
      const { updatedProject, addedFileNames } = injectApkWorkflowIntoProject(project);
      if (onUpdateProject) {
        onUpdateProject(updatedProject);
      }
      onShowToast?.(`已成功注入工作流: ${addedFileNames.join(', ')}`);
      setStatusMessage(`已成功为项目生成 .github/workflows/build-apk.yml 及 Capacitor 配置文件！`);
    } catch (err: any) {
      setErrorMessage(err.message || '注入工作流失败');
    } finally {
      setIsInjectingWorkflow(false);
    }
  };

  // Fetch GitHub Actions runs
  const handleFetchWorkflowRuns = async () => {
    if (!parsedRepo) {
      setErrorMessage('请填写正确的 GitHub 仓库地址 (例如 https://github.com/owner/repo)');
      return;
    }
    setIsFetchingRuns(true);
    setErrorMessage('');
    try {
      const runs = await fetchGitHubWorkflowRuns({
        owner: parsedRepo.owner,
        repo: parsedRepo.repo,
        token: activeToken || undefined
      });
      setWorkflowRuns(runs);

      const rels = await fetchGitHubReleases({
        owner: parsedRepo.owner,
        repo: parsedRepo.repo,
        token: activeToken || undefined
      });
      setReleases(rels);

      setStatusMessage(`已获取 ${runs.length} 条 GitHub Actions 云端构建记录`);
    } catch (err: any) {
      setErrorMessage(err.message || '获取 GitHub Actions 历史记录失败');
    } finally {
      setIsFetchingRuns(false);
    }
  };

  // Trigger GitHub Actions workflow dispatch
  const handleTriggerBuild = async () => {
    if (!parsedRepo) {
      setErrorMessage('请填写正确的 GitHub 仓库地址');
      return;
    }
    if (!activeToken) {
      setErrorMessage('触发 GitHub Actions 云端编译需要提供 GitHub Personal Access Token (须包含 repo 与 workflow 权限)');
      return;
    }

    setIsTriggeringBuild(true);
    setErrorMessage('');
    setStatusMessage('正在向 GitHub Actions API 发送 workflow_dispatch 触发请求...');

    try {
      await triggerGitHubWorkflow({
        owner: parsedRepo.owner,
        repo: parsedRepo.repo,
        token: activeToken,
        workflowIdOrFilename: 'build-apk.yml',
        ref: branch || 'main'
      });

      setStatusMessage('已成功触发 GitHub Actions 云端真机构建！云编译集群正在启动容器...');
      onShowToast?.('GitHub Actions 云端 APK 编译已触发！');
      
      // Auto refresh runs after 3 seconds
      setTimeout(() => {
        handleFetchWorkflowRuns();
      }, 3000);
    } catch (err: any) {
      setErrorMessage(err.message || '触发云端构建失败');
    } finally {
      setIsTriggeringBuild(false);
    }
  };

  // Fetch artifacts for a specific run
  const handleFetchArtifacts = async (runId: number) => {
    if (!parsedRepo) return;
    try {
      const artifacts = await fetchGitHubRunArtifacts({
        owner: parsedRepo.owner,
        repo: parsedRepo.repo,
        runId,
        token: activeToken || undefined
      });
      setSelectedRunArtifacts({ runId, artifacts });
    } catch (err: any) {
      alert(`获取产物失败: ${err.message}`);
    }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex flex-col max-h-[85vh] bg-[var(--bg-primary)] rounded-xl overflow-hidden select-none">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--brand-subtle)] border border-[var(--brand)]/30 flex items-center justify-center">
              <Package className="w-4 h-4 text-[var(--brand)]" />
            </div>
            <div>
              <div className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
                <span>项目打包与构建中心</span>
                <span className="text-[10px] text-[var(--text-tertiary)] font-normal font-mono-code">
                  ({project ? project.title : '未选择项目'})
                </span>
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                真实本地构建分发 · GitHub Actions 云端真机 APK 编译 (杜绝伪打包)
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 shrink-0 text-xs font-medium">
          <button
            onClick={() => setActiveTab('local')}
            className={`py-2.5 px-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'local'
                ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-[var(--brand)]" />
            <span>⚡ 本地即时打包</span>
          </button>

          <button
            onClick={() => setActiveTab('github-apk')}
            className={`py-2.5 px-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'github-apk'
                ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-[var(--brand)]" />
            <span>🚀 GitHub 云端真机 APK</span>
          </button>

          <button
            onClick={() => setActiveTab('research')}
            className={`py-2.5 px-3 border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'research'
                ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-[var(--brand)]" />
            <span>📖 打包架构与研究报告</span>
          </button>
        </div>

        {/* Tab Content Container */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: LOCAL PACKAGING */}
          {activeTab === 'local' && (
            <div className="space-y-4">
              <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                本地打包完全在浏览器端通过内存引擎进行真正的 AST 依赖解析、资源内联与标准归档压缩。无需等待服务器排队，秒级导出可用产物。
              </div>

              {/* Progress indicator */}
              {isBuildingLocal && (
                <div className="p-3 bg-[var(--brand-subtle)] border border-[var(--brand)]/30 rounded-lg space-y-2 animate-pulse">
                  <div className="flex items-center justify-between text-xs font-medium text-[var(--brand)]">
                    <span className="flex items-center space-x-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--brand)]" />
                      <span>{buildProgressText}</span>
                    </span>
                    <span>{buildProgressPercent}%</span>
                  </div>
                  <div className="w-full bg-white/40 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[var(--brand)] h-full transition-all duration-300 rounded-full"
                      style={{ width: `${buildProgressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 4 Real Local Packaging Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. Standalone Single-File HTML */}
                <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--brand)]/40 transition-colors flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-[var(--brand-subtle)] flex items-center justify-center shrink-0">
                        <FileCode className="w-4 h-4 text-[var(--brand)]" />
                      </div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        单文件独立应用 (.html)
                      </div>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      纯单文件格式，自动全量内联 CSS 样式、JS 逻辑与图片 Base64 Data URI。零 Web 服务器依赖，直接双击离线秒开运行。
                    </p>
                  </div>
                  <button
                    disabled={!!isBuildingLocal}
                    onClick={() => handleBuildLocal('standalone')}
                    className="w-full py-2 px-3 rounded-lg bg-[var(--brand)] text-white text-xs font-medium press-feedback flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-white" />
                    <span>立即打包单文件</span>
                  </button>
                </div>

                {/* 2. Web Production Dist ZIP */}
                <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--brand)]/40 transition-colors flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-[var(--brand-subtle)] flex items-center justify-center shrink-0">
                        <Globe className="w-4 h-4 text-[var(--brand)]" />
                      </div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        Web 生产静态发布包 (.zip)
                      </div>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      规范的静态发布包 (dist)，内置 index.html、分离的 CSS/JS、assets 目录及 GitHub Pages 兼容规则 (.nojekyll)，支持一键拖拽部署至 Vercel / Netlify / Nginx。
                    </p>
                  </div>
                  <button
                    disabled={!!isBuildingLocal}
                    onClick={() => handleBuildLocal('web-dist')}
                    className="w-full py-2 px-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium press-feedback flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--brand)]" />
                    <span>打包 Web 生产包</span>
                  </button>
                </div>

                {/* 3. PWA Offline Bundle */}
                <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--brand)]/40 transition-colors flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-[var(--brand-subtle)] flex items-center justify-center shrink-0">
                        <Smartphone className="w-4 h-4 text-[var(--brand)]" />
                      </div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        PWA 渐进式离线应用包 (.zip)
                      </div>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      包含完整的 Web App Manifest 清单、基于 Cache API 的真 Service Worker (sw.js) 离线缓存线程与高清图标，在任意设备上均可作为原生应用安装至桌面。
                    </p>
                  </div>
                  <button
                    disabled={!!isBuildingLocal}
                    onClick={() => handleBuildLocal('pwa')}
                    className="w-full py-2 px-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium press-feedback flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--brand)]" />
                    <span>打包 PWA 离线包</span>
                  </button>
                </div>

                {/* 4. Standard Source Distribution ZIP */}
                <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--brand)]/40 transition-colors flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-[var(--brand-subtle)] flex items-center justify-center shrink-0">
                        <FileArchive className="w-4 h-4 text-[var(--brand)]" />
                      </div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        标准工程源码包 (.zip)
                      </div>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      完整源代码目录，智能补齐 requirements.txt / package.json 依赖文件、.gitignore 过滤规则与工程 README.md 说明，便于本地 IDE 二次开发。
                    </p>
                  </div>
                  <button
                    disabled={!!isBuildingLocal}
                    onClick={() => handleBuildLocal('source')}
                    className="w-full py-2 px-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium press-feedback flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--brand)]" />
                    <span>打包工程源码包</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GITHUB ACTIONS APK CLOUD BUILD */}
          {activeTab === 'github-apk' && (
            <div className="space-y-4">
              {/* Technical Integrity Banner */}
              <div className="p-3.5 rounded-xl bg-[var(--brand-subtle)] border border-[var(--brand)]/30 space-y-1.5">
                <div className="flex items-center space-x-2 text-xs font-bold text-[var(--brand)]">
                  <ShieldCheck className="w-4 h-4 text-[var(--brand)] shrink-0" />
                  <span>技术严谨性声明 · 杜绝伪打包</span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  Android APK 是包含 Dalvik/ART 字节码、原生 so 库与 AAPT2 二进制资源的真正 Android 安装包。任何浏览器沙箱均无法提供 Java JDK、Android SDK 与 Gradle 原生编译环境。我们通过 GitHub Actions 提供的免费官方云端 CI/CD 集群执行真实的编译并生成真实的 APK，不使用任何虚假文件！
                </p>
              </div>

              {/* Status / Error alerts */}
              {statusMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{statusMessage}</span>
                </div>
              )}
              {errorMessage && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Step 1: CI/CD Workflow Setup */}
              <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[var(--text-primary)] flex items-center space-x-1.5">
                    <span className="w-4 h-4 rounded-full bg-[var(--brand)] text-white text-[10px] flex items-center justify-center font-bold">1</span>
                    <span>工作流配置 (Workflow Setup)</span>
                  </div>
                  {hasWorkflowFile ? (
                    <span className="text-[11px] text-emerald-500 font-medium flex items-center space-x-1">
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>已就绪 (.github/workflows/build-apk.yml)</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-500 font-medium">尚未配置工作流</span>
                  )}
                </div>

                <p className="text-xs text-[var(--text-secondary)]">
                  一键在项目中生成生产级 GitHub Actions 构建脚本与 Capacitor Android 配置文件。
                </p>

                <button
                  disabled={isInjectingWorkflow}
                  onClick={handleInjectWorkflow}
                  className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium press-feedback flex items-center space-x-1.5"
                >
                  {isInjectingWorkflow ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--brand)]" /> : <Layers className="w-3.5 h-3.5 text-[var(--brand)]" />}
                  <span>{hasWorkflowFile ? '重新生成并更新构建工作流' : '一键注入 GitHub Actions APK 构建工作流'}</span>
                </button>
              </div>

              {/* Step 2: Repository & Token Auth */}
              <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-3">
                <div className="text-xs font-bold text-[var(--text-primary)] flex items-center space-x-1.5">
                  <span className="w-4 h-4 rounded-full bg-[var(--brand)] text-white text-[10px] flex items-center justify-center font-bold">2</span>
                  <span>关联 GitHub 仓库与 Token 鉴权</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--text-secondary)]">GitHub 仓库 URL</label>
                    <input
                      type="text"
                      placeholder="https://github.com/owner/repo"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)] font-mono-code"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-[var(--text-secondary)]">分支 (Branch)</label>
                    <input
                      type="text"
                      placeholder="main"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)] font-mono-code"
                    />
                  </div>
                </div>

                {/* Token Configuration */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
                    <span className="flex items-center space-x-1">
                      <KeyRound className="w-3 h-3 text-[var(--brand)]" />
                      <span>GitHub Personal Access Token (PAT)</span>
                    </span>
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo,workflow"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[var(--brand)] hover:underline flex items-center space-x-0.5"
                    >
                      <span>获取 Token (勾选 repo 与 workflow)</span>
                      <ExternalLink className="w-2.5 h-2.5 text-[var(--brand)]" />
                    </a>
                  </label>

                  {savedTokens.length > 0 ? (
                    <div className="flex items-center space-x-2">
                      <select
                        value={selectedTokenMode}
                        onChange={(e) => setSelectedTokenMode(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                      >
                        <option value="onetime">输入新 Token / 临时 Token</option>
                        {savedTokens.map(t => (
                          <option key={t.id} value={`saved-${t.id}`}>
                            已保存: {t.label} ({t.token.slice(0, 6)}...{t.token.slice(-4)})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {selectedTokenMode === 'onetime' && (
                    <input
                      type="password"
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      value={oneTimeToken}
                      onChange={(e) => setOneTimeToken(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)] font-mono-code"
                    />
                  )}
                </div>
              </div>

              {/* Step 3: Trigger & Monitor Build */}
              <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[var(--text-primary)] flex items-center space-x-1.5">
                    <span className="w-4 h-4 rounded-full bg-[var(--brand)] text-white text-[10px] flex items-center justify-center font-bold">3</span>
                    <span>云端编译与构建状态监控</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      disabled={isFetchingRuns || !parsedRepo}
                      onClick={handleFetchWorkflowRuns}
                      className="px-2.5 py-1 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium press-feedback flex items-center space-x-1 disabled:opacity-50"
                      title="刷新 GitHub Actions 状态"
                    >
                      <RefreshCw className={`w-3 h-3 text-[var(--brand)] ${isFetchingRuns ? 'animate-spin' : ''}`} />
                      <span>刷新记录</span>
                    </button>
                    <button
                      disabled={isTriggeringBuild || !parsedRepo}
                      onClick={handleTriggerBuild}
                      className="px-3 py-1 rounded bg-[var(--brand)] text-white text-xs font-medium press-feedback flex items-center space-x-1 disabled:opacity-50 shadow-sm"
                    >
                      {isTriggeringBuild ? <Loader2 className="w-3 h-3 animate-spin text-white" /> : <Play className="w-3 h-3 text-white fill-current" />}
                      <span>触发云端编译</span>
                    </button>
                  </div>
                </div>

                {/* Workflow Runs List */}
                <div className="space-y-2">
                  {workflowRuns.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[var(--text-tertiary)] space-y-1">
                      <Cpu className="w-6 h-6 mx-auto stroke-1 opacity-40 text-[var(--brand)]" />
                      <div>暂无构建记录，请点击上方「触发云端编译」或「刷新记录」</div>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {workflowRuns.map((run) => (
                        <div
                          key={run.id}
                          className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-[var(--text-primary)]">
                                #{run.run_number} {run.name}
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-mono-code ${
                                  run.status === 'completed'
                                    ? run.conclusion === 'success'
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : 'bg-red-500/20 text-red-400'
                                    : 'bg-amber-500/20 text-amber-400 animate-pulse'
                                }`}
                              >
                                {run.status === 'completed'
                                  ? run.conclusion === 'success'
                                    ? '编译成功 (Success)'
                                    : '编译失败 (Failed)'
                                  : '正在云端编译中 (In Progress)'}
                              </span>
                            </div>
                            <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 flex items-center space-x-2">
                              <span>分支: {run.head_branch}</span>
                              <span>•</span>
                              <span>时间: {new Date(run.created_at).toLocaleString()}</span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            {run.conclusion === 'success' && (
                              <button
                                onClick={() => handleFetchArtifacts(run.id)}
                                className="px-2 py-0.5 rounded bg-[var(--brand-subtle)] text-[var(--brand)] border border-[var(--brand)]/30 hover:bg-[var(--brand)] hover:text-white transition-colors text-[11px] font-medium flex items-center space-x-1"
                              >
                                <Download className="w-3 h-3 text-[var(--brand)]" />
                                <span>下载 APK 产物</span>
                              </button>
                            )}
                            <a
                              href={run.html_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                              title="在 GitHub 查看完整编译日志"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-[var(--brand)]" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Artifacts Download Details Popup / Section */}
                {selectedRunArtifacts && (
                  <div className="p-3 bg-[var(--brand-subtle)] border border-[var(--brand)]/30 rounded-lg space-y-2">
                    <div className="text-xs font-bold text-[var(--brand)] flex items-center justify-between">
                      <span>编译产物列表 (Run #{selectedRunArtifacts.runId})</span>
                      <button
                        onClick={() => setSelectedRunArtifacts(null)}
                        className="text-[10px] text-[var(--text-secondary)] hover:underline"
                      >
                        关闭
                      </button>
                    </div>
                    {selectedRunArtifacts.artifacts.length === 0 ? (
                      <div className="text-xs text-[var(--text-secondary)]">未找到公开产物或产物已过期 (保留期一般为14天)。</div>
                    ) : (
                      <div className="space-y-1">
                        {selectedRunArtifacts.artifacts.map((art) => (
                          <div
                            key={art.id}
                            className="flex items-center justify-between text-xs bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-subtle)]"
                          >
                            <span className="font-mono-code truncate">{art.name} ({(art.size_in_bytes / 1024 / 1024).toFixed(2)} MB)</span>
                            <a
                              href={art.archive_download_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 rounded bg-[var(--brand)] text-white text-[11px] font-medium flex items-center space-x-1"
                            >
                              <Download className="w-3 h-3 text-white" />
                              <span>下载压缩包</span>
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: TECHNICAL RESEARCH REPORT */}
          {activeTab === 'research' && (
            <div className="space-y-4 text-xs text-[var(--text-secondary)] leading-relaxed">
              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-3">
                <div className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
                  <BookOpen className="w-4 h-4 text-[var(--brand)]" />
                  <span>为什么必须区分本地打包与云端打包？（杜绝伪打包深度研究）</span>
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <h4 className="font-semibold text-[var(--text-primary)] mb-1">
                      1. 本地打包可行性边界 (Web / PWA / 单文件 / 源码)
                    </h4>
                    <p>
                      在浏览器客户端环境中，JavaScript 引擎 (V8 / JavaScriptCore) 拥有完整的 DOM 解析、AST 遍历、CSSOM 解析与 Blob/JSZip 归档能力。因此，对于<strong>单文件独立 HTML 应用</strong>、<strong>Web 静态发布包</strong>与<strong>PWA 离线安装包</strong>，浏览器可以在完全离线的情况下执行真正的静态依赖分析与资源内联，产出 100% 可直接双击运行的真实制品。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-[var(--text-primary)] mb-1">
                      2. 原生 Android APK 无法在前端本地打包的原因
                    </h4>
                    <p>
                      Android 原生应用包 (.apk) 并非简单的压缩文件，其结构包含编译后的 Dalvik 虚拟机字节码 (classes.dex)、经过 AAPT2 二进制优化的资源表 (resources.arsc)、预编译原生库 (lib/arm64-v8a/*.so) 以及必须经过 SHA-256 签名的清单文件 (AndroidManifest.xml 与 META-INF 签名块)。编译真实 APK 必须依赖：
                    </p>
                    <ul className="list-disc list-inside mt-1 space-y-0.5 text-[var(--text-tertiary)]">
                      <li>Java 17/21 开发工具包 (JDK)</li>
                      <li>Android SDK Build-Tools (aapt2, d8/r8, zipalign, apksigner)</li>
                      <li>Gradle 守护构建进程与 Android Gradle Plugin (AGP)</li>
                    </ul>
                    <p className="mt-1">
                      由于浏览器沙箱处于操作系统安全受限层，无法运行 Linux 本地可执行二进制或挂载系统守护进程。市面上声称在纯浏览器中瞬间生成 APK 的产品几乎全部为“伪打包”（伪造扩展名或空壳应用）。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-[var(--text-primary)] mb-1">
                      3. GitHub Actions 云端构建架构与优势
                    </h4>
                    <p>
                      GitHub Actions 为所有开发者提供每月高达 <strong>2000 分钟的免费云端构建时长</strong>，运行在基于 Ubuntu 的专用高性能虚拟机上。这些机器预装了完整的 OpenJDK、Android SDK 与 Gradle 工具链。通过 NedevCode 生成的标准构建流，用户可将代码推送到 GitHub，由云端服务器完成真正的 Android 编译，并在编译完成后自动上传真实的安装包供直接下载，兼具 100% 真实可用性与零服务器成本。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-medium press-feedback transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
