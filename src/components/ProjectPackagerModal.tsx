import React, { useState, useEffect } from 'react';
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
  ShieldAlert
} from 'lucide-react';
import { CodeProject } from '../types';
import { ModalShell } from './ModalShell';
import {
  packageProjectZip,
  packageSingleHtml,
  packageWebDistZip,
  triggerGitHubCloudBuild,
  triggerBlobDownload,
  PackagingProgress
} from '../services/packagerService';
import { loadStoredGitTokens } from '../services/gitService';

interface ProjectPackagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: CodeProject;
}

export const ProjectPackagerModal: React.FC<ProjectPackagerModalProps> = ({
  isOpen,
  onClose,
  project
}) => {
  const [buildMode, setBuildMode] = useState<'local' | 'cloud'>('local');
  const [selectedFormat, setSelectedFormat] = useState<'zip' | 'single-html' | 'web-dist' | 'android-apk' | 'desktop-dist'>('zip');

  // GitHub CI parameters
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [savedTokens, setSavedTokens] = useState<ReturnType<typeof loadStoredGitTokens>>([]);

  // Execution states
  const [progress, setProgress] = useState<PackagingProgress>({
    step: '',
    percent: 0,
    status: 'idle'
  });
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setProgress({ step: '', percent: 0, status: 'idle' });
      setErrorMsg('');

      // Auto-fill from project git config if exists
      if (project.gitConfig?.repoUrl) {
        setRepoUrl(project.gitConfig.repoUrl);
        if (project.gitConfig.branch) {
          setBranch(project.gitConfig.branch);
        }
      }

      // Load saved tokens
      const tokens = loadStoredGitTokens();
      setSavedTokens(tokens);
      if (project.gitConfig?.token) {
        setToken(project.gitConfig.token);
      } else if (tokens.length > 0) {
        const ghToken = tokens.find((t) => t.provider === 'github');
        if (ghToken) setToken(ghToken.token);
      }
    }
  }, [isOpen, project]);

  const handleStartBuild = async () => {
    setErrorMsg('');
    setProgress({
      step: '正在初始化打包任务...',
      percent: 5,
      status: 'running'
    });

    try {
      if (selectedFormat === 'zip') {
        const blob = await packageProjectZip(project, (p) => setProgress(p));
        const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'project'}.zip`;
        triggerBlobDownload(blob, filename);
      } else if (selectedFormat === 'single-html') {
        const { blob, filename } = await packageSingleHtml(project, (p) => setProgress(p));
        triggerBlobDownload(blob, filename);
      } else if (selectedFormat === 'web-dist') {
        const blob = await packageWebDistZip(project, (p) => setProgress(p));
        const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'web'}-dist.zip`;
        triggerBlobDownload(blob, filename);
      } else {
        // GitHub Cloud Build
        if (!repoUrl.trim()) {
          throw new Error('云端打包必须填写与此项目绑定的 GitHub 仓库地址');
        }
        if (!token.trim()) {
          throw new Error('云端打包需要提供具有 workflow 与 repo 权限的 GitHub Access Token');
        }

        const res = await triggerGitHubCloudBuild({
          repoUrl,
          branch: branch.trim() || 'main',
          token: token.trim(),
          project,
          target: selectedFormat === 'android-apk' ? 'android-apk' : 'desktop-dist',
          onProgress: (p) => setProgress(p)
        });

        setProgress((prev) => ({
          ...prev,
          status: 'success',
          githubRunUrl: res.runUrl
        }));
      }
    } catch (err: any) {
      setErrorMsg(err.message || '打包失败，请检查环境或网络权限');
      setProgress({
        step: '打包流程终止',
        percent: 0,
        status: 'error'
      });
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="项目打包与导出"
      icon={<Package className="w-4 h-4 text-blue-500" />}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* 打包机制选择：本地即时打包 vs GitHub 云端打包 */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => {
              setBuildMode('local');
              setSelectedFormat('zip');
            }}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all press-feedback ${
              buildMode === 'local'
                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Download className="w-3.5 h-3.5 text-blue-500" />
            <span>本地即时打包</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setBuildMode('cloud');
              setSelectedFormat('android-apk');
            }}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all press-feedback ${
              buildMode === 'cloud'
                ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5 text-blue-500" />
            <span>GitHub 服务云打包</span>
          </button>
        </div>

        {/* 方案卡片展示 */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--text-secondary)]">选择目标打包格式：</label>

          {buildMode === 'local' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* 本地 1: ZIP 归档源码包 */}
              <button
                type="button"
                onClick={() => setSelectedFormat('zip')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all press-feedback ${
                  selectedFormat === 'zip'
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <FileArchive className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">工程 ZIP 包</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">标准多目录源码</div>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  包含所有代码文件、多媒体数据及目录结构，适合备份、分享与跨端迁移。
                </p>
              </button>

              {/* 本地 2: 单文件离线 HTML 可执行包 */}
              <button
                type="button"
                onClick={() => setSelectedFormat('single-html')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all press-feedback ${
                  selectedFormat === 'single-html'
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Globe className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">单文件 HTML</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">离线双击直接运行</div>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  将 CSS、JS、资源与虚拟文件系统编译为纯单文件，断网直接使用。
                </p>
              </button>

              {/* 本地 3: Web 生产静态分发包 */}
              <button
                type="button"
                onClick={() => setSelectedFormat('web-dist')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all press-feedback ${
                  selectedFormat === 'web-dist'
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Package className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">生产静态分发包</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">dist.zip 部署包</div>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  包含 index.html、静态产物与 manifest，可直接拖拽部署到服务器。
                </p>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* 云端 1: Android APK 安装包 */}
              <button
                type="button"
                onClick={() => setSelectedFormat('android-apk')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all press-feedback ${
                  selectedFormat === 'android-apk'
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Smartphone className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">Android 原生 APK</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">Capacitor + Gradle 云端编译</div>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  免本地 Android Studio 配置，借助 GitHub Actions 编译生成安卓直接安装的 `.apk` 包。
                </p>
              </button>

              {/* 云端 2: 独立桌面静态分发产物 */}
              <button
                type="button"
                onClick={() => setSelectedFormat('desktop-dist')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all press-feedback ${
                  selectedFormat === 'desktop-dist'
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Package className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">独立桌面/生产构件包</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">云端 Runner 清理打包</div>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  在 Linux 云端环境执行标准依赖构建与去敏感归档，生成标准化软件部署制品。
                </p>
              </button>
            </div>
          )}
        </div>

        {/* GitHub 服务配置区域 (仅在云端打包模式展示) */}
        {buildMode === 'cloud' && (
          <div className="p-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl space-y-2.5">
            <div className="flex items-center space-x-1.5 text-xs font-medium text-[var(--text-primary)]">
              <GitBranch className="w-3.5 h-3.5 text-blue-500" />
              <span>GitHub 真实云打包凭据</span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-[var(--text-secondary)]">GitHub 仓库地址 *</label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-[var(--text-secondary)]">目标分支</label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-[var(--text-secondary)]">Personal Access Token *</label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_xxx (需包含 repo/workflow 权限)"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* 打包进行中状态展示 */}
        {progress.status === 'running' && (
          <div className="p-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span className="flex items-center space-x-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                <span>{progress.step}</span>
              </span>
              <span className="font-mono-code font-semibold text-blue-500">{progress.percent}%</span>
            </div>
            <div className="w-full bg-[var(--bg-secondary)] h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${progress.percent}%` }}
              ></div>
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
            {progress.githubRunUrl && (
              <a
                href={progress.githubRunUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-xs shadow-xs"
              >
                <span>在 GitHub Actions 中查看构建与下载产物</span>
                <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
              </a>
            )}
          </div>
        )}

        {/* 错误提示 */}
        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-2 text-xs text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
            <span>{errorMsg}</span>
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
            disabled={progress.status === 'running'}
            className="flex-1 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium press-feedback shadow-xs flex items-center justify-center space-x-1.5 disabled:opacity-50"
          >
            {progress.status === 'running' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                <span>正在执行打包...</span>
              </>
            ) : (
              <>
                <Package className="w-3.5 h-3.5 text-blue-500" />
                <span>立即开始打包</span>
              </>
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
