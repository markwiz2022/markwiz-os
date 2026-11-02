'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';

export default function NavLink({ href, className = '', children, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const path = typeof href === 'string' ? href : (href.pathname || '');
  const isActive = path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/');

  return (
    <Link
      href={href}
      prefetch={true}
      className={`${className} ${isActive ? 'active' : ''}`.trim()}
      {...props}
    >
      {children}
    </Link>
  );
}
