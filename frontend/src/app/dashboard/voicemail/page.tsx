'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function VoicemailPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Voicemail</h1>
      <div className="bg-white rounded-xl shadow p-6">
        <p className="text-gray-500 text-sm">
          Voicemail inbox will display recorded messages from the inbound IVR.
          Voicemails are automatically transcribed and linked to call records.
        </p>
      </div>
    </div>
  );
}
