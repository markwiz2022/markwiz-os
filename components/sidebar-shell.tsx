'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** The sidebar on desktop; on phones a top bar with a Menu button. Highlights the current page and closes the menu after each navigation. */
export default function SidebarShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => {
    setOpen(false);
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.app-sidebar nav a'));
    // The longest matching link wins, so /clients/123 highlights Clients and / only matches the home page.
    let best: HTMLAnchorElement | null = null;
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      const match = href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
      if (match && (!best || href.length > (best.getAttribute('href') || '').length)) best = a;
    }
    for (const a of links) { if (a === best) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  }, [path]);
  return <aside className={`app-sidebar ${open ? 'open' : ''}`}>
    <button type="button" className="menu-toggle" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? '✕ Close' : '☰ Menu'}</button>
    {children}
  </aside>;
}
