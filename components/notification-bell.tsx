'use client';
import { useEffect, useState, useRef } from 'react';

export default function NotificationBell() {
  const [n, setN] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const r = await fetch('/api/notifications');
      if (r.ok) setN(await r.json());
    } catch (e) {
      console.error('Failed to load notifications', e);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [open]);

  async function mark(id?: string) {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      load();
    } catch (e) {
      console.error('Failed to mark notification', e);
    }
  }

  const unreadCount = n.filter((x) => !x.read).length;

  return (
    <div className="notif" ref={containerRef}>
      <button
        type="button"
        className="icon-button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Notifications {unreadCount > 0 && <span className="notif-count">{unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <b>Notifications</b>
            <div className="notif-actions">
              {unreadCount > 0 && (
                <button type="button" onClick={() => mark()}>
                  Mark all read
                </button>
              )}
              <button
                type="button"
                className="notif-close-btn"
                onClick={() => setOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="notif-scroll">
            {n.length === 0 ? (
              <div className="notif-empty">No notifications yet.</div>
            ) : (
              n.slice(0, 15).map((x) => (
                <div
                  className={`notif-item ${x.read ? 'read' : 'unread'}`}
                  key={x.id}
                  onClick={() => mark(x.id)}
                >
                  <div className="notif-item-top">
                    <b>{x.title}</b>
                    {!x.read && <span className="notif-unread-dot" />}
                  </div>
                  <div className="notif-body">{x.body}</div>
                  <small>
                    {new Date(x.createdAt).toLocaleString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
