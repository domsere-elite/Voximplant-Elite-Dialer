'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';

interface HealthState {
  healthy: boolean;
  lastCheck: string | null;
}

const TZ_LIST = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'UTC',
];

export default function SettingsClient() {
  const { user } = useAuth();
  const { on } = useSocket();
  const allowed = user?.role === 'admin';

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vox, setVox] = useState<HealthState>({ healthy: false, lastCheck: null });
  const [crm, setCrm] = useState<HealthState>({ healthy: false, lastCheck: null });

  useEffect(() => {
    if (!allowed) return;
    let ignore = false;
    api
      .get<{ settings: Record<string, string> }>('/api/settings')
      .then((res) => {
        if (!ignore) setSettings(res.data.settings || {});
      })
      .catch((e: unknown) => {
        if (!ignore) setError(e instanceof Error ? e.message : 'Failed to load settings');
      });
    return () => {
      ignore = true;
    };
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    const u1 = on<{ healthy: boolean }>('voximplant:health', (d) =>
      setVox({ healthy: d.healthy, lastCheck: new Date().toISOString() }),
    );
    const u2 = on<{ healthy: boolean }>('crm:health', (d) =>
      setCrm({ healthy: d.healthy, lastCheck: new Date().toISOString() }),
    );
    return () => {
      u1();
      u2();
    };
  }, [allowed, on]);

  if (!user) return <div className="p-6 text-gray-500">Loading...</div>;
  if (!allowed) return <div className="p-6 text-gray-600">Forbidden</div>;

  async function saveSection(keys: string[]) {
    setSaving(keys.join(','));
    setError(null);
    try {
      const body: Record<string, string> = {};
      for (const k of keys) body[k] = settings[k] ?? '';
      await api.patch('/api/settings', body);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  }

  const update = (k: string, v: string) =>
    setSettings((s) => ({ ...s, [k]: v }));

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-3">TCPA Defaults</h2>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm">
            Window Start
            <input
              type="time"
              className="w-full border rounded px-2 py-1 mt-1"
              value={settings['tcpa.window_start'] || ''}
              onChange={(e) => update('tcpa.window_start', e.target.value)}
            />
          </label>
          <label className="text-sm">
            Window End
            <input
              type="time"
              className="w-full border rounded px-2 py-1 mt-1"
              value={settings['tcpa.window_end'] || ''}
              onChange={(e) => update('tcpa.window_end', e.target.value)}
            />
          </label>
          <label className="text-sm">
            Timezone
            <select
              className="w-full border rounded px-2 py-1 mt-1"
              value={settings['tcpa.default_timezone'] || ''}
              onChange={(e) => update('tcpa.default_timezone', e.target.value)}
            >
              {TZ_LIST.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() =>
            void saveSection([
              'tcpa.window_start',
              'tcpa.window_end',
              'tcpa.default_timezone',
            ])
          }
          disabled={saving !== null}
          className="mt-3 px-3 py-1 bg-indigo-600 text-white rounded text-sm disabled:opacity-50"
          data-testid="save-tcpa"
        >
          Save TCPA
        </button>
      </section>

      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-3">AMD Defaults</h2>
        <label className="flex items-center gap-2 text-sm mb-2">
          <input
            type="checkbox"
            checked={settings['amd.enabled'] === 'true'}
            onChange={(e) =>
              update('amd.enabled', e.target.checked ? 'true' : 'false')
            }
          />
          AMD Enabled
        </label>
        <label className="text-sm block">
          VM Drop URL
          <input
            type="url"
            className="w-full border rounded px-2 py-1 mt-1"
            value={settings['amd.vm_drop_url'] || ''}
            onChange={(e) => update('amd.vm_drop_url', e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void saveSection(['amd.enabled', 'amd.vm_drop_url'])}
          disabled={saving !== null}
          className="mt-3 px-3 py-1 bg-indigo-600 text-white rounded text-sm disabled:opacity-50"
          data-testid="save-amd"
        >
          Save AMD
        </button>
      </section>

      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-3">Retry Defaults</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Max Attempts
            <input
              type="number"
              min={1}
              className="w-full border rounded px-2 py-1 mt-1"
              value={settings['retry.max_attempts'] || ''}
              onChange={(e) => update('retry.max_attempts', e.target.value)}
            />
          </label>
          <label className="text-sm">
            Delay (minutes)
            <input
              type="number"
              min={0}
              className="w-full border rounded px-2 py-1 mt-1"
              value={settings['retry.delay_minutes'] || ''}
              onChange={(e) => update('retry.delay_minutes', e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() =>
            void saveSection(['retry.max_attempts', 'retry.delay_minutes'])
          }
          disabled={saving !== null}
          className="mt-3 px-3 py-1 bg-indigo-600 text-white rounded text-sm disabled:opacity-50"
          data-testid="save-retry"
        >
          Save Retry
        </button>
      </section>

      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-3">Connection Status</h2>
        <div className="flex items-center gap-3 mb-2">
          <span
            className={`w-3 h-3 rounded-full ${vox.healthy ? 'bg-green-500' : 'bg-red-500'}`}
            data-testid="vox-health-dot"
          />
          <span className="text-sm">Voximplant API</span>
          <span className="text-xs text-gray-500 ml-auto">
            {vox.lastCheck
              ? new Date(vox.lastCheck).toLocaleTimeString()
              : 'no data'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`w-3 h-3 rounded-full ${crm.healthy ? 'bg-green-500' : 'bg-red-500'}`}
            data-testid="crm-health-dot"
          />
          <span className="text-sm">CRM API</span>
          <span className="text-xs text-gray-500 ml-auto">
            {crm.lastCheck
              ? new Date(crm.lastCheck).toLocaleTimeString()
              : 'no data'}
          </span>
        </div>
      </section>
    </div>
  );
}
