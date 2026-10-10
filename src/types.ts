export type CodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'html'
  | 'css'
  | 'json'
  | 'python'
  | 'markdown'
  | 'plaintext'
  | 'shell'
  | 'sql'
  | (string & {});

export type ExecutionType =
  | 'js-sandbox'
  | 'html-preview'
  | 'python-sandbox'
  | 'canvas-animation'
  | 'ui-interactive'
  | 'markdown-preview'
  | 'shell-sandbox'
  | 'sql-sandbox'
  | 'json-sandbox'
  | (string & {});

export interface ProjectFile {
  id: string;
  name: string;
  language: CodeLanguage;
  content: string;
  isEntry?: boolean;
  path?: string;
  encoding?: string;
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

export interface GitSavedToken {
  id: string;
  label: string;
  provider: GitProvider;
  token: string;
  customDomain?: string;
  username?: string;
  avatarUrl?: string;
  createdAt: number;
}

export interface GitCommitItem {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorEmail?: string;
  authorAvatar?: string;
  date: string;
  url: string;
}

export interface GitBranchItem {
  name: string;
  isDefault?: boolean;
  protected?: boolean;
  commitSha?: string;
}

export type FileDiffStatus = 'added' | 'modified' | 'deleted' | 'unchanged';

export interface FileDiffItem {
  filePath: string;
  status: FileDiffStatus;
  oldContent?: string;
  newContent?: string;
  selectedForCommit: boolean;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_number: number;
  event: string;
}

export interface GitHubArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  url: string;
  archive_download_url: string;
  expired: boolean;
  created_at: string;
}

export interface GitHubReleaseItem {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  created_at: string;
  assets: Array<{
    id: number;
    name: string;
    size: number;
    download_count: number;
    browser_download_url: string;
  }>;
}

export interface CodeProject {
  id: string;
  title: string;
  description: string;
  language: CodeLanguage;
  executionType: ExecutionType;
  hasSelectedLanguage?: boolean;
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

export type ConsoleLogLevel = 'log' | 'info' | 'warn' | 'error' | 'system' | 'visual';

export interface VisualOutputData {
  type: 'image' | 'html' | 'canvas' | 'table' | 'alert' | 'gui' | 'hardware';
  title?: string;
  content: string; // URL, Base64 image, HTML string, or alert text
  columns?: string[];
  rows?: any[];
}

export interface ConsoleLogItem {
  id: string;
  level: ConsoleLogLevel;
  message: string;
  timestamp: number;
  data?: unknown;
  visual?: VisualOutputData;
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
  autoIndent?: boolean;
  formatOnPaste?: boolean;
}
