import React, { useState, useEffect } from 'react';
import { Info, AlertTriangle, AlertCircle } from 'lucide-react';
import { AppNotification, NotificationLevel } from '../types';
import { ModalShell } from './ModalShell';
import { formatNotifyWindow } from '../services/notifyService';

interface NotificationModalProps {
  notification: AppNotification | null;
  onClose: () => void;
}

export const LEVEL_META: Record<
  NotificationLevel,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  info: {
    label: '提示',
    icon: <Info className="w-4 h-4" />,
    color: 'var(--brand)',
    bg: 'var(--brand-subtle)'
  },
  warning: {
    label: '警告',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'var(--alert)',
    bg: 'rgba(237, 111, 33, 0.12)'
  },
  error: {
    label: '紧急',
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'var(--warning)',
    bg: 'rgba(232, 64, 38, 0.12)'
  }
};

/**
 * 弹窗类通知（只显示一次 / 每次显示 / 每天显示）。
 * 关闭动画期间保留内容快照，避免父级置空导致弹层内容闪空。
 */
export const NotificationModal: React.FC<NotificationModalProps> = ({ notification, onClose }) => {
  const [visible, setVisible] = useState<AppNotification | null>(null);
  useEffect(() => {
    if (notification) setVisible(notification);
  }, [notification]);

  const n = notification ?? visible;
  const meta = (n && LEVEL_META[n.level]) || LEVEL_META.info;
  const windowText = n ? formatNotifyWindow(n) : null;

  return (
    <ModalShell
      isOpen={!!notification}
      onClose={onClose}
      title={n ? n.title : '通知'}
      icon={n ? <span style={{ color: meta.color }}>{meta.icon}</span> : undefined}
      maxWidth="max-w-sm"
      id="notification-modal"
      footer={
        n ? (
          <>
            {n.buttonText && n.buttonUrl && (
              <button
                type="button"
                onClick={() => window.open(n.buttonUrl, '_blank', 'noopener=yes,noreferrer=yes')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] press-feedback transition-colors"
              >
                {n.buttonText}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-secondary)] border border-[var(--border-medium)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] press-feedback transition-colors"
            >
              知道了
            </button>
          </>
        ) : undefined
      }
    >
      {n && (
        <div className="space-y-3">
          <span
            className="inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ color: meta.color, background: meta.bg }}
          >
            {meta.label}
          </span>
          <p className="text-xs leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-all">
            {n.content}
          </p>
          {windowText && (
            <p className="text-[10px] text-[var(--text-tertiary)]">{windowText}</p>
          )}
        </div>
      )}
    </ModalShell>
  );
};
