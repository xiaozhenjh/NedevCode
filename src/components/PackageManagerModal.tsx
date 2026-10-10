import React, { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Plus,
  Trash2,
  HelpCircle,
  Search,
  Sparkles,
  Download,
  Upload,
  Check,
  FileCode2,
  Code2,
  Layers,
  ArrowRight,
  ChevronDown
} from 'lucide-react';
import { CodeProject, ProjectFile } from '../types';
import { ModalShell } from './ModalShell';

interface PackageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: CodeProject;
  onUpdatePackages: (pipPackages: string[], npmPackages: string[]) => void;
}

interface PackageRecommendation {
  name: string;
  desc: string;
  category: string;
}

// Python Popular Packages by Category
const PYTHON_RECOMMENDATIONS: PackageRecommendation[] = [
  { name: 'numpy', desc: '科学计算与多维数组处理基础库', category: '数据与计算' },
  { name: 'pandas', desc: '高性能数据分析与数据表结构', category: '数据与计算' },
  { name: 'scipy', desc: '数值积分与科学工程计算库', category: '数据与计算' },
  { name: 'sympy', desc: '符号数学计算与公式推导', category: '数据与计算' },
  { name: 'mpmath', desc: '任意精度高精度浮点数计算', category: '数据与计算' },

  { name: 'matplotlib', desc: '基础图表绘制与可视化库', category: '图表可视化' },
  { name: 'seaborn', desc: '基于 Matplotlib 的统计图形美化', category: '图表可视化' },

  { name: 'scikit-learn', desc: '经典机器学习与数据挖掘算法', category: 'AI 与算法' },
  { name: 'networkx', desc: '图论与复杂网络拓扑分析', category: 'AI 与算法' },

  { name: 'requests', desc: '简洁易用的 HTTP 网络请求库', category: '网络与接口' },
  { name: 'beautifulsoup4', desc: 'HTML/XML 页面结构解析与提取', category: '网络与接口' },

  { name: 'pillow', desc: '图像处理与图形变换库', category: '实用工具' },
  { name: 'openpyxl', desc: 'Excel (.xlsx) 文件读写工具', category: '实用工具' }
];

// NPM Popular Packages by Category
const NPM_RECOMMENDATIONS: PackageRecommendation[] = [
  { name: 'axios', desc: '基于 Promise 的 HTTP 请求客户端', category: '网络与接口' },
  { name: 'swr', desc: '轻量级 HTTP 数据请求与自动缓存', category: '网络与接口' },

  { name: 'lodash', desc: '全能 JavaScript 实用工具函数集', category: '数据与工具' },
  { name: 'dayjs', desc: '极轻量级时间与日期解析处理库', category: '数据与工具' },
  { name: 'mathjs', desc: '扩展数学计算与矩阵表达运算', category: '数据与工具' },
  { name: 'crypto-js', desc: '标准加密算法库 (MD5/SHA/AES)', category: '数据与工具' },

  { name: 'chart.js', desc: '简洁灵活的 HTML5 数据图表库', category: 'UI 与动画' },
  { name: 'animejs', desc: '高性能 JavaScript 动画引擎', category: 'UI 与动画' },
  { name: 'canvas-confetti', desc: '高性能五彩纸屑礼花动画效果', category: 'UI 与动画' },
  { name: 'lucide-react', desc: '美观且一致的现代矢量图标库', category: 'UI 与动画' },

  { name: 'marked', desc: '快速 Markdown 语法解析器', category: '文本与排版' },
  { name: 'qrcode', desc: '二维码生成与解析生成工具', category: '实用工具' }
];

// Standard library lists to prevent false positives in auto-detection
const PYTHON_STDLIB = new Set([
  'os', 'sys', 'math', 'random', 'time', 'datetime', 'json', 're', 'typing',
  'functools', 'itertools', 'collections', 'pathlib', 'asyncio', 'logging',
  'unittest', 'hashlib', 'base64', 'urllib', 'socket', 'threading',
  'multiprocessing', 'traceback', 'copy', 'struct', 'csv', 'sqlite3',
  'subprocess', 'inspect', 'platform', 'string', 'glob', 'shutil', 'tempfile',
  'io', 'enum', 'dataclasses', 'abc', 'ast', 'codecs', 'pickle', 'sysconfig', 'types'
]);

const JS_STDLIB = new Set([
  'fs', 'path', 'http', 'https', 'events', 'crypto', 'stream', 'util', 'os',
  'url', 'child_process', 'assert', 'querystring', 'buffer', 'process', 'zlib',
  'tls', 'net', 'dgram', 'dns', 'cluster', 'v8', 'vm', 'readline', 'react', 'react-dom'
]);

/**
 * Parses project code files to auto-detect imported third-party packages
 */
