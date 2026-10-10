import JSZip from 'jszip';
import { CodeProject, ProjectFile } from '../types';
import { detectLanguage, isImageFile, isMediaFile } from './fileUtils';

export interface PackagingProgressCallback {
  (message: string, progress: number): void;
}

/**
 * Trigger browser file download from Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Trigger browser file download from text content
 */
export function downloadTextFile(content: string, filename: string, mimeType = 'text/html;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

/**
 * Find the primary entry file for a project
 */
export function findProjectEntryFile(project: CodeProject): ProjectFile | null {
  const files = project.files || [];
  if (files.length === 0) return null;

  // 1. Check for HTML entry
  const htmlEntry = files.find(f => f.name === 'index.html') ||
                    files.find(f => f.name.toLowerCase().endsWith('.html'));
  if (htmlEntry) return htmlEntry;

  // 2. Check for Python entry
  const pyEntry = files.find(f => f.name === 'main.py') ||
                  files.find(f => f.name === 'app.py') ||
                  files.find(f => f.name.toLowerCase().endsWith('.py'));
  if (pyEntry) return pyEntry;

  // 3. Check for Markdown entry
  const mdEntry = files.find(f => f.name.toLowerCase() === 'readme.md') ||
                  files.find(f => f.name.toLowerCase().endsWith('.md'));
  if (mdEntry) return mdEntry;

  // 4. Check for JS/TS entry
  const jsEntry = files.find(f => f.name === 'index.js' || f.name === 'main.js') ||
                  files.find(f => f.name.toLowerCase().endsWith('.js'));
  if (jsEntry) return jsEntry;

  // 5. Fallback to active file or first file
  return files.find(f => f.id === project.activeFileId) || files[0];
}

/**
 * Helper to escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 1. REAL LOCAL PACKAGING: Single-File Standalone HTML Bundle
 * Fully inlines CSS, JS, and relative image/media assets into a single self-contained executable HTML.
 */
export async function buildStandaloneHtml(
  project: CodeProject,
  onProgress?: PackagingProgressCallback
): Promise<{ content: string; filename: string }> {
  onProgress?.('正在分析项目结构与依赖...', 10);
  const entryFile = findProjectEntryFile(project);
  const safeTitle = project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'app';
  const filename = `${safeTitle}.standalone.html`;

  const filesMap = new Map<string, ProjectFile>();
  (project.files || []).forEach(f => {
    filesMap.set(f.name.replace(/^\.\//, ''), f);
  });

  // If entry file is HTML: Inline all external CSS, JS, and images
  if (entryFile && entryFile.name.toLowerCase().endsWith('.html')) {
    onProgress?.('正在内联 CSS 样式表与字体资源...', 30);
    let html = entryFile.content || '<!DOCTYPE html><html><head><title>App</title></head><body></body></html>';

    // 1. Inline CSS stylesheets: <link rel="stylesheet" href="...">
    html = html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>|<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi, (match, href1, href2) => {
      const rawHref = (href1 || href2 || '').replace(/^\.\//, '');
      const matchedCss = filesMap.get(rawHref) || filesMap.get(rawHref.split('?')[0]);
      if (matchedCss) {
        return `\n<style type="text/css">\n/* [Inlined by Local Bundler]: ${rawHref} */\n${matchedCss.content}\n</style>`;
      }
      return match;
    });

    onProgress?.('正在内联 JavaScript 模块与脚本...', 60);
    // 2. Inline local JavaScript: <script src="...">
    html = html.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
      const cleanSrc = (src || '').replace(/^\.\//, '');
      // Only inline local project scripts, skip absolute http(s) CDNs
      if (cleanSrc.startsWith('http://') || cleanSrc.startsWith('https://') || cleanSrc.startsWith('//')) {
        return match;
      }
      const matchedJs = filesMap.get(cleanSrc) || filesMap.get(cleanSrc.split('?')[0]);
      if (matchedJs) {
        return `\n<script type="text/javascript">\n/* [Inlined by Local Bundler]: ${cleanSrc} */\n${matchedJs.content}\n</script>`;
      }
      return match;
    });

    onProgress?.('正在内联本地媒体与图像资源 (Data URI)...', 80);
    // 3. Inline images and media assets into Base64 / Data URIs: <img src="...">
    html = html.replace(/(<img\s+[^>]*src=["'])([^"']+)(["'][^>]*>)/gi, (match, prefix, src, suffix) => {
      const cleanSrc = (src || '').replace(/^\.\//, '');
      const matchedAsset = filesMap.get(cleanSrc);
      if (matchedAsset && matchedAsset.content) {
        // If already data URI, keep it; otherwise check if it has content
        return `${prefix}${matchedAsset.content}${suffix}`;
      }
      return match;
    });

    // 4. Inject build metadata banner
    const banner = `<!-- 
  ========================================================================
  [NedevCode Standalone Bundle]
  项目名称: ${escapeHtml(project.title)}
  构建类型: 100% 本地单文件独立离线应用 (Single-File Standalone HTML)
  构建时间: ${new Date().toLocaleString()}
  说明: 本文件内联了全部代码、样式与资源，无需 Web 服务器，支持任意浏览器离线双击秒开运行。
  ========================================================================
-->\n`;
    html = banner + html;

    onProgress?.('打包完成！准备生成单文件...', 100);
    return { content: html, filename };
  }

  // If entry file is Python: Build a self-contained Pyodide Web Runner HTML
  if (entryFile && entryFile.name.toLowerCase().endsWith('.py')) {
    onProgress?.('正在构建 Python 独立自运行 Web 容器...', 50);
    const pythonFilesPayload = JSON.stringify(
      (project.files || []).map(f => ({ name: f.name, content: f.content }))
    );
    const pipPackagesJson = JSON.stringify(project.packages || []);

    const pythonRunnerHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.title)} - Python 独立可执行应用</title>
  <script src="https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    header { background: #1e293b; padding: 12px 18px; border-bottom: 1px solid #334155; display: flex; align-items: center; justify-content: space-between; }
    header h1 { font-size: 14px; font-weight: 600; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    .badge { background: #0284c7; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
    .status { font-size: 12px; color: #94a3b8; }
    #console { flex: 1; padding: 16px; overflow-y: auto; background: #090d16; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; }
    .line { margin-bottom: 2px; }
    .line.out { color: #e2e8f0; }
    .line.err { color: #f87171; }
    .line.sys { color: #38bdf8; }
    .line.succ { color: #4ade80; }
    #canvas-container { padding: 10px; background: #1e293b; border-top: 1px solid #334155; display: none; text-align: center; }
    #toolbar { background: #1e293b; border-top: 1px solid #334155; padding: 8px 16px; display: flex; gap: 8px; }
    button { background: #0284c7; color: white; border: none; padding: 6px 14px; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: 500; }
    button:hover { background: #0369a1; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <header>
    <h1><span>🐍</span> ${escapeHtml(project.title)} <span class="badge">Python 自执行应用</span></h1>
    <div id="status" class="status">正在加载 Python (Pyodide 运行时)...</div>
  </header>
  <div id="console"></div>
  <div id="canvas-container">
    <canvas id="target_canvas" width="600" height="400"></canvas>
  </div>
  <div id="toolbar">
    <button id="runBtn" onclick="runMain()" disabled>重新运行</button>
    <button onclick="clearConsole()">清空控制台</button>
  </div>

  <script>
    const term = document.getElementById('console');
    const statusText = document.getElementById('status');
    const runBtn = document.getElementById('runBtn');
    const projectFiles = ${pythonFilesPayload};
    const pipPackages = ${pipPackagesJson};
    let pyodideInstance = null;

    function appendLog(text, type = 'out') {
      const line = document.createElement('div');
      line.className = 'line ' + type;
      line.textContent = text;
      term.appendChild(line);
      term.scrollTop = term.scrollHeight;
    }

    function clearConsole() {
      term.innerHTML = '';
    }

    async function initPyodide() {
      try {
        appendLog('[系统] 正在初始化 Python WebAssembly 虚拟机...', 'sys');
        pyodideInstance = await loadPyodide({
          stdout: (text) => appendLog(text, 'out'),
          stderr: (text) => appendLog(text, 'err')
        });

        // Setup Virtual Filesystem
        for (const file of projectFiles) {
          const parts = file.name.split('/');
          let dir = '';
          for (let i = 0; i < parts.length - 1; i++) {
            dir = dir ? dir + '/' + parts[i] : parts[i];
            try { pyodideInstance.FS.mkdir(dir); } catch(e){}
          }
          pyodideInstance.FS.writeFile(file.name, file.content);
        }

        if (pipPackages && pipPackages.length > 0) {
          appendLog('[系统] 正在安装依赖包: ' + pipPackages.join(', ') + '...', 'sys');
          await pyodideInstance.loadPackage('micropip');
          const micropip = pyodideInstance.pyimport('micropip');
          await micropip.install(pipPackages);
        }

        statusText.textContent = '运行就绪';
        runBtn.disabled = false;
        appendLog('[系统] 初始化完成，正在执行入口脚本 [${escapeHtml(entryFile.name)}]\\n' + '='.repeat(60), 'succ');
        await runMain();
      } catch (err) {
        appendLog('[错误] ' + err.message, 'err');
        statusText.textContent = '初始化失败';
      }
    }

    async function runMain() {
      if (!pyodideInstance) return;
      try {
        runBtn.disabled = true;
        statusText.textContent = '正在执行...';
        appendLog('\\n>>> python ${escapeHtml(entryFile.name)}', 'sys');
        const code = pyodideInstance.FS.readFile('${escapeHtml(entryFile.name)}', { encoding: 'utf8' });
        await pyodideInstance.runPythonAsync(code);
        appendLog('\\n[进程结束: 正常退出代码 0]', 'succ');
      } catch (err) {
        appendLog('\\n' + err.message, 'err');
      } finally {
        statusText.textContent = '执行完毕';
        runBtn.disabled = false;
      }
    }

    window.addEventListener('load', initPyodide);
  </script>
</body>
</html>`;

    onProgress?.('Python 独立运行包构建完成！', 100);
    return { content: pythonRunnerHtml, filename };
  }

  // Default: Universal Code Runner HTML for JS / Markdown / Plaintext
  onProgress?.('正在构建独立应用执行容器...', 70);
  const codeContent = entryFile ? entryFile.content : '';
  const genericHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.title)} - 独立应用</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; line-height: 1.6; }
    .container { max-width: 800px; margin: 0 auto; background: #1e293b; border-radius: 8px; padding: 24px; border: 1px solid #334155; }
    h1 { font-size: 20px; color: #38bdf8; margin-bottom: 8px; }
    p { color: #94a3b8; font-size: 13px; margin-bottom: 16px; }
    pre { background: #090d16; padding: 16px; border-radius: 6px; overflow-x: auto; color: #e2e8f0; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(project.title)}</h1>
    <p>${escapeHtml(project.description || '由 NedevCode 本地打包生成的独立应用')}</p>
    <pre><code>${escapeHtml(codeContent)}</code></pre>
  </div>
</body>
</html>`;

  onProgress?.('打包完成！', 100);
  return { content: genericHtml, filename };
}

/**
 * 2. REAL LOCAL PACKAGING: Web Production Static Dist ZIP
 * Generates standard production-ready static site bundle (dist layout, .nojekyll, README, package.json).
 */
export async function buildWebDistZip(
  project: CodeProject,
  onProgress?: PackagingProgressCallback
): Promise<{ blob: Blob; filename: string }> {
  onProgress?.('正在创建 Web 生产分发包 (Dist)...', 15);
  const zip = new JSZip();
  const safeTitle = project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'app';
  const filename = `${safeTitle}.web-dist.zip`;

  // 1. Add all folders
  if (project.folders && Array.isArray(project.folders)) {
    project.folders.forEach(f => {
      if (f && f.trim()) zip.folder(f.trim());
    });
  }

  onProgress?.('正在归档项目源代码与静态资源...', 45);
  // 2. Add all project files
  for (const file of project.files || []) {
    if (file.content && file.content.startsWith('data:') && file.content.includes(';base64,')) {
      const base64Data = file.content.split(';base64,')[1];
      zip.file(file.name, base64Data, { base64: true });
    } else {
      zip.file(file.name, file.content || '');
    }
  }

  onProgress?.('正在配置 GitHub Pages 部署规则与说明文档...', 75);
  // 3. Add .nojekyll for seamless GitHub Pages hosting
  zip.file('.nojekyll', '');

  // 4. Add README.md with deployment guide
  const readmeContent = `# ${project.title}

> ${project.description || 'Web 静态生产发布包 (Production Distribution)'}

## 📁 目录规范说明
- 包含完整的静态 Web 项目发布文件。
- 内置 \`.nojekyll\` 文件，支持直接部署至 **GitHub Pages**、**Cloudflare Pages**、**Vercel** 或 **Netlify**。

## 🚀 本地运行方式
在当前目录下使用任意静态服务器运行：
\`\`\`bash
# 方式 1: 使用 Node.js npx serve
npx serve .

# 方式 2: 使用 Python
python -m http.server 8080
\`\`\`

---
*由 NedevCode Studio 自动构建生成*
`;
  zip.file('README.md', readmeContent);

  // 5. Add minimal package.json if not present
  if (!project.files.some(f => f.name === 'package.json')) {
    const pkg = {
      name: safeTitle.toLowerCase(),
      version: '1.0.0',
      description: project.description,
      scripts: {
        serve: 'npx serve .'
      }
    };
    zip.file('package.json', JSON.stringify(pkg, null, 2));
  }

  onProgress?.('正在压缩打包 ZIP 资产...', 90);
  const blob = await zip.generateAsync({ type: 'blob' });
  onProgress?.('Web 生产包构建完成！', 100);
  return { blob, filename };
}

/**
 * 3. REAL LOCAL PACKAGING: Progressive Web App (PWA) Offline Bundle
 * Bundles valid manifest.webmanifest, genuine Service Worker (sw.js using Cache API), pwa-register.js, and icons.
 */
export async function buildPwaZip(
  project: CodeProject,
  onProgress?: PackagingProgressCallback
): Promise<{ blob: Blob; filename: string }> {
  onProgress?.('正在初始化 PWA 规范清单与离线架构...', 15);
  const zip = new JSZip();
  const safeTitle = project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'app';
  const filename = `${safeTitle}.pwa.zip`;

  // 1. Generate Manifest
  const manifest = {
    name: project.title,
    short_name: project.title.slice(0, 12),
    description: project.description || `${project.title} PWA 离线应用`,
    start_url: './index.html',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#3b82f6',
    icons: [
      {
        src: 'icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable'
      }
    ]
  };
  zip.file('manifest.webmanifest', JSON.stringify(manifest, null, 2));

  onProgress?.('正在生成 Service Worker 离线缓存线程 (Cache API)...', 40);
  // 2. Generate Real Service Worker
  const cacheName = `${safeTitle.toLowerCase()}-v1`;
  const filePathsToCache = (project.files || [])
    .filter(f => !f.name.startsWith('.'))
    .map(f => `'./${f.name}'`);

  const swContent = `// [NedevCode PWA Service Worker]
const CACHE_NAME = '${cacheName}';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  ${filePathsToCache.join(',\n  ')}
];

// 1. Install & Cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[PWA SW] Pre-caching offline assets');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[PWA SW] Some assets failed to precache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate & Purge Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[PWA SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Strategy: Cache First, fallback to Network
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback for HTML navigation
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
`;
  zip.file('sw.js', swContent);

  // 3. Generate Registration script
  const registerContent = `// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('[PWA] Service Worker registered with scope:', reg.scope))
      .catch((err) => console.error('[PWA] Service Worker registration failed:', err));
  });
}
`;
  zip.file('pwa-register.js', registerContent);

  // 4. Default Vector Icon
  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="100" fill="#2563eb"/>
  <path d="M160 170 L256 256 L160 342 M260 342 L350 342" fill="none" stroke="#ffffff" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  zip.file('icon.svg', svgIcon);

  onProgress?.('正在组装 PWA 页面入口与资源...', 70);
  // 5. Add all project files, ensuring index.html includes PWA meta tags & script
  const files = project.files || [];
  let hasIndexHtml = false;

  for (const file of files) {
    if (file.name === 'index.html') {
      hasIndexHtml = true;
      let html = file.content;
      // Inject manifest and sw script if not already present
      if (!html.includes('manifest.webmanifest')) {
        html = html.replace('</head>', '  <link rel="manifest" href="./manifest.webmanifest">\n  <meta name="theme-color" content="#3b82f6">\n  <script src="./pwa-register.js"></script>\n</head>');
      }
      zip.file(file.name, html);
    } else {
      if (file.content && file.content.startsWith('data:') && file.content.includes(';base64,')) {
        const base64Data = file.content.split(';base64,')[1];
        zip.file(file.name, base64Data, { base64: true });
      } else {
        zip.file(file.name, file.content || '');
      }
    }
  }

  if (!hasIndexHtml) {
    const defaultIndex = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.title)}</title>
  <link rel="manifest" href="./manifest.webmanifest">
  <meta name="theme-color" content="#3b82f6">
  <script src="./pwa-register.js"></script>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; padding: 32px; border-radius: 12px; text-align: center; border: 1px solid #334155; }
    h1 { color: #38bdf8; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(project.title)}</h1>
    <p>这是一个已启用 Service Worker 离线运行的 PWA 应用。</p>
  </div>
</body>
</html>`;
    zip.file('index.html', defaultIndex);
  }

  onProgress?.('正在压缩打包 PWA 离线安装包...', 90);
  const blob = await zip.generateAsync({ type: 'blob' });
  onProgress?.('PWA 打包完成！', 100);
  return { blob, filename };
}

/**
 * 4. REAL LOCAL PACKAGING: Standard Source Distribution ZIP
 * Clean project source files with auto-generated requirements.txt, package.json, and .gitignore.
 */
export async function buildSourceZip(
  project: CodeProject,
  onProgress?: PackagingProgressCallback
): Promise<{ blob: Blob; filename: string }> {
  onProgress?.('正在整理工程源代码树与依赖清单...', 20);
  const zip = new JSZip();
  const safeTitle = project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'app';
  const filename = `${safeTitle}.source.zip`;

  // Folders
  if (project.folders && Array.isArray(project.folders)) {
    project.folders.forEach(f => {
      if (f && f.trim()) zip.folder(f.trim());
    });
  }

  // Files
  for (const file of project.files || []) {
    if (file.content && file.content.startsWith('data:') && file.content.includes(';base64,')) {
      const base64Data = file.content.split(';base64,')[1];
      zip.file(file.name, base64Data, { base64: true });
    } else {
      zip.file(file.name, file.content || '');
    }
  }

  onProgress?.('正在检查并生成 requirements.txt 与 package.json...', 60);
  // Auto requirements.txt for Python projects
  const hasPy = project.files.some(f => f.name.endsWith('.py'));
  const hasReqs = project.files.some(f => f.name === 'requirements.txt');
  if (hasPy && !hasReqs) {
    const packages = project.packages || [];
    zip.file('requirements.txt', packages.join('\n') + (packages.length > 0 ? '\n' : ''));
  }

  // Auto package.json for JS/TS projects
  const hasJs = project.files.some(f => f.name.endsWith('.js') || f.name.endsWith('.ts') || f.name.endsWith('.html'));
  const hasPkg = project.files.some(f => f.name === 'package.json');
  if (hasJs && !hasPkg) {
    const pkg = {
      name: safeTitle.toLowerCase(),
      version: '1.0.0',
      description: project.description,
      scripts: {
        dev: 'npx serve .'
      }
    };
    zip.file('package.json', JSON.stringify(pkg, null, 2));
  }

  // Auto .gitignore
  if (!project.files.some(f => f.name === '.gitignore')) {
    const gitignore = `node_modules/
dist/
build/
.DS_Store
__pycache__/
*.pyc
.env
.env.local
`;
    zip.file('.gitignore', gitignore);
  }

  onProgress?.('正在压缩打包工程源代码...', 85);
  const blob = await zip.generateAsync({ type: 'blob' });
  onProgress?.('源码包生成完成！', 100);
  return { blob, filename };
}
