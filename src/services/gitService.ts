import { CodeLanguage, CodeProject, ExecutionType, GitProvider, GitRepoConfig, ProjectFile, GitSavedToken, GitBranchItem, GitCommitItem, FileDiffItem, GitHubWorkflowRun, GitHubArtifact, GitHubReleaseItem } from '../types';
import { detectLanguage, detectExecutionTypeFromFiles } from '../utils/fileUtils';

export interface GitParsedUrl {
  provider: GitProvider;
  owner: string;
  repo: string;
  branch?: string;
  customDomain?: string;
  rawUrl: string;
}

// Safely decode UTF-8 from Base64
export function decodeBase64Utf8(base64Str: string): string {
  try {
    const cleanStr = base64Str.replace(/\s/g, '');
    const binary = atob(cleanStr);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    try {
      return atob(base64Str);
    } catch {
      return '';
    }
  }
}

// Safely encode UTF-8 to Base64
export function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Detect execution type from files list
export function detectExecutionType(files: ProjectFile[]): ExecutionType {
  return detectExecutionTypeFromFiles(files);
}

// Check if a file is likely binary
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'bmp',
  'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov', 'avi',
  'zip', 'tar', 'gz', '7z', 'rar',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'exe', 'dll', 'so', 'dylib', 'bin', 'wasm',
  'woff', 'woff2', 'ttf', 'eot', 'otf'
]);

export function isBinaryFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? BINARY_EXTENSIONS.has(ext) : false;
}

