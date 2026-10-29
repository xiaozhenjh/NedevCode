import React, { useEffect, useState } from 'react';
import { Globe, Check, RotateCcw } from 'lucide-react';
import { EditorSettings } from '../types';
import { ModalShell } from './ModalShell';
import { NPM_MIRROR_PRESETS, PYPI_MIRROR_PRESETS, DEFAULT_PYPI_INDEX, normalizeUrl } from '../utils/packageMirror';

interface MirrorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EditorSettings;
  onUpdateSettings: (newSettings: Partial<EditorSettings>) => void;
}

export const MirrorSettingsModal: React.FC<MirrorSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const [npmCustom, setNpmCustom] = useState('');
  const [pyCustom, setPyCustom] = useState('');
  const [appliedTip, setAppliedTip] = useState<'npm' | 'python' | null>(null);

  const currentNpm = normalizeUrl(settings.npmMirror);
  const currentPy = normalizeUrl(settings.pythonMirror);

  // 生效值：空值代表走内置默认（Python → 官方 PyPI；npm → 内置默认链）
  const effectivePy = currentPy || DEFAULT_PYPI_INDEX;
  const effectiveNpm = currentNpm;
  const pyPreset = PYPI_MIRROR_PRESETS.find((p) => normalizeUrl(p.value) === effectivePy);
  const npmPreset = NPM_MIRROR_PRESETS.find((p) => normalizeUrl(p.value) === effectiveNpm);

  // 打开面板时重置自定义输入
  useEffect(() => {
    if (isOpen) {
      setNpmCustom('');
      setPyCustom('');
      setAppliedTip(null);
    }
  }, [isOpen]);

  // 提示应用结果，短暂显示后隐藏
  useEffect(() => {
    if (!appliedTip) return;
    const timer = setTimeout(() => setAppliedTip(null), 1600);
    return () => clearTimeout(timer);
  }, [appliedTip]);

  const handleApplyCustom = (kind: 'npm' | 'python') => {
    const raw = kind === 'npm' ? npmCustom : pyCustom;
    const value = normalizeUrl(raw);
    if (!value) return;
    if (kind === 'npm') {
      onUpdateSettings({ npmMirror: value });
      setNpmCustom('');
    } else {
      onUpdateSettings({ pythonMirror: value });
      setPyCustom('');
    }
    setAppliedTip(kind);
  };

  const handleReset = () => {
    onUpdateSettings({ npmMirror: '', pythonMirror: '' });
    setNpmCustom('');
    setPyCustom('');
  };

  const isNpmCustomActive = !!currentNpm && !npmPreset;
  const isPyCustomActive = !!currentPy && !pyPreset;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="镜像源设置"
      icon={<Globe className="w-4 h-4 text-[var(--brand)]" />}
      maxWidth="max-w-md"
      footer={
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] press-feedback transition-colors hover:text-[var(--text-primary)]"
            title="恢复为内置默认镜像源"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>恢复默认</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--brand)] press-feedback transition-colors"
          >
            完成
          </button>
        </div>
      }
    >
      {/* 说明 */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3 space-y-1">
        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
          镜像源作用于<strong className="text-[var(--text-primary)]">项目导入的第三方包</strong>（Python pip 包 / npm 包），
          用于加速下载或解决网络受限问题。
        </p>
        <p className="text-[10px] leading-relaxed text-[var(--text-tertiary)]">
          Python 运行时内核（Pyodide / Skulpt）为内置固定 CDN，不受此设置影响；设置保存后立即生效。
        </p>
      </div>

      {/* Python 包索引源 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[var(--text-secondary)]">Python 包索引源（pip）</label>
          <span className="text-[10px] font-mono-code text-[var(--brand)] truncate max-w-[55%]" title={effectivePy}>
            {pyPreset ? pyPreset.label : effectivePy}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {PYPI_MIRROR_PRESETS.map((preset) => {
            const active = normalizeUrl(preset.value) === effectivePy;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onUpdateSettings({ pythonMirror: preset.value })}
                className={`p-2 rounded-lg border text-left flex flex-col justify-between press-feedback transition-colors ${
                  active
                    ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                <span className="text-xs flex items-center space-x-1">
                  <span className="truncate">{preset.label}</span>
                  {active && <Check className="w-3 h-3 shrink-0" />}
                </span>
                <span className="text-[10px] opacity-75 mt-0.5 leading-tight">{preset.hint}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={pyCustom}
            onChange={(e) => setPyCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApplyCustom('python');
            }}
            placeholder="自定义索引地址，如 https://mirror.example/simple"
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)]"
          />
          <button
            type="button"
            onClick={() => handleApplyCustom('python')}
            disabled={!normalizeUrl(pyCustom)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--brand)] press-feedback transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            应用
          </button>
        </div>

        {isPyCustomActive && (
          <p className="text-[10px] text-[var(--brand)]">当前使用自定义源</p>
        )}
        {appliedTip === 'python' && (
          <p className="text-[10px] text-[var(--brand)]">已应用，立即生效</p>
        )}
        <p className="text-[10px] leading-relaxed text-[var(--text-tertiary)]">
          提示：浏览器直连要求镜像站返回跨域（CORS）响应头，国内多数 PyPI 镜像未开放，直连会失败；填入前请先确认可跨域访问。
        </p>
      </div>

      {/* npm 包 CDN 镜像 */}
      <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[var(--text-secondary)]">npm 包 CDN 镜像</label>
          <span className="text-[10px] font-mono-code text-[var(--brand)] truncate max-w-[55%]" title={effectiveNpm || '内置默认链'}>
            {npmPreset ? npmPreset.label : effectiveNpm}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {NPM_MIRROR_PRESETS.map((preset) => {
            const active = normalizeUrl(preset.value) === effectiveNpm;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onUpdateSettings({ npmMirror: preset.value })}
                className={`p-2 rounded-lg border text-left flex flex-col justify-between press-feedback transition-colors ${
                  active
                    ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                <span className="text-xs flex items-center space-x-1">
                  <span className="truncate">{preset.label}</span>
                  {active && <Check className="w-3 h-3 shrink-0" />}
                </span>
                <span className="text-[10px] opacity-75 mt-0.5 leading-tight break-words">{preset.hint}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={npmCustom}
            onChange={(e) => setNpmCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApplyCustom('npm');
            }}
            placeholder="自定义 CDN 前缀，如 https://cdn.example.com/npm"
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)]"
          />
          <button
            type="button"
            onClick={() => handleApplyCustom('npm')}
            disabled={!normalizeUrl(npmCustom)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[var(--brand)] press-feedback transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            应用
          </button>
        </div>

        {isNpmCustomActive && (
          <p className="text-[10px] text-[var(--brand)]">当前使用自定义源</p>
        )}
        {appliedTip === 'npm' && (
          <p className="text-[10px] text-[var(--brand)]">已应用，立即生效</p>
        )}
        <p className="text-[10px] leading-relaxed text-[var(--text-tertiary)]">
          提示：自定义地址需支持按「前缀 + /包名」直接解析出可执行入口（jsDelivr / unpkg 系均支持）；阿里 npmmirror 的文件 CDN 需指定版本与文件名，不适用于此处。
        </p>
      </div>
    </ModalShell>
  );
};