import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, GitBranch, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CodeLanguage, CodeProject, ExecutionType } from '../types';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (project: CodeProject) => void;
  onOpenGitClone?: () => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateProject,
  onOpenGitClone
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [templateType, setTemplateType] = useState<'web' | 'algo' | 'python' | 'markdown' | 'blank'>('web');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownDirection, setDropdownDirection] = useState<'down' | 'up'>('down');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const toggleDropdown = () => {
    if (!isDropdownOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 220; // estimated height
      if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
        setDropdownDirection('up');
      } else {
        setDropdownDirection('down');
      }
    }
    setIsDropdownOpen(!isDropdownOpen);
  };

  const projectTypes = [
    { id: 'web', label: 'HTML', desc: '前端静态与交互页面' },
    { id: 'algo', label: 'JS', desc: 'Node.js / Browser 沙箱' },
    { id: 'python', label: 'Python', desc: 'Python 3 沙箱' },
    { id: 'markdown', label: 'Markdown', desc: 'Markdown 文档与富文本' },
    { id: 'blank', label: '空白', desc: '空项目模板' }
  ];

  const handleCreate = () => {
    const projectTitle = title.trim() || '新项目';

    let executionType: ExecutionType = 'html-preview';
    let files = [];

    const fileIdPrefix = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

    if (templateType === 'web') {
      executionType = 'html-preview';
      files = [
        {
          id: `${fileIdPrefix}-index`,
          name: 'index.html',
          language: 'html' as CodeLanguage,
          isEntry: true,
          content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hello World</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #ffffff;
      color: #111827;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <h1>Hello, World!</h1>
</body>
</html>`
        }
      ];
    } else if (templateType === 'algo') {
      executionType = 'js-sandbox';
      files = [
        {
          id: `${fileIdPrefix}-main`,
          name: 'main.js',
          language: 'javascript' as CodeLanguage,
          isEntry: true,
          content: `console.log("Hello, World!");`
        }
      ];
    } else if (templateType === 'python') {
      executionType = 'python-sandbox';
      files = [
        {
          id: `${fileIdPrefix}-main`,
          name: 'main.py',
          language: 'python' as CodeLanguage,
          isEntry: true,
          content: `print("Hello, World!")`
        }
      ];
    } else if (templateType === 'markdown') {
      executionType = 'markdown-preview';
      files = [
        {
          id: `${fileIdPrefix}-readme`,
          name: 'README.md',
          language: 'markdown' as CodeLanguage,
          isEntry: true,
          content: `# Hello World

Hello, World!`
        }
      ];
    } else {
      executionType = 'js-sandbox';
      files = [
        {
          id: `${fileIdPrefix}-index`,
          name: 'index.js',
          language: 'javascript' as CodeLanguage,
          isEntry: true,
          content: `console.log("Hello, World!");`
        }
      ];
    }

    const newProj: CodeProject = {
      id: 'proj-' + Date.now(),
      title: projectTitle,
      description: description.trim() || '自定义项目',
      language: files[0].language,
      executionType,
      tags: ['自定义'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files,
      activeFileId: files[0].id
    };

    onCreateProject(newProj);
    setTitle('');
    setDescription('');
    setTemplateType('web');
    onClose();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && parsed.title && Array.isArray(parsed.files)) {
          const importedProj: CodeProject = {
            ...parsed,
            id: 'proj-' + Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          onCreateProject(importedProj);
          onClose();
        }
      } catch {
        // ignore invalid json
      }
    };
    reader.readAsText(file);
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
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">新建项目</h2>
              <button
                onClick={onClose}
                className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] press-feedback"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

        {/* Template Selector */}
        <div className="space-y-1.5" ref={dropdownRef}>
          <label className="text-xs font-medium text-[var(--text-secondary)]">项目类型</label>
          <div className="relative">
            <button
              type="button"
              onClick={toggleDropdown}
              className="w-full flex items-center justify-between bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] hover:border-[var(--brand)] transition-colors focus:outline-none"
            >
              <div className="flex flex-col items-start">
                <span className="font-medium">{projectTypes.find(p => p.id === templateType)?.label}</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: dropdownDirection === 'down' ? -5 : 5, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: dropdownDirection === 'down' ? -5 : 5, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className={`absolute left-0 right-0 z-50 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-xl overflow-hidden ${
                    dropdownDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
                  }`}
                >
                  <div className="max-h-56 overflow-y-auto py-1">
                    {projectTypes.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => {
                          setTemplateType(tmpl.id as 'web' | 'algo' | 'python' | 'markdown' | 'blank');
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex flex-col transition-colors ${
                          templateType === tmpl.id
                            ? 'bg-[var(--brand-subtle)] text-[var(--brand)]'
                            : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                        }`}
                      >
                        <span className="text-sm font-medium">{tmpl.label}</span>
                        <span className={`text-xs mt-0.5 ${templateType === tmpl.id ? 'text-[var(--brand)] opacity-80' : 'text-[var(--text-secondary)]'}`}>
                          {tmpl.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选描述"
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
            />
          </div>
        </div>

        {/* Import JSON & Git Clone Option */}
        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportJson}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center space-x-1 press-feedback"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>导入 JSON</span>
          </button>

          {onOpenGitClone && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenGitClone();
              }}
              className="text-xs text-[var(--brand)] hover:text-[var(--brand-hover)] flex items-center space-x-1 press-feedback font-medium"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>从 Git 仓库克隆</span>
            </button>
          )}
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
            onClick={handleCreate}
            className="flex-1 py-2 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium press-feedback shadow-sm"
          >
            创建
          </button>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
