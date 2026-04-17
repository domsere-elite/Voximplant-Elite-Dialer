// voxfiles/scenarios/inbound-ivr.voxengine.js
// Inbound IVR scenario for Elite Dialer. Runs in Voximplant cloud.
//
// Replace placeholder URLs/keys with env-injected values during deployment:
//   DIALER_BACKEND_URL, CRM_PREFETCH_URL, DIALER_API_KEY, CRM_API_KEY

require(Modules.IVR);

var DIALER_BACKEND_URL = 'https://backend-production-e2bf.up.railway.app/api/webhooks/voximplant';
var CRM_PREFETCH_URL = 'https://placeholder.example.com/api/voice/tools/prefetch-account';
var DIALER_API_KEY = '553219b5ec60f56412f22a12c1692846d056b2d05ad12e15f734663dc5d06604';
var CRM_API_KEY = 'placeholder';

var IVR_GREETING = 'Thank you for calling Elite Portfolio Management.';
var IVR_MAIN_MENU = 'Press 1 to speak with a representative. Press 2 to check your account balance. Press 3 to request a callback.';
var IVR_REPROMPT = "Sorry, I didn't catch that. " + IVR_MAIN_MENU;
var IVR_GOODBYE = 'Thank you for calling. Goodbye.';

var QUEUE_NAME = 'inbound_queue';
var QUEUE_PRIORITY = 5;

var state = {
  inboundCall: null,
  callStartedAt: 0,
  cachedAccount: null,
  dtmfBuffer: '',
  reprompted: false,
  dtmfListenerBound: false,
};

function notifyDialerBackend(eventType, payload) {
  try {
    var data = payload || {};
    data.voximplantCallId = state.inboundCall ? state.inboundCall.id() : null;
    data.timestamp = new Date().toISOString();
    var body = JSON.stringify({ event: eventType, data: data });
    Net.httpRequestAsync(DIALER_BACKEND_URL, {
      method: 'POST',
      headers: ['Content-Type: application/json', 'X-Webhook-Secret: ' + DIALER_API_KEY],
      postData: body,
    }, function () { /* fire and forget */ });
  } catch (e) {
    Logger.write('notifyDialerBackend failed: ' + e.message);
  }
}

function prefetchAccount(callerId, cb) {
  var url = CRM_PREFETCH_URL + '?phone=' + encodeURIComponent(callerId);
  Net.httpRequestAsync(url, {
    method: 'GET',
    headers: ['X-Dialer-Key: ' + CRM_API_KEY],
  }, function (res) {
    if (res && res.code === 200) {
      try {
        var parsed = JSON.parse(res.text);
        state.cachedAccount = parsed.account || null;
      } catch (e) { state.cachedAccount = null; }
    } else {
      state.cachedAccount = null;
    }
    if (cb) cb();
  });
}

function playMenu() {
  state.dtmfBuffer = '';
  state.inboundCall.say(IVR_GREETING + ' ' + IVR_MAIN_MENU, Language.US_ENGLISH_FEMALE);
}

function playReprompt() {
  state.dtmfBuffer = '';
  state.reprompted = true;
  state.inboundCall.say(IVR_REPROMPT, Language.US_ENGLISH_FEMALE);
}

function sayAndHangup(text) {
  state.inboundCall.addEventListener(CallEvents.PlaybackFinished, function () {
    state.inboundCall.hangup();
  });
  state.inboundCall.say(text, Language.US_ENGLISH_FEMALE);
}

function routeToAgent() {
  notifyDialerBackend('ivr_selection', { selection: '1' });
  var customData = JSON.stringify({ crm_account_id: state.cachedAccount ? state.cachedAccount.id : null });
  var acdRequest = VoxEngine.enqueueACDRequest(QUEUE_NAME, QUEUE_PRIORITY, {
    agentRequest: true,
    customData: customData,
  });

  acdRequest.addEventListener(ACDEvents.Ready, function () {
    var operatorCall = acdRequest.operatorCall();
    VoxEngine.sendMediaBetween(state.inboundCall, operatorCall);
    try { state.inboundCall.record(); } catch (e) { Logger.write('record failed: ' + e.message); }
  });

  acdRequest.addEventListener(ACDEvents.OperatorReached, function () {
    notifyDialerBackend('agent_connected', {});
  });

  acdRequest.addEventListener(ACDEvents.Offline, function () {
    sayAndHangup('No agents available. ' + IVR_GOODBYE);
  });
}

