export type CodeLanguage = 'javascript' | 'typescript' | 'html' | 'css' | 'json' | 'python' | 'markdown' | 'plaintext' | 'shell' | 'sql';

export type ExecutionType =
  | 'js-sandbox'
  | 'html-preview'
  | 'python-sandbox'
  | 'canvas-animation'
  | 'ui-interactive'
  | 'markdown-preview'
  | 'shell-sandbox'
  | 'sql-sandbox'
  | 'json-sandbox';

export interface ProjectFile {
  id: string;
  name: string;
  language: CodeLanguage;
  content: string;
  isEntry?: boolean;
  path?: string;
}

export type GitProvider = 'github' | 'gitlab';

export interface GitRepoConfig {
  provider: GitProvider;
  repoUrl: string;
  owner: string;
  repo: string;
  branch: string;
  token?: string;
  customDomain?: string;
  lastSyncedAt?: number;
  lastCommitSha?: string;
  lastCommitMessage?: string;
}

export interface CodeProject {
  id: string;
  title: string;
  description: string;
  language: CodeLanguage;
  executionType: ExecutionType;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  files: ProjectFile[];
  folders?: string[];
  packages?: string[]; // Python pip packages (e.g., numpy, pandas, matplotlib, sympy, requests)
  npmPackages?: string[]; // NPM CDN packages (e.g., lodash, dayjs, axios, mathjs)
  gitConfig?: GitRepoConfig;
  activeFileId: string;
}

export type ConsoleLogLevel = 'log' | 'info' | 'warn' | 'error' | 'system';

export interface ConsoleLogItem {
  id: string;
  level: ConsoleLogLevel;
  message: string;
  timestamp: number;
  data?: unknown;
}

export interface ExecutionResult {
  status: 'idle' | 'running' | 'success' | 'error';
  executionTimeMs?: number;
  error?: {
    message: string;
    line?: number;
    column?: number;
    stack?: string;
  };
  logs: ConsoleLogItem[];
  returnValue?: unknown;
}

export type ActiveTab = 'projects' | 'code' | 'run';

export type PythonEnginePreference = 'auto' | 'wasm' | 'skulpt';

export interface EditorSettings {
  fontSize: number;
  lineNumbers: boolean;
  tabSize: number;
  autoRunOnEdit: boolean;
  wrapLines: boolean;
  theme: 'light' | 'dark' | 'system';
  pythonEngine?: PythonEnginePreference;
}
