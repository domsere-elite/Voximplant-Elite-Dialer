/**
 * Outbound AI Voice Agent Scenario
 *
 * Handles outbound calls where an AI agent (OpenAI Realtime API) conducts
 * the conversation. Supports payment negotiation, payment reminders,
 * and human handoff.
 *
 * Architecture:
 *   PSTN call ←→ VoxEngine ←→ OpenAI Realtime API (WebSocket)
 *
 * Custom data expected:
 *   callId, phone, campaignId, contactId, aiPrompt, aiVoice,
 *   contactName, debtAmount, accountNumber, amdEnabled
 */

require(Modules.ApplicationStorage);

var callData;
var outboundCall;
var aiWebSocket;
var transferInProgress = false;
var isCallListMode = false;

VoxEngine.addEventListener(AppEvents.Started, function(e) {
  try {
    var raw = VoxEngine.customData();
    if (raw.charAt(0) === '{') {
      callData = JSON.parse(raw);
    } else {
      callData = parseCallListData(raw);
      isCallListMode = true;
    }
  } catch (err) {
    Logger.write('Failed to parse custom data: ' + err.message);
    VoxEngine.terminate();
    return;
  }

  // Normalize field names
  callData.callId = callData.callId || callData.call_id;
  callData.phone = callData.phone || callData.phone_number;
  callData.contactId = callData.contactId || callData.contact_id;
  callData.campaignId = callData.campaignId || callData.campaign_id;
  callData.fromNumber = callData.fromNumber || callData.from_number;
  callData.aiPrompt = callData.aiPrompt || callData.ai_prompt;
  callData.aiVoice = callData.aiVoice || callData.ai_voice;
  callData.timezone = callData.timezone || '';

  Logger.write('Starting AI outbound call to: ' + callData.phone);

  // Send session URL for supervisor access
  notifyCallEvent(callData.callId, 'call.session_started', {
    mediaSessionAccessUrl: VoxEngine.mediaSessionAccessURL(),
  });

  // TCPA compliance check
  checkCompliance(callData.phone, callData.contactId, callData.timezone)
    .then(function(result) {
      var body;
      try { body = JSON.parse(result.text); } catch (err) { body = { allowed: true }; }

      if (!body.allowed) {
        Logger.write('TCPA blocked: ' + (body.reason || 'outside calling window'));
        notifyCallEvent(callData.callId, 'call.ended', { reason: 'tcpa_blocked' });
        if (isCallListMode) reportCallListResult(false, 486, 'TCPA blocked');
        VoxEngine.terminate();
        return;
      }

      placeOutboundCall();
    })
    .catch(function(err) {
      Logger.write('Compliance check failed, proceeding: ' + err.message);
      placeOutboundCall();
    });
});

function placeOutboundCall() {
  outboundCall = VoxEngine.callPSTN(callData.phone, callData.fromNumber || DEFAULT_CALLER_ID);

  outboundCall.addEventListener(CallEvents.Connected, onCallConnected);
  outboundCall.addEventListener(CallEvents.Disconnected, onCallDisconnected);
  outboundCall.addEventListener(CallEvents.Failed, onCallFailed);

  outboundCall.record({ stereo: RECORDING_STEREO, format: RECORDING_FORMAT, transcribe: true, language: 'en-US' });
}

function onCallConnected(e) {
  Logger.write('AI call connected');

  notifyCallEvent(callData.callId, 'call.answered', {
    fromNumber: DEFAULT_CALLER_ID,
  });

  if (callData.amdEnabled && AMD_CONFIG.enabled) {
    outboundCall.detectAnsweringMachine({
      initialSilence: AMD_CONFIG.initialSilenceMs,
      greeting: AMD_CONFIG.greetingMs,
      afterGreetingDelay: AMD_CONFIG.afterGreetingMs,
    });

    outboundCall.addEventListener(CallEvents.MachineDetected, function() {
      Logger.write('Machine detected — ending AI call');
      notifyCallEvent(callData.callId, 'call.amd_result', { result: 'machine' });
      outboundCall.hangup();
    });

    outboundCall.addEventListener(CallEvents.HumanDetected, function() {
      Logger.write('Human detected — starting AI agent');
      notifyCallEvent(callData.callId, 'call.amd_result', { result: 'human' });
      startAIAgent();
    });
  } else {
    startAIAgent();
  }
}

