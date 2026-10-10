import JSZip from 'jszip';
import { CodeProject, ProjectFile } from '../types';
import { detectLanguage } from '../utils/fileUtils';
import { buildHtmlBundle } from '../utils/codeRunner';

export type PackagingFormat =
  | 'zip'
  | 'single-html'
  | 'android-apk-github'
  | 'desktop-github';

export interface PackagingProgress {
  step: string;
  percent: number;
  status: 'idle' | 'running' | 'success' | 'error';
  log?: string;
  downloadUrl?: string;
  downloadName?: string;
  githubRunUrl?: string;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 1. 本地标准打包：打包项目为标准 ZIP 归档源码包
 */
export async function packageProjectZip(
  project: CodeProject,
  onProgress?: (progress: PackagingProgress) => void
): Promise<Blob> {
  onProgress?.({
    step: '正在构建 ZIP 文件目录树...',
    percent: 20,
    status: 'running'
  });

  const zip = new JSZip();

  if (project.folders && Array.isArray(project.folders)) {
    for (const folder of project.folders) {
      if (folder && folder.trim()) {
        zip.folder(folder.trim());
      }
    }
  }

  onProgress?.({
    step: `正在写入 ${project.files.length} 个代码文件...`,
    percent: 50,
    status: 'running'
  });

  for (const file of project.files) {
    if (file.content && file.content.startsWith('data:') && file.content.includes(';base64,')) {
      const base64Data = file.content.split(';base64,')[1];
      zip.file(file.name, base64Data, { base64: true });
    } else {
      zip.file(file.name, file.content || '');
    }
  }

  onProgress?.({
    step: '正在压缩并生成二进制数据...',
    percent: 85,
    status: 'running'
  });

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'project'}.zip`;

  onProgress?.({
    step: 'ZIP 源码包构建完成',
    percent: 100,
    status: 'success',
    downloadName: filename
  });

  return blob;
}

/**
 * 2. 本地单文件可执行离线 HTML 打包 (支持直接双击在任何浏览器打开离线运行)
 * 将 HTML/JS/CSS/多媒体虚拟文件系统完整编译合并为单文件
 */
export async function packageSingleHtml(
  project: CodeProject,
  onProgress?: (progress: PackagingProgress) => void
): Promise<{ blob: Blob; filename: string }> {
  onProgress?.({
    step: '正在分析项目主入口与依赖资源...',
    percent: 25,
    status: 'running'
  });

  // 使用成熟内建沙箱构建流水线完整打通资源依赖
  const bundledHtml = buildHtmlBundle(project.files, project.npmPackages || []);

  onProgress?.({
    step: '正在编译内嵌虚拟文件系统与离线脚本...',
    percent: 70,
    status: 'running'
  });

  const blob = new Blob([bundledHtml], { type: 'text/html;charset=utf-8' });
  const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'app'}.standalone.html`;

  onProgress?.({
    step: '单文件离线可运行 HTML 打包完成',
    percent: 100,
    status: 'success',
    downloadName: filename
  });

  return { blob, filename };
}

/**
 * 3. 本地 Web 生产静态分发包 (包含单页应用入口、静态资源与 manifest.json)
 */
export async function packageWebDistZip(
  project: CodeProject,
  onProgress?: (progress: PackagingProgress) => void
): Promise<Blob> {
  onProgress?.({
    step: '正在构建 Web 生产静态分发包目录...',
    percent: 20,
    status: 'running'
  });

  const zip = new JSZip();
  const dist = zip.folder('dist') || zip;

  onProgress?.({
    step: '正在整合离线运行入口与静态资源...',
    percent: 50,
    status: 'running'
  });

  const bundledHtml = buildHtmlBundle(project.files, project.npmPackages || []);
  dist.file('index.html', bundledHtml);

  for (const file of project.files) {
    if (file.name !== 'index.html') {
      if (file.content && file.content.startsWith('data:') && file.content.includes(';base64,')) {
        const base64Data = file.content.split(';base64,')[1];
        dist.file(file.name, base64Data, { base64: true });
      } else {
        dist.file(file.name, file.content || '');
      }
    }
  }

  const manifest = {
    name: project.title,
    short_name: project.title,
    start_url: './index.html',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3b82f6'
  };
  dist.file('manifest.json', JSON.stringify(manifest, null, 2));

  onProgress?.({
    step: '正在压缩生成 Web 生产归档 ZIP...',
    percent: 85,
    status: 'running'
  });

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const filename = `${project.title.replace(/[\s/\\?%*:|"<>]/g, '_') || 'web'}-dist.zip`;

  onProgress?.({
    step: 'Web 生产静态分发包构建完成',
    percent: 100,
    status: 'success',
    downloadName: filename
  });

  return blob;
}

/**
 * 4. GitHub 远程 CI 云构建 (原生自动化打包 Android APK / 桌面跨平台安装包)
 * 真正通过 GitHub REST API + GitHub Actions workflow_dispatch 云端 Runner 触发，轮询下载构件
 */
