'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type FormDialMode = 'MANUAL' | 'PREVIEW' | 'PROGRESSIVE' | 'PREDICTIVE';
export type FormCallerIdStrategy = 'FIXED' | 'ROTATION' | 'PROXIMITY';

export interface CampaignFormValues {
  name: string;
  dialMode: FormDialMode;
  crmCampaignId: string;
  didGroupId: string;
  scheduleStart: string;
  scheduleEnd: string;
  dialingHoursStart: string;
  dialingHoursEnd: string;
  timezone: string;
  maxConcurrentCalls: number;
  maxAbandonRate: number;
  dialRatio: number;
  maxAttempts: number;
  retryDelayMinutes: number;
  callerIdStrategy: FormCallerIdStrategy;
  fixedCallerId: string;
  amdEnabled: boolean;
  voicemailDropUrl: string;
  autoAnswer: boolean;
}

export const DEFAULTS: CampaignFormValues = {
  name: '',
  dialMode: 'MANUAL',
  crmCampaignId: '',
  didGroupId: '',
  scheduleStart: '',
  scheduleEnd: '',
  dialingHoursStart: '09:00',
  dialingHoursEnd: '20:00',
  timezone: 'America/Chicago',
  maxConcurrentCalls: 10,
  maxAbandonRate: 0.03,
  dialRatio: 1.5,
  maxAttempts: 3,
  retryDelayMinutes: 60,
  callerIdStrategy: 'PROXIMITY',
  fixedCallerId: '',
  amdEnabled: false,
  voicemailDropUrl: '',
  autoAnswer: false,
};

const TIMEZONES = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
];

interface DIDGroup {
  id: string;
  name: string;
}

export interface CampaignFormProps {
  initialValues?: Partial<CampaignFormValues>;
  onSubmit: (values: CampaignFormValues) => Promise<void>;
  submitLabel?: string;
}

export type ErrorMap = Partial<Record<keyof CampaignFormValues, string>>;

export function validate(values: CampaignFormValues): ErrorMap {
  const e: ErrorMap = {};
  if (!values.name.trim()) e.name = 'Name is required';
  if (values.name.length > 120) e.name = 'Name must be 120 characters or fewer';
  if (!values.didGroupId) e.didGroupId = 'Select a DID group';
  if (
    values.scheduleStart &&
    values.scheduleEnd &&
    values.scheduleEnd <= values.scheduleStart
  ) {
    e.scheduleEnd = 'End must be after start';
  }
  if (values.dialingHoursStart >= values.dialingHoursEnd) {
    e.dialingHoursEnd = 'End time must be after start time';
  }
  if (values.maxConcurrentCalls < 1 || values.maxConcurrentCalls > 500) {
    e.maxConcurrentCalls = 'Must be between 1 and 500';
  }
  if (values.maxAbandonRate < 0 || values.maxAbandonRate > 1) {
    e.maxAbandonRate = 'Must be between 0 and 1';
  }
  if (values.dialRatio < 1 || values.dialRatio > 5) {
    e.dialRatio = 'Must be between 1.0 and 5.0';
  }
  if (values.maxAttempts < 1 || values.maxAttempts > 20) {
    e.maxAttempts = 'Must be between 1 and 20';
  }
  if (values.retryDelayMinutes < 1 || values.retryDelayMinutes > 10080) {
    e.retryDelayMinutes = 'Must be between 1 and 10080';
  }
  if (values.callerIdStrategy === 'FIXED' && !values.fixedCallerId.trim()) {
    e.fixedCallerId = 'Required when strategy is fixed';
  }
  if (
    values.callerIdStrategy === 'FIXED' &&
    values.fixedCallerId &&
    !/^\+[1-9]\d{6,14}$/.test(values.fixedCallerId)
  ) {
    e.fixedCallerId = 'Must be E.164 (e.g. +15551234567)';
  }
  return e;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
      {error && <span className="text-xs text-red-600 mt-1 block">{error}</span>}
    </label>
  );
}

function titleCase(value: string): string {
  if (!value) return '';
  return value.charAt(0) + value.slice(1).toLowerCase();
}

