'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

export function useAuth() {
  const state = useAuthStore();

  useEffect(() => {
    if (state.status === 'idle') {
      state.initFromStorage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
