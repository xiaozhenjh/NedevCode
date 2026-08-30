import { CodeProject } from '../types';

/**
 * Single-file HTML Bundle Exporter Plugin
 * Packages an entire multi-file project into one completely self-contained .html file
 */
export function generateSingleFileHtml(project: CodeProject): string {
  const isHtmlProject = project.executionType === 'html-preview';

  if (isHtmlProject) {
    const htmlFile = project.files.find((f) => f.language === 'html' || f.name.endsWith('.html')) || project.files[0];
    const cssFiles = project.files.filter((f) => (f.language === 'css' || f.name.endsWith('.css')) && f.id !== htmlFile?.id);
    const jsFiles = project.files.filter(
      (f) => (f.language === 'javascript' || f.language === 'typescript' || f.name.endsWith('.js') || f.name.endsWith('.ts')) && f.id !== htmlFile?.id
    );

    let rawHtml = htmlFile?.content || '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div id="app"></div></body></html>';

    // Inline CSS
    let cssBlock = '';
    for (const cf of cssFiles) {
      cssBlock += `\n<!-- Embedded CSS: ${cf.name} -->\n<style id="${cf.name.replace(/[^a-zA-Z0-9_-]/g, '_')}">\n${cf.content}\n</style>\n`;
    }

    // Inline JS
    let jsBlock = '';
    for (const jf of jsFiles) {
      jsBlock += `\n<!-- Embedded JS: ${jf.name} -->\n<script id="${jf.name.replace(/[^a-zA-Z0-9_-]/g, '_')}">\n${jf.content}\n</script>\n`;
    }

    // Replace linked external files with inline content
    for (const cf of cssFiles) {
      const linkRegex = new RegExp(`<link[^>]*href=["']${cf.name}["'][^>]*>`, 'gi');
      if (linkRegex.test(rawHtml)) {
        rawHtml = rawHtml.replace(linkRegex, `<style>\n${cf.content}\n</style>`);
      }
    }

    for (const jf of jsFiles) {
      const scriptRegex = new RegExp(`<script[^>]*src=["']${jf.name}["'][^>]*>\\s*<\\/script>`, 'gi');
      if (scriptRegex.test(rawHtml)) {
        rawHtml = rawHtml.replace(scriptRegex, `<script>\n${jf.content}\n</script>`);
      }
    }

    // Inject Head & Body
    if (rawHtml.includes('<head>')) {
      rawHtml = rawHtml.replace('<head>', `<head>${cssBlock}`);
    } else if (rawHtml.includes('<html>')) {
      rawHtml = rawHtml.replace('<html>', `<html><head><meta charset="utf-8">${cssBlock}</head>`);
    } else {
      rawHtml = `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${escapeHtml(project.title)}</title>\n${cssBlock}</head>\n<body>\n${rawHtml}\n${jsBlock}</body>\n</html>`;
      return rawHtml;
    }

    if (rawHtml.includes('</body>')) {
      rawHtml = rawHtml.replace('</body>', `${jsBlock}</body>`);
    } else {
      rawHtml = `${rawHtml}\n${jsBlock}`;
    }

    return rawHtml;
  }

  // Pure JavaScript or Python single-file interactive standalone container
  const entryFile = project.files.find((f) => f.isEntry) || project.files[0];
  const isPython = project.executionType === 'python-sandbox' || project.language === 'python' || entryFile?.name.endsWith('.py');
  const codeContent = entryFile?.content || '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.title)} - 单文件打包运行器</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
      background: #f7f8fa;
      color: #191919;
      padding: 16px;
      line-height: 1.5;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 12px;
      border: 1px solid #e5e8ed;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.03);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e5e8ed;
    }
    .title {
      font-size: 16px;
      font-weight: 700;
      color: #191919;
    }
    .tag {
      font-size: 11px;
      font-weight: 500;
      color: #0a59f7;
      background: #f0f4fe;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 500;
      color: #ffffff;
      background: #0a59f7;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      user-select: none;
    }
    .btn:hover { background: #0847c4; }
    .console-box {
      margin-top: 16px;
      background: #1e1e1e;
      color: #d4d4d4;
      border-radius: 8px;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      min-height: 180px;
      max-height: 380px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .log-line { margin-bottom: 4px; }
    .log-time { color: #858585; margin-right: 8px; font-size: 10px; }
    .log-error { color: #f43f5e; }
    .log-sys { color: #38bdf8; }
    .code-preview {
      margin-top: 16px;
      background: #fafafa;
      border: 1px solid #eaeaea;
      border-radius: 6px;
      padding: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      max-height: 160px;
      overflow-y: auto;
      color: #333333;
    }
  </style>
  ${isPython ? '<script src="https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js"></script>' : ''}
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="title">${escapeHtml(project.title)}</div>
        <div style="font-size: 11px; color: #666; margin-top: 2px;">${escapeHtml(project.description || '单文件独立运行环境')}</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <span class="tag">${isPython ? 'Python 3' : 'JavaScript'}</span>
        <button id="runBtn" class="btn" onclick="execute()">运行代码</button>
      </div>
    </div>

    <div style="font-size: 12px; font-weight: 600; color: #333;">控制台输出：</div>
    <div id="console" class="console-box">
      <div class="log-line log-sys"><span class="log-time">[系统]</span>单文件已就绪，正在执行...</div>
    </div>

    <div style="margin-top: 16px;">
      <div style="font-size: 12px; font-weight: 600; color: #333; margin-bottom: 4px;">嵌入源码 (${escapeHtml(entryFile?.name || 'main')}):</div>
      <pre class="code-preview"><code>${escapeHtml(codeContent)}</code></pre>
    </div>
  </div>

  <script id="embedded-script" type="text/plain">${codeContent}</script>

  <script>
    const consoleEl = document.getElementById('console');
    const isPy = ${isPython ? 'true' : 'false'};

    function log(msg, type) {
      const line = document.createElement('div');
      line.className = 'log-line' + (type ? ' log-' + type : '');
      const time = new Date().toTimeString().split(' ')[0];
      line.innerHTML = '<span class="log-time">[' + time + ']</span>' + escapeHtml(String(msg));
      consoleEl.appendChild(line);
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    let pyodideInstance = null;

    async function execute() {
      consoleEl.innerHTML = '';
      const code = document.getElementById('embedded-script').textContent;
      log('开始执行...', 'sys');

      if (isPy) {
        try {
          if (!pyodideInstance) {
            log('正在加载 Python 解释器...', 'sys');
            pyodideInstance = await loadPyodide();
            pyodideInstance.setStdout({ batched: (t) => log(t, '') });
            pyodideInstance.setStderr({ batched: (t) => log(t, 'error') });
          }
          await pyodideInstance.runPythonAsync(code);
          log('Python 执行完成', 'sys');
        } catch (err) {
          log(err.message || String(err), 'error');
        }
      } else {
        try {
          const customConsole = {
            log: (...args) => log(args.join(' '), ''),
            info: (...args) => log(args.join(' '), 'sys'),
            warn: (...args) => log(args.join(' '), 'sys'),
            error: (...args) => log(args.join(' '), 'error')
          };
          const fn = new Function('console', code);
          fn(customConsole);
          log('代码执行完成', 'sys');
        } catch (err) {
          log(err.message || String(err), 'error');
        }
      }
    }

    window.onload = execute;
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Trigger browser file download
 */
export function downloadFile(filename: string, content: string, mimeType = 'text/html') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