function detectPackagesFromCode(files: ProjectFile[], isPython: boolean): string[] {
  const detected = new Set<string>();

  files.forEach((file) => {
    const content = file.content || '';

    if (isPython) {
      if (!file.name.endsWith('.py') && file.language !== 'python') return;
      const lines = content.split('\n');
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) return;

        // import pkg1, pkg2
        const importMatch = trimmed.match(/^import\s+([a-zA-Z0-9_\s,]+)/);
        if (importMatch) {
          const pkgs = importMatch[1].split(',');
          pkgs.forEach((p) => {
            const clean = p.trim().split(/\s+/)[0].split('.')[0];
            if (clean && !PYTHON_STDLIB.has(clean)) {
              detected.add(clean);
            }
          });
        }

        // from pkg import ...
        const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import/);
        if (fromMatch) {
          const clean = fromMatch[1].split('.')[0];
          if (clean && !PYTHON_STDLIB.has(clean)) {
            detected.add(clean);
          }
        }
      });
    } else {
      // JS / TS code files
      const isJsTs = /\.(js|jsx|ts|tsx|html|mjs|cjs)$/i.test(file.name) ||
        ['javascript', 'typescript', 'html'].includes(file.language);
      if (!isJsTs) return;

      const importRegex = /(?:import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const pkg = match[1] || match[2] || match[3];
        if (!pkg) continue;
        if (pkg.startsWith('.') || pkg.startsWith('/') || pkg.startsWith('@/')) continue;

        let pkgName = '';
        if (pkg.startsWith('@')) {
          const parts = pkg.split('/');
          if (parts.length >= 2) {
            pkgName = `${parts[0]}/${parts[1]}`;
          }
        } else {
          pkgName = pkg.split('/')[0];
        }

        if (pkgName && !JS_STDLIB.has(pkgName)) {
          detected.add(pkgName);
        }
      }
    }
  });

  return Array.from(detected);
}