// Parse GitHub or GitLab URL
export function parseGitUrl(inputUrl: string): GitParsedUrl | null {
  if (!inputUrl || typeof inputUrl !== 'string') return null;
  const raw = inputUrl.trim();

  // 1. SSH format: git@github.com:owner/repo.git or git@gitlab.com:group/subgroup/repo.git
  const sshMatch = raw.match(/^git@([^:]+):([^\/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    const domain = sshMatch[1];
    const owner = sshMatch[2];
    const repo = sshMatch[3].replace(/\.git$/, '');
    const provider: GitProvider = domain.includes('gitlab') ? 'gitlab' : 'github';
    return {
      provider,
      owner,
      repo,
      rawUrl: raw,
      customDomain: domain.includes('github.com') || domain.includes('gitlab.com') ? undefined : `https://${domain}`
    };
  }

  // 2. HTTP / HTTPS format
  try {
    let normalized = raw;
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      // If user typed owner/repo or github.com/owner/repo
      if (normalized.includes('gitlab')) {
        normalized = 'https://' + normalized;
      } else if (!normalized.includes('/')) {
        return null;
      } else if (normalized.startsWith('github.com/')) {
        normalized = 'https://' + normalized;
      } else {
        // e.g. "facebook/react" default to github
        normalized = 'https://github.com/' + normalized;
      }
    }

    const urlObj = new URL(normalized);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.replace(/^\/+|\/+$/g, '');
    const segments = pathname.split('/');

    if (segments.length < 2) return null;

    if (hostname.includes('gitlab')) {
      // GitLab structure:
      // https://gitlab.com/group/subgroup/repo or https://gitlab.com/group/repo/-/tree/branch_name
      let branch: string | undefined = undefined;
      const treeIndex = segments.indexOf('tree');
      let repoSegments = segments;

      if (treeIndex > 0) {
        // If there's /-/tree/branch or /tree/branch
        const branchIndex = treeIndex + 1;
        if (branchIndex < segments.length) {
          branch = segments.slice(branchIndex).join('/');
        }
        const minusIndex = segments.indexOf('-');
        const cutIndex = minusIndex !== -1 && minusIndex < treeIndex ? minusIndex : treeIndex;
        repoSegments = segments.slice(0, cutIndex);
      }

      const repo = repoSegments[repoSegments.length - 1].replace(/\.git$/, '');
      const owner = repoSegments.slice(0, repoSegments.length - 1).join('/');

      return {
        provider: 'gitlab',
        owner,
        repo,
        branch,
        rawUrl: raw,
        customDomain: hostname === 'gitlab.com' ? undefined : `${urlObj.protocol}//${urlObj.host}`
      };
    } else {
      // GitHub structure:
      // https://github.com/owner/repo or https://github.com/owner/repo/tree/branch
      const owner = segments[0];
      const repo = segments[1].replace(/\.git$/, '');
      let branch: string | undefined = undefined;

      if (segments[2] === 'tree' && segments[3]) {
        branch = segments.slice(3).join('/');
      }

      return {
        provider: 'github',
        owner,
        repo,
        branch,
        rawUrl: raw,
        customDomain: hostname === 'github.com' ? undefined : `${urlObj.protocol}//${urlObj.host}`
      };
    }
  } catch {
    return null;
  }
}

// Clone/Fetch GitHub Repository
export async function cloneGitHubRepo(options: {
  owner: string;
  repo: string;
  branch?: string;
  token?: string;
  onProgress?: (msg: string) => void;
}): Promise<{
  title: string;
  description: string;
  files: ProjectFile[];
  folders: string[];
  branch: string;
  commitSha: string;
}> {
  const { owner, repo, token, onProgress } = options;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json'
  };
  if (token && token.trim()) {
    headers['Authorization'] = `token ${token.trim()}`;
  }

  onProgress?.('正在连接 GitHub 仓库信息...');

  // 1. Get repository metadata (default branch, description)
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!repoRes.ok) {
    if (repoRes.status === 404) {
      throw new Error(`仓库未找到或为私有仓库。如为私有仓库，请在下方提供有效的 GitHub Access Token。`);
    } else if (repoRes.status === 401 || repoRes.status === 403) {
      const errJson = await repoRes.json().catch(() => ({}));
      throw new Error(errJson.message || `GitHub API 认证失败或超出访问速率限制。建议填入 Personal Access Token。`);
    }
    throw new Error(`连接 GitHub 失败 (HTTP ${repoRes.status})`);
  }
  const repoInfo = await repoRes.json();
  const targetBranch = options.branch || repoInfo.default_branch || 'main';
  const description = repoInfo.description || `从 GitHub ${owner}/${repo} 克隆的项目`;

  onProgress?.(`正在获取分支 [${targetBranch}] 最新提交...`);

  // 2. Get target branch commit sha
  const branchRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(targetBranch)}`,
    { headers }
  );
  if (!branchRes.ok) {
    throw new Error(`获取分支 [${targetBranch}] 失败，请检查分支名称是否存在。`);
  }
  const branchInfo = await branchRes.json();
  const commitSha = branchInfo.commit?.sha || '';
  const treeSha = branchInfo.commit?.commit?.tree?.sha || commitSha;

  onProgress?.('正在解析项目文件树...');

  // 3. Get recursive tree
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    { headers }
  );
  if (!treeRes.ok) {
    throw new Error(`获取仓库文件树失败 (HTTP ${treeRes.status})`);
  }
  const treeData = await treeRes.json();
  const treeItems: Array<{ path: string; mode: string; type: string; sha: string; size?: number }> = treeData.tree || [];

  // Filter valid files and folders
  const rawFolders = new Set<string>();
  const filesToFetch: Array<{ path: string; sha: string; size?: number }> = [];

  for (const item of treeItems) {
    if (item.type === 'tree') {
      rawFolders.add(item.path);
    } else if (item.type === 'blob') {
      // Skip git metadata or binary files
      if (item.path.startsWith('.git/')) continue;
      if (isBinaryFile(item.path)) continue;
      // Skip files larger than 1MB for browser safety
      if (item.size && item.size > 1024 * 1024) continue;

      filesToFetch.push({ path: item.path, sha: item.sha, size: item.size });
      
      const parts = item.path.split('/');
      parts.pop();
      let cur = '';
      for (const p of parts) {
        cur = cur ? `${cur}/${p}` : p;
        rawFolders.add(cur);
      }
    }
  }

  if (filesToFetch.length === 0) {
    throw new Error('仓库中未找到可导入的文本/代码文件。');
  }

  onProgress?.(`准备导入 ${filesToFetch.length} 个代码文件...`);

  // 4. Fetch file contents (batch in chunks to avoid overwhelming browser)
  const projectFiles: ProjectFile[] = [];
  const BATCH_SIZE = 6;

  for (let i = 0; i < filesToFetch.length; i += BATCH_SIZE) {
    const chunk = filesToFetch.slice(i, i + BATCH_SIZE);
    onProgress?.(`正在下载文件 (${Math.min(i + BATCH_SIZE, filesToFetch.length)} / ${filesToFetch.length})...`);

    const chunkResults = await Promise.all(
      chunk.map(async (fileItem) => {
        try {
          // If token provided, use authenticated blob API; otherwise fallback to raw or blob API
          let textContent = '';
          if (token && token.trim()) {
            const blobRes = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/git/blobs/${fileItem.sha}`,
              { headers }
            );
            if (blobRes.ok) {
              const blobData = await blobRes.json();
              if (blobData.encoding === 'base64') {
                textContent = decodeBase64Utf8(blobData.content);
              }
            }
          }

          if (!textContent) {
            const rawRes = await fetch(
              `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${fileItem.path}`
            );
            if (rawRes.ok) {
              textContent = await rawRes.text();
            } else {
              // Fallback to unauthenticated blob API
              const blobRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/blobs/${fileItem.sha}`
              );
              if (blobRes.ok) {
                const blobData = await blobRes.json();
                if (blobData.encoding === 'base64') {
                  textContent = decodeBase64Utf8(blobData.content);
                }
              }
            }
          }

          const lang = detectLanguage(fileItem.path);
          return {
            id: `file-${Math.random().toString(36).slice(2, 9)}`,
            name: fileItem.path,
            language: lang,
            content: textContent,
            isEntry: false
          };
        } catch {
          return null;
        }
      })
    );

    for (const res of chunkResults) {
      if (res) projectFiles.push(res);
    }
  }

  // Determine entry file
  if (projectFiles.length > 0) {
    const entryPriority = ['index.html', 'main.py', 'index.js', 'main.js', 'src/index.html', 'src/main.py', 'src/index.js', 'src/main.js', 'App.tsx', 'src/App.tsx'];
    let entryFound = false;
    for (const priority of entryPriority) {
      const match = projectFiles.find(f => f.name.toLowerCase() === priority.toLowerCase());
      if (match) {
        match.isEntry = true;
        entryFound = true;
        break;
      }
    }
    if (!entryFound) {
      projectFiles[0].isEntry = true;
    }
  }

  return {
    title: repo,
    description,
    files: projectFiles,
    folders: Array.from(rawFolders),
    branch: targetBranch,
    commitSha
  };
}

// Push Changes to GitHub Repository
export async function pushGitHubRepo(options: {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  files: ProjectFile[];
  commitMessage?: string;
  onProgress?: (msg: string) => void;
}): Promise<{
  commitSha: string;
  commitUrl: string;
}> {
  const { owner, repo, branch, token, files, commitMessage, onProgress } = options;

  if (!token || !token.trim()) {
    throw new Error('推送到 GitHub 需要提供具有 repo 权限的 Personal Access Token (PAT)。');
  }

  const cleanToken = token.trim();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `token ${cleanToken}`,
    'Content-Type': 'application/json'
  };

  onProgress?.('正在获取远程分支当前最新状态...');

  // 1. Get branch ref
  let latestCommitSha = '';
  let branchExists = true;

  const refRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { headers }
  );

  if (refRes.ok) {
    const refData = await refRes.json();
    latestCommitSha = refData.object.sha;
  } else if (refRes.status === 404) {
    branchExists = false;
    // Branch does not exist, get default branch to branch off from
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
      throw new Error(`无法访问仓库 ${owner}/${repo}，请确认 Token 权限有效。`);
    }
    const repoInfo = await repoRes.json();
    const defaultBranch = repoInfo.default_branch || 'main';

    const defaultRefRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(defaultBranch)}`,
      { headers }
    );
    if (!defaultRefRes.ok) {
      throw new Error(`无法获取默认分支 [${defaultBranch}] 状态。`);
    }
    const defaultRefData = await defaultRefRes.json();
    latestCommitSha = defaultRefData.object.sha;
  } else {
    const err = await refRes.json().catch(() => ({}));
    throw new Error(err.message || `获取远程分支失败 (HTTP ${refRes.status})`);
  }

  onProgress?.('正在获取基础提交文件树...');

  // 2. Get tree SHA of the latest commit
  const commitRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/commits/${latestCommitSha}`,
    { headers }
  );
  if (!commitRes.ok) {
    throw new Error(`获取提交对象失败 (HTTP ${commitRes.status})`);
  }
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree?.sha;

  onProgress?.(`正在准备构建提交包含 ${files.length} 个文件...`);

  // 3. Create Tree
  // Construct tree nodes directly with string content
  const treeNodes = files.map((file) => ({
    path: file.name.replace(/^\/+/, ''),
    mode: '100644',
    type: 'blob',
    content: file.content
  }));

  const createTreeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeNodes
      })
    }
  );

  if (!createTreeRes.ok) {
    const err = await createTreeRes.json().catch(() => ({}));
    throw new Error(err.message || `创建 Git Tree 失败 (HTTP ${createTreeRes.status})`);
  }

  const newTreeData = await createTreeRes.json();
  const newTreeSha = newTreeData.sha;

  onProgress?.('正在创建 Git Commit 提交...');

  // 4. Create Commit
  const message = commitMessage?.trim() || `Update project via Web Code Studio (${new Date().toLocaleString()})`;
  const createCommitRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/commits`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        tree: newTreeSha,
        parents: [latestCommitSha]
      })
    }
  );

  if (!createCommitRes.ok) {
    const err = await createCommitRes.json().catch(() => ({}));
    throw new Error(err.message || `创建 Commit 失败 (HTTP ${createCommitRes.status})`);
  }

  const newCommit = await createCommitRes.json();
  const newCommitSha = newCommit.sha;

  onProgress?.(`正在更新远程分支 [${branch}]...`);

  // 5. Update or Create Ref
  if (branchExists) {
    const updateRefRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          sha: newCommitSha,
          force: false
        })
      }
    );

    if (!updateRefRes.ok) {
      const err = await updateRefRes.json().catch(() => ({}));
      throw new Error(err.message || `更新远程分支引用失败 (HTTP ${updateRefRes.status})`);
    }
  } else {
    // Create new branch reference
    const createRefRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: newCommitSha
        })
      }
    );

    if (!createRefRes.ok) {
      const err = await createRefRes.json().catch(() => ({}));
      throw new Error(err.message || `创建新分支 [${branch}] 失败 (HTTP ${createRefRes.status})`);
    }
  }

  return {
    commitSha: newCommitSha,
    commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommitSha}`
  };
}

// Clone/Fetch GitLab Repository
export async function cloneGitLabRepo(options: {
  projectPath: string; // e.g. "gitlab-org/gitlab" or "user/repo"
  branch?: string;
  token?: string;
  customDomain?: string;
  onProgress?: (msg: string) => void;
}): Promise<{
  title: string;
  description: string;
  files: ProjectFile[];
  folders: string[];
  branch: string;
  commitSha: string;
}> {
  const { projectPath, token, customDomain, onProgress } = options;
  const baseUrl = (customDomain || 'https://gitlab.com').replace(/\/+$/, '');
  const encodedPath = encodeURIComponent(projectPath.trim());

  const headers: Record<string, string> = {};
  if (token && token.trim()) {
    headers['PRIVATE-TOKEN'] = token.trim();
  }

  onProgress?.('正在连接 GitLab 仓库信息...');

  // 1. Get project metadata
  const projectRes = await fetch(`${baseUrl}/api/v4/projects/${encodedPath}`, { headers });
  if (!projectRes.ok) {
    if (projectRes.status === 404) {
      throw new Error(`GitLab 项目未找到或为私有项目。如为私有项目，请提供 GitLab Access Token。`);
    } else if (projectRes.status === 401 || projectRes.status === 403) {
      throw new Error(`GitLab 认证失败，请检查 Access Token 是否具有 read_api 权限。`);
    }
    throw new Error(`连接 GitLab 失败 (HTTP ${projectRes.status})`);
  }
  const projectInfo = await projectRes.json();
  const targetBranch = options.branch || projectInfo.default_branch || 'main';
  const description = projectInfo.description || `从 GitLab ${projectPath} 克隆的项目`;

  onProgress?.(`正在获取分支 [${targetBranch}] 最新文件树...`);

  // 2. Fetch repository tree recursively
  const treeRes = await fetch(
    `${baseUrl}/api/v4/projects/${encodedPath}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(targetBranch)}`,
    { headers }
  );
  if (!treeRes.ok) {
    throw new Error(`获取 GitLab 文件树失败 (HTTP ${treeRes.status})`);
  }
  const treeItems: Array<{ id: string; name: string; type: string; path: string; mode: string }> = await treeRes.json();

  const rawFolders = new Set<string>();
  const filesToFetch: Array<{ path: string; id: string }> = [];

  for (const item of treeItems) {
    if (item.type === 'tree') {
      rawFolders.add(item.path);
    } else if (item.type === 'blob') {
      if (isBinaryFile(item.path)) continue;
      filesToFetch.push({ path: item.path, id: item.id });

      const parts = item.path.split('/');
      parts.pop();
      let cur = '';
      for (const p of parts) {
        cur = cur ? `${cur}/${p}` : p;
        rawFolders.add(cur);
      }
    }
  }

  if (filesToFetch.length === 0) {
    throw new Error('GitLab 仓库中未找到可导入的代码/文本文件。');
  }

  onProgress?.(`准备下载 ${filesToFetch.length} 个代码文件...`);

  // 3. Fetch file raw contents
  const projectFiles: ProjectFile[] = [];
  const BATCH_SIZE = 6;

  for (let i = 0; i < filesToFetch.length; i += BATCH_SIZE) {
    const chunk = filesToFetch.slice(i, i + BATCH_SIZE);
    onProgress?.(`正在下载文件 (${Math.min(i + BATCH_SIZE, filesToFetch.length)} / ${filesToFetch.length})...`);

    const results = await Promise.all(
      chunk.map(async (fileItem) => {
        try {
          const rawRes = await fetch(
            `${baseUrl}/api/v4/projects/${encodedPath}/repository/files/${encodeURIComponent(fileItem.path)}/raw?ref=${encodeURIComponent(targetBranch)}`,
            { headers }
          );
          if (rawRes.ok) {
            const content = await rawRes.text();
            const lang = detectLanguage(fileItem.path);
            return {
              id: `file-${Math.random().toString(36).slice(2, 9)}`,
              name: fileItem.path,
              language: lang,
              content,
              isEntry: false
            };
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    for (const res of results) {
      if (res) projectFiles.push(res);
    }
  }

  // Determine entry
  if (projectFiles.length > 0) {
    const entryPriority = ['index.html', 'main.py', 'index.js', 'main.js', 'src/index.html', 'src/main.py', 'src/index.js', 'src/main.js', 'App.tsx', 'src/App.tsx'];
    let entryFound = false;
    for (const priority of entryPriority) {
      const match = projectFiles.find(f => f.name.toLowerCase() === priority.toLowerCase());
      if (match) {
        match.isEntry = true;
        entryFound = true;
        break;
      }
    }
    if (!entryFound) {
      projectFiles[0].isEntry = true;
    }
  }

  return {
    title: projectInfo.name || projectPath.split('/').pop() || 'gitlab-project',
    description,
    files: projectFiles,
    folders: Array.from(rawFolders),
    branch: targetBranch,
    commitSha: ''
  };
}

// Push Changes to GitLab Repository
export async function pushGitLabRepo(options: {
  projectPath: string;
  branch: string;
  token: string;
  files: ProjectFile[];
  commitMessage?: string;
  customDomain?: string;
  onProgress?: (msg: string) => void;
}): Promise<{
  commitSha: string;
  commitUrl: string;
}> {
  const { projectPath, branch, token, files, commitMessage, customDomain, onProgress } = options;

  if (!token || !token.trim()) {
    throw new Error('推送到 GitLab 需要提供具有 write_repository 或 api 权限的 Access Token。');
  }

  const baseUrl = (customDomain || 'https://gitlab.com').replace(/\/+$/, '');
  const encodedPath = encodeURIComponent(projectPath.trim());
  const headers: Record<string, string> = {
    'PRIVATE-TOKEN': token.trim(),
    'Content-Type': 'application/json'
  };

  onProgress?.('正在获取 GitLab 分支现有文件状态...');

  // 1. Get existing files to distinguish between create and update
  const existingFilesSet = new Set<string>();
  const treeRes = await fetch(
    `${baseUrl}/api/v4/projects/${encodedPath}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(branch)}`,
    { headers }
  );
  if (treeRes.ok) {
    const items: Array<{ path: string; type: string }> = await treeRes.json();
    for (const item of items) {
      if (item.type === 'blob') {
        existingFilesSet.add(item.path);
      }
    }
  }

  onProgress?.('正在构建 GitLab Commit 批量操作...');

  // 2. Build actions array for GitLab Commits API
  const actions = files.map((file) => {
    const cleanPath = file.name.replace(/^\/+/, '');
    const isExisting = existingFilesSet.has(cleanPath);
    return {
      action: isExisting ? 'update' : 'create',
      file_path: cleanPath,
      content: file.content
    };
  });

  const message = commitMessage?.trim() || `Update project via Web Code Studio (${new Date().toLocaleString()})`;

  onProgress?.(`正在提交至 GitLab 分支 [${branch}]...`);

  const commitRes = await fetch(`${baseUrl}/api/v4/projects/${encodedPath}/repository/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      branch,
      commit_message: message,
      actions
    })
  });

  if (!commitRes.ok) {
    const err = await commitRes.json().catch(() => ({}));
    throw new Error(err.message || `GitLab 提交失败 (HTTP ${commitRes.status})`);
  }

  const commitData = await commitRes.json();
  const commitSha = commitData.id || '';
  const commitUrl = commitData.web_url || `${baseUrl}/${projectPath}/-/commit/${commitSha}`;

  return {
    commitSha,
    commitUrl
  };
}

