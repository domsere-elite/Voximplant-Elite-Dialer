/**
 * Elite Dialer — Outbound PDS Scenario (SmartQueue predictive/progressive).
 *
 * customData (semicolon-delimited, matches the dialer's CSV→call-list export):
 *   phone;crm_account_id;campaign_id;caller_id;amd_enabled;vm_drop_url
 *
 * SmartQueue wiring:
 *   - On human: call VoxEngine.reportSuccessfulCallEvent() → SmartQueue routes an agent
 *   - On machine / failure: call VoxEngine.reportFailedCallEvent()
 *     (SmartQueue applies its configured retry policy to the contact)
 */

require(Modules.AMD);
require(Modules.Recorder);
require(Modules.Player);

require('elite-config');
require('elite-crm-webhook');

var cfg     = global.EliteDialerConfig;
var webhook = global.EliteDialerWebhook;

// ---------------------------------------------------------------------------
// Parse semicolon-delimited customData
// ---------------------------------------------------------------------------
var raw   = VoxEngine.customData() || '';
var parts = raw.split(';');

var PHONE        = parts[0] || '';
var CRM_ACCOUNT  = parts[1] || null;
var CAMPAIGN_ID  = parts[2] || null;
var CALLER_ID    = parts[3] || '';
var AMD_ENABLED  = (parts[4] || '').toString().toLowerCase() === 'true';
var VM_DROP_URL  = parts[5] || null;

Logger.write('[outbound-pds] customData phone=' + PHONE +
    ' crm=' + CRM_ACCOUNT +
    ' campaign=' + CAMPAIGN_ID +
    ' amd=' + AMD_ENABLED);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
var outboundCall       = null;
var agentCall          = null;
var amdResult          = null;
var recordingStarted   = false;
var voicemailPlayed    = false;
var latestRecordingUrl = null;
var callStartedAt      = Date.now();
var vmTimeoutTimer     = null;
var terminated         = false;
var reportedToSQ       = false;

function nowSecs() { return Math.round((Date.now() - callStartedAt) / 1000); }

function safeNotify(event, data) {
    try { webhook.notifyDialerBackend(event, data || {}); }
    catch (e) { Logger.write('[outbound-pds] notify ' + event + ' threw: ' + e); }
}

function reportSuccessOnce() {
    if (reportedToSQ) return;
    reportedToSQ = true;
    try {
        if (typeof VoxEngine.reportSuccessfulCallEvent === 'function') {
            VoxEngine.reportSuccessfulCallEvent();
        }
    } catch (err) { Logger.write('[outbound-pds] reportSuccessful threw: ' + err); }
}

function reportFailureOnce(reason) {
    if (reportedToSQ) return;
    reportedToSQ = true;
    try {
        if (typeof VoxEngine.reportFailedCallEvent === 'function') {
            VoxEngine.reportFailedCallEvent(reason || 'failed');
        }
    } catch (err) { Logger.write('[outbound-pds] reportFailed threw: ' + err); }
}

// ---------------------------------------------------------------------------
// Validate & start
// ---------------------------------------------------------------------------
if (!PHONE || !CALLER_ID) {
    Logger.write('[outbound-pds] missing phone or caller_id in customData; aborting');
    reportFailureOnce('invalid_custom_data');
    safeNotify('call_ended', {
        outcome: 'failed',
        reason: 'invalid_custom_data',
        phone: PHONE,
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID
    });
    VoxEngine.terminate();
}

safeNotify('call_started', {
    direction: 'outbound',
    mode: 'pds',
    phone: PHONE,
    caller_id: CALLER_ID,
    crm_account_id: CRM_ACCOUNT,
    campaign_id: CAMPAIGN_ID,
    amd_enabled: AMD_ENABLED
});

outboundCall = VoxEngine.callPSTN(PHONE, CALLER_ID);

