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
  /** 当前行高亮 */
  highlightActiveLine?: boolean;
  /** 代码折叠 */
  codeFolding?: boolean;
  /** 滚动时在顶部驻留当前缩进块（VSCode 风格 Sticky Scroll） */
  stickyScroll?: boolean;
}

export type NotificationLevel = 'info' | 'warning' | 'error';

// 新城云通知系统公开 API 单条通知（文档 v1.1）
export interface AppNotification {
  id: string;
  title: string;
  content: string;
  level: NotificationLevel;
  /** ISO 时间，空字符串表示不限 */
  startAt: string;
  endAt: string;
  /** 操作按钮文案，空字符串表示无按钮 */
  buttonText: string;
  buttonUrl: string;
  /** 排序值，越小越靠前 */
  order: number;
  /** 通知类型（6 种，见通知系统接入文档） */
  type: string;
}
