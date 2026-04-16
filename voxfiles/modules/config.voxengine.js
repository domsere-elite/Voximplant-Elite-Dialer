/**
 * Shared configuration for all VoxEngine scenarios.
 */

// Default caller ID for outbound calls
const DEFAULT_CALLER_ID = '';  // Set via deployment

// AI Voice settings
const AI_VOICE = 'alloy';
const AI_MODEL = 'gpt-4o-realtime-preview';

// AMD settings
const AMD_CONFIG = {
  enabled: true,
  initialSilenceMs: 4500,
  greetingMs: 1500,
  afterGreetingMs: 800,
};

// Recording settings
const RECORDING_FORMAT = 'mp3';
const RECORDING_STEREO = true;

// Transfer settings
const TRANSFER_TIMEOUT_SECONDS = 20;

// IVR prompts
const IVR_COMPANY_NAME = 'Elite Portfolio Management';

const IVR_PROMPTS = {
  welcome: `Thank you for calling ${IVR_COMPANY_NAME}.`,
  mainMenu: 'Press 1 to make a payment. Press 2 to speak with an agent. Press 3 to leave a voicemail.',
  holdMessage: 'All agents are currently busy. Press 1 to continue holding. Press 2 to leave a voicemail.',
  voicemailPrompt: 'Please leave your message after the tone. Press pound when finished.',
  invalidInput: 'We did not receive a valid selection.',
  goodbye: 'Thank you for calling. Goodbye.',
  miniMirandaDisclosure: 'This is an attempt to collect a debt, and any information obtained will be used for that purpose. This communication is from a debt collector.',
};
