import React, { useState } from 'react';
import { X, Plus, Trash2, Box, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CodeProject } from '../types';

interface PackageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: CodeProject;
  onUpdatePackages: (pipPackages: string[], npmPackages: string[]) => void;
}

const POPULAR_PYTHON_PACKAGES = [
  { name: 'numpy', desc: '科学计算与矩阵运算基础库' },
  { name: 'pandas', desc: '高性能数据分析与数据表处理' },
  { name: 'matplotlib', desc: '图表绘制与数据可视化' },
  { name: 'scipy', desc: '科学计算与数学算法库' },
  { name: 'sympy', desc: '符号数学计算与公式推导' },
  { name: 'requests', desc: 'HTTP请求与网络数据获取' },
  { name: 'scikit-learn', desc: '经典机器学习与数据挖掘' },
  { name: 'beautifulsoup4', desc: 'HTML与XML解析提取' },
  { name: 'pillow', desc: '图像处理库' },
  { name: 'mpmath', desc: '任意精度浮点数计算' }
];

const POPULAR_NPM_PACKAGES = [
  { name: 'lodash', desc: '实用 JavaScript 工具函数集' },
  { name: 'dayjs', desc: '轻量级时间与日期处理库' },
  { name: 'axios', desc: '基于 Promise 的 HTTP 客户端' },
  { name: 'mathjs', desc: '扩展数学函数与矩阵计算库' },
  { name: 'canvas-confetti', desc: '高性能五彩纸屑礼花动画' },
  { name: 'chart.js', desc: '简洁灵活的 HTML5 图表库' },
  { name: 'animejs', desc: '轻量级动画引擎' },
  { name: 'qrcode', desc: '二维码生成与解析工具' },
  { name: 'crypto-js', desc: '标准加密算法库 (MD5/SHA/AES)' },
  { name: 'marked', desc: '快速 Markdown 语法解析器' }
];