function startAIAgent() {
  Logger.write('Initializing OpenAI Realtime connection');

  var systemPrompt = buildSystemPrompt();

  // Connect to OpenAI Realtime API via WebSocket
  // The OpenAI Realtime API handles speech-to-text, reasoning, and text-to-speech
  // in a single bidirectional WebSocket stream.
  var wsUrl = 'wss://api.openai.com/v1/realtime?model=' + AI_MODEL;

  aiWebSocket = VoxEngine.createWebSocket(wsUrl, {
    headers: {
      'Authorization': 'Bearer ' + OPENAI_API_KEY,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  aiWebSocket.addEventListener(WebSocketEvents.OPEN, function() {
    Logger.write('OpenAI WebSocket connected');

    // Configure the AI session
    aiWebSocket.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: systemPrompt,
        voice: callData.aiVoice || AI_VOICE,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: [
          {
            type: 'function',
            name: 'transfer_to_agent',
            description: 'Transfer the call to a human agent when the debtor requests it or the situation requires human judgment.',
            parameters: {
              type: 'object',
              properties: {
                reason: {
                  type: 'string',
                  description: 'Why the transfer is needed',
                },
              },
              required: ['reason'],
            },
          },
          {
            type: 'function',
            name: 'end_call',
            description: 'End the call politely when the conversation is complete.',
            parameters: {
              type: 'object',
              properties: {
                outcome: {
                  type: 'string',
                  enum: ['payment_promised', 'callback_requested', 'refused', 'no_contact'],
                  description: 'The outcome of the call',
                },
                summary: {
                  type: 'string',
                  description: 'Brief summary of the conversation',
                },
                sentiment: {
                  type: 'string',
                  enum: ['positive', 'neutral', 'negative', 'hostile'],
                },
                paymentAmount: { type: 'number' },
                paymentDate: { type: 'string' },
              },
              required: ['outcome', 'summary', 'sentiment'],
            },
          },
          {
            type: 'function',
            name: 'record_payment_promise',
            description: 'Record when a debtor promises to make a payment.',
            parameters: {
              type: 'object',
              properties: {
                amount: { type: 'number', description: 'Payment amount in dollars' },
                date: { type: 'string', description: 'Promised payment date (YYYY-MM-DD)' },
              },
              required: ['amount', 'date'],
            },
          },
        ],
      },
    }));
  });

  aiWebSocket.addEventListener(WebSocketEvents.MESSAGE, function(e) {
    try {
      var msg = JSON.parse(e.data);
      handleAIMessage(msg);
    } catch (err) {
      Logger.write('Error parsing AI message: ' + err.message);
    }
  });

  aiWebSocket.addEventListener(WebSocketEvents.ERROR, function(e) {
    Logger.write('OpenAI WebSocket error: ' + JSON.stringify(e));
  });

  aiWebSocket.addEventListener(WebSocketEvents.CLOSE, function() {
    Logger.write('OpenAI WebSocket closed');
  });

  // Route audio from phone call to AI
  outboundCall.addEventListener(CallEvents.PlaybackFinished, function() {
    // Audio playback completed
  });

  // Set up audio bridge: phone ←→ OpenAI
  outboundCall.sendMediaTo(aiWebSocket);
  aiWebSocket.sendMediaTo(outboundCall);
}

function handleAIMessage(msg) {
  if (msg.type === 'response.function_call_arguments.done') {
    var args;
    try {
      args = JSON.parse(msg.arguments);
    } catch (err) {
      Logger.write('Failed to parse function args: ' + err.message);
      return;
    }

    switch (msg.name) {
      case 'transfer_to_agent':
        Logger.write('AI requesting transfer to agent: ' + args.reason);
        transferInProgress = true;
        notifyCallEvent(callData.callId, 'call.transfer_to_agent', {
          reason: args.reason,
        });
        // TODO: Bridge to available agent via VoxEngine.callUser()
        break;

      case 'end_call':
        Logger.write('AI ending call. Outcome: ' + args.outcome);
        notifyCallEvent(callData.callId, 'call.ai_summary', {
          outcome: args.outcome,
          summary: args.summary,
          sentiment: args.sentiment,
          paymentPromised: args.outcome === 'payment_promised',
          paymentAmount: args.paymentAmount,
          paymentDate: args.paymentDate,
        });
        // Give a moment for the goodbye, then hang up
        setTimeout(function() {
          outboundCall.hangup();
        }, 3000);
        break;

      case 'record_payment_promise':
        Logger.write('Payment promise recorded: $' + args.amount + ' by ' + args.date);
        notifyCallEvent(callData.callId, 'call.ai_summary', {
          outcome: 'payment_promised',
          paymentPromised: true,
          paymentAmount: args.amount,
          paymentDate: args.date,
        });
        // Acknowledge back to AI so it can confirm with the debtor
        aiWebSocket.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: msg.call_id,
            output: JSON.stringify({ success: true, message: 'Payment arrangement recorded' }),
          },
        }));
        break;
    }
  }
}

