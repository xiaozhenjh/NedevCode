import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { CodeLanguage, ExecutionType } from '../types';
import { PLAYGROUND_RUNTIMES } from './LanguageSelectModal';
import { languageRegistry } from '../languages';

export interface PlaygroundLanguageDropdownProps {
  currentLanguage: CodeLanguage;
  onSelectLanguage: (lang: CodeLanguage, executionType: ExecutionType) => void;
  hasSelectedLanguage?: boolean;
}

export const PlaygroundLanguageDropdown: React.FC<PlaygroundLanguageDropdownProps> = ({
  currentLanguage,
  onSelectLanguage,
  hasSelectedLanguage = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0
  });

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 220));
    setMenuCoords({
      top: rect.bottom + 4,
      left
    });
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

  const displayName = hasSelectedLanguage
    ? (languageRegistry.get(currentLanguage)?.name || currentLanguage)
    : '选择语言';

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="px-2 py-1 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium press-feedback flex items-center space-x-1 transition-colors shrink-0"
        title="点击切换编程语言"
      >
        <span>{displayName}</span>
        <ChevronDown
          className={`w-3 h-3 text-[var(--text-tertiary)] shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              zIndex: 99999,
              top: `${menuCoords.top}px`,
              left: `${menuCoords.left}px`
            }}
            className="w-52 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-xl py-1.5 select-none overflow-hidden animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider border-b border-[var(--border-subtle)] mb-1">
              切换 Playground 语言
            </div>
            <div className="max-h-64 overflow-y-auto space-y-0.5 px-1">
              {PLAYGROUND_RUNTIMES.map((option) => {
                const isSelected = option.id === currentLanguage;
                return (
                  <button
                    key={option.id}
                    onClick={() => {
                      onSelectLanguage(option.id, option.executionType);
                      setIsOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-[var(--brand-subtle)] text-[var(--brand)] font-semibold'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] font-normal'
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className="w-4 h-4 shrink-0 flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5">
                        {option.icon}
                      </div>
                      <span className="truncate">{option.name}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[var(--brand)] shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
