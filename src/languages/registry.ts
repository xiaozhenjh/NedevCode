import {
  LanguageDefinition,
  Token,
  SuggestionItem,
  ExecutionContext,
  EntryRuntimeResolution
} from './types';
import { CodeLanguage, ExecutionResult, ExecutionType, ProjectFile } from '../types';

import { javascriptDefinition, typescriptDefinition } from './definitions/javascript';
import { htmlDefinition } from './definitions/html';
import { cssDefinition } from './definitions/css';
import { pythonDefinition } from './definitions/python';
import { markdownDefinition } from './definitions/markdown';
import { shellDefinition } from './definitions/shell';
import { sqlDefinition } from './definitions/sql';
import { jsonDefinition } from './definitions/json';
import { plainTextDefinition } from './definitions/plaintext';
import { imageDefinition, videoDefinition } from './definitions/media';

export class LanguageRegistry {
  private languages: Map<string, LanguageDefinition> = new Map();
  private extensionMap: Map<string, LanguageDefinition> = new Map();
  private filenameMap: Map<string, LanguageDefinition> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    const defaults = [
      javascriptDefinition,
      typescriptDefinition,
      htmlDefinition,
      cssDefinition,
      pythonDefinition,
      markdownDefinition,
      shellDefinition,
      sqlDefinition,
      jsonDefinition,
      plainTextDefinition,
      imageDefinition,
      videoDefinition
    ];

