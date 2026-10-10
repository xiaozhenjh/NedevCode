import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { X } from 'lucide-react';

export interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  showCloseButton?: boolean;
  isCloseDisabled?: boolean;
  maxWidth?: string; // e.g. 'max-w-md', 'max-w-lg', 'max-w-xl', 'max-w-sm'
  className?: string; // custom classes for the inner body
  children?: React.ReactNode;
  id?: string;
  scrollable?: boolean; // defaults to true
}

/**
 * Traverses up from target to boundary to find an element with vertical scrolling.
 */
function findScrollableParent(target: HTMLElement | null, boundary: HTMLElement | null): HTMLElement | null {
  let el = target;
  while (el && el !== boundary) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  if (boundary) {
    const style = window.getComputedStyle(boundary);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && boundary.scrollHeight > boundary.clientHeight) {
      return boundary;
    }
  }
  return null;
}

/**
 * Fully Abstracted Universal Natural Slide-Up Modal.
 * Encapsulates:
 * - Fluid spring presentation & momentum exit animations
 * - Seamless pull-down-to-dismiss gesture ("下拉到头继续下拉关闭")
 * - Standardized header (title, icon, close button), drag handle, and footer layout
 * - Unified responsive mobile sheet & desktop modal styling
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  headerExtra,
  footer,
  showCloseButton = true,
  isCloseDisabled = false,
  maxWidth = 'max-w-md',
  className = '',
  children,
  id,
  scrollable = true,
}) => {
  const [isMounted, setIsMounted] = useState(isOpen);
  const isAnimatingOutRef = useRef(false);

  // Motion values
  const getScreenHeight = () => (typeof window !== 'undefined' ? Math.max(window.innerHeight, 600) : 800);
  const y = useMotionValue(getScreenHeight());
  const backdropOpacity = useMotionValue(0);

  // Dynamic backdrop opacity tied to entry/exit and drag offset
  const dynamicBackdropOpacity = useTransform([backdropOpacity, y], ([alpha, yVal]: number[]) => {
    const dragRatio = Math.min(1, Math.max(0, yVal / 350));
    return alpha * (1 - dragRatio * 0.65);
  });

  const cardRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const activeAnimControlsRef = useRef<ReturnType<typeof animate> | null>(null);

  // Dismiss with smooth downward acceleration & momentum
  const dismissWithAnimation = useCallback(
    ({ velocity = 0, notifyOnClose = true }: { velocity?: number; notifyOnClose?: boolean } = {}) => {
      if (isAnimatingOutRef.current) return;
      isAnimatingOutRef.current = true;
      const screenH = getScreenHeight();

      activeAnimControlsRef.current?.stop();
      activeAnimControlsRef.current = animate(y, screenH, {
        type: 'spring',
        damping: 32,
        stiffness: 320,
        mass: 0.85,
        velocity: Math.max(120, velocity * 1000),
        onComplete: () => {
          if (notifyOnClose) {
            onClose();
          }
          setIsMounted(false);
          isAnimatingOutRef.current = false;
        },
      });

      animate(backdropOpacity, 0, {
        duration: 0.2,
        ease: 'easeOut',
      });
    },
    [onClose, y, backdropOpacity]
  );

  // Snap back to 0 position if drag released before threshold
  const snapBack = useCallback(() => {
    activeAnimControlsRef.current?.stop();
    activeAnimControlsRef.current = animate(y, 0, {
      type: 'spring',
      damping: 28,
      stiffness: 380,
      mass: 0.8,
    });
  }, [y]);

  // Synchronize with parent isOpen state
  useEffect(() => {
    if (isOpen) {
      if (!isMounted) {
        setIsMounted(true);
      }
      isAnimatingOutRef.current = false;
      const screenH = getScreenHeight();
      y.set(screenH);
      backdropOpacity.set(0);

      activeAnimControlsRef.current?.stop();
      activeAnimControlsRef.current = animate(y, 0, {
        type: 'spring',
        damping: 30,
        stiffness: 340,
        mass: 0.85,
      });

      animate(backdropOpacity, 1, {
        duration: 0.22,
        ease: 'easeOut',
      });
    } else {
      if (isMounted && !isAnimatingOutRef.current) {
        dismissWithAnimation({ notifyOnClose: false });
      }
    }
  }, [isOpen]);

  // Lock background scroll when mounted
  useEffect(() => {
    if (!isMounted) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMounted]);

  // Handle ESC key
  useEffect(() => {
    if (!isMounted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isAnimatingOutRef.current && !isCloseDisabled) {
        dismissWithAnimation({ notifyOnClose: true });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMounted, isCloseDisabled, dismissWithAnimation]);

  // Touch Gesture Handling ("支持下拉到头继续下拉关闭")
  useEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl || !isMounted) return;

    let touchStartY = 0;
    let touchStartX = 0;
    let touchPullStartY = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocityY = 0;
    let isDraggingModal = false;
    let gestureLock: 'vertical' | 'horizontal' | null = null;
    let currentScrollEl: HTMLElement | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (isAnimatingOutRef.current || e.touches.length !== 1) return;
      activeAnimControlsRef.current?.stop();

      const touch = e.touches[0];
      const now = performance.now();
      const rawTarget = e.target;
      const target = (rawTarget instanceof HTMLElement ? rawTarget : (rawTarget as Node)?.parentElement) as HTMLElement | null;

      const isHandle = !!(handleRef.current && (handleRef.current === target || handleRef.current.contains(target)));
      currentScrollEl = isHandle ? null : findScrollableParent(target, cardRef.current);

      touchStartY = touch.clientY;
      touchStartX = touch.clientX;
      touchPullStartY = touch.clientY;
      lastY = touch.clientY;
      lastTime = now;
      velocityY = 0;
      isDraggingModal = isHandle;
      gestureLock = isHandle ? 'vertical' : null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isAnimatingOutRef.current || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const currentY = touch.clientY;
      const currentX = touch.clientX;
      const deltaY = currentY - touchStartY;
      const deltaX = currentX - touchStartX;

      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 0) {
        const instantV = (currentY - lastY) / dt;
        velocityY = 0.7 * instantV + 0.3 * velocityY;
      }
      lastY = currentY;
      lastTime = now;

      // Lock gesture orientation
      if (!gestureLock) {
        if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
          gestureLock = 'horizontal';
          return;
        }
        if (Math.abs(deltaY) > 5) {
          gestureLock = 'vertical';
        } else {
          return;
        }
      }

      if (gestureLock === 'horizontal') return;

      // When already in modal pull-down drag mode
      if (isDraggingModal) {
        if (e.cancelable) e.preventDefault();
        const rawDist = currentY - touchPullStartY;
        let newY = 0;
        if (rawDist >= 0) {
          newY = rawDist;
        } else {
          newY = Math.max(-24, rawDist * 0.18);
        }
        y.set(newY);
        return;
      }

      // If touching scrollable content:
      if (currentScrollEl) {
        const scrollTop = currentScrollEl.scrollTop;
        if (scrollTop <= 0 && currentY > lastY && deltaY > 0) {
          isDraggingModal = true;
          touchPullStartY = currentY;
          if (e.cancelable) e.preventDefault();
          y.set(0);
        }
      } else {
        // No scrollable container: direct vertical drag
        isDraggingModal = true;
        touchPullStartY = touchStartY;
        if (e.cancelable) e.preventDefault();
        const rawDist = deltaY;
        const newY = rawDist >= 0 ? rawDist : Math.max(-24, rawDist * 0.18);
        y.set(newY);
      }
    };

    const onTouchEnd = () => {
      if (isDraggingModal && !isAnimatingOutRef.current) {
        const currentY = y.get();
        const shouldClose = currentY >= 80 || (velocityY >= 0.35 && currentY >= 25);
        if (shouldClose) {
          dismissWithAnimation({ velocity: velocityY, notifyOnClose: true });
        } else {
          snapBack();
        }
      }
      isDraggingModal = false;
      gestureLock = null;
      currentScrollEl = null;
    };

    cardEl.addEventListener('touchstart', onTouchStart, { passive: true });
    cardEl.addEventListener('touchmove', onTouchMove, { passive: false });
    cardEl.addEventListener('touchend', onTouchEnd, { passive: true });
    cardEl.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      cardEl.removeEventListener('touchstart', onTouchStart);
      cardEl.removeEventListener('touchmove', onTouchMove);
      cardEl.removeEventListener('touchend', onTouchEnd);
      cardEl.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isMounted, y, dismissWithAnimation, snapBack]);

  // Desktop Mouse Drag on Handle Bar
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isAnimatingOutRef.current) return;
    e.preventDefault();
    activeAnimControlsRef.current?.stop();

    const startY = e.clientY;
    let lastY = startY;
    let lastTime = performance.now();
    let velocityY = 0;

    const onMouseMove = (ev: MouseEvent) => {
      const currentY = ev.clientY;
      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 0) {
        velocityY = (currentY - lastY) / dt;
      }
      lastY = currentY;
      lastTime = now;

      const deltaY = currentY - startY;
      const newY = deltaY >= 0 ? deltaY : Math.max(-20, deltaY * 0.15);
      y.set(newY);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const currentY = y.get();
      const shouldClose = currentY >= 80 || (velocityY >= 0.35 && currentY >= 25);
      if (shouldClose) {
        dismissWithAnimation({ velocity: velocityY, notifyOnClose: true });
      } else {
        snapBack();
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Click on backdrop to dismiss
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isAnimatingOutRef.current && !isCloseDisabled) {
      dismissWithAnimation({ notifyOnClose: true });
    }
  };

  if (!isMounted) return null;

  return (
    <motion.div
      id={id ? `${id}-backdrop` : undefined}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm p-0 sm:p-4 select-none touch-pan-y"
      onClick={handleBackdropClick}
      style={{ opacity: dynamicBackdropOpacity }}
    >
      <motion.div
        id={id ? `${id}-container` : undefined}
        className={`relative w-full ${maxWidth} pointer-events-auto`}
        style={{ y }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Card */}
        <div
          ref={cardRef}
          id={id}
          className="w-full bg-[var(--bg-secondary)] rounded-t-2xl sm:rounded-2xl border border-[var(--border-subtle)] shadow-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden"
        >
          {/* Drag Handle Bar */}
          <div
            ref={handleRef}
            onMouseDown={handleMouseDown}
            className="w-full flex items-center justify-center pt-2.5 pb-1 shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
            title="向下滑动关闭"
          >
            <div className="w-10 h-1 rounded-full bg-[var(--text-tertiary)]/35 hover:bg-[var(--text-tertiary)]/60 transition-colors" />
          </div>

          {/* Standardized Header */}
          {(title || showCloseButton) && (
            <div className="px-4 pb-2.5 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-secondary)]">
              <div className="flex items-center space-x-2 min-w-0">
                {icon && <span className="shrink-0">{icon}</span>}
                {typeof title === 'string' ? (
                  <h2 className="text-sm font-bold text-[var(--text-primary)] truncate">{title}</h2>
                ) : (
                  title
                )}
              </div>
              {showCloseButton && (
                <button
                  type="button"
                  onClick={() => dismissWithAnimation({ notifyOnClose: true })}
                  disabled={isCloseDisabled}
                  className="p-1 -mr-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] press-feedback disabled:opacity-50 transition-colors shrink-0"
                  title="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Sub Header Extra (e.g. tabs bar) */}
          {headerExtra && <div className="shrink-0">{headerExtra}</div>}

          {/* Modal Content Body */}
          <div className={`flex-1 min-h-0 ${scrollable ? 'overflow-y-auto p-4 space-y-4' : ''} ${className}`}>
            {children}
          </div>

          {/* Optional Footer */}
          {footer && (
            <div className="px-4 py-3 bg-[var(--bg-tertiary)] border-t border-[var(--border-subtle)] flex items-center justify-end space-x-2 shrink-0">
              {footer}
            </div>
          )}
        </div>

        {/* 底部遮挡层：移动端防露底与回弹保护 */}
        <div
          className="sm:hidden absolute top-full left-0 right-0 h-[100vh] bg-[var(--bg-secondary)] pointer-events-none"
          aria-hidden="true"
        />
      </motion.div>
    </motion.div>
  );
};