// Storage key for PAT tokens
const GIT_TOKENS_STORAGE_KEY = 'code_studio_git_tokens';

export function loadStoredGitTokens(): GitSavedToken[] {
  try {
    const raw = localStorage.getItem(GIT_TOKENS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredGitTokens(tokens: GitSavedToken[]): void {
  try {
    localStorage.setItem(GIT_TOKENS_STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // Ignore storage quota error
  }
}

export function addStoredGitToken(tokenData: Omit<GitSavedToken, 'id' | 'createdAt'>): GitSavedToken {
  const tokens = loadStoredGitTokens();
  const newToken: GitSavedToken = {
    ...tokenData,
    id: `token-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now()
  };
  const filtered = tokens.filter(t => t.token !== tokenData.token);
  filtered.unshift(newToken);
  saveStoredGitTokens(filtered);
  return newToken;
}

export function deleteStoredGitToken(id: string): void {
  const tokens = loadStoredGitTokens();
  const filtered = tokens.filter(t => t.id !== id);
  saveStoredGitTokens(filtered);
}

// Validate Personal Access Token Connectivity
export async function validateGitToken(options: {
  provider: GitProvider;
  token: string;
  customDomain?: string;
}): Promise<{
  valid: boolean;
  username: string;
  avatarUrl?: string;
  name?: string;
}> {
  const { provider, token, customDomain } = options;
  if (!token || !token.trim()) {
    throw new Error('请填写 Token');
  }

  const cleanToken = token.trim();

  if (provider === 'github') {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${cleanToken}`
      }
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Token 无效或已过期');
      throw new Error(`校验失败 (HTTP ${res.status})`);
    }
    const data = await res.json();
    return {
      valid: true,
      username: data.login,
      avatarUrl: data.avatar_url,
      name: data.name || data.login
    };
  } else {
    const baseUrl = (customDomain || 'https://gitlab.com').replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/api/v4/user`, {
      headers: {
        'PRIVATE-TOKEN': cleanToken
      }
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('GitLab Token 无效或无 API 权限');
      throw new Error(`校验失败 (HTTP ${res.status})`);
    }
    const data = await res.json();
    return {
      valid: true,
      username: data.username,
      avatarUrl: data.avatar_url,
      name: data.name || data.username
    };
  }
}

// Fetch Remote Branch List
export async function fetchBranchList(options: {
  provider: GitProvider;
  owner: string;
  repo: string;
  token?: string;
  customDomain?: string;
}): Promise<GitBranchItem[]> {
  const { provider, owner, repo, token, customDomain } = options;

  if (provider === 'github') {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json'
    };
    if (token && token.trim()) {
      headers['Authorization'] = `token ${token.trim()}`;
    }

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, { headers });
    if (!res.ok) {
      throw new Error(`获取 GitHub 分支列表失败 (HTTP ${res.status})`);
    }
    const data = await res.json();
    return data.map((b: any) => ({
      name: b.name,
      protected: b.protected,
      commitSha: b.commit?.sha
    }));
  } else {
    const baseUrl = (customDomain || 'https://gitlab.com').replace(/\/+$/, '');
    const encodedPath = encodeURIComponent(`${owner}/${repo}`);
    const headers: Record<string, string> = {};
    if (token && token.trim()) {
      headers['PRIVATE-TOKEN'] = token.trim();
    }

    const res = await fetch(`${baseUrl}/api/v4/projects/${encodedPath}/repository/branches?per_page=100`, { headers });
    if (!res.ok) {
      throw new Error(`获取 GitLab 分支列表失败 (HTTP ${res.status})`);
    }
    const data = await res.json();
    return data.map((b: any) => ({
      name: b.name,
      isDefault: b.default,
      protected: b.protected,
      commitSha: b.commit?.id
    }));
  }
}

// Create Remote Branch
export async function createRemoteBranch(options: {
  provider: GitProvider;
  owner: string;
  repo: string;
  newBranch: string;
  fromBranch?: string;
  token: string;
  customDomain?: string;
}): Promise<{ name: string; sha: string }> {
  const { provider, owner, repo, newBranch, fromBranch = 'main', token, customDomain } = options;

  if (!token || !token.trim()) {
    throw new Error('新建分支需要写入权限的 Token');
  }

  if (provider === 'github') {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${token.trim()}`,
      'Content-Type': 'application/json'
    };

    // Get SHA of fromBranch
    const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(fromBranch)}`, { headers });
    if (!refRes.ok) {
      throw new Error(`获取源分支 [${fromBranch}] 状态失败`);
    }
    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    // Create new ref
    const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: `refs/heads/${newBranch.trim()}`,
        sha: baseSha
      })
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.message || `创建分支 [${newBranch}] 失败`);
    }

    return { name: newBranch.trim(), sha: baseSha };
  } else {
    const baseUrl = (customDomain || 'https://gitlab.com').replace(/\/+$/, '');
    const encodedPath = encodeURIComponent(`${owner}/${repo}`);
    const headers: Record<string, string> = {
      'PRIVATE-TOKEN': token.trim(),
      'Content-Type': 'application/json'
    };

    const res = await fetch(`${baseUrl}/api/v4/projects/${encodedPath}/repository/branches`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        branch: newBranch.trim(),
        ref: fromBranch
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `创建 GitLab 分支 [${newBranch}] 失败`);
    }

    const data = await res.json();
    return { name: data.name, sha: data.commit?.id || '' };
  }
}

// Fetch Commit History
export async function fetchCommitHistory(options: {
  provider: GitProvider;
  owner: string;
  repo: string;
  branch: string;
  token?: string;
  customDomain?: string;
}): Promise<GitCommitItem[]> {
  const { provider, owner, repo, branch, token, customDomain } = options;

  if (provider === 'github') {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json'
    };
    if (token && token.trim()) {
      headers['Authorization'] = `token ${token.trim()}`;
    }

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=25`,
      { headers }
    );
    if (!res.ok) {
      throw new Error(`获取 GitHub 提交历史失败 (HTTP ${res.status})`);
    }
    const data = await res.json();
    return data.map((item: any) => ({
      sha: item.sha,
      shortSha: item.sha.slice(0, 7),
      message: item.commit?.message || '',
      authorName: item.commit?.author?.name || item.author?.login || 'Git User',
      authorEmail: item.commit?.author?.email,
      authorAvatar: item.author?.avatar_url,
      date: item.commit?.author?.date ? new Date(item.commit.author.date).toLocaleString() : '',
      url: item.html_url
    }));
  } else {
    const baseUrl = (customDomain || 'https://gitlab.com').replace(/\/+$/, '');
    const encodedPath = encodeURIComponent(`${owner}/${repo}`);
    const headers: Record<string, string> = {};
    if (token && token.trim()) {
      headers['PRIVATE-TOKEN'] = token.trim();
    }

    const res = await fetch(
      `${baseUrl}/api/v4/projects/${encodedPath}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=25`,
      { headers }
    );
    if (!res.ok) {
      throw new Error(`获取 GitLab 提交历史失败 (HTTP ${res.status})`);
    }
    const data = await res.json();
    return data.map((item: any) => ({
      sha: item.id,
      shortSha: item.short_id || item.id.slice(0, 7),
      message: item.title || item.message || '',
      authorName: item.author_name || 'GitLab User',
      authorEmail: item.author_email,
      date: item.created_at ? new Date(item.created_at).toLocaleString() : '',
      url: item.web_url || `${baseUrl}/${owner}/${repo}/-/commit/${item.id}`
    }));
  }
}

