import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { modalBackdropProps, modalContentProps } from '../utils/modalMotion';

export interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  maxWidth?: string; // e.g. 'max-w-md', 'max-w-lg', 'max-w-2xl', 'max-w-sm'
  className?: string; // custom classes for the card inner body
  children: React.ReactNode;
  id?: string;
}

/**
 * Universal ModalShell component.
 * Provides unified backdrop animation, spring-based slide-in,
 * and a bottom blocker underlay to prevent content underneath
 * from flashing/leaking through during and at the apex of pop-up.
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  maxWidth = 'max-w-md',
  className = '',
  children,
  id,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id={id ? `${id}-backdrop` : undefined}
          {...modalBackdropProps}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 select-none"
          onClick={onClose}
        >
          <motion.div
            id={id ? `${id}-container` : undefined}
            {...modalContentProps}
            className={`relative w-full ${maxWidth} pointer-events-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Card */}
            <div
              id={id}
              className={`w-full bg-[var(--bg-secondary)] rounded-t-2xl sm:rounded-2xl border border-[var(--border-subtle)] shadow-2xl max-h-[90vh] ${className}`}
            >
              {children}
            </div>

            {/* 弹出时及弹出到顶时下方空白遮挡区域：阻挡底层内容透出 */}
            <div
              className="sm:hidden absolute top-full left-0 right-0 h-[100vh] bg-[var(--bg-secondary)] pointer-events-none"
              aria-hidden="true"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
