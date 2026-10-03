import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Check } from 'lucide-react';
import { SearchMode } from '../utils/searchUtils';

export interface SearchModeDropdownProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  caseSensitive: boolean;
  onCaseSensitiveChange: (caseSensitive: boolean) => void;
  buttonClassName?: string;
  title?: string;
}

export const SearchModeDropdown: React.FC<SearchModeDropdownProps> = ({
  mode,
  onModeChange,
  caseSensitive,
  onCaseSensitiveChange,
  buttonClassName = '',
  title = '切换搜索模式与选项',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuCoords, setMenuCoords] = useState<{ top?: number; bottom?: number; right: number }>({
    right: 16,
  });

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const right = Math.max(8, window.innerWidth - rect.right);

    if (spaceBelow >= 200 || spaceBelow > rect.top) {
      setMenuCoords({
        top: rect.bottom + 6,
        right,
      });
    } else {
      setMenuCoords({
        bottom: window.innerHeight - rect.top + 6,
        right,
      });
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDownOutside = (e: PointerEvent | MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  const isActive = mode !== 'normal' || caseSensitive;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`p-1.5 rounded-lg border text-xs press-feedback transition-colors flex items-center justify-center shrink-0 ${
          isActive
            ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border-[var(--brand-border)] font-semibold'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-subtle)]'
        } ${buttonClassName}`}
        title={title}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              zIndex: 99999,
              right: `${menuCoords.right}px`,
              ...(menuCoords.top !== undefined ? { top: `${menuCoords.top}px` } : {}),
              ...(menuCoords.bottom !== undefined ? { bottom: `${menuCoords.bottom}px` } : {}),
            }}
            className="w-48 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg shadow-xl py-1 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1 text-[10px] font-semibold text-[var(--text-tertiary)]">
              搜索模式与匹配
            </div>

            <button
              type="button"
              onClick={() => {
                onModeChange('normal');
                setIsOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-[var(--bg-tertiary)] transition-colors ${
                mode === 'normal' ? 'text-[var(--brand)] font-medium' : 'text-[var(--text-primary)]'
              }`}
            >
              <span>普通文本</span>
              {mode === 'normal' && <Check className="w-3.5 h-3.5 text-[var(--brand)]" />}
            </button>

            <button
              type="button"
              onClick={() => {
                onModeChange('regex');
                setIsOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-[var(--bg-tertiary)] transition-colors ${
                mode === 'regex' ? 'text-[var(--brand)] font-medium' : 'text-[var(--text-primary)]'
              }`}
            >
              <span>正则与通配符 (.*)</span>
              {mode === 'regex' && <Check className="w-3.5 h-3.5 text-[var(--brand)]" />}
            </button>

            <button
              type="button"
              onClick={() => {
                onModeChange('fuzzy');
                setIsOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-[var(--bg-tertiary)] transition-colors ${
                mode === 'fuzzy' ? 'text-[var(--brand)] font-medium' : 'text-[var(--text-primary)]'
              }`}
            >
              <span>模糊匹配 (~)</span>
              {mode === 'fuzzy' && <Check className="w-3.5 h-3.5 text-[var(--brand)]" />}
            </button>

            <div className="my-1 border-t border-[var(--border-subtle)]" />

            <button
              type="button"
              onClick={() => {
                onCaseSensitiveChange(!caseSensitive);
              }}
              className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-primary)]"
            >
              <span>区分大小写 (Aa)</span>
              {caseSensitive && <Check className="w-3.5 h-3.5 text-[var(--brand)]" />}
            </button>
          </div>,
          document.body
        )}
    </>
  );
};