function buildSystemPrompt() {
  // Use campaign-specific prompt if provided, otherwise default
  if (callData.aiPrompt) {
    return callData.aiPrompt + '\n\n' + getContactContext();
  }

  return [
    'You are a professional debt collection agent for ' + IVR_COMPANY_NAME + '.',
    '',
    IVR_PROMPTS.miniMirandaDisclosure,
    '',
    'IMPORTANT COMPLIANCE RULES:',
    '- Always provide the Mini-Miranda disclosure at the start of the call.',
    '- Be professional, courteous, and empathetic at all times.',
    '- Never threaten, harass, or use abusive language.',
    '- If the debtor says they dispute the debt, note it and offer to send verification.',
    '- If the debtor requests to stop calling, note it and end the call politely.',
    '- If the debtor says they have an attorney, ask for attorney contact info and end the call.',
    '- Never discuss the debt with anyone other than the debtor.',
    '- Respect the debtor\'s right to request communication in writing only.',
    '',
    'CALL OBJECTIVES:',
    '1. Confirm you are speaking with the correct person.',
    '2. Provide the Mini-Miranda disclosure.',
    '3. Discuss the outstanding balance and attempt to arrange payment.',
    '4. If the debtor cannot pay in full, negotiate a reasonable payment plan.',
    '5. Record any payment promises using the record_payment_promise function.',
    '6. If the debtor becomes hostile or requests an agent, transfer using transfer_to_agent.',
    '7. When the conversation is complete, use end_call with the appropriate outcome.',
    '',
    getContactContext(),
  ].join('\n');
}

function getContactContext() {
  var parts = ['CONTACT INFORMATION:'];
  if (callData.contactName) parts.push('- Name: ' + callData.contactName);
  if (callData.accountNumber) parts.push('- Account: ' + callData.accountNumber);
  if (callData.debtAmount) parts.push('- Outstanding balance: $' + callData.debtAmount);
  return parts.join('\n');
}

function onCallDisconnected(e) {
  Logger.write('AI call disconnected');

  if (e.record && e.record.url) {
    notifyCallEvent(callData.callId, 'call.recording_ready', {
      url: e.record.url,
      duration: e.record.duration,
      format: RECORDING_FORMAT,
    });
  }

  notifyCallEvent(callData.callId, 'call.ended', {
    reason: transferInProgress ? 'transfer' : 'normal_disconnect',
    duration: e.duration,
  });

  if (aiWebSocket) {
    try { aiWebSocket.close(); } catch (err) { /* ok */ }
  }

  if (isCallListMode) reportCallListResult(true, 200, 'completed');
  VoxEngine.terminate();
}

function onCallFailed(e) {
  Logger.write('AI call failed: ' + e.reason);

  notifyCallEvent(callData.callId, 'call.ended', {
    reason: e.reason || 'call_failed',
    code: e.code,
  });

  if (aiWebSocket) {
    try { aiWebSocket.close(); } catch (err) { /* ok */ }
  }

  if (isCallListMode) reportCallListResult(false, e.code || 500, e.reason || 'call_failed');
  VoxEngine.terminate();
}

// ---------------------------------------------------------------------------
// Call List helpers
// ---------------------------------------------------------------------------

function reportCallListResult(success, code, msg) {
  try {
    if (typeof CallList !== 'undefined' && CallList.reportResultAsync) {
      CallList.reportResultAsync({ result: success, code: code, msg: msg });
    }
  } catch (err) {
    Logger.write('Failed to report call list result: ' + err.message);
  }
}

function parseCallListData(raw) {
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
    dial_mode: fields[9] || 'ai',
    aiPrompt: fields[10] || '',
    aiVoice: fields[11] || '',
  };
}
