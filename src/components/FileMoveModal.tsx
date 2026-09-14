import React, { useState, useEffect } from 'react';
import { ProjectFile } from '../types';

interface FileMoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: ProjectFile | null;
  existingFolders: string[];
  onConfirmMove: (fileId: string, newPath: string) => void;
}

export const FileMoveModal: React.FC<FileMoveModalProps> = ({
  isOpen,
  onClose,
  file,
  existingFolders,
  onConfirmMove
}) => {
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [customFolder, setCustomFolder] = useState<string>('');
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    if (file) {
      const parts = file.name.split('/');
      parts.pop(); // Remove filename
      const currentParent = parts.join('/');
      setSelectedFolder(currentParent);
      setCustomFolder('');
      setUseCustom(false);
    }
  }, [file]);

  if (!isOpen || !file) return null;

  const fileName = file.name.split('/').pop() || file.name;

  const handleConfirm = () => {
    let targetFolder = useCustom ? customFolder.trim().replace(/^\/+|\/+$/g, '') : selectedFolder.trim().replace(/^\/+|\/+$/g, '');
    const newPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
    onConfirmMove(file.id, newPath);
    onClose();
  };

  // Distinct folder list
  const foldersList = Array.from(new Set(['', ...existingFolders])).sort();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl w-full max-w-sm overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">迁移文件位置</h3>
          <button
            onClick={onClose}
            className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            关闭
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-xs text-[var(--text-secondary)]">
            当前文件: <span className="font-mono-code font-bold text-[var(--text-primary)]">{file.name}</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-secondary)]">选择目标目录:</label>
            
            <div className="space-y-1 max-h-36 overflow-y-auto border border-[var(--border-subtle)] rounded-lg p-1.5 bg-[var(--bg-tertiary)]">
              {foldersList.map((f) => (
                <label
                  key={f || 'root'}
                  className={`flex items-center space-x-2 px-2 py-1.5 rounded-md text-xs font-mono-code cursor-pointer transition-colors ${
                    !useCustom && selectedFolder === f
                      ? 'bg-[var(--brand-subtle)] text-[var(--brand)] font-bold'
                      : 'hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                  }`}
                  onClick={() => {
                    setUseCustom(false);
                    setSelectedFolder(f);
                  }}
                >
                  <input
                    type="radio"
                    name="targetFolder"
                    checked={!useCustom && selectedFolder === f}
                    onChange={() => {
                      setUseCustom(false);
                      setSelectedFolder(f);
                    }}
                    className="accent-[var(--brand)]"
                  />
                  <span>{f ? `/${f}` : '/ (根目录)'}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="flex items-center space-x-2 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={useCustom}
                onChange={(e) => setUseCustom(e.target.checked)}
                className="accent-[var(--brand)]"
              />
              <span>或输入新的目标目录路径:</span>
            </label>
            {useCustom && (
              <input
                type="text"
                value={customFolder}
                onChange={(e) => setCustomFolder(e.target.value)}
                placeholder="例如: src/components 或 utils"
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono-code focus:outline-none focus:border-[var(--brand)]"
                autoFocus
              />
            )}
          </div>

          <div className="text-[11px] text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] p-2 rounded-lg font-mono-code">
            迁移后路径: {useCustom ? (customFolder.trim() ? `${customFolder.trim().replace(/^\/+|\/+$/g, '')}/${fileName}` : fileName) : (selectedFolder ? `${selectedFolder}/${fileName}` : fileName)}
          </div>
        </div>

        <div className="px-4 py-3 bg-[var(--bg-tertiary)] border-t border-[var(--border-subtle)] flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-3.5 py-1.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-semibold rounded-md press-feedback"
          >
            确认迁移
          </button>
        </div>
      </div>
    </div>
  );
};