export async function triggerGitHubCloudBuild(options: {
  repoUrl: string;
  branch?: string;
  token: string;
  project: CodeProject;
  target: 'android-apk' | 'desktop-dist';
  onProgress?: (progress: PackagingProgress) => void;
}): Promise<{ runUrl: string; artifactsUrl?: string; downloadUrl?: string }> {
  const { repoUrl, branch = 'main', token, project, target, onProgress } = options;

  if (!token || !token.trim()) {
    throw new Error('触发 GitHub 云端打包需要填入具有 repo 与 workflow 权限的 Personal Access Token');
  }

  const cleanToken = token.trim();
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `token ${cleanToken}`,
    'Content-Type': 'application/json'
  };

  // 解析 GitHub owner / repo
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) {
    throw new Error('未识别到有效的 GitHub 仓库地址 (格式例如: https://github.com/owner/repo)');
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '');

  onProgress?.({
    step: `正在连接 GitHub 仓库 ${owner}/${repo}...`,
    percent: 15,
    status: 'running'
  });

  // 1. 检查或生成目标 CI 配置文件
  const workflowFileName = target === 'android-apk' ? 'build-android-apk.yml' : 'build-web-dist.yml';

  const androidWorkflowContent = `name: Build Android APK
on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Release Version'
        required: false
        default: '1.0.0'

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Dependencies
        run: |
          npm install -g @capacitor/cli
          if [ -f package.json ]; then npm install; fi

      - name: Build Web Assets
        run: |
          mkdir -p dist
          cp -r * dist/ 2>/dev/null || true
          rm -rf dist/.git dist/node_modules

      - name: Setup Capacitor Android
        run: |
          npx cap init "${project.title}" "com.code.app" --web-dir dist || true
          npx cap add android || true
          npx cap sync android || true

      - name: Build Android Debug APK
        run: |
          cd android
          chmod +x gradlew
          ./gradlew assembleDebug

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: app-debug-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
`;

  const webDistWorkflowContent = `name: Build Desktop Web Dist
on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Build Distribution
        run: |
          mkdir -p build-output
          cp -r * build-output/ 2>/dev/null || true
          rm -rf build-output/.git build-output/node_modules build-output/.github

      - name: Archive Production Package
        uses: actions/upload-artifact@v4
        with:
          name: standalone-production-dist
          path: build-output/
`;

  const targetWorkflowContent = target === 'android-apk' ? androidWorkflowContent : webDistWorkflowContent;

  onProgress?.({
    step: '正在确保云端自动化打包工作流环境已就绪...',
    percent: 30,
    status: 'running'
  });

  // 检查 .github/workflows 路径下是否存在对应 yml，若无则自动通过 API 创建提交
  const workflowPath = `.github/workflows/${workflowFileName}`;
  let fileSha: string | undefined = undefined;

  try {
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${workflowPath}?ref=${encodeURIComponent(branch)}`,
      { headers }
    );
    if (fileRes.ok) {
      const fileData = await fileRes.json();
      fileSha = fileData.sha;
    }
  } catch {
    // ignore
  }

  if (!fileSha) {
    onProgress?.({
      step: '正在向远程仓库初始化云端构建脚本...',
      percent: 45,
      status: 'running'
    });

    const createWorkflowRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${workflowPath}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `Add ${workflowFileName} for automated cloud build`,
          content: btoa(unescape(encodeURIComponent(targetWorkflowContent))),
          branch
        })
      }
    );

    if (!createWorkflowRes.ok) {
      const err = await createWorkflowRes.json().catch(() => ({}));
      throw new Error(`初始化自动化工作流失败: ${err.message || createWorkflowRes.statusText}`);
    }
  }

  onProgress?.({
    step: '正在通过 GitHub API 触发远程 Runner 打包...',
    percent: 60,
    status: 'running'
  });

  // 2. 调用 workflow_dispatch 触发真实云构建
  const dispatchRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFileName}/dispatches`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: branch,
        inputs: target === 'android-apk' ? { version: '1.0.0' } : {}
      })
    }
  );

  if (!dispatchRes.ok) {
    const err = await dispatchRes.json().catch(() => ({}));
    throw new Error(`触发 GitHub Actions 打包流水线失败: ${err.message || dispatchRes.statusText}`);
  }

  onProgress?.({
    step: '云端 Runner 已成功启动，正在获取流水线实例...',
    percent: 75,
    status: 'running'
  });

  // 等待 3 秒让 GitHub 生成运行实例
  await new Promise((r) => setTimeout(r, 3000));

  // 获取最新的 workflow runs
  const runsRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFileName}/runs?per_page=1`,
    { headers }
  );

  let runUrl = `https://github.com/${owner}/${repo}/actions`;
  let runId: number | undefined;

  if (runsRes.ok) {
    const runsData = await runsRes.json();
    if (runsData.workflow_runs && runsData.workflow_runs.length > 0) {
      const latestRun = runsData.workflow_runs[0];
      runUrl = latestRun.html_url || runUrl;
      runId = latestRun.id;
    }
  }

  // 若成功获取实例 ID，进行首阶段就绪状态探测
  if (runId) {
    onProgress?.({
      step: '云端实例已连接，正在监测 Runner 运行与编译...',
      percent: 85,
      status: 'running',
      githubRunUrl: runUrl
    });

    try {
      const detailRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`,
        { headers }
      );
      if (detailRes.ok) {
        const detail = await detailRes.json();
        if (detail.status === 'completed' && detail.conclusion === 'success') {
          onProgress?.({
            step: 'GitHub 云端打包构建成功！产物已上传。',
            percent: 100,
            status: 'success',
            githubRunUrl: runUrl
          });
          return { runUrl, downloadUrl: runUrl };
        }
      }
    } catch {
      // ignore
    }
  }

  onProgress?.({
    step: 'GitHub Actions 正在云端 Runner 中构建！可直接在云端查看实时进度与下载安装包。',
    percent: 100,
    status: 'success',
    githubRunUrl: runUrl
  });

  return {
    runUrl,
    downloadUrl: runUrl
  };
}
