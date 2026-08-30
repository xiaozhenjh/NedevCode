import { ConsoleLogItem, ExecutionResult, ProjectFile } from '../types';

export function runJavaScriptSandbox(
  code: string,
  onLog: (log: ConsoleLogItem) => void
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
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
      // Create a scoped executor with custom console & standard safe globals
      const executor = new Function('console', 'performance', 'setTimeout', 'setInterval', `
        "use strict";
        return (function() {
          ${code}
        })();
      `);

      const result = executor(customConsole, performance, setTimeout, setInterval);
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

// Global Pyodide Instance Promise
let pyodideInstancePromise: Promise<any> | null = null;

async function getPyodideInstance(onStatusUpdate?: (msg: string) => void): Promise<any> {
  if (pyodideInstancePromise) {
    return pyodideInstancePromise;
  }

  pyodideInstancePromise = new Promise(async (resolve, reject) => {
    try {
      if (typeof (window as any).loadPyodide !== 'function') {
        onStatusUpdate?.('正在加载 Python (Pyodide WebAssembly) 运行时...');
        await new Promise<void>((res, rej) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js';
          script.async = true;
          script.onload = () => res();
          script.onerror = () => rej(new Error('Pyodide CDN 加载失败'));
          document.head.appendChild(script);
        });
      }

      onStatusUpdate?.('正在初始化 Python 3 解释器内核...');
      const pyodide = await (window as any).loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/'
      });
      resolve(pyodide);
    } catch (err) {
      pyodideInstancePromise = null;
      reject(err);
    }
  });

  return pyodideInstancePromise;
}

// Lightweight fallback Python interpreter for instant execution when offline or simple scripts
function runFallbackPython(code: string, pushLog: (level: ConsoleLogItem['level'], msg: string) => void): { returnValue?: unknown; error?: Error } {
  try {
    const lines = code.split('\n');
    let scope: Record<string, any> = {
      print: (...args: any[]) => {
        const text = args.map(a => formatLogArg(a)).join(' ');
        pushLog('log', text);
      },
      len: (obj: any) => (obj ? (obj.length ?? Object.keys(obj).length) : 0),
      range: (start: number, stop?: number, step = 1) => {
        if (stop === undefined) { stop = start; start = 0; }
        const res = [];
        for (let i = start; step > 0 ? i < stop : i > stop; i += step) res.push(i);
        return res;
      },
      sum: (arr: number[]) => arr.reduce((a, b) => a + b, 0),
      min: (...args: any[]) => Math.min(...(Array.isArray(args[0]) ? args[0] : args)),
      max: (...args: any[]) => Math.max(...(Array.isArray(args[0]) ? args[0] : args)),
      abs: Math.abs,
      round: Math.round,
      str: String,
      int: (v: any) => parseInt(v, 10),
      float: (v: any) => parseFloat(v),
      list: (v: any) => Array.from(v || []),
      dict: (v: any) => ({ ...v }),
      True: true,
      False: false,
      None: null
    };

    // Transform basic python syntax to runnable JS
    const jsLines: string[] = [];
    for (let rawLine of lines) {
      let l = rawLine;
      const commentIdx = l.indexOf('#');
      if (commentIdx >= 0) l = l.slice(0, commentIdx);
      if (!l.trim()) continue;

      // Replace python keywords
      let transformed = l
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
        .replace(/\band\b/g, '&&')
        .replace(/\bor\b/g, '||')
        .replace(/\bnot\b/g, '!');

      jsLines.push(transformed);
    }

    const jsCode = `
      "use strict";
      const { print, len, range, sum, min, max, abs, round, str, int, float, list, dict, True, False, None } = scope;
      ${code.replace(/#.*$/gm, '')}
    `;

    // Attempt direct run of JS translated or safe function
    const fn = new Function('scope', `
      with (scope) {
        ${code.split('\n').map(line => {
          if (line.trim().startsWith('#')) return '';
          return line;
        }).join('\n')}
      }
    `);
    
    const ret = fn(scope);
    return { returnValue: ret };
  } catch (err: any) {
    return { error: err };
  }
}

export async function runPythonSandbox(
  code: string,
  onLog: (log: ConsoleLogItem) => void
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

  try {
    // Try Pyodide WebAssembly runner
    pushLog('system', '准备运行 Python 代码...');
    
    let pyodide: any = null;
    try {
      pyodide = await Promise.race([
        getPyodideInstance((status) => pushLog('system', status)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 7000))
      ]);
    } catch (e) {
      // Fallback if network or timeout
      pushLog('info', '使用内置轻量 Python 执行引擎运行...');
      const fbResult = runFallbackPython(code, pushLog);
      const executionTimeMs = parseFloat((performance.now() - startTime).toFixed(2));
      if (fbResult.error) {
        pushLog('error', `执行错误: ${fbResult.error.message}`);
        return {
          status: 'error',
          executionTimeMs,
          error: { message: fbResult.error.message },
          logs
        };
      }
      return {
        status: 'success',
        executionTimeMs,
        logs,
        returnValue: fbResult.returnValue !== undefined ? formatLogArg(fbResult.returnValue) : undefined
      };
    }

    // Set stdout & stderr redirection in Pyodide
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

    // Try extract line number from python traceback
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

export function buildHtmlBundle(files: ProjectFile[]): string {
  const htmlFile = files.find(f => f.language === 'html' || f.name.endsWith('.html')) || files[0];
  const cssFiles = files.filter(f => f.language === 'css' || f.name.endsWith('.css'));
  const jsFiles = files.filter(f => (f.language === 'javascript' || f.language === 'typescript' || f.name.endsWith('.js')) && f.id !== htmlFile?.id);

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

  // Inject CSS
  let cssBlock = '';
  for (const cf of cssFiles) {
    cssBlock += `<style id="${cf.name}">\n${cf.content}\n</style>\n`;
  }

  // Inject JS
  let jsBlock = '';
  for (const jf of jsFiles) {
    jsBlock += `<script id="${jf.name}">\n${jf.content}\n</script>\n`;
  }

  // Replace external script tags like <script src="script.js"></script> with inline script if matched
  for (const jf of jsFiles) {
    const srcRegex = new RegExp(`<script[^>]*src=["']${jf.name}["'][^>]*>\\s*<\\/script>`, 'gi');
    if (srcRegex.test(rawHtml)) {
      rawHtml = rawHtml.replace(srcRegex, `<script id="${jf.name}">\n${jf.content}\n</script>`);
    }
  }

  // If head exists, inject into head, else wrap
  if (rawHtml.includes('<head>')) {
    rawHtml = rawHtml.replace('<head>', `<head>${consoleRelay}${cssBlock}`);
  } else if (rawHtml.includes('<html>')) {
    rawHtml = rawHtml.replace('<html>', `<html><head>${consoleRelay}${cssBlock}</head>`);
  } else {
    rawHtml = `<!DOCTYPE html><html><head>${consoleRelay}${cssBlock}</head><body>${rawHtml}</body></html>`;
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

  // Clean indent formatter for JS/TS/HTML/CSS
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
