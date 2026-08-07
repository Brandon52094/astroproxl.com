// lib/pwa.ts
import { useState, useEffect } from 'react';

/**
 * Synchronous check: returns true if the app is running in standalone mode (PWA).
 */
export function isPWA(): boolean {
  if (typeof window === 'undefined') return false;

  // iOS Safari
  if (window.navigator.standalone) return true;

  // Android/Chrome (display-mode: standalone)
  if (window.matchMedia('(display-mode: standalone)').matches) return true;

  // Some browsers use a different property
  if ((window.navigator as any).standalone === true) return true;

  return false;
}

/**
 * React hook that returns the current PWA state and listens for changes.
 */
export function usePWA(): boolean {
  const [isStandalone, setIsStandalone] = useState<boolean>(false);

  useEffect(() => {
    setIsStandalone(isPWA());

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handler = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
    };
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return isStandalone;
}