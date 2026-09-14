import React, { useState } from 'react';
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
import { SingleFileBundleModal } from './components/SingleFileBundleModal';
import { PackageManagerModal } from './components/PackageManagerModal';
import { GitCloneModal } from './components/GitCloneModal';
import { GitPushModal } from './components/GitPushModal';
import { Toast } from './components/Toast';
import { loadStoredActiveTab, saveStoredActiveTab } from './services/storage';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => loadStoredActiveTab());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSingleFileModalOpen, setIsSingleFileModalOpen] = useState(false);
  const [isPackageManagerOpen, setIsPackageManagerOpen] = useState(false);
  const [isGitCloneOpen, setIsGitCloneOpen] = useState(false);
  const [isGitPushOpen, setIsGitPushOpen] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

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
    deleteFile,
    renameFile,
    moveFile,
    copyFile,
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
    executeCode,
    addLog,
    clearLogs
  } = useProjects();

  const handleSelectAndOpenProject = (id: string) => {
    selectProject(id);
    setActiveTab('code');
  };

  const handleRunProjectDirect = (id: string) => {
    selectProject(id);
    setActiveTab('run');
    const target = projects.find(p => p.id === id);
    if (target) {
      executeCode(target, undefined, (msg) => setToastMessage(msg));
    }
  };

  const handleRunCode = (onPrompt?: (promptMsg: string) => Promise<string>) => {
    executeCode(undefined, onPrompt, (msg) => setToastMessage(msg));
  };

  const handleTabChange = (tab: ActiveTab) => {
    if ((tab === 'code' || tab === 'run') && projects.length === 0) {
      setToastMessage('暂无项目，请先新建一个项目');
      return;
    }
    setActiveTab(tab);
  };

  React.useEffect(() => {
    if (!activeProject && activeTab !== 'projects') {
      setActiveTab('projects');
    }
  }, [activeProject, activeTab]);

  return (
    <div id="app-root" className="flex flex-col w-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)] select-none">
      {/* Header */}
      <Header
        activeProject={activeProject}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 flex overflow-hidden relative">
        <AnimatePresence mode="wait">
          {/* Projects / Files Explorer View */}
          {activeTab === 'projects' && (
            <motion.div
              key="tab-projects"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
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
                onDeleteFile={deleteFile}
                onRenameFile={renameFile}
                onMoveFile={moveFile}
                onCopyFile={copyFile}
                onSetEntryFile={setEntryFile}
                onDownloadFile={downloadSingleFile}
                onSwitchToCodeTab={() => setActiveTab('code')}
                onOpenSingleFileBundle={() => setIsSingleFileModalOpen(true)}
                onOpenPackageManager={() => setIsPackageManagerOpen(true)}
                onOpenGitClone={() => setIsGitCloneOpen(true)}
                onOpenGitPush={() => setIsGitPushOpen(true)}
              />
            </motion.div>
          )}

          {/* Code Editor View */}
          {activeTab === 'code' && activeProject && (
            <motion.div
              key="tab-code"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="flex-1 flex overflow-hidden w-full h-full"
            >
              <CodeEditor
                project={activeProject}
                settings={settings}
                onUpdateFileContent={updateFileContent}
                onSelectFile={selectFile}
                onAddNewFile={addNewFile}
                onDeleteFile={deleteFile}
                onRenameFile={renameFile}
                onMoveFile={moveFile}
                onCopyFile={copyFile}
                onSetEntryFile={setEntryFile}
                onDownloadFile={downloadSingleFile}
                onOpenGitPush={() => setIsGitPushOpen(true)}
                onRunCode={() => {
                  setActiveTab('run');
                  handleRunCode();
                }}
              />
            </motion.div>
          )}

          {/* Code Runner & Console View */}
          {activeTab === 'run' && activeProject && (
            <motion.div
              key="tab-run"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="flex-1 flex overflow-hidden w-full h-full"
            >
              <CodeRunner
                project={activeProject}
                executionResult={executionResult}
                isExecuting={isExecuting}
                onRunCode={handleRunCode}
                onClearLogs={clearLogs}
                onAddLog={addLog}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      {!isKeyboardOpen && (
        <BottomNav
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          hasErrors={executionResult.status === 'error' || executionResult.logs.some(l => l.level === 'error')}
        />
      )}

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

      <SingleFileBundleModal
        isOpen={isSingleFileModalOpen}
        onClose={() => setIsSingleFileModalOpen(false)}
        project={activeProject}
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

      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
    </div>
  );
}
