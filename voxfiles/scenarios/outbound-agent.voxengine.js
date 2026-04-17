/**
 * Elite Dialer — Outbound Agent Scenario (manual / preview dialing).
 *
 * customData (JSON string):
 *   {
 *     "to": "+15551234567",
 *     "from": "+15557654321",
 *     "crm_account_id": "acc_...",
 *     "campaign_id": "cmp_..."            (optional for manual),
 *     "agent_username": "agent01",
 *     "amd_enabled": true,
 *     "vm_drop_url": "https://.../vm.mp3" (optional),
 *     "campaign_voximplant_session_id": "..." (optional tracking id)
 *   }
 */

require(Modules.AMD);
require(Modules.Recorder);
require(Modules.Player);

// Pull in shared modules (uploaded as separate scenarios at deploy time).
require('elite-config');
require('elite-crm-webhook');

var cfg     = global.EliteDialerConfig;
var webhook = global.EliteDialerWebhook;

// ---------------------------------------------------------------------------
// Parse customData
// ---------------------------------------------------------------------------
var params = {};
try {
    var raw = VoxEngine.customData();
    params = raw ? JSON.parse(raw) : {};
} catch (parseErr) {
    Logger.write('[outbound-agent] customData parse error: ' + parseErr);
    params = {};
}

var TO            = params.to;
var FROM          = params.from;
var CRM_ACCOUNT   = params.crm_account_id;
var CAMPAIGN_ID   = params.campaign_id || null;
var AGENT         = params.agent_username;
var AMD_ENABLED   = params.amd_enabled === true || params.amd_enabled === 'true';
var VM_DROP_URL   = params.vm_drop_url || null;
var SESSION_ID    = params.campaign_voximplant_session_id || null;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
var outboundCall       = null;
var agentCall          = null;
var amdResult          = null;   // 'human' | 'machine' | 'timeout'
var recordingStarted   = false;
var voicemailPlayed    = false;
var voicemailPlayer    = null;
var latestRecordingUrl = null;
var callStartedAt      = Date.now();
var agentConnectTimer  = null;
var vmTimeoutTimer     = null;
var terminated         = false;

function nowSecs() { return Math.round((Date.now() - callStartedAt) / 1000); }

function safeNotify(event, data) {
    try { webhook.notifyDialerBackend(event, data || {}); }
    catch (e) { Logger.write('[outbound-agent] notify ' + event + ' threw: ' + e); }
}

// ---------------------------------------------------------------------------
// Validate inputs — fail fast if required fields missing
// ---------------------------------------------------------------------------
if (!TO || !FROM || !AGENT) {
    Logger.write('[outbound-agent] missing required customData fields (to/from/agent_username); terminating');
    safeNotify('call_ended', {
        outcome: 'failed',
        reason: 'invalid_custom_data',
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID,
        campaign_voximplant_session_id: SESSION_ID
    });
    VoxEngine.terminate();
}

// ---------------------------------------------------------------------------
// Kick off the call
// ---------------------------------------------------------------------------
safeNotify('call_started', {
    direction: 'outbound',
    mode: 'agent',
    to: TO,
    from: FROM,
    crm_account_id: CRM_ACCOUNT,
    campaign_id: CAMPAIGN_ID,
    agent_username: AGENT,
    amd_enabled: AMD_ENABLED,
    campaign_voximplant_session_id: SESSION_ID
});

outboundCall = VoxEngine.callPSTN(TO, FROM, null, {}, { customSipHeaders: {} });

outboundCall.addEventListener(CallEvents.Connected,    onOutboundConnected);
outboundCall.addEventListener(CallEvents.Failed,       onOutboundFailed);
outboundCall.addEventListener(CallEvents.Disconnected, onOutboundDisconnected);

// ---------------------------------------------------------------------------
// Outbound call handlers
// ---------------------------------------------------------------------------
function onOutboundConnected(e) {
    safeNotify('call_connected', {
        voximplant_call_id: outboundCall.id(),
        to: TO,
        crm_account_id: CRM_ACCOUNT,
        campaign_voximplant_session_id: SESSION_ID
    });

    if (AMD_ENABLED) {
        runAmd();
    } else {
        amdResult = 'human';
        startRecording();
        webhook.prefetchAccount(TO, function () { /* fire & forget */ });
        connectAgent();
    }
}

function onOutboundFailed(e) {
    Logger.write('[outbound-agent] outbound failed code=' + e.code + ' reason=' + e.reason);
    safeNotify('call_ended', {
        outcome: 'failed',
        code: e.code,
        reason: e.reason,
        voximplant_call_id: outboundCall ? outboundCall.id() : null,
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID,
        campaign_voximplant_session_id: SESSION_ID
    });
    terminate();
}

function onOutboundDisconnected(e) {
    if (agentCall && agentCall.state() === 'CONNECTED') {
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
        Logger.write('[outbound-agent] AMD result=' + amdResult);

        if (amdResult === 'machine' || amdResult === 'voicemail') {
            safeNotify('amd_result', {
                result: 'machine',
                voximplant_call_id: outboundCall.id(),
                crm_account_id: CRM_ACCOUNT
            });
            playVoicemailDrop();
        } else {
            safeNotify('amd_result', {
                result: 'human',
                voximplant_call_id: outboundCall.id(),
                crm_account_id: CRM_ACCOUNT
            });
            startRecording();
            webhook.prefetchAccount(TO, function () { /* fire & forget */ });
            connectAgent();
        }
    });
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
                crm_account_id: CRM_ACCOUNT
            });
        });

        recorder.addEventListener(RecorderEvents.Stopped, function (ev) {
            latestRecordingUrl = ev && ev.url ? ev.url : latestRecordingUrl;
            safeNotify('recording_ready', {
                voximplant_call_id: outboundCall.id(),
                recording_url: latestRecordingUrl,
                crm_account_id: CRM_ACCOUNT
            });
        });
    } catch (err) {
        Logger.write('[outbound-agent] startRecording threw: ' + err);
    }
}

