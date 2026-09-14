import { CodeProject, EditorSettings } from '../types';
import { DEFAULT_PROJECTS } from '../data/defaultProjects';

export const STORAGE_KEY_PROJECTS = 'ark_code_studio_projects_v1';
export const STORAGE_KEY_ACTIVE_ID = 'ark_code_studio_active_id_v1';
export const STORAGE_KEY_SETTINGS = 'ark_code_studio_settings_v1';
export const STORAGE_KEY_ACTIVE_TAB = 'ark_code_studio_active_tab_v1';
export const STORAGE_KEY_OPEN_FOLDERS = 'ark_code_studio_open_folders_v1';

export const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 14,
  lineNumbers: true,
  tabSize: 2,
  autoRunOnEdit: false,
  wrapLines: true,
  theme: 'light',
  pythonEngine: 'auto'
};

const OLD_DEFAULT_IDS = new Set([
  'ui-components-demo',
  'physics-canvas-engine',
  'algo-playground',
  'calculator-demo',
  'python-stats-demo',
  'markdown-guide-demo'
]);

// Request persistent storage permission in WebView / mobile browsers to prevent background eviction
if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// Durable IndexedDB backing layer for Android WebView persistence
const IDB_NAME = 'ark_code_studio_db_v1';
const IDB_STORE = 'keyval';

function openIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbSet(key: string, val: unknown): Promise<void> {
  try {
    const db = await openIDB();
    if (!db) return;
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
  } catch {}
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export function loadStoredProjects(): CodeProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (!raw) {
      return DEFAULT_PROJECTS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Filter out legacy demo projects only
      const validStored = parsed.filter(
        (p) => p && p.id && !OLD_DEFAULT_IDS.has(p.id)
      );
      if (validStored.length > 0) {
        // Ensure any missing default project is appended without overwriting user changes to existing projects
        const existingIds = new Set(validStored.map((p) => p.id));
        const missingDefaults = DEFAULT_PROJECTS.filter((p) => !existingIds.has(p.id));
        return [...validStored, ...missingDefaults];
      }
    }
  } catch (e) {
    console.warn('Failed to load stored projects:', e);
  }
  return DEFAULT_PROJECTS;
}

export async function loadStoredProjectsAsync(): Promise<CodeProject[]> {
  const local = loadStoredProjects();
  if (local && local.length > 0 && local !== DEFAULT_PROJECTS) {
    return local;
  }
  // Try recovery from IndexedDB (critical for Android WebView after background termination)
  try {
    const fromIdb = await idbGet<CodeProject[]>(STORAGE_KEY_PROJECTS);
    if (fromIdb && Array.isArray(fromIdb) && fromIdb.length > 0) {
      const validStored = fromIdb.filter((p) => p && p.id && !OLD_DEFAULT_IDS.has(p.id));
      if (validStored.length > 0) {
        // Re-seed localStorage so synchronous reads continue to work
        saveStoredProjects(validStored);
        const existingIds = new Set(validStored.map((p) => p.id));
        const missingDefaults = DEFAULT_PROJECTS.filter((p) => !existingIds.has(p.id));
        return [...validStored, ...missingDefaults];
      }
    }
  } catch {}
  return local;
}

export function saveStoredProjects(projects: CodeProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.error('Failed to save projects to localStorage:', e);
  }
  // Dual write to IndexedDB for WebView crash & kill resilience
  idbSet(STORAGE_KEY_PROJECTS, projects);
}

export function loadStoredActiveId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
    if (raw) return raw;
  } catch {}
  return '';
}

export function saveStoredActiveId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_ID, id);
  } catch {}
  idbSet(STORAGE_KEY_ACTIVE_ID, id);
}

export function loadStoredSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveStoredSettings(settings: EditorSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch {}
  idbSet(STORAGE_KEY_SETTINGS, settings);
}

export function loadStoredActiveTab(): any {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_TAB);
    if (raw === 'projects' || raw === 'code' || raw === 'run') {
      return raw;
    }
  } catch {}
  return 'code';
}

export function saveStoredActiveTab(tab: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, tab);
  } catch {}
  idbSet(STORAGE_KEY_ACTIVE_TAB, tab);
}

export function loadStoredOpenFolders(projectId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_OPEN_FOLDERS}_${projectId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return {};
}

export function saveStoredOpenFolders(projectId: string, folders: Record<string, boolean>): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_OPEN_FOLDERS}_${projectId}`, JSON.stringify(folders));
  } catch {}
  idbSet(`${STORAGE_KEY_OPEN_FOLDERS}_${projectId}`, folders);
}

export function exportProjectToJson(project: CodeProject): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(project, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `${project.title.replace(/\s+/g, '_')}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
