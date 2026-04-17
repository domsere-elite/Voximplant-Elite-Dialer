'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Megaphone,
  Eye,
  BarChart3,
  Phone,
  Settings,
  LogOut
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import type { UserRole } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['rep', 'supervisor', 'admin'] },
  { href: '/dashboard/campaigns', label: 'Campaigns', icon: Megaphone, roles: ['rep', 'supervisor', 'admin'] },
  { href: '/dashboard/supervisor', label: 'Live Monitor', icon: Eye, roles: ['supervisor', 'admin'] },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3, roles: ['supervisor', 'admin'] },
  { href: '/dashboard/phone-numbers', label: 'Phone Numbers', icon: Phone, roles: ['admin'] },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, roles: ['admin'] }
];

interface Props {
  role: UserRole;
}

export function Sidebar({ role }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role));

  function handleLogout() {
    logout();
    router.push('/');
  }

  return (
    <aside className="w-64 shrink-0 bg-slate-900 text-white flex flex-col border-r border-slate-800">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="text-lg font-semibold">Elite Dialer</div>
        <div className="text-xs text-slate-400 uppercase tracking-wide mt-1">{role}</div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visible.map((item) => {
          const active =
            pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-800">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
