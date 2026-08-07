// lib/pwa.ts
import { useState, useEffect } from 'react';

export function isPWA(): boolean {
  if (typeof window === 'undefined') return false;

  if ((window.navigator as any).standalone) return true;

  if (window.matchMedia('(display-mode: standalone)').matches) return true;

  if ((window.navigator as any).standalone === true) return true;

  return false;
}

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