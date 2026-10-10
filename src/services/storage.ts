import { CodeProject, EditorSettings } from '../types';
import { DEFAULT_PROJECTS, PLAYGROUND_PROJECT } from '../data/defaultProjects';
import { isMediaFile } from '../utils/fileUtils';

export const STORAGE_KEY_PROJECTS = 'ark_code_studio_projects_v1';
export const STORAGE_KEY_ACTIVE_ID = 'ark_code_studio_active_id_v1';
export const STORAGE_KEY_SETTINGS = 'ark_code_studio_settings_v1';
export const STORAGE_KEY_ACTIVE_TAB = 'ark_code_studio_active_tab_v1';
export const STORAGE_KEY_OPEN_FOLDERS = 'ark_code_studio_open_folders_v1';

export const IDB_PLACEHOLDER_MARKER = '[IDB_STORED]';

export const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 14,
  lineNumbers: true,
  tabSize: 2,
  autoRunOnEdit: false,
  wrapLines: true,
  theme: 'light',
  pythonEngine: 'auto',
  autoIndent: true,
  formatOnPaste: true
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

// Durable IndexedDB backing layer for unlimited storage quota
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

export function idbSet(key: string, val: unknown): Promise<boolean> {
  return new Promise(async (resolve) => {
    try {
      const db = await openIDB();
      if (!db) {
        resolve(false);
        return;
      }
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      tx.objectStore(IDB_STORE).put(val, key);
    } catch {
      resolve(false);
    }
  });
}

export function idbGet<T>(key: string): Promise<T | null> {
  return new Promise(async (resolve) => {
    try {
      const db = await openIDB();
      if (!db) {
        resolve(null);
        return;
      }
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function saveLightweightProjectsToLocalStorage(projects: CodeProject[]): void {
  try {
    const lightweight = projects.map((p) => ({
      ...p,
      files: p.files.map((f) => {
        // Offload large files (>10KB), base64 data URLs, and media files from localStorage
        if (
          (f.content && f.content.length > 10000) ||
          (f.content && f.content.startsWith('data:')) ||
          isMediaFile(f.name, f.content)
        ) {
          return {
            ...f,
            content: IDB_PLACEHOLDER_MARKER
          };
        }
        return f;
      })
    }));
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(lightweight));
  } catch {
    // If even lightweight projects exceed quota, remove the key so other operations are not blocked
    try {
      localStorage.removeItem(STORAGE_KEY_PROJECTS);
    } catch {}
  }
}

export function loadStoredProjects(): CodeProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (!raw) {
      return [PLAYGROUND_PROJECT, ...DEFAULT_PROJECTS];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Filter out playground and legacy demo projects
      const validStored = parsed.filter(
        (p) => p && p.id && p.id !== 'playground' && !OLD_DEFAULT_IDS.has(p.id)
      );
      if (validStored.length > 0) {
        const existingIds = new Set(validStored.map((p) => p.id));
        const missingDefaults = DEFAULT_PROJECTS.filter((p) => !existingIds.has(p.id));
        return [PLAYGROUND_PROJECT, ...validStored, ...missingDefaults];
      }
    }
  } catch {
    // Silently fall back to defaults
  }
  return [PLAYGROUND_PROJECT, ...DEFAULT_PROJECTS];
}

export async function loadStoredProjectsAsync(): Promise<CodeProject[] | null> {
  // Authoritative load from IndexedDB (has complete media files, videos, images, and code)
  try {
    const fromIdb = await idbGet<CodeProject[]>(STORAGE_KEY_PROJECTS);
    if (fromIdb && Array.isArray(fromIdb) && fromIdb.length > 0) {
      const validStored = fromIdb.filter(
        (p) => p && p.id && p.id !== 'playground' && !OLD_DEFAULT_IDS.has(p.id)
      );
      if (validStored.length > 0) {
        const existingIds = new Set(validStored.map((p) => p.id));
        const missingDefaults = DEFAULT_PROJECTS.filter((p) => !existingIds.has(p.id));
        return [PLAYGROUND_PROJECT, ...validStored, ...missingDefaults];
      }
    }
  } catch {}
  return null;
}

let _saveTimeout: any = null;
let _pendingProjectsToSave: CodeProject[] | null = null;

function executeSaveStoredProjects(projects: CodeProject[]): void {
  // Playground is strictly memory-only and never saved to persistent storage
  const persistentProjects = projects.filter((p) => p && p.id && p.id !== 'playground');

  // 1. Dual-write full project data with complete media files to IndexedDB (unlimited quota)
  idbSet(STORAGE_KEY_PROJECTS, persistentProjects);

  // 2. Safe write to localStorage without stringifying large media payloads upfront
  let hasLargeOrMedia = false;
  for (const p of persistentProjects) {
    for (const f of p.files) {
      if ((f.content && f.content.length > 10000) || isMediaFile(f.name, f.content)) {
        hasLargeOrMedia = true;
        break;
      }
    }
    if (hasLargeOrMedia) break;
  }

  if (hasLargeOrMedia) {
    saveLightweightProjectsToLocalStorage(persistentProjects);
  } else {
    try {
      const rawJson = JSON.stringify(persistentProjects);
      if (rawJson.length > 500000) {
        saveLightweightProjectsToLocalStorage(persistentProjects);
      } else {
        localStorage.setItem(STORAGE_KEY_PROJECTS, rawJson);
      }
    } catch {
      saveLightweightProjectsToLocalStorage(persistentProjects);
    }
  }
}

export function saveStoredProjects(projects: CodeProject[], immediate = false): void {
  _pendingProjectsToSave = projects;

  if (immediate) {
    if (_saveTimeout) clearTimeout(_saveTimeout);
    _saveTimeout = null;
    executeSaveStoredProjects(projects);
    return;
  }

  if (_saveTimeout) return;
  _saveTimeout = setTimeout(() => {
    _saveTimeout = null;
    if (_pendingProjectsToSave) {
      executeSaveStoredProjects(_pendingProjectsToSave);
      _pendingProjectsToSave = null;
    }
  }, 80);
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
