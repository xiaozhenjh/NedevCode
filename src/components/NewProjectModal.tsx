import React, { useState, useRef } from 'react';
import { X, Upload } from 'lucide-react';
import { CodeLanguage, CodeProject, ExecutionType } from '../types';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (project: CodeProject) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateProject
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [templateType, setTemplateType] = useState<'web' | 'algo' | 'python' | 'blank'>('web');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleCreate = () => {
    const projectTitle = title.trim() || '新项目';

    let executionType: ExecutionType = 'html-preview';
    let files = [];

    if (templateType === 'web') {
      executionType = 'html-preview';
      files = [
        {
          id: 'index-html',
          name: 'index.html',
          language: 'html' as CodeLanguage,
          isEntry: true,
          content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: sans-serif;
      padding: 24px;
      margin: 0;
    }
  </style>
</head>
<body>
  <h1>页面标题</h1>
  <p>内容区域</p>
</body>
</html>`
        }
      ];
    } else if (templateType === 'algo') {
      executionType = 'js-sandbox';
      files = [
        {
          id: 'algo-main',
          name: 'main.js',
          language: 'javascript' as CodeLanguage,
          isEntry: true,
          content: `function run() {
  const data = [1, 2, 3, 4, 5];
  console.log('数据:', data);
  return data;
}

run();`
        }
      ];
    } else if (templateType === 'python') {
      executionType = 'python-sandbox';
      files = [
        {
          id: 'py-main',
          name: 'main.py',
          language: 'python' as CodeLanguage,
          isEntry: true,
          content: `# Python 3 脚本
def calculate_stats(numbers):
    total = sum(numbers)
    count = len(numbers)
    average = total / count if count > 0 else 0
    return {
        "total": total,
        "count": count,
        "average": average,
        "max": max(numbers),
        "min": min(numbers)
    }

data = [12, 45, 67, 89, 23, 56, 78]
print("输入数据:", data)
result = calculate_stats(data)
print("统计结果:", result)
`
        }
      ];
    } else {
      executionType = 'js-sandbox';
      files = [
        {
          id: 'blank-main',
          name: 'index.js',
          language: 'javascript' as CodeLanguage,
          isEntry: true,
          content: `console.log('Hello');`
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 select-none">
      <div className="w-full max-w-md bg-[var(--bg-secondary)] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl border border-[var(--border-subtle)] space-y-4 max-h-[90vh] overflow-y-auto">
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
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--text-secondary)]">项目类型</label>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 'web', label: 'HTML' },
              { id: 'algo', label: 'JS' },
              { id: 'python', label: 'Python' },
              { id: 'blank', label: '空白' }
            ].map((tmpl) => (
              <button
                key={tmpl.id}
                onClick={() => setTemplateType(tmpl.id as 'web' | 'algo' | 'python' | 'blank')}
                className={`py-2 px-2 rounded-lg border text-center text-xs transition-colors ${
                  templateType === tmpl.id
                    ? 'border-[var(--brand)] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                {tmpl.label}
              </button>
            ))}
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

        {/* Import JSON Option */}
        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportJson}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center space-x-1 press-feedback"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>导入 JSON 文件</span>
          </button>
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
      </div>
    </div>
  );
};
