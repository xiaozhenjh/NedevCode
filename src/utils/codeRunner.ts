import { ConsoleLogItem, ExecutionResult, ProjectFile, PythonEnginePreference } from '../types';

/**
 * Resolve project file by path or name, supporting relative prefixes and extensions
 */
export function resolveProjectFile(
  pathOrName: string,
  files: ProjectFile[]
): ProjectFile | undefined {
  if (!files || files.length === 0 || !pathOrName) return undefined;
  const clean = pathOrName.trim().replace(/^\.\//, '').replace(/^\//, '');
  const baseName = clean.split('/').pop() || clean;

  // 1. Direct name or path match
  let match = files.find(
    (f) =>
      f.name === clean ||
      f.name === pathOrName ||
      (f.path && (f.path === clean || f.path === pathOrName))
  );
  if (match) return match;

  // 2. Base name match
  match = files.find((f) => f.name === baseName);
  if (match) return match;

  // 3. Match with common extensions
  const extensions = ['.js', '.ts', '.json', '.py', '.jsx', '.tsx', '.mjs', '.cjs', '.txt', '.html', '.css'];
  for (const ext of extensions) {
    match = files.find(
      (f) =>
        f.name === clean + ext ||
        f.name === baseName + ext ||
        (f.path && f.path === clean + ext)
    );
    if (match) return match;
  }

  // 4. Match directory index
  for (const ext of ['.js', '.ts', '.json', '.py']) {
    match = files.find(
      (f) =>
        f.name === `${clean}/index${ext}` ||
        (f.path && f.path === `${clean}/index${ext}`)
    );
    if (match) return match;
  }

  return undefined;
}

/**
 * Strips TypeScript types and transpiles TypeScript-specific constructs to plain JavaScript
 */
export function stripTypeScript(source: string): string {
  let code = source;

  // 1. Remove interfaces: interface Name<T> extends Foo { ... }
  code = code.replace(/\binterface\s+[A-Za-z0-9_$]+(?:\s*<[^>]+>)?(?:\s+extends[^{]+)?\s*\{[\s\S]*?\}/g, '');

  // 2. Remove type aliases: type Name<T> = ...;
  code = code.replace(/\btype\s+[A-Za-z0-9_$]+(?:\s*<[^>]+>)?\s*=[\s\S]*?;/g, '');

  // 3. Remove declare statements
  code = code.replace(/\bdeclare\s+(?:const|let|var|function|class|module|namespace|global)\b[^;]+;/g, '');

  // 4. Transpile enums: enum Direction { Up = 1, Down, Left, Right }
  code = code.replace(/\benum\s+([A-Za-z0-9_$]+)\s*\{([^}]+)\}/g, (_match, name, body) => {
    const members = body.split(',').map((m: string) => m.trim()).filter(Boolean);
    let curVal = 0;
    const lines: string[] = [`var ${name} = (function(${name}) {`];
    for (const m of members) {
      const parts = m.split('=').map((s: string) => s.trim());
      const k = parts[0];
      const v = parts[1];
      if (v !== undefined) {
        const num = Number(v);
        if (!isNaN(num)) {
          curVal = num;
          lines.push(`  ${name}[${name}["${k}"] = ${v}] = "${k}";`);
          curVal++;
        } else {
          lines.push(`  ${name}["${k}"] = ${v};`);
        }
      } else {
        lines.push(`  ${name}[${name}["${k}"] = ${curVal}] = "${k}";`);
        curVal++;
      }
    }
    lines.push(`  return ${name};`);
    lines.push(`})(${name} || {});`);
    return lines.join('\n');
  });

  // 5. Remove 'as [const|type]' and 'satisfies [type]'
  code = code.replace(/\s+as\s+(?:const|[A-Za-z0-9_$]+(?:\s*<[^>]+>)?(?:\[\])*)/g, '');
  code = code.replace(/\s+satisfies\s+[A-Za-z0-9_$]+(?:\s*<[^>]+>)?(?:\[\])*/g, '');

  // 6. Remove non-null assertion operator: foo!.bar -> foo.bar
  code = code.replace(/([A-Za-z0-9_$)\]])!(\s*[.[(])/g, '$1$2');

  // 7. Remove class access modifiers
  code = code.replace(/^\s*(?:public|private|protected|readonly|override|abstract)\s+/gm, '');

  // 8. Remove generic parameters in function definitions
  code = code.replace(/(function(?:\s+[A-Za-z0-9_$]+)?)\s*<[A-Za-z0-9_$,\s=]+>\s*\(/g, '$1(');

  // 9. Remove function return type annotations: ): returnType { or ): returnType =>
  code = code.replace(/(\)\s*):\s*[A-Za-z0-9_$<>[\]|&\s]+(?=\s*(=>|\{))/g, '$1 ');

  // 10. Remove parameter types in function signatures: (a: string, b: number = 1) -> (a, b = 1)
  code = code.replace(/(\b[a-zA-Z0-9_$]+\??)\s*:\s*[A-Za-z0-9_$<>[\]|&?]+(\s*[,)=])/g, (_m, param, after) => {
    const cleanParam = param.replace(/\?$/, '');
    return cleanParam + after;
  });

  // 11. Remove variable type annotations: const a: number = 1; let b: string;
  code = code.replace(/\b(const|let|var)\s+([A-Za-z0-9_$]+)\s*:\s*[A-Za-z0-9_$<>[\]|&]+(\s*=|\s*;)/g, '$1 $2$3');

  // 12. Remove generic type arguments on instantiations: new Set<string>() -> new Set()
  code = code.replace(/new\s+([A-Za-z0-9_$.]+)\s*<[A-Za-z0-9_$,\s<>]+>\s*\(/g, 'new $1(');

  return code;
}

/**
 * Transpiles ES Module import/export statements and TypeScript into CommonJS format
 */
export function transpileModuleCode(source: string): string {
  let transformed = stripTypeScript(source);

  // 1. Transform side-effect imports: import 'path';
  transformed = transformed.replace(
    /^\s*import\s+['"]([^'"]+)['"]\s*;?/gm,
    'require("$1");'
  );

  // 2. Transform namespace imports: import * as name from 'path';
  transformed = transformed.replace(
    /^\s*import\s+\*\s+as\s+([a-zA-Z0-9_$]+)\s+from\s+['"]([^'"]+)['"]\s*;?/gm,
    'const $1 = require("$2");'
  );

  // 3. Transform combined default & named imports: import def, { a, b as c } from 'path';
  transformed = transformed.replace(
    /^\s*import\s+([a-zA-Z0-9_$]+)\s*,\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]\s*;?/gm,
    (_match, defName, named, path) => {
      const namedBindings = named
        .split(',')
        .map((s: string) => {
          const parts = s.trim().split(/\s+as\s+/);
          return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : parts[0].trim();
        })
        .filter(Boolean)
        .join(', ');
      return `const _req_${defName} = require("${path}"); const ${defName} = _req_${defName}.default !== undefined ? _req_${defName}.default : _req_${defName}; const { ${namedBindings} } = _req_${defName};`;
    }
  );

  // 4. Transform named imports: import { a, b as c } from 'path';
  transformed = transformed.replace(
    /^\s*import\s+\{([^}]+)\}\s*from\s+['"]([^'"]+)['"]\s*;?/gm,
    (_match, named, path) => {
      const namedBindings = named
        .split(',')
        .map((s: string) => {
          const parts = s.trim().split(/\s+as\s+/);
          return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : parts[0].trim();
        })
        .filter(Boolean)
        .join(', ');
      return `const { ${namedBindings} } = require("${path}");`;
    }
  );

  // 5. Transform default imports: import def from 'path';
  transformed = transformed.replace(
    /^\s*import\s+([a-zA-Z0-9_$]+)\s+from\s+['"]([^'"]+)['"]\s*;?/gm,
    'const _mod_$1 = require("$2"); const $1 = _mod_$1.default !== undefined ? _mod_$1.default : _mod_$1;'
  );

  // 6. Transform export default
  transformed = transformed.replace(
    /^\s*export\s+default\s+([^;]+);?/gm,
    'const _defaultExport = ($1); module.exports.default = _defaultExport; if (typeof _defaultExport === "object" && _defaultExport !== null && !Array.isArray(_defaultExport)) { Object.assign(module.exports, _defaultExport); }'
  );

  // 7. Transform export const/let/var
  transformed = transformed.replace(
    /^\s*export\s+(const|let|var)\s+([a-zA-Z0-9_$]+)\s*=/gm,
    '$1 $2 = module.exports.$2 ='
  );

  // 8. Transform export function
  transformed = transformed.replace(
    /^\s*export\s+(async\s+)?function\s+([a-zA-Z0-9_$]+)/gm,
    '$1function $2'
  );
  transformed = transformed.replace(
    /^\s*(async\s+)?function\s+([a-zA-Z0-9_$]+)/gm,
    (match, _async, name) => `${match}; module.exports.${name} = ${name};`
  );

  // 9. Transform export class
  transformed = transformed.replace(
    /^\s*export\s+class\s+([a-zA-Z0-9_$]+)/gm,
    'class $1'
  );
  transformed = transformed.replace(
    /^\s*class\s+([a-zA-Z0-9_$]+)/gm,
    (match, name) => `${match}; module.exports.${name} = ${name};`
  );

  // 10. Transform export { a, b as c }
  transformed = transformed.replace(
    /^\s*export\s+\{([^}]+)\}\s*;?/gm,
    (_match, named) => {
      const assignments = named
        .split(',')
        .map((s: string) => {
          const parts = s.trim().split(/\s+as\s+/);
          const local = parts[0].trim();
          const exported = parts.length === 2 ? parts[1].trim() : local;
          return local ? `module.exports.${exported} = ${local};` : '';
        })
        .filter(Boolean)
        .join(' ');
      return assignments;
    }
  );

  return transformed;
}

