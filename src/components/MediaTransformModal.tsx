import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Sliders,
  Maximize2,
  Lock,
  Unlock,
  Check,
  Download,
  FilePlus,
  RefreshCw,
  Loader2,
  Layers,
  Palette,
  Eye,
  Film,
  Image as ImageIcon
} from 'lucide-react';
import { ModalShell } from './ModalShell';
import { ProjectFile, CodeLanguage } from '../types';
import {
  isImageFile,
  isVideoFile,
  isSvgFile,
  getMediaMimeType,
  formatFileSize
} from '../utils/fileUtils';
import {
  ScaleMode,
  BorderFillType,
  MediaDimensions,
  getMediaDimensions,
  drawMediaToCanvas,
  transformImage,
  transformVideo
} from '../utils/mediaTransform';

interface MediaTransformModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: ProjectFile;
  mediaSrc: string;
  onUpdateFileContent?: (fileId: string, newContent: string) => void;
  onAddNewFile?: (name: string, language: CodeLanguage, initialContent?: string) => void;
}

export const MediaTransformModal: React.FC<MediaTransformModalProps> = ({
  isOpen,
  onClose,
  file,
  mediaSrc,
  onUpdateFileContent,
  onAddNewFile
}) => {
  const isImage = isImageFile(file.name, file.content);
  const isVideo = isVideoFile(file.name, file.content);

  // Original media info
  const [naturalDim, setNaturalDim] = useState<MediaDimensions | null>(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(true);

  // Target dimensions
  const [targetWidth, setTargetWidth] = useState<number>(1080);
  const [targetHeight, setTargetHeight] = useState<number>(720);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);

  // Scaling mode: contain (等比例缩放留白), cover (等比例放大裁剪), stretch (自由拉伸)
  const [scaleMode, setScaleMode] = useState<ScaleMode>('contain');

  // Blank border fill: transparent, black, white, blur, custom
  const [fillType, setFillType] = useState<BorderFillType>('black');
  const [customFillColor, setCustomFillColor] = useState<string>('#1e293b');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number>(0);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Preview canvas ref & source media elements
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);

  // Load natural dimensions whenever modal opens or mediaSrc changes
  useEffect(() => {
    if (!isOpen || !mediaSrc) return;

    setIsLoadingMeta(true);
    setStatusNotice(null);
    setIsProcessing(false);
    setVideoProgress(0);

    getMediaDimensions(mediaSrc, isVideo)
      .then((dim) => {
        setNaturalDim(dim);
        setTargetWidth(dim.width);
        setTargetHeight(dim.height);
        setIsLoadingMeta(false);

        // Preload preview element
        if (isVideo) {
          const v = document.createElement('video');
          v.crossOrigin = 'anonymous';
          v.muted = true;
          v.playsInline = true;
          v.src = mediaSrc;
          v.onloadeddata = () => {
            v.currentTime = 0.1;
          };
          v.onseeked = () => {
            sourceVideoRef.current = v;
            renderPreview();
          };
        } else {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = mediaSrc;
          img.onload = () => {
            sourceImageRef.current = img;
            renderPreview();
          };
        }
      })
      .catch(() => {
        setIsLoadingMeta(false);
      });
    return () => {
      if (sourceVideoRef.current) {
        try {
          sourceVideoRef.current.pause();
          sourceVideoRef.current.removeAttribute('src');
          sourceVideoRef.current.load();
        } catch {}
        sourceVideoRef.current = null;
      }
      sourceImageRef.current = null;
    };
  }, [isOpen, mediaSrc, isVideo]);

  // Prevent user from pressing Escape to exit during video export
  useEffect(() => {
    if (!isProcessing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isProcessing]);

  // Handle Width change with aspect ratio lock
  const handleWidthChange = (val: number) => {
    const w = Math.max(1, Math.min(8192, val));
    setTargetWidth(w);
    if (lockAspectRatio && naturalDim && naturalDim.width > 0) {
      const ratio = naturalDim.height / naturalDim.width;
      setTargetHeight(Math.max(1, Math.round(w * ratio)));
    }
  };

  // Handle Height change with aspect ratio lock
  const handleHeightChange = (val: number) => {
    const h = Math.max(1, Math.min(8192, val));
    setTargetHeight(h);
    if (lockAspectRatio && naturalDim && naturalDim.height > 0) {
      const ratio = naturalDim.width / naturalDim.height;
      setTargetWidth(Math.max(1, Math.round(h * ratio)));
    }
  };

  // Quick Preset Handlers
  const applyPreset = (w: number, h: number) => {
    setTargetWidth(w);
    setTargetHeight(h);
  };

  const applyScalePercent = (pct: number) => {
    if (!naturalDim) return;
    const factor = pct / 100;
    setTargetWidth(Math.max(1, Math.round(naturalDim.width * factor)));
    setTargetHeight(Math.max(1, Math.round(naturalDim.height * factor)));
  };

  // Draw real-time preview to preview canvas
  const renderPreview = useCallback(() => {
    if (isProcessing) return; // Skip preview drawing during export to keep main thread completely free
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const sourceEl = isVideo ? sourceVideoRef.current : sourceImageRef.current;
    if (!sourceEl || !naturalDim) return;

    // Use a display-scaled preview canvas
    const maxPreviewDim = 400;
    const previewScale = Math.min(
      1,
      maxPreviewDim / Math.max(targetWidth, targetHeight, 1)
    );
    const pw = Math.max(20, Math.round(targetWidth * previewScale));
    const ph = Math.max(20, Math.round(targetHeight * previewScale));

    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawMediaToCanvas(
      ctx,
      sourceEl,
      naturalDim.width,
      naturalDim.height,
      pw,
      ph,
      scaleMode,
      fillType,
      customFillColor
    );
  }, [isVideo, naturalDim, targetWidth, targetHeight, scaleMode, fillType, customFillColor]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  // Execute transform for either image or video
  const executeTransform = async () => {
    const mime = isSvgFile(file.name)
      ? 'image/png'
      : getMediaMimeType(file.name, file.content) || (isImage ? 'image/png' : 'video/webm');

    if (isImage) {
      return await transformImage(mediaSrc, {
        targetWidth,
        targetHeight,
        scaleMode,
        fillType,
        customFillColor,
        outputMime: mime
      });
    } else {
      return await transformVideo(
        mediaSrc,
        {
          targetWidth,
          targetHeight,
          scaleMode,
          fillType,
          customFillColor,
          outputMime: mime
        },
        (pct) => setVideoProgress(pct)
      );
    }
  };

  // Action 1: Save & Overwrite current file
  const handleSaveOverwrite = async () => {
    if (!onUpdateFileContent) return;
    setIsProcessing(true);
    setStatusNotice(isVideo ? '正在重编码视频画面...' : '正在处理图像...');

    try {
      const result = await executeTransform();
      setStatusNotice(isVideo ? '视频编码完成，正在保存...' : '图像处理完成，正在保存...');
      // Allow browser event loop tick to settle before applying state
      await new Promise((r) => setTimeout(r, 60));
      onUpdateFileContent(file.id, result.dataUrl);
      setStatusNotice('已成功保存！');
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 700);
    } catch (err: any) {
      setStatusNotice(err?.message || '处理失败，请重试');
      setIsProcessing(false);
    }
  };

  // Action 2: Save as new file in project
  const handleSaveAsNew = async () => {
    if (!onAddNewFile) return;
    setIsProcessing(true);
    setStatusNotice(isVideo ? '正在重编码视频画面...' : '正在处理图像...');

    try {
      const result = await executeTransform();
      const parts = file.name.split('.');
      const ext = parts.pop() || (isImage ? 'png' : 'webm');
      const base = parts.join('.');
      const newName = `${base}_${targetWidth}x${targetHeight}.${ext}`;

      setStatusNotice(isVideo ? '视频编码完成，正在创建新文件...' : '图像处理完成，正在创建新文件...');
      await new Promise((r) => setTimeout(r, 60));
      onAddNewFile(newName, isImage ? 'image' : 'video', result.dataUrl);
      setStatusNotice(`已新建文件: ${newName}`);
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 700);
    } catch (err: any) {
      setStatusNotice(err?.message || '处理失败，请重试');
      setIsProcessing(false);
    }
  };

  // Action 3: Download processed file directly
  const handleDownload = async () => {
    setIsProcessing(true);
    setStatusNotice(isVideo ? '正在重编码并准备下载...' : '正在准备下载...');

    try {
      const result = await executeTransform();
      const parts = file.name.split('.');
      const ext = parts.pop() || (isImage ? 'png' : 'webm');
      const base = parts.join('.');
      const downloadName = `${base}_${targetWidth}x${targetHeight}.${ext}`;

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      setStatusNotice('文件下载已开始');
      setTimeout(() => {
        setIsProcessing(false);
        setStatusNotice(null);
      }, 1000);
    } catch (err: any) {
      setStatusNotice(err?.message || '导出下载失败');
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Full-Screen Video Export Progress Overlay to prevent accidental exit */}
      {isProcessing && isVideo && (
        <div
          className="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-200"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] shadow-2xl rounded-2xl p-6 md:p-8 max-w-sm w-full text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-[var(--brand)]/10 border border-[var(--brand)]/20 mx-auto flex items-center justify-center text-[var(--brand)]">
              <Film className="w-7 h-7 text-[var(--brand)]" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                {videoProgress >= 100 ? '导出完成' : '正在导出'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                {videoProgress >= 100 ? '准备就绪' : '正在生成数据'}
              </p>
            </div>

            {/* Large Percentage */}
            <div className="flex items-baseline justify-center space-x-1">
              <span className="text-3xl font-bold font-mono text-[var(--text-primary)]">
                {videoProgress}
              </span>
              <span className="text-base font-semibold text-[var(--text-secondary)]">%</span>
            </div>

            {/* Full-Width Progress Bar without gradients */}
            <div className="w-full bg-[var(--bg-tertiary)] h-2.5 rounded-full overflow-hidden border border-[var(--border-subtle)] p-0.5 relative">
              <div
                className="h-full rounded-full bg-[var(--brand)] transition-all duration-150 ease-out"
                style={{ width: `${Math.max(2, videoProgress)}%` }}
              />
            </div>

            {/* Target Parameters Badges */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-[var(--text-tertiary)] pt-0.5">
              <span className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] font-mono">
                {targetWidth} × {targetHeight}
              </span>
              <span className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)]">
                {scaleMode === 'contain' ? '等比留白' : scaleMode === 'cover' ? '等比裁切' : '自由拉伸'}
              </span>
              <span className="px-2 py-0.5 rounded bg-[var(--bg-tertiary)] font-mono">
                {(file.name.split('.').pop() || 'webm').toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      )}

      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        isCloseDisabled={isProcessing}
        showCloseButton={!isProcessing}
        title={isImage ? '调整图片分辨率与画面' : '调整视频分辨率与画面'}
        maxWidth="max-w-2xl"
      >
      <div className="space-y-4 text-xs">
        {/* Loading Meta State */}
        {isLoadingMeta && (
          <div className="py-8 flex flex-col items-center justify-center space-y-2 text-[var(--text-tertiary)]">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--brand)]" />
            <span>读取媒体信息中...</span>
          </div>
        )}

        {!isLoadingMeta && naturalDim && (
          <>
            {/* Top Info Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[11px]">
              <div className="flex items-center space-x-2 text-[var(--text-secondary)]">
                {isImage ? <ImageIcon className="w-3.5 h-3.5 text-[var(--brand)]" /> : <Film className="w-3.5 h-3.5 text-[var(--brand)]" />}
                <span>
                  原分辨率:{' '}
                  <strong className="text-[var(--text-primary)] font-mono">
                    {naturalDim.width} × {naturalDim.height}
                  </strong>
                </span>
                <span className="text-[var(--text-tertiary)]">
                  ({(naturalDim.width / naturalDim.height).toFixed(2)}:1)
                </span>
              </div>
              <div className="text-[var(--text-secondary)]">
                目标:{' '}
                <strong className="text-[var(--brand)] font-mono">
                  {targetWidth} × {targetHeight}
                </strong>
                <span className="text-[var(--text-tertiary)] ml-1">
                  ({(targetWidth / targetHeight).toFixed(2)}:1)
                </span>
              </div>
            </div>

            {/* Split Layout: Controls on Left/Top, Preview on Right/Bottom */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Settings */}
              <div className="space-y-3.5">
                {/* 1. Resolution Input Fields */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-[var(--text-primary)] flex items-center justify-between">
                    <span>目标分辨率 (像素)</span>
                    <button
                      type="button"
                      onClick={() => setLockAspectRatio(!lockAspectRatio)}
                      className={`text-[10px] px-1.5 py-0.5 rounded flex items-center space-x-1 border transition-colors ${
                        lockAspectRatio
                          ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border-[var(--brand-border)]'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border-[var(--border-subtle)]'
                      }`}
                      title={lockAspectRatio ? '已锁定比例' : '未锁定比例 (自由拉伸尺寸)'}
                    >
                      {lockAspectRatio ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                      <span>{lockAspectRatio ? '锁定等比' : '自由尺寸'}</span>
                    </button>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-[var(--text-tertiary)] mb-0.5">宽度 (W)</div>
                      <div className="flex items-center bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 focus-within:border-[var(--brand)]">
                        <input
                          type="number"
                          min="1"
                          max="8192"
                          value={targetWidth}
                          onChange={(e) => handleWidthChange(parseInt(e.target.value) || 1)}
                          className="w-full bg-transparent text-xs text-[var(--text-primary)] font-mono focus:outline-none"
                        />
                        <span className="text-[10px] text-[var(--text-tertiary)]">px</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-tertiary)] mb-0.5">高度 (H)</div>
                      <div className="flex items-center bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 focus-within:border-[var(--brand)]">
                        <input
                          type="number"
                          min="1"
                          max="8192"
                          value={targetHeight}
                          onChange={(e) => handleHeightChange(parseInt(e.target.value) || 1)}
                          className="w-full bg-transparent text-xs text-[var(--text-primary)] font-mono focus:outline-none"
                        />
                        <span className="text-[10px] text-[var(--text-tertiary)]">px</span>
                      </div>
                    </div>
                  </div>

                  {/* Resolution Quick Presets */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => applyPreset(1920, 1080)}
                      className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[10px] rounded text-[var(--text-secondary)] font-mono"
                    >
                      1080p
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset(1280, 720)}
                      className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[10px] rounded text-[var(--text-secondary)] font-mono"
                    >
                      720p
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset(1080, 1080)}
                      className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[10px] rounded text-[var(--text-secondary)] font-mono"
                    >
                      1:1 方形
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset(1080, 1920)}
                      className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[10px] rounded text-[var(--text-secondary)] font-mono"
                    >
                      9:16 竖屏
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset(800, 600)}
                      className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[10px] rounded text-[var(--text-secondary)] font-mono"
                    >
                      4:3
                    </button>
                  </div>

                  {/* Percentage Scales */}
                  <div className="flex items-center space-x-1 pt-0.5">
                    <span className="text-[10px] text-[var(--text-tertiary)]">缩放:</span>
                    {[50, 75, 100, 150, 200].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => applyScalePercent(pct)}
                        className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[10px] rounded text-[var(--text-secondary)] font-mono"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Scaling Mode */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-[var(--text-primary)]">画面缩放与适配方式</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setScaleMode('contain')}
                      className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                        scaleMode === 'contain'
                          ? 'bg-[var(--brand-subtle)] border-[var(--brand)] text-[var(--brand)]'
                          : 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="font-semibold text-[11px] mb-0.5">等比缩放</span>
                      <span className="text-[9px] opacity-80 leading-tight">保留全画，留白填充</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setScaleMode('cover')}
                      className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                        scaleMode === 'cover'
                          ? 'bg-[var(--brand-subtle)] border-[var(--brand)] text-[var(--brand)]'
                          : 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="font-semibold text-[11px] mb-0.5">等比铺满</span>
                      <span className="text-[9px] opacity-80 leading-tight">放大填满，居中裁剪</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setScaleMode('stretch')}
                      className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                        scaleMode === 'stretch'
                          ? 'bg-[var(--brand-subtle)] border-[var(--brand)] text-[var(--brand)]'
                          : 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="font-semibold text-[11px] mb-0.5">自由拉伸</span>
                      <span className="text-[9px] opacity-80 leading-tight">拉伸变形以完全匹配</span>
                    </button>
                  </div>
                </div>

                {/* 3. Blank Border Fill (when contain mode or padding exists) */}
                {scaleMode === 'contain' && (
                  <div className="space-y-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5">
                    <label className="font-semibold text-[var(--text-primary)] flex items-center space-x-1">
                      <Palette className="w-3 h-3 text-[var(--brand)]" />
                      <span>填充空白边</span>
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                      {isImage && (
                        <button
                          type="button"
                          onClick={() => setFillType('transparent')}
                          className={`px-2 py-1 rounded border text-[11px] flex items-center justify-center space-x-1 transition-colors ${
                            fillType === 'transparent'
                              ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border-[var(--brand)] font-medium'
                              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                          }`}
                        >
                          <span>透明留白</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setFillType('black')}
                        className={`px-2 py-1 rounded border text-[11px] flex items-center justify-center space-x-1 transition-colors ${
                          fillType === 'black'
                            ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border-[var(--brand)] font-medium'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-black border border-white/20 shrink-0" />
                        <span>纯黑边</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFillType('white')}
                        className={`px-2 py-1 rounded border text-[11px] flex items-center justify-center space-x-1 transition-colors ${
                          fillType === 'white'
                            ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border-[var(--brand)] font-medium'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-white border border-black/20 shrink-0" />
                        <span>纯白边</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFillType('blur')}
                        className={`px-2 py-1 rounded border text-[11px] flex items-center justify-center space-x-1 transition-colors ${
                          fillType === 'blur'
                            ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border-[var(--brand)] font-medium'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <span>背景虚化</span>
                      </button>

                      <div className="flex items-center space-x-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5">
                        <button
                          type="button"
                          onClick={() => setFillType('custom')}
                          className={`text-[11px] transition-colors ${
                            fillType === 'custom' ? 'text-[var(--brand)] font-medium' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          自定义
                        </button>
                        <input
                          type="color"
                          value={customFillColor}
                          onChange={(e) => {
                            setCustomFillColor(e.target.value);
                            setFillType('custom');
                          }}
                          className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                          title="选择留白填充颜色"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Live Interactive Preview */}
              <div className="flex flex-col space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-primary)]">
                  <span className="flex items-center space-x-1">
                    <Eye className="w-3.5 h-3.5 text-[var(--brand)]" />
                    <span>实时画面预览</span>
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)] font-normal font-mono">
                    {targetWidth} × {targetHeight}
                  </span>
                </div>

                <div className="flex-1 min-h-[220px] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-center p-3 overflow-hidden relative checkerboard-preview">
                  <canvas
                    ref={previewCanvasRef}
                    className="max-w-full max-h-[220px] rounded shadow-md object-contain border border-[var(--border-subtle)]"
                  />
                </div>

                {/* Progress / Status Notice */}
                {statusNotice && (
                  <div className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-center text-[11px]">
                    <div className="text-[var(--brand)] font-medium flex items-center justify-center space-x-1.5">
                      {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{statusNotice}</span>
                    </div>
                    {isVideo && isProcessing && (
                      <div className="w-full bg-[var(--bg-tertiary)] h-1.5 rounded-full overflow-hidden mt-1.5">
                        <div
                          className="bg-[var(--brand)] h-full transition-all duration-200"
                          style={{ width: `${videoProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                取消
              </button>

              <button
                type="button"
                onClick={handleDownload}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-medium flex items-center space-x-1.5 transition-colors press-feedback"
              >
                <Download className="w-3.5 h-3.5 text-[var(--brand)]" />
                <span>导出下载</span>
              </button>

              {onAddNewFile && (
                <button
                  type="button"
                  onClick={handleSaveAsNew}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-medium flex items-center space-x-1.5 transition-colors press-feedback"
                >
                  <FilePlus className="w-3.5 h-3.5 text-[var(--brand)]" />
                  <span>另存为新文件</span>
                </button>
              )}

              {onUpdateFileContent && (
                <button
                  type="button"
                  onClick={handleSaveOverwrite}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-medium flex items-center space-x-1.5 transition-colors press-feedback shadow-xs"
                >
                  {isProcessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>保存</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </ModalShell>
    </>
  );
};
