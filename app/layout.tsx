import './globals.css';
import type { ReactNode } from 'react';
import { currentUser } from '@/lib/auth';
import LogoutButton from '@/components/logout-button';
import NotificationBell from '@/components/notification-bell';
import SidebarShell from '@/components/sidebar-shell';
import NavLink from '@/components/nav-link';
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
                  {u.role === 'MD' && <NavLink href="/" data-icon="⌂">Command Centre</NavLink>}
                  <NavLink href="/today" data-icon="☀">Today</NavLink>
                  <NavLink href="/tasks" data-icon="✓">Work & Tasks</NavLink>
                  <NavLink href="/clients" data-icon="◉">Clients</NavLink>
                  <NavLink href="/content" data-icon="▦">Content calendar</NavLink>
                  {(u.role === 'MD' || u.role === 'DMM') && <NavLink href="/scopes" data-icon="↻">Client scopes</NavLink>}
                  {(u.role === 'MD' || u.role === 'DMM') && <NavLink href="/reports" data-icon="✉">Client reports</NavLink>}
                  {(u.role === 'MD' || u.role === 'DMM') && <NavLink href="/exceptions" data-icon="!">Exceptions</NavLink>}
                </nav>
              </div>

              {(u.role === 'MD' || u.role === 'SALES' || u.role === 'FINANCE') && (
                <div className="nav-section">
                  <div className="nav-label">GROW</div>
                  <nav>
                    {['MD', 'SALES'].includes(u.role) && <NavLink href="/crm" data-icon="↗">Sales CRM</NavLink>}
                    {['MD', 'FINANCE'].includes(u.role) && <NavLink href="/finance" data-icon="₹">Finance</NavLink>}
                    {u.role === 'MD' && <NavLink href="/payroll" data-icon="₹">Payroll</NavLink>}
                    {u.role === 'MD' && <NavLink href="/profitability" data-icon="%">Profitability</NavLink>}
                  </nav>
                </div>
              )}

              <div className="nav-section">
                <div className="nav-label">PEOPLE</div>
                <nav>
                  <NavLink href="/scorecards" data-icon="◧">Scorecards</NavLink>
                  {u.role === 'MD' && <NavLink href="/team" data-icon="✚">Team & targets</NavLink>}
                  <NavLink href="/people" data-icon="◎">Attendance & Leave</NavLink>
                  <NavLink href="/my-pay" data-icon="₹">My Pay</NavLink>
                  <NavLink href="/account" data-icon="⚙">My Account</NavLink>
                  <NavLink href="/help" data-icon="?">Help & guide</NavLink>
                </nav>
              </div>

              {u.role === 'MD' && (
                <div className="nav-section">
                  <div className="nav-label">INTELLIGENCE</div>
                  <nav>
                    <NavLink href="/ai-coo" data-icon="✦">AI COO</NavLink>
                    <NavLink href="/audit" data-icon="≡">Audit Trail</NavLink>
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
