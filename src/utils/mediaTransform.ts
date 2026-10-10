import { ProjectFile, CodeLanguage } from '../types';
import { getMediaMimeType, dataUrlToBlob, isImageFile, isVideoFile, isSvgFile } from './fileUtils';

export type ScaleMode = 'contain' | 'cover' | 'stretch';
export type BorderFillType = 'transparent' | 'black' | 'white' | 'blur' | 'custom';

export interface MediaDimensions {
  width: number;
  height: number;
  duration?: number;
}

export interface MediaTransformOptions {
  targetWidth: number;
  targetHeight: number;
  scaleMode: ScaleMode;
  fillType: BorderFillType;
  customFillColor?: string;
  outputMime?: string;
  quality?: number; // 0.1 - 1.0
}

export interface MediaTransformResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Read natural dimensions and duration (if video) of media source
 */
export async function getMediaDimensions(
  src: string,
  isVideo: boolean
): Promise<MediaDimensions> {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('未提供有效的媒体数据源'));
      return;
    }

    if (isVideo) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.crossOrigin = 'anonymous';
      video.src = src;

      const timeout = setTimeout(() => {
        video.src = '';
        reject(new Error('读取视频元数据超时'));
      }, 10000);

      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve({
          width: video.videoWidth || 640,
          height: video.videoHeight || 360,
          duration: video.duration || 0
        });
      };

      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('无法解析视频文件尺寸'));
      };
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = src;

      const timeout = setTimeout(() => {
        reject(new Error('读取图像元数据超时'));
      }, 10000);

      img.onload = () => {
        clearTimeout(timeout);
        resolve({
          width: img.naturalWidth || 400,
          height: img.naturalHeight || 400
        });
      };

      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('无法解析图片文件尺寸'));
      };
    }
  });
}

/**
 * Draw media frame onto target canvas respecting scaleMode and blank border fill
 */
export function drawMediaToCanvas(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  scaleMode: ScaleMode,
  fillType: BorderFillType,
  customFillColor?: string
) {
  // 1. Fill background / border padding
  if (fillType === 'transparent') {
    ctx.clearRect(0, 0, targetWidth, targetHeight);
  } else if (fillType === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  } else if (fillType === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  } else if (fillType === 'custom') {
    ctx.fillStyle = customFillColor || '#000000';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  } else if (fillType === 'blur') {
    // Professional media creation workflow: Cover crop (等比放大填充并居中裁切) + Full-Resolution True Gaussian Blur
    ctx.save();
    // 1. Compute aspect-ratio-preserving Cover scale with 8% padding to eliminate edge blur halos
    const bgScale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight) * 1.08;
    const bgW = Math.round(sourceWidth * bgScale);
    const bgH = Math.round(sourceHeight * bgScale);
    const bgX = Math.round((targetWidth - bgW) / 2);
    const bgY = Math.round((targetHeight - bgH) / 2);

    // 2. Apply true Gaussian blur with cinematic slight dimming, maintaining full target resolution
    const blurPx = Math.max(16, Math.min(48, Math.round(Math.max(targetWidth, targetHeight) * 0.024)));
    ctx.filter = `blur(${blurPx}px) brightness(0.72)`;
    ctx.drawImage(source, bgX, bgY, bgW, bgH);
    ctx.restore();
  }

  // 2. Compute placement
  if (scaleMode === 'stretch') {
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
    return;
  }

  let scale = 1;
  if (scaleMode === 'contain') {
    scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  } else {
    // cover
    scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  }

  const drawW = Math.round(sourceWidth * scale);
  const drawH = Math.round(sourceHeight * scale);
  const drawX = Math.round((targetWidth - drawW) / 2);
  const drawY = Math.round((targetHeight - drawH) / 2);

  ctx.drawImage(source, drawX, drawY, drawW, drawH);
}

/**
 * Transform image resolution, scale mode, and border fill
 */
