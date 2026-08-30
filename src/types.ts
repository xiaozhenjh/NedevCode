export type CodeLanguage = 'javascript' | 'typescript' | 'html' | 'css' | 'json' | 'python';

export type ExecutionType = 'js-sandbox' | 'html-preview' | 'python-sandbox' | 'canvas-animation' | 'ui-interactive';

export interface ProjectFile {
  id: string;
  name: string;
  language: CodeLanguage;
  content: string;
  isEntry?: boolean;
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

export interface EditorSettings {
  fontSize: number;
  lineNumbers: boolean;
  tabSize: number;
  autoRunOnEdit: boolean;
  wrapLines: boolean;
  theme: 'light' | 'dark';
}