export function runJavaScriptSandbox(
  code: string,
  npmPackages: string[] = [],
  onLog: (log: ConsoleLogItem) => void,
  projectFiles: ProjectFile[] = []
): Promise<ExecutionResult> {
  return new Promise(async (resolve) => {
    const logs: ConsoleLogItem[] = [];
    const timers: Record<string, number> = {};

    const pushLog = (level: ConsoleLogItem['level'], message: string, data?: unknown) => {
      const item: ConsoleLogItem = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        level,
        message,
        timestamp: Date.now(),
        data
      };
      logs.push(item);
      onLog(item);
    };

    const customConsole = {
      log: (...args: unknown[]) => {
        const msg = args.map(a => formatLogArg(a)).join(' ');
        pushLog('log', msg, args.length === 1 ? args[0] : args);
      },
      info: (...args: unknown[]) => {
        const msg = args.map(a => formatLogArg(a)).join(' ');
        pushLog('info', msg, args.length === 1 ? args[0] : args);
      },
      warn: (...args: unknown[]) => {
        const msg = args.map(a => formatLogArg(a)).join(' ');
        pushLog('warn', msg, args.length === 1 ? args[0] : args);
      },
      error: (...args: unknown[]) => {
        const msg = args.map(a => formatLogArg(a)).join(' ');
        pushLog('error', msg, args.length === 1 ? args[0] : args);
      },
      table: (data: unknown) => {
        try {
          const msg = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
          pushLog('info', '[表格展示] ' + msg, data);
        } catch {
          pushLog('info', String(data), data);
        }
      },
      time: (label = 'default') => {
        timers[label] = performance.now();
      },
      timeEnd: (label = 'default') => {
        if (timers[label]) {
          const elapsed = (performance.now() - timers[label]).toFixed(2);
          pushLog('info', `${label}: ${elapsed}ms`);
          delete timers[label];
        }
      },
      clear: () => {
        logs.length = 0;
        pushLog('system', '控制台已清空');
      }
    };

    const startTime = performance.now();

    try {
      // Load NPM packages dynamically via CDN if specified
      if (npmPackages && npmPackages.length > 0) {
        pushLog('system', `正在加载 NPM 依赖模块: ${npmPackages.join(', ')} ...`);
        await loadNpmScripts(npmPackages, pushLog);
        pushLog('system', 'NPM 依赖库加载就绪。');
      }

      // Module resolution cache
      const moduleCache: Record<string, { exports: any }> = {};

      // Local CommonJS / ES module require resolver
      const localRequire = (request: string) => {
        if (!request) throw new Error('require() 缺少模块名参数');

        // 1. Check local project files
        const matchedFile = resolveProjectFile(request, projectFiles);
        if (matchedFile) {
          // If already cached, return exports
          if (moduleCache[matchedFile.id]) {
            return moduleCache[matchedFile.id].exports;
          }

          // JSON file handling
          if (matchedFile.language === 'json' || matchedFile.name.endsWith('.json')) {
            try {
              const parsed = JSON.parse(matchedFile.content);
              moduleCache[matchedFile.id] = { exports: parsed };
              return parsed;
            } catch (err: any) {
              throw new Error(`解析 JSON 模块 [${matchedFile.name}] 失败: ${err?.message || err}`);
            }
          }

          // JavaScript / TypeScript module handling
          const moduleObj = { exports: {} };
          moduleCache[matchedFile.id] = moduleObj;

          const transpiled = transpileModuleCode(matchedFile.content);
          const hasInnerAwait = /\bawait\s+/.test(transpiled);

          try {
            if (hasInnerAwait) {
              const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
              const moduleFn = new AsyncFunction(
                'exports',
                'require',
                'module',
                '__filename',
                '__dirname',
                'console',
                'performance',
                'setTimeout',
                'setInterval',
                `"use strict";\n${transpiled}`
              );
              // Note: Top-level synchronous execution will initiate async module
              moduleFn(
                moduleObj.exports,
                localRequire,
                moduleObj,
                matchedFile.name,
                '/',
                customConsole,
                performance,
                setTimeout,
                setInterval
              );
            } else {
              const moduleFn = new Function(
                'exports',
                'require',
                'module',
                '__filename',
                '__dirname',
                'console',
                'performance',
                'setTimeout',
                'setInterval',
                `"use strict";\n${transpiled}`
              );
              moduleFn(
                moduleObj.exports,
                localRequire,
                moduleObj,
                matchedFile.name,
                '/',
                customConsole,
                performance,
                setTimeout,
                setInterval
              );
            }
          } catch (mErr: any) {
            throw new Error(`执行模块 [${matchedFile.name}] 失败: ${mErr?.message || mErr}`);
          }

          return moduleObj.exports;
        }

        // 2. Check window globals for NPM CDN packages
        const win = window as any;
        const cleanPkg = request.trim().replace(/^@?[a-z0-9_-]+\//, '');
        const camelPkg = cleanPkg.replace(/-([a-z])/g, (_g) => _g[1].toUpperCase());

        if (win[request] !== undefined) return win[request];
        if (win[cleanPkg] !== undefined) return win[cleanPkg];
        if (win[camelPkg] !== undefined) return win[camelPkg];
        if ((request === 'lodash' || request === 'underscore') && win._) return win._;
        if (request === 'dayjs' && win.dayjs) return win.dayjs;
        if (request === 'axios' && win.axios) return win.axios;

        throw new Error(
          `找不到模块 '${request}'。若是同一项目文件，请检查文件名（例如 './${request}'）；若是第三方库，请在包管理器中添加依赖。`
        );
      };

      // Transpile entry file code
      const transpiledCode = transpileModuleCode(code);
      const hasAwait = /\bawait\s+/.test(transpiledCode);

      // Create entry module
      const entryModule = { exports: {} };

      let executor: Function;
      if (hasAwait) {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        executor = new AsyncFunction(
          'exports',
          'require',
          'module',
          '__filename',
          '__dirname',
          'console',
          'performance',
          'setTimeout',
          'setInterval',
          `"use strict";\n${transpiledCode}`
        );
      } else {
        executor = new Function(
          'exports',
          'require',
          'module',
          '__filename',
          '__dirname',
          'console',
          'performance',
          'setTimeout',
          'setInterval',
          `"use strict";\nreturn (function() {\n${transpiledCode}\n})();`
        );
      }

      const result = await executor(
        entryModule.exports,
        localRequire,
        entryModule,
        'index.js',
        '/',
        customConsole,
        performance,
        setTimeout,
        setInterval
      );

      const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));

      resolve({
        status: 'success',
        executionTimeMs,
        logs,
        returnValue: result !== undefined ? formatLogArg(result) : undefined
      });
    } catch (err: unknown) {
      const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
      const errorObj = err as Error;

      const stackLines = errorObj.stack ? errorObj.stack.split('\n') : [];
      let line: number | undefined = undefined;
      let col: number | undefined = undefined;

      for (const st of stackLines) {
        const match = /<anonymous>:(\d+):(\d+)/.exec(st) || /eval at <anonymous>.*:(\d+):(\d+)/.exec(st);
        if (match) {
          line = parseInt(match[1], 10);
          col = parseInt(match[2], 10);
          break;
        }
      }

      pushLog('error', `运行时错误: ${errorObj.message}`);

      resolve({
        status: 'error',
        executionTimeMs,
        error: {
          message: errorObj.message,
          line,
          column: col,
          stack: errorObj.stack
        },
        logs
      });
    }
  });
}

