import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CodeProject,
  ProjectFile,
  EditorSettings,
  ExecutionResult,
  ConsoleLogItem,
  CodeLanguage,
  ExecutionType,
  GitRepoConfig
} from '../types';
import {
  loadStoredProjects,
  loadStoredProjectsAsync,
  saveStoredProjects,
  loadStoredActiveId,
  saveStoredActiveId,
  loadStoredSettings,
  saveStoredSettings,
  IDB_PLACEHOLDER_MARKER
} from '../services/storage';
import { detectLanguage, getProjectEntryFile, resolveRuntimeFromEntryFile } from '../utils/fileUtils';
import { DEFAULT_PROJECTS, PLAYGROUND_PROJECT } from '../data/defaultProjects';
import { languageRegistry } from '../languages';

export function useProjects() {
  const [projects, setProjects] = useState<CodeProject[]>(() => loadStoredProjects());
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    const projs = loadStoredProjects();
    const storedActive = loadStoredActiveId();
    if (storedActive && projs.some((p) => p.id === storedActive)) {
      return storedActive;
    }
    return projs[0]?.id || '';
  });
  const [settings, setSettings] = useState<EditorSettings>(() => loadStoredSettings());

  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult>({
    status: 'idle',
    logs: []
  });

  // Apply dark mode class to root document element
  useEffect(() => {
    const applyTheme = () => {
      if (settings.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (settings.theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        // System preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };

    applyTheme();

    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [settings.theme]);

  const isIdbLoadedRef = useRef(false);

  // Async recovery & sync from IndexedDB on initial mount (restores full media/large file contents and handles WebView persistence)
  useEffect(() => {
    let isMounted = true;
    loadStoredProjectsAsync().then((idbProjects) => {
      if (!isMounted) return;
      isIdbLoadedRef.current = true;
      if (idbProjects && idbProjects.length > 0) {
        setProjects(idbProjects);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Android WebView background kill listener (visibilitychange & pagehide)
  useEffect(() => {
    const handleFlush = () => {
      if (!isIdbLoadedRef.current) {
        const hasPlaceholders = projects.some((p) =>
          p.files.some((f) => f.content === IDB_PLACEHOLDER_MARKER)
        );
        if (hasPlaceholders) return;
      }
      saveStoredProjects(projects);
      if (activeProjectId) {
        saveStoredActiveId(activeProjectId);
      }
      saveStoredSettings(settings);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleFlush();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handleFlush);
    window.addEventListener('beforeunload', handleFlush);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handleFlush);
      window.removeEventListener('beforeunload', handleFlush);
    };
  }, [projects, activeProjectId, settings]);

  // Persist projects to localStorage and IndexedDB
  useEffect(() => {
    // If projects still contain [IDB_STORED] placeholder from initial synchronous load and IndexedDB hasn't finished loading yet, do not overwrite IndexedDB with placeholders!
    if (!isIdbLoadedRef.current) {
      const hasPlaceholders = projects.some((p) =>
        p.files.some((f) => f.content === IDB_PLACEHOLDER_MARKER)
      );
      if (hasPlaceholders) return;
    }
    saveStoredProjects(projects);
  }, [projects]);

  // Persist active ID
  useEffect(() => {
    saveStoredActiveId(activeProjectId);
  }, [activeProjectId]);

  // Persist settings
  const updateSettings = useCallback((newSettings: Partial<EditorSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...newSettings };
      saveStoredSettings(next);
      return next;
    });
  }, []);

  // Current active project
  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0] || undefined;

  // Select project
  const selectProject = useCallback((id: string) => {
    setActiveProjectId(id);
    setExecutionResult({
      status: 'idle',
      logs: []
    });
  }, []);

  // Update file content in active project
  const updateFileContent = useCallback((fileId: string, newContent: string) => {
    if (!activeProject) return;
    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          files: proj.files.map((file) =>
            file.id === fileId ? { ...file, content: newContent } : file
          )
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, [activeProject?.id]);

  // Select active file inside active project
  const selectFile = useCallback((fileId: string) => {
    if (!activeProject) return;
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        return {
          ...proj,
          activeFileId: fileId
        };
      })
    );
  }, [activeProject?.id]);

  // Add new file to active project (or update if already exists)
  const addNewFile = useCallback(
    (name: string, language: CodeLanguage, initialContent?: string) => {
      if (!activeProject) return;

      setProjects((prev) => {
        const next = prev.map((proj) => {
          if (proj.id !== activeProject.id) return proj;

          const existingIdx = proj.files.findIndex(
            (f) => f.name.toLowerCase() === name.toLowerCase()
          );

          if (existingIdx !== -1) {
            const updatedFiles = [...proj.files];
            updatedFiles[existingIdx] = {
              ...updatedFiles[existingIdx],
              language,
              content: initialContent !== undefined ? initialContent : updatedFiles[existingIdx].content
            };
            return {
              ...proj,
              updatedAt: Date.now(),
              files: updatedFiles,
              activeFileId: updatedFiles[existingIdx].id
            };
          }

          const defaultContent =
            language === 'html'
              ? '<div></div>'
              : language === 'css'
              ? '/* CSS */'
              : '// New Script\n';

          const newFile: ProjectFile = {
            id: 'file-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            name,
            language,
            content: initialContent !== undefined ? initialContent : defaultContent
          };

          return {
            ...proj,
            updatedAt: Date.now(),
            files: [...proj.files, newFile],
            activeFileId: newFile.id
          };
        });
        saveStoredProjects(next);
        return next;
      });
    },
    [activeProject?.id]
  );

  // Batch add/upload multiple files
  const addUploadedFiles = useCallback(
    (filesToAdd: { name: string; language: CodeLanguage; content: string }[]) => {
      if (!activeProject || filesToAdd.length === 0) return;

      setProjects((prev) => {
        let lastActiveFileId = '';
        const next = prev.map((proj) => {
          if (proj.id !== activeProject.id) return proj;

          const updatedFiles = [...proj.files];
          const updatedFolders = new Set(proj.folders || []);

          for (const item of filesToAdd) {
            const parts = item.name.split('/');
            if (parts.length > 1) {
              parts.pop();
              let cur = '';
              for (const p of parts) {
                cur = cur ? `${cur}/${p}` : p;
                updatedFolders.add(cur);
              }
            }

            const existingIdx = updatedFiles.findIndex(
              (f) => f.name.toLowerCase() === item.name.toLowerCase()
            );

            if (existingIdx !== -1) {
              updatedFiles[existingIdx] = {
                ...updatedFiles[existingIdx],
                language: item.language,
                content: item.content
              };
              lastActiveFileId = updatedFiles[existingIdx].id;
            } else {
              const newFile: ProjectFile = {
                id: 'file-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
                name: item.name,
                language: item.language,
                content: item.content
              };
              updatedFiles.push(newFile);
              lastActiveFileId = newFile.id;
            }
          }

          return {
            ...proj,
            updatedAt: Date.now(),
            files: updatedFiles,
            folders: Array.from(updatedFolders),
            activeFileId: lastActiveFileId || proj.activeFileId
          };
        });
        saveStoredProjects(next);
        return next;
      });
    },
    [activeProject?.id]
  );

  // Add new folder without auto-generating dummy file
  const addNewFolder = useCallback((folderName: string) => {
    if (!activeProject) return;
    const cleanFolder = folderName.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanFolder) return;
    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        const existingFolders = proj.folders || [];
        if (existingFolders.includes(cleanFolder)) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          folders: [...existingFolders, cleanFolder]
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, [activeProject?.id]);

  // Delete folder from active project
  const deleteFolder = useCallback((folderPath: string) => {
    if (!activeProject) return;
    const cleanFolder = folderPath.trim().replace(/^\/+|\/+$/g, '');
    setProjects((prev) => {
      let nextProjFiles: ProjectFile[] = [];
      let nextActiveId = '';
      const next = prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        const nextFolders = (proj.folders || []).filter(f => f !== cleanFolder && !f.startsWith(cleanFolder + '/'));
        const remainingFiles = proj.files.filter(f => !f.name.startsWith(cleanFolder + '/'));
        if (remainingFiles.length === 0) {
          const defaultFile: ProjectFile = {
            id: 'file-' + Date.now(),
            name: 'main.js',
            language: 'javascript',
            content: '// Main\n'
          };
          nextProjFiles = [defaultFile];
          nextActiveId = defaultFile.id;
          return {
            ...proj,
            updatedAt: Date.now(),
            folders: nextFolders,
            files: [defaultFile],
            activeFileId: defaultFile.id
          };
        }
        nextProjFiles = remainingFiles;
        nextActiveId = remainingFiles.some(f => f.id === proj.activeFileId) ? proj.activeFileId : remainingFiles[0].id;
        return {
          ...proj,
          updatedAt: Date.now(),
          folders: nextFolders,
          files: remainingFiles,
          activeFileId: nextActiveId
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, [activeProject?.id]);

  // Rename folder in active project
  const renameFolder = useCallback((oldFolderPath: string, newFolderPath: string) => {
    if (!activeProject) return;
    const cleanOld = oldFolderPath.trim().replace(/^\/+|\/+$/g, '');
    const cleanNew = newFolderPath.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;

    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;

        const nextFolders = (proj.folders || []).map((f) => {
          if (f === cleanOld) return cleanNew;
          if (f.startsWith(cleanOld + '/')) return cleanNew + f.slice(cleanOld.length);
          return f;
        });

        const nextFiles = proj.files.map((file) => {
          if (file.name === cleanOld) {
            return { ...file, name: cleanNew };
          }
          if (file.name.startsWith(cleanOld + '/')) {
            const newFileName = cleanNew + file.name.slice(cleanOld.length);
            return { ...file, name: newFileName, language: detectLanguage(newFileName) };
          }
          return file;
        });

        return {
          ...proj,
          updatedAt: Date.now(),
          folders: Array.from(new Set(nextFolders)),
          files: nextFiles
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, [activeProject?.id]);

  // Move folder in active project
  const moveFolder = useCallback((sourceFolderPath: string, targetParentFolder: string) => {
    if (!activeProject) return;
    const cleanSource = sourceFolderPath.trim().replace(/^\/+|\/+$/g, '');
    const cleanTargetParent = targetParentFolder.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanSource) return;

    const folderName = cleanSource.split('/').pop() || cleanSource;
    const newFolderPath = cleanTargetParent ? `${cleanTargetParent}/${folderName}` : folderName;

    if (cleanSource === newFolderPath) return;
    if (newFolderPath.startsWith(cleanSource + '/')) {
      return; // Cannot move folder inside itself
    }

    renameFolder(cleanSource, newFolderPath);
  }, [activeProject?.id, renameFolder]);

  // Copy folder in active project
  const copyFolder = useCallback((sourceFolderPath: string, targetParentFolder: string) => {
    if (!activeProject) return;
    const cleanSource = sourceFolderPath.trim().replace(/^\/+|\/+$/g, '');
    const cleanTargetParent = targetParentFolder.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanSource) return;

    const folderName = cleanSource.split('/').pop() || cleanSource;
    let newFolderPath = cleanTargetParent ? `${cleanTargetParent}/${folderName}` : folderName;

    if (cleanSource === newFolderPath) {
      newFolderPath = cleanTargetParent ? `${cleanTargetParent}/${folderName}_copy` : `${folderName}_copy`;
    }

    if (newFolderPath.startsWith(cleanSource + '/')) {
      return; // Cannot copy folder inside itself
    }

    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;

        const sourceFiles = proj.files.filter((f) => f.name === cleanSource || f.name.startsWith(cleanSource + '/'));
        if (sourceFiles.length === 0) return proj;

        const copiedFiles: ProjectFile[] = sourceFiles.map((file) => {
          const relative = file.name.slice(cleanSource.length);
          const newFileName = newFolderPath + relative;
          return {
            ...file,
            id: 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            name: newFileName,
            language: detectLanguage(newFileName),
            isEntry: false
          };
        });

        const newFolders = (proj.folders || [])
          .filter((f) => f === cleanSource || f.startsWith(cleanSource + '/'))
          .map((f) => newFolderPath + f.slice(cleanSource.length));

        const updatedFolders = Array.from(new Set([...(proj.folders || []), newFolderPath, ...newFolders]));

        return {
          ...proj,
          updatedAt: Date.now(),
          folders: updatedFolders,
          files: [...proj.files, ...copiedFiles]
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, [activeProject?.id]);

  // Delete file from active project (guard against deleting entry file)
  const deleteFile = useCallback((fileId: string) => {
    if (!activeProject) return;
    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        const targetFile = proj.files.find((f) => f.id === fileId);
        if (targetFile?.isEntry) {
          return proj;
        }
        const remaining = proj.files.filter((f) => f.id !== fileId);
        if (remaining.length === 0) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          files: remaining,
          activeFileId: proj.activeFileId === fileId ? remaining[0].id : proj.activeFileId
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, [activeProject?.id]);

  // Rename file in active project
  const renameFile = useCallback((fileId: string, newName: string) => {
    if (!activeProject) return;
    const cleanName = newName.trim();
    if (!cleanName) return;
    
    const lang = detectLanguage(cleanName);

    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          files: proj.files.map((file) =>
            file.id === fileId ? { ...file, name: cleanName, language: lang } : file
          )
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, [activeProject?.id]);

  // Move file in active project
  const moveFile = useCallback((fileId: string, newPath: string) => {
    if (!activeProject) return;
    const cleanPath = newPath.trim().replace(/^\/+/, '');
    if (!cleanPath) return;

    const lang = detectLanguage(cleanPath);
    const parts = cleanPath.split('/');
    const parentFolder = parts.slice(0, -1).join('/');

    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        const currentFolders = proj.folders || [];
        const nextFolders = parentFolder && !currentFolders.includes(parentFolder)
          ? [...currentFolders, parentFolder]
          : currentFolders;

        return {
          ...proj,
          updatedAt: Date.now(),
          folders: nextFolders,
          files: proj.files.map((file) =>
            file.id === fileId ? { ...file, name: cleanPath, language: lang } : file
          )
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, [activeProject?.id]);

  // Duplicate/Copy file in active project
  const copyFile = useCallback((fileId: string, targetPath?: string) => {
    if (!activeProject) return;
    const targetFile = activeProject.files.find((f) => f.id === fileId);
    if (!targetFile) return;

    let fullCopyPath = '';
    if (targetPath) {
      fullCopyPath = targetPath.trim().replace(/^\/+/, '');
    } else {
      const parts = targetFile.name.split('/');
      const fileName = parts.pop() || targetFile.name;
      const parent = parts.join('/');

      const nameParts = fileName.split('.');
      let copyName = '';
      if (nameParts.length > 1) {
        const ext = nameParts.pop();
        copyName = `${nameParts.join('.')}_copy.${ext}`;
      } else {
        copyName = `${fileName}_copy`;
      }
      fullCopyPath = parent ? `${parent}/${copyName}` : copyName;
    }

    const newFile: ProjectFile = {
      id: 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      name: fullCopyPath,
      language: targetFile.language,
      content: targetFile.content,
      isEntry: false
    };

    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          files: [...proj.files, newFile],
          activeFileId: newFile.id
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, [activeProject]);

  // Update file encoding in active project
  const updateFileEncoding = useCallback((fileId: string, encoding: string) => {
    if (!activeProject) return;
    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          files: proj.files.map((file) =>
            file.id === fileId ? { ...file, encoding } : file
          )
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, [activeProject?.id]);

  // Set file as entry in active project
  const setEntryFile = useCallback((fileId: string) => {
    if (!activeProject) return;
    const targetFile = activeProject.files.find((f) => f.id === fileId);
    const resolution = resolveRuntimeFromEntryFile(targetFile);

    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          executionType: resolution.supported && resolution.runtime ? resolution.runtime : proj.executionType,
          files: proj.files.map((file) => ({
            ...file,
            isEntry: file.id === fileId
          }))
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, [activeProject]);

  // Single file download helper
  const downloadSingleFile = useCallback((fileId: string) => {
    if (!activeProject) return;
    const file = activeProject.files.find((f) => f.id === fileId);
    if (!file) return;

    const downloadFileName = file.name.split('/').pop() || file.name;
    const anchor = document.createElement('a');

    if (file.content.startsWith('data:')) {
      anchor.href = file.content;
      anchor.download = downloadFileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } else {
      const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      anchor.href = url;
      anchor.download = downloadFileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  }, [activeProject]);

  // Update Project Meta (title and description)
  const updateProjectMeta = useCallback((projectId: string, updates: { title?: string; description?: string }) => {
    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== projectId) return proj;
        
        let nextFiles = proj.files;
        if (updates.title || updates.description) {
          nextFiles = nextFiles.map(file => {
            if (file.name === 'package.json') {
              try {
                const pkg = JSON.parse(file.content);
                if (updates.title) pkg.name = updates.title.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '') || 'project';
                if (updates.description) pkg.description = updates.description;
                return { ...file, content: JSON.stringify(pkg, null, 2) + '\n' };
              } catch {
                return file;
              }
            }
            if (file.name === 'README.md') {
              let content = file.content;
              if (updates.title) {
                if (content.match(/^#\s+.*/m)) {
                  content = content.replace(/^#\s+.*/m, `# ${updates.title}`);
                } else {
                  content = `# ${updates.title}\n\n` + content;
                }
              }
              if (updates.description) {
                // If there's a blockquote right after the title, replace it, else insert it
                if (content.match(/^#\s+.*\n\n> .*/m)) {
                  content = content.replace(/^#\s+(.*)\n\n> .*/m, `# $1\n\n> ${updates.description}`);
                } else if (content.match(/^#\s+.*/m)) {
                  content = content.replace(/^#\s+(.*)/m, `# $1\n\n> ${updates.description}`);
                }
              }
              return { ...file, content };
            }
            return file;
          });
        }

        return {
          ...proj,
          updatedAt: Date.now(),
          ...updates,
          files: nextFiles
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, []);

  // Update Project Git Remote Configuration
  const updateProjectGitConfig = useCallback((projectId: string, gitConfig: GitRepoConfig) => {
    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== projectId) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          gitConfig
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, []);

  // Update Project Files and Folders from Git Pull
  const updateProjectFilesFromGit = useCallback(
    (projectId: string, files: ProjectFile[], folders: string[], commitSha: string) => {
      setProjects((prev) => {
        const next = prev.map((proj) => {
          if (proj.id !== projectId) return proj;
          const entryFile = files.find((f) => f.isEntry) || files[0];
          return {
            ...proj,
            updatedAt: Date.now(),
            files,
            folders,
            activeFileId: entryFile ? entryFile.id : files[0]?.id || '',
            gitConfig: proj.gitConfig
              ? {
                  ...proj.gitConfig,
                  lastSyncedAt: Date.now(),
                  lastCommitSha: commitSha
                }
              : undefined
          };
        });
        saveStoredProjects(next);
        return next;
      });
    },
    []
  );

  // Update packages / dependencies in active project
  const updateProjectPackages = useCallback((pipPackages: string[], npmPackages: string[]) => {
    if (!activeProject) return;
    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          packages: pipPackages,
          npmPackages: npmPackages
        };
      });
      saveStoredProjects(next);
      return next;
    });
  }, [activeProject?.id]);

  // Update Playground Language & Runtime
  const updatePlaygroundLanguage = useCallback((language: CodeLanguage, executionType: ExecutionType) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== 'playground') return p;
        return {
          ...p,
          language,
          executionType,
          hasSelectedLanguage: true,
          files: p.files.map((f) => ({
            ...f,
            language
          }))
        };
      })
    );
  }, []);

  // Reset Playground to initial state
  const resetPlayground = useCallback(() => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== 'playground') return p;
        return {
          ...PLAYGROUND_PROJECT,
          hasSelectedLanguage: false,
          updatedAt: Date.now()
        };
      })
    );
  }, []);

  // Create new project
  const createProject = useCallback((newProj: CodeProject) => {
    setProjects((prev) => {
      const next = [newProj, ...prev];
      saveStoredProjects(next);
      return next;
    });
    setActiveProjectId(newProj.id);
    saveStoredActiveId(newProj.id);
  }, []);

  // Duplicate project
  const duplicateProject = useCallback((id: string) => {
    if (id === 'playground') return;
    setProjects((prev) => {
      const target = prev.find((p) => p.id === id);
      if (!target) return prev;
      const dup: CodeProject = {
        ...target,
        id: 'proj-' + Date.now(),
        title: `${target.title} (副本)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        files: target.files.map((f) => ({
          ...f,
          id: 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5)
        }))
      };
      dup.activeFileId = dup.files[0].id;
      const next = [dup, ...prev];
      saveStoredProjects(next);
      return next;
    });
  }, []);

  // Delete project
  const deleteProject = useCallback((id: string) => {
    if (id === 'playground') return;
    setProjects((prev) => {
      const remaining = prev.filter((p) => p.id !== id);
      const nextActiveId = remaining.length > 0 ? (activeProjectId === id ? remaining[0].id : activeProjectId) : '';
      setActiveProjectId(nextActiveId);
      saveStoredProjects(remaining);
      saveStoredActiveId(nextActiveId);
      return remaining;
    });
  }, [activeProjectId]);

  // Reset factory defaults
  const resetFactoryDefaults = useCallback(() => {
    setProjects(DEFAULT_PROJECTS);
    setActiveProjectId(DEFAULT_PROJECTS[0].id);
    saveStoredProjects(DEFAULT_PROJECTS);
    saveStoredActiveId(DEFAULT_PROJECTS[0].id);
  }, []);

  // Add individual log item
  const addLog = useCallback((log: ConsoleLogItem) => {
    setExecutionResult((prev) => ({
      ...prev,
      logs: [...prev.logs, log]
    }));
  }, []);

  // Clear logs
  const clearLogs = useCallback(() => {
    setExecutionResult((prev) => ({
      ...prev,
      logs: [],
      error: undefined,
      returnValue: undefined
    }));
  }, []);

  // Run code execution
  const executeCode = useCallback(
    async (
      projectToRun?: CodeProject,
      onInputPrompt?: (promptText: string) => Promise<string>,
      onNotice?: (msg: string) => void
    ) => {
      const proj = projectToRun || activeProject;
      if (!proj) return;
      setIsExecuting(true);
      clearLogs();

      const defaultInputPrompt = async (promptText: string) => {
        return window.prompt(promptText || '请输入内容:') || '';
      };

      const promptHandler = onInputPrompt || defaultInputPrompt;

      // 1. Resolve entry file for this project
      const entryFile = getProjectEntryFile(proj.files);

      // 2. Resolve runtime based strictly on entry file type
      const resolution = resolveRuntimeFromEntryFile(entryFile);

      if (!resolution.supported || !resolution.entryFile || !resolution.runtime) {
        const errorMsg = resolution.reason || `暂不支持运行入口文件 "${entryFile?.name || '未知'}"。`;
        
        clearLogs();
        addLog({
          id: 'err-unsupported-' + Date.now(),
          level: 'error',
          message: errorMsg,
          timestamp: Date.now()
        });

        setExecutionResult({
          status: 'error',
          error: {
            message: errorMsg
          },
          executionTimeMs: 0,
          logs: [
            {
              id: 'log-err-' + Date.now(),
              level: 'error',
              message: errorMsg,
              timestamp: Date.now()
            }
          ]
        });

        setIsExecuting(false);
        if (onNotice) {
          onNotice(errorMsg);
        }
        return;
      }

      // Synchronize executionType if it differs
      if (proj.executionType !== resolution.runtime) {
        setProjects((prev) => {
          const next = prev.map((p) => (p.id === proj.id ? { ...p, executionType: resolution.runtime! } : p));
          saveStoredProjects(next);
          return next;
        });
      }

      const targetFile = resolution.entryFile;

      const result = await languageRegistry.execute({
        file: targetFile,
        files: proj.files,
        packages: proj.packages,
        npmPackages: proj.npmPackages,
        promptHandler,
        onLog: addLog,
        pythonEngine: settings.pythonEngine || 'auto'
      });
      setExecutionResult(result);

      setIsExecuting(false);
    },
    [activeProject, settings.pythonEngine, addLog, clearLogs]
  );

  return {
    projects,
    activeProject,
    activeProjectId,
    settings,
    isExecuting,
    executionResult,
    selectProject,
    updateFileContent,
    updateProjectPackages,
    selectFile,
    addNewFile,
    addUploadedFiles,
    addNewFolder,
    deleteFolder,
    renameFolder,
    moveFolder,
    copyFolder,
    deleteFile,
    renameFile,
    moveFile,
    copyFile,
    updateFileEncoding,
    setEntryFile,
    downloadSingleFile,
    updateProjectGitConfig,
    updateProjectFilesFromGit,
    createProject,
    duplicateProject,
    deleteProject,
    updateProjectMeta,
    resetFactoryDefaults,
    updateSettings,
    updatePlaygroundLanguage,
    resetPlayground,
    executeCode,
    addLog,
    clearLogs
  };
}
