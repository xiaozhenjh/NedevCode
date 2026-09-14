import React from 'react';
import { Files, Code2, PlaySquare } from 'lucide-react';
import { motion } from 'motion/react';
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
          <motion.button
            key={item.id}
            id={`bottom-nav-${item.id}`}
            onClick={() => setActiveTab(item.id)}
            whileTap={{ scale: 0.92 }}
            className={`flex-1 py-1 flex flex-col items-center justify-center transition-colors relative ${
              isActive ? 'text-[var(--brand)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="bottomNavActivePill"
                className="absolute inset-x-3 inset-y-0.5 rounded-lg bg-[var(--brand-subtle)] z-0"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <motion.div
              animate={{ scale: isActive ? 1.05 : 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="relative z-10 flex flex-col items-center"
            >
              <IconComponent className={`w-5 h-5 ${isActive ? 'stroke-[2.2]' : 'stroke-[1.8]'}`} />
              <span className="text-[11px] mt-0.5">
                {item.label}
              </span>
            </motion.div>

            {item.id === 'run' && hasErrors && (
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                className="absolute top-1 right-[35%] w-1.5 h-1.5 rounded-full bg-[var(--warning)] z-20"
              />
            )}
          </motion.button>
        );
      })}
    </nav>
  );
};

