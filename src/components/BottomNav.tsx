import React from 'react';
import { Files, Code2, PlaySquare } from 'lucide-react';
import { ActiveTab } from '../types';

interface BottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  hasErrors?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  hasErrors = false
}) => {
  const navItems: { id: ActiveTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'projects', label: '文件', icon: Files },
    { id: 'code', label: '代码', icon: Code2 },
    { id: 'run', label: '运行', icon: PlaySquare }
  ];

  return (
    <nav className="w-full bg-[var(--bg-secondary)] border-t border-[var(--border-subtle)] px-4 py-1.5 flex items-center justify-around z-30 shrink-0 select-none pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))]">
      {navItems.map((item) => {
        const isActive = activeTab === item.id;
        const IconComponent = item.icon;

        return (
          <button
            key={item.id}
            id={`bottom-nav-${item.id}`}
            onClick={() => setActiveTab(item.id)}
            className={`flex-1 py-1 flex flex-col items-center justify-center press-feedback transition-colors relative ${
              isActive ? 'text-[var(--brand)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <IconComponent className={`w-5 h-5 ${isActive ? 'stroke-[2.2]' : 'stroke-[1.8]'}`} />
            <span className="text-[11px] mt-1">
              {item.label}
            </span>

            {item.id === 'run' && hasErrors && (
              <span className="absolute top-1 right-[35%] w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
};

