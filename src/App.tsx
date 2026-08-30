import React, { useState } from 'react';
import { useProjects } from './hooks/useProjects';
import { ActiveTab } from './types';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ProjectList } from './components/ProjectList';
import { CodeEditor } from './components/CodeEditor';
import { CodeRunner } from './components/CodeRunner';
import { NewProjectModal } from './components/NewProjectModal';
import { SettingsModal } from './components/SettingsModal';
import { PrivacyModal } from './components/PrivacyModal';
import { SingleFileBundleModal } from './components/SingleFileBundleModal';

const PRIVACY_KEY = 'privacy_policy_accepted_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('code');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSingleFileModalOpen, setIsSingleFileModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(() => {
    try {
      return localStorage.getItem(PRIVACY_KEY) !== 'true';
    } catch {
      return true;
    }
  });
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const handleAcceptPrivacy = () => {
    try {
      localStorage.setItem(PRIVACY_KEY, 'true');
    } catch {
      // ignore
    }
    setIsPrivacyModalOpen(false);
  };

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

  const {
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
      executeCode(target);
    }
  };

  const handleRunCode = () => {
    executeCode();
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
        {/* Projects / Files Explorer View */}
        {activeTab === 'projects' && (
          <ProjectList
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={handleSelectAndOpenProject}
            onOpenNewModal={() => setIsNewModalOpen(true)}
            onDeleteProject={deleteProject}
            onDuplicateProject={duplicateProject}
            onRunProjectDirect={handleRunProjectDirect}
            onSelectFile={selectFile}
            onAddNewFile={addNewFile}
            onAddNewFolder={addNewFolder}
            onDeleteFolder={deleteFolder}
            onDeleteFile={deleteFile}
            onSwitchToCodeTab={() => setActiveTab('code')}
            onOpenSingleFileBundle={() => setIsSingleFileModalOpen(true)}
          />
        )}

        {/* Code Editor View */}
        {activeTab === 'code' && activeProject && (
          <CodeEditor
            project={activeProject}
            settings={settings}
            onUpdateFileContent={updateFileContent}
            onSelectFile={selectFile}
            onAddNewFile={addNewFile}
            onDeleteFile={deleteFile}
            onRunCode={() => {
              setActiveTab('run');
              handleRunCode();
            }}
          />
        )}

        {/* Code Runner & Console View */}
        {activeTab === 'run' && activeProject && (
          <CodeRunner
            project={activeProject}
            executionResult={executionResult}
            isExecuting={isExecuting}
            onRunCode={handleRunCode}
            onClearLogs={clearLogs}
            onAddLog={addLog}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      {!isKeyboardOpen && (
        <BottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          hasErrors={executionResult.status === 'error' || executionResult.logs.some(l => l.level === 'error')}
        />
      )}

      {/* Modals */}
      <NewProjectModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onCreateProject={(newProj) => {
          createProject(newProj);
          setActiveTab('code');
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

      <PrivacyModal
        isOpen={isPrivacyModalOpen}
        onAccept={handleAcceptPrivacy}
      />
    </div>
  );
}