function handleBalanceRequest() {
  notifyDialerBackend('ivr_selection', { selection: '2' });
  if (state.cachedAccount && typeof state.cachedAccount.balance !== 'undefined') {
    var bal = Number(state.cachedAccount.balance).toFixed(2);
    state.inboundCall.addEventListener(CallEvents.PlaybackFinished, function onBalFinished() {
      state.inboundCall.removeEventListener(CallEvents.PlaybackFinished, onBalFinished);
      state.dtmfBuffer = '';
      state.inboundCall.say('Press 1 to speak with a representative, or hang up to end the call.', Language.US_ENGLISH_FEMALE);
    });
    state.inboundCall.say('Your current balance is $' + bal + '.', Language.US_ENGLISH_FEMALE);
  } else {
    state.inboundCall.addEventListener(CallEvents.PlaybackFinished, function onNoAcct() {
      state.inboundCall.removeEventListener(CallEvents.PlaybackFinished, onNoAcct);
      state.dtmfBuffer = '';
    });
    state.inboundCall.say('We could not locate your account. Press 1 to speak with a representative.', Language.US_ENGLISH_FEMALE);
  }
}

function handleCallbackRequest() {
  notifyDialerBackend('callback_requested', { phone: state.inboundCall.callerid() });
  sayAndHangup('A representative will call you back within one business day. ' + IVR_GOODBYE);
}

function startDTMFCollection() {
  var timeout = null;
  var armTimeout = function () {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(function () {
      if (state.reprompted) {
        sayAndHangup(IVR_GOODBYE);
      } else {
        playReprompt();
        armTimeout();
      }
    }, 8000);
  };

  if (!state.dtmfListenerBound) {
    state.inboundCall.addEventListener(CallEvents.ToneReceived, function (e) {
      if (timeout) { clearTimeout(timeout); timeout = null; }
      var digit = e.tone;
      state.dtmfBuffer += digit;

      if (digit === '1') {
        routeToAgent();
      } else if (digit === '2') {
        handleBalanceRequest();
        armTimeout();
      } else if (digit === '3') {
        handleCallbackRequest();
      } else {
        if (state.reprompted) {
          sayAndHangup(IVR_GOODBYE);
        } else {
          playReprompt();
          armTimeout();
        }
      }
    });
    state.dtmfListenerBound = true;
  }
  armTimeout();
}

VoxEngine.addEventListener(AppEvents.CallAlerting, function (e) {
  state.inboundCall = e.call;
  state.callStartedAt = Date.now();

  notifyDialerBackend('call_started', {
    direction: 'inbound',
    from: state.inboundCall.callerid(),
    to: state.inboundCall.number(),
  });

  state.inboundCall.addEventListener(CallEvents.Connected, function () {
    prefetchAccount(state.inboundCall.callerid(), function () {
      state.inboundCall.addEventListener(CallEvents.PlaybackFinished, function onMenuDone() {
        state.inboundCall.removeEventListener(CallEvents.PlaybackFinished, onMenuDone);
        startDTMFCollection();
      });
      playMenu();
    });
  });

  state.inboundCall.addEventListener(CallEvents.Disconnected, function () {
    var durationSec = Math.floor((Date.now() - state.callStartedAt) / 1000);
    notifyDialerBackend('call_ended', { duration_seconds: durationSec });
    VoxEngine.terminate();
  });

  state.inboundCall.addEventListener(CallEvents.Failed, function () {
    notifyDialerBackend('call_failed', {});
    VoxEngine.terminate();
  });

  state.inboundCall.answer();
});