// ---------------------------------------------------------------------------
// Agent connect
// ---------------------------------------------------------------------------
function connectAgent() {
    agentCall = VoxEngine.callUserDirect(outboundCall, AGENT, FROM, null);

    agentCall.addEventListener(CallEvents.Connected,    onAgentConnected);
    agentCall.addEventListener(CallEvents.Failed,       onAgentFailed);
    agentCall.addEventListener(CallEvents.Disconnected, onAgentDisconnected);

    agentConnectTimer = setTimeout(function () {
        if (!agentCall || agentCall.state() !== 'CONNECTED') {
            Logger.write('[outbound-agent] agent connect timeout (' + cfg.AGENT_CONNECT_TIMEOUT_SECONDS + 's)');
            safeNotify('agent_connect_timeout', {
                voximplant_call_id: outboundCall.id(),
                agent_username: AGENT,
                crm_account_id: CRM_ACCOUNT
            });
            try {
                outboundCall.say(
                    'We are unable to connect you to an agent at this time. Goodbye.',
                    Language.US_ENGLISH_FEMALE
                );
                outboundCall.addEventListener(CallEvents.PlaybackFinished, function () {
                    try { outboundCall.hangup(); } catch (err) { /* ignore */ }
                });
            } catch (err) {
                try { outboundCall.hangup(); } catch (err2) { /* ignore */ }
            }
        }
    }, cfg.AGENT_CONNECT_TIMEOUT_SECONDS * 1000);
}

function onAgentConnected(e) {
    if (agentConnectTimer) { clearTimeout(agentConnectTimer); agentConnectTimer = null; }
    safeNotify('agent_connected', {
        agent_username: AGENT,
        voximplant_call_id: outboundCall.id(),
        crm_account_id: CRM_ACCOUNT,
        campaign_voximplant_session_id: SESSION_ID
    });
    VoxEngine.sendMediaBetween(outboundCall, agentCall);
}

function onAgentFailed(e) {
    Logger.write('[outbound-agent] agent leg failed code=' + e.code + ' reason=' + e.reason);
    safeNotify('agent_failed', {
        agent_username: AGENT,
        code: e.code,
        reason: e.reason,
        voximplant_call_id: outboundCall.id()
    });
    try { outboundCall.hangup(); } catch (err) { /* ignore */ }
}

function onAgentDisconnected(e) {
    try { outboundCall.hangup(); } catch (err) { /* ignore */ }
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
            campaign_id: CAMPAIGN_ID,
            campaign_voximplant_session_id: SESSION_ID
        });
        try { outboundCall.hangup(); } catch (err) { /* ignore */ }
        return;
    }

    try {
        voicemailPlayer = VoxEngine.createURLPlayer(VM_DROP_URL);
        voicemailPlayer.sendMediaTo(outboundCall);

        voicemailPlayer.addEventListener(PlayerEvents.PlaybackFinished, function () {
            voicemailPlayed = true;
            safeNotify('voicemail_dropped', {
                voximplant_call_id: outboundCall.id(),
                vm_drop_url: VM_DROP_URL,
                crm_account_id: CRM_ACCOUNT
            });
            try { outboundCall.hangup(); } catch (err) { /* ignore */ }
        });

        vmTimeoutTimer = setTimeout(function () {
            if (!voicemailPlayed) {
                Logger.write('[outbound-agent] VM drop timeout — forcing hangup');
                safeNotify('voicemail_drop_timeout', {
                    voximplant_call_id: outboundCall.id(),
                    vm_drop_url: VM_DROP_URL
                });
                try { outboundCall.hangup(); } catch (err) { /* ignore */ }
            }
        }, cfg.VM_DROP_TIMEOUT_MS);
    } catch (err) {
        Logger.write('[outbound-agent] playVoicemailDrop threw: ' + err);
        try { outboundCall.hangup(); } catch (err2) { /* ignore */ }
    }
}

// ---------------------------------------------------------------------------
// Finalize
// ---------------------------------------------------------------------------
function finalizeCall(reason) {
    if (terminated) return;
    safeNotify('call_ended', {
        outcome: amdResult === 'machine' || amdResult === 'voicemail'
            ? 'answering_machine'
            : 'completed',
        voximplant_call_id: outboundCall ? outboundCall.id() : null,
        duration_seconds: nowSecs(),
        hangup_reason: reason || 'hangup',
        recording_url: latestRecordingUrl,
        amd_result: amdResult,
        voicemail_dropped: voicemailPlayed,
        crm_account_id: CRM_ACCOUNT,
        campaign_id: CAMPAIGN_ID,
        agent_username: AGENT,
        campaign_voximplant_session_id: SESSION_ID
    });
    terminate();
}

function terminate() {
    if (terminated) return;
    terminated = true;
    if (agentConnectTimer) { clearTimeout(agentConnectTimer); agentConnectTimer = null; }
    if (vmTimeoutTimer)    { clearTimeout(vmTimeoutTimer);    vmTimeoutTimer = null; }
    try { VoxEngine.terminate(); } catch (err) { /* ignore */ }
}
