'use client';

import { ChangeEvent } from 'react';
import clsx from 'clsx';
import type { AgentStatus } from '@/types';

const OPTIONS: { value: AgentStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'break', label: 'On Break' },
  { value: 'offline', label: 'Offline' }
];

interface Props {
  value: AgentStatus;
  onChange: (next: AgentStatus) => void;
  disabled?: boolean;
  className?: string;
}

export function StatusDropdown({ value, onChange, disabled, className }: Props) {
  return (
    <label className={clsx('flex items-center gap-2 text-sm', className)}>
      <span className="text-slate-400">Status</span>
      <select
        aria-label="Status"
        className="bg-slate-800 text-white border border-slate-700 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as AgentStatus)}
        disabled={disabled}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
