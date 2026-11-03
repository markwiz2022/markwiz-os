'use client';
import { useEffect, useState } from 'react';

/** Runs before the page paints (see layout.tsx) so there is no flash of the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('mw-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})();`;

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light' | null>(null);
  useEffect(() => { setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'); }, []);
  function flip() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('mw-theme', next); } catch { /* private mode: still switches for this visit */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'light' ? '#f4f7fb' : '#080f16');
    setTheme(next);
  }
  const label = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  return <button type="button" className="top-icon theme-toggle" onClick={flip} aria-label={label} title={label}>
    {theme === 'light'
      ? <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
      : <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g></svg>}
    <span className="theme-label">{theme === 'light' ? 'Dark' : 'Light'}</span>
  </button>;
}
