import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Maximize,
  Minimize,
  RefreshCw,
  Download,
  Copy,
  Check,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Repeat,
  Camera,
  Code,
  Eye,
  Film,
  Image as ImageIcon,
  FlipHorizontal,
  FlipVertical,
  Sliders,
  ExternalLink,
  Sparkles,
  Loader2,
  Share2
} from 'lucide-react';
import { ProjectFile, CodeProject, CodeLanguage } from '../types';
import { IDB_PLACEHOLDER_MARKER } from '../services/storage';
import {
  isImageFile,
  isVideoFile,
  isSvgFile,
  formatFileSize,
  getFileSizeBytes,
  getMediaMimeType,
  dataUrlToBlob
} from '../utils/fileUtils';

interface MediaViewerProps {
  file: ProjectFile;
  project: CodeProject;
  onUpdateFileContent?: (fileId: string, content: string) => void;
  onAddNewFile?: (name: string, language: CodeLanguage, initialContent?: string) => void;
  onDownloadFile?: (fileId: string) => void;
  isSvgCodeMode?: boolean;
  onToggleSvgMode?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  file,
  project,
  onUpdateFileContent,
  onAddNewFile,
  onDownloadFile,
  isSvgCodeMode,
  onToggleSvgMode,
  isFullscreen,
  onToggleFullscreen
}) => {
  const isImage = isImageFile(file.name, file.content);
  const isVideo = isVideoFile(file.name, file.content);
  const isSvg = isSvgFile(file.name);

  // Source URL resolution
  const mediaSrc = useMemo(() => {
    if (!file.content || file.content === IDB_PLACEHOLDER_MARKER) return '';
    if (file.content.startsWith('data:') || file.content.startsWith('blob:') || file.content.startsWith('http')) {
      return file.content;
    }
    if (isSvg) {
      return `data:image/svg+xml;utf8,${encodeURIComponent(file.content)}`;
    }
    // Fallback: treat as base64 or plain
    const mime = getMediaMimeType(file.name);
    return `data:${mime};base64,${file.content}`;
  }, [file.content, file.name, isSvg]);

  // Image viewer states
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [bgMode, setBgMode] = useState<'checkerboard' | 'dark' | 'light'>('checkerboard');
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // Video viewer states
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);

  // Notification toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  // Gesture Toast Notice
  const [gestureToast, setGestureToast] = useState<string | null>(null);
  const gestureToastTimeoutRef = useRef<any>(null);

  const showGestureToast = useCallback((msg: string) => {
    if (gestureToastTimeoutRef.current) clearTimeout(gestureToastTimeoutRef.current);
    setGestureToast(msg);
    gestureToastTimeoutRef.current = setTimeout(() => setGestureToast(null), 900);
  }, []);

  // Non-passive touch protection against mobile browser history swipe / pull-to-refresh
  const mediaContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mediaContainerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        if (e.cancelable) e.preventDefault();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent browser horizontal back/forward navigation and pull-to-refresh while interacting with media
      if (isImage || isVideo) {
        if (e.cancelable) e.preventDefault();
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isImage, isVideo]);

  // Save transformed image (rotation & flip) directly back to file content
  const [isSavingTransform, setIsSavingTransform] = useState(false);

  const handleSaveTransform = useCallback(() => {
    if (!isImage || !onUpdateFileContent) return;
    if (rotation === 0 && !flipH && !flipV) return;

    setIsSavingTransform(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = mediaSrc;

    img.onload = () => {
      try {
        const rad = (rotation * Math.PI) / 180;
        const sin = Math.abs(Math.sin(rad));
        const cos = Math.abs(Math.cos(rad));
        const newWidth = Math.round(img.naturalWidth * cos + img.naturalHeight * sin);
        const newHeight = Math.round(img.naturalWidth * sin + img.naturalHeight * cos);

        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          showToast('保存旋转失败：无法创建 2D 绘图上下文');
          setIsSavingTransform(false);
          return;
        }

        ctx.translate(newWidth / 2, newHeight / 2);
        ctx.rotate(rad);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

        const mime = isSvg ? 'image/png' : getMediaMimeType(file.name, file.content) || 'image/png';
        const dataUrl = canvas.toDataURL(mime, 0.95);

        onUpdateFileContent(file.id, dataUrl);
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
        showToast('已成功保存旋转与翻转修改');
      } catch {
        showToast('保存图像修改失败，请重试');
      } finally {
        setIsSavingTransform(false);
      }
    };

    img.onerror = () => {
      showToast('无法读取源图像，保存失败');
      setIsSavingTransform(false);
    };
  }, [isImage, onUpdateFileContent, rotation, flipH, flipV, mediaSrc, file.id, file.name, file.content, isSvg, showToast]);

  // System OS Media Session API integration (iOS Control Center / Android Notification / macOS Media Keys)
  useEffect(() => {
    if (!isVideo || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const fileName = file.name.split('/').pop() || file.name;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: fileName,
      artist: project.title,
      album: 'Code Studio Media'
    });

    const video = videoRef.current;

    navigator.mediaSession.setActionHandler('play', () => {
      video?.play();
      setIsPlaying(true);
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      video?.pause();
      setIsPlaying(false);
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (video && details.seekTime !== undefined) {
        video.currentTime = details.seekTime;
        setCurrentTime(details.seekTime);
      }
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      if (video) {
        const offset = details.seekOffset || 10;
        video.currentTime = Math.min(video.duration || 1000, video.currentTime + offset);
      }
    });
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      if (video) {
        const offset = details.seekOffset || 10;
        video.currentTime = Math.max(0, video.currentTime - offset);
      }
    });

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('seekto', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
      } catch {}
    };
  }, [isVideo, file.name, project.title]);

  // Reset transforms on file change
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setPan({ x: 0, y: 0 });
    setImageDimensions(null);
    setVideoDimensions(null);
    setIsPlaying(false);
  }, [file.id]);

  // Mobile Touch Gestures for Image (Pinch-to-zoom, Touch pan, Double-tap zoom)
  const imageTouchStateRef = useRef<{
    initialDist: number;
    initialZoom: number;
    initialPan: { x: number; y: number };
    startTouch1: { x: number; y: number };
    isPinching: boolean;
    isPanning: boolean;
    lastTapTime: number;
  }>({
    initialDist: 0,
    initialZoom: 1,
    initialPan: { x: 0, y: 0 },
    startTouch1: { x: 0, y: 0 },
    isPinching: false,
    isPanning: false,
    lastTapTime: 0
  });

  const handleTouchStartImage = (e: React.TouchEvent) => {
    if (!isImage) return;

    if (e.touches.length === 2) {
      // Pinch to zoom start
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

      imageTouchStateRef.current.isPinching = true;
      imageTouchStateRef.current.isPanning = false;
      imageTouchStateRef.current.initialDist = dist;
      imageTouchStateRef.current.initialZoom = zoom;
      imageTouchStateRef.current.initialPan = { ...pan };
    } else if (e.touches.length === 1) {
      // Check for double tap or single finger pan start
      const now = Date.now();
      const t = e.touches[0];
      const timeDiff = now - imageTouchStateRef.current.lastTapTime;

      if (timeDiff > 0 && timeDiff < 300) {
        if (e.cancelable) e.preventDefault();
        imageTouchStateRef.current.lastTapTime = 0;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(15);
        }
        if (zoom > 1.2) {
          setZoom(1);
          setPan({ x: 0, y: 0 });
          showGestureToast('还原 1:1');
        } else {
          setZoom(2.5);
          showGestureToast('双击放大 2.5x');
        }
        return;
      }
      imageTouchStateRef.current.lastTapTime = now;

      imageTouchStateRef.current.isPanning = true;
      imageTouchStateRef.current.isPinching = false;
      imageTouchStateRef.current.startTouch1 = { x: t.clientX, y: t.clientY };
      imageTouchStateRef.current.initialPan = { ...pan };
    }
  };

  const handleTouchMoveImage = (e: React.TouchEvent) => {
    if (!isImage) return;

    if (e.touches.length === 2 && imageTouchStateRef.current.isPinching) {
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

      if (imageTouchStateRef.current.initialDist > 0) {
        const scale = currentDist / imageTouchStateRef.current.initialDist;
        const newZoom = Math.min(10, Math.max(0.1, +(imageTouchStateRef.current.initialZoom * scale).toFixed(2)));
        setZoom(newZoom);
      }
    } else if (e.touches.length === 1 && imageTouchStateRef.current.isPanning) {
      const t = e.touches[0];
      const dx = t.clientX - imageTouchStateRef.current.startTouch1.x;
      const dy = t.clientY - imageTouchStateRef.current.startTouch1.y;

      if (zoom > 1 || Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        if (e.cancelable) e.preventDefault();
        setPan({
          x: imageTouchStateRef.current.initialPan.x + dx,
          y: imageTouchStateRef.current.initialPan.y + dy
        });
      }
    }
  };

  const handleTouchEndImage = () => {
    imageTouchStateRef.current.isPinching = false;
    imageTouchStateRef.current.isPanning = false;
  };

  // Mobile Touch Gestures for Video (Double-tap Seek +10s / -10s)
  const videoTouchStateRef = useRef<{ lastTapTime: number }>({ lastTapTime: 0 });

  const handleVideoTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isVideo || !videoRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (touch.clientX - rect.left) / rect.width;

    const now = Date.now();
    const timeDiff = now - videoTouchStateRef.current.lastTapTime;

    if (timeDiff > 0 && timeDiff < 300) {
      if (e.cancelable) e.preventDefault();
      videoTouchStateRef.current.lastTapTime = 0;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }

      if (relX < 0.38) {
        // Double tap left: rewind 10s
        const newTime = Math.max(0, videoRef.current.currentTime - 10);
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
        showGestureToast('⏪ 快退 10 秒');
      } else if (relX > 0.62) {
        // Double tap right: fast forward 10s
        const newTime = Math.min(videoRef.current.duration || 1000, videoRef.current.currentTime + 10);
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
        showGestureToast('⏩ 快进 10 秒');
      } else {
        // Double tap center: toggle loop
        setIsLooping((prev) => !prev);
        showGestureToast(!isLooping ? '开启循环播放' : '关闭循环播放');
      }
      return;
    }

    videoTouchStateRef.current.lastTapTime = now;
  };

  // Mouse wheel zoom for image
  const handleWheel = (e: React.WheelEvent) => {
    if (!isImage) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.min(10, Math.max(0.1, +(prev + delta).toFixed(2))));
  };

  // Drag to pan image
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isImage || e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleResetView = () => {
    setZoom(1);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setPan({ x: 0, y: 0 });
  };

  // Copy helper
  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`已复制 ${label}`);
    } catch {
      showToast('复制失败，请重试');
    }
  };

  // Native system share API (iOS / Android / macOS)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleNativeShare = async () => {
    const fileName = file.name.split('/').pop() || file.name;
    if (!canNativeShare) {
      handleCopyText(mediaSrc, 'Data URL');
      return;
    }
    try {
      if (file.content && (file.content.startsWith('data:') || isSvgFile(file.name))) {
        let blob: Blob;
        if (file.content.startsWith('data:')) {
          blob = dataUrlToBlob(file.content);
        } else {
          blob = new Blob([file.content], { type: 'image/svg+xml' });
        }
        const fileObj = new File([blob], fileName, { type: blob.type });
        if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
          await navigator.share({
            files: [fileObj],
            title: fileName
          });
          showToast(`已通过系统发送 ${fileName}`);
          return;
        }
      }
      await navigator.share({
        title: fileName,
        text: `代码项目文件: ${fileName}`
      });
      showToast(`已通过系统发送 ${fileName}`);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        showToast('发送已取消');
      }
    }
  };

  // Single file download with native File System Access API support
  const handleDownload = async () => {
    if (onDownloadFile) {
      onDownloadFile(file.id);
      return;
    }

    const fileName = file.name.split('/').pop() || file.name;
    // Check if native showSaveFilePicker is available (Chrome / Edge / Opera)
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        let blob: Blob;
        if (file.content.startsWith('data:')) {
          blob = dataUrlToBlob(file.content);
        } else {
          const mime = getMediaMimeType(file.name);
          blob = new Blob([file.content], { type: mime });
        }
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast(`已成功保存文件到本地: ${fileName}`);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return; // User cancelled
      }
    }

    const a = document.createElement('a');
    a.href = mediaSrc;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Video snapshot (Capture current frame as PNG)
  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');

      const baseName = (file.name.split('/').pop() || file.name).replace(/\.[^.]+$/, '');
      const frameName = `snapshot_${baseName}_${Math.floor(video.currentTime)}s.png`;

      if (onAddNewFile) {
        onAddNewFile(frameName, 'image', dataUrl);
        showToast(`已保存当前帧为图片: ${frameName}`);
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = frameName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(`已下载当前视频截图`);
      }
    } catch (err) {
      showToast('视频截图捕获失败');
    }
  };

  // Video format seconds to MM:SS
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const fileSizeStr = formatFileSize(getFileSizeBytes(file.content));
  const mimeType = getMediaMimeType(file.name, file.content);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-primary)] select-none code-editor-body">
      {/* Media Toolbar */}
      <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
        {/* Left: View Controls */}
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
          {isImage && (
            <>
              {/* Zoom Controls */}
              <div className="flex items-center space-x-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.max(0.1, +(prev - 0.2).toFixed(2)))}
                  className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors press-feedback"
                  title="缩小 (或鼠标滚轮向下)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 text-[11px] font-mono font-medium text-[var(--text-primary)] min-w-[42px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.min(10, +(prev + 0.2).toFixed(2)))}
                  className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors press-feedback"
                  title="放大 (或鼠标滚轮向上)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

              </div>

              {/* Transform Controls */}
              <div className="flex items-center space-x-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setRotation((prev) => (prev - 90 + 360) % 360)}
                  className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors press-feedback"
                  title="逆时针旋转 90°"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors press-feedback"
                  title="顺时针旋转 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setFlipH((prev) => !prev)}
                  className={`p-1 rounded transition-colors press-feedback ${
                    flipH ? 'bg-[var(--brand-subtle)] text-[var(--brand)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title="水平镜像翻转"
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setFlipV((prev) => !prev)}
                  className={`p-1 rounded transition-colors press-feedback ${
                    flipV ? 'bg-[var(--brand-subtle)] text-[var(--brand)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title="垂直镜像翻转"
                >
                  <FlipVertical className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleResetView}
                  className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors press-feedback"
                  title="重置视图"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>

                {(rotation !== 0 || flipH || flipV) && onUpdateFileContent && (
                  <button
                    type="button"
                    onClick={handleSaveTransform}
                    disabled={isSavingTransform}
                    className="px-2 py-0.5 text-[10px] rounded bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-medium flex items-center space-x-1 transition-colors press-feedback shadow-xs shrink-0 whitespace-nowrap"
                    title="将当前的旋转与翻转烘焙保存到图片文件"
                  >
                    {isSavingTransform ? (
                      <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    ) : (
                      <Check className="w-3 h-3 shrink-0" />
                    )}
                    <span>保存</span>
                  </button>
                )}
              </div>

              {/* Background Mode Toggle */}
              <div className="flex items-center space-x-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setBgMode('checkerboard')}
                  className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                    bgMode === 'checkerboard' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-xs' : 'text-[var(--text-tertiary)]'
                  }`}
                  title="透明棋盘网格"
                >
                  网格
                </button>
                <button
                  type="button"
                  onClick={() => setBgMode('dark')}
                  className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                    bgMode === 'dark' ? 'bg-neutral-800 text-white shadow-xs' : 'text-[var(--text-tertiary)]'
                  }`}
                  title="深色背景"
                >
                  暗底
                </button>
                <button
                  type="button"
                  onClick={() => setBgMode('light')}
                  className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                    bgMode === 'light' ? 'bg-white text-neutral-900 shadow-xs' : 'text-[var(--text-tertiary)]'
                  }`}
                  title="浅色背景"
                >
                  亮底
                </button>
              </div>
            </>
          )}

          {/* SVG Code / Visual Toggle */}
          {isSvg && onToggleSvgMode && (
            <button
              type="button"
              onClick={onToggleSvgMode}
              className={`px-2.5 py-1 rounded-lg border flex items-center space-x-1.5 transition-colors press-feedback font-medium ${
                isSvgCodeMode
                  ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                  : 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)]'
              }`}
              title={isSvgCodeMode ? '切换至矢量图像预览' : '切换至 SVG 源码编辑'}
            >
              {isSvgCodeMode ? <Eye className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
              <span>{isSvgCodeMode ? '查看预览' : '编辑源码'}</span>
            </button>
          )}

          {isVideo && (
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={handleCaptureFrame}
                className="px-2.5 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] flex items-center space-x-1.5 transition-colors press-feedback font-medium"
                title="捕获当前视频画面为 PNG 格式图片"
              >
                <Camera className="w-3.5 h-3.5 text-[var(--brand)]" />
                <span>截图帧</span>
              </button>

              <button
                type="button"
                onClick={() => setIsLooping(!isLooping)}
                className={`p-1.5 rounded-lg border transition-colors press-feedback ${
                  isLooping
                    ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border-[var(--brand-border)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                }`}
                title={isLooping ? '循环播放: 已开启' : '循环播放: 已关闭'}
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Quick Snippets & Download */}
        <div className="flex items-center space-x-1.5 flex-wrap">
          {/* Copy Snippets */}
          <button
            type="button"
            onClick={() => handleCopyText(mediaSrc, 'Base64 Data URL')}
            className="px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors press-feedback"
            title="复制完整 Base64 Data URL"
          >
            Data URL
          </button>

          {isImage && (
            <>
              <button
                type="button"
                onClick={() =>
                  handleCopyText(
                    `<img src="${file.name}" alt="${file.name.split('/').pop() || 'image'}" />`,
                    'HTML <img> 标签'
                  )
                }
                className="px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors press-feedback"
                title="复制 HTML <img> 标签代码"
              >
                &lt;img&gt;
              </button>

              <button
                type="button"
                onClick={() =>
                  handleCopyText(`![${file.name.split('/').pop() || 'image'}](${file.name})`, 'Markdown 图片语法')
                }
                className="px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors press-feedback"
                title="复制 Markdown 图片引用"
              >
                Markdown
              </button>
            </>
          )}

          {isVideo && (
            <button
              type="button"
              onClick={() =>
                handleCopyText(`<video src="${file.name}" controls></video>`, 'HTML <video> 标签')
              }
              className="px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors press-feedback"
              title="复制 HTML <video> 标签代码"
            >
              &lt;video&gt;
            </button>
          )}

          {/* System Share API */}
          <button
            type="button"
            onClick={handleNativeShare}
            className="px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center space-x-1 transition-colors press-feedback"
            title="通过系统分享面板发送此文件"
          >
            <Share2 className="w-3.5 h-3.5 text-[var(--brand)]" />
            <span className="hidden sm:inline">分享</span>
          </button>

          {/* Download Original File */}
          <button
            type="button"
            onClick={handleDownload}
            className="px-2.5 py-1 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-medium flex items-center space-x-1 transition-colors press-feedback shadow-xs"
            title="下载原文件"
          >
            <Download className="w-3.5 h-3.5" />
            <span>下载</span>
          </button>

          {/* Fullscreen Toggle */}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className={`p-1.5 rounded-lg border transition-colors press-feedback ${
                isFullscreen
                  ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border-[var(--brand-border)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
              }`}
              title={isFullscreen ? '退出全屏' : '全屏预览'}
            >
              {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Media Canvas / Viewer Area */}
      <div
        ref={mediaContainerRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center touch-none select-none overscroll-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStartImage}
        onTouchMove={handleTouchMoveImage}
        onTouchEnd={handleTouchEndImage}
        onTouchCancel={handleTouchEndImage}
        style={{
          cursor: isImage ? (isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'default') : 'default'
        }}
      >
        {/* Background Patterns */}
        <div
          className={`absolute inset-0 pointer-events-none transition-colors duration-200 ${
            bgMode === 'dark'
              ? 'bg-neutral-900'
              : bgMode === 'light'
              ? 'bg-neutral-100'
              : 'bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:16px_16px]'
          }`}
        />

        {/* Floating Gesture Overlay Toast */}
        {gestureToast && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-neutral-950/85 backdrop-blur-md border border-neutral-700 text-white font-medium px-4 py-2 rounded-full shadow-2xl text-xs flex items-center space-x-1.5 z-30 pointer-events-none animate-in fade-in zoom-in-95 duration-100">
            <span>{gestureToast}</span>
          </div>
        )}

        {/* Loading placeholder when reading from IndexedDB */}
        {file.content === IDB_PLACEHOLDER_MARKER && (
          <div className="relative z-10 flex flex-col items-center justify-center p-6 space-y-2 text-[var(--text-secondary)]">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--brand)]" />
            <span className="text-xs font-medium">正在从本地数据库加载资源...</span>
          </div>
        )}

        {/* Image Display */}
        {isImage && file.content !== IDB_PLACEHOLDER_MARKER && (
          <div
            className="relative transition-transform duration-75 select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${
                flipH ? -1 : 1
              }) scaleY(${flipV ? -1 : 1})`,
              transformOrigin: 'center center'
            }}
          >
            <img
              src={mediaSrc}
              alt={file.name}
              draggable={false}
              onLoad={(e) => {
                const target = e.currentTarget;
                setImageDimensions({ width: target.naturalWidth, height: target.naturalHeight });
              }}
              className="max-w-[85vw] max-h-[75vh] object-contain shadow-md rounded border border-[var(--border-subtle)]"
            />
          </div>
        )}

        {/* Video Display */}
        {isVideo && (
          <div className="w-full h-full max-w-4xl max-h-[80vh] flex flex-col items-center justify-center p-4">
            <div
              onTouchStart={handleVideoTouchStart}
              className="relative w-full rounded-xl overflow-hidden shadow-2xl bg-black border border-[var(--border-subtle)] flex flex-col group select-none"
            >
              <video
                ref={videoRef}
                src={mediaSrc}
                loop={isLooping}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  setDuration(v.duration);
                  setVideoDimensions({ width: v.videoWidth, height: v.videoHeight });
                }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onClick={() => {
                  if (videoRef.current) {
                    if (isPlaying) videoRef.current.pause();
                    else videoRef.current.play();
                  }
                }}
                className="w-full max-h-[60vh] object-contain bg-black cursor-pointer"
              />

              {/* Video Player Controls Bar */}
              <div className="bg-neutral-950/90 backdrop-blur-md px-3 py-2 border-t border-neutral-800 flex flex-col space-y-1.5 text-white text-xs">
                {/* Timeline Scrubber */}
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setCurrentTime(val);
                      if (videoRef.current) videoRef.current.currentTime = val;
                    }}
                    className="flex-1 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-[var(--brand)]"
                  />
                  <span className="font-mono text-[11px] text-neutral-300 min-w-[80px] text-right">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Video Action Controls */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (videoRef.current) {
                          if (isPlaying) videoRef.current.pause();
                          else videoRef.current.play();
                        }
                      }}
                      className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white transition-colors"
                      title={isPlaying ? '暂停' : '播放'}
                    >
                      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                    </button>

                    {/* Volume */}
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (videoRef.current) {
                            const newMute = !isMuted;
                            setIsMuted(newMute);
                            videoRef.current.muted = newMute;
                          }
                        }}
                        className="p-1 text-neutral-300 hover:text-white"
                        title={isMuted ? '取消静音' : '静音'}
                      >
                        {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setVolume(val);
                          setIsMuted(val === 0);
                          if (videoRef.current) {
                            videoRef.current.volume = val;
                            videoRef.current.muted = val === 0;
                          }
                        }}
                        className="w-16 h-1 bg-neutral-700 rounded appearance-none cursor-pointer accent-[var(--brand)]"
                      />
                    </div>
                  </div>

                  {/* Playback speed selector */}
                  <div className="flex items-center space-x-2">
                    <select
                      value={playbackRate}
                      onChange={(e) => {
                        const rate = parseFloat(e.target.value);
                        setPlaybackRate(rate);
                        if (videoRef.current) videoRef.current.playbackRate = rate;
                      }}
                      className="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[11px] text-white focus:outline-none"
                    >
                      <option value={0.5}>0.5x</option>
                      <option value={0.75}>0.75x</option>
                      <option value={1}>1.0x</option>
                      <option value={1.25}>1.25x</option>
                      <option value={1.5}>1.5x</option>
                      <option value={2}>2.0x</option>
                    </select>

                    {/* Picture in picture */}
                    {document.pictureInPictureEnabled && (
                      <button
                        type="button"
                        onClick={() => {
                          if (videoRef.current) {
                            if (document.pictureInPictureElement) {
                              document.exitPictureInPicture();
                            } else {
                              videoRef.current.requestPictureInPicture();
                            }
                          }
                        }}
                        className="p-1.5 rounded hover:bg-neutral-800 text-neutral-300 hover:text-white"
                        title="画中画模式 (PiP)"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Floating Toast Notice */}
        {toastMessage && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-[var(--bg-secondary)] border border-[var(--brand)] text-[var(--text-primary)] px-3 py-1.5 rounded-lg shadow-xl text-xs flex items-center space-x-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150 z-20">
            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>

      {/* Bottom Metadata Status Bar */}
      <div className="bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)] shrink-0 font-mono-code">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            {isImage ? (
              <ImageIcon className="w-3.5 h-3.5 text-[var(--brand)]" />
            ) : (
              <Film className="w-3.5 h-3.5 text-purple-500" />
            )}
            <span className="font-semibold text-[var(--text-primary)] uppercase">{mimeType}</span>
          </div>

          {isImage && imageDimensions && (
            <span>
              分辨率: <strong className="text-[var(--text-primary)]">{imageDimensions.width} × {imageDimensions.height} px</strong>
            </span>
          )}

          {isVideo && videoDimensions && (
            <span>
              分辨率: <strong className="text-[var(--text-primary)]">{videoDimensions.width} × {videoDimensions.height} px</strong>
            </span>
          )}

          {isVideo && duration > 0 && (
            <span>
              时长: <strong className="text-[var(--text-primary)]">{formatTime(duration)}</strong>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <span>
            文件大小: <strong className="text-[var(--text-primary)]">{fileSizeStr}</strong>
          </span>
          <span className="text-[var(--text-tertiary)] hidden sm:inline truncate max-w-[200px]">
            {file.name}
          </span>
        </div>
      </div>
    </div>
  );
};
