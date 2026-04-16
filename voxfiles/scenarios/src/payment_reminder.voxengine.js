/**
 * Automated Payment Reminder Scenario
 *
 * A lightweight AI-powered or TTS-based outbound call that reminds debtors
 * of upcoming or overdue payments. Simpler than the full AI agent —
 * delivers a scripted message and captures a DTMF response.
 *
 * Custom data expected:
 *   callId, phone, contactName, debtAmount, accountNumber, dueDate, useAi
 */

require(Modules.ApplicationStorage);

var callData;
var outboundCall;

VoxEngine.addEventListener(AppEvents.Started, function(e) {
  try {
    callData = JSON.parse(VoxEngine.customData());
  } catch (err) {
    Logger.write('Failed to parse custom data: ' + err.message);
    VoxEngine.terminate();
    return;
  }

  Logger.write('Starting payment reminder call to: ' + callData.phone);

  outboundCall = VoxEngine.callPSTN(callData.phone, callData.fromNumber || DEFAULT_CALLER_ID);

  outboundCall.addEventListener(CallEvents.Connected, onConnected);
  outboundCall.addEventListener(CallEvents.Disconnected, onDisconnected);
  outboundCall.addEventListener(CallEvents.Failed, onFailed);

  outboundCall.record({ stereo: RECORDING_STEREO, format: RECORDING_FORMAT });
});

function onConnected(e) {
  Logger.write('Payment reminder call connected');

  notifyCallEvent(callData.callId, 'call.answered', {});

  // AMD detection
  if (AMD_CONFIG.enabled) {
    outboundCall.detectAnsweringMachine({
      initialSilence: AMD_CONFIG.initialSilenceMs,
      greeting: AMD_CONFIG.greetingMs,
      afterGreetingDelay: AMD_CONFIG.afterGreetingMs,
    });

    outboundCall.addEventListener(CallEvents.MachineDetected, function() {
      Logger.write('Machine detected — leaving short message');
      notifyCallEvent(callData.callId, 'call.amd_result', { result: 'machine' });
      // Leave a brief voicemail-safe message (no account details per compliance)
      outboundCall.say(
        'Hello, this is ' + IVR_COMPANY_NAME + ' calling regarding an important business matter. '
        + 'Please call us back at your earliest convenience. Thank you.',
        { language: Language.US_ENGLISH_FEMALE }
      );
      outboundCall.addEventListener(CallEvents.PlaybackFinished, function() {
        outboundCall.hangup();
      });
    });

    outboundCall.addEventListener(CallEvents.HumanDetected, function() {
      notifyCallEvent(callData.callId, 'call.amd_result', { result: 'human' });
      deliverReminder();
    });
  } else {
    deliverReminder();
  }
}

function deliverReminder() {
  var name = callData.contactName || 'valued customer';
  var amount = callData.debtAmount ? '$' + callData.debtAmount : 'your outstanding balance';
  var dueInfo = callData.dueDate ? ' due on ' + callData.dueDate : '';

  var message = 'Hello' + (callData.contactName ? ', ' + callData.contactName : '') + '. '
    + IVR_PROMPTS.miniMirandaDisclosure + ' '
    + 'This call is regarding your account with a balance of ' + amount + dueInfo + '. '
    + 'Press 1 to be connected to an agent to make a payment. '
    + 'Press 2 to confirm you received this message. '
    + 'Press 3 to request a callback at a different time.';

  outboundCall.say(message, { language: Language.US_ENGLISH_FEMALE });

  outboundCall.addEventListener(CallEvents.ToneReceived, function handler(e) {
    outboundCall.removeEventListener(CallEvents.ToneReceived, handler);

    switch (e.tone) {
      case '1':
        Logger.write('Debtor requesting agent connection');
        notifyCallEvent(callData.callId, 'call.transfer_to_agent', {
          reason: 'payment_requested',
        });
        outboundCall.say('Please hold while we connect you with an agent.',
          { language: Language.US_ENGLISH_FEMALE });
        // Transfer logic would go here (same as inbound_ivr connectToAgent)
        break;

      case '2':
        Logger.write('Message acknowledged');
        notifyCallEvent(callData.callId, 'call.ai_summary', {
          outcome: 'callback_requested',
          summary: 'Debtor acknowledged payment reminder message.',
          sentiment: 'neutral',
        });
        outboundCall.say('Thank you. ' + IVR_PROMPTS.goodbye,
          { language: Language.US_ENGLISH_FEMALE });
        setTimeout(function() { outboundCall.hangup(); }, 2000);
        break;

      case '3':
        Logger.write('Callback requested');
        notifyCallEvent(callData.callId, 'call.ai_summary', {
          outcome: 'callback_requested',
          summary: 'Debtor requested callback at a different time.',
          sentiment: 'neutral',
        });
        outboundCall.say(
          'We will schedule a callback for you. Thank you for your time. ' + IVR_PROMPTS.goodbye,
          { language: Language.US_ENGLISH_FEMALE }
        );
        setTimeout(function() { outboundCall.hangup(); }, 2000);
        break;

      default:
        outboundCall.say(IVR_PROMPTS.invalidInput + ' ' + IVR_PROMPTS.goodbye,
          { language: Language.US_ENGLISH_FEMALE });
        setTimeout(function() { outboundCall.hangup(); }, 2000);
        break;
    }
  });

  // Timeout if no input after playback
  outboundCall.addEventListener(CallEvents.PlaybackFinished, function handler() {
    outboundCall.removeEventListener(CallEvents.PlaybackFinished, handler);
    setTimeout(function() {
      Logger.write('No DTMF input received — ending call');
      notifyCallEvent(callData.callId, 'call.ai_summary', {
        outcome: 'no_contact',
        summary: 'Payment reminder delivered but no response received.',
        sentiment: 'neutral',
      });
      outboundCall.say(IVR_PROMPTS.goodbye, { language: Language.US_ENGLISH_FEMALE });
      setTimeout(function() { outboundCall.hangup(); }, 2000);
    }, 10000);
  });
}

function onDisconnected(e) {
  Logger.write('Payment reminder call disconnected');

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

  VoxEngine.terminate();
}

function onFailed(e) {
  Logger.write('Payment reminder call failed: ' + e.reason);

  notifyCallEvent(callData.callId, 'call.ended', {
    reason: e.reason || 'call_failed',
    code: e.code,
  });

  VoxEngine.terminate();
}
