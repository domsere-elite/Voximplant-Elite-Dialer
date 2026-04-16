/**
 * Inbound IVR Scenario
 *
 * Handles incoming calls to the collection agency number.
 * Flow: Answer → Mini-Miranda → DTMF menu → Route to payment/agent/voicemail
 *
 * Improvement over EliteDial: runs entirely in VoxEngine (no backend round-trips
 * for IVR flow), uses TTS for all prompts, and notifies the backend via webhooks
 * only for state tracking.
 */

require(Modules.ApplicationStorage);

var inboundCall;
var agentCall;
var backendCallId;

VoxEngine.addEventListener(AppEvents.CallAlerting, function(e) {
  inboundCall = e.call;
  Logger.write('Inbound call from: ' + inboundCall.callerID());

  inboundCall.answer();
  inboundCall.addEventListener(CallEvents.Connected, onInboundConnected);
  inboundCall.addEventListener(CallEvents.Disconnected, onInboundDisconnected);

  // Record the inbound call
  inboundCall.record({ stereo: RECORDING_STEREO, format: RECORDING_FORMAT });

  // Notify backend of inbound call
  notifyInboundCall(
    inboundCall.callerID(),
    inboundCall.calledID(),
    inboundCall.id()
  ).then(function(result) {
    try {
      var body = JSON.parse(result.text);
      backendCallId = body.callId;
      Logger.write('Backend call ID: ' + backendCallId);
    } catch (err) {
      Logger.write('Failed to parse inbound webhook response: ' + err.message);
    }
  }).catch(function(err) {
    Logger.write('Failed to notify backend of inbound call: ' + err.message);
  });
});

function onInboundConnected() {
  Logger.write('Inbound call connected');
  playMainMenu();
}

function playMainMenu() {
  // Welcome + Mini-Miranda + Menu
  var prompt = IVR_PROMPTS.welcome + ' '
    + IVR_PROMPTS.miniMirandaDisclosure + ' '
    + IVR_PROMPTS.mainMenu;

  inboundCall.say(prompt, { language: Language.US_ENGLISH_FEMALE });

  inboundCall.addEventListener(CallEvents.ToneReceived, onMenuChoice);
  inboundCall.addEventListener(CallEvents.PlaybackFinished, function handler() {
    inboundCall.removeEventListener(CallEvents.PlaybackFinished, handler);
    // Wait 5 seconds for input, then reprompt once
    setTimeout(function() {
      if (!agentCall) {
        inboundCall.say(IVR_PROMPTS.mainMenu, { language: Language.US_ENGLISH_FEMALE });
        setTimeout(function() {
          if (!agentCall) {
            inboundCall.say(IVR_PROMPTS.goodbye, { language: Language.US_ENGLISH_FEMALE });
            setTimeout(function() { inboundCall.hangup(); }, 2000);
          }
        }, 8000);
      }
    }, 5000);
  });
}

function onMenuChoice(e) {
  inboundCall.removeEventListener(CallEvents.ToneReceived, onMenuChoice);

  Logger.write('DTMF received: ' + e.tone);

  switch (e.tone) {
    case '1': // Make a payment
    case '2': // Speak with agent
      connectToAgent();
      break;
    case '3': // Leave voicemail
      startVoicemail();
      break;
    default:
      inboundCall.say(IVR_PROMPTS.invalidInput + ' ' + IVR_PROMPTS.mainMenu,
        { language: Language.US_ENGLISH_FEMALE });
      inboundCall.addEventListener(CallEvents.ToneReceived, onMenuChoice);
      break;
  }
}

function connectToAgent() {
  Logger.write('Routing to agent');

  inboundCall.say('Please hold while we connect you with an agent.',
    { language: Language.US_ENGLISH_FEMALE });

  // Find an available agent via Voximplant user routing
  // In production, the backend would provide the specific agent ID.
  // For now, we call a generic "agent" username that the first available agent picks up.
  agentCall = VoxEngine.callUser('available_agent', {
    displayName: inboundCall.callerID(),
    extraHeaders: {
      'X-Call-Id': backendCallId || '',
      'X-Direction': 'inbound',
      'X-Caller': inboundCall.callerID(),
    },
    timeout: TRANSFER_TIMEOUT_SECONDS,
  });

  agentCall.addEventListener(CallEvents.Connected, function() {
    Logger.write('Agent connected — bridging inbound call');
    VoxEngine.sendMediaBetween(inboundCall, agentCall);

    if (backendCallId) {
      notifyCallEvent(backendCallId, 'call.answered', {
        agentConnected: true,
      });
    }
  });

  agentCall.addEventListener(CallEvents.Failed, function(e) {
    Logger.write('Agent call failed: ' + e.reason);
    agentCall = null;
    playOverflowMenu();
  });

  agentCall.addEventListener(CallEvents.Disconnected, function() {
    Logger.write('Agent disconnected from inbound call');
    agentCall = null;
    inboundCall.hangup();
  });
}

function playOverflowMenu() {
  inboundCall.say(IVR_PROMPTS.holdMessage, { language: Language.US_ENGLISH_FEMALE });

  inboundCall.addEventListener(CallEvents.ToneReceived, function handler(e) {
    inboundCall.removeEventListener(CallEvents.ToneReceived, handler);

    switch (e.tone) {
      case '1': // Continue holding — retry agent
        connectToAgent();
        break;
      case '2': // Leave voicemail
        startVoicemail();
        break;
      default:
        // Default: retry agent connection
        connectToAgent();
        break;
    }
  });
}

function startVoicemail() {
  Logger.write('Starting voicemail recording');

  inboundCall.say(IVR_PROMPTS.voicemailPrompt, { language: Language.US_ENGLISH_FEMALE });

  inboundCall.addEventListener(CallEvents.PlaybackFinished, function handler() {
    inboundCall.removeEventListener(CallEvents.PlaybackFinished, handler);

    // Record voicemail for up to 120 seconds
    inboundCall.record({
      maxDuration: 120,
      format: RECORDING_FORMAT,
      terminateOn: '#',
    });

    // When recording finishes
    inboundCall.addEventListener(CallEvents.RecordStarted, function() {
      Logger.write('Voicemail recording started');
    });

    inboundCall.addEventListener(CallEvents.RecordStopped, function(recEvent) {
      Logger.write('Voicemail recording stopped');

      if (backendCallId && recEvent.url) {
        notifyCallEvent(backendCallId, 'call.recording_ready', {
          url: recEvent.url,
          duration: recEvent.duration,
          format: RECORDING_FORMAT,
          type: 'voicemail',
        });
      }

      inboundCall.say(IVR_PROMPTS.goodbye, { language: Language.US_ENGLISH_FEMALE });
      setTimeout(function() { inboundCall.hangup(); }, 2000);
    });
  });
}

function onInboundDisconnected(e) {
  Logger.write('Inbound call disconnected');

  if (e.record && e.record.url && backendCallId) {
    notifyCallEvent(backendCallId, 'call.recording_ready', {
      url: e.record.url,
      duration: e.record.duration,
      format: RECORDING_FORMAT,
    });
  }

  if (backendCallId) {
    notifyCallEvent(backendCallId, 'call.ended', {
      reason: 'caller_disconnected',
      duration: e.duration,
    });
  }

  if (agentCall) {
    try { agentCall.hangup(); } catch (err) { /* ok */ }
  }

  VoxEngine.terminate();
}
