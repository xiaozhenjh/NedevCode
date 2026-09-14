import { CodeLanguage, CodeProject, ExecutionType, GitProvider, GitRepoConfig, ProjectFile } from '../types';
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
