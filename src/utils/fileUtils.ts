import { CodeLanguage, ExecutionType, ProjectFile } from '../types';
import { languageRegistry } from '../languages';

export function detectLanguage(filename: string): CodeLanguage {
  return languageRegistry.detectLanguage(filename);
}

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.avif'];
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.mkv', '.avi'];

export function hasSvgPrefix(content?: string): boolean {
  if (!content) return false;
  let i = 0;
  const len = Math.min(content.length, 256);
  while (i < len && (content[i] === ' ' || content[i] === '\t' || content[i] === '\n' || content[i] === '\r')) {
    i++;
  }
  return content.startsWith('<svg', i) || content.startsWith('<?xml', i);
}

export function isImageFile(filename: string, content?: string): boolean {
  if (content && (content.startsWith('data:image/') || hasSvgPrefix(content))) return true;
  const lower = (filename || '').toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isVideoFile(filename: string, content?: string): boolean {
  if (content && content.startsWith('data:video/')) return true;
  const lower = (filename || '').toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isMediaFile(filename: string, content?: string): boolean {
  return isImageFile(filename, content) || isVideoFile(filename, content);
}

export function isSvgFile(filename: string): boolean {
  return (filename || '').toLowerCase().endsWith('.svg');
}

export function getDefaultImageContent(filename: string): string {
  if (isSvgFile(filename)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="100%" height="100%" fill="#1e293b"/>
  <circle cx="200" cy="130" r="40" fill="#3b82f6"/>
  <path d="M 120 220 Q 200 160 280 220" stroke="#60a5fa" stroke-width="8" fill="none" stroke-linecap="round"/>
  <text x="200" y="260" font-family="sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">SVG Image</text>
</svg>`;
  }
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

/**
 * Resolves user input when creating a new file.
 * If user inputs an image extension (e.g., "png", ".png", "jpg", ".jpg", "svg", "webp", "folder/png", etc.),
 * automatically constructs a valid filename like "image.png" (or "folder/image.png") with that extension.
 */
export function resolveNewFileName(
  rawInput: string,
  existingFiles: { name: string }[] = []
): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return trimmed;

  let folder = '';
  let baseName = trimmed;
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash !== -1) {
    folder = trimmed.substring(0, lastSlash + 1);
    baseName = trimmed.substring(lastSlash + 1).trim();
  }

  const cleanBaseLower = baseName.toLowerCase();
  const extName = cleanBaseLower.startsWith('.') ? cleanBaseLower.substring(1) : cleanBaseLower;

  const validImageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif'];

  if (validImageExts.includes(extName) && (!baseName.includes('.') || baseName.startsWith('.'))) {
    const ext = `.${extName}`;
    let candidateName = `${folder}image${ext}`;

    let counter = 1;
    const lowerExisting = new Set(existingFiles.map((f) => f.name.toLowerCase()));
    while (lowerExisting.has(candidateName.toLowerCase())) {
      candidateName = `${folder}image_${counter}${ext}`;
      counter++;
    }
    return candidateName;
  }

  return trimmed;
}

export function getMediaMimeType(filename: string, content?: string): string {
  if (content && content.startsWith('data:')) {
    const match = content.match(/^data:([^;]+);/);
    if (match) return match[1];
  }
  const ext = (filename || '').split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'webp': return 'image/webp';
    case 'bmp': return 'image/bmp';
    case 'ico': return 'image/x-icon';
    case 'avif': return 'image/avif';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'ogg': return 'video/ogg';
    case 'mov': return 'video/quicktime';
    case 'mkv': return 'video/x-matroska';
    case 'avi': return 'video/x-msvideo';
    default: return 'application/octet-stream';
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(';base64,');
    const mime = parts[0].replace('data:', '') || 'application/octet-stream';
    const binary = atob(parts[1] || '');
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  } catch {
    return new Blob([dataUrl], { type: 'text/plain' });
  }
}

export function getFileSizeBytes(content: string): number {
  if (!content) return 0;
  if (content.startsWith('data:') && content.includes(';base64,')) {
    const base64Str = content.split(';base64,')[1] || '';
    const padding = (base64Str.endsWith('==') ? 2 : base64Str.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((base64Str.length * 3) / 4) - padding);
  }
  return new Blob([content]).size;
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const LARGE_FILE_THRESHOLD_LINES = 500;
export const LARGE_FILE_THRESHOLD_BYTES = 40000;
export const LARGE_FILE_CHUNK_SIZE = 500;

export function isLargeFile(content: string, linesCount?: number): boolean {
  if (!content) return false;
  const count = linesCount !== undefined ? linesCount : content.split('\n').length;
  return count > LARGE_FILE_THRESHOLD_LINES || content.length > LARGE_FILE_THRESHOLD_BYTES;
}

export function detectExecutionTypeFromFiles(files: { name: string; language?: string }[]): ExecutionType {
  return languageRegistry.detectExecutionTypeFromFiles(files);
}

/**
 * Find the designated or canonical entry file for a project
 */
export function getProjectEntryFile(files: ProjectFile[]): ProjectFile | undefined {
  return languageRegistry.getProjectEntryFile(files);
}

export interface EntryRuntimeResolution {
  supported: boolean;
  runtime?: ExecutionType;
  entryFile?: ProjectFile;
  reason?: string;
}

/**
 * Determine which runtime environment to execute based on the entry file type
 */
export function resolveRuntimeFromEntryFile(entryFile: ProjectFile | undefined): EntryRuntimeResolution {
  return languageRegistry.resolveRuntimeFromEntryFile(entryFile);
}