    for (const def of defaults) {
      this.register(def);
    }
  }

  /**
   * Register a new language definition.
   * If a language with the same ID already exists, it will be updated.
   */
  public register(definition: LanguageDefinition): void {
    this.languages.set(definition.id.toLowerCase(), definition);

    // Map extensions (normalized to lowercase)
    for (const ext of definition.extensions) {
      this.extensionMap.set(ext.toLowerCase(), definition);
    }

    // Map exact filenames if any
    if (definition.filenames) {
      for (const fn of definition.filenames) {
        this.filenameMap.set(fn.toLowerCase(), definition);
      }
    }
  }

  /**
   * Retrieve a language definition by ID (e.g., 'python', 'javascript')
   */
  public get(id?: string): LanguageDefinition | undefined {
    if (!id) return undefined;
    return this.languages.get(id.toLowerCase());
  }

  /**
   * Get all registered language definitions
   */
  public getAll(): LanguageDefinition[] {
    return Array.from(this.languages.values());
  }

  /**
   * Get all runnable language definitions
   */
  public getRunnableLanguages(): LanguageDefinition[] {
    return this.getAll().filter((lang) => lang.runnable !== false && (lang.executionType || lang.runner));
  }

  /**
   * Find language definition matching a filename or path
   */
  public getByFilename(filename: string): LanguageDefinition {
    const clean = (filename || '').toLowerCase().trim();
    const baseName = clean.split('/').pop() || clean;

    // 1. Exact filename match
    if (this.filenameMap.has(baseName)) {
      return this.filenameMap.get(baseName)!;
    }

    // 2. Extension match
    for (const [ext, def] of this.extensionMap.entries()) {
      if (clean.endsWith(ext)) {
        return def;
      }
    }

    // 3. Fallback to plaintext or default
    return this.get('plaintext') || {
      id: 'plaintext' as CodeLanguage,
      name: 'Plain Text',
      extensions: ['.txt'],
      runnable: false
    };
  }

  /**
   * Get the best matching language definition for a file
   */
  public getDefinitionForFile(file: ProjectFile): LanguageDefinition {
    const filenameDef = this.getByFilename(file.name);
    
    // If filename detection yields plaintext (common for 'playground' or unknown extensions),
    // but the file has an explicit specific language set, prioritize that.
    if (filenameDef.id === 'plaintext' && file.language && file.language !== 'plaintext') {
      const specificDef = this.get(file.language);
      if (specificDef) return specificDef;
    }
    
    return filenameDef;
  }

  /**
   * Detect language ID from filename
   */
  public detectLanguage(filename: string): CodeLanguage {
    const def = this.getByFilename(filename);
    return def.id;
  }

  /**
   * Get canonical entry file for a list of project files
   */
  public getProjectEntryFile(files: ProjectFile[]): ProjectFile | undefined {
    if (!files || files.length === 0) return undefined;

    // 1. Explicitly marked entry file
    const explicitEntry = files.find((f) => f.isEntry);
    if (explicitEntry) return explicitEntry;

    // 2. Collect priority file names across registered languages
    const entryPriorities: string[] = [];
    const priorityLanguages: string[] = ['html', 'python', 'javascript', 'typescript', 'shell', 'sql', 'markdown'];

    for (const langId of priorityLanguages) {
      const def = this.get(langId);
      if (def?.entryPriorities) {
        entryPriorities.push(...def.entryPriorities);
      }
    }

    // Add any remaining languages' entry priorities
    for (const def of this.getAll()) {
      if (!priorityLanguages.includes(def.id) && def.entryPriorities) {
        entryPriorities.push(...def.entryPriorities);
      }
    }

    for (const name of entryPriorities) {
      const match = files.find(
        (f) =>
          f.name.toLowerCase() === name.toLowerCase() ||
          (f.path && f.path.toLowerCase() === name.toLowerCase())
      );
      if (match) return match;
    }

    // 3. Fallback to first file
    return files[0];
  }

  /**
   * Determine execution type for a collection of files
   */
  public detectExecutionTypeFromFiles(files: { name: string; language?: string }[]): ExecutionType {
    const hasHtml = files.some(
      (f) => f.name.endsWith('.html') || f.name.endsWith('.htm') || f.language === 'html'
    );
    if (hasHtml) return 'html-preview';

    const hasPython = files.some(
      (f) => f.name.endsWith('.py') || f.language === 'python'
    );
    if (hasPython) return 'python-sandbox';

    const hasMd = files.some(
      (f) => f.name.endsWith('.md') || f.name.endsWith('.markdown') || f.language === 'markdown'
    );
    if (
      hasMd &&
      (files.length === 1 ||
        files.every(
          (f) =>
            f.name.endsWith('.md') ||
            f.name.endsWith('.markdown') ||
            f.name.endsWith('.txt')
        ))
    ) {
      return 'markdown-preview';
    }

    const hasShell = files.some(
      (f) => f.name.endsWith('.sh') || f.name.endsWith('.bash') || f.language === 'shell'
    );
    if (hasShell && files.length === 1) return 'shell-sandbox';

    const hasSql = files.some(
      (f) => f.name.endsWith('.sql') || f.language === 'sql'
    );
    if (hasSql && files.length === 1) return 'sql-sandbox';

    const hasJson = files.some(
      (f) => f.name.endsWith('.json') || f.language === 'json'
    );
    if (hasJson && files.length === 1) return 'json-sandbox';

    if (hasMd) return 'markdown-preview';

    return 'js-sandbox';
  }

  /**
   * Resolve runtime environment from entry file
   */
  public resolveRuntimeFromEntryFile(entryFile: ProjectFile | undefined): EntryRuntimeResolution {
    if (!entryFile) {
      return {
        supported: false,
        reason: '项目中没有找到可执行的入口文件。'
      };
    }

    const langDef = this.getDefinitionForFile(entryFile);

    if (langDef && langDef.runnable === false) {
      const reason =
        typeof langDef.unsupportedReason === 'function'
          ? langDef.unsupportedReason(entryFile)
          : langDef.unsupportedReason ||
            `入口文件 "${entryFile.name}" 无法直接独立运行。`;
      return {
        supported: false,
        entryFile,
        reason
      };
    }

    if (langDef && langDef.executionType && langDef.runnable !== false) {
      return {
        supported: true,
        runtime: langDef.executionType,
        entryFile
      };
    }

    const name = (entryFile.name || '').toLowerCase().trim();
    const extMatch = name.match(/\.([a-zA-Z0-9_-]+)$/);
    const ext = extMatch ? `.${extMatch[1]}` : '';

    const fileExtDisplay = ext
      ? ext.toUpperCase()
      : entryFile.language !== 'plaintext'
      ? String(entryFile.language).toUpperCase()
      : '未知';

    const supportedList = this.getRunnableLanguages()
      .map((l) => `${l.name} (${l.extensions.join(', ')})`)
      .join('、');

    return {
      supported: false,
      entryFile,
      reason: `暂不支持运行 ${fileExtDisplay} 类型入口文件 ("${entryFile.name}")。当前支持的入口类型包括：${supportedList}。`
    };
  }

  /**
   * Tokenize code for syntax highlighting
   */
  public tokenize(code: string, language: string): Token[] {
    const def = this.get(language) || this.getByFilename(language);
    if (def?.tokenize) {
      return def.tokenize(code);
    }
    // Fallback to JS tokenizer or plaintext
    const jsDef = this.get('javascript');
    if (jsDef?.tokenize) {
      return jsDef.tokenize(code);
    }
    return [{ type: 'text', content: code }];
  }

  /**
   * Get suggestions for a language
   */
  public getSuggestions(language: string): SuggestionItem[] {
    const def = this.get(language) || this.getByFilename(language);
    return def?.suggestions || [];
  }

  /**
   * Format code for a given language
   */
  public format(code: string, language: string): string {
    const def = this.get(language) || this.getByFilename(language);
    if (def?.format) {
      return def.format(code);
    }

    // Default basic formatting
    const lines = code.split('\n');
    let indentLevel = 0;
    const indentStr = '  ';
    const resultLines: string[] = [];

    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        resultLines.push('');
        continue;
      }

      if (trimmed.startsWith('}') || trimmed.startsWith(']') || trimmed.startsWith('</')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      resultLines.push(indentStr.repeat(indentLevel) + trimmed);

      if (
        (trimmed.endsWith('{') || trimmed.endsWith('[') || (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>') && !trimmed.includes('</'))) &&
        !trimmed.includes('{}') && !trimmed.includes('[]')
      ) {
        indentLevel++;
      }
    }

    return resultLines.join('\n');
  }

  /**
   * Execute code using the corresponding language runner
   */
  public async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const langDef = this.getDefinitionForFile(context.file);

    if (langDef?.runner) {
      return langDef.runner(context);
    }

    return {
      status: 'error',
      executionTimeMs: 0,
      logs: [],
      error: {
        message: `未找到语言 "${langDef?.name || context.file.language}" 的执行引擎。`
      }
    };
  }
}

export const languageRegistry = new LanguageRegistry();
