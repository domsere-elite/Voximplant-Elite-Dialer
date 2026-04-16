'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Disposition {
  code: string;
  label: string;
}

interface Props {
  callId: string;
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function WrapUpModal({ callId, open, onClose, onSubmitted }: Props) {
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [dispositionCode, setDispositionCode] = useState('');
  const [notes, setNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .get('/api/dispositions')
      .then((res) => {
        const list: Disposition[] = res.data?.dispositions ?? res.data ?? [];
        setDispositions(list);
        if (list[0]) setDispositionCode(list[0].code);
      })
      .catch(() => {
        setDispositions([
          { code: 'NO_ANSWER', label: 'No Answer' },
          { code: 'VOICEMAIL', label: 'Voicemail' },
          { code: 'PTP', label: 'Promise to Pay' },
          { code: 'REFUSED', label: 'Refused to Pay' }
        ]);
      });
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/calls/${callId}/disposition`, {
        disposition_code: dispositionCode,
        notes: notes || undefined,
        callback_at: callbackAt || undefined
      });
      onSubmitted?.();
      onClose();
      setNotes('');
      setCallbackAt('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to submit disposition');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60"
    >
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Disposition Call</h2>
          <p className="text-xs text-slate-500">Call ID: {callId}</p>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {error && (
            <div className="text-sm text-danger-700 bg-danger-500/10 border border-danger-500/40 rounded px-2 py-1">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="disposition" className="block text-sm font-medium text-slate-700 mb-1">
              Disposition
            </label>
            <select
              id="disposition"
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
              value={dispositionCode}
              onChange={(e) => setDispositionCode(e.target.value)}
              required
            >
              {dispositions.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">
              Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
              placeholder="Optional call notes…"
            />
          </div>
          <div>
            <label htmlFor="callback" className="block text-sm font-medium text-slate-700 mb-1">
              Schedule callback (optional)
            </label>
            <input
              id="callback"
              type="datetime-local"
              value={callbackAt}
              onChange={(e) => setCallbackAt(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-2 text-sm rounded-md bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save Disposition'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
