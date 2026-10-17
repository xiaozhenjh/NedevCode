import { AppNotification } from '../types';

/**
 * 新城云通知系统公开 API 接入（客户端文档 v1.1）
 * - 启动时拉取一次；CDN 边缘缓存 300 秒
 * - 任何异常（网络 / 404 / 非法 JSON）静默兜底为空数组，不影响主体功能
 */
const NOTIFY_PRODUCT_ID = 'lk5wrna7';
const NOTIFY_API_BASE = `https://notify.manage.newcitysoft.cn/api/notify/${NOTIFY_PRODUCT_ID}`;

const KEY_POPUP_ONCE = 'ark_notify_popup_once_v1';
const KEY_POPUP_DAILY = 'ark_notify_popup_daily_v1';
const KEY_READ_IDS = 'ark_notify_read_ids_v1';

export type NotificationAction = 'ignore' | 'inbox' | 'popup-once' | 'popup-always' | 'popup-daily';

export function isPopupAction(action: NotificationAction): boolean {
  return action === 'popup-once' || action === 'popup-always' || action === 'popup-daily';
}

/**
 * 按 type 分支处理（服务端不做频次限制）：
 * - API（云控）：仅逻辑判断，不渲染 UI
 * - 仅站内信：进入通知中心
 * - 弹窗（只显示一次 / 每次 / 每天）：弹窗队列
 * - 系统推送：Web 端无推送通道，降级为站内信展示
 * type 字段为后台中文文案，做包含匹配以容忍措辞差异；未知类型不展示。
 */
export function classifyNotification(n: AppNotification): NotificationAction {
  const t = n.type || '';
  if (t.includes('只显示一次')) return 'popup-once';
  if (t.includes('每天显示')) return 'popup-daily';
  if (t.includes('每次显示')) return 'popup-always';
  if (t.includes('站内信')) return 'inbox';
  if (t.includes('推送')) return 'inbox';
  if (t.includes('API')) return 'ignore';
  return 'ignore';
}

/** 生效时间段过滤：空字符串表示不限 */
export function isInActiveWindow(n: AppNotification, now = Date.now()): boolean {
  if (n.startAt) {
    const start = Date.parse(n.startAt);
    if (!Number.isNaN(start) && now < start) return false;
  }
  if (n.endAt) {
    const end = Date.parse(n.endAt);
    if (!Number.isNaN(end) && now > end) return false;
  }
  return true;
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  try {
    // ?t= 绕过浏览器缓存（CDN 缓存仍按 300s TTL 生效）
    const res = await fetch(`${NOTIFY_API_BASE}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const list = data.filter(
      (item): item is AppNotification =>
        !!item && typeof item.id === 'string' && typeof item.title === 'string'
    );
    return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch {
    return [];
  }
}

/** 弹窗频次判定：只显示一次 / 每天显示的本地标记 */
export function shouldShowPopup(n: AppNotification, action: NotificationAction): boolean {
  if (!isInActiveWindow(n)) return false;
  if (action === 'popup-always') return true;
  if (action === 'popup-once') {
    return !loadJson<string[]>(KEY_POPUP_ONCE, []).includes(n.id);
  }
  if (action === 'popup-daily') {
    return loadJson<Record<string, string>>(KEY_POPUP_DAILY, {})[n.id] !== todayKey();
  }
  return false;
}

/** 弹窗关闭后本地标记（文档：只显示一次为“关闭后标记”，每天显示记录当日日期） */
export function markPopupShown(n: AppNotification): void {
  const action = classifyNotification(n);
  if (action === 'popup-once') {
    const list = loadJson<string[]>(KEY_POPUP_ONCE, []);
    if (!list.includes(n.id)) {
      saveJson(KEY_POPUP_ONCE, [...list, n.id]);
    }
  } else if (action === 'popup-daily') {
    const map = loadJson<Record<string, string>>(KEY_POPUP_DAILY, {});
    if (map[n.id] !== todayKey()) {
      map[n.id] = todayKey();
      saveJson(KEY_POPUP_DAILY, map);
    }
  }
}

/** 通知中心已读状态 */
export function loadReadIds(): string[] {
  return loadJson<string[]>(KEY_READ_IDS, []);
}

export function saveReadIds(ids: string[]): void {
  saveJson(KEY_READ_IDS, ids);
}

export function formatNotifyTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatNotifyWindow(n: AppNotification): string | null {
  if (!n.startAt && !n.endAt) return null;
  const start = n.startAt ? formatNotifyTime(n.startAt) : '';
  const end = n.endAt ? formatNotifyTime(n.endAt) : '';
  if (start && end) return `生效期：${start} ~ ${end}`;
  if (start) return `生效期：${start} 起`;
  if (end) return `生效期：至 ${end}`;
  return null;
}

function todayKey(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return fallback;
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
