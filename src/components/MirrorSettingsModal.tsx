import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Globe, Check, RotateCcw, AlertCircle } from 'lucide-react';
import { EditorSettings } from '../types';
import { ModalShell } from './ModalShell';
import {
  NPM_MIRROR_PRESETS,
  PYPI_MIRROR_PRESETS,
  DEFAULT_PYPI_INDEX,
  normalizeUrl,
  probeMirror
} from '../utils/packageMirror';

/** 镜像探测失败提示 */
interface MirrorNotice {
  kind: 'npm' | 'python';
  title: string;
  detail: string;
}

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
  const [probing, setProbing] = useState<'npm' | 'python' | null>(null);
  const [notice, setNotice] = useState<MirrorNotice | null>(null);
  const probeSeqRef = useRef(0);

  const currentNpm = normalizeUrl(settings.npmMirror);
  const currentPy = normalizeUrl(settings.pythonMirror);

  // 生效值：空值代表走内置默认（Python → 官方 PyPI；npm → 内置默认链）
  const effectivePy = currentPy || DEFAULT_PYPI_INDEX;
  const effectiveNpm = currentNpm;
  const pyPreset = PYPI_MIRROR_PRESETS.find((p) => normalizeUrl(p.value) === effectivePy);
  const npmPreset = NPM_MIRROR_PRESETS.find((p) => normalizeUrl(p.value) === effectiveNpm);

  /**
   * 探测镜像可直连性；失败时弹出提示（跨域被拦截 → 「响应头错误」）。
   * 仅保留最后一次探测的结论，避免快速切换时旧结果覆盖新结果。
   */
  const runProbe = useCallback(async (kind: 'npm' | 'python', url: string) => {
    const base = normalizeUrl(url);
    const seq = ++probeSeqRef.current;
    if (!base) {
      setNotice(null);
      setProbing(null);
      return;
    }
    setProbing(kind);
    const result = await probeMirror(base, kind);
    if (seq !== probeSeqRef.current) return;
    setProbing(null);
    if (result.ok) {
      setNotice(null);
      return;
    }
    if (result.reason === 'cors') {
      setNotice({
        kind,
        title: '响应头错误（CORS）',
        detail: `无法直连 ${base}：该镜像未返回可用的跨域响应头，请求会被安全策略拦截。请更换镜像，或点「恢复默认」使用内置源。`
      });
    } else if (result.reason === 'timeout') {
      setNotice({ kind, title: '镜像无响应', detail: `${base} ${result.detail || '请求超时'}，请核对地址与网络状态。` });
    } else if (result.reason === 'http') {
      setNotice({
        kind,
        title: '镜像不可用',
        detail: `${base} ${result.detail || '返回异常状态'}，请核对地址是否为该类型的镜像入口。`
      });
    } else {
      setNotice({ kind, title: '镜像不可用', detail: `${base} 连接失败：${result.detail || '网络不可达'}。` });
    }
  }, []);

  // 打开面板时重置自定义输入，并检测已保存的自定义源是否可直连
  useEffect(() => {
    if (!isOpen) return;
    setNpmCustom('');
    setPyCustom('');
    setAppliedTip(null);
    setNotice(null);
    setProbing(null);
    probeSeqRef.current += 1;
    if (currentPy && !pyPreset) void runProbe('python', currentPy);
    if (currentNpm && !npmPreset) void runProbe('npm', currentNpm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    void runProbe(kind, value);
  };

  const handleReset = () => {
    onUpdateSettings({ npmMirror: '', pythonMirror: '' });
    setNpmCustom('');
    setPyCustom('');
    probeSeqRef.current += 1;
    setProbing(null);
    setNotice(null);
  };

  /** 镜像探测失败提示条（跨域被拦截时标题为「响应头错误」） */
  const renderNotice = (kind: 'npm' | 'python') => {
    if (probing === kind) {
      return (
        <p className="text-[10px] text-[var(--text-tertiary)]">正在检测该镜像能否直连…</p>
      );
    }
    if (!notice || notice.kind !== kind) return null;
    return (
      <div className="flex items-start space-x-1.5 rounded-lg bg-[var(--warning-subtle)] border border-[var(--warning)]/30 px-2.5 py-2">
        <AlertCircle className="w-3.5 h-3.5 text-[var(--warning)] mt-[1px] shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-[var(--warning)]">{notice.title}</p>
          <p className="text-[10px] leading-relaxed text-[var(--text-secondary)] break-words mt-0.5">{notice.detail}</p>
        </div>
      </div>
    );
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
                onClick={() => {
                  onUpdateSettings({ pythonMirror: preset.value });
                  void runProbe('python', preset.value);
                }}
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
        {renderNotice('python')}
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
                onClick={() => {
                  onUpdateSettings({ npmMirror: preset.value });
                  void runProbe('npm', preset.value);
                }}
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
        {renderNotice('npm')}
      </div>
    </ModalShell>
  );
};