// Helper to inject a script element safely with retry
async function loadScriptTag(url: string, id: string): Promise<void> {
  const existing = document.getElementById(id);
  if (existing) return;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`无法从 CDN 加载脚本: ${url}`));
    document.head.appendChild(script);
  });
}

// Dynamically load npm package UMD / bundle via CDN
async function loadNpmScripts(
  packages: string[],
  pushLog: (level: ConsoleLogItem['level'], msg: string) => void
): Promise<void> {
  for (const pkg of packages) {
    const cleanPkg = pkg.trim();
    if (!cleanPkg) continue;

    const scriptId = 'npm-pkg-' + cleanPkg.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (document.getElementById(scriptId)) {
      continue;
    }

    await new Promise<void>((resolve) => {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://cdn.jsdelivr.net/npm/${cleanPkg}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        const fallbackScript = document.createElement('script');
        fallbackScript.id = scriptId;
        fallbackScript.src = `https://unpkg.com/${cleanPkg}`;
        fallbackScript.async = true;
        fallbackScript.onload = () => resolve();
        fallbackScript.onerror = () => {
          pushLog('warn', `依赖包 ${cleanPkg} 加载失败，请检查包名是否正确或网络连接`);
          resolve();
        };
        document.head.appendChild(fallbackScript);
      };
      document.head.appendChild(script);
    });
  }
}

// Cache name in browser CacheStorage
const RUNTIME_CACHE_NAME = 'python-runtime-cache-v1';

/**
 * Fetch a resource from CDN with browser CacheStorage local cache
 */
async function fetchWithLocalCache(
  url: string,
  onStatusUpdate?: (msg: string) => void
): Promise<Response> {
  const fileName = url.split('/').pop() || url;
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      const cachedResponse = await cache.match(url);
      if (cachedResponse) {
        return cachedResponse;
      }
      onStatusUpdate?.(`正在从 CDN 下载 Python 运行时文件并写入本地缓存: ${fileName}`);
      const networkResponse = await fetch(url);
      if (networkResponse.ok) {
        try {
          await cache.put(url, networkResponse.clone());
        } catch {
          // ignore cache put errors in restricted WebViews
        }
      }
      return networkResponse;
    } catch {
      return fetch(url);
    }
  }
  return fetch(url);
}

// ----------------- Pure JS Python Engine (Skulpt) for low-version WebViews -----------------
let skulptPromise: Promise<any> | null = null;

