'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** The sidebar on desktop; on phones a top bar with a Menu button. The menu closes after each navigation. */
export default function SidebarShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  return <aside className={`app-sidebar ${open ? 'open' : ''}`}>
    <button type="button" className="menu-toggle" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? '✕ Close' : '☰ Menu'}</button>
    {children}
  </aside>;
}
