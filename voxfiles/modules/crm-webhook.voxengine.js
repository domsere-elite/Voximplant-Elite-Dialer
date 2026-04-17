/**
 * Elite Dialer — VoxEngine CRM/backend HTTP helpers.
 *
 * Depends on EliteDialerConfig (from config.voxengine.js). All functions
 * swallow errors (log + move on) so a backend hiccup never tears down a live
 * call. Callbacks follow Node-style (err, data).
 */

(function () {
    var cfg = global.EliteDialerConfig || {};

    /**
     * POST a structured event to the dialer backend webhook.
     * @param {string} event - e.g. 'call_started', 'amd_result', 'agent_connected', 'call_ended'
     * @param {object} data  - arbitrary JSON payload
     * @param {function} [callback] - optional (err, response)
     */
    function notifyDialerBackend(event, data, callback) {
        try {
            var url = cfg.BACKEND_WEBHOOK_URL;
            if (!url) {
                Logger.write('[crm-webhook] BACKEND_WEBHOOK_URL not configured; skipping event ' + event);
                if (callback) callback(new Error('BACKEND_WEBHOOK_URL missing'));
                return;
            }

            var body = JSON.stringify({ event: event, data: data || {} });
            var options = {
                method: 'POST',
                headers: [
                    'Content-Type: application/json',
                    'X-Webhook-Secret: ' + (cfg.WEBHOOK_SECRET || '')
                ],
                postData: body,
                timeout: 10
            };

            Net.httpRequestAsync(url, function (result) {
                try {
                    if (!result || result.code < 200 || result.code >= 300) {
                        Logger.write('[crm-webhook] notifyDialerBackend ' + event + ' failed: code=' +
                            (result ? result.code : 'none') + ' err=' + (result ? result.error : 'none'));
                        if (callback) callback(new Error('HTTP ' + (result ? result.code : 'none')));
                        return;
                    }
                    Logger.write('[crm-webhook] notifyDialerBackend ' + event + ' ok');
                    if (callback) callback(null, result);
                } catch (innerErr) {
                    Logger.write('[crm-webhook] notifyDialerBackend cb error: ' + innerErr);
                    if (callback) callback(innerErr);
                }
            }, options);
        } catch (err) {
            Logger.write('[crm-webhook] notifyDialerBackend threw: ' + err);
            if (callback) callback(err);
        }
    }

    /**
     * Ask the CRM to prefetch account data for this phone number so the agent
     * screen-pop is warm by the time media bridges.
     * @param {string} phone     - E.164 phone
     * @param {function} callback - (err, accountData)
     */
    function prefetchAccount(phone, callback) {
        try {
            if (!cfg.CRM_BASE_URL) {
                Logger.write('[crm-webhook] CRM_BASE_URL not configured; skipping prefetch');
                if (callback) callback(new Error('CRM_BASE_URL missing'));
                return;
            }

            var url = cfg.CRM_BASE_URL + '/api/voice/tools/prefetch-account';
            var body = JSON.stringify({ phone: phone });
            var options = {
                method: 'POST',
                headers: [
                    'Content-Type: application/json',
                    'X-Dialer-Key: ' + (cfg.CRM_API_KEY || '')
                ],
                postData: body,
                timeout: 8
            };

            Net.httpRequestAsync(url, function (result) {
                try {
                    if (!result || result.code < 200 || result.code >= 300) {
                        Logger.write('[crm-webhook] prefetchAccount failed: code=' +
                            (result ? result.code : 'none'));
                        if (callback) callback(new Error('HTTP ' + (result ? result.code : 'none')));
                        return;
                    }
                    var parsed = null;
                    try {
                        parsed = result.text ? JSON.parse(result.text) : null;
                    } catch (parseErr) {
                        Logger.write('[crm-webhook] prefetchAccount parse error: ' + parseErr);
                        if (callback) callback(parseErr);
                        return;
                    }
                    Logger.write('[crm-webhook] prefetchAccount ok for ' + phone);
                    if (callback) callback(null, parsed);
                } catch (innerErr) {
                    Logger.write('[crm-webhook] prefetchAccount cb error: ' + innerErr);
                    if (callback) callback(innerErr);
                }
            }, options);
        } catch (err) {
            Logger.write('[crm-webhook] prefetchAccount threw: ' + err);
            if (callback) callback(err);
        }
    }

    global.EliteDialerWebhook = {
        notifyDialerBackend: notifyDialerBackend,
        prefetchAccount: prefetchAccount
    };
})();
