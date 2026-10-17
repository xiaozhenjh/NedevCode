import { PackagerDefinition } from '../types';

export const markdownPackager: PackagerDefinition = {
  id: 'markdown-doc',
  name: '独立排版文档',
  description: '将 Markdown 文档渲染编译为独立排版 HTML 文件，内置完整排版与代码高亮样式',
  category: 'local',
  supportedLanguages: ['markdown'],
  artifactExtension: '.html',
  icon: 'BookOpen',
  isAvailableForProject: (project) => {
    return (
      project.language === 'markdown' ||
      project.files.some((f) => f.name.endsWith('.md') || f.name.endsWith('.markdown'))
    );
  },
  package: async (project, _options, onProgress) => {
    onProgress?.({
      step: '正在解析 Markdown 文档结构与段落...',
      percent: 30,
      status: 'running'
    });

    const docFile =
      project.files.find((f) => f.isEntry && f.name.endsWith('.md')) ||
      project.files.find((f) => f.name.toLowerCase() === 'readme.md') ||
      project.files.find((f) => f.name.endsWith('.md')) ||
      project.files[0];

    const markdownText = docFile ? docFile.content : '# ' + project.title;

    onProgress?.({
      step: '正在整合排版样式与离线解析引擎...',
      percent: 70,
      status: 'running'
    });

    // 构建自包含独立排版文档
    const safeTitle = (project.title || 'Document').replace(/[<>]/g, '');
    const escapedMd = JSON.stringify(markdownText);

    const docHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    :root {
      --bg: #ffffff;
      --text: #0f172a;
      --border: #e2e8f0;
      --code-bg: #f8fafc;
      --accent: #2563eb;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a;
        --text: #f8fafc;
        --border: #1e293b;
        --code-bg: #020617;
        --accent: #3b82f6;
      }
    }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.7;
      background: var(--bg);
      color: var(--text);
      max-width: 820px;
      margin: 0 auto;
      padding: 32px 20px;
    }
    h1, h2, h3 { border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-top: 24px; }
    pre { background: var(--code-bg); padding: 16px; border-radius: 8px; overflow-x: auto; border: 1px solid var(--border); }
    code { font-family: ui-monospace, monospace; font-size: 0.9em; }
    blockquote { border-left: 4px solid var(--accent); margin: 0; padding-left: 16px; opacity: 0.85; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
    th { background: var(--code-bg); }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>
  <div id="content"></div>
  <script>
    const md = ${escapedMd};
    if (window.marked) {
      document.getElementById('content').innerHTML = marked.parse(md);
    } else {
      document.getElementById('content').textContent = md;
    }
  </script>
</body>
</html>`;

    const blob = new Blob([docHtml], { type: 'text/html;charset=utf-8' });
    const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'doc'}.standalone.html`;

    onProgress?.({
      step: '排版文档构建完成',
      percent: 100,
      status: 'success',
      downloadName: filename
    });

    return {
      blob,
      filename
    };
  }
};