async function ensureSkulptLoaded(onStatusUpdate?: (msg: string) => void): Promise<any> {
  if (skulptPromise) return skulptPromise;

  skulptPromise = (async () => {
    if (typeof (window as any).Sk !== 'undefined') {
      return (window as any).Sk;
    }

    onStatusUpdate?.('正在从 CDN 下载纯 JS Python 3 解释器 (兼容低版本 Webview)...');
    
    // Load Skulpt core and standard library
    await loadScriptTag('https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js', 'skulpt-core');
    await loadScriptTag('https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js', 'skulpt-stdlib');
    
    const Sk = (window as any).Sk;
    if (!Sk) {
      throw new Error('Skulpt Python 运行时加载失败');
    }
    return Sk;
  })();

  return skulptPromise;
}

async function runSkulptPython(
  code: string,
  onInputPrompt: (promptText: string) => Promise<string>,
  pushLog: (level: ConsoleLogItem['level'], msg: string) => void,
  onStatusUpdate?: (msg: string) => void,
  projectFiles: ProjectFile[] = []
): Promise<ExecutionResult> {
  const startTime = performance.now();
  const logs: ConsoleLogItem[] = [];

  const localPushLog = (level: ConsoleLogItem['level'], message: string) => {
    pushLog(level, message);
  };

  try {
    const Sk = await ensureSkulptLoaded(onStatusUpdate);

    let lineBuffer = '';
    const outHandler = (text: string) => {
      lineBuffer += text;
      if (lineBuffer.includes('\n')) {
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';
        for (const l of lines) {
          if (l !== '') localPushLog('log', l);
        }
      }
    };

    const builtinRead = (x: string) => {
      // 1. Check local project files
      const matched = resolveProjectFile(x, projectFiles);
      if (matched) {
        return matched.content;
      }

      // 2. Check Skulpt standard library
      if (Sk.builtinFiles !== undefined && Sk.builtinFiles['files'][x] !== undefined) {
        return Sk.builtinFiles['files'][x];
      }

      throw new Error(`找不到模块或文件: '${x}'`);
    };

    // Invalidate cached modules in Skulpt so updated files are freshly reloaded
    if ((Sk as any).sysmodules && projectFiles && projectFiles.length > 0) {
      for (const f of projectFiles) {
        const mod = f.name.replace(/\.[^/.]+$/, '').split('/').pop();
        if (mod) {
          if ((Sk as any).sysmodules.mp$load) delete (Sk as any).sysmodules.mp$load[mod];
          if ((Sk as any).sysmodules.mp$entries) delete (Sk as any).sysmodules.mp$entries[mod];
        }
      }
    }

    Sk.configure({
      output: outHandler,
      read: builtinRead,
      inputfun: async (promptText: string) => {
        if (lineBuffer) {
          localPushLog('log', lineBuffer);
          lineBuffer = '';
        }
        const val = await onInputPrompt(promptText || '');
        return val;
      },
      inputfunTakesPrompt: true,
      retaeval: true,
      __future__: Sk.python3
    });

    await Sk.misceval.asyncToPromise(() => {
      return Sk.importMainWithBody('<stdin>', false, code, true);
    });

    if (lineBuffer) {
      localPushLog('log', lineBuffer);
      lineBuffer = '';
    }

    const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
    return {
      status: 'success',
      executionTimeMs,
      logs
    };
  } catch (err: any) {
    const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
    const msg = err ? (err.toString ? err.toString() : String(err)) : '未知执行异常';
    localPushLog('error', `Python 异常: ${msg}`);

    let line: number | undefined = undefined;
    if (err && typeof err === 'object' && 'lineno' in err) {
      line = err.lineno;
    } else {
      const match = /line (\d+)/i.exec(msg);
      if (match) line = parseInt(match[1], 10);
    }

    return {
      status: 'error',
      executionTimeMs,
      error: {
        message: msg,
        line,
        stack: err?.stack
      },
      logs
    };
  }
}

// ----------------- WebAssembly Pyodide Engine -----------------
let pyodideInstancePromise: Promise<any> | null = null;

async function getPyodideInstance(onStatusUpdate?: (msg: string) => void): Promise<any> {
  // Check if WebAssembly is supported in this environment
  if (typeof WebAssembly === 'undefined' || typeof WebAssembly.instantiate !== 'function') {
    throw new Error('当前 Webview 环境不支持 WebAssembly');
  }

  if (pyodideInstancePromise) {
    return pyodideInstancePromise;
  }

  pyodideInstancePromise = (async () => {
    try {
      if (typeof (window as any).loadPyodide !== 'function') {
        onStatusUpdate?.('正在从 CDN 下载 Python 运行时内核 (Pyodide)...');
        await loadScriptTag('https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js', 'pyodide-core');
      }

      onStatusUpdate?.('正在初始化 Python 运行时 (启用本地缓存)...');
      const pyodide = await (window as any).loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/',
        _fetch: (url: string) => fetchWithLocalCache(url, onStatusUpdate)
      });
      onStatusUpdate?.('Python 运行时已就绪。');
      return pyodide;
    } catch (err) {
      pyodideInstancePromise = null;
      throw err;
    }
  })();

  return pyodideInstancePromise;
}

