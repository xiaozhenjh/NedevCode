import React, { useState, useEffect, useMemo } from 'react';
import { Folder, FolderOpen, FolderPlus, ChevronRight, ChevronDown, Check, FileText, MoveRight, Copy } from 'lucide-react';
import { ProjectFile } from '../types';
import { ModalShell } from './ModalShell';

export type TransferMode = 'move' | 'copy';

interface FileTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  file?: ProjectFile | null;
  folderPath?: string | null;
  mode: TransferMode;
  existingFolders: string[];
  allFiles?: ProjectFile[];
  onConfirm: (fileId: string, newPath: string) => void;
  onConfirmFolder?: (sourceFolderPath: string, targetParentFolder: string) => void;
}

interface FolderNode {
  path: string; // '' for root, 'src' for src, 'src/components'
  name: string; // '根目录' for root, 'src', 'components'
  depth: number;
  children: FolderNode[];
}

export const FileTransferModal: React.FC<FileTransferModalProps> = ({
  isOpen,
  onClose,
  file,
  folderPath,
  mode,
  existingFolders,
  allFiles = [],
  onConfirm,
  onConfirmFolder
}) => {
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({ '': true });
  const [createdFolders, setCreatedFolders] = useState<string[]>([]);
  const [isCreatingSubfolder, setIsCreatingSubfolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const targetName = useMemo(() => {
    if (folderPath) return folderPath.split('/').pop() || folderPath;
    if (file) return file.name.split('/').pop() || file.name;
    return '';
  }, [file, folderPath]);

  const currentFolder = useMemo(() => {
    if (folderPath) {
      const parts = folderPath.split('/');
      parts.pop();
      return parts.join('/');
    }
    if (file) {
      const parts = file.name.split('/');
      parts.pop();
      return parts.join('/');
    }
    return '';
  }, [file, folderPath]);

  // Reset state when file/folder or modal visibility changes
  useEffect(() => {
    if (isOpen) {
      let parent = '';
      if (folderPath) {
        const parts = folderPath.split('/');
        parts.pop();
        parent = parts.join('/');
      } else if (file) {
        const parts = file.name.split('/');
        parts.pop();
        parent = parts.join('/');
      }
      setSelectedFolder(parent);

      const initialExpanded: Record<string, boolean> = { '': true };
      if (parent) {
        const parts = parent.split('/');
        let accum = '';
        parts.forEach((p) => {
          accum = accum ? `${accum}/${p}` : p;
          initialExpanded[accum] = true;
        });
      }
      setExpandedPaths(initialExpanded);
      setIsCreatingSubfolder(false);
      setNewFolderName('');
    }
  }, [file, folderPath, isOpen]);

  // Combine all directory sources into a unique set of folder paths
  const allFolderPaths = useMemo(() => {
    const set = new Set<string>(['']);

    // From existing folders prop
    existingFolders.forEach((f) => {
      if (f.trim()) {
        const clean = f.trim().replace(/^\/+|\/+$/g, '');
        if (clean) set.add(clean);
      }
    });

    // From all project file names
    allFiles.forEach((f) => {
      const parts = f.name.split('/');
      if (parts.length > 1) {
        let pathAccum = '';
        for (let i = 0; i < parts.length - 1; i++) {
          pathAccum = pathAccum ? `${pathAccum}/${parts[i]}` : parts[i];
          set.add(pathAccum);
        }
      }
    });

    // From dynamically created folders in session
    createdFolders.forEach((f) => set.add(f));

    const list = Array.from(set);
    if (folderPath) {
      const cleanF = folderPath.trim().replace(/^\/+|\/+$/g, '');
      return list.filter((p) => p !== cleanF && !p.startsWith(cleanF + '/'));
    }
    return list;
  }, [existingFolders, allFiles, createdFolders, folderPath]);

  // Build a tree hierarchy from flat folder paths
  const folderTree = useMemo(() => {
    const rootNode: FolderNode = { path: '', name: '根目录', depth: 0, children: [] };
    const nodeMap: Record<string, FolderNode> = { '': rootNode };

    // Sort paths by depth and name
    const sortedPaths = allFolderPaths
      .filter((p) => p !== '')
      .sort((a, b) => a.localeCompare(b));

    sortedPaths.forEach((folderPath) => {
      const parts = folderPath.split('/');
      let currentPath = '';

      parts.forEach((part, index) => {
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!nodeMap[currentPath]) {
          const parentNode = nodeMap[parentPath] || rootNode;
          const newNode: FolderNode = {
            path: currentPath,
            name: part,
            depth: index + 1,
            children: []
          };
          nodeMap[currentPath] = newNode;
          parentNode.children.push(newNode);
        }
      });
    });

    return rootNode;
  }, [allFolderPaths]);

  const toggleExpand = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedPaths((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleCreateSubfolder = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newFolderName.trim().replace(/[\/\\:*?"<>|]/g, '');
    if (!cleanName) return;

    const targetPath = selectedFolder
      ? `${selectedFolder}/${cleanName}`
      : cleanName;

    if (!createdFolders.includes(targetPath)) {
      setCreatedFolders((prev) => [...prev, targetPath]);
    }

    // Expand parent and select newly created subfolder
    setExpandedPaths((prev) => ({ ...prev, [selectedFolder]: true, [targetPath]: true }));
    setSelectedFolder(targetPath);
    setNewFolderName('');
    setIsCreatingSubfolder(false);
  };

  const handleConfirm = () => {
    if (folderPath && onConfirmFolder) {
      onConfirmFolder(folderPath, selectedFolder);
      onClose();
    } else if (file) {
      const cleanTarget = selectedFolder.trim().replace(/^\/+|\/+$/g, '');
      const fileName = file.name.split('/').pop() || file.name;
      const targetPath = cleanTarget ? `${cleanTarget}/${fileName}` : fileName;
      onConfirm(file.id, targetPath);
      onClose();
    }
  };

  const isSameLocation = selectedFolder === currentFolder;

  const renderNode = (node: FolderNode) => {
    const isRoot = node.path === '';
    const isSelected = selectedFolder === node.path;
    const hasChildren = node.children.length > 0;
    const isExpanded = !!expandedPaths[node.path];

    return (
      <div key={node.path || 'root'} className="select-none">
        <div
          onClick={() => setSelectedFolder(node.path)}
          style={{ paddingLeft: `${node.depth * 14 + 8}px` }}
          className={`flex items-center justify-between py-1.5 pr-2 rounded-lg text-xs cursor-pointer transition-colors group ${
            isSelected
              ? 'bg-[var(--brand-subtle)] text-[var(--brand)] font-semibold'
              : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
          }`}
        >
          <div className="flex items-center space-x-1.5 min-w-0 flex-1">
            {/* Expand / Collapse Icon */}
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(node.path, e)}
                className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 shrink-0 text-[var(--text-tertiary)]"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}

            {/* Folder Icon */}
            {isExpanded && hasChildren ? (
              <FolderOpen className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[var(--brand)]' : 'text-amber-500'}`} />
            ) : (
              <Folder className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[var(--brand)]' : 'text-amber-500'}`} />
            )}

            {/* Folder Name */}
            <span className="truncate font-mono-code">{isRoot ? '/ (根目录)' : node.name}</span>

            {/* Same location indicator tag */}
            {node.path === currentFolder && (
              <span className="text-[10px] text-[var(--text-tertiary)] font-normal ml-1">
                (当前)
              </span>
            )}
          </div>

          {/* Selected checkmark */}
          {isSelected && <Check className="w-3.5 h-3.5 text-[var(--brand)] shrink-0 ml-1" />}
        </div>

        {/* Children Subfolders */}
        {hasChildren && isExpanded && (
          <div className="mt-0.5 space-y-0.5">
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  const itemTypeLabel = folderPath ? '文件夹' : '文件';
  const title = mode === 'move' ? `移动${itemTypeLabel}` : `复制${itemTypeLabel}`;
  const confirmText = mode === 'move' ? (isSameLocation ? '已在此目录' : '移动到此处') : '复制到此处';
  const Icon = mode === 'move' ? MoveRight : Copy;

  return (
    <ModalShell
      isOpen={isOpen && (!!file || !!folderPath)}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      scrollable={false}
      className="max-h-[85vh] flex flex-col overflow-hidden"
      footer={
        <div className="flex items-center justify-end space-x-2 w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            disabled={mode === 'move' && isSameLocation}
            onClick={handleConfirm}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'move' && isSameLocation
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed border border-[var(--border-subtle)]'
                : 'bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white shadow-sm press-feedback'
            }`}
          >
            {confirmText}
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-3.5 flex-1 overflow-y-auto">
        {/* Item Information Header */}
        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-1.5">
          <div className="flex items-center space-x-2 text-xs text-[var(--text-secondary)]">
            {folderPath ? (
              <Folder className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" />
            )}
            <span className="font-semibold text-[var(--text-primary)] truncate">{targetName}</span>
          </div>

          <div className="flex items-center space-x-2 text-[11px] text-[var(--text-tertiary)] font-mono-code pt-0.5">
            <span className="truncate">{currentFolder ? `/${currentFolder}` : '/ (根目录)'}</span>
            <Icon className="w-3 h-3 text-[var(--text-tertiary)] shrink-0" />
            <span className={`truncate font-semibold ${mode === 'move' && isSameLocation ? 'text-[var(--text-tertiary)]' : 'text-[var(--brand)]'}`}>
              {selectedFolder ? `/${selectedFolder}` : '/ (根目录)'}
            </span>
          </div>
        </div>

        {/* Directory Selection Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[var(--text-secondary)]">选择目标目录:</label>
            <button
              type="button"
              onClick={() => setIsCreatingSubfolder((prev) => !prev)}
              className="flex items-center space-x-1 text-xs text-[var(--brand)] hover:underline"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>新建子文件夹</span>
            </button>
          </div>

          {/* Inline Create New Subfolder Input */}
          {isCreatingSubfolder && (
            <form onSubmit={handleCreateSubfolder} className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-2.5 space-y-2">
              <div className="text-[11px] text-[var(--text-secondary)]">
                在 <span className="font-mono-code font-semibold text-[var(--text-primary)]">{selectedFolder ? `/${selectedFolder}` : '/ (根目录)'}</span> 下新建文件夹:
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="文件夹名称 (例: components)"
                  className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="px-2.5 py-1 bg-[var(--brand)] text-white text-xs font-medium rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-50"
                >
                  创建
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingSubfolder(false)}
                  className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  取消
                </button>
              </div>
            </form>
          )}

          {/* Interactive Folder Tree Container */}
          <div className="border border-[var(--border-subtle)] rounded-xl p-2 bg-[var(--bg-secondary)] max-h-52 overflow-y-auto space-y-0.5">
            {renderNode(folderTree)}
          </div>
        </div>
      </div>
    </ModalShell>
  );
};
