import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Folder,
  Code,
  FileCode,
  HardDrive,
  Hash,
  Star,
  Check,
  Edit2,
  FolderInput,
  Copy,
  Download,
  Trash2,
  FilePlus,
  FolderPlus,
  Binary,
  Image as ImageIcon,
  Film,
  Share2
} from 'lucide-react';
import { ModalShell } from './ModalShell';
import { ProjectFile, CodeProject } from '../types';
import { formatFileSize, getFileSizeBytes, isImageFile, isVideoFile, isSvgFile, dataUrlToBlob } from '../utils/fileUtils';
import { languageRegistry } from '../languages';

export type PropertiesTarget =
  | { type: 'file'; file: ProjectFile }
  | { type: 'folder'; folderPath: string; folderName?: string }
  | null;

const SUPPORTED_ENCODINGS = [
  { value: 'UTF-8', label: 'UTF-8 (默认 / 国际通用推荐)' },
  { value: 'GBK', label: 'GBK (中文简体 Windows 常用)' },
  { value: 'GB2312', label: 'GB2312 (简体中文标准)' },
  { value: 'UTF-16LE', label: 'UTF-16LE (Unicode 小端序)' },
  { value: 'UTF-16BE', label: 'UTF-16BE (Unicode 大端序)' },
  { value: 'ISO-8859-1', label: 'ISO-8859-1 (Latin-1 西欧语言)' },
  { value: 'ASCII', label: 'ASCII (纯英文字符集)' }
];

interface PropertiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: PropertiesTarget;
  project: CodeProject | null;
  onUpdateEncoding?: (fileId: string, encoding: string) => void;
  onRenameFile?: (fileId: string, newName: string) => void;
  onRenameFolder?: (oldFolderPath: string, newFolderPath: string) => void;
  onMoveFile?: (file: ProjectFile) => void;
  onMoveFolder?: (folderPath: string) => void;
  onCopyFile?: (file: ProjectFile) => void;
  onCopyFolder?: (folderPath: string) => void;
  onDownloadFile?: (fileId: string) => void;
  onDownloadFolderZip?: (folderPath: string) => void;
  onSetEntryFile?: (fileId: string) => void;
  onDeleteFile?: (fileId: string) => void;
  onDeleteFolder?: (folderPath: string) => void;
  onNewFileInFolder?: (folderPath: string) => void;
  onNewFolderInFolder?: (folderPath: string) => void;
}

