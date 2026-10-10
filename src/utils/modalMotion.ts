/**
 * Reusable modal animation configurations.
 * Fluid spring-based slide-in and fade animations.
 */

export const modalBackdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: 'easeOut' as const },
};

export const modalContentMotion = {
  initial: { opacity: 0, y: '100%' },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: '100%' },
  transition: { type: 'spring' as const, damping: 30, stiffness: 340, mass: 0.85 },
};

// Aliases for convenient spreading
export const modalBackdropProps = modalBackdropMotion;
export const modalContentProps = modalContentMotion;