export const PackageManagerModal: React.FC<PackageManagerModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdatePackages
}) => {
  const isPythonProject = project.executionType === 'python-sandbox' || project.language === 'python';
  const [activeTab, setActiveTab] = useState<'python' | 'npm'>(isPythonProject ? 'python' : 'npm');

  const [pipPackages, setPipPackages] = useState<string[]>(project.packages || []);
  const [npmPackages, setNpmPackages] = useState<string[]>(project.npmPackages || []);
  const [newPackageInput, setNewPackageInput] = useState('');

  if (!isOpen) return null;

  const currentList = activeTab === 'python' ? pipPackages : npmPackages;

  const handleAddPackage = (pkgName?: string) => {
    const raw = (pkgName || newPackageInput).trim();
    if (!raw) return;

    // Split by commas or spaces if user pasted multiple
    const tokens = raw.split(/[\s,]+/).filter(Boolean);

    if (activeTab === 'python') {
      const next = Array.from(new Set([...pipPackages, ...tokens]));
      setPipPackages(next);
      onUpdatePackages(next, npmPackages);
    } else {
      const next = Array.from(new Set([...npmPackages, ...tokens]));
      setNpmPackages(next);
      onUpdatePackages(pipPackages, next);
    }

    setNewPackageInput('');
  };

  const handleRemovePackage = (pkgToRemove: string) => {
    if (activeTab === 'python') {
      const next = pipPackages.filter((p) => p !== pkgToRemove);
      setPipPackages(next);
      onUpdatePackages(next, npmPackages);
    } else {
      const next = npmPackages.filter((p) => p !== pkgToRemove);
      setNpmPackages(next);
      onUpdatePackages(pipPackages, next);
    }
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
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340 }}
            className="w-full max-w-lg bg-[var(--bg-secondary)] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl border border-[var(--border-subtle)] space-y-4 max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)] shrink-0">
              <div className="flex items-center space-x-2">
                <Box className="w-4 h-4 text-[var(--brand)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">第三方依赖包管理</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] press-feedback"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

        {/* Tab Switcher */}
        <div className="flex space-x-2 bg-[var(--bg-tertiary)] p-1 rounded-xl shrink-0">
          <button
            onClick={() => setActiveTab('python')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'python'
                ? 'bg-[var(--bg-secondary)] text-[var(--brand)] font-semibold shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Python 依赖 (Pyodide / Pip)
          </button>
          <button
            onClick={() => setActiveTab('npm')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'npm'
                ? 'bg-[var(--bg-secondary)] text-[var(--brand)] font-semibold shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            NPM 依赖 (JavaScript / Web)
          </button>
        </div>

        {/* Input Area */}
        <div className="space-y-2 shrink-0">
          <label className="text-xs text-[var(--text-secondary)] flex items-center justify-between">
            <span>添加新依赖包:</span>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {activeTab === 'python' ? '支持标准 pip 包名' : '支持 npm 模块名或 @版本号'}
            </span>
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddPackage();
            }}
            className="flex space-x-2"
          >
            <input
              type="text"
              value={newPackageInput}
              onChange={(e) => setNewPackageInput(e.target.value)}
              placeholder={
                activeTab === 'python'
                  ? '例如: numpy, pandas, sympy, requests'
                  : '例如: lodash, dayjs, axios, mathjs'
              }
              className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)] font-mono-code"
            />
            <button
              type="submit"
              disabled={!newPackageInput.trim()}
              className="px-3 py-2 bg-[var(--brand)] text-white rounded-xl text-xs font-medium press-feedback flex items-center space-x-1 disabled:opacity-50 hover:bg-[var(--brand-hover)] shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>安装</span>
            </button>
          </form>
        </div>

        {/* Package List */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
          <div>
            <div className="text-xs font-medium text-[var(--text-primary)] mb-2 flex items-center justify-between">
              <span>已配置包 ({currentList.length})</span>
              {currentList.length > 0 && (
                <span className="text-[10px] text-[var(--text-tertiary)]">运行沙箱时自动装载</span>
              )}
            </div>

            {currentList.length === 0 ? (
              <div className="py-5 text-center text-xs text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] rounded-xl border border-dashed border-[var(--border-subtle)]">
                暂未添加任何 {activeTab === 'python' ? 'Python' : 'NPM'} 依赖包
              </div>
            ) : (
              <div className="space-y-1.5">
                {currentList.map((pkg) => (
                  <div
                    key={pkg}
                    className="flex items-center justify-between px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl text-xs"
                  >
                    <div className="flex items-center space-x-2 font-mono-code font-medium text-[var(--brand)]">
                      <Box className="w-3.5 h-3.5 opacity-80" />
                      <span>{pkg}</span>
                    </div>
                    <button
                      onClick={() => handleRemovePackage(pkg)}
                      className="p-1 text-[var(--text-tertiary)] hover:text-[var(--warning)] hover:bg-[var(--warning-subtle)] rounded-md transition-colors"
                      title="移除依赖包"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Recommendations */}
          <div>
            <div className="text-xs font-medium text-[var(--text-secondary)] mb-2 flex items-center space-x-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>常用推荐依赖（点击快速安装）</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(activeTab === 'python' ? POPULAR_PYTHON_PACKAGES : POPULAR_NPM_PACKAGES).map((item) => {
                const isInstalled = currentList.includes(item.name);
                return (
                  <button
                    key={item.name}
                    disabled={isInstalled}
                    onClick={() => handleAddPackage(item.name)}
                    className={`p-2.5 rounded-xl border text-left flex flex-col space-y-1 transition-all ${
                      isInstalled
                        ? 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] opacity-60 cursor-default'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--brand)] press-feedback'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono-code text-xs font-bold text-[var(--text-primary)]">
                        {item.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                        {isInstalled ? '已添加' : '+ 添加'}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--text-tertiary)] line-clamp-1">
                      {item.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[var(--brand)] text-white text-xs font-medium rounded-xl hover:bg-[var(--brand-hover)] press-feedback"
          >
            完成
          </button>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
