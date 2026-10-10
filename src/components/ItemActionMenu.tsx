import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MoreVertical } from 'lucide-react';

export interface ActionMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
  title?: string;
}

interface ItemActionMenuProps {
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onClose: () => void;
  items: ActionMenuItem[];
  title?: string;
  className?: string;
  buttonClassName?: string;
}

export const ItemActionMenu: React.FC<ItemActionMenuProps> = ({
  isOpen,
  onToggle,
  onClose,
  items,
  title = '更多操作',
  className = 'w-44',
  buttonClassName
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<'down' | 'up'>('down');

  useEffect(() => {
    if (!isOpen) return;

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setPlacement(spaceBelow < 280 ? 'up' : 'down');
    }

    const handlePointerDown = (e: PointerEvent | MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = (e: Event) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', onClose);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={containerRef} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        className={buttonClassName || `p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors press-feedback ${
          isOpen ? 'bg-[var(--bg-tertiary)] text-[var(--brand)]' : ''
        }`}
        title={title}
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95, y: placement === 'up' ? 4 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: placement === 'up' ? 4 : -4 }}
            transition={{ duration: 0.12 }}
            className={`absolute right-0 ${
              placement === 'up' ? 'bottom-full mb-1 origin-bottom-right' : 'top-full mt-1 origin-top-right'
            } ${className} bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg shadow-xl py-1 z-50 select-none text-xs`}
          >
            {items.map((item) => (
              <React.Fragment key={item.id}>
                {item.dividerBefore && <div className="my-1 border-t border-[var(--border-subtle)]" />}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.disabled) return;
                    item.onClick();
                    onClose();
                  }}
                  disabled={item.disabled}
                  title={item.title}
                  className={`w-full px-3 py-1.5 text-left flex items-center space-x-2 transition-colors ${
                    item.disabled
                      ? 'text-[var(--text-tertiary)] opacity-40 cursor-not-allowed'
                      : item.danger
                      ? 'text-[var(--warning)] hover:bg-[var(--warning-subtle)]'
                      : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  {item.icon && <span className="shrink-0">{item.icon}</span>}
                  <span className="truncate">{item.label}</span>
                </button>
              </React.Fragment>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
