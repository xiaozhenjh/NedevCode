import { useState, useEffect, useCallback } from 'react';
import {
  CodeProject,
  ProjectFile,
  EditorSettings,
  ExecutionResult,
  ConsoleLogItem,
  CodeLanguage
} from '../types';
import {
  loadStoredProjects,
  saveStoredProjects,
  loadStoredActiveId,
  saveStoredActiveId,
  loadStoredSettings,
  saveStoredSettings
} from '../services/storage';
import { DEFAULT_PROJECTS } from '../data/defaultProjects';
import { runJavaScriptSandbox, runPythonSandbox } from '../utils/codeRunner';

export function useProjects() {
  const [projects, setProjects] = useState<CodeProject[]>(() => loadStoredProjects());
  const [activeProjectId, setActiveProjectId] = useState<string>(() => loadStoredActiveId());
  const [settings, setSettings] = useState<EditorSettings>(() => loadStoredSettings());

  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult>({
    status: 'idle',
    logs: []
  });

  // Apply dark mode class to root document element
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  // Persist projects to localStorage
  useEffect(() => {
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
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          files: proj.files.map((file) =>
            file.id === fileId ? { ...file, content: newContent } : file
          )
        };
      })
    );
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

  // Add new file to active project
  const addNewFile = useCallback((name: string, language: CodeLanguage) => {
    if (!activeProject) return;
    const newFile: ProjectFile = {
      id: 'file-' + Date.now(),
      name,
      language,
      content: language === 'html' ? '<div></div>' : language === 'css' ? '/* CSS */' : '// New Script\n'
    };

    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          files: [...proj.files, newFile],
          activeFileId: newFile.id
        };
      })
    );
  }, [activeProject?.id]);

  // Add new folder without auto-generating dummy file
  const addNewFolder = useCallback((folderName: string) => {
    if (!activeProject) return;
    const cleanFolder = folderName.trim().replace(/^\/+|\/+$/g, '');
    if (!cleanFolder) return;
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        const existingFolders = proj.folders || [];
        if (existingFolders.includes(cleanFolder)) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          folders: [...existingFolders, cleanFolder]
        };
      })
    );
  }, [activeProject?.id]);

  // Delete folder from active project
  const deleteFolder = useCallback((folderPath: string) => {
    if (!activeProject) return;
    const cleanFolder = folderPath.trim().replace(/^\/+|\/+$/g, '');
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        const nextFolders = (proj.folders || []).filter(f => f !== cleanFolder && !f.startsWith(cleanFolder + '/'));
        const remainingFiles = proj.files.filter(f => !f.name.startsWith(cleanFolder + '/'));
        if (remainingFiles.length === 0) {
          // If all files deleted, keep at least one default
          const defaultFile: ProjectFile = {
            id: 'file-' + Date.now(),
            name: 'main.js',
            language: 'javascript',
            content: '// Main\n'
          };
          return {
            ...proj,
            updatedAt: Date.now(),
            folders: nextFolders,
            files: [defaultFile],
            activeFileId: defaultFile.id
          };
        }
        return {
          ...proj,
          updatedAt: Date.now(),
          folders: nextFolders,
          files: remainingFiles,
          activeFileId: remainingFiles.some(f => f.id === proj.activeFileId) ? proj.activeFileId : remainingFiles[0].id
        };
      })
    );
  }, [activeProject?.id]);

  // Delete file from active project
  const deleteFile = useCallback((fileId: string) => {
    if (!activeProject) return;
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id !== activeProject.id) return proj;
        const remaining = proj.files.filter((f) => f.id !== fileId);
        if (remaining.length === 0) return proj;
        return {
          ...proj,
          updatedAt: Date.now(),
          files: remaining,
          activeFileId: proj.activeFileId === fileId ? remaining[0].id : proj.activeFileId
        };
      })
    );
  }, [activeProject?.id]);

  // Create new project
  const createProject = useCallback((newProj: CodeProject) => {
    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(newProj.id);
  }, []);

  // Duplicate project
  const duplicateProject = useCallback((id: string) => {
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
      return [dup, ...prev];
    });
  }, []);

  // Delete project
  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => {
      const remaining = prev.filter((p) => p.id !== id);
      const nextActiveId = remaining.length > 0 ? (activeProjectId === id ? remaining[0].id : activeProjectId) : '';
      setActiveProjectId(nextActiveId);
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
  const executeCode = useCallback(async (projectToRun?: CodeProject) => {
    const proj = projectToRun || activeProject;
    setIsExecuting(true);

    if (proj.executionType === 'python-sandbox' || proj.language === 'python') {
      const entryFile = proj.files.find((f) => f.isEntry || f.name.endsWith('.py')) || proj.files[0];
      const result = await runPythonSandbox(entryFile.content, (log) => {
        addLog(log);
      });
      setExecutionResult(result);
    } else if (proj.executionType === 'js-sandbox') {
      const entryFile = proj.files.find((f) => f.isEntry) || proj.files[0];
      const result = await runJavaScriptSandbox(entryFile.content, (log) => {
        addLog(log);
      });
      setExecutionResult(result);
    } else {
      // HTML preview sandbox
      clearLogs();
      addLog({
        id: 'sys-start-' + Date.now(),
        level: 'system',
        message: '正在构建并装载 Web UI 运行沙箱...',
        timestamp: Date.now()
      });

      setTimeout(() => {
        setExecutionResult((prev) => ({
          ...prev,
          status: 'success',
          executionTimeMs: 12
        }));
        addLog({
          id: 'sys-ok-' + Date.now(),
          level: 'info',
          message: '沙箱装载完成，界面渲染运行中。',
          timestamp: Date.now()
        });
      }, 150);
    }

    setIsExecuting(false);
  }, [activeProject, addLog, clearLogs]);

  return {
    projects,
    activeProject,
    activeProjectId,
    settings,
    isExecuting,
    executionResult,
    selectProject,
    updateFileContent,
    selectFile,
    addNewFile,
    addNewFolder,
    deleteFolder,
    deleteFile,
    createProject,
    duplicateProject,
    deleteProject,
    resetFactoryDefaults,
    updateSettings,
    executeCode,
    addLog,
    clearLogs
  };
}
