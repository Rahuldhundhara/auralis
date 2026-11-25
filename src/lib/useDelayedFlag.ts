import { useEffect, useRef, useState } from 'react';

/**
 * Mirrors `active`, but only turns on after `delay` ms so short operations do
 * not flash a spinner. Turning off is immediate.
 */
export function useDelayedFlag(active: boolean, delay: number): boolean {
  const [visible, setVisible] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    if (visible) return;
    const timer = window.setTimeout(() => {
      if (activeRef.current) setVisible(true);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [active, delay, visible]);

  return visible && active;
}
