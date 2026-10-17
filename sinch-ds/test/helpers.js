// Shared test harness: in-memory DB, the real Express app on an ephemeral port,
// signed Sinch callbacks, and a stub for outbound calls to Sinch / Digital Samba.
import { generateAuthorizationHeader } from '@sinch/sdk-core';

export const SINCH_KEY = 'test-app-key';
export const SINCH_SECRET = Buffer.from('test-app-secret').toString('base64');
export const DS_WEBHOOK_SECRET = 'test-ds-webhook-secret';
export const ADMIN = { username: 'admin', password: 'correct horse' };

// Module-level config in the services is read at import time.
process.env.SINCH_APPLICATION_KEY = SINCH_KEY;
process.env.SINCH_APPLICATION_SECRET = SINCH_SECRET;
process.env.DIGITAL_SAMBA_DEVELOPER_KEY = 'test-ds-key';
process.env.DIGITAL_SAMBA_API_URL = 'https://ds.example.test';

// Keep test output readable; set TEST_LOGS=1 to see application logs.
if (!process.env.TEST_LOGS) {
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) console[level] = () => {};
}

const realFetch = globalThis.fetch;
export const outbound = [];

// Anything not addressed to the local test server is recorded and answered 200.
globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
    outbound.push({ url: u, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
};

const db = await import('../src/database.js');
const { createApp } = await import('../src/app.js');

export { db };

export const adminHeaders = (u = ADMIN.username, p = ADMIN.password) => ({
    authorization: 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64'),
    'content-type': 'application/json',
});

/** Starts a fresh app + empty in-memory DB. Returns { base, close }. */
export const startApp = async (options = {}) => {
    await db.initializeDatabase(':memory:');
    outbound.length = 0;
    const app = createApp({
        digitalSambaWebhookSecret: DS_WEBHOOK_SECRET,
        adminAuth: { mode: 'basic', ...ADMIN },
        ...options,
    });
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    return {
        base,
        close: () => new Promise((resolve) => server.close(() => { db.closeDatabase(); resolve(); })),
    };
};

/** POSTs a Sinch Voice callback signed the way Sinch signs it (Application scheme). */
export const postVoiceEvent = (base, event, { timestamp = new Date().toISOString(), sign = true } = {}) => {
    const body = JSON.stringify(event);
    const contentType = 'application/json; charset=utf-8';
    const headers = { 'content-type': contentType, 'x-timestamp': timestamp };
    if (sign) {
        headers.authorization = generateAuthorizationHeader(
            'POST', body, contentType, `x-timestamp:${timestamp}`, '/VoiceEvent', SINCH_KEY, SINCH_SECRET,
        );
    }
    return realFetch(`${base}/VoiceEvent`, { method: 'POST', headers, body });
};

export const api = (base, path, { method = 'GET', body, headers = adminHeaders() } = {}) =>
    realFetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