// Create GitHub Gist
export async function createGitHubGist(options: {
  description: string;
  isPublic: boolean;
  files: { filename: string; content: string }[];
  token?: string;
}): Promise<{ id: string; url: string; htmlUrl: string }> {
  const { description, isPublic, files, token } = options;

  if (files.length === 0) {
    throw new Error('导出的 Gist 必须包含至少一个有效文件');
  }

  const gistFiles: Record<string, { content: string }> = {};
  for (const f of files) {
    const cleanName = f.filename.replace(/^\/+/, '') || 'file.txt';
    gistFiles[cleanName] = { content: f.content || ' ' };
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
  if (token && token.trim()) {
    headers['Authorization'] = `token ${token.trim()}`;
  }

  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      description: description || 'Exported from Web Code Studio',
      public: isPublic,
      files: gistFiles
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `创建 Gist 失败 (HTTP ${res.status})`);
  }

  const data = await res.json();
  return {
    id: data.id,
    url: data.url,
    htmlUrl: data.html_url
  };
}

// Compute File Diffs between local and reference files
export function computeFileDiffs(currentFiles: ProjectFile[], referenceFiles: ProjectFile[]): FileDiffItem[] {
  const refMap = new Map<string, string>();
  for (const ref of referenceFiles) {
    refMap.set(ref.name, ref.content);
  }

  const currentNames = new Set<string>();
  const diffs: FileDiffItem[] = [];

  for (const curr of currentFiles) {
    currentNames.add(curr.name);
    if (!refMap.has(curr.name)) {
      // Added file
      diffs.push({
        filePath: curr.name,
        status: 'added',
        oldContent: '',
        newContent: curr.content,
        selectedForCommit: true
      });
    } else {
      const oldContent = refMap.get(curr.name)!;
      if (oldContent !== curr.content) {
        // Modified file
        diffs.push({
          filePath: curr.name,
          status: 'modified',
          oldContent,
          newContent: curr.content,
          selectedForCommit: true
        });
      } else {
        // Unchanged
        diffs.push({
          filePath: curr.name,
          status: 'unchanged',
          oldContent,
          newContent: curr.content,
          selectedForCommit: false
        });
      }
    }
  }

  // Check deleted files
  for (const ref of referenceFiles) {
    if (!currentNames.has(ref.name)) {
      diffs.push({
        filePath: ref.name,
        status: 'deleted',
        oldContent: ref.content,
        newContent: '',
        selectedForCommit: true
      });
    }
  }

  return diffs;
}

