import './globals.css';
import type { ReactNode } from 'react';
import { currentUser } from '@/lib/auth';
import Link from 'next/link';
import LogoutButton from '@/components/logout-button';
import NotificationBell from '@/components/notification-bell';
import SidebarShell from '@/components/sidebar-shell';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = { title: 'Markwiz OS', description: 'Markwiz operating system', appleWebApp: { capable: true, title: 'Markwiz OS', statusBarStyle: 'black-translucent' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#060810' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const u = await currentUser();

  return (
    <html lang="en">
      <body>
        {u ? (
          <SidebarShell>
            <div className="brand-lockup">
              <div className="brand-mark">M</div>
              <div>
                <div className="brand">MARKWIZ</div>
                <span>OPERATING SYSTEM</span>
              </div>
            </div>

            <div className="user-card">
              <div className="avatar">{u.name.slice(0, 1).toUpperCase()}</div>
              <div className="user-copy">
                <b>{u.name}</b>
                <span>{u.role}</span>
              </div>
              <small>{u.email}</small>
            </div>

            <NotificationBell />

            <div className="nav-scroll">
              <div className="nav-section">
                <div className="nav-label">OPERATE</div>
                <nav>
                  {u.role === 'MD' && <Link href="/" data-icon="⌂">Command Centre</Link>}
                  <Link href="/today" data-icon="☀">Today</Link>
                  <Link href="/tasks" data-icon="✓">Work & Tasks</Link>
                  <Link href="/clients" data-icon="◉">Clients</Link>
                  <Link href="/content" data-icon="▦">Content calendar</Link>
                  {(u.role === 'MD' || u.role === 'DMM') && <Link href="/scopes" data-icon="↻">Client scopes</Link>}
                  {(u.role === 'MD' || u.role === 'DMM') && <Link href="/reports" data-icon="✉">Client reports</Link>}
                  {(u.role === 'MD' || u.role === 'DMM') && <Link href="/exceptions" data-icon="!">Exceptions</Link>}
                </nav>
              </div>

              {(u.role === 'MD' || u.role === 'SALES' || u.role === 'FINANCE') && (
                <div className="nav-section">
                  <div className="nav-label">GROW</div>
                  <nav>
                    {['MD', 'SALES'].includes(u.role) && <Link href="/crm" data-icon="↗">Sales CRM</Link>}
                    {['MD', 'FINANCE'].includes(u.role) && <Link href="/finance" data-icon="₹">Finance</Link>}
                    {u.role === 'MD' && <Link href="/payroll" data-icon="₹">Payroll</Link>}
                    {u.role === 'MD' && <Link href="/profitability" data-icon="%">Profitability</Link>}
                  </nav>
                </div>
              )}

              <div className="nav-section">
                <div className="nav-label">PEOPLE</div>
                <nav>
                  <Link href="/scorecards" data-icon="◧">Scorecards</Link>
                  {u.role === 'MD' && <Link href="/team" data-icon="✚">Team & targets</Link>}
                  <Link href="/people" data-icon="◎">Attendance & Leave</Link>
                  <Link href="/my-pay" data-icon="₹">My Pay</Link>
                  <Link href="/account" data-icon="⚙">My Account</Link>
                  <Link href="/help" data-icon="?">Help & guide</Link>
                </nav>
              </div>

              {u.role === 'MD' && (
                <div className="nav-section">
                  <div className="nav-label">INTELLIGENCE</div>
                  <nav>
                    <Link href="/ai-coo" data-icon="✦">AI COO</Link>
                    <Link href="/audit" data-icon="≡">Audit Trail</Link>
                  </nav>
                </div>
              )}
            </div>

            <div className="sidebar-footer">
              <div className="system-status"><span />All systems operational</div>
              <LogoutButton />
            </div>
          </SidebarShell>
        ) : null}

        <main className={u ? 'app-main' : 'app-main public-main'}>{children}</main>
      </body>
    </html>
  );
}