export async function runPythonSandbox(
  code: string,
  packages: string[] = [],
  onInputPrompt: (promptText: string) => Promise<string>,
  onLog: (log: ConsoleLogItem) => void,
  enginePreference: PythonEnginePreference = 'auto',
  projectFiles: ProjectFile[] = []
): Promise<ExecutionResult> {
  const logs: ConsoleLogItem[] = [];
  const pushLog = (level: ConsoleLogItem['level'], message: string, data?: unknown) => {
    const item: ConsoleLogItem = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      level,
      message,
      timestamp: Date.now(),
      data
    };
    logs.push(item);
    onLog(item);
  };

  const startTime = performance.now();
  const hasWasm = typeof WebAssembly !== 'undefined' && typeof WebAssembly.instantiate === 'function';

  // 1. Force Skulpt (Pure JS)
  if (enginePreference === 'skulpt') {
    pushLog('system', '当前配置: 强制使用 Skulpt (纯 JS) Python 解释器运行...');
    if (!hasWasm) {
      pushLog('info', '说明: 当前环境不支持 WebAssembly (Wasm)，已按设置运行纯 JS 兼容引擎。');
    }
    const res = await runSkulptPython(code, onInputPrompt, pushLog, (status) => pushLog('system', status), projectFiles);
    return {
      ...res,
      logs
    };
  }

  // 2. Force Pyodide (Wasm)
  if (enginePreference === 'wasm') {
    pushLog('system', '当前配置: 强制使用 Pyodide (Wasm) Python 完整运行时...');
    if (!hasWasm) {
      pushLog('error', '提示: 当前环境不支持 WebAssembly (Wasm)，无法运行 Pyodide 引擎。请在「设置」中切换为「Skulpt (纯 JS)」引擎或「自动检测」模式。');
      const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
      return {
        status: 'error',
        executionTimeMs,
        error: {
          message: '当前环境不支持 WebAssembly (Wasm)，无法启动 Pyodide 运行时。请在「设置」中切换为 Skulpt 纯 JS 引擎。'
        },
        logs
      };
    }
  }

  // 3. Auto Detection or Forced Wasm when supported
  let pyodide: any = null;

  if (hasWasm) {
    try {
      if (enginePreference === 'auto') {
        pushLog('system', '准备运行 Python 代码 (WebAssembly Pyodide)...');
      }
      pyodide = await Promise.race([
        getPyodideInstance((status) => pushLog('system', status)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Pyodide WASM 加载超时')), 8000))
      ]);
    } catch (e: any) {
      if (enginePreference === 'wasm') {
        // Forced Wasm failed
        pushLog('error', `Pyodide (Wasm) 初始化失败: ${e?.message || e}`);
        const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
        return {
          status: 'error',
          executionTimeMs,
          error: {
            message: `Pyodide (Wasm) 初始化失败: ${e?.message || e}`
          },
          logs
        };
      } else {
        // Auto fallback
        pushLog('system', `提示: WebAssembly 运行时受限 (${e?.message || e})，已自动切换为兼容纯 JS Python 解释器 (Skulpt)...`);
        pyodide = null;
      }
    }
  } else {
    // hasWasm is false in Auto mode
    pushLog('system', '提示: 检测到当前环境不支持 WebAssembly (Wasm)，已自动切换为兼容纯 JS Python 解释器 (Skulpt)。');
  }

  // If Pyodide is not available (low-version Webview or timeout), use pure JS Skulpt engine
  if (!pyodide) {
    const res = await runSkulptPython(code, onInputPrompt, pushLog, (status) => pushLog('system', status), projectFiles);
    return {
      ...res,
      logs
    };
  }

  // Pyodide Execution Flow
  try {
    pyodide.setStdout({
      batched: (text: string) => {
        if (text) pushLog('log', text);
      }
    });

    pyodide.setStderr({
      batched: (text: string) => {
        if (text) pushLog('error', text);
      }
    });

    (window as any).__asyncPythonInputBridge = async (promptMsg: string) => {
      const userValue = await onInputPrompt(promptMsg || '');
      return userValue;
    };

    // Synchronize all project files into Pyodide Emscripten Virtual File System
    if (projectFiles && projectFiles.length > 0) {
      for (const file of projectFiles) {
        const filePath = file.name.trim();
        if (!filePath) continue;

        // Ensure parent directory exists in pyodide.FS
        const parts = filePath.split('/');
        if (parts.length > 1) {
          let currentDir = '';
          for (let i = 0; i < parts.length - 1; i++) {
            currentDir += (currentDir ? '/' : '') + parts[i];
            try {
              pyodide.FS.mkdir(currentDir);
            } catch {}
          }
        }

        try {
          pyodide.FS.writeFile(filePath, file.content, { encoding: 'utf8' });
        } catch {
          try {
            const baseName = filePath.split('/').pop() || filePath;
            pyodide.FS.writeFile(baseName, file.content, { encoding: 'utf8' });
          } catch {}
        }
      }

      // Configure sys.path and clear cached modules in sys.modules for live reloading
      const moduleNamesToReset = projectFiles
        .map((f) => f.name.replace(/\.[^/.]+$/, '').split('/').pop())
        .filter(Boolean);

      await pyodide.runPythonAsync(`
import sys
if '.' not in sys.path:
    sys.path.insert(0, '.')
if '/' not in sys.path:
    sys.path.insert(0, '/')

# Invalidate cache for project modules to support live reloading
for mod_name in ${JSON.stringify(moduleNamesToReset)}:
    if mod_name in sys.modules:
        del sys.modules[mod_name]
`);
    }

    if (packages && packages.length > 0) {
      pushLog('system', `正在检查并安装 Python 包: ${packages.join(', ')} ...`);
      try {
        await pyodide.loadPackage('micropip');
        const micropip = pyodide.pyimport('micropip');
        for (const pkg of packages) {
          const cleanPkg = pkg.trim();
          if (!cleanPkg) continue;
          try {
            pushLog('info', `正在加载/安装模块 [${cleanPkg}] ...`);
            try {
              await pyodide.loadPackage(cleanPkg);
            } catch {
              await micropip.install(cleanPkg);
            }
            pushLog('info', `模块 [${cleanPkg}] 安装就绪。`);
          } catch (pkgErr: any) {
            pushLog('warn', `安装模块 [${cleanPkg}] 警告: ${pkgErr?.message || pkgErr}`);
          }
        }
      } catch (err: any) {
        pushLog('warn', `Python 包管理器 micropip 初始化提示: ${err?.message || err}`);
      }
    }

    await pyodide.runPythonAsync(`
import builtins
import js

async def _custom_async_input(prompt=''):
    p_str = str(prompt)
    if p_str:
        print(p_str, end='')
    val = await js.__asyncPythonInputBridge(p_str)
    return str(val)

builtins.input = _custom_async_input
`);

    const pyResult = await pyodide.runPythonAsync(code);
    const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));

    let formattedReturn: string | undefined = undefined;
    if (pyResult !== undefined && pyResult !== null) {
      if (typeof pyResult.toJs === 'function') {
        try {
          formattedReturn = formatLogArg(pyResult.toJs());
          pyResult.destroy?.();
        } catch {
          formattedReturn = String(pyResult);
        }
      } else {
        formattedReturn = String(pyResult);
      }
    }

    return {
      status: 'success',
      executionTimeMs,
      logs,
      returnValue: formattedReturn
    };
  } catch (err: any) {
    const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
    const msg = err?.message || String(err);
    pushLog('error', `Python 异常: ${msg}`);

    let line: number | undefined = undefined;
    const lineMatch = /File "<exec>", line (\d+)/.exec(msg) || /line (\d+)/.exec(msg);
    if (lineMatch) {
      line = parseInt(lineMatch[1], 10);
    }

    return {
      status: 'error',
      executionTimeMs,
      error: {
        message: msg,
        line,
        stack: err?.stack
      },
      logs
    };
  }
}

export function formatLogArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (typeof arg === 'function') return `[Function: ${arg.name || 'anonymous'}]`;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return Object.prototype.toString.call(arg);
  }
}

