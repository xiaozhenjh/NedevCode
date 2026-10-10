import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Upload,
  GitBranch,
  Search,
  Box,
  Check,
  Tag,
  Code,
  Layers,
  ArrowRight,
  ArrowLeft,
  Loader2,
  FileArchive,
  AlertCircle,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CodeLanguage, CodeProject, ExecutionType, GitProvider } from '../types';
import { ModalShell } from './ModalShell';
import { cloneGitHubRepo, cloneGitLabRepo, detectExecutionType, parseGitUrl, loadStoredGitTokens } from '../services/gitService';
import { importProjectFromZip } from '../utils/zipPackager';

export type CreationMode = 'template' | 'blank' | 'zip' | 'git';

export interface ProjectTemplate {
  id: string;
  label: string;
  language: CodeLanguage;
  executionType: ExecutionType;
  category: 'web' | 'script' | 'data' | 'tools';
  categoryLabel: string;
  description: string;
  tags: string[];
  defaultTitle: string;
  defaultDescription: string;
  files: {
    name: string;
    language: CodeLanguage;
    isEntry?: boolean;
    content: string;
    sampleContent: string;
  }[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'web-app',
    label: 'HTML5 Web 应用',
    language: 'html',
    executionType: 'html-preview',
    category: 'web',
    categoryLabel: 'Web 前端',
    description: '包含 HTML、CSS 与 JavaScript 交互的前端模版',
    tags: ['Web', 'HTML5', 'CSS', 'JavaScript'],
    defaultTitle: 'HTML5 Web 应用',
    defaultDescription: '响应式前端交互页面与样式测试',
    files: [
      {
        name: 'index.html',
        language: 'html',
        isEntry: true,
        content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Web App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div className="container">
    <h1>Hello World</h1>
    <p>欢迎使用 Web 交互项目模版。</p>
    <button id="btn">点击交互</button>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
        sampleContent: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Web App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div className="container">
    <h1>Hello World</h1>
    <p>欢迎使用 Web 交互项目模版。</p>
    <button id="btn">点击交互</button>
  </div>
  <script src="app.js"></script>
</body>
</html>`
      },
      {
        name: 'style.css',
        language: 'css',
        content: `body {
  font-family: system-ui, -apple-system, sans-serif;
  background-color: #f8fafc;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  margin: 0;
  padding: 16px;
}

.container {
  background: #ffffff;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  text-align: center;
  max-width: 400px;
  width: 100%;
}

button {
  background: #2563eb;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}`,
        sampleContent: `body {
  font-family: system-ui, -apple-system, sans-serif;
  background-color: #f8fafc;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  margin: 0;
  padding: 16px;
}

.container {
  background: #ffffff;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  text-align: center;
  max-width: 400px;
  width: 100%;
}

button {
  background: #2563eb;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}`
      },
      {
        name: 'app.js',
        language: 'javascript',
        content: `document.getElementById('btn').addEventListener('click', () => {
  alert('点击按钮触发脚本程序！');
});`,
        sampleContent: `document.getElementById('btn').addEventListener('click', () => {
  alert('点击按钮触发脚本程序！');
});`
      }
    ]
  },
  {
    id: 'js-sandbox',
    label: 'JavaScript 脚本',
    language: 'javascript',
    executionType: 'js-sandbox',
    category: 'script',
    categoryLabel: '编程脚本',
    description: 'Node.js / 浏览器 ES6+ JavaScript 执行沙箱与逻辑运算',
    tags: ['JavaScript', 'Node.js', 'ES6', '算法'],
    defaultTitle: 'JavaScript 脚本项目',
    defaultDescription: 'JS 算法计算与控制台逻辑',
    files: [
      {
        name: 'main.js',
        language: 'javascript',
        isEntry: true,
        content: `console.log("Hello, JavaScript!");`,
        sampleContent: `function calculateFibonacci(n) {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    let temp = a + b;
    a = b;
    b = temp;
  }
  return b;
}

console.log("计算斐波那契数列:");
for (let i = 1; i <= 10; i++) {
  console.log(\`Fib(\${i}) = \${calculateFibonacci(i)}\`);
}`
      }
    ]
  },
  {
    id: 'ts-sandbox',
    label: 'TypeScript 沙箱',
    language: 'typescript',
    executionType: 'js-sandbox',
    category: 'script',
    categoryLabel: '编程脚本',
    description: '带类型注解 (interface) 与类型断言的 TypeScript 脚本模版',
    tags: ['TypeScript', 'TS', '类型安全'],
    defaultTitle: 'TypeScript 项目',
    defaultDescription: '强类型 TypeScript 脚本沙箱',
    files: [
      {
        name: 'main.ts',
        language: 'typescript',
        isEntry: true,
        content: `console.log("Hello, TypeScript!");`,
        sampleContent: `interface UserProfile {
  id: number;
  name: string;
  role: 'admin' | 'developer' | 'guest';
}

function greetUser(user: UserProfile): string {
  return \`欢迎 \${user.name} (\${user.role}) 进入 TypeScript 沙箱!\`;
}

const currentUser: UserProfile = {
  id: 101,
  name: '开发者',
  role: 'developer'
};

console.log(greetUser(currentUser));`
      }
    ]
  },
  {
    id: 'python-app',
    label: 'Python 3 解释器',
    language: 'python',
    executionType: 'python-sandbox',
    category: 'script',
    categoryLabel: '编程脚本',
    description: '基于 Pyodide / Skulpt 的 Python 3 WASM Web 运行环境',
    tags: ['Python', 'Python3', '数据计算'],
    defaultTitle: 'Python 3 交互程序',
    defaultDescription: 'Python 3 逻辑处理与科学计算',
    files: [
      {
        name: 'main.py',
        language: 'python',
        isEntry: true,
        content: `print("Hello, Python!")`,
        sampleContent: `# Python 3 示例代码
def analyze_numbers(numbers):
    avg = sum(numbers) / len(numbers)
    max_val = max(numbers)
    min_val = min(numbers)
    return {
        "count": len(numbers),
        "average": round(avg, 2),
        "max": max_val,
        "min": min_val
    }

data = [12, 45, 67, 89, 23, 56, 78, 90]
result = analyze_numbers(data)

print("--- Python 数据分析结果 ---")
for key, value in result.items():
    print(f"{key}: {value}")`
      }
    ]
  },
  {
    id: 'markdown-doc',
    label: 'Markdown 规范文档',
    language: 'markdown',
    executionType: 'markdown-preview',
    category: 'data',
    categoryLabel: '数据与文档',
    description: '支持 GitHub 风格 Markdown (GFM)、表格与代码块预览',
    tags: ['Markdown', '文档', 'GFM'],
    defaultTitle: 'Markdown 说明文档',
    defaultDescription: '富文本文档编写与预览',
    files: [
      {
        name: 'README.md',
        language: 'markdown',
        isEntry: true,
        content: `# 我的 Markdown 项目\n\n欢迎编写项目文档！`,
        sampleContent: `# 项目设计说明书

欢迎使用 **Markdown 沙箱预览** 系统！

## 功能特性
- [x] GFM 表格排版支持
- [x] 代码高亮显示
- [x] 任务项清单

\`\`\`javascript
function hello() {
  console.log("Hello, Markdown!");
}
\`\`\`

| 功能 | 状态 | 备注 |
| :--- | :--- | :--- |
| 排版预览 | 支持 | 实时渲染 |`
      }
    ]
  },
  {
    id: 'sql-db',
    label: 'SQL 关系数据库',
    language: 'sql',
    executionType: 'sql-sandbox',
    category: 'data',
    categoryLabel: '数据与文档',
    description: 'SQLite 内存数据库建表 (CREATE TABLE)、插入与 SELECT 条件查询',
    tags: ['SQL', '数据库', 'SQLite'],
    defaultTitle: 'SQL 内存数据库项目',
    defaultDescription: 'SQL 数据表建立与结构化查询',
    files: [
      {
        name: 'main.sql',
        language: 'sql',
        isEntry: true,
        content: `-- SQL 数据查询\nSELECT 'Hello SQL' AS message;`,
        sampleContent: `-- 1. 创建员工信息表
CREATE TABLE employees (
    id INT PRIMARY KEY,
    name VARCHAR(50),
    department VARCHAR(50),
    salary INT
);

-- 2. 插入测试记录
INSERT INTO employees VALUES (1, '张三', '技术部', 12000);
INSERT INTO employees VALUES (2, '李四', '产品部', 11000);
INSERT INTO employees VALUES (3, '王五', '技术部', 15000);

-- 3. 条件筛选与排序查询
SELECT name, department, salary
FROM employees
WHERE salary >= 10000
ORDER BY salary DESC;`
      }
    ]
  },
  {
    id: 'shell-script',
    label: 'Shell 命令行脚本',
    language: 'shell',
    executionType: 'shell-sandbox',
    category: 'tools',
    categoryLabel: '系统与工具',
    description: 'Unix / Linux Bash 交互脚本仿真沙箱，支持 echo, ls, cat, grep 等命令',
    tags: ['Shell', 'Bash', '命令行'],
    defaultTitle: 'Shell 脚本项目',
    defaultDescription: 'Bash 命令行自动化脚本',
    files: [
      {
        name: 'run.sh',
        language: 'shell',
        isEntry: true,
        content: `#!/bin/bash\necho "Hello Shell!"`,
        sampleContent: `#!/bin/bash
# Shell 命令行仿真脚本

echo "=== 正在初始化系统环境 ==="
echo "当前用户: $USER"
echo "工作路径: $PWD"
echo "当前时间: $(date)"

echo ""
echo "=== 工程文件目录清单 ==="
ls`
      }
    ]
  },
  {
    id: 'json-data',
    label: 'JSON 配置与数据',
    language: 'json',
    executionType: 'json-sandbox',
    category: 'data',
    categoryLabel: '数据与文档',
    description: 'JSON 节点数据校验、格式化美化与数据校验展示',
    tags: ['JSON', '配置', '数据结构'],
    defaultTitle: 'JSON 配置项目',
    defaultDescription: '结构化 JSON 数据与参数定义',
    files: [
      {
        name: 'config.json',
        language: 'json',
        isEntry: true,
        content: `{\n  "name": "my-project",\n  "version": "1.0.0"\n}`,
        sampleContent: `{
  "app": {
    "name": "CodeSpace IDE",
    "version": "2.5.0",
    "debugMode": true
  },
  "modules": [
    "editor",
    "sandbox",
    "git"
  ]
}`
      }
    ]
  },
  {
    id: 'css-design',
    label: 'CSS 样式与特效',
    language: 'css',
    executionType: 'html-preview',
    category: 'web',
    categoryLabel: 'Web 前端',
    description: 'CSS3 样式表与动画效果测试页面（附 HTML 测试载体）',
    tags: ['CSS', 'CSS3', '动画', '样式'],
    defaultTitle: 'CSS 特效设计',
    defaultDescription: 'CSS3 视觉效果与过渡动画',
    files: [
      {
        name: 'index.html',
        language: 'html',
        isEntry: true,
        content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div className="card">
    <h2>CSS3 视觉特效</h2>
  </div>
</body>
</html>`,
        sampleContent: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div className="card">
    <h2>CSS3 视觉特效</h2>
  </div>
</body>
</html>`
      },
      {
        name: 'style.css',
        language: 'css',
        content: `body {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #0f172a;
  color: #fff;
  font-family: sans-serif;
}`,
        sampleContent: `body {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #0f172a;
  color: #fff;
  font-family: sans-serif;
}`
      }
    ]
  },
  {
    id: 'blank-project',
    label: '空白空项目',
    language: 'javascript',
    executionType: 'js-sandbox',
    category: 'tools',
    categoryLabel: '系统与工具',
    description: '仅包含初始文件的空项目模版',
    tags: ['空白', '自定义'],
    defaultTitle: '新项目',
    defaultDescription: '自定义工程结构',
    files: [
      {
        name: 'index.js',
        language: 'javascript',
        isEntry: true,
        content: `// 空白项目入口文件\n`,
        sampleContent: `// 空白项目入口文件\n`
      }
    ]
  }
];

export const TEMPLATE_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'web', label: 'Web 前端' },
  { id: 'script', label: '编程脚本' },
  { id: 'data', label: '数据与文档' },
  { id: 'tools', label: '系统与工具' }
];

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (project: CodeProject) => void;
  onOpenGitClone?: () => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateProject
}) => {
  // Current step state (1, 2, or 3)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [creationMode, setCreationMode] = useState<CreationMode>('template');

  // Step 2: Template mode states
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('web-app');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Step 2: Git mode states (unified single URL input + PAT dropdown)
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  const [savedTokens, setSavedTokens] = useState<ReturnType<typeof loadStoredGitTokens>>([]);
  const [selectedTokenMode, setSelectedTokenMode] = useState<string>('onetime');
  const [gitToken, setGitToken] = useState('');
  const [isTokenDropdownOpen, setIsTokenDropdownOpen] = useState(false);
  const [gitCloneStatus, setGitCloneStatus] = useState<'idle' | 'cloning' | 'success' | 'error'>('idle');
  const [gitProgressPct, setGitProgressMsgPct] = useState(0);
  const [gitProgressMsg, setGitProgressMsg] = useState('');
  const [gitErrorMsg, setGitErrorMsg] = useState('');
  const [clonedGitResult, setClonedGitResult] = useState<{
    files: any[];
    folders: string[];
    title: string;
    description: string;
    executionType: ExecutionType;
    branch: string;
    commitSha: string;
  } | null>(null);

  // Step 2: ZIP mode states
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipParseStatus, setZipParseStatus] = useState<'idle' | 'parsing' | 'success' | 'error'>('idle');
  const [zipErrorMsg, setZipErrorMsg] = useState('');
  const [parsedZipResult, setParsedZipResult] = useState<{
    files: any[];
    folders: string[];
    title: string;
  } | null>(null);

  // Step 3: Title & Description states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isTitleUserEdited, setIsTitleUserEdited] = useState(false);
  const [includeSampleCode, setIncludeSampleCode] = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const zipFileInputRef = useRef<HTMLInputElement>(null);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);

  // Current selected template
  const currentTemplate = useMemo(() => {
    return PROJECT_TEMPLATES.find(t => t.id === selectedTemplateId) || PROJECT_TEMPLATES[0];
  }, [selectedTemplateId]);

  // Click outside to close token dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tokenDropdownRef.current && !tokenDropdownRef.current.contains(e.target as Node)) {
        setIsTokenDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset modal state on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setCreationMode('template');
      setSelectedTemplateId('web-app');
      setSearchQuery('');
      setSelectedCategory('all');
      setGitUrl('');
      setGitBranch('');
      setGitToken('');
      setGitCloneStatus('idle');
      setGitProgressMsgPct(0);
      setGitProgressMsg('');
      setGitErrorMsg('');
      setClonedGitResult(null);
      setZipFile(null);
      setZipParseStatus('idle');
      setZipErrorMsg('');
      setParsedZipResult(null);
      setTitle(currentTemplate.defaultTitle);
      setDescription(currentTemplate.defaultDescription);
      setIsTitleUserEdited(false);
      setIncludeSampleCode(true);
      setSelectedTags(currentTemplate.tags);

      // Load Saved Tokens
      const tokens = loadStoredGitTokens();
      setSavedTokens(tokens);
      if (tokens.length > 0 && selectedTokenMode === 'onetime') {
        setSelectedTokenMode(`saved-${tokens[0].id}`);
      }
    }
  }, [isOpen]);

  const activeTokenValue = useMemo(() => {
    if (selectedTokenMode === 'onetime') {
      return gitToken.trim();
    }
    if (selectedTokenMode.startsWith('saved-')) {
      const tokenId = selectedTokenMode.replace('saved-', '');
      const found = savedTokens.find(t => t.id === tokenId);
      return found ? found.token.trim() : gitToken.trim();
    }
    return gitToken.trim();
  }, [selectedTokenMode, gitToken, savedTokens]);

  const activeTokenLabel = useMemo(() => {
    if (selectedTokenMode === 'onetime') {
      return '一次性填入';
    }
    const tokenId = selectedTokenMode.replace('saved-', '');
    const found = savedTokens.find(t => t.id === tokenId);
    return found ? `${found.label} (${found.provider.toUpperCase()})` : '一次性填入';
  }, [selectedTokenMode, savedTokens]);

  const handleModalClose = () => {
    onClose();
  };

  // Filter templates by query and category
  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return PROJECT_TEMPLATES.filter((tmpl) => {
      if (selectedCategory !== 'all' && tmpl.category !== selectedCategory) {
        return false;
      }
      if (!query) return true;

      const matchLabel = tmpl.label.toLowerCase().includes(query);
      const matchDesc = tmpl.description.toLowerCase().includes(query);
      const matchLang = tmpl.language.toLowerCase().includes(query);
      const matchCategory = tmpl.categoryLabel.toLowerCase().includes(query);
      const matchTags = tmpl.tags.some(t => t.toLowerCase().includes(query));

      return matchLabel || matchDesc || matchLang || matchCategory || matchTags;
    });
  }, [searchQuery, selectedCategory]);

  // Handle Git Clone in Step 2
  const handleStartGitClone = async () => {
    if (!gitUrl.trim()) {
      setGitErrorMsg('请输入 Git 仓库地址 (例如 https://github.com/owner/repo)');
      return;
    }

    const parsed = parseGitUrl(gitUrl);
    if (!parsed) {
      setGitErrorMsg('未能识别有效的 GitHub / GitLab 仓库 URL 格式');
      return;
    }

    setGitCloneStatus('cloning');
    setGitProgressMsgPct(15);
    setGitProgressMsg('正在连接 Git 远程服务...');
    setGitErrorMsg('');

    try {
      let result;
      const progressCb = (msg: string) => {
        setGitProgressMsg(msg);
        if (msg.includes('分支')) setGitProgressMsgPct(40);
        else if (msg.includes('文件树')) setGitProgressMsgPct(70);
        else if (msg.includes('完成')) setGitProgressMsgPct(95);
      };

      if (parsed.provider === 'gitlab') {
        result = await cloneGitLabRepo({
          projectPath: `${parsed.owner}/${parsed.repo}`,
          branch: gitBranch.trim() || parsed.branch,
          token: activeTokenValue || undefined,
          customDomain: parsed.customDomain,
          onProgress: progressCb
        });
      } else {
        result = await cloneGitHubRepo({
          owner: parsed.owner,
          repo: parsed.repo,
          branch: gitBranch.trim() || parsed.branch,
          token: activeTokenValue || undefined,
          onProgress: progressCb
        });
      }

      const execType = detectExecutionType(result.files);

      setGitProgressMsgPct(100);
      setGitProgressMsg('仓库解析成功！');
      setGitCloneStatus('success');

      const cloneRes = {
        files: result.files,
        folders: result.folders,
        title: result.title || parsed.repo,
        description: result.description || `从 Git ${parsed.owner}/${parsed.repo} 克隆的项目`,
        executionType: execType,
        branch: result.branch,
        commitSha: result.commitSha
      };

      setClonedGitResult(cloneRes);

      if (!isTitleUserEdited) {
        setTitle(cloneRes.title);
        setDescription(cloneRes.description);
      }
      setSelectedTags(['Git', parsed.provider === 'gitlab' ? 'GitLab' : 'GitHub']);
    } catch (err: any) {
      setGitCloneStatus('error');
      setGitErrorMsg(err?.message || '克隆失败，请检查网络或 Access Token 校验。');
    }
  };

  // Handle ZIP File Upload in Step 2
  const handleSelectZipFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setZipFile(file);
    setZipParseStatus('parsing');
    setZipErrorMsg('');

    try {
      const parsed = await importProjectFromZip(file);
      if (parsed.files.length === 0) {
        setZipParseStatus('error');
        setZipErrorMsg('ZIP 压缩包中未检测到有效的文件内容');
        return;
      }

      setZipParseStatus('success');
      const projTitle = file.name.replace(/\.zip$/i, '');
      const zipRes = {
        files: parsed.files,
        folders: parsed.folders,
        title: projTitle
      };
      setParsedZipResult(zipRes);

      if (!isTitleUserEdited) {
        setTitle(projTitle);
        setDescription(`从 ZIP 压缩包 (${file.name}) 解压导入的项目`);
      }
      setSelectedTags(['ZIP', '本地导入']);
    } catch (err: any) {
      setZipParseStatus('error');
      setZipErrorMsg(err?.message || '解析 ZIP 文件失败，请确认文件完整且未加密');
    }
  };

  // Navigation: Step 1 -> Step 2 or Step 3
  const handleStep1Next = () => {
    if (creationMode === 'blank') {
      setTitle('新项目');
      setDescription('自定义空白工程文件');
      setSelectedTags(['空白']);
      setStep(3);
    } else {
      setStep(2);
    }
  };

  // Navigation: Step 2 -> Step 3
  const handleStep2Next = () => {
    if (creationMode === 'template') {
      if (!isTitleUserEdited) {
        setTitle(currentTemplate.defaultTitle);
        setDescription(currentTemplate.defaultDescription);
      }
      setSelectedTags(currentTemplate.tags);
      setStep(3);
    } else if (creationMode === 'git') {
      if (gitCloneStatus !== 'success') {
        if (gitUrl.trim()) {
          handleStartGitClone();
        } else {
          setGitErrorMsg('请输入正确的 Git 仓库地址');
        }
        return;
      }
      setStep(3);
    } else if (creationMode === 'zip') {
      if (zipParseStatus !== 'success') {
        setZipErrorMsg('请先上传并解析有效的 ZIP 压缩包');
        return;
      }
      setStep(3);
    }
  };

  // Navigation: Back button
  const handleBack = () => {
    if (step === 3) {
      if (creationMode === 'blank') {
        setStep(1);
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      setStep(1);
    }
  };

  // Final Step 3 Project Creation
  const handleFinalCreate = () => {
    const projectTitle = title.trim() || '新项目';
    const projectDesc = description.trim() || '自定义项目';

    let files: any[] = [];
    let folders: string[] = [];
    let executionType: ExecutionType = 'js-sandbox';

    if (creationMode === 'template') {
      const fileIdPrefix = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      files = currentTemplate.files.map((f, idx) => ({
        id: `${fileIdPrefix}-${idx}`,
        name: f.name,
        language: f.language,
        isEntry: f.isEntry,
        content: includeSampleCode ? f.sampleContent : f.content
      }));
      executionType = currentTemplate.executionType;
    } else if (creationMode === 'git' && clonedGitResult) {
      const fileIdPrefix = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      files = clonedGitResult.files.map((f: any, idx: number) => ({
        id: `${fileIdPrefix}-${idx}`,
        name: f.name,
        language: f.language,
        isEntry: f.isEntry,
        content: f.content
      }));
      folders = clonedGitResult.folders || [];
      executionType = clonedGitResult.executionType;
    } else if (creationMode === 'zip' && parsedZipResult) {
      const fileIdPrefix = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      files = parsedZipResult.files.map((f: any, idx: number) => ({
        id: `${fileIdPrefix}-${idx}`,
        name: f.name,
        language: f.language,
        isEntry: idx === 0,
        content: f.content
      }));
      folders = parsedZipResult.folders || [];
      executionType = detectExecutionType(files);
    } else {
      // Blank Mode
      const fileIdPrefix = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      files = [
        {
          id: `${fileIdPrefix}-0`,
          name: 'main.js',
          language: 'javascript' as CodeLanguage,
          isEntry: true,
          content: `// 零依赖空白项目\nconsole.log("Hello, World!");\n`
        }
      ];
      executionType = 'js-sandbox';
    }

    const newProj: CodeProject = {
      id: 'proj-' + Date.now(),
      title: projectTitle,
      description: projectDesc,
      language: files[0]?.language || 'javascript',
      executionType,
      tags: selectedTags.length > 0 ? selectedTags : ['工程'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files,
      folders,
      activeFileId: files[0]?.id || ''
    };

    onCreateProject(newProj);
    handleModalClose();
  };

  const parsedGitInfo = parseGitUrl(gitUrl);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleModalClose}
      title="新建项目"
      icon={<Layers className="w-4 h-4 text-blue-500" />}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* Step Indicator Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center space-x-2 text-xs font-medium">
            <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-mono-code ${
              step === 1 ? 'bg-blue-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            }`}>1</span>
            <span className={step === 1 ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-tertiary)]'}>
              选择方式
            </span>

            {creationMode !== 'blank' && (
              <>
                <span className="text-[var(--text-tertiary)]">/</span>
                <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-mono-code ${
                  step === 2 ? 'bg-blue-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}>2</span>
                <span className={step === 2 ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-tertiary)]'}>
                  配置内容
                </span>
              </>
            )}

            <span className="text-[var(--text-tertiary)]">/</span>
            <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-mono-code ${
              step === 3 ? 'bg-blue-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            }`}>{creationMode === 'blank' ? 2 : 3}</span>
            <span className={step === 3 ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-tertiary)]'}>
              命名与简介
            </span>
          </div>

          <span className="text-[11px] text-[var(--text-tertiary)] font-mono-code">
            步骤 {step} / {creationMode === 'blank' ? 2 : 3}
          </span>
        </div>

        {/* ================= STEP 1: MODE SELECTION ================= */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-secondary)] font-medium">
              请选择要创建项目的来源方式：
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option 1: Template */}
              <button
                type="button"
                onClick={() => setCreationMode('template')}
                className={`text-left p-3 rounded-xl border transition-all flex flex-col justify-between press-feedback ${
                  creationMode === 'template'
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Layers className="w-4 h-4 text-blue-500" />
                  </div>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">从模板创建</span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  选择 Web、算法脚本、数据库或文档等内置模版
                </p>
              </button>

              {/* Option 2: Blank */}
              <button
                type="button"
                onClick={() => setCreationMode('blank')}
                className={`text-left p-3 rounded-xl border transition-all flex flex-col justify-between press-feedback ${
                  creationMode === 'blank'
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Box className="w-4 h-4 text-blue-500" />
                  </div>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">从空白创建</span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  跳过配置页面，快速创建纯净结构项目
                </p>
              </button>

              {/* Option 3: ZIP Import */}
              <button
                type="button"
                onClick={() => setCreationMode('zip')}
                className={`text-left p-3 rounded-xl border transition-all flex flex-col justify-between press-feedback ${
                  creationMode === 'zip'
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <FileArchive className="w-4 h-4 text-blue-500" />
                  </div>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">从 ZIP 导入</span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  上传本地 `.zip` 代码压缩包，自动解压构建项目
                </p>
              </button>

              {/* Option 4: Git Import */}
              <button
                type="button"
                onClick={() => setCreationMode('git')}
                className={`text-left p-3 rounded-xl border transition-all flex flex-col justify-between press-feedback ${
                  creationMode === 'git'
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <GitBranch className="w-4 h-4 text-blue-500" />
                  </div>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">从 Git 导入</span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  从 GitHub / GitLab 仓库拉取克隆项目
                </p>
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 2: SOURCE CONFIGURATION ================= */}
        {step === 2 && (
          <div className="space-y-3">
            {/* 1. Template Mode */}
            {creationMode === 'template' && (
              <div className="space-y-3">
                {/* Search Bar & Categories */}
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索模版名称、语言、描述 (例如 python, html, sql)..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg pl-9 pr-8 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors placeholder:text-[var(--text-tertiary)]"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-blue-500 hover:text-blue-600"
                      >
                        <X className="w-3.5 h-3.5 text-blue-500" />
                      </button>
                    )}
                  </div>

                  {/* Categories */}
                  <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar">
                    {TEMPLATE_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium shrink-0 transition-colors press-feedback ${
                          selectedCategory === cat.id
                            ? 'bg-blue-500 text-white shadow-xs'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Templates Clean Grid */}
                <div className="max-h-56 overflow-y-auto pr-1 space-y-2 border border-[var(--border-subtle)] rounded-xl p-2 bg-[var(--bg-tertiary)]/50">
                  {filteredTemplates.length === 0 ? (
                    <div className="py-8 text-center space-y-1">
                      <p className="text-xs text-[var(--text-secondary)]">未找到匹配模版</p>
                      <button type="button" onClick={() => setSearchQuery('')} className="text-xs text-blue-500 hover:underline">
                        重置搜索
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {filteredTemplates.map((tmpl) => {
                        const isSelected = selectedTemplateId === tmpl.id;
                        return (
                          <button
                            key={tmpl.id}
                            type="button"
                            onClick={() => setSelectedTemplateId(tmpl.id)}
                            className={`text-left p-2.5 rounded-lg border transition-all flex flex-col justify-between relative press-feedback ${
                              isSelected
                                ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1 pr-4">
                                <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                  {tmpl.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                                {tmpl.description}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="absolute top-2 right-2 w-4 h-4 bg-white border border-blue-500 text-blue-500 rounded-full flex items-center justify-center shadow-xs">
                                <Check className="w-2.5 h-2.5 text-blue-500" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. Simplified Git Import Mode */}
            {creationMode === 'git' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">Git 仓库地址</label>
                  <input
                    type="text"
                    value={gitUrl}
                    onChange={(e) => {
                      setGitUrl(e.target.value);
                      setGitErrorMsg('');
                    }}
                    placeholder="例如: https://github.com/owner/repo 或 https://gitlab.com/group/repo"
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500 font-mono-code"
                  />
                  {parsedGitInfo && (
                    <div className="text-[11px] text-[var(--text-tertiary)] flex items-center space-x-1.5 pt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                      <span>
                        识别目标: <strong className="text-[var(--text-primary)]">{parsedGitInfo.owner}/{parsedGitInfo.repo}</strong> ({parsedGitInfo.provider.toUpperCase()})
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">指定分支 (可选)</label>
                    <input
                      type="text"
                      value={gitBranch}
                      onChange={(e) => setGitBranch(e.target.value)}
                      placeholder="默认主分支 (main / master)"
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1" ref={tokenDropdownRef}>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-[var(--text-secondary)]">Access Token (私有仓库可选)</label>
                      {savedTokens.length > 0 && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setIsTokenDropdownOpen(!isTokenDropdownOpen)}
                            className="text-[11px] text-blue-500 hover:text-blue-600 flex items-center space-x-1"
                          >
                            <span>{activeTokenLabel}</span>
                            <ChevronDown className="w-3 h-3 text-blue-500" />
                          </button>
                          {isTokenDropdownOpen && (
                            <div className="absolute right-0 bottom-full mb-1 z-50 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg shadow-lg py-1 w-48 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTokenMode('onetime');
                                  setIsTokenDropdownOpen(false);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                              >
                                一次性填入
                              </button>
                              {savedTokens.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedTokenMode(`saved-${t.id}`);
                                    setIsTokenDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] truncate"
                                >
                                  {t.label} ({t.provider.toUpperCase()})
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {selectedTokenMode === 'onetime' && (
                      <input
                        type="password"
                        value={gitToken}
                        onChange={(e) => setGitToken(e.target.value)}
                        placeholder="Personal Access Token"
                        className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500 font-mono-code"
                      />
                    )}
                  </div>
                </div>

                {/* Animated Progress Bar Track */}
                {gitCloneStatus === 'cloning' && (
                  <div className="p-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                      <span className="flex items-center space-x-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                        <span>{gitProgressMsg || '正在拉取仓库代码...'}</span>
                      </span>
                      <span className="font-mono-code font-semibold text-blue-500">{gitProgressPct}%</span>
                    </div>
                    <div className="w-full bg-[var(--bg-secondary)] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 h-full transition-all duration-300 rounded-full"
                        style={{ width: `${gitProgressPct}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Git Clone Success Summary */}
                {gitCloneStatus === 'success' && clonedGitResult && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center space-x-1.5 text-blue-500 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      <span>仓库解析成功！</span>
                    </div>
                    <p className="text-[var(--text-secondary)]">
                      解析得到 {clonedGitResult.files.length} 个代码文件，包含 {clonedGitResult.folders?.length || 0} 个子目录。
                    </p>
                  </div>
                )}

                {/* Git Clone Error */}
                {gitErrorMsg && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-2 text-xs text-rose-600 dark:text-rose-400">
                    <AlertCircle className="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
                    <span>{gitErrorMsg}</span>
                  </div>
                )}

                {gitCloneStatus !== 'success' && (
                  <button
                    type="button"
                    onClick={handleStartGitClone}
                    disabled={gitCloneStatus === 'cloning'}
                    className="w-full py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium press-feedback flex items-center justify-center space-x-1.5 shadow-xs disabled:opacity-50"
                  >
                    {gitCloneStatus === 'cloning' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                        <span>拉取中...</span>
                      </>
                    ) : (
                      <>
                        <GitBranch className="w-3.5 h-3.5 text-blue-500" />
                        <span>解析并拉取 Git 仓库</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* 3. ZIP Upload Mode */}
            {creationMode === 'zip' && (
              <div className="space-y-3">
                <input
                  ref={zipFileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleSelectZipFile}
                  className="hidden"
                />

                <div
                  onClick={() => zipFileInputRef.current?.click()}
                  className="border-2 border-dashed border-[var(--border-subtle)] hover:border-blue-500 bg-[var(--bg-tertiary)]/50 p-6 rounded-xl text-center cursor-pointer transition-colors space-y-2"
                >
                  <FileArchive className="w-8 h-8 text-blue-500 mx-auto opacity-80" />
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">点击选择或拖拽 `.zip` 压缩包文件</p>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">自动读取压缩包并构建应用代码树</p>
                  </div>
                </div>

                {zipParseStatus === 'parsing' && (
                  <div className="p-3 bg-[var(--bg-tertiary)] rounded-xl flex items-center space-x-2 text-xs text-[var(--text-secondary)]">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span>正在解压与分析 ZIP 压缩包文件...</span>
                  </div>
                )}

                {zipParseStatus === 'success' && parsedZipResult && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center space-x-1.5 text-blue-500 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      <span>ZIP 解析完毕 ({parsedZipResult.title})</span>
                    </div>
                    <p className="text-[var(--text-secondary)]">
                      包含 {parsedZipResult.files.length} 个代码文件，{parsedZipResult.folders?.length || 0} 个子文件夹。
                    </p>
                  </div>
                )}

                {zipErrorMsg && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-2 text-xs text-rose-600 dark:text-rose-400">
                    <AlertCircle className="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
                    <span>{zipErrorMsg}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= STEP 3: NAMING & DETAILS ================= */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">项目名称 *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setIsTitleUserEdited(true);
                }}
                placeholder="请输入项目名称"
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">项目简介描述</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="填写项目简介描述 (可选)"
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Template sample code toggle */}
            {creationMode === 'template' && (
              <label className="flex items-center space-x-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={includeSampleCode}
                  onChange={(e) => setIncludeSampleCode(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-blue-500 accent-blue-500"
                />
                <span>填充模版示例代码（取消勾选生成简洁空模版）</span>
              </label>
            )}

            {/* Tags selection */}
            {selectedTags.length > 0 && (
              <div className="flex items-center space-x-1 text-xs pt-1">
                <Tag className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[var(--text-tertiary)] text-[11px]">标签:</span>
                {selectedTags.map((tag) => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-500 rounded font-medium">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modal Navigation Buttons */}
        <div className="flex items-center space-x-2 pt-2 border-t border-[var(--border-subtle)]">
          {step === 1 ? (
            <button
              type="button"
              onClick={handleModalClose}
              className="flex-1 py-2.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs font-medium press-feedback border border-[var(--border-subtle)]"
            >
              取消
            </button>
          ) : (
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 py-2.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs font-medium press-feedback border border-[var(--border-subtle)] flex items-center justify-center space-x-1"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-blue-500" />
              <span>上一步</span>
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={step === 1 ? handleStep1Next : handleStep2Next}
              className="flex-1 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium press-feedback shadow-xs flex items-center justify-center space-x-1.5"
            >
              <span>下一步</span>
              <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalCreate}
              className="flex-1 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium press-feedback shadow-xs flex items-center justify-center space-x-1.5"
            >
              <Check className="w-3.5 h-3.5 text-blue-500" />
              <span>创建项目</span>
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
};
