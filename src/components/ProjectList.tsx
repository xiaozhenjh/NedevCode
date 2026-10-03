import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  FileArchive,
  Box,
  MoreVertical,
  MoreHorizontal,
  Edit2,
  FolderInput,
  Star,
  Check,
  X,
  GitBranch,
  GitFork,
  UploadCloud,
  Loader2,
  Zap
} from 'lucide-react';
import { CodeProject, CodeLanguage, ProjectFile } from '../types';
import { exportProjectToJson, loadStoredOpenFolders, saveStoredOpenFolders } from '../services/storage';
import { exportProjectToZip } from '../utils/zipPackager';
import { FileMoveModal } from './FileMoveModal';
import { EditProjectModal } from './EditProjectModal';
import { detectLanguage, getFileSizeBytes, formatFileSize, isLargeFile } from '../utils/fileUtils';
import { motion, AnimatePresence } from 'motion/react';
import { SearchMode, matchesSearch, splitBySearchMatch, isValidRegex } from '../utils/searchUtils';
import { SearchModeDropdown } from './SearchModeDropdown';
import { ToolbarPortalMenu } from './ToolbarPortalMenu';

interface ProjectListProps {
  projects: CodeProject[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onOpenNewModal: () => void;
  onDeleteProject: (id: string) => void;
  onDuplicateProject: (id: string) => void;
  onUpdateProjectMeta?: (id: string, updates: { title?: string; description?: string }) => void;
  onRunProjectDirect: (id: string) => void;
  onSelectFile: (fileId: string) => void;
  onAddNewFile: (name: string, language: CodeLanguage, initialContent?: string) => void;
  onAddUploadedFiles?: (files: { name: string; language: CodeLanguage; content: string }[]) => void;
  onAddNewFolder?: (name: string) => void;
  onDeleteFolder?: (folderPath: string) => void;
  onDeleteFile: (fileId: string) => void;
  onRenameFile?: (fileId: string, newName: string) => void;
  onMoveFile?: (fileId: string, newPath: string) => void;
  onCopyFile?: (fileId: string) => void;
  onSetEntryFile?: (fileId: string) => void;
  onDownloadFile?: (fileId: string) => void;
  onSwitchToCodeTab: () => void;
  onOpenStandardBundle?: () => void;
  onOpenPackageManager?: () => void;
  onOpenGitClone?: () => void;
  onOpenGitPush?: () => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onOpenNewModal,
  onDeleteProject,
  onDuplicateProject,
  onUpdateProjectMeta,
  onRunProjectDirect,
  onSelectFile,
  onAddNewFile,
  onAddUploadedFiles,
  onAddNewFolder,
  onDeleteFolder,
  onDeleteFile,
  onRenameFile,
  onMoveFile,
  onCopyFile,
  onSetEntryFile,
  onDownloadFile,
  onSwitchToCodeTab,
  onOpenStandardBundle,
  onOpenPackageManager,
  onOpenGitClone,
  onOpenGitPush
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fileSearchMode, setFileSearchMode] = useState<SearchMode>('normal');
  const [fileCaseSensitive, setFileCaseSensitive] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isProjectsMenuOpen, setIsProjectsMenuOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [isPackageMenuOpen, setIsPackageMenuOpen] = useState(false);
  const [isGitMenuOpen, setIsGitMenuOpen] = useState(false);

  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [targetParentFolder, setTargetParentFolder] = useState<string | null>(null);

