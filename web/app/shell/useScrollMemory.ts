import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** Link state that asks the next page to reopen scrolled where the person left that page. */
export const RESTORE_SCROLL = { restoreScroll: true } as const;

/**
 * Remembers where each page was scrolled when you left it. A link carrying `RESTORE_SCROLL`
 * (the "back to scores" links) reopens its page at that spot; the page's data may still be
 * loading, so the jump is retried until the page is tall enough.
 */
export function useScrollMemory() {
  const location = useLocation();
  const saved = useRef(new Map<string, number>());
  const lastY = useRef(0);
  const prevKey = useRef(location.pathname + location.search);

  useEffect(() => {
    const onScroll = () => { lastY.current = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    const key = location.pathname + location.search;
    if (key === prevKey.current) return;
    saved.current.set(prevKey.current, lastY.current);
    prevKey.current = key;
    const target = (location.state as { restoreScroll?: boolean } | null)?.restoreScroll ? saved.current.get(key) : undefined;
    lastY.current = 0;
    if (!target) return;
    const started = Date.now();
    let raf = 0;
    const attempt = () => {
      window.scrollTo(0, target);
      const reached = Math.abs(window.scrollY - target) < 2;
      if (!reached && Date.now() - started < 3000) raf = requestAnimationFrame(attempt);
      else lastY.current = window.scrollY;
    };
    attempt();
    return () => cancelAnimationFrame(raf);
  }, [location]);
}
