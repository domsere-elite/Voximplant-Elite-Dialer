import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}));

const logoutMock = vi.fn();

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: any) => selector({ logout: logoutMock }),
    { getState: () => ({ logout: logoutMock }) }
  )
}));

import { Sidebar } from '@/components/Sidebar';

describe('Sidebar', () => {
  it('shows only agent items for rep role', () => {
    render(<Sidebar role="rep" />);
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /campaigns/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /live monitor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /phone numbers/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
  });

  it('adds supervisor items', () => {
    render(<Sidebar role="supervisor" />);
    expect(screen.getByRole('link', { name: /live monitor/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reports/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /phone numbers/i })).not.toBeInTheDocument();
  });

  it('adds admin items', () => {
    render(<Sidebar role="admin" />);
    expect(screen.getByRole('link', { name: /phone numbers/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('highlights active link matching the pathname', () => {
    render(<Sidebar role="admin" />);
    const activeLink = screen.getByRole('link', { name: /dashboard/i });
    expect(activeLink.className).toMatch(/bg-slate-800|bg-primary/);
  });

  it('renders logout button', () => {
    render(<Sidebar role="rep" />);
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });
});
