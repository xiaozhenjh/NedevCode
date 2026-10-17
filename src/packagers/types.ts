import { CodeLanguage, CodeProject } from '../types';
import { BuildStepItem } from '../services/buildHistoryService';

export type { BuildStepItem };

export interface PackagingProgress {
  step: string;
  percent: number;
  status: 'idle' | 'running' | 'success' | 'error';
  log?: string;
  downloadUrl?: string;
  downloadName?: string;
  githubRunUrl?: string;
  steps?: BuildStepItem[];
  allLogs?: string;
}

export interface PackagerResult {
  blob?: Blob;
  filename: string;
  githubRunUrl?: string;
  downloadUrl?: string;
  message?: string;
  logs?: string;
  steps?: BuildStepItem[];
  isTemporaryRepo?: boolean;
  repoName?: string;
  artifactSize?: number;
}

export interface PackagerFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'select' | 'boolean' | 'number';
  defaultValue: any;
  options?: Array<{ label: string; value: any }>;
  placeholder?: string;
  helpText?: string;
}

export interface PackagerOptions {
  token?: string;
  repoUrl?: string;
  branch?: string;
  target?: string;
  appName?: string;
  version?: string;
  entryFile?: string;
  isTemporaryRepo?: boolean;
  hasDeleteRepoPermission?: boolean;
  customRepoName?: string;
  extraConfig?: Record<string, any>;
  onUpdateGitConfig?: (gitConfig: NonNullable<CodeProject['gitConfig']>) => void;
  [key: string]: any;
}

export interface PackagerDefinition {
  id: string;
  name: string;
  description: string;
  category: 'local' | 'cloud';
  supportedLanguages: CodeLanguage[] | 'all';
  artifactExtension: string;
  icon: 'FileArchive' | 'Globe' | 'Box' | 'Smartphone' | 'FileCode' | 'Terminal' | 'Database' | 'BookOpen' | 'Package';
  fields?: PackagerFieldDefinition[];
  isAvailableForProject: (project: CodeProject) => boolean;
  package: (
    project: CodeProject,
    options: PackagerOptions,
    onProgress?: (progress: PackagingProgress) => void
  ) => Promise<PackagerResult>;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


