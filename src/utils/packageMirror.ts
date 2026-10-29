import { STORAGE_KEY_SETTINGS } from '../services/storage';

/**
 * 第三方包镜像源设置
 *
 * 作用范围：仅作用于「项目导入的第三方包」
 *  - Python：pip 包索引源（micropip.set_index_urls）
 *  - npm：包 CDN 镜像前缀（{前缀}/{包名}）
 *
 * 不作用于运行时内核（Pyodide / Skulpt），它们仍走内置的固定 CDN。
 */

export interface MirrorPreset {
  /** 展示名 */
  label: string;
  /** 存储值；空字符串代表「使用内置默认」 */
  value: string;
  /** 备注说明 */
  hint?: string;
}

/** 官方 PyPI 索引地址（micropip 默认源） */
export const DEFAULT_PYPI_INDEX = 'https://pypi.org/simple';

/**
 * Python 包索引源预设。
 * 仅收录「浏览器端可直连」的源：pip 索引与 wheel 文件均需返回 CORS 头，
 * 否则浏览器会因跨域被拦截。国内多数镜像未开放 CORS，故不在预设内，
 * 用户可通过自定义地址自行填写。
 */
export const PYPI_MIRROR_PRESETS: MirrorPreset[] = [
  {
    label: '官方 PyPI',
    value: DEFAULT_PYPI_INDEX,
    hint: '默认源，海外网络较慢'
  },
  {
    label: '南方科技大学',
    value: 'https://mirrors.sustech.edu.cn/pypi/web/simple',
    hint: '国内镜像，已开放 CORS'
  }
];

/**
 * npm 包 CDN 镜像预设。
 * 仅收录支持「裸包名入口解析」的前缀（{前缀}/{包名} 能直接拿到可执行入口），
 * 阿里 npmmirror 的 registry 需要显式版本 + 文件名，不在此列。
 */
export const NPM_MIRROR_PRESETS: MirrorPreset[] = [
  {
    label: '内置默认链',
    value: '',
    hint: '依次尝试 jsDelivr 国内镜像 → 官方 jsDelivr → unpkg'
  },
  {
    label: 'jsDelivr 官方',
    value: 'https://cdn.jsdelivr.net/npm',
    hint: 'cdn.jsdelivr.net'
  },
  {
    label: 'jsDelivr Fastly',
    value: 'https://fastly.jsdelivr.net/npm',
    hint: 'fastly.jsdelivr.net'
  },
  {
    label: 'jsDelivr Gcore',
    value: 'https://gcore.jsdelivr.net/npm',
    hint: 'gcore.jsdelivr.net'
  },
  {
    label: 'unpkg',
    value: 'https://unpkg.com',
    hint: 'unpkg.com'
  }
];

/** 内置 npm 兜底候选链（未设置镜像源时使用，保持原有行为） */
export const DEFAULT_NPM_MIRRORS = [
  'https://jsd.onmicrosoft.cn/npm',
  'https://cdn.jsdelivr.net/npm',
  'https://unpkg.com'
];

/** 未设置 npm 镜像时的主源（与原有硬编码保持一致） */
export const FALLBACK_NPM_MIRROR = 'https://cdn.jsdelivr.net/npm';

/** 归一化 URL：去除首尾空白与结尾斜杠（micropip 会自行拼接 `/{name}/`） */
export function normalizeUrl(url?: string): string {
  if (!url) return '';
  return url.trim().replace(/\/+$/, '');
}

let activeNpmMirror = '';
let activePythonMirror = '';
let initialized = false;

function readStoredMirrors(): { npmMirror: string; pythonMirror: string } {
  try {
    if (typeof localStorage === 'undefined') {
      return { npmMirror: '', pythonMirror: '' };
    }
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return { npmMirror: '', pythonMirror: '' };
    const parsed = JSON.parse(raw) as { npmMirror?: unknown; pythonMirror?: unknown };
    return {
      npmMirror: typeof parsed?.npmMirror === 'string' ? parsed.npmMirror : '',
      pythonMirror: typeof parsed?.pythonMirror === 'string' ? parsed.pythonMirror : ''
    };
  } catch {
    return { npmMirror: '', pythonMirror: '' };
  }
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  const stored = readStoredMirrors();
  activeNpmMirror = normalizeUrl(stored.npmMirror);
  activePythonMirror = normalizeUrl(stored.pythonMirror);
}

/**
 * 同步当前生效的镜像源设置（由设置面板在保存后调用）。
 * 未传的字段保持当前值不变。
 */
export function setActivePackageMirrors(npmMirror?: string, pythonMirror?: string): void {
  initialized = true;
  if (npmMirror !== undefined) activeNpmMirror = normalizeUrl(npmMirror);
  if (pythonMirror !== undefined) activePythonMirror = normalizeUrl(pythonMirror);
}

/** 读取当前生效的镜像源（用于展示） */
export function getActivePackageMirrors(): { npmMirror: string; pythonMirror: string } {
  ensureInitialized();
  return { npmMirror: activeNpmMirror, pythonMirror: activePythonMirror };
}

/**
 * npm 包加载候选链。
 * 选中源优先，其后跟随内置默认链（去重），保证单一源不可用时仍可回退。
 */
export function getNpmMirrorCandidates(): string[] {
  ensureInitialized();
  const list: string[] = [];
  if (activeNpmMirror) list.push(activeNpmMirror);
  for (const m of DEFAULT_NPM_MIRRORS) {
    if (!list.includes(m)) list.push(m);
  }
  return list;
}

/** npm 包单源前缀（用于同步拼接 `<script src>`，如 HTML 打包） */
export function getPrimaryNpmMirror(): string {
  ensureInitialized();
  return activeNpmMirror || FALLBACK_NPM_MIRROR;
}

/**
 * Python 包索引源列表。
 * 选中源优先，随后追加官方 PyPI 作为兜底（micropip 会按顺序尝试）。
 */
export function getPythonIndexUrls(): string[] {
  ensureInitialized();
  const list: string[] = [];
  if (activePythonMirror) list.push(activePythonMirror);
  if (!list.includes(DEFAULT_PYPI_INDEX)) list.push(DEFAULT_PYPI_INDEX);
  return list;
}

/** 当前镜像源的展示文案 */
export function describeActiveMirrors(): { npm: string; python: string } {
  ensureInitialized();
  return {
    npm: activeNpmMirror || '内置默认链',
    python: activePythonMirror || '官方 PyPI'
  };
}