'use client';

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Dialer Configuration</h2>
          <p className="text-gray-500 text-sm">
            Configure dialer mode, call pacing, AMD settings, and compliance parameters.
          </p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Voximplant Connection</h2>
          <p className="text-gray-500 text-sm">
            Manage Voximplant account settings, phone numbers, and VoxEngine application configuration.
          </p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">AI Voice Agent</h2>
          <p className="text-gray-500 text-sm">
            Configure AI agent settings including default prompts, voice selection, and transfer behavior.
          </p>
        </div>
      </div>
    </div>
  );
}
