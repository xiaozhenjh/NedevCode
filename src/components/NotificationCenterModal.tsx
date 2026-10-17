import React, { useEffect } from 'react';
import { Bell, ExternalLink } from 'lucide-react';
import { AppNotification } from '../types';
import { ModalShell } from './ModalShell';
import { formatNotifyWindow } from '../services/notifyService';
import { LEVEL_META } from './NotificationModal';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 已分类为站内信（类型 2 + 降级的系统推送）、处于生效期内的通知 */
  notifications: AppNotification[];
  onMarkAllRead: () => void;
}

/**
 * 通知中心：「仅站内信」与降级的「系统推送」在此展示，打开即全部标记已读。
 */
export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead
}) => {
  useEffect(() => {
    if (isOpen && notifications.length > 0) {
      onMarkAllRead();
    }
    // 仅在开合时触发标记；列表内容变化不重复标记
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="通知"
      icon={<Bell className="w-4 h-4" />}
      maxWidth="max-w-md"
      id="notification-center"
    >
      {notifications.length === 0 ? (
        <div className="py-10 text-center">
          <Bell className="w-6 h-6 mx-auto text-[var(--text-disabled)] mb-2" />
          <p className="text-[11px] text-[var(--text-tertiary)]">暂无通知</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const meta = LEVEL_META[n.level] || LEVEL_META.info;
            const windowText = formatNotifyWindow(n);
            return (
              <div
                key={n.id}
                className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] space-y-1.5"
              >
                <div className="flex items-center justify-between space-x-2">
                  <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {n.title}
                  </span>
                  <span
                    className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{ color: meta.color, background: meta.bg }}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap break-all">
                  {n.content}
                </p>
                {windowText && (
                  <p className="text-[10px] text-[var(--text-tertiary)]">{windowText}</p>
                )}
                {n.buttonText && n.buttonUrl && (
                  <button
                    type="button"
                    onClick={() => window.open(n.buttonUrl, '_blank', 'noopener=yes,noreferrer=yes')}
                    className="text-[11px] text-[var(--brand)] hover:underline flex items-center space-x-1 press-feedback"
                  >
                    <span className="truncate">{n.buttonText}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
};
