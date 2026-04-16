/**
 * Webhook helper — sends call events back to the backend API.
 * Used by all scenarios to report call state changes.
 */

/**
 * Send event to backend webhook endpoint.
 * @param {string} endpoint - The webhook path (e.g., '/call-event', '/inbound')
 * @param {object} payload - The event data
 */
function sendWebhook(endpoint, payload) {
  var url = BACKEND_WEBHOOK_URL + endpoint;

  var options = {
    headers: [
      'Content-Type: application/json',
      'X-Webhook-Secret: ' + BACKEND_WEBHOOK_SECRET,
    ],
    method: 'POST',
    postData: JSON.stringify(payload),
  };

  Net.httpRequestAsync(url, options).then(function(result) {
    Logger.write('Webhook sent: ' + endpoint + ' status=' + result.code);
  }).catch(function(err) {
    Logger.write('Webhook failed: ' + endpoint + ' error=' + err.message);
  });
}

/**
 * Notify backend of a call event.
 */
function notifyCallEvent(callId, event, data) {
  sendWebhook('/call-event', {
    callId: callId,
    event: event,
    data: data || {},
  });
}

/**
 * Notify backend of an inbound call.
 */
/**
 * Check TCPA compliance before dialing. Returns a promise that resolves
 * to { allowed: boolean, reason: string }.
 */
function checkCompliance(phone, contactId, timezone) {
  return Net.httpRequestAsync(BACKEND_WEBHOOK_URL + '/compliance-check', {
    headers: [
      'Content-Type: application/json',
      'X-Webhook-Secret: ' + BACKEND_WEBHOOK_SECRET,
    ],
    method: 'POST',
    postData: JSON.stringify({
      phone: phone,
      contactId: contactId,
      timezone: timezone,
    }),
  });
}

/**
 * Notify backend of an inbound call.
 */
function notifyInboundCall(fromNumber, toNumber, providerCallId) {
  return Net.httpRequestAsync(BACKEND_WEBHOOK_URL + '/inbound', {
    headers: [
      'Content-Type: application/json',
      'X-Webhook-Secret: ' + BACKEND_WEBHOOK_SECRET,
    ],
    method: 'POST',
    postData: JSON.stringify({
      fromNumber: fromNumber,
      toNumber: toNumber,
      callId: providerCallId,
    }),
  });
}