outboundCall.addEventListener(CallEvents.Connected,    onOutboundConnected);
outboundCall.addEventListener(CallEvents.Failed,       onOutboundFailed);
outboundCall.addEventListener(CallEvents.Disconnected, onOutboundDisconnected);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
function onOutboundConnected(e) {
    safeNotify('call_connected', {
        voximplant_call_id: outboundCall.id(),
        phone: PHONE,
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID
    });

    if (AMD_ENABLED) {
        runAmd();
    } else {
        amdResult = 'human';
        handleHuman();
    }
}

function onOutboundFailed(e) {
    Logger.write('[outbound-pds] outbound failed code=' + e.code + ' reason=' + e.reason);
    reportFailureOnce(e.reason || 'failed');
    safeNotify('call_ended', {
        outcome: 'failed',
        code: e.code,
        reason: e.reason,
        phone: PHONE,
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID,
        voximplant_call_id: outboundCall ? outboundCall.id() : null
    });
    terminate();
}

function onOutboundDisconnected(e) {
    if (agentCall) {
        try { agentCall.hangup(); } catch (err) { /* ignore */ }
    }
    finalizeCall(e && e.reason ? e.reason : 'hangup');
}

// ---------------------------------------------------------------------------
// AMD
// ---------------------------------------------------------------------------
function runAmd() {
    var amd = VoxEngine.createAMD(outboundCall, {
        initialSilenceMs:  cfg.AMD_INITIAL_SILENCE_MS,
        greetingMs:        cfg.AMD_GREETING_MS,
        afterGreetingMs:   cfg.AMD_AFTER_GREETING_MS
    });

    amd.addEventListener(AMDEvents.DetectionResult, function (ev) {
        amdResult = ev && ev.result ? ev.result : 'timeout';
        Logger.write('[outbound-pds] AMD result=' + amdResult);

        if (amdResult === 'machine' || amdResult === 'voicemail') {
            safeNotify('amd_result', {
                result: 'machine',
                voximplant_call_id: outboundCall.id(),
                crm_account_id: CRM_ACCOUNT,
                campaign_id: CAMPAIGN_ID
            });
            reportFailureOnce('answering_machine');
            playVoicemailDrop();
        } else {
            safeNotify('amd_result', {
                result: 'human',
                voximplant_call_id: outboundCall.id(),
                crm_account_id: CRM_ACCOUNT,
                campaign_id: CAMPAIGN_ID
            });
            handleHuman();
        }
    });
}

// ---------------------------------------------------------------------------
// Human pickup — let SmartQueue take over agent selection
// ---------------------------------------------------------------------------
function handleHuman() {
    startRecording();
    webhook.prefetchAccount(PHONE, function () { /* fire & forget */ });
    reportSuccessOnce();
    VoxEngine.addEventListener(AppEvents.CallAlerting, onSmartQueueAgentCall);
}

