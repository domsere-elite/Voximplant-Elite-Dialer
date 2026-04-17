'use client';

import { useState } from 'react';
import { PhoneNumber } from './NumberTable';

export interface NumberEditPatch {
  dailyCallLimit: number;
  isActive: boolean;
  cooldownUntil: string | null;
}

interface Props {
  number: PhoneNumber;
  onClose: () => void;
  onSave: (patch: NumberEditPatch) => Promise<void>;
}

export function NumberEditModal({ number, onClose, onSave }: Props) {
  const [limit, setLimit] = useState(number.dailyCallLimit);
  const [active, setActive] = useState(number.isActive);
  const [cooldown, setCooldown] = useState(number.cooldownUntil ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (limit < 0) {
      setErr('Daily limit must be >= 0');
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await onSave({
        dailyCallLimit: limit,
        isActive: active,
        cooldownUntil: cooldown ? new Date(cooldown).toISOString() : null,
      });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-lg p-6 w-[28rem] space-y-4"
      >
        <h2 className="text-lg font-semibold">Edit {number.number}</h2>

        <label className="block text-sm">
          <span className="block font-medium mb-1">Daily Call Limit</span>
          <input
            type="number"
            min={0}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-full border rounded px-3 py-2"
          />
        </label>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span className="text-sm">Active</span>
        </label>

        <label className="block text-sm">
          <span className="block font-medium mb-1">Cooldown Until</span>
          <input
            type="datetime-local"
            value={cooldown ? cooldown.slice(0, 16) : ''}
            onChange={(e) => setCooldown(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </label>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border rounded text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