export async function transformImage(
  src: string,
  options: MediaTransformOptions
): Promise<MediaTransformResult> {
  const {
    targetWidth,
    targetHeight,
    scaleMode,
    fillType,
    customFillColor,
    outputMime = 'image/png',
    quality = 0.92
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(targetWidth));
        canvas.height = Math.max(1, Math.round(targetHeight));
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('无法创建 Canvas 2D 绘图上下文'));
          return;
        }

        drawMediaToCanvas(
          ctx,
          img,
          img.naturalWidth,
          img.naturalHeight,
          canvas.width,
          canvas.height,
          scaleMode,
          fillType,
          customFillColor
        );

        // Convert to dataUrl and blob
        const dataUrl = canvas.toDataURL(outputMime, quality);
        const blob = dataUrlToBlob(dataUrl);

        resolve({
          dataUrl,
          blob,
          width: canvas.width,
          height: canvas.height,
          sizeBytes: blob.size
        });
      } catch (err: any) {
        reject(new Error(err?.message || '图像处理转换失败'));
      }
    };

    img.onerror = () => {
      reject(new Error('无法读取源图像数据'));
    };
  });
}

/**
 * Transform video resolution, scale mode, and border fill via Canvas & MediaRecorder
 */
export async function transformVideo(
  src: string,
  options: MediaTransformOptions,
  onProgress?: (progressPct: number) => void
): Promise<MediaTransformResult> {
  const {
    targetWidth,
    targetHeight,
    scaleMode,
    fillType,
    customFillColor,
    outputMime
  } = options;

  if (!src || src.trim() === '') {
    throw new Error('未提供有效的视频源');
  }

  return new Promise((resolve, reject) => {
    // 1. Create container in DOM with active visibility flags to prevent Chrome background throttling
    const hiddenContainer = document.createElement('div');
    hiddenContainer.style.position = 'fixed';
    hiddenContainer.style.top = '0';
    hiddenContainer.style.left = '0';
    hiddenContainer.style.width = '320px';
    hiddenContainer.style.height = '180px';
    hiddenContainer.style.opacity = '0.001';
    hiddenContainer.style.pointerEvents = 'none';
    hiddenContainer.style.overflow = 'hidden';
    hiddenContainer.style.zIndex = '99999';
    document.body.appendChild(hiddenContainer);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.preload = 'auto';
    video.muted = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
    hiddenContainer.appendChild(video);

    let isTerminated = false;
    const timeout = setTimeout(() => {
      terminate(new Error('视频转换超时，请确保视频源有效'));
    }, 180000); // 3 minutes timeout

    let animId: number | null = null;
    let rvfcId: number | null = null;
    let checkInterval: any = null;
    let recorder: MediaRecorder | null = null;
    const streamTracksToStop: MediaStreamTrack[] = [];
    let audioCtx: AudioContext | null = null;
    let canvas: HTMLCanvasElement | null = null;

    const terminate = (err?: Error) => {
      if (isTerminated) return;
      isTerminated = true;
      clearTimeout(timeout);
      if (checkInterval) clearInterval(checkInterval);

      if (rvfcId !== null && typeof (video as any).cancelVideoFrameCallback === 'function') {
        try { (video as any).cancelVideoFrameCallback(rvfcId); } catch {}
      }
      if (animId !== null) {
        try { cancelAnimationFrame(animId); } catch {}
      }

      // Stop all recording tracks
      streamTracksToStop.forEach((track) => {
        try { track.stop(); } catch {}
      });

      if (audioCtx && audioCtx.state !== 'closed') {
        try { audioCtx.close(); } catch {}
      }

      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {}

      if (hiddenContainer.parentNode) {
        try {
          hiddenContainer.parentNode.removeChild(hiddenContainer);
        } catch {}
      }

      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }

      if (err) {
        reject(err);
      }
    };

    video.onloadedmetadata = () => {
      if (isTerminated) return;

      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 360;
      const duration = video.duration || 1;

      canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(targetWidth / 2) * 2); // even numbers for video codecs
      canvas.height = Math.max(2, Math.round(targetHeight / 2) * 2);
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');

      if (!ctx) {
        terminate(new Error('无法创建绘图上下文'));
        return;
      }

      // Check supported recording format
      let mimeType = outputMime || '';
      if (!mimeType || !MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
          mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
        } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
          mimeType = 'video/mp4;codecs=avc1';
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
          mimeType = 'video/mp4';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
          mimeType = 'video/webm;codecs=vp9,opus';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
          mimeType = 'video/webm;codecs=vp8,opus';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mimeType = 'video/webm';
        } else {
          terminate(new Error('当前浏览器不支持视频录制转码格式'));
          return;
        }
      }

      // 30fps canvas capture stream
      const canvasStream = canvas.captureStream(30);
      streamTracksToStop.push(...canvasStream.getTracks());

      // Only attempt audio capture if the video actually contains audio to prevent audio-clock stall
      let combinedStream = canvasStream;
      const hasAudio = Boolean(
        (video as any).mozHasAudio ||
        Boolean((video as any).webkitAudioDecodedByteCount) ||
        Boolean((video as any).audioTracks && (video as any).audioTracks.length > 0)
      );

      if (hasAudio) {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            audioCtx = new AudioContextClass();
            const sourceNode = audioCtx.createMediaElementSource(video);
            const destNode = audioCtx.createMediaStreamDestination();
            sourceNode.connect(destNode);
            const audioTrack = destNode.stream.getAudioTracks()[0];
            if (audioTrack) {
              video.muted = false;
              streamTracksToStop.push(audioTrack);
              combinedStream = new MediaStream([
                ...canvasStream.getVideoTracks(),
                audioTrack
              ]);
            }
          }
        } catch {
          video.muted = true;
        }
      }

      // Compute optimal bitrate
      const pixelCount = canvas.width * canvas.height;
      let targetBitrate = 3500000;
      if (pixelCount >= 1920 * 1080) {
        targetBitrate = 5500000;
      } else if (pixelCount <= 854 * 480) {
        targetBitrate = 1800000;
      }

      try {
        recorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: targetBitrate
        });
      } catch (err: any) {
        terminate(new Error('初始化视频录制器失败: ' + (err?.message || '')));
        return;
      }

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (isTerminated) return;
        clearTimeout(timeout);
        if (checkInterval) clearInterval(checkInterval);

        const finalBlob = new Blob(chunks, { type: mimeType });
        if (onProgress) onProgress(100);

        // Immediate release of media pipeline
        terminate();

        // Allow garbage collector and UI thread to settle
        await new Promise((r) => setTimeout(r, 60));

        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          resolve({
            dataUrl,
            blob: finalBlob,
            width: canvas ? canvas.width : targetWidth,
            height: canvas ? canvas.height : targetHeight,
            sizeBytes: finalBlob.size
          });
        };
        reader.onerror = () => {
          reject(new Error('读取转码视频数据失败'));
        };
        reader.readAsDataURL(finalBlob);
      };

      // Frame rendering synchronized with video decoder
      const hasRVFC = typeof (video as any).requestVideoFrameCallback === 'function';
      let lastProgressUpdate = 0;
      let isRecordingActive = false;
      let hasEnded = false;

      const renderFrame = () => {
        if (isTerminated || hasEnded || video.paused || video.ended) return;

        if (canvas) {
          drawMediaToCanvas(
            ctx,
            video,
            vWidth,
            vHeight,
            canvas.width,
            canvas.height,
            scaleMode,
            fillType,
            customFillColor
          );
        }

        // Throttle progress updates to avoid stalling main thread with continuous React renders
        const now = performance.now();
        if (onProgress && duration > 0 && now - lastProgressUpdate > 250) {
          lastProgressUpdate = now;
          const pct = Math.min(99, Math.round((video.currentTime / duration) * 100));
          onProgress(pct);
        }

        if (hasRVFC) {
          rvfcId = (video as any).requestVideoFrameCallback(renderFrame);
        } else {
          animId = requestAnimationFrame(renderFrame);
        }
      };

      const finishRecording = () => {
        if (hasEnded) return;
        hasEnded = true;

        video.pause();

        if (rvfcId !== null && typeof (video as any).cancelVideoFrameCallback === 'function') {
          try { (video as any).cancelVideoFrameCallback(rvfcId); } catch {}
        }
        if (animId !== null) {
          try { cancelAnimationFrame(animId); } catch {}
        }

        // Draw last frame once more
        if (canvas) {
          drawMediaToCanvas(
            ctx,
            video,
            vWidth,
            vHeight,
            canvas.width,
            canvas.height,
            scaleMode,
            fillType,
            customFillColor
          );
        }

        if (onProgress) onProgress(100);

        // Stop recorder immediately so video duration exactly matches source video
        if (recorder && recorder.state === 'recording') {
          recorder.stop();
        }
      };

      video.onplaying = () => {
        // Start recording precisely when video actually begins playback
        if (!isRecordingActive && recorder && recorder.state === 'inactive') {
          isRecordingActive = true;
          if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
          recorder.start(250);
        }
      };

      video.onended = () => {
        finishRecording();
      };

      // Guard check to catch exact video end without extra tail delay
      checkInterval = setInterval(() => {
        if (video.currentTime >= duration - 0.03 || video.ended) {
          clearInterval(checkInterval);
          finishRecording();
        }
      }, 30);

      video.currentTime = 0;
      video.play()
        .then(() => {
          if (hasRVFC) {
            rvfcId = (video as any).requestVideoFrameCallback(renderFrame);
          } else {
            animId = requestAnimationFrame(renderFrame);
          }
        })
        .catch((err) => {
          terminate(new Error('无法播放视频以进行转码: ' + (err?.message || '')));
        });
    };

    video.onerror = () => {
      terminate(new Error('无法加载待处理的视频'));
    };

    video.src = src;
  });
}

