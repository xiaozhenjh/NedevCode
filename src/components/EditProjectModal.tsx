import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { CodeProject } from '../types';

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

  if (!isOpen || !project) return null;

  const handleUpdate = () => {
    onUpdateProject(project.id, {
      title: title.trim() || '未命名项目',
      description: description.trim()
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 select-none"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="w-full max-w-md bg-[var(--bg-secondary)] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl border border-[var(--border-subtle)] space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
