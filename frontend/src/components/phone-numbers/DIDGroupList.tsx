'use client';

import { useState } from 'react';
import { PhoneNumber } from './NumberTable';

export interface DIDGroup {
  id: string;
  name: string;
  numbers: PhoneNumber[];
}

interface Props {
  groups: DIDGroup[];
  allNumbers: PhoneNumber[];
  onCreate: (name: string) => Promise<void>;
  onAssign: (groupId: string, phoneNumberId: string) => Promise<void>;
  onRemove: (groupId: string, phoneNumberId: string) => Promise<void>;
}

export function DIDGroupList({ groups, allNumbers, onCreate, onAssign, onRemove }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [assignChoice, setAssignChoice] = useState<Record<string, string>>({});

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await onCreate(newName.trim());
      setNewName('');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">New group name</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="border rounded px-3 py-2 text-sm w-full"
            placeholder="New group name"
          />
        </label>
        <button
          disabled={creating || !newName.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
        >
          Add Group
        </button>
      </form>

      {groups.length === 0 && (
        <div className="text-sm text-gray-500 border border-dashed rounded p-6 text-center">
          No DID groups yet.
        </div>
      )}

      {groups.map((g) => {
        const isOpen = openId === g.id;
        const unassigned = allNumbers.filter((n) => !g.numbers.find((m) => m.id === n.id));
        return (
          <div key={g.id} className="border rounded">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : g.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
            >
              <span className="font-medium">{g.name}</span>
              <span className="text-xs text-gray-500">
                {g.numbers.length} number{g.numbers.length === 1 ? '' : 's'} {isOpen ? '-' : '+'}
              </span>
            </button>
            {isOpen && (
              <div className="border-t p-4 space-y-3">
                {g.numbers.length === 0 && (
                  <div className="text-sm text-gray-500">No numbers assigned.</div>
                )}
                {g.numbers.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between border rounded px-3 py-2"
                  >
                    <span className="font-mono text-sm">{n.number}</span>
                    <button
                      type="button"
                      onClick={() => void onRemove(g.id, n.id)}
                      className="text-red-600 text-xs hover:underline"
                      aria-label={`Remove ${n.number} from ${g.name}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <label className="flex-1">
                    <span className="sr-only">Select a number to assign</span>
                    <select
                      value={assignChoice[g.id] ?? ''}
                      onChange={(e) =>
                        setAssignChoice({ ...assignChoice, [g.id]: e.target.value })
                      }
                      className="border rounded px-2 py-1 text-sm w-full"
                    >
                      <option value="">Select a number to assign...</option>
                      {unassigned.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.number}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!assignChoice[g.id]}
                    onClick={async () => {
                      const id = assignChoice[g.id];
                      if (!id) return;
                      await onAssign(g.id, id);
                      setAssignChoice({ ...assignChoice, [g.id]: '' });
                    }}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
                  >
                    Assign
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
