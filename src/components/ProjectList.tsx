import React, { useState, useRef, useEffect } from 'react';
import {
  FolderGit2,
  FileCode,
  Plus,
  Trash2,
  Download,
  Upload,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  FilePlus,
  Folder,
  FolderOpen,
  FileText,
  Search,
  Copy,
  Package,
  FileArchive
} from 'lucide-react';
import { CodeProject, CodeLanguage } from '../types';
import { exportProjectToJson } from '../services/storage';
import { exportProjectToZip } from '../utils/zipPackager';

interface ProjectListProps {
  projects: CodeProject[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onOpenNewModal: () => void;
  onDeleteProject: (id: string) => void;
  onDuplicateProject: (id: string) => void;
  onRunProjectDirect: (id: string) => void;
  onSelectFile: (fileId: string) => void;
  onAddNewFile: (name: string, language: CodeLanguage) => void;
  onAddNewFolder?: (name: string) => void;
  onDeleteFolder?: (folderPath: string) => void;
  onDeleteFile: (fileId: string) => void;
  onSwitchToCodeTab: () => void;
  onOpenSingleFileBundle?: () => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onOpenNewModal,
  onDeleteProject,
  onDuplicateProject,
  onSelectFile,
  onAddNewFile,
  onAddNewFolder,
  onDeleteFolder,
  onDeleteFile,
  onSwitchToCodeTab,
  onOpenSingleFileBundle
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isProjectsMenuOpen, setIsProjectsMenuOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [isPackageMenuOpen, setIsPackageMenuOpen] = useState(false);

  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [targetParentFolder, setTargetParentFolder] = useState<string | null>(null);

  // Expanded folders state: folderPath -> boolean (default true)
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const packageMenuRef = useRef<HTMLDivElement>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setIsNewMenuOpen(false);
      }
      if (packageMenuRef.current && !packageMenuRef.current.contains(e.target as Node)) {
        setIsPackageMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Language helper from file extension
  const detectLanguageFromExtension = (filename: string): CodeLanguage => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'html' || ext === 'htm') return 'html';
    if (ext === 'css') return 'css';
    if (ext === 'json') return 'json';
    if (ext === 'py' || ext === 'python') return 'python';
    if (ext === 'ts' || ext === 'tsx') return 'typescript';
    return 'javascript';
  };

  // Handle local file open/import
  const handleOpenLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeProject) return;

    const file = files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = (event.target?.result as string) || '';
      const lang = detectLanguageFromExtension(file.name);
      onAddNewFile(file.name, lang);
    };

    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Create new file
  const handleCreateFile = () => {
    if (!newFileName.trim()) return;
    let name = newFileName.trim();
    if (targetParentFolder) {
      name = `${targetParentFolder}/${name.replace(/^\/+/, '')}`;
    }
    const lang = detectLanguageFromExtension(name);
    onAddNewFile(name, lang);

    // Auto expand parents
    const foldersToExpand: Record<string, boolean> = {};
    const parts = name.split('/');
    parts.pop(); // remove file name
    let cur = '';
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      foldersToExpand[cur] = true;
    }
    if (Object.keys(foldersToExpand).length > 0) {
      setOpenFolders((prev) => ({ ...prev, ...foldersToExpand }));
    }

    setNewFileName('');
    setTargetParentFolder(null);
    setShowNewFileInput(false);
  };

  // Create new folder without creating dummy js file
  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    let cleanFolder = newFolderName.trim().replace(/^\/+|\/+$/g, '');
    if (targetParentFolder) {
      cleanFolder = `${targetParentFolder}/${cleanFolder}`;
    }
    if (onAddNewFolder) {
      onAddNewFolder(cleanFolder);
    }
    // Auto expand newly created folder and parents
    const foldersToExpand: Record<string, boolean> = {};
    const parts = cleanFolder.split('/');
    let cur = '';
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      foldersToExpand[cur] = true;
    }
    
    setOpenFolders((prev) => ({ ...prev, ...foldersToExpand }));
    setNewFolderName('');
    setTargetParentFolder(null);
    setShowNewFolderInput(false);
  };

  // Toggle folder open / close
  const toggleFolder = (folderPath: string) => {
    setOpenFolders((prev) => {
      const current = prev[folderPath] !== false; // default is open
      return { ...prev, [folderPath]: !current };
    });
  };

  const isFolderOpen = (folderPath: string): boolean => {
    return openFolders[folderPath] !== false; // default true
  };

  // Export Zip handler
  const handleExportZip = async () => {
    if (!activeProject) return;
    setIsPackageMenuOpen(false);
    await exportProjectToZip(activeProject);
  };

  type TreeNode = {
    name: string;
    path: string;
    type: 'folder' | 'file';
    file?: any;
    children: Record<string, TreeNode>;
  };

  const buildTree = (): TreeNode => {
    const root: TreeNode = { name: 'root', path: '', type: 'folder', children: {} };
    if (!activeProject) return root;

    // Process explicit folders
    (activeProject.folders || []).forEach((f) => {
      const parts = f.trim().split('/');
      let current = root;
      let currentPath = '';
      for (const part of parts) {
        if (!part) continue;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!current.children[part]) {
          current.children[part] = { name: part, path: currentPath, type: 'folder', children: {} };
        }
        current = current.children[part];
      }
    });

    // Process files
    (activeProject.files || []).forEach((f) => {
      const parts = f.name.split('/');
      const fileName = parts.pop()!;
      let current = root;
      let currentPath = '';
      
      for (const part of parts) {
        if (!part) continue;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!current.children[part]) {
          current.children[part] = { name: part, path: currentPath, type: 'folder', children: {} };
        }
        current = current.children[part];
      }
      
      current.children[fileName] = { 
        name: fileName, 
        path: f.name, 
        type: 'file', 
        file: f, 
        children: {} 
      };
    });

    return root;
  };

  const countFilesInNode = (node: TreeNode): number => {
    let count = 0;
    if (node.type === 'file') return 1;
    for (const child of Object.values(node.children)) {
      count += countFilesInNode(child);
    }
    return count;
  };

  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    if (node.type === 'file') {
      return (
        <div key={node.path}>
          {renderFileItem(node.file!, node.name)}
        </div>
      );
    } else if (node.type === 'folder' && node.path !== '') {
      const isOpen = isFolderOpen(node.path);
      const childrenNodes = Object.values(node.children).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      const folderFilesCount = countFilesInNode(node);

      return (
        <div key={node.path} className={`mb-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] overflow-hidden ${depth > 0 ? 'border-l-2 border-l-[var(--border-medium)]' : ''}`}>
          {/* Folder Header */}
          <div
            onClick={() => toggleFolder(node.path)}
            className="p-2 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors select-none"
          >
            <div className="flex items-center space-x-2 min-w-0 pr-2">
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
              )}
              {isOpen ? (
                <FolderOpen className="w-4 h-4 text-[var(--brand)] shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-[var(--brand)] shrink-0" />
              )}
              <span className="text-xs font-bold text-[var(--text-primary)] font-mono-code truncate">
                {node.name}
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-1.5 py-0.2 rounded">
                {folderFilesCount} 个文件
              </span>
            </div>

            <div className="flex items-center space-x-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => {
                  setTargetParentFolder(node.path);
                  setShowNewFileInput(true);
                  setShowNewFolderInput(false);
                  if (!isOpen) toggleFolder(node.path);
                }}
                className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--brand)]"
                title="在该文件夹下新建文件"
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setTargetParentFolder(node.path);
                  setShowNewFolderInput(true);
                  setShowNewFileInput(false);
                  if (!isOpen) toggleFolder(node.path);
                }}
                className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--brand)]"
                title="在该文件夹下新建文件夹"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              {onDeleteFolder && (
                <button
                  onClick={() => onDeleteFolder(node.path)}
                  className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--warning)]"
                  title="删除文件夹"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Folder Content */}
          {isOpen && (
            <div className="pl-3 pr-1 pb-1 pt-1 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] space-y-1">
              {childrenNodes.length === 0 ? (
                <div className="py-2 pl-4 text-[11px] text-[var(--text-tertiary)] flex items-center justify-between">
                  <span>(空文件夹)</span>
                  <div className="flex items-center space-x-2 pr-2">
                    <button
                      onClick={() => {
                        setTargetParentFolder(node.path);
                        setShowNewFileInput(true);
                      }}
                      className="text-[11px] text-[var(--brand)] hover:underline flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>文件</span>
                    </button>
                    <button
                      onClick={() => {
                        setTargetParentFolder(node.path);
                        setShowNewFolderInput(true);
                      }}
                      className="text-[11px] text-[var(--brand)] hover:underline flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>文件夹</span>
                    </button>
                  </div>
                </div>
              ) : (
                childrenNodes.map(child => renderTreeNode(child, depth + 1))
              )}
            </div>
          )}
        </div>
      );
    } else if (node.path === '') {
      const childrenNodes = Object.values(node.children).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return (
        <div className="space-y-1.5">
          {childrenNodes.length === 0 ? (
             <div className="py-12 text-center text-[var(--text-tertiary)] space-y-2">
               <FileCode className="w-8 h-8 mx-auto stroke-1 opacity-50" />
               <p className="text-xs">项目内暂无文件，可通过上方按钮新建或打开文件</p>
             </div>
          ) : (
            childrenNodes.map(child => renderTreeNode(child, 0))
          )}
        </div>
      );
    }
  };

  const projectTree = buildTree();

  // Filtered files for search
  const isSearching = searchQuery.trim().length > 0;
  const searchResults = isSearching
    ? (activeProject?.files || []).filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-primary)]">
      {/* Hidden File Input for "打开文件" */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleOpenLocalFile}
        className="hidden"
        accept=".js,.ts,.jsx,.tsx,.html,.css,.json,.py,.txt"
      />

      {/* Top Bar: Projects Submenu */}
      <div className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] shrink-0">
        <div
          onClick={() => setIsProjectsMenuOpen(!isProjectsMenuOpen)}
          className="p-3 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors select-none"
        >
          <div className="flex items-center space-x-2 min-w-0 pr-2">
            <FolderGit2 className="w-4 h-4 text-[var(--brand)] shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] text-[var(--text-tertiary)] font-medium">项目菜单:</span>
                <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                  {activeProject ? activeProject.title : '未选择项目'}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] truncate">
                {activeProject ? activeProject.description : '暂无项目，请新建项目'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            <span className="text-[10px] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded font-mono-code">
              {projects.length} 个项目
            </span>
            {isProjectsMenuOpen ? (
              <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
            )}
          </div>
        </div>

        {/* Submenu Dropdown List (Projects List) */}
        {isProjectsMenuOpen && (
          <div className="p-3 pt-1 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] space-y-2 max-h-56 overflow-y-auto">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">项目列表</span>
              <button
                onClick={onOpenNewModal}
                className="text-[11px] font-semibold text-[var(--brand)] flex items-center space-x-1 hover:underline press-feedback"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建项目</span>
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="py-4 text-center text-[11px] text-[var(--text-tertiary)]">
                暂无项目，点击上方新建项目
              </div>
            ) : (
              projects.map((proj) => {
                const isSelected = proj.id === activeProjectId;
                return (
                  <div
                    key={proj.id}
                    onClick={() => {
                      onSelectProject(proj.id);
                      setIsProjectsMenuOpen(false);
                    }}
                    className={`p-2 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-[var(--brand)] bg-[var(--brand-subtle)]/20'
                        : 'border-[var(--border-subtle)] hover:border-[var(--border-medium)] bg-[var(--bg-secondary)]'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {proj.title}
                        </span>
                        {isSelected && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-[var(--brand)] text-white">
                            当前
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--text-secondary)] truncate">{proj.description}</p>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onDuplicateProject(proj.id)}
                        className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                        title="复制项目"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => exportProjectToJson(proj)}
                        className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                        title="导出 JSON"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteProject(proj.id)}
                        className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--warning)]"
                        title="删除项目"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Main Area: Files and Folders Explorer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Actions & Search Bar */}
        <div className="p-3 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            {/* Search Box on the left/middle */}
            <div className="relative flex-1 mr-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索文件..."
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-md pl-7 pr-7 py-1 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand)] transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  清除
                </button>
              )}
            </div>

            {activeProject && (
              <div className="flex items-center space-x-1.5 shrink-0">
                {/* 新建按钮及下拉子菜单 */}
                <div className="relative" ref={newMenuRef}>
                  <button
                    id="btn-new-menu"
                    onClick={() => {
                      setIsNewMenuOpen(!isNewMenuOpen);
                      setIsPackageMenuOpen(false);
                    }}
                    className="px-2.5 py-1 bg-[var(--brand)] text-white text-xs font-medium rounded-md press-feedback flex items-center space-x-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新建</span>
                    <ChevronDown className="w-3 h-3 opacity-80" />
                  </button>

                  {isNewMenuOpen && (
                    <div className="absolute right-0 mt-1 w-32 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg shadow-lg py-1 z-30 select-none">
                      <button
                        onClick={() => {
                          setIsNewMenuOpen(false);
                          setShowNewFileInput(true);
                          setShowNewFolderInput(false);
                          setTargetParentFolder(null);
                        }}
                        className="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2"
                      >
                        <FilePlus className="w-3.5 h-3.5 text-[var(--brand)]" />
                        <span>新建文件</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsNewMenuOpen(false);
                          setShowNewFolderInput(true);
                          setShowNewFileInput(false);
                          setTargetParentFolder(null);
                        }}
                        className="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2"
                      >
                        <FolderPlus className="w-3.5 h-3.5 text-[var(--brand)]" />
                        <span>新建文件夹</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 打开文件 */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-1 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-medium rounded-md press-feedback flex items-center space-x-1 border border-[var(--border-subtle)]"
                  title="从本地打开/导入文件"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>打开</span>
                </button>

                {/* 打包按钮及下拉子菜单 */}
                <div className="relative" ref={packageMenuRef}>
                  <button
                    id="btn-package-menu"
                    onClick={() => {
                      setIsPackageMenuOpen(!isPackageMenuOpen);
                      setIsNewMenuOpen(false);
                    }}
                    className="px-2.5 py-1 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-medium rounded-md press-feedback flex items-center space-x-1 border border-[var(--border-subtle)]"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>打包</span>
                    <ChevronDown className="w-3 h-3 opacity-80" />
                  </button>

                  {isPackageMenuOpen && (
                    <div className="absolute right-0 mt-1 w-34 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg shadow-lg py-1 z-30 select-none">
                      {onOpenSingleFileBundle && (
                        <button
                          onClick={() => {
                            setIsPackageMenuOpen(false);
                            onOpenSingleFileBundle();
                          }}
                          className="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2"
                        >
                          <Package className="w-3.5 h-3.5 text-[var(--brand)]" />
                          <span>打包单文件</span>
                        </button>
                      )}

                      <button
                        onClick={handleExportZip}
                        className="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2"
                      >
                        <FileArchive className="w-3.5 h-3.5 text-[var(--brand)]" />
                        <span>打包 ZIP</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Inline New File Form */}
          {showNewFileInput && (
            <div className="flex items-center space-x-2 pt-1 border-t border-[var(--border-subtle)]">
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder={
                  targetParentFolder
                    ? `在 ${targetParentFolder}/ 下新建文件 (例如: utils.js)`
                    : '文件名称 (例如: utils.js 或 components/Button.tsx)'
                }
                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1 text-xs text-[var(--text-primary)] font-mono-code focus:outline-none focus:border-[var(--brand)]"
                autoFocus
              />
              <button
                onClick={handleCreateFile}
                className="px-2.5 py-1 bg-[var(--brand)] text-white text-xs font-semibold rounded-md press-feedback"
              >
                确认
              </button>
              <button
                onClick={() => {
                  setShowNewFileInput(false);
                  setTargetParentFolder(null);
                }}
                className="px-2 py-1 text-xs text-[var(--text-secondary)]"
              >
                取消
              </button>
            </div>
          )}

          {/* Inline New Folder Form */}
          {showNewFolderInput && (
            <div className="flex items-center space-x-2 pt-1 border-t border-[var(--border-subtle)]">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="文件夹名称 (例如: components 或 utils)"
                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1 text-xs text-[var(--text-primary)] font-mono-code focus:outline-none focus:border-[var(--brand)]"
                autoFocus
              />
              <button
                onClick={handleCreateFolder}
                className="px-2.5 py-1 bg-[var(--brand)] text-white text-xs font-semibold rounded-md press-feedback"
              >
                创建文件夹
              </button>
              <button
                onClick={() => setShowNewFolderInput(false)}
                className="px-2 py-1 text-xs text-[var(--text-secondary)]"
              >
                取消
              </button>
            </div>
          )}
        </div>

        {/* Tree & File List Display */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!activeProject ? (
            <div className="py-16 text-center text-[var(--text-tertiary)] space-y-3">
              <FolderGit2 className="w-10 h-10 mx-auto stroke-1 opacity-50 text-[var(--brand)]" />
              <p className="text-xs">当前没有选择任何项目</p>
              <button
                onClick={onOpenNewModal}
                className="px-4 py-2 bg-[var(--brand)] text-white text-xs font-medium rounded-md hover:bg-[var(--brand-hover)] press-feedback shadow-sm"
              >
                创建第一个项目
              </button>
            </div>
          ) : isSearching ? (
            // Search Results
            searchResults.length === 0 ? (
              <div className="py-12 text-center text-[var(--text-tertiary)] space-y-2">
                <FileCode className="w-8 h-8 mx-auto stroke-1 opacity-50" />
                <p className="text-xs">未找到匹配的文件</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-[10px] text-[var(--text-secondary)] font-medium">搜索结果 ({searchResults.length}):</div>
                {searchResults.map((file) => renderFileItem(file))}
              </div>
            )
          ) : (
            // Folder and File Hierarchy
            <div className="space-y-2">
              {renderTreeNode(projectTree)}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Helper to render a file item
  function renderFileItem(file: { id: string; name: string; language: string; content: string; isEntry?: boolean }, displayName?: string) {
    const isActiveFile = file.id === activeProject?.activeFileId;
    const lineCount = file.content.split('\n').length;
    const nameToShow = displayName || file.name;

    return (
      <div
        key={file.id}
        onClick={() => {
          onSelectFile(file.id);
          onSwitchToCodeTab();
        }}
        className={`p-2 rounded-md border flex items-center justify-between cursor-pointer transition-all ${
          isActiveFile
            ? 'border-[var(--brand)] bg-[var(--bg-secondary)] shadow-sm'
            : 'border-[var(--border-subtle)] hover:border-[var(--border-medium)] bg-[var(--bg-secondary)]'
        }`}
      >
        <div className="flex items-center space-x-2 min-w-0 pr-2">
          <FileText className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />

          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold font-mono-code text-[var(--text-primary)] truncate">
                {nameToShow}
              </span>
              {file.isEntry && (
                <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-[var(--brand-subtle)] text-[var(--brand)] shrink-0">
                  入口
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2 text-[10px] text-[var(--text-tertiary)] mt-0.5">
              <span>{lineCount} 行</span>
              <span>•</span>
              <span className="uppercase font-mono-code">{file.language}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              onSelectFile(file.id);
              onSwitchToCodeTab();
            }}
            className="px-2 py-0.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-medium rounded press-feedback"
          >
            编辑
          </button>

          {activeProject && activeProject.files.length > 1 && (
            <button
              onClick={() => onDeleteFile(file.id)}
              className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--warning)]"
              title="删除文件"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }
};
