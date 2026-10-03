import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { CodeProject } from '../types';
import { ModalShell } from './ModalShell';

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: CodeProject | null;
  onUpdateProject: (id: string, updates: { title?: string; description?: string }) => void;
}

export const EditProjectModal: React.FC<EditProjectModalProps> = ({ isOpen, onClose, project, onUpdateProject }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (project && isOpen) {
      setTitle(project.title);
      setDescription(project.description);
    }
  }, [project, isOpen]);

  const handleUpdate = () => {
    if (!project) return;
    onUpdateProject(project.id, {
      title: title.trim() || '未命名项目',
      description: description.trim()
    });
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen && !!project}
      onClose={onClose}
      maxWidth="max-w-md"
      className="p-5 space-y-4 overflow-y-auto"
    >
      {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">编辑项目</h2>
              <button
                onClick={onClose}
                className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] press-feedback"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]">项目名称</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="请输入项目名称"
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]">项目描述</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="可选描述"
                  rows={3}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)] resize-none"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs font-medium press-feedback"
              >
                取消
              </button>
              <button
                onClick={handleUpdate}
                className="flex-1 py-2 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium press-feedback shadow-sm"
              >
                保存
              </button>
            </div>
    </ModalShell>
  );
};