/**
 * Image format definitions for encoding conversion
 */
export interface EncodingFormatOption {
  mime: string;
  extension: string;
  label: string;
  supportsQuality: boolean;
  badge: string;
}

export const IMAGE_ENCODING_FORMATS: EncodingFormatOption[] = [
  { mime: 'image/png', extension: 'png', label: 'PNG 格式', supportsQuality: false, badge: '无损 / 支持透明' },
  { mime: 'image/jpeg', extension: 'jpg', label: 'JPEG / JPG', supportsQuality: true, badge: '高压缩照片' },
  { mime: 'image/webp', extension: 'webp', label: 'WebP 格式', supportsQuality: true, badge: '现代高能效' },
  { mime: 'image/bmp', extension: 'bmp', label: 'BMP 格式', supportsQuality: false, badge: '标准位图' }
];

export const VIDEO_ENCODING_FORMATS: EncodingFormatOption[] = [
  { mime: 'video/webm', extension: 'webm', label: 'WebM 视频', supportsQuality: false, badge: '开放通用格式' },
  { mime: 'video/mp4', extension: 'mp4', label: 'MP4 (H.264)', supportsQuality: false, badge: '全平台兼容' }
];

/**
 * Convert Image encoding format directly
 */
export async function convertImageEncoding(
  src: string,
  targetMime: string,
  quality: number = 0.92
): Promise<{ dataUrl: string; blob: Blob; sizeBytes: number; extension: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 400;
        canvas.height = img.naturalHeight || 400;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建绘图上下文'));
          return;
        }

        // If converting to JPEG, fill white background to avoid transparent black artifacts
        if (targetMime === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0);

        const dataUrl = canvas.toDataURL(targetMime, quality);
        const blob = dataUrlToBlob(dataUrl);

        const extMap: Record<string, string> = {
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/webp': 'webp',
          'image/bmp': 'bmp'
        };

        resolve({
          dataUrl,
          blob,
          sizeBytes: blob.size,
          extension: extMap[targetMime] || 'png'
        });
      } catch (err: any) {
        reject(new Error(err?.message || '格式转换失败'));
      }
    };

    img.onerror = () => {
      reject(new Error('无法读取源图像'));
    };
  });
}
