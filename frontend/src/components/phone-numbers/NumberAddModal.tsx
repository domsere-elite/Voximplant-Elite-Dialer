'use client';

import { useState } from 'react';

export interface DIDGroupOption {
  id: string;
  name: string;
}

export interface NewNumberPayload {
  number: string;
  voximplantNumberId?: number;
  areaCode: string;
  state: string;
  didGroupId: string | null;
}

interface Props {
  didGroups: DIDGroupOption[];
  onClose: () => void;
  onSave: (payload: NewNumberPayload) => Promise<void>;
}

interface FormState {
  number: string;
  voximplantNumberId: string;
  areaCode: string;
  state: string;
  didGroupId: string | null;
}

export function NumberAddModal({ didGroups, onClose, onSave }: Props) {
  const [form, setForm] = useState<FormState>({
    number: '',
    voximplantNumberId: '',
    areaCode: '',
    state: '',
    didGroupId: null,
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\+[1-9]\d{6,14}$/.test(form.number)) {
      setErr('Number must be E.164');
      return;
    }
    if (!/^\d{3}$/.test(form.areaCode)) {
      setErr('Area code must be 3 digits');
      return;
    }
    if (form.state && !/^[A-Z]{2}$/.test(form.state)) {
      setErr('State must be 2-letter code');
      return;
    }
    let voximplantNumberId: number | undefined;
    if (form.voximplantNumberId.trim() !== '') {
      const parsed = Number(form.voximplantNumberId.trim());
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setErr('Voximplant number id must be a positive integer');
        return;
      }
      voximplantNumberId = parsed;
    }
    setErr(null);
    setSaving(true);
    try {
      await onSave({
        number: form.number,
        voximplantNumberId,
        areaCode: form.areaCode,
        state: form.state,
        didGroupId: form.didGroupId,
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
        className="bg-white rounded-lg shadow-lg p-6 w-[28rem] space-y-3"
      >
        <h2 className="text-lg font-semibold">Add Phone Number</h2>

        <label className="block text-sm">
          <span className="block font-medium mb-1">Number (E.164)</span>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.number}
            onChange={(e) => setForm({ ...form, number: e.target.value })}
            placeholder="+15551234567"
          />
        </label>

        <label className="block text-sm">
          <span className="block font-medium mb-1">Voximplant Number ID (optional)</span>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.voximplantNumberId}
            onChange={(e) => setForm({ ...form, voximplantNumberId: e.target.value })}
            inputMode="numeric"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="block font-medium mb-1">Area Code</span>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.areaCode}
              onChange={(e) => setForm({ ...form, areaCode: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="block font-medium mb-1">State</span>
            <input
              className="w-full border rounded px-3 py-2 uppercase"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
              maxLength={2}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="block font-medium mb-1">DID Group (optional)</span>
          <select
            className="w-full border rounded px-3 py-2"
            value={form.didGroupId ?? ''}
            onChange={(e) =>
              setForm({ ...form, didGroupId: e.target.value === '' ? null : e.target.value })
            }
          >
            <option value="">None</option>
            {didGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
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
            {saving ? 'Saving...' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}
