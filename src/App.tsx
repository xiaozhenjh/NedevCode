import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useProjects } from './hooks/useProjects';
import { ActiveTab } from './types';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ProjectList } from './components/ProjectList';
import { CodeEditor } from './components/CodeEditor';
import { CodeRunner } from './components/CodeRunner';
import { NewProjectModal } from './components/NewProjectModal';
import { SettingsModal } from './components/SettingsModal';
import { PackageManagerModal } from './components/PackageManagerModal';
import { GitCloneModal } from './components/GitCloneModal';
import { GitPushModal } from './components/GitPushModal';
import { LanguageSelectModal } from './components/LanguageSelectModal';
import { BuildPackageModal } from './components/BuildPackageModal';
import { Toast } from './components/Toast';
import { loadStoredActiveTab, saveStoredActiveTab } from './services/storage';
import { CodeLanguage, ExecutionType } from './types';
import { exportFolderToZip } from './utils/zipPackager';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => loadStoredActiveTab());
  const [slideDirection, setSlideDirection] = useState<number>(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const touchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);

  const tabOrder: ActiveTab[] = ['projects', 'code', 'run'];
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPackageManagerOpen, setIsPackageManagerOpen] = useState(false);
  const [isGitCloneOpen, setIsGitCloneOpen] = useState(false);
  const [isGitPushOpen, setIsGitPushOpen] = useState(false);
  const [isBuildPackageOpen, setIsBuildPackageOpen] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);

  React.useEffect(() => {
    let maxHeight = window.innerHeight;
    const rootEl = document.getElementById('app-root');
    const handler = () => {
      const currentHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      if (currentHeight > maxHeight) {
        maxHeight = currentHeight;
      }
      const isShrunk = currentHeight < maxHeight - 100;
      const isInputFocused = document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT';
      setIsKeyboardOpen(isShrunk && isInputFocused);
      
      if (rootEl) {
        rootEl.style.height = `${currentHeight}px`;
      }
    };
    
    // Initial set
    handler();

    window.addEventListener('resize', handler);
    window.visualViewport?.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.visualViewport?.removeEventListener('resize', handler);
    };
  }, []);

  React.useEffect(() => {
    saveStoredActiveTab(activeTab);
  }, [activeTab]);

  const {
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
    updateWholeProject,
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
  } = useProjects();

  const [isLangSelectOpen, setIsLangSelectOpen] = useState(false);

  const [promptRequest, setPromptRequest] = useState<{
    id: string;
    message: string;
    resolve: (val: string) => void;
  } | null>(null);

  const handleInputPrompt = useCallback((promptMsg: string): Promise<string> => {
    return new Promise((resolve) => {
      setPromptRequest({
        id: 'prompt-' + Date.now(),
        message: promptMsg || '请输入:',
        resolve
      });
    });
  }, []);

  const handlePromptSubmit = useCallback((value: string) => {
    if (promptRequest) {
      promptRequest.resolve(value);
      setPromptRequest(null);
    }
  }, [promptRequest]);

  // Clean up hanging prompt if execution finishes
  useEffect(() => {
    if (!isExecuting && promptRequest) {
      promptRequest.resolve('');
      setPromptRequest(null);
    }
  }, [isExecuting, promptRequest]);

  const handleSelectAndOpenProject = (id: string) => {
    selectProject(id);
    setActiveTab('code');
  };

  const handleRunProjectDirect = (id: string) => {
    selectProject(id);
    const target = projects.find(p => p.id === id);
    if (id === 'playground') {
      if (!target?.hasSelectedLanguage) {
        setIsLangSelectOpen(true);
        return;
      }
      setActiveTab('run');
      executeCode(target, handleInputPrompt, (msg) => setToastMessage(msg));
      return;
    }
    setActiveTab('run');
    if (target) {
      executeCode(target, handleInputPrompt, (msg) => setToastMessage(msg));
    }
  };

  const handleRunCode = (onPrompt?: (promptMsg: string) => Promise<string>) => {
    if (activeProject?.id === 'playground' && !activeProject.hasSelectedLanguage) {
      setIsLangSelectOpen(true);
      return;
    }
    setActiveTab('run');
    executeCode(undefined, onPrompt || handleInputPrompt, (msg) => setToastMessage(msg));
  };

  const handleSelectPlaygroundLanguage = (lang: CodeLanguage, executionType: ExecutionType) => {
    updatePlaygroundLanguage(lang, executionType);
  };

  const handleTabChange = (tab: ActiveTab) => {
    if ((tab === 'code' || tab === 'run') && projects.length === 0) {
      setToastMessage('暂无项目，请先新建一个项目');
      return;
    }
    const currentIndex = tabOrder.indexOf(activeTab);
    const newIndex = tabOrder.indexOf(tab);
    if (currentIndex !== -1 && newIndex !== -1 && currentIndex !== newIndex) {
      setSlideDirection(newIndex > currentIndex ? 1 : -1);
    }
    setActiveTab(tab);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;

    const start = touchStartRef.current;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const deltaTime = Date.now() - start.time;
    touchStartRef.current = null;

    if (
      deltaTime < 500 &&
      Math.abs(deltaX) > 50 &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.5
    ) {
      const target = e.target as HTMLElement | null;
      if (target) {
        // 1. Specifically prevent tab switching when swiping on the code/media editor areas
        const isCodeArea = target.closest('.code-editor-body, textarea, pre');
        if (isCodeArea) {
          return;
        }

        // 2. Prevent tab switching when swiping on ANY horizontally scrollable element
        const scrollable = target.closest('.overflow-x-auto, .overflow-x-scroll, .no-scrollbar, textarea, pre, [style*="overflow-x: auto"], [style*="overflow-x: scroll"]');
        if (scrollable) {
          // If the element is horizontally scrollable, disable tab switching entirely on it
          if (scrollable.scrollWidth > scrollable.clientWidth + 5) {
            return;
          }
        }
      }

      if (deltaX < 0) {
        // Swipe left -> next tab
        if (activeTab === 'projects') {
          if (projects.length === 0 || !activeProject) {
            setToastMessage('暂无项目，请先新建一个项目');
          } else {
            setSlideDirection(1);
            setActiveTab('code');
          }
        } else if (activeTab === 'code') {
          setSlideDirection(1);
          setActiveTab('run');
        }
      } else {
        // Swipe right -> prev tab
        if (activeTab === 'run') {
          setSlideDirection(-1);
          setActiveTab('code');
        } else if (activeTab === 'code') {
          setSlideDirection(-1);
          setActiveTab('projects');
        }
      }
    }
  };

  const tabMotionVariants = {
    initial: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? 30 : -30
    }),
    animate: {
      opacity: 1,
      x: 0
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? -30 : 30
    })
  };

  React.useEffect(() => {
    if (!activeProject && activeTab !== 'projects') {
      setActiveTab('projects');
    }
  }, [activeProject, activeTab]);

  React.useEffect(() => {
    if (activeTab !== 'code' && isEditorFullscreen) {
      setIsEditorFullscreen(false);
    }
  }, [activeTab, isEditorFullscreen]);

  return (
    <div id="app-root" className="flex flex-col w-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)] select-none">
      {/* Header */}
      <AnimatePresence>
        {!isEditorFullscreen && (
          <motion.div
            key="app-header"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden shrink-0"
          >
            <Header
              activeProject={activeProject}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenGitPush={() => setIsGitPushOpen(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main View Area */}
      <main
        className="flex-1 flex overflow-hidden relative touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait" custom={slideDirection}>
          {/* Projects / Files Explorer View */}
          {activeTab === 'projects' && (
            <motion.div
              key="tab-projects"
              custom={slideDirection}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={tabMotionVariants}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="flex-1 flex overflow-hidden w-full h-full"
            >
              <ProjectList
                projects={projects}
                activeProjectId={activeProjectId}
                onSelectProject={handleSelectAndOpenProject}
                onOpenNewModal={() => setIsNewModalOpen(true)}
                onDeleteProject={deleteProject}
                onDuplicateProject={duplicateProject}
                onUpdateProjectMeta={updateProjectMeta}
                onRunProjectDirect={handleRunProjectDirect}
                onSelectFile={selectFile}
                onAddNewFile={addNewFile}
                onAddUploadedFiles={addUploadedFiles}
                onAddNewFolder={addNewFolder}
                onDeleteFolder={deleteFolder}
                onRenameFolder={renameFolder}
                onMoveFolder={moveFolder}
                onCopyFolder={copyFolder}
                onDownloadFolderZip={(folderPath) => {
                  if (activeProject) {
                    exportFolderToZip(activeProject, folderPath);
                  }
                }}
                onDeleteFile={deleteFile}
                onRenameFile={renameFile}
                onMoveFile={moveFile}
                onCopyFile={copyFile}
                onUpdateFileEncoding={updateFileEncoding}
                onSetEntryFile={setEntryFile}
                onDownloadFile={downloadSingleFile}
                onUpdateFileContent={updateFileContent}
                onSwitchToCodeTab={() => {
                  setSlideDirection(1);
                  setActiveTab('code');
                }}
                onResetPlayground={resetPlayground}
                onOpenPackageManager={() => setIsPackageManagerOpen(true)}
                onOpenGitClone={() => setIsGitCloneOpen(true)}
                onOpenGitPush={() => setIsGitPushOpen(true)}
                onOpenBuildPackage={() => setIsBuildPackageOpen(true)}
              />
            </motion.div>
          )}

          {/* Code Editor View */}
          {activeTab === 'code' && activeProject && (
            <motion.div
              key="tab-code"
              custom={slideDirection}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={tabMotionVariants}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="flex-1 flex overflow-hidden w-full h-full"
            >
              <CodeEditor
                project={activeProject}
                settings={settings}
                isFullscreen={isEditorFullscreen}
                onToggleFullscreen={() => setIsEditorFullscreen(prev => !prev)}
                onUpdateFileContent={updateFileContent}
                onSelectFile={selectFile}
                onAddNewFile={addNewFile}
                onDeleteFile={deleteFile}
                onRenameFile={renameFile}
                onMoveFile={moveFile}
                onCopyFile={copyFile}
                onUpdateFileEncoding={updateFileEncoding}
                onSetEntryFile={setEntryFile}
                onDownloadFile={downloadSingleFile}
                onOpenGitPush={() => setIsGitPushOpen(true)}
                onOpenLangSelect={() => setIsLangSelectOpen(true)}
                onSelectPlaygroundLanguage={handleSelectPlaygroundLanguage}
                onRunCode={() => {
                  setSlideDirection(1);
                  setActiveTab('run');
                  handleRunCode(handleInputPrompt);
                }}
              />
            </motion.div>
          )}

          {/* Code Runner & Console View */}
          {activeTab === 'run' && activeProject && (
            <motion.div
              key="tab-run"
              custom={slideDirection}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={tabMotionVariants}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="flex-1 flex overflow-hidden w-full h-full"
            >
              <CodeRunner
                project={activeProject}
                executionResult={executionResult}
                isExecuting={isExecuting}
                onRunCode={handleRunCode}
                onClearLogs={clearLogs}
                onAddLog={addLog}
                promptRequest={promptRequest}
                onPromptSubmit={handlePromptSubmit}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <AnimatePresence>
        {!isKeyboardOpen && !isEditorFullscreen && (
          <motion.div
            key="bottom-nav"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden shrink-0"
          >
            <BottomNav
              activeTab={activeTab}
              setActiveTab={handleTabChange}
              hasErrors={executionResult.status === 'error' || executionResult.logs.some(l => l.level === 'error')}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <NewProjectModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onOpenGitClone={() => setIsGitCloneOpen(true)}
        onCreateProject={(newProj) => {
          createProject(newProj);
          setActiveTab('code');
        }}
      />

      <GitCloneModal
        isOpen={isGitCloneOpen}
        onClose={() => setIsGitCloneOpen(false)}
        onCloneSuccess={(newProj) => {
          createProject(newProj);
          setActiveTab('code');
        }}
      />

      <GitPushModal
        isOpen={isGitPushOpen}
        onClose={() => setIsGitPushOpen(false)}
        project={activeProject}
        onUpdateProjectGit={(projectId, gitConfig) => {
          updateProjectGitConfig(projectId, gitConfig);
        }}
        onPullSuccess={(projectId, files, folders, commitSha) => {
          updateProjectFilesFromGit(projectId, files, folders, commitSha);
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
      />

      {activeProject && (
        <PackageManagerModal
          isOpen={isPackageManagerOpen}
          onClose={() => setIsPackageManagerOpen(false)}
          project={activeProject}
          onUpdatePackages={(pipPkgs, npmPkgs) => {
            updateProjectPackages(pipPkgs, npmPkgs);
          }}
        />
      )}

      <LanguageSelectModal
        isOpen={isLangSelectOpen}
        onClose={() => setIsLangSelectOpen(false)}
        currentLanguage={activeProject?.language}
        onSelectLanguage={handleSelectPlaygroundLanguage}
      />

      <BuildPackageModal
        isOpen={isBuildPackageOpen}
        onClose={() => setIsBuildPackageOpen(false)}
        project={activeProject}
        onUpdateProject={(updatedProj) => {
          updateWholeProject(updatedProj);
        }}
        onShowToast={(msg) => setToastMessage(msg)}
      />

      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
    </div>
  );
}
