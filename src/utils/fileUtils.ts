import { CodeLanguage, ExecutionType, ProjectFile } from '../types';

export function detectLanguage(filename: string): CodeLanguage {
  const cleanName = (filename || '').toLowerCase().trim();
  if (cleanName.endsWith('.html') || cleanName.endsWith('.htm')) return 'html';
  if (cleanName.endsWith('.css')) return 'css';
  if (cleanName.endsWith('.json')) return 'json';
  if (cleanName.endsWith('.py')) return 'python';
  if (cleanName.endsWith('.ts') || cleanName.endsWith('.tsx')) return 'typescript';
  if (cleanName.endsWith('.js') || cleanName.endsWith('.jsx') || cleanName.endsWith('.mjs') || cleanName.endsWith('.cjs')) return 'javascript';
  if (cleanName.endsWith('.md') || cleanName.endsWith('.markdown')) return 'markdown';
  if (cleanName.endsWith('.sh') || cleanName.endsWith('.bash')) return 'shell';
  if (cleanName.endsWith('.sql')) return 'sql';
  
  // Default for unknown files
  return 'plaintext';
}

export function getFileSizeBytes(content: string): number {
  if (!content) return 0;
  return new Blob([content]).size;
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const LARGE_FILE_THRESHOLD_LINES = 500;
export const LARGE_FILE_THRESHOLD_BYTES = 40000;
export const LARGE_FILE_CHUNK_SIZE = 500;

export function isLargeFile(content: string, linesCount?: number): boolean {
  if (!content) return false;
  const count = linesCount !== undefined ? linesCount : content.split('\n').length;
  return count > LARGE_FILE_THRESHOLD_LINES || content.length > LARGE_FILE_THRESHOLD_BYTES;
}

export function detectExecutionTypeFromFiles(files: { name: string; language?: string }[]): ExecutionType {
  const hasHtml = files.some(f => f.name.endsWith('.html') || f.name.endsWith('.htm') || f.language === 'html');
  if (hasHtml) return 'html-preview';

  const hasPython = files.some(f => f.name.endsWith('.py') || f.language === 'python');
  if (hasPython) return 'python-sandbox';

  const hasMd = files.some(f => f.name.endsWith('.md') || f.name.endsWith('.markdown') || f.language === 'markdown');
  if (hasMd && (files.length === 1 || files.every(f => f.name.endsWith('.md') || f.name.endsWith('.markdown') || f.name.endsWith('.txt')))) {
    return 'markdown-preview';
  }

  const hasShell = files.some(f => f.name.endsWith('.sh') || f.name.endsWith('.bash') || f.language === 'shell');
  if (hasShell && files.length === 1) return 'shell-sandbox';

  const hasSql = files.some(f => f.name.endsWith('.sql') || f.language === 'sql');
  if (hasSql && files.length === 1) return 'sql-sandbox';

  const hasJson = files.some(f => f.name.endsWith('.json') || f.language === 'json');
  if (hasJson && files.length === 1) return 'json-sandbox';

  if (hasMd) return 'markdown-preview';

  return 'js-sandbox';
}

/**
 * Find the designated or canonical entry file for a project
 */
export function getProjectEntryFile(files: ProjectFile[]): ProjectFile | undefined {
  if (!files || files.length === 0) return undefined;

  // 1. Explicitly marked entry file
  const explicitEntry = files.find(f => f.isEntry);
  if (explicitEntry) return explicitEntry;

  // 2. Canonical entry file names
  const entryPriorities = [
    'index.html', 'main.html', 'app.html', 'src/index.html',
    'main.py', 'app.py', 'index.py', 'run.py', 'src/main.py', 'src/app.py',
    'index.js', 'main.js', 'app.js', 'src/index.js', 'src/main.js', 'src/app.js',
    'index.ts', 'main.ts', 'app.ts', 'src/index.ts', 'src/main.ts', 'src/app.ts',
    'App.tsx', 'src/App.tsx', 'index.tsx', 'src/index.tsx',
    'main.sh', 'run.sh', 'index.sh',
    'main.sql', 'schema.sql', 'init.sql',
    'README.md', 'readme.md', 'index.md'
  ];

  for (const name of entryPriorities) {
    const match = files.find(
      f => f.name.toLowerCase() === name.toLowerCase() ||
           (f.path && f.path.toLowerCase() === name.toLowerCase())
    );
    if (match) return match;
  }

  // 3. Fallback to first file
  return files[0];
}

export interface EntryRuntimeResolution {
  supported: boolean;
  runtime?: ExecutionType;
  entryFile?: ProjectFile;
  reason?: string;
}

/**
 * Determine which runtime environment to execute based on the entry file type
 */
export function resolveRuntimeFromEntryFile(entryFile: ProjectFile | undefined): EntryRuntimeResolution {
  if (!entryFile) {
    return {
      supported: false,
      reason: '项目中没有找到可执行的入口文件。'
    };
  }

  const name = (entryFile.name || '').toLowerCase().trim();
  const extMatch = name.match(/\.([a-zA-Z0-9_-]+)$/);
  const ext = extMatch ? `.${extMatch[1]}` : '';
  const lang = entryFile.language || detectLanguage(name);

  // 1. HTML Web Preview
  if (ext === '.html' || ext === '.htm' || lang === 'html') {
    return {
      supported: true,
      runtime: 'html-preview',
      entryFile
    };
  }

  // 2. Python Sandbox
  if (ext === '.py' || ext === '.pyw' || lang === 'python') {
    return {
      supported: true,
      runtime: 'python-sandbox',
      entryFile
    };
  }

  // 3. JavaScript / TypeScript Sandbox
  if (
    ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx' ||
    ext === '.mjs' || ext === '.cjs' || lang === 'javascript' || lang === 'typescript'
  ) {
    return {
      supported: true,
      runtime: 'js-sandbox',
      entryFile
    };
  }

  // 4. Markdown Preview
  if (ext === '.md' || ext === '.markdown' || lang === 'markdown') {
    return {
      supported: true,
      runtime: 'markdown-preview',
      entryFile
    };
  }

  // 5. Shell Sandbox
  if (ext === '.sh' || ext === '.bash' || ext === '.zsh' || lang === 'shell') {
    return {
      supported: true,
      runtime: 'shell-sandbox',
      entryFile
    };
  }

  // 6. SQL Sandbox
  if (ext === '.sql' || lang === 'sql') {
    return {
      supported: true,
      runtime: 'sql-sandbox',
      entryFile
    };
  }

  // 7. JSON Sandbox
  if (ext === '.json' || lang === 'json') {
    return {
      supported: true,
      runtime: 'json-sandbox',
      entryFile
    };
  }

  // Specific message for CSS stylesheet
  if (ext === '.css' || lang === 'css') {
    return {
      supported: false,
      entryFile,
      reason: `入口文件 "${entryFile.name}" 为样式表，无法独立运行。请将 HTML 网页或代码脚本设置为主入口。`
    };
  }

  // 8. Unsupported file types
  const fileExtDisplay = ext ? ext.toUpperCase() : (String(lang) !== 'plaintext' ? String(lang).toUpperCase() : '未知');
  return {
    supported: false,
    entryFile,
    reason: `暂不支持运行 ${fileExtDisplay} 类型入口文件 ("${entryFile.name}")。当前支持的入口类型包括：HTML (.html)、Python (.py)、JavaScript/TypeScript (.js, .ts)、Markdown (.md)、Shell (.sh)、SQL (.sql) 与 JSON (.json)。`
  };
}

