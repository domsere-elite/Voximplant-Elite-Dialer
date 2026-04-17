'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/Sidebar';
import { useAuth } from '@/hooks/useAuth';

const SoftphoneBar = dynamic(
  () => import('@/components/softphone/SoftphoneBar').then((m) => m.SoftphoneBar),
  { ssr: false }
);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, token, status } = useAuth();

  useEffect(() => {
    if (status === 'idle') return;
    if (!token) {
      router.replace('/');
    }
  }, [token, status, router]);

  if (!token || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar role={user.role} />
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-screen-2xl mx-auto px-6 py-6">{children}</div>
      </main>
      <SoftphoneBar />
    </div>
  );
}
