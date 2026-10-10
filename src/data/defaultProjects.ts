import { CodeProject } from '../types';

export const PLAYGROUND_PROJECT: CodeProject = {
  id: 'playground',
  title: 'playground',
  description: '单文件演练场 (代码仅保留在内存中，不落盘)',
  language: 'javascript',
  executionType: 'js-sandbox',
  hasSelectedLanguage: true,
  tags: ['Playground', '内存演练'],
  createdAt: 0,
  updatedAt: Date.now(),
  activeFileId: 'playground-file',
  files: [
    {
      id: 'playground-file',
      name: 'playground',
      language: 'javascript',
      isEntry: true,
      content: `// 随意编写任意语言的代码\n// 点击“运行”按钮直接执行代码\nconsole.log("Hello, Playground!");`
    }
  ]
};

export const DEFAULT_PROJECTS: CodeProject[] = [
  {
    id: 'html-hello-world',
    title: 'HTML Hello World',
    description: '最基础的 HTML 网页 Hello World 示例',
    language: 'html',
    executionType: 'html-preview',
    tags: ['HTML', 'Web', 'Hello World'],
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
    activeFileId: 'html-file-index',
    files: [
      {
        id: 'html-file-index',
        name: 'index.html',
        language: 'html',
        isEntry: true,
        content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hello World</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #ffffff;
      color: #111827;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <h1>Hello, World!</h1>
</body>
</html>`
      }
    ]
  },
  {
    id: 'js-hello-world',
    title: 'JavaScript Hello World',
    description: '最基础的 JavaScript 脚本 Hello World 示例',
    language: 'javascript',
    executionType: 'js-sandbox',
    tags: ['JavaScript', 'Hello World'],
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
    activeFileId: 'js-file-main',
    files: [
      {
        id: 'js-file-main',
        name: 'main.js',
        language: 'javascript',
        isEntry: true,
        content: `console.log("Hello, World!");`
      }
    ]
  },
  {
    id: 'python-hello-world',
    title: 'Python Hello World',
    description: '最基础的 Python 3 脚本 Hello World 示例',
    language: 'python',
    executionType: 'python-sandbox',
    tags: ['Python', 'Hello World'],
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
    activeFileId: 'py-file-main',
    files: [
      {
        id: 'py-file-main',
        name: 'main.py',
        language: 'python',
        isEntry: true,
        content: `print("Hello, World!")`
      }
    ]
  },
  {
    id: 'markdown-hello-world',
    title: 'Markdown Hello World',
    description: '最基础的 Markdown 文档 Hello World 示例',
    language: 'markdown',
    executionType: 'markdown-preview',
    tags: ['Markdown', 'Hello World'],
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
    activeFileId: 'md-file-readme',
    files: [
      {
        id: 'md-file-readme',
        name: 'README.md',
        language: 'markdown',
        isEntry: true,
        content: `# Hello World

Hello, World!`
      }
    ]
  }
];