export const PackageManagerModal: React.FC<PackageManagerModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdatePackages
}) => {
  // Determine which package managers are available based on project files
  const availableManagers = useMemo(() => {
    const managers: { id: 'python' | 'npm', label: string, icon: React.ReactNode }[] = [];
    const hasPython = project.files.some(f => f.name.endsWith('.py') || f.language === 'python') || project.executionType === 'python-sandbox' || project.language === 'python';
    const hasWeb = project.files.some(f => /\.(js|jsx|ts|tsx|html|css|mjs|cjs)$/i.test(f.name) || ['javascript', 'typescript', 'html', 'css'].includes(f.language));

    if (hasPython) {
      managers.push({ id: 'python', label: 'Python 依赖 (Pip / Pyodide)', icon: <Code2 className="w-3.5 h-3.5" /> });
    }
    if (hasWeb || managers.length === 0) { // Default to NPM if nothing else or web detected
      managers.push({ id: 'npm', label: 'NPM 依赖 (JavaScript / Web)', icon: <FileCode2 className="w-3.5 h-3.5" /> });
    }
    return managers;
  }, [project.files, project.executionType, project.language]);

  const [activeTab, setActiveTab] = useState<'python' | 'npm'>(availableManagers[0]?.id || 'npm');

  // Sync activeTab if current is no longer available (rare)
  useEffect(() => {
    if (!availableManagers.find(m => m.id === activeTab) && availableManagers.length > 0) {
      setActiveTab(availableManagers[0].id);
    }
  }, [availableManagers, activeTab]);

  const [pipPackages, setPipPackages] = useState<string[]>(project.packages || []);
  const [npmPackages, setNpmPackages] = useState<string[]>(project.npmPackages || []);

  const [newPackageInput, setNewPackageInput] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchImportText, setBatchImportText] = useState('');

  const currentList = activeTab === 'python' ? pipPackages : npmPackages;

  // Auto-detect missing packages from project files
  const detectedMissingPackages = useMemo(() => {
    const isPythonTab = activeTab === 'python';
    const detectedInCode = detectPackagesFromCode(project.files || [], isPythonTab);
    return detectedInCode.filter((pkg) => !currentList.includes(pkg));
  }, [project.files, activeTab, currentList]);

  // Recommendations filtered by search and category
  const activeRecommendations = activeTab === 'python' ? PYTHON_RECOMMENDATIONS : NPM_RECOMMENDATIONS;

  const categories = useMemo(() => {
    const cats = new Set<string>(['全部']);
    activeRecommendations.forEach((item) => cats.add(item.category));
    return Array.from(cats);
  }, [activeRecommendations]);

  const filteredRecommendations = useMemo(() => {
    return activeRecommendations.filter((item) => {
      const matchCategory = selectedCategory === '全部' || item.category === selectedCategory;
      const matchQuery = !catalogSearch.trim() ||
        item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        item.desc.toLowerCase().includes(catalogSearch.toLowerCase());
      return matchCategory && matchQuery;
    });
  }, [activeRecommendations, selectedCategory, catalogSearch]);

  if (!isOpen) return null;

  const handleAddPackages = (pkgs: string[]) => {
    const validTokens = pkgs
      .flatMap((p) => p.split(/[\s,;\n]+/))
      .map((p) => p.trim())
      .filter(Boolean);

    if (validTokens.length === 0) return;

    if (activeTab === 'python') {
      const next = Array.from(new Set([...pipPackages, ...validTokens]));
      setPipPackages(next);
      onUpdatePackages(next, npmPackages);
    } else {
      const next = Array.from(new Set([...npmPackages, ...validTokens]));
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

  const handleInstallAllMissing = () => {
    if (detectedMissingPackages.length > 0) {
      handleAddPackages(detectedMissingPackages);
    }
  };

  const handleBatchImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchImportText.trim()) return;

    let pkgsToImport: string[] = [];

    // Try parsing as JSON first (package.json)
    try {
      const parsed = JSON.parse(batchImportText);
      const deps = { ...parsed.dependencies, ...parsed.devDependencies };
      pkgsToImport = Object.keys(deps);
    } catch {
      // Fallback: parse requirements.txt or plain text lines
      pkgsToImport = batchImportText
        .split('\n')
        .map((line) => {
          const clean = line.trim().replace(/#.*/, '');
          // Extract package name before operators like ==, >=, <=, ~=
          const match = clean.match(/^([a-zA-Z0-9_@\/-]+)/);
          return match ? match[1] : '';
        })
        .filter(Boolean);
    }

    if (pkgsToImport.length > 0) {
      handleAddPackages(pkgsToImport);
      setBatchImportText('');
      setShowBatchImport(false);
    }
  };

  const activeManager = availableManagers.find(m => m.id === activeTab) || availableManagers[0];

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="第三方依赖包管理"
      icon={<Box className="w-4 h-4 text-[var(--brand)]" />}
      maxWidth="max-w-xl"
      scrollable={false}
      className="max-h-[90vh] flex flex-col overflow-hidden"
    >
      <div className="p-4 space-y-3.5 flex-1 overflow-y-auto">
        {/* Manager Selector Dropdown */}
        <div className="flex flex-col space-y-1.5 shrink-0">
          <label className="text-[11px] font-semibold text-[var(--text-secondary)] px-1">选择包管理器:</label>
          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand)]">
              {activeManager?.icon}
            </div>
            <select
              value={activeTab}
              onChange={(e) => {
                setActiveTab(e.target.value as 'python' | 'npm');
                setSelectedCategory('全部');
              }}
              className="w-full pl-9 pr-10 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl text-xs font-medium text-[var(--text-primary)] appearance-none focus:outline-none focus:border-[var(--brand)] cursor-pointer transition-colors"
            >
              {availableManagers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-tertiary)]">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Auto-detected Missing Packages Banner */}
        {detectedMissingPackages.length > 0 && (
          <div className="bg-[var(--brand-subtle)] border border-[var(--brand-border)] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all">
            <div className="flex items-start space-x-2">
              <Sparkles className="w-4 h-4 text-[var(--brand)] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-[var(--brand)] flex items-center space-x-1">
                  <span>检测到代码中引用的未配置依赖</span>
                  <span className="text-[10px] bg-[var(--brand)] text-white px-1.5 py-0.2 rounded-full">
                    {detectedMissingPackages.length} 个
                  </span>
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] font-mono-code">
                  {detectedMissingPackages.join(', ')}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleInstallAllMissing}
              className="px-3 py-1.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-semibold rounded-lg press-feedback shrink-0 flex items-center justify-center space-x-1 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>一键全部添加</span>
            </button>
          </div>
        )}

        {/* Package Input & Quick Actions Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center space-x-1">
              <span>添加新依赖包:</span>
            </label>
            <button
              type="button"
              onClick={() => setShowBatchImport((prev) => !prev)}
              className="text-[11px] text-[var(--brand)] hover:underline flex items-center space-x-1"
            >
              <Upload className="w-3 h-3" />
              <span>{showBatchImport ? '收起批量导入' : '批量导入 (requirements.txt / package.json)'}</span>
            </button>
          </div>

          {/* Batch Import Drawer */}
          {showBatchImport ? (
            <form onSubmit={handleBatchImportSubmit} className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-2">
              <div className="text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
                <span>粘贴 {activeTab === 'python' ? 'requirements.txt' : 'package.json 依赖配置'} 内容:</span>
              </div>
              <textarea
                value={batchImportText}
                onChange={(e) => setBatchImportText(e.target.value)}
                placeholder={
                  activeTab === 'python'
                    ? '例如:\nnumpy>=1.21.0\npandas\nrequests'
                    : '例如:\n{\n  "dependencies": {\n    "lodash": "^4.17.21",\n    "axios": "^1.6.0"\n  }\n}'
                }
                rows={3}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-2 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
              />
              <div className="flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowBatchImport(false)}
                  className="px-3 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!batchImportText.trim()}
                  className="px-3 py-1 bg-[var(--brand)] text-white text-xs font-medium rounded-lg hover:bg-[var(--brand-hover)] disabled:opacity-50"
                >
                  解析并导入
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddPackages([newPackageInput]);
              }}
              className="flex space-x-2"
            >
              <input
                type="text"
                value={newPackageInput}
                onChange={(e) => setNewPackageInput(e.target.value)}
                placeholder={
                  activeTab === 'python'
                    ? '输入 Python 包名 (例: numpy, pandas, sympy)'
                    : '输入 NPM 包名 (例: lodash, dayjs, axios)'
                }
                className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)] font-mono-code"
              />
              <button
                type="submit"
                disabled={!newPackageInput.trim()}
                className="px-4 py-2 bg-[var(--brand)] text-white rounded-xl text-xs font-semibold press-feedback flex items-center space-x-1 disabled:opacity-50 hover:bg-[var(--brand-hover)] shrink-0 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加</span>
              </button>
            </form>
          )}
        </div>

        {/* Current Configured Packages Section */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-[var(--brand)]" />
              <span>已配置依赖 ({currentList.length})</span>
            </span>
            {currentList.length > 0 && (
              <span className="text-[11px] text-[var(--text-tertiary)]">
                代码运行沙箱时自动装载
              </span>
            )}
          </div>

          {currentList.length === 0 ? (
            <div className="py-4 px-3 text-center text-xs text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] rounded-xl border border-dashed border-[var(--border-subtle)]">
              暂未添加任何 {activeTab === 'python' ? 'Python (Pip)' : 'NPM (JS)'} 依赖包
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-subtle)]">
              {currentList.map((pkg) => (
                <div
                  key={pkg}
                  className="flex items-center space-x-1.5 px-2.5 py-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg text-xs font-mono-code text-[var(--text-primary)] shadow-sm group hover:border-[var(--brand)] transition-colors"
                >
                  <Box className="w-3 h-3 text-[var(--brand)] shrink-0 opacity-80" />
                  <span className="font-medium">{pkg}</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePackage(pkg)}
                    className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--warning)] hover:bg-[var(--warning-subtle)] rounded transition-colors ml-1"
                    title="移除该依赖"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recommended Catalog Section with Search & Filter */}
        <div className="space-y-2.5 pt-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs font-semibold text-[var(--text-secondary)] flex items-center space-x-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>常用推荐依赖库（点击添加）</span>
            </div>

            {/* Catalog Search Input */}
            <div className="relative min-w-[160px]">
              <Search className="w-3.5 h-3.5 text-[var(--text-tertiary)] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="搜索推荐库名称/描述..."
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg pl-8 pr-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
              />
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-[var(--brand-subtle)] text-[var(--brand)] font-semibold border border-[var(--brand-border)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Recommendations Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-0.5">
            {filteredRecommendations.length === 0 ? (
              <div className="col-span-full py-6 text-center text-xs text-[var(--text-tertiary)]">
                未找到与 "{catalogSearch}" 匹配的推荐库
              </div>
            ) : (
              filteredRecommendations.map((item) => {
                const isInstalled = currentList.includes(item.name);
                return (
                  <button
                    key={item.name}
                    type="button"
                    disabled={isInstalled}
                    onClick={() => handleAddPackages([item.name])}
                    className={`p-2.5 rounded-xl border text-left flex flex-col justify-between space-y-1 transition-all ${
                      isInstalled
                        ? 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)] opacity-60 cursor-default'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--brand)] press-feedback'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono-code text-xs font-bold text-[var(--text-primary)]">
                        {item.name}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-medium flex items-center space-x-1 ${
                          isInstalled
                            ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                            : 'bg-[var(--brand-subtle)] text-[var(--brand)]'
                        }`}
                      >
                        {isInstalled ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>已添加</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>添加</span>
                          </>
                        )}
                      </span>
                    </div>

                    <p className="text-[11px] text-[var(--text-tertiary)] line-clamp-1">
                      {item.desc}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal Footer */}
      <div className="p-3 bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <span className="text-[11px] text-[var(--text-tertiary)]">
          修改后将即时在项目上下文中生效
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 bg-[var(--brand)] text-white text-xs font-semibold rounded-xl hover:bg-[var(--brand-hover)] press-feedback shadow-sm"
        >
          完成
        </button>
      </div>
    </ModalShell>
  );
};
