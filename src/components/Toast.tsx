import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, onClose }) => {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center px-4 py-2.5 rounded-full shadow-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
        >
          <AlertCircle className="w-4 h-4 text-[var(--warning)] mr-2 shrink-0" />
          <span className="text-sm font-medium whitespace-nowrap">{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
