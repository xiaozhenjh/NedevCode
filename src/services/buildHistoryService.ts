/**
 * 本地打包历史与制品存储服务 (基于 IndexedDB + localStorage)
 * 确保即使 GitHub 临时构建仓库被彻底删除，用户的打包过程日志与产物二进制仍永久保存在本地
 */

export interface BuildStepItem {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'skipped';
  duration?: string;
  log?: string;
}

export interface BuildRecord {
  id: string;
  projectId: string;
  projectName: string;
  packagerId: string;
  packagerName: string;
  category: 'local' | 'cloud';
  timestamp: number;
  status: 'success' | 'failure';
  durationMs: number;
  error?: string;
  logs: string;
  steps: BuildStepItem[];
  isTemporaryRepo?: boolean;
  repoName?: string;
  githubRunUrl?: string;
  artifactName?: string;
  artifactSize?: number;
  artifactBlob?: Blob;
  downloadUrl?: string;
}

const DB_NAME = 'code_editor_build_db';
const DB_VERSION = 1;
const STORE_NAME = 'build_records';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 本地持久化保存构建记录 (包含完整日志与生成制品)
 */
export async function saveBuildRecord(record: BuildRecord): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    // 降级使用 localStorage 保存元数据 (不包含大二进制 Blob)
    try {
      const fallbackList = getFallbackRecords();
      const metaRecord = { ...record, artifactBlob: undefined };
      const updated = [metaRecord, ...fallbackList.filter((r) => r.id !== record.id)].slice(0, 30);
      localStorage.setItem('code_editor_build_history_fallback', JSON.stringify(updated));
    } catch {
      // ignore
    }
  }
}

/**
 * 获取指定项目或全部项目的本地构建记录
 */
export async function getBuildRecords(projectId?: string): Promise<BuildRecord[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        let results = (req.result as BuildRecord[]) || [];
        if (projectId) {
          results = results.filter((r) => r.projectId === projectId);
        }
        results.sort((a, b) => b.timestamp - a.timestamp);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    const list = getFallbackRecords();
    if (projectId) {
      return list.filter((r) => r.projectId === projectId);
    }
    return list;
  }
}

/**
 * 删除单条构建记录
 */
export async function deleteBuildRecord(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const fallbackList = getFallbackRecords().filter((r) => r.id !== id);
    localStorage.setItem('code_editor_build_history_fallback', JSON.stringify(fallbackList));
  }
}

/**
 * 触发本地下载构建日志文本
 */
export function triggerDownloadLog(record: BuildRecord): void {
  const header = [
    `========================================`,
    `项目名称: ${record.projectName}`,
    `打包方案: ${record.packagerName}`,
    `构建时间: ${new Date(record.timestamp).toLocaleString()}`,
    `最终状态: ${record.status === 'success' ? '构建成功' : '构建失败'}`,
    `耗时: ${(record.durationMs / 1000).toFixed(1)} 秒`,
    record.repoName ? `构建仓库: ${record.repoName} (临时清理: ${record.isTemporaryRepo ? '已销毁' : '已保留'})` : '',
    record.githubRunUrl ? `GitHub Actions 运行实例: ${record.githubRunUrl}` : '',
    `========================================\n`,
    record.logs || '(无详细日志)'
  ]
    .filter(Boolean)
    .join('\n');

  const blob = new Blob([header], { type: 'text/plain;charset=utf-8' });
  const filename = `${record.projectName.replace(/[\s/\\?%*:|"<>]/g, '_')}-${new Date(record.timestamp).toISOString().slice(0, 10)}-build.log`;
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
 * 触发下载本地缓存的构建产物
 */
export function triggerDownloadArtifact(record: BuildRecord): void {
  if (record.artifactBlob && record.artifactName) {
    const url = URL.createObjectURL(record.artifactBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = record.artifactName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else if (record.downloadUrl) {
    window.open(record.downloadUrl, '_blank');
  }
}

function getFallbackRecords(): BuildRecord[] {
  try {
    const raw = localStorage.getItem('code_editor_build_history_fallback');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
