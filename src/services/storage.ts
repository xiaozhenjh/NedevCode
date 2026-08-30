import { CodeProject, EditorSettings } from '../types';
import { DEFAULT_PROJECTS } from '../data/defaultProjects';

const STORAGE_KEY_PROJECTS = 'ark_code_studio_projects_v1';
const STORAGE_KEY_ACTIVE_ID = 'ark_code_studio_active_id_v1';
const STORAGE_KEY_SETTINGS = 'ark_code_studio_settings_v1';

export const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 14,
  lineNumbers: true,
  tabSize: 2,
  autoRunOnEdit: false,
  wrapLines: true,
  theme: 'light'
};

export function loadStoredProjects(): CodeProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to load stored projects:', e);
  }
  return [];
}

export function saveStoredProjects(projects: CodeProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.error('Failed to save projects:', e);
  }
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
