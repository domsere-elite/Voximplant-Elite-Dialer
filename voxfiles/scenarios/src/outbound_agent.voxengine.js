/**
 * Outbound Agent Call Scenario
 *
 * Handles outbound calls where a human agent is on the line.
 * Supports two invocation modes:
 *   1. Direct (backend starts scenario via startScenarios) — JSON custom data
 *   2. Call List (Voximplant starts scenario from a call list) — CSV-row custom data
 *
 * Flow: TCPA check → Dial contact → AMD check → Connect to agent → Record → Track events
 *
 * Custom data expected:
 *   call_id/callId, phone/phone_number, agentId, campaignId, contactId,
 *   amdEnabled, fromNumber, timezone
 */

require(Modules.ApplicationStorage);

var callData;
var outboundCall;
var agentCall;
var supervisorCall;
var isCallListMode = false;

VoxEngine.addEventListener(AppEvents.Started, function(e) {
  // Parse custom data — handles both JSON (direct) and CSV-row (call list) formats
  try {
    var raw = VoxEngine.customData();
    if (raw.charAt(0) === '{') {
      callData = JSON.parse(raw);
    } else {
      // Call List mode: data arrives as semicolon-delimited key=value or CSV row
      callData = parseCallListData(raw);
      isCallListMode = true;
    }
  } catch (err) {
    Logger.write('Failed to parse custom data: ' + err.message);
    VoxEngine.terminate();
    return;
  }

  // Normalize field names (call list CSV uses snake_case, direct uses camelCase)
  callData.callId = callData.callId || callData.call_id;
  callData.phone = callData.phone || callData.phone_number;
  callData.contactId = callData.contactId || callData.contact_id;
  callData.campaignId = callData.campaignId || callData.campaign_id;
  callData.fromNumber = callData.fromNumber || callData.from_number;
  callData.dialMode = callData.dialMode || callData.dial_mode || 'agent';
  callData.timezone = callData.timezone || '';

  Logger.write('Starting outbound agent call to: ' + callData.phone);
  Logger.write('Call ID: ' + callData.callId + ' | Mode: ' + (isCallListMode ? 'call_list' : 'direct'));

  // Send session URL back to backend so supervisor can join later
  notifyCallEvent(callData.callId, 'call.session_started', {
    mediaSessionAccessUrl: VoxEngine.mediaSessionAccessURL(),
  });

  // TCPA compliance check (real-time, windows shift intraday)
  checkCompliance(callData.phone, callData.contactId, callData.timezone)
    .then(function(result) {
      var body;
      try { body = JSON.parse(result.text); } catch (err) { body = { allowed: true }; }

      if (!body.allowed) {
        Logger.write('TCPA blocked: ' + (body.reason || 'outside calling window'));
        notifyCallEvent(callData.callId, 'call.ended', {
          reason: 'tcpa_blocked',
          details: body.reason,
        });
        if (isCallListMode) {
          reportCallListResult(false, 486, 'TCPA blocked');
        }
        VoxEngine.terminate();
        return;
      }

      // Compliance passed — place the call
      placeOutboundCall();
    })
    .catch(function(err) {
      // If compliance check fails (network issue), proceed with call (fail-open for availability)
      Logger.write('Compliance check failed, proceeding: ' + err.message);
      placeOutboundCall();
    });
});

function placeOutboundCall() {
  outboundCall = VoxEngine.callPSTN(callData.phone, callData.fromNumber || DEFAULT_CALLER_ID);

  outboundCall.addEventListener(CallEvents.Connected, onCallConnected);
  outboundCall.addEventListener(CallEvents.Disconnected, onCallDisconnected);
  outboundCall.addEventListener(CallEvents.Failed, onCallFailed);

  // Record with transcription enabled
  outboundCall.record({
    stereo: RECORDING_STEREO,
    format: RECORDING_FORMAT,
    transcribe: true,
    language: 'en-US',
  });
}

function onCallConnected(e) {
  Logger.write('Outbound call connected');

  notifyCallEvent(callData.callId, 'call.answered', {
    fromNumber: callData.fromNumber || DEFAULT_CALLER_ID,
  });

  // If AMD is enabled, detect before connecting to agent
  if (callData.amdEnabled && AMD_CONFIG.enabled) {
    Logger.write('Starting AMD detection');

    outboundCall.detectAnsweringMachine({
      initialSilence: AMD_CONFIG.initialSilenceMs,
      greeting: AMD_CONFIG.greetingMs,
      afterGreetingDelay: AMD_CONFIG.afterGreetingMs,
    });

    outboundCall.addEventListener(CallEvents.MachineDetected, function() {
      Logger.write('Machine detected — hanging up');
      notifyCallEvent(callData.callId, 'call.amd_result', { result: 'machine' });
      outboundCall.hangup();
    });

    outboundCall.addEventListener(CallEvents.HumanDetected, function() {
      Logger.write('Human detected — connecting to agent');
      notifyCallEvent(callData.callId, 'call.amd_result', { result: 'human' });
      connectToAgent();
    });
  } else {
    connectToAgent();
  }
}

function connectToAgent() {
  Logger.write('Connecting to agent: ' + callData.agentId);

  agentCall = VoxEngine.callUser(callData.agentId, {
    displayName: callData.phone,
    extraHeaders: {
      'X-Call-Id': callData.callId,
      'X-Campaign-Id': callData.campaignId || '',
      'X-Contact-Id': callData.contactId || '',
    },
  });

  agentCall.addEventListener(CallEvents.Connected, function() {
    Logger.write('Agent connected — bridging calls');
    VoxEngine.sendMediaBetween(outboundCall, agentCall);
  });

  agentCall.addEventListener(CallEvents.Disconnected, function() {
    Logger.write('Agent disconnected');
    outboundCall.hangup();
  });

  agentCall.addEventListener(CallEvents.Failed, function(e) {
    Logger.write('Agent call failed: ' + e.reason);
    notifyCallEvent(callData.callId, 'call.ended', { reason: 'agent_unavailable' });
    outboundCall.hangup();
  });
}