/**
 * Generate production-ready GitHub Actions Android APK build workflow YAML
 */
export function generateApkWorkflowYaml(projectName = 'app'): string {
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'app';
  return `name: Build Android APK (NedevCode CI)

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:
    inputs:
      build_type:
        description: 'Build Type (debug / release)'
        required: true
        default: 'debug'
        type: choice
        options:
          - debug
          - release

jobs:
  build-android-apk:
    name: Compile Real Android APK
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Setup Java JDK 21
        uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: '21'
          cache: 'gradle'

      - name: Install Dependencies
        run: |
          if [ -f "package.json" ]; then
            npm install || npm install --legacy-peer-deps
          else
            npm init -y
            npm install @capacitor/core @capacitor/cli @capacitor/android
          fi

      - name: Initialize & Sync Capacitor Android
        run: |
          if [ ! -f "capacitor.config.json" ] && [ ! -f "capacitor.config.ts" ]; then
            npx cap init "${safeName}" "com.codespace.${safeName}" --web-dir "."
          fi
          if [ ! -d "android" ]; then
            npx cap add android
          fi
          npx cap sync android

      - name: Build Android APK with Gradle Daemon
        run: |
          cd android
          chmod +x gradlew
          ./gradlew assembleDebug --no-daemon
          mkdir -p ../dist-apk
          cp app/build/outputs/apk/debug/*.apk ../dist-apk/app-debug.apk || cp app/build/outputs/apk/debug/*.apk ../dist-apk/

      - name: Upload Real APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: Android-APK-Debug
          path: dist-apk/*.apk
          retention-days: 14

      - name: Publish GitHub Release (Optional)
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          files: dist-apk/*.apk
          generate_release_notes: true
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;
}

/**
 * Inject the APK build workflow and Capacitor configuration into a project
 */
export function injectApkWorkflowIntoProject(project: CodeProject): {
  updatedProject: CodeProject;
  addedFileNames: string[];
} {
  const workflowPath = '.github/workflows/build-apk.yml';
  const capacitorConfigPath = 'capacitor.config.json';
  const gitignorePath = '.gitignore';

  const files = [...(project.files || [])];
  const folders = new Set<string>(project.folders || []);
  const addedFileNames: string[] = [];

  // Add folder paths
  folders.add('.github');
  folders.add('.github/workflows');

  // 1. Inject or update .github/workflows/build-apk.yml
  const workflowYaml = generateApkWorkflowYaml(project.title);
  const existingWfIndex = files.findIndex(f => f.name === workflowPath);
  if (existingWfIndex >= 0) {
    files[existingWfIndex] = {
      ...files[existingWfIndex],
      content: workflowYaml
    };
    addedFileNames.push(workflowPath + ' (已更新)');
  } else {
    files.push({
      id: `file_${Date.now()}_wf`,
      name: workflowPath,
      content: workflowYaml,
      language: 'shell'
    });
    addedFileNames.push(workflowPath);
  }

  // 2. Inject capacitor.config.json if absent
  const existingCap = files.find(f => f.name === capacitorConfigPath || f.name === 'capacitor.config.ts');
  if (!existingCap) {
    const safeName = project.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'app';
    const capJson = JSON.stringify({
      appId: `com.codespace.${safeName.toLowerCase()}`,
      appName: project.title,
      webDir: ".",
      bundledWebRuntime: false
    }, null, 2);
    files.push({
      id: `file_${Date.now()}_cap`,
      name: capacitorConfigPath,
      content: capJson,
      language: 'json'
    });
    addedFileNames.push(capacitorConfigPath);
  }

  // 3. Inject .gitignore if absent
  if (!files.some(f => f.name === gitignorePath)) {
    const gitignoreContent = `node_modules/
dist/
dist-apk/
android/app/build/
.DS_Store
*.apk
`;
    files.push({
      id: `file_${Date.now()}_gi`,
      name: gitignorePath,
      content: gitignoreContent,
      language: 'plaintext'
    });
    addedFileNames.push(gitignorePath);
  }

  return {
    updatedProject: {
      ...project,
      files,
      folders: Array.from(folders),
      updatedAt: Date.now()
    },
    addedFileNames
  };
}

/**
 * Fetch GitHub Actions workflow runs list for a repository
 */
export async function fetchGitHubWorkflowRuns(options: {
  owner: string;
  repo: string;
  token?: string;
  workflowIdOrFilename?: string;
}): Promise<GitHubWorkflowRun[]> {
  const { owner, repo, token, workflowIdOrFilename } = options;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json'
  };
  if (token && token.trim()) {
    headers['Authorization'] = `token ${token.trim()}`;
  }

  const endpoint = workflowIdOrFilename
    ? `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowIdOrFilename)}/runs?per_page=10`
    : `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=10`;

  const res = await fetch(endpoint, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `获取 GitHub Actions 构建历史失败 (HTTP ${res.status})`);
  }

  const data = await res.json();
  const runs = (data.workflow_runs || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    head_branch: r.head_branch,
    head_sha: r.head_sha,
    status: r.status,
    conclusion: r.conclusion,
    html_url: r.html_url,
    created_at: r.created_at,
    updated_at: r.updated_at,
    run_number: r.run_number,
    event: r.event
  }));

  return runs;
}

/**
 * Trigger GitHub Actions workflow dispatch
 */
export async function triggerGitHubWorkflow(options: {
  owner: string;
  repo: string;
  token: string;
  workflowIdOrFilename?: string;
  ref?: string;
  inputs?: Record<string, any>;
}): Promise<void> {
  const { owner, repo, token, workflowIdOrFilename = 'build-apk.yml', ref = 'main', inputs = {} } = options;

  if (!token || !token.trim()) {
    throw new Error('触发 GitHub Actions 云端构建需要提供包含 workflow 权限的 GitHub Personal Access Token (PAT)');
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    Authorization: `token ${token.trim()}`
  };

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowIdOrFilename)}/dispatches`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ref,
      inputs
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 404) {
      throw new Error(`未在仓库 ${owner}/${repo} 中找到工作流 ${workflowIdOrFilename}。请先点击“注入工作流”并将代码推送到远程仓库。`);
    } else if (res.status === 403 || res.status === 401) {
      throw new Error(err.message || 'Token 缺少 workflow 权限，请在 GitHub 开发者设置中勾选 workflow 作用域。');
    }
    throw new Error(err.message || `触发工作流失败 (HTTP ${res.status})`);
  }
}