  // File More Menu State
  const [activeFileMenuId, setActiveFileMenuId] = useState<string | null>(null);
  const [fileMenuPlacement, setFileMenuPlacement] = useState<'down' | 'up'>('down');
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renamingFileName, setRenamingFileName] = useState('');
  const [movingFile, setMovingFile] = useState<ProjectFile | null>(null);
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<CodeProject | null>(null);

  // Expanded folders state: folderPath -> boolean (default true)
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => loadStoredOpenFolders(activeProjectId));

  useEffect(() => {
    setOpenFolders(loadStoredOpenFolders(activeProjectId));
  }, [activeProjectId]);

  useEffect(() => {
    saveStoredOpenFolders(activeProjectId, openFolders);
  }, [openFolders, activeProjectId]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const packageMenuRef = useRef<HTMLDivElement>(null);
  const gitMenuRef = useRef<HTMLDivElement>(null);

  const actionsToolbarRef = useRef<HTMLDivElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const packageButtonRef = useRef<HTMLButtonElement>(null);
  const gitButtonRef = useRef<HTMLButtonElement>(null);

  const isDraggingToolbar = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);
  const hasMovedToolbar = useRef(false);

  const handleToolbarWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && !e.shiftKey && actionsToolbarRef.current) {
      actionsToolbarRef.current.scrollBy({ left: e.deltaY, behavior: 'auto' });
    }
  };

  const handleToolbarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isDraggingToolbar.current = true;
    hasMovedToolbar.current = false;
    startX.current = e.pageX;
    scrollLeftStart.current = actionsToolbarRef.current?.scrollLeft || 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingToolbar.current || !actionsToolbarRef.current) return;
      const dx = moveEvent.pageX - startX.current;
      if (Math.abs(dx) > 4) {
        hasMovedToolbar.current = true;
      }
      actionsToolbarRef.current.scrollLeft = scrollLeftStart.current - dx;
    };

    const handleMouseUp = () => {
      isDraggingToolbar.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (hasMovedToolbar.current) {
        const captureClick = (clickEvent: MouseEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
          window.removeEventListener('click', captureClick, true);
        };
        window.addEventListener('click', captureClick, true);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.file-more-menu-container')) {
        setActiveFileMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Handle local file open/import with actual content reading
  const processUploadedFiles = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0 || !activeProject) return;

    setIsUploading(true);
    try {
      const parsedFiles: { name: string; language: CodeLanguage; content: string }[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        let filename = file.name;
        if (targetParentFolder) {
          filename = `${targetParentFolder}/${filename.replace(/^\/+/, '')}`;
        }
        const lang = detectLanguage(filename);

        const content = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve((ev.target?.result as string) || '');
          reader.onerror = () => resolve('');
          reader.readAsText(file);
        });

        parsedFiles.push({
          name: filename,
          language: lang,
          content
        });
      }

      if (parsedFiles.length > 0) {
        if (onAddUploadedFiles) {
          onAddUploadedFiles(parsedFiles);
        } else {
          for (const item of parsedFiles) {
            onAddNewFile(item.name, item.language, item.content);
          }
        }
      }
    } catch (err) {
      console.error('Failed to read uploaded files:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleOpenLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processUploadedFiles(e.target.files);
    }
  };

  // Create new file
  const handleCreateFile = () => {
    if (!newFileName.trim()) return;
    let name = newFileName.trim();
    if (targetParentFolder) {
      name = `${targetParentFolder}/${name.replace(/^\/+/, '')}`;
    }
    const lang = detectLanguage(name);
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
        <div key={node.path} className={`mb-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] ${depth > 0 ? 'border-l-2 border-l-[var(--border-medium)]' : ''}`}>
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
          <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16, ease: 'easeInOut' }}
                className="overflow-hidden pl-3 pr-1 pb-1 pt-1 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] space-y-1"
              >
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
              </motion.div>
            )}
          </AnimatePresence>
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
  const isSearching = isSearchOpen && searchQuery.trim().length > 0;
  const isRegexValid = useMemo(() => {
    if (fileSearchMode !== 'regex' || !searchQuery.trim()) return true;
    return isValidRegex(searchQuery.trim());
  }, [fileSearchMode, searchQuery]);

  const searchResults = useMemo(() => {
    if (!isSearching || !isRegexValid) return [];
    return (activeProject?.files || []).filter((f) =>
      matchesSearch(f.name, searchQuery, fileSearchMode, fileCaseSensitive) ||
      matchesSearch(f.path || f.name, searchQuery, fileSearchMode, fileCaseSensitive)
    );
  }, [isSearching, isRegexValid, activeProject?.files, searchQuery, fileSearchMode, fileCaseSensitive]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-primary)]">
      {/* Hidden File Input for "上传文件" */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleOpenLocalFile}
        className="hidden"
        accept="*/*"
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
        <AnimatePresence initial={false}>
          {isProjectsMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
              className="p-3 pt-1 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] space-y-2 max-h-56 overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-1">
                <span className="text-[11px] font-semibold text-[var(--text-secondary)]">项目列表</span>
                <div className="flex items-center space-x-2">
                  {onOpenGitClone && (
                    <button
                      onClick={() => {
                        setIsProjectsMenuOpen(false);
                        onOpenGitClone();
                      }}
                      className="text-[11px] font-semibold text-[var(--brand)] flex items-center space-x-1 hover:underline press-feedback"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>克隆 Git 仓库</span>
                    </button>
                  )}
                  <button
                    onClick={onOpenNewModal}
                    className="text-[11px] font-semibold text-[var(--brand)] flex items-center space-x-1 hover:underline press-feedback"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新建项目</span>
                  </button>
                </div>
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
                          {proj.gitConfig && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--brand)] font-mono-code flex items-center space-x-0.5">
                              <GitBranch className="w-2.5 h-2.5" />
                              <span>{proj.gitConfig.branch}</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] truncate">{proj.description}</p>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingProject(proj)}
                          className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                          title="编辑项目信息"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
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
                        {confirmDeleteProjectId === proj.id ? (
                          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                onDeleteProject(proj.id);
                                setConfirmDeleteProjectId(null);
                              }}
                              className="px-1.5 py-0.5 rounded bg-[var(--warning)] text-white text-[10px] font-medium"
                              title="确认删除此项目"
                            >
                              确认删除
                            </button>
                            <button
                              onClick={() => setConfirmDeleteProjectId(null)}
                              className="px-1 py-0.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] text-[10px]"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteProjectId(proj.id);
                            }}
                            className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--warning)]"
                            title="删除项目"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Area: Files and Folders Explorer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Actions & Search Bar */}
        <div className="p-3 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] space-y-2 shrink-0">
          <div
            ref={actionsToolbarRef}
            onWheel={handleToolbarWheel}
            onMouseDown={handleToolbarMouseDown}
            className="w-full overflow-x-auto flex items-center py-0.5 select-none cursor-grab active:cursor-grabbing"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {activeProject && (
              <div className="flex items-center space-x-1.5 shrink-0 min-w-max ml-auto pr-0.5">
                <button
                  id="btn-file-search-toggle"
                  onClick={() => {
                    setIsSearchOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        setTimeout(() => searchInputRef.current?.focus(), 50);
                      }
                      return next;
                    });
                  }}
                  className={`px-2 py-1 text-xs font-medium rounded-md press-feedback flex items-center justify-center border transition-colors mr-2 shrink-0 ${
                    isSearchOpen || searchQuery
                      ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border-[var(--brand)]/40'
                      : 'bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border-[var(--border-subtle)]'
                  }`}
                  title="搜索当前项目中的文件"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>

                {/* 新建按钮及下拉子菜单 */}
                <div className="relative">
                  <button
                    ref={newButtonRef}
                    id="btn-new-menu"
                    onClick={() => {
                      setIsNewMenuOpen(!isNewMenuOpen);
                      setIsPackageMenuOpen(false);
                      setIsGitMenuOpen(false);
                    }}
                    className="px-2.5 py-1 bg-[var(--brand)] text-white text-xs font-medium rounded-md press-feedback flex items-center space-x-1 shadow-sm shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新建</span>
                    <ChevronDown className="w-3 h-3 opacity-80" />
                  </button>

                  <ToolbarPortalMenu
                    isOpen={isNewMenuOpen}
                    onClose={() => setIsNewMenuOpen(false)}
                    triggerRef={newButtonRef}
                    className="w-32"
                  >
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

                    <div className="border-t border-[var(--border-subtle)] my-1" />

                    <button
                      onClick={() => {
                        setIsNewMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2"
                    >
                      <Upload className="w-3.5 h-3.5 text-[var(--brand)]" />
                      <span>上传本地文件</span>
                    </button>
                  </ToolbarPortalMenu>
                </div>

                {/* 依赖包管理 */}
                {onOpenPackageManager && (
                  <button
                    id="btn-packages"
                    onClick={onOpenPackageManager}
                    className="px-2 py-1 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-medium rounded-md press-feedback flex items-center space-x-1 border border-[var(--border-subtle)] relative shrink-0"
                    title="配置与安装 Python / NPM 依赖包"
                  >
                    <Box className="w-3.5 h-3.5 text-[var(--brand)]" />
                    <span>依赖包</span>
                    {((activeProject.packages?.length || 0) + (activeProject.npmPackages?.length || 0)) > 0 && (
                      <span className="text-[9px] px-1 py-0.2 rounded-full bg-[var(--brand-subtle)] text-[var(--brand)] font-bold">
                        {(activeProject.packages?.length || 0) + (activeProject.npmPackages?.length || 0)}
                      </span>
                    )}
                  </button>
                )}

                {/* 上传文件 */}
                <button
                  id="btn-upload-files"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-1 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-medium rounded-md press-feedback flex items-center space-x-1 border border-[var(--border-subtle)] shrink-0"
                  title="从本地上传文件到当前项目 (支持大文件与多选)"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>上传</span>
                </button>

                {/* 打包按钮及下拉子菜单 */}
                <div className="relative">
                  <button
                    ref={packageButtonRef}
                    id="btn-package-menu"
                    onClick={() => {
                      setIsPackageMenuOpen(!isPackageMenuOpen);
                      setIsNewMenuOpen(false);
                      setIsGitMenuOpen(false);
                    }}
                    className="px-2.5 py-1 bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-medium rounded-md press-feedback flex items-center space-x-1 border border-[var(--border-subtle)] shrink-0"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>打包</span>
                    <ChevronDown className="w-3 h-3 opacity-80" />
                  </button>

                  <ToolbarPortalMenu
                    isOpen={isPackageMenuOpen}
                    onClose={() => setIsPackageMenuOpen(false)}
                    triggerRef={packageButtonRef}
                    className="w-34"
                  >
                    {onOpenStandardBundle && (
                      <button
                        onClick={() => {
                          setIsPackageMenuOpen(false);
                          onOpenStandardBundle();
                        }}
                        className="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2"
                      >
                        <Package className="w-3.5 h-3.5 text-[var(--brand)]" />
                        <span>标准 HTML 打包</span>
                      </button>
                    )}

                    <button
                      onClick={handleExportZip}
                      className="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2"
                    >
                      <FileArchive className="w-3.5 h-3.5 text-[var(--brand)]" />
                      <span>打包 ZIP</span>
                    </button>
                  </ToolbarPortalMenu>
                </div>

                {/* Git 仓库集成与推送菜单 */}
                <div className="relative">
                  <button
                    ref={gitButtonRef}
                    id="btn-git-menu"
                    onClick={() => {
                      setIsGitMenuOpen(!isGitMenuOpen);
                      setIsNewMenuOpen(false);
                      setIsPackageMenuOpen(false);
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md press-feedback flex items-center space-x-1 border shrink-0 ${
                      activeProject.gitConfig
                        ? 'bg-[var(--brand-subtle)] border-[var(--brand)]/40 text-[var(--brand)]'
                        : 'bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border-[var(--border-subtle)]'
                    }`}
                    title="Git 远程管理与推送"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>Git</span>
                    {activeProject.gitConfig?.branch && (
                      <span className="text-[10px] font-mono-code opacity-90 truncate max-w-[60px]">
                        ({activeProject.gitConfig.branch})
                      </span>
                    )}
                    <ChevronDown className="w-3 h-3 opacity-80" />
                  </button>

                  <ToolbarPortalMenu
                    isOpen={isGitMenuOpen}
                    onClose={() => setIsGitMenuOpen(false)}
                    triggerRef={gitButtonRef}
                    className="w-44"
                  >
                    {onOpenGitPush && (
                      <button
                        onClick={() => {
                          setIsGitMenuOpen(false);
                          onOpenGitPush();
                        }}
                        className="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2"
                      >
                        <UploadCloud className="w-3.5 h-3.5 text-[var(--brand)]" />
                        <div className="min-w-0">
                          <div className="font-medium">推送到远程 (Push)</div>
                          <div className="text-[10px] text-[var(--text-tertiary)]">
                            {activeProject.gitConfig ? `分支: ${activeProject.gitConfig.branch}` : '连接并推送代码'}
                          </div>
                        </div>
                      </button>
                    )}

                    {onOpenGitClone && (
                      <button
                        onClick={() => {
                          setIsGitMenuOpen(false);
                          onOpenGitClone();
                        }}
                        className="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2 border-t border-[var(--border-subtle)]"
                      >
                        <GitFork className="w-3.5 h-3.5 text-[var(--brand)]" />
                        <div className="min-w-0">
                          <div className="font-medium">克隆新仓库 (Clone)</div>
                          <div className="text-[10px] text-[var(--text-tertiary)]">从 GitHub / GitLab</div>
                        </div>
                      </button>
                    )}
                  </ToolbarPortalMenu>
                </div>
              </div>
            )}
          </div>

          {/* Pop-up Search Box in Second Header */}
          <AnimatePresence>
            {isSearchOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16 }}
                className="overflow-hidden pt-2 border-t border-[var(--border-subtle)] space-y-2"
              >
                {/* Search Input Line with Mode Button at the end */}
                <div className="flex items-center space-x-1.5">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setIsSearchOpen(false);
                        }
                      }}
                      placeholder={
                        fileSearchMode === 'regex'
                          ? '正则/通配符搜索 (如: .*\\.tsx$ 或 *.ts)...'
                          : fileSearchMode === 'fuzzy'
                            ? '模糊搜索 (按字符顺序匹配)...'
                            : '搜索文件名...'
                      }
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-md pl-8 pr-16 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] font-mono-code focus:outline-none focus:border-[var(--brand)] transition-colors"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)]"
                        >
                          清除
                        </button>
                      )}
                      {searchQuery.trim() && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono-code ${
                          !isRegexValid ? 'bg-red-500/20 text-red-400' : 'bg-[var(--brand-subtle)] text-[var(--brand)]'
                        }`}>
                          {!isRegexValid ? '语法错误' : `${searchResults.length}`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mode switch dropdown button replacing the X button */}
                  <SearchModeDropdown
                    mode={fileSearchMode}
                    onModeChange={setFileSearchMode}
                    caseSensitive={fileCaseSensitive}
                    onCaseSensitiveChange={setFileCaseSensitive}
                    buttonClassName="rounded-md"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline New File Form */}
          <AnimatePresence>
            {showNewFileInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden flex items-center space-x-2 pt-1 border-t border-[var(--border-subtle)]"
              >
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
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline New Folder Form */}
          <AnimatePresence>
            {showNewFolderInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden flex items-center space-x-2 pt-1 border-t border-[var(--border-subtle)]"
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Tree & File List Display */}
        <div 
          className="flex-1 overflow-y-auto p-3 pb-28 space-y-2 relative"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (activeProject) setIsDraggingOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              processUploadedFiles(e.dataTransfer.files);
            }
          }}
        >
          {/* Drag & Drop Overlay */}
          {isDraggingOver && (
            <div className="absolute inset-2 z-40 bg-[var(--brand)]/10 backdrop-blur-sm border-2 border-dashed border-[var(--brand)] rounded-xl flex flex-col items-center justify-center p-6 text-center shadow-lg pointer-events-none">
              <Upload className="w-10 h-10 text-[var(--brand)] mb-2 animate-bounce" />
              <div className="text-sm font-bold text-[var(--brand)]">释放鼠标立即上传到项目</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">支持多文件批量上传与大文件导入</div>
            </div>
          )}

          {/* Uploading Status Indicator */}
          {isUploading && (
            <div className="py-2 px-3 bg-[var(--brand-subtle)] border border-[var(--brand-border)] rounded-lg text-xs text-[var(--brand)] flex items-center space-x-2 animate-pulse mb-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>正在读取并上传文件，请稍候...</span>
            </div>
          )}

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
      {/* File Move Location Modal */}
      <FileMoveModal
        isOpen={!!movingFile}
        onClose={() => setMovingFile(null)}
        file={movingFile}
        existingFolders={activeProject?.folders || []}
        onConfirmMove={(fileId, newPath) => {
          if (onMoveFile) {
            onMoveFile(fileId, newPath);
          }
        }}
      />
      
      {/* Edit Project Modal */}
      <EditProjectModal
        isOpen={!!editingProject}
        onClose={() => setEditingProject(null)}
        project={editingProject}
        onUpdateProject={(id, updates) => {
          if (onUpdateProjectMeta) {
            onUpdateProjectMeta(id, updates);
          }
        }}
      />
    </div>
  );

  // Helper to render a file item
  function renderFileItem(file: { id: string; name: string; language: string; content: string; isEntry?: boolean }, displayName?: string) {
    const isActiveFile = file.id === activeProject?.activeFileId;
    const lineCount = file.content.split('\n').length;
    const nameToShow = displayName || file.name;
    const isMenuOpen = activeFileMenuId === file.id;
    const isRenaming = renamingFileId === file.id;

    let renderedName: React.ReactNode = nameToShow;
    if (isSearching && searchQuery.trim() && isRegexValid) {
      const parts = splitBySearchMatch(nameToShow, searchQuery, fileSearchMode, fileCaseSensitive);
      renderedName = parts.map((part, idx) =>
        part.isMatch ? (
          <mark key={idx} className="bg-[var(--brand)] text-white px-0.5 rounded font-bold">
            {part.text}
          </mark>
        ) : (
          part.text
        )
      );
    }

    const handleSaveRename = (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const clean = renamingFileName.trim();
      if (clean && onRenameFile) {
        // If file had a directory prefix and user edited displayName only, preserve parent
        const parts = file.name.split('/');
        parts.pop();
        const parent = parts.join('/');
        const newFullPath = parent && !clean.includes('/') ? `${parent}/${clean}` : clean;
        onRenameFile(file.id, newFullPath);
      }
      setRenamingFileId(null);
      setRenamingFileName('');
    };

    return (
      <div
        key={file.id}
        onClick={() => {
          if (isRenaming) return;
          onSelectFile(file.id);
          onSwitchToCodeTab();
        }}
        className={`p-2 rounded-md border flex items-center justify-between cursor-pointer transition-all ${
          isActiveFile
            ? 'border-[var(--brand)] bg-[var(--bg-secondary)] shadow-sm'
            : 'border-[var(--border-subtle)] hover:border-[var(--border-medium)] bg-[var(--bg-secondary)]'
        } ${isMenuOpen ? 'relative z-30' : ''}`}
      >
        <div className="flex items-center space-x-2 min-w-0 pr-2 flex-1">
          <FileText className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />

          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <form onSubmit={handleSaveRename} onClick={(e) => e.stopPropagation()} className="flex items-center space-x-1">
                <input
                  type="text"
                  value={renamingFileName}
                  onChange={(e) => setRenamingFileName(e.target.value)}
                  className="bg-[var(--bg-tertiary)] border border-[var(--brand)] rounded px-1.5 py-0.5 text-xs font-mono-code text-[var(--text-primary)] focus:outline-none flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setRenamingFileId(null);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="p-1 bg-[var(--brand)] text-white rounded hover:bg-[var(--brand-hover)]"
                  title="确认重命名"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingFileId(null)}
                  className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  title="取消"
                >
                  <X className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <>
                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                  <span className="text-xs font-bold font-mono-code text-[var(--text-primary)] truncate">
                    {renderedName}
                  </span>
                  {file.isEntry && (
                    <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-[var(--brand-subtle)] text-[var(--brand)] shrink-0">
                      入口
                    </span>
                  )}
                  {isLargeFile(file.content, lineCount) && (
                    <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 shrink-0 flex items-center space-x-0.5" title="大文件支持懒加载">
                      <Zap className="w-2.5 h-2.5 mr-0.5" />
                      <span>大文件·懒加载</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2 text-[10px] text-[var(--text-tertiary)] mt-0.5">
                  <span>{lineCount} 行</span>
                  <span>•</span>
                  <span>{formatFileSize(getFileSizeBytes(file.content))}</span>
                  <span>•</span>
                  <span className="uppercase font-mono-code">{file.language}</span>
                </div>
              </>
            )}
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

          {/* ... More Menu */}
          <div className="relative file-more-menu-container">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isMenuOpen) {
                  setActiveFileMenuId(null);
                } else {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const spaceBelow = window.innerHeight - rect.bottom;
                  setFileMenuPlacement(spaceBelow < 260 ? 'up' : 'down');
                  setActiveFileMenuId(file.id);
                }
              }}
              className={`p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors ${
                isMenuOpen ? 'bg-[var(--bg-tertiary)] text-[var(--brand)]' : ''
              }`}
              title="更多操作"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            <AnimatePresence>
              {isMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: fileMenuPlacement === 'up' ? 4 : -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: fileMenuPlacement === 'up' ? 4 : -4 }}
                  transition={{ duration: 0.12 }}
                  className={`absolute right-0 ${
                    fileMenuPlacement === 'up' ? 'bottom-full mb-1 origin-bottom-right' : 'top-full mt-1 origin-top-right'
                  } w-40 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg shadow-xl py-1 z-50 select-none text-xs`}
                >
                  {/* 重命名 */}
                  <button
                    onClick={() => {
                      setActiveFileMenuId(null);
                      setRenamingFileId(file.id);
                      setRenamingFileName(displayName || file.name);
                    }}
                    className="w-full px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-[var(--brand)]" />
                    <span>重命名</span>
                  </button>

                  {/* 迁移位置 */}
                  <button
                    onClick={() => {
                      setActiveFileMenuId(null);
                      setMovingFile(file as ProjectFile);
                    }}
                    className="w-full px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2"
                  >
                    <FolderInput className="w-3.5 h-3.5 text-[var(--brand)]" />
                    <span>迁移位置</span>
                  </button>

                  {/* 复制文件 */}
                  {onCopyFile && (
                    <button
                      onClick={() => {
                        setActiveFileMenuId(null);
                        onCopyFile(file.id);
                      }}
                      className="w-full px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2"
                    >
                      <Copy className="w-3.5 h-3.5 text-[var(--brand)]" />
                      <span>复制文件</span>
                    </button>
                  )}

                  {/* 单个下载 */}
                  {onDownloadFile && (
                    <button
                      onClick={() => {
                        setActiveFileMenuId(null);
                        onDownloadFile(file.id);
                      }}
                      className="w-full px-3 py-1.5 text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] flex items-center space-x-2"
                    >
                      <Download className="w-3.5 h-3.5 text-[var(--brand)]" />
                      <span>下载文件</span>
                    </button>
                  )}

                  {/* 指定为入口文件 */}
                  {onSetEntryFile && (
                    <button
                      onClick={() => {
                        setActiveFileMenuId(null);
                        onSetEntryFile(file.id);
                      }}
                      disabled={file.isEntry}
                      className={`w-full px-3 py-1.5 text-left flex items-center space-x-2 ${
                        file.isEntry
                          ? 'text-[var(--text-tertiary)] opacity-50 cursor-not-allowed'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                      }`}
                    >
                      <Star className="w-3.5 h-3.5 text-[var(--brand)]" />
                      <span>{file.isEntry ? '已是入口文件' : '指定为入口文件'}</span>
                    </button>
                  )}

                  {/* 分割线 */}
                  <div className="my-1 border-t border-[var(--border-subtle)]" />

                  {/* 删除文件 (入口文件禁用) */}
                  <button
                    onClick={() => {
                      if (file.isEntry) return;
                      setActiveFileMenuId(null);
                      onDeleteFile(file.id);
                    }}
                    disabled={file.isEntry}
                    title={file.isEntry ? '不能删除入口文件' : '删除文件'}
                    className={`w-full px-3 py-1.5 text-left flex items-center space-x-2 ${
                      file.isEntry
                        ? 'text-[var(--text-tertiary)] opacity-40 cursor-not-allowed'
                        : 'text-[var(--warning)] hover:bg-[var(--warning-subtle)]'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{file.isEntry ? '入口文件禁止删除' : '删除文件'}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  }
};
