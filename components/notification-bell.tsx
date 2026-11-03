'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type Note = { id: string; title: string; body: string; read: boolean; createdAt: string };

/** Bell in the top bar. Checks for new notifications every minute, when you come back to the tab, and on every page change. */
export default function NotificationBell() {
  const [n, setN] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const load = useCallback(async () => { try { const r = await fetch('/api/notifications', { cache: 'no-store' }); if (r.ok) setN(await r.json()); } catch { /* offline: try again later */ } }, []);
  useEffect(() => { load(); }, [load, path]);
  useEffect(() => {
    const t = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  async function mark(id?: string) { await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { id } : { all: true }) }); load(); }
  const unread = n.filter((x) => !x.read).length;
  return <div className="notif" ref={box}>
    <button type="button" className="top-icon bell" onClick={() => setOpen((v) => !v)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} title="Notifications">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>
      {unread > 0 && <span className="notif-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div className="notif-panel">
      <div className="notif-head"><b>Notifications</b>{unread > 0 && <button onClick={() => mark()}>Mark all read</button>}</div>
      {n.length === 0 ? <p className="muted" style={{ padding: 14 }}>No notifications.</p> : n.slice(0, 15).map((x) => <div className={`notif-item ${x.read ? 'read' : ''}`} key={x.id} onClick={() => !x.read && mark(x.id)}><b>{x.title}</b><div>{x.body}</div><small>{new Date(x.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></div>)}
    </div>}
  </div>;
}