/**
 * Fetch artifacts generated by a GitHub Actions workflow run
 */
export async function fetchGitHubRunArtifacts(options: {
  owner: string;
  repo: string;
  runId: number;
  token?: string;
}): Promise<GitHubArtifact[]> {
  const { owner, repo, runId, token } = options;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json'
  };
  if (token && token.trim()) {
    headers['Authorization'] = `token ${token.trim()}`;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `获取构建产物失败 (HTTP ${res.status})`);
  }

  const data = await res.json();
  return (data.artifacts || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    size_in_bytes: a.size_in_bytes,
    url: a.url,
    archive_download_url: a.archive_download_url,
    expired: a.expired,
    created_at: a.created_at
  }));
}

/**
 * Fetch GitHub Releases for a repository
 */
export async function fetchGitHubReleases(options: {
  owner: string;
  repo: string;
  token?: string;
}): Promise<GitHubReleaseItem[]> {
  const { owner, repo, token } = options;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json'
  };
  if (token && token.trim()) {
    headers['Authorization'] = `token ${token.trim()}`;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`, { headers });
  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  return (data || []).map((r: any) => ({
    id: r.id,
    tag_name: r.tag_name,
    name: r.name || r.tag_name,
    body: r.body || '',
    html_url: r.html_url,
    created_at: r.created_at,
    assets: (r.assets || []).map((asset: any) => ({
      id: asset.id,
      name: asset.name,
      size: asset.size,
      download_count: asset.download_count,
      browser_download_url: asset.browser_download_url
    }))
  }));
}


