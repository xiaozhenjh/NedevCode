/**
 * Reusable modal animation configurations extracted from NewProjectModal.
 * Consistent spring-based slide-in animation for all modals in the application.
 */

export const modalBackdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.16 },
};

export const modalContentMotion = {
  initial: { opacity: 0, y: '100%' },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: '100%' },
  transition: { type: 'spring' as const, damping: 26, stiffness: 300 },
};

// Aliases for convenient spreading
export const modalBackdropProps = modalBackdropMotion;
export const modalContentProps = modalContentMotion;
