'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import {
  NumberTable,
  PhoneNumber,
} from '@/components/phone-numbers/NumberTable';
import {
  NumberEditModal,
  NumberEditPatch,
} from '@/components/phone-numbers/NumberEditModal';
import {
  NumberAddModal,
  NewNumberPayload,
} from '@/components/phone-numbers/NumberAddModal';
import {
  DIDGroupList,
  DIDGroup,
} from '@/components/phone-numbers/DIDGroupList';

type Tab = 'numbers' | 'groups';

async function fetchAll(): Promise<{ numbers: PhoneNumber[]; groups: DIDGroup[] }> {
  const [nRes, gRes] = await Promise.all([
    api.get<PhoneNumber[]>('/api/phone-numbers'),
    api.get<DIDGroup[]>('/api/did-groups'),
  ]);
  return { numbers: nRes.data, groups: gRes.data };
}

export default function PhoneNumbersClient() {
  const { user } = useAuth();
  const allowed = user?.role === 'admin';

  const [tab, setTab] = useState<Tab>('numbers');
  const [numbers, setNumbers] = useState<PhoneNumber[] | null>(null);
  const [groups, setGroups] = useState<DIDGroup[] | null>(null);
  const [editing, setEditing] = useState<PhoneNumber | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const { numbers: n, groups: g } = await fetchAll();
      setNumbers(n);
      setGroups(g);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let ignore = false;
    setError(null);
    fetchAll()
      .then(({ numbers: n, groups: g }) => {
        if (ignore) return;
        setNumbers(n);
        setGroups(g);
      })
      .catch((e: unknown) => {
        if (ignore) return;
        setError(e instanceof Error ? e.message : 'Failed to load data');
      });
    return () => {
      ignore = true;
    };
  }, [allowed]);

  if (!user) return <div className="p-6 text-gray-500">Loading...</div>;
  if (!allowed) return <div className="p-6 text-gray-600">Forbidden</div>;

  async function handleToggleActive(n: PhoneNumber, active: boolean) {
    await api.patch(`/api/phone-numbers/${n.id}`, { isActive: active });
    await reload();
  }

  async function handleSaveEdit(patch: NumberEditPatch) {
    if (!editing) return;
    await api.patch(`/api/phone-numbers/${editing.id}`, patch);
    await reload();
  }

  async function handleAdd(payload: NewNumberPayload) {
    await api.post('/api/phone-numbers', payload);
    await reload();
  }

  async function handleCreateGroup(name: string) {
    await api.post('/api/did-groups', { name });
    await reload();
  }

  async function handleAssign(groupId: string, phoneNumberId: string) {
    await api.post(`/api/did-groups/${groupId}/numbers`, { phoneNumberId });
    await reload();
  }

  async function handleRemove(groupId: string, phoneNumberId: string) {
    await api.delete(`/api/did-groups/${groupId}/numbers/${phoneNumberId}`);
    await reload();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Phone Numbers</h1>
        {tab === 'numbers' && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            data-testid="add-number-btn"
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium"
          >
            + Add Number
          </button>
        )}
      </div>

      <div className="border-b">
        <nav className="flex gap-6" role="tablist">
          {(['numbers', 'groups'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`py-2 border-b-2 text-sm font-medium ${
                tab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {key === 'numbers' ? 'Numbers' : 'DID Groups'}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {tab === 'numbers' && (
        <>
          {numbers === null ? (
            <div className="text-gray-500">Loading...</div>
          ) : (
            <NumberTable
              numbers={numbers}
              onRowClick={(n) => setEditing(n)}
              onToggleActive={(n, a) => void handleToggleActive(n, a)}
            />
          )}
        </>
      )}

      {tab === 'groups' && (
        <>
          {groups === null || numbers === null ? (
            <div className="text-gray-500">Loading...</div>
          ) : (
            <DIDGroupList
              groups={groups}
              allNumbers={numbers}
              onCreate={handleCreateGroup}
              onAssign={handleAssign}
              onRemove={handleRemove}
            />
          )}
        </>
      )}

      {editing && (
        <NumberEditModal
          number={editing}
          onClose={() => setEditing(null)}
          onSave={handleSaveEdit}
        />
      )}

      {adding && groups && (
        <NumberAddModal
          didGroups={groups.map((g) => ({ id: g.id, name: g.name }))}
          onClose={() => setAdding(false)}
          onSave={handleAdd}
        />
      )}
    </div>
  );
}
