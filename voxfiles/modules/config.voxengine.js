/**
 * Elite Dialer — VoxEngine shared config module.
 *
 * Loaded via `require(Modules.ApplicationStorage)` pattern OR by being listed
 * as a dependency in the scenario's `require()` call at the top of each
 * scenario file. Values marked `{{...}}` are replaced at deploy time by the
 * voxfiles deploy script (see scripts/deploy-voxfiles.ts).
 *
 * DO NOT commit real secrets here. Placeholders only.
 */

// --- Backend webhook ---------------------------------------------------------
var BACKEND_WEBHOOK_URL = '{{BACKEND_WEBHOOK_URL}}'; // e.g. https://dialer.example.com/api/webhooks/voximplant
var WEBHOOK_SECRET      = '{{WEBHOOK_SECRET}}';     // shared secret for X-Webhook-Secret header

// --- CRM integration ---------------------------------------------------------
var CRM_BASE_URL = '{{CRM_BASE_URL}}'; // e.g. https://crm.example.com
var CRM_API_KEY  = '{{CRM_API_KEY}}';  // sent as X-Dialer-Key to CRM

// --- AMD tuning (Voximplant AMD module) -------------------------------------
var AMD_INITIAL_SILENCE_MS  = 4500; // silence window before we decide nobody greeted us
var AMD_GREETING_MS         = 1500; // max human greeting length
var AMD_AFTER_GREETING_MS   = 800;  // silence after greeting required to flip to human

// --- Voicemail drop ----------------------------------------------------------
var VM_DROP_TIMEOUT_MS = 30000; // safety: force hangup after this long playing VM audio

// --- Agent connection --------------------------------------------------------
var AGENT_CONNECT_TIMEOUT_SECONDS = 30;

// --- Recorder ----------------------------------------------------------------
var RECORDING_FORMAT = 'mp3';
var RECORDING_STEREO = true;

// --- IVR ---------------------------------------------------------------------
var IVR_GREETING  = 'Thank you for calling Elite Portfolio Management.';
var IVR_MAIN_MENU = 'Press 1 to speak with a representative. Press 2 for payment information. Press 3 to request a callback.';

// Expose on global scope so scenarios that `require()` this file can use them.
// VoxEngine does not support CommonJS exports; globals are the supported pattern.
global.EliteDialerConfig = {
    BACKEND_WEBHOOK_URL: BACKEND_WEBHOOK_URL,
    WEBHOOK_SECRET: WEBHOOK_SECRET,
    CRM_BASE_URL: CRM_BASE_URL,
    CRM_API_KEY: CRM_API_KEY,
    AMD_INITIAL_SILENCE_MS: AMD_INITIAL_SILENCE_MS,
    AMD_GREETING_MS: AMD_GREETING_MS,
    AMD_AFTER_GREETING_MS: AMD_AFTER_GREETING_MS,
    VM_DROP_TIMEOUT_MS: VM_DROP_TIMEOUT_MS,
    AGENT_CONNECT_TIMEOUT_SECONDS: AGENT_CONNECT_TIMEOUT_SECONDS,
    RECORDING_FORMAT: RECORDING_FORMAT,
    RECORDING_STEREO: RECORDING_STEREO,
    IVR_GREETING: IVR_GREETING,
    IVR_MAIN_MENU: IVR_MAIN_MENU
};
