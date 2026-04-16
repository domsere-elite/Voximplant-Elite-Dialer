'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '~' },
  { href: '/dashboard/campaigns', label: 'Campaigns', icon: '>' },
  { href: '/dashboard/supervisor', label: 'Supervisor', icon: '^' },
  { href: '/dashboard/reports', label: 'Reports', icon: '#' },
  { href: '/dashboard/voicemail', label: 'Voicemail', icon: '@' },
  { href: '/dashboard/settings', label: 'Settings', icon: '*' },
  { href: '/dashboard/admin', label: 'Admin', icon: '!' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-6">
          <h1 className="text-lg font-bold">
            {process.env.NEXT_PUBLIC_APP_NAME || 'VoximplantBuild'}
          </h1>
          <p className="text-xs text-gray-400 mt-1">Collections Dialer</p>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems
            .filter((item) => {
              if (item.href === '/dashboard/admin' && user.role === 'agent') return false;
              if (item.href === '/dashboard/supervisor' && user.role === 'agent') return false;
              return true;
            })
            .map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="text-sm text-gray-300">
            {user.firstName} {user.lastName}
          </div>
          <div className="text-xs text-gray-500">{user.role}</div>
          <button
            onClick={logout}
            className="mt-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