// ---------------------------------------------------------------------------
// Supervisor monitoring — join/leave via HTTP request from backend
// ---------------------------------------------------------------------------

VoxEngine.addEventListener(AppEvents.HttpRequest, function(e) {
  var request;
  try { request = JSON.parse(e.data); } catch (err) { return; }

  if (request.action === 'supervisor_join' && outboundCall && agentCall) {
    handleSupervisorJoin(request.supervisorId, request.mode);
  }
  if (request.action === 'supervisor_leave' && supervisorCall) {
    handleSupervisorLeave();
  }
});

function handleSupervisorJoin(supervisorId, mode) {
  Logger.write('Supervisor joining: ' + supervisorId + ' mode=' + mode);

  supervisorCall = VoxEngine.callUser(supervisorId, {
    displayName: 'Supervisor Monitor',
    extraHeaders: { 'X-Call-Id': callData.callId, 'X-Mode': mode },
  });

  supervisorCall.addEventListener(CallEvents.Connected, function() {
    Logger.write('Supervisor connected in ' + mode + ' mode');

    if (mode === 'listen') {
      // Supervisor hears both parties, neither hears supervisor
      outboundCall.sendMediaTo(supervisorCall);
      agentCall.sendMediaTo(supervisorCall);
    } else if (mode === 'whisper') {
      // Supervisor and agent hear each other; customer doesn't hear supervisor
      VoxEngine.sendMediaBetween(agentCall, supervisorCall);
      outboundCall.sendMediaTo(agentCall);
    } else if (mode === 'barge') {
      // All three parties hear each other — conference bridge
      var conf = VoxEngine.createConference();
      VoxEngine.sendMediaBetween(outboundCall, conf);
      VoxEngine.sendMediaBetween(agentCall, conf);
      VoxEngine.sendMediaBetween(supervisorCall, conf);
    }

    notifyCallEvent(callData.callId, 'call.supervisor_joined', {
      supervisorId: supervisorId,
      mode: mode,
    });
  });

  supervisorCall.addEventListener(CallEvents.Disconnected, function() {
    Logger.write('Supervisor disconnected');
    supervisorCall = null;
    // Restore normal agent-customer bridge
    VoxEngine.sendMediaBetween(outboundCall, agentCall);
    notifyCallEvent(callData.callId, 'call.supervisor_left', { supervisorId: supervisorId });
  });

  supervisorCall.addEventListener(CallEvents.Failed, function(e) {
    Logger.write('Supervisor call failed: ' + e.reason);
    supervisorCall = null;
  });
}

function handleSupervisorLeave() {
  if (supervisorCall) {
    try { supervisorCall.hangup(); } catch (err) { /* ok */ }
    supervisorCall = null;
  }
  // Restore normal bridge
  if (outboundCall && agentCall) {
    VoxEngine.sendMediaBetween(outboundCall, agentCall);
  }
}

// ---------------------------------------------------------------------------
// Call lifecycle
// ---------------------------------------------------------------------------

function onCallDisconnected(e) {
  Logger.write('Call disconnected');

  if (e.record && e.record.url) {
    notifyCallEvent(callData.callId, 'call.recording_ready', {
      url: e.record.url,
      duration: e.record.duration,
      format: RECORDING_FORMAT,
    });
  }

  notifyCallEvent(callData.callId, 'call.ended', {
    reason: 'normal_disconnect',
    duration: e.duration,
  });

  if (agentCall) {
    try { agentCall.hangup(); } catch (err) { /* already disconnected */ }
  }
  if (supervisorCall) {
    try { supervisorCall.hangup(); } catch (err) { /* ok */ }
  }

  if (isCallListMode) {
    reportCallListResult(true, 200, 'completed');
  }

  VoxEngine.terminate();
}

function onCallFailed(e) {
  Logger.write('Call failed: ' + e.reason + ' code=' + e.code);

  notifyCallEvent(callData.callId, 'call.ended', {
    reason: e.reason || 'call_failed',
    code: e.code,
  });

  if (isCallListMode) {
    reportCallListResult(false, e.code || 500, e.reason || 'call_failed');
  }

  VoxEngine.terminate();
}

// ---------------------------------------------------------------------------
// Call List helpers
// ---------------------------------------------------------------------------

function reportCallListResult(success, code, msg) {
  try {
    if (typeof CallList !== 'undefined' && CallList.reportResultAsync) {
      CallList.reportResultAsync({
        result: success,
        code: code,
        msg: msg,
      });
    }
  } catch (err) {
    Logger.write('Failed to report call list result: ' + err.message);
  }
}

function parseCallListData(raw) {
  // Voximplant Call Lists pass CSV-row data. Parse semicolon-delimited values
  // matching the header order from call-list-manager.ts:
  // phone_number;call_id;contact_id;campaign_id;contact_name;debt_amount;account_number;timezone;from_number;dial_mode;ai_prompt;ai_voice
  var fields = raw.split(';');
  return {
    phone_number: fields[0] || '',
    call_id: fields[1] || '',
    contact_id: fields[2] || '',
    campaign_id: fields[3] || '',
    contactName: fields[4] || '',
    debtAmount: fields[5] || '',
    accountNumber: fields[6] || '',
    timezone: fields[7] || '',
    from_number: fields[8] || '',
    dial_mode: fields[9] || 'agent',
    aiPrompt: fields[10] || '',
    aiVoice: fields[11] || '',
  };
}
