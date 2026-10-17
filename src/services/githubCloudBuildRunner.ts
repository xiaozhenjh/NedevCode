import { CodeProject } from '../types';
import { BuildStepItem, saveBuildRecord } from './buildHistoryService';
import { PackagingProgress, PackagerResult } from '../packagers/types';

export interface GitHubTokenInfo {
  valid: boolean;
  username: string;
  scopes: string[];
  hasDeleteRepo: boolean;
  error?: string;
}

/**
 * 校验 GitHub Token 并解析 scope 权限 (重点检测 delete_repo)
 */
export async function checkGitHubTokenScopes(token: string): Promise<GitHubTokenInfo> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { valid: false, username: '', scopes: [], hasDeleteRepo: false, error: '未提供令牌' };
  }

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${cleanToken}`
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        valid: false,
        username: '',
        scopes: [],
        hasDeleteRepo: false,
        error: err.message || `Token 校验失败 (HTTP ${res.status})`
      };
    }

    const userData = await res.json();
    const scopesHeader = res.headers.get('x-oauth-scopes') || '';
    const scopes = scopesHeader
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    // 检测是否有 delete_repo 权限
    const hasDeleteRepo = scopes.includes('delete_repo');

    return {
      valid: true,
      username: userData.login || '',
      scopes,
      hasDeleteRepo
    };
  } catch (e: any) {
    return {
      valid: false,
      username: '',
      scopes: [],
      hasDeleteRepo: false,
      error: e.message || '网络连接失败，请检查网络设置'
    };
  }
}

export interface CloudBuildExecutionOptions {
  project: CodeProject;
  packagerId: string;
  packagerName: string;
  token: string;
  workflowFileName: string;
  workflowContent: string;
  workflowInputs?: Record<string, string>;
  artifactExpectedName?: string;
  customRepoName?: string;
  branch?: string;
  onProgress?: (progress: PackagingProgress) => void;
  onUpdateGitConfig?: (gitConfig: NonNullable<CodeProject['gitConfig']>) => void;
}

/**
 * 核心云端打包执行器：
 * - 自动检测 delete_repo：有则创建临时仓库并于完成后销毁；无则使用用户指定的仓库
 * - 自动化调度 GitHub Actions Runner
 * - 实时抓取流水线步骤、实时控制台日志
 * - 自动化提取产物并保存至本地 IndexedDB
 * - 临时仓库安全销毁并保持本地完整记录
 */
export async function runGitHubCloudWorkflow(
  options: CloudBuildExecutionOptions
): Promise<PackagerResult> {
  const {
    project,
    packagerId,
    packagerName,
    token,
    workflowFileName,
    workflowContent,
    workflowInputs = {},
    artifactExpectedName,
    customRepoName,
    branch = 'main',
    onProgress,
    onUpdateGitConfig
  } = options;

  const startTime = Date.now();
  let fullLogs = '';
  const stepItems: BuildStepItem[] = [];

  const addLog = (line: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${line}\n`;
    fullLogs += formatted;
  };

  const updateProgress = (
    stepName: string,
    percent: number,
    status: PackagingProgress['status'] = 'running',
    extra?: Partial<PackagingProgress>
  ) => {
    onProgress?.({
      step: stepName,
      percent,
      status,
      log: stepName,
      allLogs: fullLogs,
      steps: [...stepItems],
      ...extra
    });
  };

  // 1. 检验令牌与删除权限
  addLog('开始校验 GitHub 访问令牌权限...');
  updateProgress('正在校验 GitHub 凭据与权限...', 10);

  const tokenInfo = await checkGitHubTokenScopes(token);
  if (!tokenInfo.valid) {
    const errorMsg = tokenInfo.error || 'GitHub 令牌无效或网络不可达';
    addLog(`凭据校验失败: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const cleanToken = token.trim();
  const owner = tokenInfo.username;
  const hasDeleteRepo = tokenInfo.hasDeleteRepo;
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `token ${cleanToken}`,
    'Content-Type': 'application/json'
  };

  addLog(`认证用户: ${owner}`);
  addLog(`令牌作用域: ${tokenInfo.scopes.join(', ') || '无显式作用域 (可能为细粒度令牌)'}`);

  // 决定仓库模式：
  // 若有删除权限：采用唯一临时仓库，打包完成后自动删除，不关联项目
  // 若无删除权限：必须使用用户提供的新仓库名称，打包后永久保留
  let repo = '';
  let isTemporaryRepo = false;

  if (hasDeleteRepo) {
    isTemporaryRepo = true;
    const safeTitle = (project.title || 'app').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    repo = `tmp-build-${safeTitle}-${Date.now().toString(36)}`;
    addLog(`检测到令牌包含 delete_repo 权限，将采用临时仓库: ${repo} (完成后自动删除)`);
    updateProgress(`正在为您初始化隔离临时仓库 ${repo}...`, 20);
  } else {
    isTemporaryRepo = false;
    const defaultName = `${(project.title || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-build`;
    repo = (customRepoName && customRepoName.trim()) ? customRepoName.trim() : defaultName;
    addLog(`令牌不具备 delete_repo 权限，使用指定云端仓库: ${repo} (完成后永久保留)`);
    updateProgress(`正在连接云端仓库 ${repo}...`, 20);
  }

  // 2. 检查或创建仓库
  let repoExisted = false;
  try {
    const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (checkRes.ok) {
      repoExisted = true;
      addLog(`仓库 ${owner}/${repo} 已存在`);
    }
  } catch {
    // ignore
  }

  if (!repoExisted) {
    addLog(`正在创建私有仓库: ${owner}/${repo}...`);
    const createRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: repo,
        private: true,
        auto_init: true,
        description: isTemporaryRepo ? 'Automated temporary build environment' : `Build repository for ${project.title}`
      })
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      const msg = `创建仓库失败: ${err.message || createRes.statusText}`;
      addLog(msg);
      throw new Error(msg);
    }
    addLog(`仓库 ${owner}/${repo} 创建成功`);
    // 等待 1.5 秒确保 GitHub 仓库完成初始化
    await new Promise((r) => setTimeout(r, 1500));
  }

  // 若不是临时仓库且配置了关联回调，则在成功时关联
  const repoUrl = `https://github.com/${owner}/${repo}`;

  // 3. 将项目代码文件与工作流提交到该仓库
  updateProgress('正在同步项目源码与自动化工作流...', 30);
  addLog(`正在向 ${owner}/${repo} 分支 ${branch} 推送项目源文件...`);

  try {
    // 写入工作流文件 .github/workflows/${workflowFileName}
    const workflowPath = `.github/workflows/${workflowFileName}`;
    let workflowSha: string | undefined;

    try {
      const wfCheck = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${workflowPath}?ref=${encodeURIComponent(branch)}`, { headers });
      if (wfCheck.ok) {
        const wfData = await wfCheck.json();
        workflowSha = wfData.sha;
      }
    } catch {
      // ignore
    }

    const wfPutRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${workflowPath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Configure cloud build workflow: ${workflowFileName}`,
        content: btoa(unescape(encodeURIComponent(workflowContent))),
        branch,
        ...(workflowSha ? { sha: workflowSha } : {})
      })
    });

    if (!wfPutRes.ok) {
      const err = await wfPutRes.json().catch(() => ({}));
      addLog(`写入工作流配置文件警告: ${err.message}`);
    } else {
      addLog(`自动化工作流文件写入成功: ${workflowPath}`);
    }

    // 写入项目文件 (最多写入前 50 个核心代码文件，避免 API 速率限制)
    const filesToUpload = project.files.slice(0, 50);
    for (const file of filesToUpload) {
      if (!file.name) continue;
      const cleanPath = file.name.replace(/^\/+/, '');
      let fileSha: string | undefined;
      try {
        const existRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(cleanPath)}?ref=${encodeURIComponent(branch)}`, { headers });
        if (existRes.ok) {
          const existData = await existRes.json();
          fileSha = existData.sha;
        }
      } catch {
        // ignore
      }

      let contentBase64 = '';
      if (file.content && file.content.startsWith('data:') && file.content.includes(';base64,')) {
        contentBase64 = file.content.split(';base64,')[1];
      } else {
        contentBase64 = btoa(unescape(encodeURIComponent(file.content || '')));
      }

      await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(cleanPath)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `Add ${cleanPath}`,
          content: contentBase64,
          branch,
          ...(fileSha ? { sha: fileSha } : {})
        })
      });
    }

    addLog(`已同步 ${filesToUpload.length} 个代码文件至构建仓库`);
  } catch (err: any) {
    addLog(`同步项目文件至仓库失败: ${err.message}`);
    throw err;
  }

  // 4. 触发 workflow_dispatch
  updateProgress('正在调度 GitHub Actions 云端 Runner...', 45);
  addLog(`调度远程工作流: ${workflowFileName}...`);

  const dispatchTime = Date.now();
  const dispatchRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFileName}/dispatches`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: branch,
        inputs: workflowInputs
      })
    }
  );

  if (!dispatchRes.ok) {
    const err = await dispatchRes.json().catch(() => ({}));
    const msg = `触发 GitHub Actions 打包流水线失败: ${err.message || dispatchRes.statusText}`;
    addLog(msg);
    // 清理临时仓库
    if (isTemporaryRepo) {
      await cleanupRepo(owner, repo, cleanToken, addLog);
    }
    throw new Error(msg);
  }

  addLog('工作流已成功调度，等待 GitHub 生成运行实例...');
  updateProgress('云端 Runner 已调度，正在挂载运行实例...', 50);

  // 5. 轮询查找对应的 runId
  let runId: number | undefined;
  let runHtmlUrl = `https://github.com/${owner}/${repo}/actions`;

  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const runsRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFileName}/runs?per_page=5`,
        { headers }
      );
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        const runs = runsData.workflow_runs || [];
        // 匹配在调度之后创建的 run
        const matchedRun = runs.find((r: any) => {
          const runCreatedAt = new Date(r.created_at).getTime();
          return runCreatedAt >= dispatchTime - 30000;
        });

        if (matchedRun) {
          runId = matchedRun.id;
          runHtmlUrl = matchedRun.html_url || runHtmlUrl;
          addLog(`已挂载云端运行实例 #${runId}: ${runHtmlUrl}`);
          break;
        }
      }
    } catch {
      // retry
    }
  }

  if (!runId) {
    addLog('未在预期时间内检测到运行实例，请在 GitHub Actions 页面查看');
    if (isTemporaryRepo) {
      await cleanupRepo(owner, repo, cleanToken, addLog);
    }
    throw new Error('未能在 GitHub Actions 中检测到运行实例，可能存在队列延迟，请检查 Token 权限');
  }

  // 6. 持续监控构建进度与日志轮询
  let buildStatus: 'queued' | 'in_progress' | 'completed' = 'queued';
  let buildConclusion: 'success' | 'failure' | 'cancelled' | 'timed_out' | null = null;
  let activeJobId: number | undefined;

  let pollCount = 0;
  const maxPolls = 180; // 最多轮询 ~6-8 分钟

  while (pollCount < maxPolls) {
    pollCount++;
    await new Promise((r) => setTimeout(r, 2500));

    try {
      // 查询 Run 状态
      const runDetailRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`, { headers });
      if (runDetailRes.ok) {
        const runDetail = await runDetailRes.json();
        buildStatus = runDetail.status;
        buildConclusion = runDetail.conclusion;
      }

      // 查询 Job 与步骤
      const jobsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, { headers });
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        const job = jobsData.jobs && jobsData.jobs[0];
        if (job) {
          activeJobId = job.id;
          stepItems.length = 0;
          if (job.steps && Array.isArray(job.steps)) {
            for (const s of job.steps) {
              stepItems.push({
                name: s.name,
                status: s.status === 'completed' ? (s.conclusion === 'success' ? 'success' : 'failure') : (s.status === 'in_progress' ? 'running' : 'pending'),
                duration: s.started_at && s.completed_at ? `${Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000)}s` : undefined
              });
            }
          }
        }
      }

      // 尝试拉取当前运行日志
      if (activeJobId && (pollCount % 2 === 0 || buildStatus === 'completed')) {
        try {
          const logRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/jobs/${activeJobId}/logs`, { headers });
          if (logRes.ok) {
            const rawLog = await logRes.text();
            if (rawLog && rawLog.length > fullLogs.length) {
              fullLogs = rawLog;
            }
          }
        } catch {
          // ignore
        }
      }

      // 计算进度百分比
      const currentStep = stepItems.find((s) => s.status === 'running')?.name || (buildStatus === 'completed' ? '构建完成' : 'Runner 正在编译中...');
      const completedSteps = stepItems.filter((s) => s.status === 'success').length;
      const totalSteps = Math.max(stepItems.length, 5);
      const calculatedPercent = Math.min(95, 50 + Math.round((completedSteps / totalSteps) * 45));

      addLog(`[状态] ${currentStep} (${completedSteps}/${stepItems.length})`);
      updateProgress(
        `云端构建中: ${currentStep}`,
        calculatedPercent,
        'running',
        { githubRunUrl: runHtmlUrl }
      );

      if (buildStatus === 'completed') {
        break;
      }
    } catch {
      // retry next loop
    }
  }

  // 7. 处理构建结果
  const isSuccess = buildConclusion === 'success';
  let downloadedBlob: Blob | undefined;
  let artifactFilename = artifactExpectedName || `${project.title || 'app'}-artifact.zip`;
  let artifactDownloadUrl: string | undefined;

  if (isSuccess) {
    addLog('GitHub Actions 云端编译成功！正在提取制品...');
    updateProgress('构建成功，正在获取产物构件...', 96);

    try {
      const artRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`, { headers });
      if (artRes.ok) {
        const artData = await artRes.json();
        const artifacts = artData.artifacts || [];
        if (artifacts.length > 0) {
          const firstArt = artifacts[0];
          artifactFilename = `${firstArt.name}.zip`;
          artifactDownloadUrl = firstArt.archive_download_url;
          addLog(`发现构件: ${firstArt.name} (${Math.round(firstArt.size_in_bytes / 1024)} KB)`);

          // 尝试下载构件 Blob
          try {
            const downloadRes = await fetch(firstArt.archive_download_url, {
              headers: {
                Authorization: `token ${cleanToken}`
              }
            });
            if (downloadRes.ok) {
              downloadedBlob = await downloadRes.blob();
              addLog(`产物二进制已成功下载至客户端 (大小: ${Math.round(downloadedBlob.size / 1024)} KB)`);
            }
          } catch (dlErr: any) {
            addLog(`构件二进制自动下载警告: ${dlErr.message}`);
          }
        }
      }
    } catch (e: any) {
      addLog(`获取构件列表失败: ${e.message}`);
    }
  } else {
    addLog(`云端打包构建未成功完成: 最终状态 ${buildConclusion || '异常中止'}`);
  }

  // 8. 若无删除权限，且构建成功，可以关联仓库至项目
  if (!isTemporaryRepo && onUpdateGitConfig && isSuccess) {
    onUpdateGitConfig({
      provider: 'github',
      repoUrl,
      owner,
      repo,
      branch,
      token: cleanToken,
      lastSyncedAt: Date.now()
    });
  }

  // 9. 本地持久化保存日志与产物 (即使临时仓库被删除也不会丢失)
  const durationMs = Date.now() - startTime;
  const buildRecord = {
    id: `build-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    projectId: project.id,
    projectName: project.title,
    packagerId,
    packagerName,
    category: 'cloud' as const,
    timestamp: Date.now(),
    status: isSuccess ? ('success' as const) : ('failure' as const),
    durationMs,
    error: isSuccess ? undefined : `构建结论: ${buildConclusion || '失败'}`,
    logs: fullLogs,
    steps: stepItems,
    isTemporaryRepo,
    repoName: repo,
    githubRunUrl: runHtmlUrl,
    artifactName: artifactFilename,
    artifactSize: downloadedBlob ? downloadedBlob.size : undefined,
    artifactBlob: downloadedBlob,
    downloadUrl: artifactDownloadUrl || runHtmlUrl
  };

  await saveBuildRecord(buildRecord);
  addLog('打包过程日志与生成制品已完整保存在本地数据库中。');

  // 10. 临时仓库清理
  if (isTemporaryRepo) {
    updateProgress('正在安全销毁临时构建仓库...', 98);
    await cleanupRepo(owner, repo, cleanToken, addLog);
  }

  if (!isSuccess) {
    updateProgress('打包失败，可在日志中查看具体原因', 100, 'error', {
      allLogs: fullLogs,
      githubRunUrl: runHtmlUrl
    });
    throw new Error(`云端打包未成功完成 (${buildConclusion || '失败'})。请在控制台日志中查看编译错误详情。`);
  }

  updateProgress('云端打包全部完成！制品与日志已本地保存', 100, 'success', {
    downloadName: artifactFilename,
    downloadUrl: artifactDownloadUrl || runHtmlUrl,
    githubRunUrl: runHtmlUrl,
    allLogs: fullLogs
  });

  return {
    blob: downloadedBlob,
    filename: artifactFilename,
    githubRunUrl: runHtmlUrl,
    downloadUrl: artifactDownloadUrl || runHtmlUrl,
    logs: fullLogs,
    steps: stepItems,
    isTemporaryRepo,
    repoName: repo,
    artifactSize: downloadedBlob?.size
  };
}

async function cleanupRepo(owner: string, repo: string, token: string, addLog: (msg: string) => void) {
  addLog(`[清理] 正在调用 GitHub API 删除临时仓库 ${owner}/${repo}...`);
  try {
    const deleteRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${token}`
      }
    });

    if (deleteRes.ok || deleteRes.status === 204) {
      addLog(`[清理] 临时仓库 ${owner}/${repo} 已彻底删除，不残留冗余仓库。`);
    } else {
      addLog(`[清理] 临时仓库删除响应: HTTP ${deleteRes.status}`);
    }
  } catch (err: any) {
    addLog(`[清理] 删除临时仓库失败: ${err.message}`);
  }
}