export function buildHtmlBundle(files: ProjectFile[], npmPackages: string[] = []): string {
  const htmlFile =
    files.find((f) => f.isEntry && (f.language === 'html' || f.name.endsWith('.html') || f.name.endsWith('.htm'))) ||
    files.find((f) => f.language === 'html' || f.name.endsWith('.html') || f.name.endsWith('.htm')) ||
    files[0];
  const cssFiles = files.filter((f) => f.language === 'css' || f.name.endsWith('.css'));
  const jsFiles = files.filter(
    (f) =>
      (f.language === 'javascript' || f.language === 'typescript' || f.name.endsWith('.js')) &&
      f.id !== htmlFile?.id
  );

  let rawHtml = htmlFile?.content || '<html><body><div id="app"></div></body></html>';

  // Inject console relay script into iframe
  const consoleRelay = `
  <script>
    (function() {
      function sendLog(level, args) {
        try {
          var formatted = Array.prototype.slice.call(args).map(function(item) {
            if (item === null) return 'null';
            if (item === undefined) return 'undefined';
            if (typeof item === 'object') {
              try { return JSON.stringify(item); } catch(e) { return String(item); }
            }
            return String(item);
          }).join(' ');

          window.parent.postMessage({
            type: 'APP_CONSOLE_LOG',
            level: level,
            message: formatted,
            timestamp: Date.now()
          }, '*');
        } catch(e) {}
      }

      var origLog = console.log;
      var origInfo = console.info;
      var origWarn = console.warn;
      var origError = console.error;

      console.log = function() { sendLog('log', arguments); origLog && origLog.apply(console, arguments); };
      console.info = function() { sendLog('info', arguments); origInfo && origInfo.apply(console, arguments); };
      console.warn = function() { sendLog('warn', arguments); origWarn && origWarn.apply(console, arguments); };
      console.error = function() { sendLog('error', arguments); origError && origError.apply(console, arguments); };

      window.onerror = function(msg, url, line, col, err) {
        sendLog('error', ['[运行时错误] ' + msg + ' (第 ' + line + ' 行)']);
        return false;
      };
    })();
  </script>
  `;

  // Virtual file system for cross-referencing and fetch() interception
  const virtualFilesMap: Record<string, { content: string; mime: string }> = {};
  for (const f of files) {
    const ext = f.name.split('.').pop() || '';
    let mime = 'text/plain';
    if (ext === 'json') mime = 'application/json';
    else if (ext === 'html') mime = 'text/html';
    else if (ext === 'css') mime = 'text/css';
    else if (ext === 'js' || ext === 'ts') mime = 'application/javascript';

    virtualFilesMap[f.name] = { content: f.content, mime };
    virtualFilesMap['./' + f.name] = { content: f.content, mime };
    virtualFilesMap['/' + f.name] = { content: f.content, mime };
  }

  const vfsScript = `
  <script>
    (function() {
      var __VFS__ = ${JSON.stringify(virtualFilesMap)};
      var origFetch = window.fetch;
      window.fetch = function(url, opts) {
        if (typeof url === 'string') {
          var key = url.trim();
          var matched = __VFS__[key] || __VFS__[key.replace(/^\\.\\//, '')];
          if (matched) {
            return Promise.resolve(new Response(matched.content, {
              status: 200,
              headers: { 'Content-Type': matched.mime }
            }));
          }
        }
        return origFetch.apply(this, arguments);
      };
    })();
  </script>
  `;

  // Inject NPM CDN packages
  let npmScriptsBlock = '';
  if (npmPackages && npmPackages.length > 0) {
    for (const pkg of npmPackages) {
      const cleanPkg = pkg.trim();
      if (!cleanPkg) continue;
      npmScriptsBlock += `<script src="https://cdn.jsdelivr.net/npm/${cleanPkg}"></script>\n`;
    }
  }

  // Replace external link tags for CSS files if matched
  const matchedCssIds = new Set<string>();
  for (const cf of cssFiles) {
    const escaped = cf.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkRegex = new RegExp(`<link[^>]*href=["'](?:\\.\\/)?${escaped}["'][^>]*>`, 'gi');
    if (linkRegex.test(rawHtml)) {
      rawHtml = rawHtml.replace(linkRegex, `<style id="${cf.name}">\n${cf.content}\n</style>`);
      matchedCssIds.add(cf.id);
    }
  }

  // Inject remaining CSS files
  let cssBlock = '';
  for (const cf of cssFiles) {
    if (!matchedCssIds.has(cf.id)) {
      cssBlock += `<style id="${cf.name}">\n${cf.content}\n</style>\n`;
    }
  }

  // Replace external script tags for JS files if matched
  const matchedJsIds = new Set<string>();
  for (const jf of jsFiles) {
    const escaped = jf.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const scriptRegex = new RegExp(`<script[^>]*src=["'](?:\\.\\/)?${escaped}["'][^>]*>\\s*<\\/script>`, 'gi');
    if (scriptRegex.test(rawHtml)) {
      rawHtml = rawHtml.replace(scriptRegex, `<script id="${jf.name}">\n${jf.content}\n</script>`);
      matchedJsIds.add(jf.id);
    }
  }

  // Inject remaining JS files
  let jsBlock = '';
  for (const jf of jsFiles) {
    if (!matchedJsIds.has(jf.id)) {
      jsBlock += `<script id="${jf.name}">\n${jf.content}\n</script>\n`;
    }
  }

  // If head exists, inject into head, else wrap
  if (rawHtml.includes('<head>')) {
    rawHtml = rawHtml.replace('<head>', `<head>${consoleRelay}${vfsScript}${npmScriptsBlock}${cssBlock}`);
  } else if (rawHtml.includes('<html>')) {
    rawHtml = rawHtml.replace('<html>', `<html><head>${consoleRelay}${vfsScript}${npmScriptsBlock}${cssBlock}</head>`);
  } else {
    rawHtml = `<!DOCTYPE html><html><head>${consoleRelay}${vfsScript}${npmScriptsBlock}${cssBlock}</head><body>${rawHtml}</body></html>`;
  }

  if (rawHtml.includes('</body>')) {
    rawHtml = rawHtml.replace('</body>', `${jsBlock}</body>`);
  } else {
    rawHtml = `${rawHtml}${jsBlock}`;
  }

  return rawHtml;
}