export const PropertiesModal: React.FC<PropertiesModalProps> = ({
  isOpen,
  onClose,
  target,
  project,
  onUpdateEncoding,
  onRenameFile,
  onRenameFolder,
  onMoveFile,
  onMoveFolder,
  onCopyFile,
  onCopyFolder,
  onDownloadFile,
  onDownloadFolderZip,
  onSetEntryFile,
  onDeleteFile,
  onDeleteFolder,
  onNewFileInFolder,
  onNewFolderInFolder
}) => {
  const [selectedEncoding, setSelectedEncoding] = useState<string>('UTF-8');
  const [isRenaming, setIsRenaming] = useState(false);
  const [newNameInput, setNewNameInput] = useState('');
  const [encodingSavedToast, setEncodingSavedToast] = useState(false);

  useEffect(() => {
    if (target?.type === 'file') {
      const currentFile = project?.files?.find((f) => f.id === target.file.id) || target.file;
      setSelectedEncoding(currentFile.encoding || 'UTF-8');
      const baseName = currentFile.name.split('/').pop() || currentFile.name;
      setNewNameInput(baseName);
      setIsRenaming(false);
    } else if (target?.type === 'folder') {
      const folderName = target.folderName || target.folderPath.split('/').pop() || target.folderPath;
      setNewNameInput(folderName);
      setIsRenaming(false);
    }
    setEncodingSavedToast(false);
  }, [target, isOpen, project?.files]);

  // Statistics for files in folder
  const folderStats = useMemo(() => {
    if (target?.type !== 'folder' || !project) {
      return { fileCount: 0, totalBytes: 0, subfolderCount: 0, files: [] as ProjectFile[] };
    }
    const cleanFolder = target.folderPath.trim().replace(/^\/+|\/+$/g, '');
    const matchedFiles = (project.files || []).filter(
      (f) => f.name === cleanFolder || f.name.startsWith(cleanFolder + '/')
    );
    const totalBytes = matchedFiles.reduce((acc, f) => acc + getFileSizeBytes(f.content), 0);

    const matchedFolders = (project.folders || []).filter(
      (f) => f.startsWith(cleanFolder + '/') && f !== cleanFolder
    );

    return {
      fileCount: matchedFiles.length,
      totalBytes,
      subfolderCount: matchedFolders.length,
      files: matchedFiles
    };
  }, [target, project]);

  if (!target || !isOpen) return null;

  const isFile = target.type === 'file';
  const file = isFile && target ? (project?.files?.find((f) => f.id === target.file.id) || target.file) : null;

  const handleSaveEncoding = (newEnc: string) => {
    setSelectedEncoding(newEnc);
    if (file && onUpdateEncoding) {
      onUpdateEncoding(file.id, newEnc);
      setEncodingSavedToast(true);
      setTimeout(() => setEncodingSavedToast(false), 2000);
    }
  };

  const handleSaveRename = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newNameInput.trim();
    if (!cleanName) return;

    if (isFile && file) {
      const parts = file.name.split('/');
      parts.pop();
      const parent = parts.join('/');
      const newFullPath = parent && !cleanName.includes('/') ? `${parent}/${cleanName}` : cleanName;
      if (onRenameFile) onRenameFile(file.id, newFullPath);
    } else if (!isFile && target.type === 'folder') {
      const parts = target.folderPath.split('/');
      parts.pop();
      const parent = parts.join('/');
      const newFullPath = parent && !cleanName.includes('/') ? `${parent}/${cleanName}` : cleanName;
      if (onRenameFolder) onRenameFolder(target.folderPath, newFullPath);
    }
    setIsRenaming(false);
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={isFile ? '文件属性' : '文件夹属性'}
      icon={
        isFile ? (
          <FileText className="w-4 h-4 text-[var(--brand)]" />
        ) : (
          <Folder className="w-4 h-4 text-[var(--brand)]" />
        )
      }
      maxWidth="max-w-md"
      className="max-h-[85vh] flex flex-col overflow-hidden"
      footer={
        <div className="flex items-center justify-end w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg text-xs font-medium press-feedback transition-colors"
          >
            关闭
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Name and Path Card */}
        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 min-w-0 flex-1">
              {isFile ? (
                isImageFile(file?.name || '', file?.content) ? (
                  <ImageIcon className="w-4 h-4 text-[var(--brand)] shrink-0" />
                ) : isVideoFile(file?.name || '', file?.content) ? (
                  <Film className="w-4 h-4 text-purple-500 shrink-0" />
                ) : (
                  <FileCode className="w-4 h-4 text-[var(--brand)] shrink-0" />
                )
              ) : (
                <Folder className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              {isRenaming ? (
                <form onSubmit={handleSaveRename} className="flex items-center space-x-1.5 flex-1">
                  <input
                    type="text"
                    value={newNameInput}
                    onChange={(e) => setNewNameInput(e.target.value)}
                    className="bg-[var(--bg-secondary)] border border-[var(--brand)] rounded px-2 py-0.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none flex-1"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="p-1 bg-[var(--brand)] text-white rounded hover:bg-[var(--brand-hover)] press-feedback"
                    title="保存新名称"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </form>
              ) : (
                <span className="font-bold text-xs font-mono-code text-[var(--text-primary)] truncate">
                  {isFile ? file?.name.split('/').pop() || file?.name : target.folderName || target.folderPath.split('/').pop() || target.folderPath}
                </span>
              )}
            </div>
            {!isRenaming && (
              <button
                type="button"
                onClick={() => setIsRenaming(true)}
                className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded transition-colors ml-2"
                title="重命名"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="text-[11px] font-mono-code text-[var(--text-secondary)] break-all border-t border-[var(--border-subtle)] pt-1.5">
            <span className="text-[var(--text-tertiary)] mr-1">路径:</span>
            {isFile ? file?.name : target.folderPath}
          </div>
        </div>

        {/* Detailed Metadata Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {isFile && file ? (
            <>
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5 space-y-1">
                <div className="text-[10px] text-[var(--text-tertiary)] flex items-center space-x-1">
                  <Code className="w-3 h-3" />
                  <span>
                    {isImageFile(file.name, file.content)
                      ? '媒体类型'
                      : isVideoFile(file.name, file.content)
                      ? '媒体类型'
                      : '语言类型'}
                  </span>
                </div>
                <div className="font-semibold text-[var(--text-primary)] truncate uppercase font-mono-code">
                  {isImageFile(file.name, file.content)
                    ? '图片文件'
                    : isVideoFile(file.name, file.content)
                    ? '视频文件'
                    : languageRegistry.get(file.language)?.name || file.language}
                </div>
              </div>

              <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5 space-y-1">
                <div className="text-[10px] text-[var(--text-tertiary)] flex items-center space-x-1">
                  <HardDrive className="w-3 h-3" />
                  <span>文件大小</span>
                </div>
                <div className="font-semibold text-[var(--text-primary)] font-mono-code">
                  {formatFileSize(getFileSizeBytes(file.content))}
                </div>
              </div>

              <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5 space-y-1">
                <div className="text-[10px] text-[var(--text-tertiary)] flex items-center space-x-1">
                  <Hash className="w-3 h-3" />
                  <span>
                    {isImageFile(file.name, file.content) || isVideoFile(file.name, file.content)
                      ? '扩展名'
                      : '代码行数'}
                  </span>
                </div>
                <div className="font-semibold text-[var(--text-primary)] font-mono-code uppercase">
                  {isImageFile(file.name, file.content) || isVideoFile(file.name, file.content)
                    ? file.name.split('.').pop() || 'MEDIA'
                    : `${file.content.split('\n').length} 行`}
                </div>
              </div>

              <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5 space-y-1">
                <div className="text-[10px] text-[var(--text-tertiary)] flex items-center space-x-1">
                  <Star className="w-3 h-3" />
                  <span>入口主文件</span>
                </div>
                <div className="font-semibold font-mono-code">
                  {file.isEntry ? (
                    <span className="text-emerald-500">是 (Main Entry)</span>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">否</span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5 space-y-1">
                <div className="text-[10px] text-[var(--text-tertiary)] flex items-center space-x-1">
                  <FileText className="w-3 h-3" />
                  <span>包含文件数</span>
                </div>
                <div className="font-semibold text-[var(--text-primary)] font-mono-code">
                  {folderStats.fileCount} 个文件
                </div>
              </div>

              <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5 space-y-1">
                <div className="text-[10px] text-[var(--text-tertiary)] flex items-center space-x-1">
                  <HardDrive className="w-3 h-3" />
                  <span>目录总大小</span>
                </div>
                <div className="font-semibold text-[var(--text-primary)] font-mono-code">
                  {formatFileSize(folderStats.totalBytes)}
                </div>
              </div>
            </>
          )}
        </div>

        {/* File Encoding Section (Specifically for Files) */}
        {isFile && file && (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Binary className="w-3.5 h-3.5 text-[var(--brand)]" />
                <label className="text-xs font-semibold text-[var(--text-primary)]">
                  {(isImageFile(file.name, file.content) && !isSvgFile(file.name)) ||
                  isVideoFile(file.name, file.content)
                    ? '存储编码'
                    : '文件编码设置'}
                </label>
              </div>
              {encodingSavedToast && (
                <span className="text-[10px] text-emerald-500 font-medium animate-pulse">
                  已更新编码
                </span>
              )}
            </div>

            {(isImageFile(file.name, file.content) && !isSvgFile(file.name)) ||
            isVideoFile(file.name, file.content) ? (
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                该文件为二进制媒体资源，已采用安全 Base64 / Data URL 格式进行封装存储。
              </p>
            ) : (
              <>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  指定本文件在读取与保存时所使用的字符编码标准：
                </p>

                <select
                  value={selectedEncoding}
                  onChange={(e) => handleSaveEncoding(e.target.value)}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] focus:border-[var(--brand)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none transition-colors"
                >
                  {SUPPORTED_ENCODINGS.map((enc) => (
                    <option key={enc.value} value={enc.value}>
                      {enc.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}

        {/* Quick Operations Button List */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            执行操作
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Rename */}
            <button
              type="button"
              onClick={() => setIsRenaming(true)}
              className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors press-feedback"
            >
              <Edit2 className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" />
              <span className="truncate">重命名</span>
            </button>

            {/* Move to */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (isFile && file && onMoveFile) {
                  onMoveFile(file);
                } else if (!isFile && onMoveFolder) {
                  onMoveFolder(target.folderPath);
                }
              }}
              className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors press-feedback"
            >
              <FolderInput className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" />
              <span className="truncate">移动到...</span>
            </button>

            {/* Copy to */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (isFile && file && onCopyFile) {
                  onCopyFile(file);
                } else if (!isFile && onCopyFolder) {
                  onCopyFolder(target.folderPath);
                }
              }}
              className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors press-feedback"
            >
              <Copy className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" />
              <span className="truncate">复制到...</span>
            </button>

            {/* Download */}
            {isFile && file && onDownloadFile ? (
              <button
                type="button"
                onClick={() => {
                  onDownloadFile(file.id);
                  onClose();
                }}
                className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors press-feedback"
              >
                <Download className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" />
                <span className="truncate">下载文件</span>
              </button>
            ) : !isFile && onDownloadFolderZip ? (
              <button
                type="button"
                onClick={() => {
                  onDownloadFolderZip(target.folderPath);
                  onClose();
                }}
                className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors press-feedback"
              >
                <Download className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" />
                <span className="truncate">下载为 Zip</span>
              </button>
            ) : null}

            {/* System Share */}
            {isFile && file && typeof navigator !== 'undefined' && navigator.share && (
              <button
                type="button"
                onClick={async () => {
                  const fileName = file.name.split('/').pop() || file.name;
                  try {
                    if (file.content) {
                      let blob: Blob;
                      if (file.content.startsWith('data:')) {
                        blob = dataUrlToBlob(file.content);
                      } else {
                        blob = new Blob([file.content], { type: 'text/plain' });
                      }
                      const fileObj = new File([blob], fileName, { type: blob.type });
                      if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
                        await navigator.share({
                          files: [fileObj],
                          title: fileName
                        });
                        onClose();
                        return;
                      }
                    }
                    await navigator.share({
                      title: fileName,
                      text: `代码项目文件: ${fileName}`
                    });
                    onClose();
                  } catch (err: any) {
                    if (err?.name !== 'AbortError') {
                      console.warn('Share error:', err);
                    }
                  }
                }}
                className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors press-feedback"
              >
                <Share2 className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" />
                <span className="truncate">系统分享</span>
              </button>
            )}

            {/* Folder-specific create actions */}
            {!isFile && onNewFileInFolder && (
              <button
                type="button"
                onClick={() => {
                  onNewFileInFolder(target.folderPath);
                  onClose();
                }}
                className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors press-feedback"
              >
                <FilePlus className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" />
                <span className="truncate">新建文件</span>
              </button>
            )}

            {!isFile && onNewFolderInFolder && (
              <button
                type="button"
                onClick={() => {
                  onNewFolderInFolder(target.folderPath);
                  onClose();
                }}
                className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors press-feedback"
              >
                <FolderPlus className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" />
                <span className="truncate">新建文件夹</span>
              </button>
            )}

            {/* File-specific entry action */}
            {isFile && file && onSetEntryFile && (
              <button
                type="button"
                onClick={() => {
                  onSetEntryFile(file.id);
                  onClose();
                }}
                className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors press-feedback"
              >
                <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="truncate">{file.isEntry ? '取消入口' : '设为入口'}</span>
              </button>
            )}

            {/* Delete action */}
            {isFile && file && onDeleteFile && !file.isEntry && (
              <button
                type="button"
                onClick={() => {
                  onDeleteFile(file.id);
                  onClose();
                }}
                className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--warning-subtle)] text-[var(--warning)] rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors press-feedback"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">删除文件</span>
              </button>
            )}

            {!isFile && onDeleteFolder && (
              <button
                type="button"
                onClick={() => {
                  onDeleteFolder(target.folderPath);
                  onClose();
                }}
                className="px-2.5 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--warning-subtle)] text-[var(--warning)] rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors press-feedback"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">删除文件夹</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
};