// ---------------------------------------------------------------------------
// SmartQueue-routed agent leg
// ---------------------------------------------------------------------------
function onSmartQueueAgentCall(ev) {
    agentCall = ev.call;

    agentCall.addEventListener(CallEvents.Connected, function () {
        safeNotify('agent_connected', {
            voximplant_call_id: outboundCall.id(),
            agent_call_id: agentCall.id(),
            agent_username: (ev.headers && ev.headers['X-SmartQueue-Agent']) || null,
            crm_account_id: CRM_ACCOUNT,
            campaign_id: CAMPAIGN_ID
        });
        VoxEngine.sendMediaBetween(outboundCall, agentCall);
    });

    agentCall.addEventListener(CallEvents.Disconnected, function () {
        try { outboundCall.hangup(); } catch (err) { /* ignore */ }
    });

    agentCall.addEventListener(CallEvents.Failed, function (failEv) {
        safeNotify('agent_failed', {
            voximplant_call_id: outboundCall.id(),
            code: failEv.code,
            reason: failEv.reason
        });
        try { outboundCall.hangup(); } catch (err) { /* ignore */ }
    });

    try { agentCall.answer(); } catch (err) {
        Logger.write('[outbound-pds] agentCall.answer threw: ' + err);
    }
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------
function startRecording() {
    if (recordingStarted) return;
    recordingStarted = true;
    try {
        var recorder = outboundCall.record({
            stereo: cfg.RECORDING_STEREO,
            format: cfg.RECORDING_FORMAT
        });

        recorder.addEventListener(RecorderEvents.Started, function () {
            safeNotify('recording_started', {
                voximplant_call_id: outboundCall.id(),
                crm_account_id: CRM_ACCOUNT,
                campaign_id: CAMPAIGN_ID
            });
        });

        recorder.addEventListener(RecorderEvents.Stopped, function (stopEv) {
            latestRecordingUrl = stopEv && stopEv.url ? stopEv.url : latestRecordingUrl;
            safeNotify('recording_ready', {
                voximplant_call_id: outboundCall.id(),
                recording_url: latestRecordingUrl,
                crm_account_id: CRM_ACCOUNT,
                campaign_id: CAMPAIGN_ID
            });
        });
    } catch (err) {
        Logger.write('[outbound-pds] startRecording threw: ' + err);
    }
}

// ---------------------------------------------------------------------------
// Voicemail drop
// ---------------------------------------------------------------------------
function playVoicemailDrop() {
    if (!VM_DROP_URL) {
        safeNotify('call_ended', {
            outcome: 'answering_machine',
            amd_result: 'machine',
            voicemail_dropped: false,
            voximplant_call_id: outboundCall.id(),
            crm_account_id: CRM_ACCOUNT,
            campaign_id: CAMPAIGN_ID
        });
        try { outboundCall.hangup(); } catch (err) { /* ignore */ }
        return;
    }

    try {
        var player = VoxEngine.createURLPlayer(VM_DROP_URL);
        player.sendMediaTo(outboundCall);

        player.addEventListener(PlayerEvents.PlaybackFinished, function () {
            voicemailPlayed = true;
            safeNotify('voicemail_dropped', {
                voximplant_call_id: outboundCall.id(),
                vm_drop_url: VM_DROP_URL,
                crm_account_id: CRM_ACCOUNT,
                campaign_id: CAMPAIGN_ID
            });
            try { outboundCall.hangup(); } catch (err) { /* ignore */ }
        });

        vmTimeoutTimer = setTimeout(function () {
            if (!voicemailPlayed) {
                Logger.write('[outbound-pds] VM drop timeout — forcing hangup');
                safeNotify('voicemail_drop_timeout', {
                    voximplant_call_id: outboundCall.id(),
                    vm_drop_url: VM_DROP_URL
                });
                try { outboundCall.hangup(); } catch (err) { /* ignore */ }
            }
        }, cfg.VM_DROP_TIMEOUT_MS);
    } catch (err) {
        Logger.write('[outbound-pds] playVoicemailDrop threw: ' + err);
        try { outboundCall.hangup(); } catch (err2) { /* ignore */ }
    }
}

// ---------------------------------------------------------------------------
// Finalize
// ---------------------------------------------------------------------------
function finalizeCall(reason) {
    if (terminated) return;
    var outcome;
    if (amdResult === 'machine' || amdResult === 'voicemail') {
        outcome = 'answering_machine';
    } else if (amdResult === 'human') {
        outcome = 'completed';
    } else {
        outcome = 'completed';
    }

    safeNotify('call_ended', {
        outcome: outcome,
        voximplant_call_id: outboundCall ? outboundCall.id() : null,
        duration_seconds: nowSecs(),
        hangup_reason: reason || 'hangup',
        recording_url: latestRecordingUrl,
        amd_result: amdResult,
        voicemail_dropped: voicemailPlayed,
        phone: PHONE,
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID
    });
    terminate();
}

function terminate() {
    if (terminated) return;
    terminated = true;
    if (vmTimeoutTimer) { clearTimeout(vmTimeoutTimer); vmTimeoutTimer = null; }
    if (!reportedToSQ) reportFailureOnce('scenario_terminate_without_report');
    try { VoxEngine.terminate(); } catch (err) { /* ignore */ }
}