export function formatCode(code: string, language: string): string {
  if (language === 'json') {
    try {
      const parsed = JSON.parse(code);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return code;
    }
  }

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
 * Executes and validates Markdown document
 */
export function runMarkdownSandbox(
  content: string,
  filename: string,
  onLog: (log: ConsoleLogItem) => void
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const lines = content.split('\n');
    const lineCount = lines.length;
    const charCount = content.length;
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const headings = lines.filter((l) => /^\s*#{1,6}\s+/.test(l));
    const codeBlocks = Math.floor((content.match(/```/g) || []).length / 2);
    const links = (content.match(/\[.*?\]\(.*?\)/g) || []).length;
    const images = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;
    const tables = lines.filter((l) => /^\s*\|.*\|\s*$/.test(l)).length;

    const pushLog = (level: ConsoleLogItem['level'], message: string) => {
      const item: ConsoleLogItem = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        level,
        message,
        timestamp: Date.now()
      };
      onLog(item);
    };

    pushLog('system', `[Markdown] 正在解析文档: ${filename || 'README.md'}`);
    pushLog('info', `文档统计: 共 ${lineCount} 行，${charCount} 字符，约 ${wordCount} 个词。`);
    if (headings.length > 0) {
      pushLog('info', `结构纲要: 包含 ${headings.length} 处标题 (首标题: "${headings[0].replace(/^#+\s*/, '').slice(0, 30)}")`);
    }
    if (codeBlocks > 0) {
      pushLog('info', `代码高亮: 包含 ${codeBlocks} 处独立代码块。`);
    }
    if (tables > 0) {
      pushLog('info', `表格结构: 包含格式化表格数据。`);
    }
    if (links > 0 || images > 0) {
      pushLog('info', `资源链接: 包含 ${links} 处超链接，${images} 处图片引用。`);
    }
    pushLog('system', 'Markdown 文档渲染就绪！可切换至「预览」视图查看排版效果。');

    const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
    resolve({
      status: 'success',
      executionTimeMs,
      logs: []
    });
  });
}

/**
 * Executes a Shell script in simulated Unix terminal environment
 */
export async function runShellSandbox(
  script: string,
  projectFiles: ProjectFile[],
  onLog: (log: ConsoleLogItem) => void,
  onPrompt?: (promptText: string) => Promise<string>
): Promise<ExecutionResult> {
  const startTime = performance.now();
  const pushLog = (level: ConsoleLogItem['level'], message: string) => {
    const item: ConsoleLogItem = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      level,
      message,
      timestamp: Date.now()
    };
    onLog(item);
  };

  pushLog('system', '正在启动 Shell 沙箱环境 (Bash 兼容)...');
  const envVars: Record<string, string> = {
    USER: 'developer',
    HOME: '/workspace',
    PWD: '/workspace/project',
    SHELL: '/bin/bash',
    PATH: '/usr/local/bin:/usr/bin:/bin',
    LANG: 'zh_CN.UTF-8'
  };

  const lines = script.split('\n');
  const currentPwd = '/workspace/project';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('#')) continue;

    const expandVars = (str: string): string => {
      return str.replace(/\$\{?([a-zA-Z_][a-zA-Z0-9_]*)\}?/g, (_m, varName) => {
        return envVars[varName] !== undefined ? envVars[varName] : '';
      });
    };

    const assignMatch = rawLine.match(/^(?:export\s+)?([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      let val = assignMatch[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      envVars[varName] = expandVars(val);
      continue;
    }

    const expanded = expandVars(rawLine);
    const parts = expanded.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    if (cmd === 'echo') {
      let output = args.join(' ');
      if ((output.startsWith('"') && output.endsWith('"')) || (output.startsWith("'") && output.endsWith("'"))) {
        output = output.slice(1, -1);
      }
      pushLog('log', output);
    } else if (cmd === 'pwd') {
      pushLog('log', currentPwd);
    } else if (cmd === 'date') {
      pushLog('log', new Date().toLocaleString());
    } else if (cmd === 'whoami') {
      pushLog('log', envVars.USER);
    } else if (cmd === 'uname') {
      pushLog('log', 'Linux sandbox-runtime 6.1.0-x86_64');
    } else if (cmd === 'clear') {
      // clear
    } else if (cmd === 'ls' || cmd === 'dir') {
      const fileList = projectFiles.map((f) => {
        const size = (f.content?.length || 0) + 'B';
        return `${f.name.padEnd(20)} ${size.padStart(8)}`;
      });
      pushLog('log', `目录清单 [${currentPwd}]:\n` + fileList.join('\n'));
    } else if (cmd === 'cat') {
      const targetName = args[0];
      if (!targetName) {
        pushLog('error', 'cat: 缺少文件名参数');
      } else {
        const file = projectFiles.find((f) => f.name === targetName || f.name.endsWith('/' + targetName));
        if (file) {
          pushLog('log', file.content);
        } else {
          pushLog('error', `cat: ${targetName}: 没有那个文件或目录`);
        }
      }
    } else if (cmd === 'wc') {
      const targetName = args.find((a) => !a.startsWith('-'));
      if (!targetName) {
        pushLog('error', 'wc: 缺少文件名');
      } else {
        const file = projectFiles.find((f) => f.name === targetName);
        if (file) {
          const lCount = file.content.split('\n').length;
          const wCount = file.content.trim().split(/\s+/).filter(Boolean).length;
          const cCount = file.content.length;
          pushLog('log', ` ${lCount}  ${wCount} ${cCount} ${targetName}`);
        } else {
          pushLog('error', `wc: ${targetName}: 没有那个文件`);
        }
      }
    } else if (cmd === 'grep') {
      const keyword = args[0];
      const targetName = args[1];
      if (!keyword || !targetName) {
        pushLog('error', 'grep: 用法 grep <关键词> <文件名>');
      } else {
        const file = projectFiles.find((f) => f.name === targetName);
        if (file) {
          const matched = file.content.split('\n').filter((l) => l.includes(keyword));
          if (matched.length > 0) {
            pushLog('log', matched.join('\n'));
          }
        } else {
          pushLog('error', `grep: ${targetName}: 文件不存在`);
        }
      }
    } else if (cmd === 'read') {
      const varName = args[0] || 'REPLY';
      if (onPrompt) {
        const inputVal = await onPrompt(`请输入 ${varName}:`);
        envVars[varName] = inputVal || '';
      }
    } else if (cmd === 'help') {
      pushLog('info', '支持的 Shell 命令: echo, pwd, date, whoami, uname, ls, cat, wc, grep, read, clear, export, VAR=val');
    } else {
      pushLog('log', `[sh] ${expanded}`);
    }
  }

  pushLog('system', 'Shell 脚本运行结束 (退出码: 0)');
  const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
  return {
    status: 'success',
    executionTimeMs,
    logs: []
  };
}

/**
 * Validates and displays JSON data structure
 */
export function runJsonSandbox(
  content: string,
  filename: string,
  onLog: (log: ConsoleLogItem) => void
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const pushLog = (level: ConsoleLogItem['level'], message: string, data?: unknown) => {
      const item: ConsoleLogItem = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        level,
        message,
        timestamp: Date.now(),
        data
      };
      onLog(item);
    };

    pushLog('system', `[JSON 引擎] 正在校验并解析: ${filename || 'data.json'}`);

    try {
      const parsed = JSON.parse(content);
      const isArr = Array.isArray(parsed);
      const isObj = typeof parsed === 'object' && parsed !== null && !isArr;
      const sizeBytes = new Blob([content]).size;

      pushLog('info', `JSON 语法校验通过！文档大小: ${sizeBytes} 字节`);
      if (isArr) {
        pushLog('info', `根数据类型: 数组 (Array)，包含 ${parsed.length} 个元素。`);
        if (parsed.length > 0 && typeof parsed[0] === 'object') {
          pushLog('info', '[数据结构展示]:\n' + JSON.stringify(parsed.slice(0, 5), null, 2));
        } else {
          pushLog('info', '[数据项]:\n' + JSON.stringify(parsed, null, 2));
        }
      } else if (isObj) {
        const keys = Object.keys(parsed);
        pushLog('info', `根数据类型: 对象 (Object)，包含 ${keys.length} 个顶级属性: [${keys.slice(0, 8).join(', ')}${keys.length > 8 ? '...' : ''}]`);
        pushLog('info', '[格式化内容]:\n' + JSON.stringify(parsed, null, 2));
      } else {
        pushLog('info', `基本数据类型值: ${String(parsed)}`);
      }

      resolve({
        status: 'success',
        executionTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
        logs: []
      });
    } catch (err: any) {
      pushLog('error', `JSON 语法错误: ${err?.message || err}`);
      resolve({
        status: 'error',
        executionTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
        logs: [],
        error: err?.message || 'JSON 语法错误'
      });
    }
  });
}

/**
 * Simulates an in-memory SQL execution sandbox
 */
export function runSqlSandbox(
  sqlText: string,
  onLog: (log: ConsoleLogItem) => void
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const pushLog = (level: ConsoleLogItem['level'], message: string) => {
      const item: ConsoleLogItem = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        level,
        message,
        timestamp: Date.now()
      };
      onLog(item);
    };

    pushLog('system', '[SQL 引擎] 正在启动内存数据库沙箱...');

    const tables: Record<string, { columns: string[]; rows: Record<string, any>[] }> = {};
    const statements = sqlText
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--'));

    try {
      for (const stmt of statements) {
        if (/^CREATE\s+TABLE/i.test(stmt)) {
          const match = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]+)\)/i);
          if (match) {
            const tableName = match[1];
            const colDefs = match[2].split(',').map((c) => c.trim().split(/\s+/)[0]);
            tables[tableName] = { columns: colDefs, rows: [] };
            pushLog('info', `表 [${tableName}] 创建成功，定义字段: (${colDefs.join(', ')})`);
          }
        } else if (/^INSERT\s+INTO/i.test(stmt)) {
          const match = stmt.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)(?:\s*\(([^)]+)\))?\s*VALUES\s*\(([\s\S]+)\)/i);
          if (match) {
            const tableName = match[1];
            const table = tables[tableName];
            if (!table) {
              pushLog('error', `表 [${tableName}] 不存在`);
              continue;
            }
            const values = match[3].split(',').map((v) => {
              const val = v.trim();
              if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
                return val.slice(1, -1);
              }
              const num = Number(val);
              return isNaN(num) ? val : num;
            });
            const cols = match[2] ? match[2].split(',').map((c) => c.trim()) : table.columns;
            const row: Record<string, any> = {};
            cols.forEach((c, idx) => {
              row[c] = values[idx] !== undefined ? values[idx] : null;
            });
            table.rows.push(row);
            pushLog('info', `插入 1 行记录到表 [${tableName}]`);
          }
        } else if (/^SELECT/i.test(stmt)) {
          const match = stmt.match(/SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([a-zA-Z0-9_]+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?$/i);
          if (match) {
            const fieldsStr = match[1].trim();
            const tableName = match[2].trim();
            const whereClause = match[3]?.trim();
            const orderCol = match[4]?.trim();
            const orderDir = match[5]?.toUpperCase() || 'ASC';
            const limit = match[6] ? parseInt(match[6], 10) : undefined;

            const table = tables[tableName];
            if (!table) {
              pushLog('error', `表 [${tableName}] 不存在`);
              continue;
            }

            let resultRows = [...table.rows];
            if (whereClause) {
              const condMatch = whereClause.match(/([a-zA-Z0-9_]+)\s*(=|>|<|>=|<=|!=)\s*(.+)/);
              if (condMatch) {
                const [, col, op, valStr] = condMatch;
                let val: any = valStr.trim();
                if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
                  val = val.slice(1, -1);
                } else if (!isNaN(Number(val))) {
                  val = Number(val);
                }
                resultRows = resultRows.filter((r) => {
                  const cell = r[col];
                  if (op === '=') return cell == val;
                  if (op === '>') return cell > val;
                  if (op === '<') return cell < val;
                  if (op === '>=') return cell >= val;
                  if (op === '<=') return cell <= val;
                  if (op === '!=') return cell != val;
                  return true;
                });
              }
            }

            if (orderCol) {
              resultRows.sort((a, b) => {
                if (a[orderCol] < b[orderCol]) return orderDir === 'DESC' ? 1 : -1;
                if (a[orderCol] > b[orderCol]) return orderDir === 'DESC' ? -1 : 1;
                return 0;
              });
            }

            if (limit !== undefined) {
              resultRows = resultRows.slice(0, limit);
            }

            const targetCols = fieldsStr === '*' ? table.columns : fieldsStr.split(',').map((f) => f.trim());
            const headerLine = targetCols.map((c) => c.padEnd(14)).join(' | ');
            const divider = targetCols.map(() => '--------------').join('-+-');
            const dataLines = resultRows.map((r) =>
              targetCols.map((c) => String(r[c] !== undefined ? r[c] : 'NULL').padEnd(14)).join(' | ')
            );
            pushLog('info', `查询结果 (${resultRows.length} 行):\n${headerLine}\n${divider}\n${dataLines.join('\n')}`);
          } else {
            pushLog('info', `执行查询: ${stmt}`);
          }
        } else {
          pushLog('info', `已执行: ${stmt}`);
        }
      }

      pushLog('system', 'SQL 语句执行完毕。');
      resolve({
        status: 'success',
        executionTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
        logs: []
      });
    } catch (err: any) {
      pushLog('error', `SQL 执行异常: ${err?.message || err}`);
      resolve({
        status: 'error',
        executionTimeMs: Math.max(1, Math.round(performance.now() - startTime)),
        logs: [],
        error: err?.message || 'SQL 执行异常'
      });
    }
  });
}
