import { CodeLanguage, ConsoleLogItem, ExecutionResult, ExecutionType, ProjectFile, PythonEnginePreference } from '../types';

export interface Token {
  type: 'keyword' | 'string' | 'number' | 'comment' | 'function' | 'tag' | 'attr' | 'operator' | 'punctuation' | 'text';
  content: string;
}

export interface SuggestionItem {
  label: string;
  type: 'keyword' | 'builtin' | 'identifier' | 'snippet';
  detail?: string;
  insertText?: string;
}

export interface ExecutionContext {
  file: ProjectFile;
  files: ProjectFile[];
  packages?: string[];
  npmPackages?: string[];
  promptHandler?: (promptText: string) => Promise<string>;
  onLog: (log: ConsoleLogItem) => void;
  pythonEngine?: PythonEnginePreference;
}

export interface EntryRuntimeResolution {
  supported: boolean;
  runtime?: ExecutionType;
  entryFile?: ProjectFile;
  reason?: string;
}

export type LanguageRunner = (context: ExecutionContext) => Promise<ExecutionResult>;

export interface LanguageDefinition {
  /** Unique language identifier (matches CodeLanguage) */
  id: CodeLanguage;

  /** Human-readable display name (e.g., 'JavaScript', 'Python') */
  name: string;

  /** File extensions associated with this language (including dot, e.g., ['.js', '.jsx']) */
  extensions: string[];

  /** Exact filenames associated with this language (e.g., ['Makefile', 'Dockerfile']) */
  filenames?: string[];

  /** Priority file names when searching for project entry file (e.g., ['main.py', 'index.py']) */
  entryPriorities?: string[];

  /** Runtime execution type in the runner environment (e.g., 'js-sandbox', 'python-sandbox') */
  executionType?: ExecutionType;

  /** Whether this language can be directly executed as an entry point. Defaults to true if runner or executionType is provided. */
  runnable?: boolean;

  /** Custom message when the user attempts to run this as entry file if not runnable */
  unsupportedReason?: string | ((file: ProjectFile) => string);

  /** Whether this language uses rich visual preview (HTML, Markdown) instead of console only */
  hasPreview?: boolean;

  /** Tokenizer for syntax highlighting */
  tokenize?: (code: string) => Token[];

  /** Code completion keywords and snippets */
  suggestions?: SuggestionItem[];

  /** Code formatting logic */
  format?: (code: string) => string;

  /** Sandbox execution runner */
  runner?: LanguageRunner;
}