const INPUT =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function CampaignForm({
  initialValues,
  onSubmit,
  submitLabel = 'Save',
}: CampaignFormProps) {
  const [values, setValues] = useState<CampaignFormValues>({ ...DEFAULTS, ...initialValues });
  const [errors, setErrors] = useState<ErrorMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [didGroups, setDidGroups] = useState<DIDGroup[]>([]);
  const [autoAnswerManuallySet, setAutoAnswerManuallySet] = useState(
    initialValues?.autoAnswer !== undefined,
  );

  useEffect(() => {
    void api
      .get<DIDGroup[]>('/api/did-groups')
      .then((res) => setDidGroups(res.data))
      .catch(() => setDidGroups([]));
  }, []);

  function setField<K extends keyof CampaignFormValues>(key: K, val: CampaignFormValues[K]) {
    setValues((prev) => {
      const next = { ...prev, [key]: val };
      if (key === 'dialMode' && !autoAnswerManuallySet) {
        next.autoAnswer = val === 'PROGRESSIVE' || val === 'PREDICTIVE';
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate(values);
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(values);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name" error={errors.name}>
          <input
            className={INPUT}
            value={values.name}
            onChange={(e) => setField('name', e.target.value)}
          />
        </Field>

        <Field label="Dial Mode" error={errors.dialMode}>
          <select
            className={INPUT}
            value={values.dialMode}
            onChange={(e) => setField('dialMode', e.target.value as FormDialMode)}
          >
            <option value="MANUAL">Manual</option>
            <option value="PREVIEW">Preview</option>
            <option value="PROGRESSIVE">Progressive</option>
            <option value="PREDICTIVE">Predictive</option>
          </select>
        </Field>

        <Field label="CRM Campaign ID" error={errors.crmCampaignId}>
          <input
            className={INPUT}
            value={values.crmCampaignId}
            onChange={(e) => setField('crmCampaignId', e.target.value)}
            placeholder="uuid of voice_campaign in CRM"
          />
        </Field>

        <Field label="DID Group" error={errors.didGroupId}>
          <select
            className={INPUT}
            value={values.didGroupId}
            onChange={(e) => setField('didGroupId', e.target.value)}
          >
            <option value="">Select a group...</option>
            {didGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Schedule Start" error={errors.scheduleStart}>
          <input
            type="datetime-local"
            className={INPUT}
            value={values.scheduleStart}
            onChange={(e) => setField('scheduleStart', e.target.value)}
          />
        </Field>
        <Field label="Schedule End" error={errors.scheduleEnd}>
          <input
            type="datetime-local"
            className={INPUT}
            value={values.scheduleEnd}
            onChange={(e) => setField('scheduleEnd', e.target.value)}
          />
        </Field>
        <Field label="Dialing Hours Start" error={errors.dialingHoursStart}>
          <input
            type="time"
            className={INPUT}
            value={values.dialingHoursStart}
            onChange={(e) => setField('dialingHoursStart', e.target.value)}
          />
        </Field>
        <Field label="Dialing Hours End" error={errors.dialingHoursEnd}>
          <input
            type="time"
            className={INPUT}
            value={values.dialingHoursEnd}
            onChange={(e) => setField('dialingHoursEnd', e.target.value)}
          />
        </Field>
        <Field label="Timezone">
          <select
            className={INPUT}
            value={values.timezone}
            onChange={(e) => setField('timezone', e.target.value)}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Max Concurrent Calls" error={errors.maxConcurrentCalls}>
          <input
            type="number"
            min={1}
            max={500}
            className={INPUT}
            value={values.maxConcurrentCalls}
            onChange={(e) => setField('maxConcurrentCalls', Number(e.target.value))}
          />
        </Field>
        <Field label="Max Abandon Rate (0-1)" error={errors.maxAbandonRate}>
          <input
            type="number"
            step="0.01"
            min={0}
            max={1}
            className={INPUT}
            value={values.maxAbandonRate}
            onChange={(e) => setField('maxAbandonRate', Number(e.target.value))}
          />
        </Field>
        <Field label="Dial Ratio (1-5)" error={errors.dialRatio}>
          <input
            type="number"
            step="0.1"
            min={1}
            max={5}
            className={INPUT}
            value={values.dialRatio}
            onChange={(e) => setField('dialRatio', Number(e.target.value))}
          />
        </Field>
        <Field label="Max Attempts (1-20)" error={errors.maxAttempts}>
          <input
            type="number"
            min={1}
            max={20}
            className={INPUT}
            value={values.maxAttempts}
            onChange={(e) => setField('maxAttempts', Number(e.target.value))}
          />
        </Field>
        <Field label="Retry Delay (min)" error={errors.retryDelayMinutes}>
          <input
            type="number"
            min={1}
            max={10080}
            className={INPUT}
            value={values.retryDelayMinutes}
            onChange={(e) => setField('retryDelayMinutes', Number(e.target.value))}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-2">
            Caller ID Strategy
          </legend>
          <div className="flex gap-4">
            {(['FIXED', 'ROTATION', 'PROXIMITY'] as const).map((opt) => (
              <label key={opt} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="callerIdStrategy"
                  value={opt}
                  checked={values.callerIdStrategy === opt}
                  onChange={() => setField('callerIdStrategy', opt)}
                />
                <span className="text-sm">{titleCase(opt)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {values.callerIdStrategy === 'FIXED' && (
          <Field label="Fixed Caller ID (E.164)" error={errors.fixedCallerId}>
            <input
              className={INPUT}
              value={values.fixedCallerId}
              onChange={(e) => setField('fixedCallerId', e.target.value)}
              placeholder="+15551234567"
            />
          </Field>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.amdEnabled}
            onChange={(e) => setField('amdEnabled', e.target.checked)}
          />
          <span className="text-sm">Enable Answering Machine Detection</span>
        </label>
        <Field label="Voicemail Drop URL">
          <input
            className={INPUT}
            value={values.voicemailDropUrl}
            onChange={(e) => setField('voicemailDropUrl', e.target.value)}
            placeholder="https://.../vm.mp3"
          />
        </Field>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.autoAnswer}
            onChange={(e) => {
              setAutoAnswerManuallySet(true);
              setField('autoAnswer', e.target.checked);
            }}
          />
          <span className="text-sm">Auto-Answer Agent Leg</span>
        </label>
      </section>

      {submitError && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {submitError}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          {submitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
