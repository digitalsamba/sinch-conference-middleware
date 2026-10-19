// Test harness: the real app on an ephemeral port, Sinch callbacks signed with Sinch's own SDK
// signer, and a fetch stub that records outbound calls to Sinch / Digital Samba.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateAuthorizationHeader } from '@sinch/sdk-core';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

export const SINCH_KEY = 'test-app-key';
export const SINCH_SECRET = Buffer.from('test-app-secret').toString('base64');
export const DS_SECRET = 'test-ds-webhook-secret';
export const ROOM = 'room-uuid-1';

// Shaped like the QA rig: a "SIP..." entry is the DS room's own leg.
export const PINS = {
    1234: { conferenceId: 'conf-1', displayName: 'Alice', externalId: 'ext-a' },
    5678: { conferenceId: 'conf-1', displayName: 'Bob' },
    4321: { conferenceId: 'conf-1', displayName: 'SIP', dsRoomId: ROOM },
    7777: { conferenceId: 'conf-no-room', displayName: 'Carol' },
};

// Everything the app logs is captured (and kept off the test output unless TEST_LOGS=1).
export const logs = [];
for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level];
    console[level] = (...args) => { logs.push(args.join(' ')); if (process.env.TEST_LOGS) original(...args); };
}

const realFetch = globalThis.fetch;
export const outbound = [];
globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, init);
    outbound.push({ url: String(url), method: init.method, headers: init.headers, body: init.body && JSON.parse(init.body) });
    return new Response('{}', { status: 200 });
};

export const writePinFile = (pins) => {
    const file = join(mkdtempSync(join(tmpdir(), 'pins-')), 'pins.json');
    writeFileSync(file, typeof pins === 'string' ? pins : JSON.stringify(pins));
    return file;
};

export const testEnv = (overrides = {}) => ({
    SINCH_APPLICATION_KEY: SINCH_KEY,
    SINCH_APPLICATION_SECRET: SINCH_SECRET,
    DIGITAL_SAMBA_DEVELOPER_KEY: 'test-ds-key',
    DIGITAL_SAMBA_API_URL: 'https://ds.example.test',
    DIGITAL_SAMBA_WEBHOOK_SECRET: DS_SECRET,
    PIN_MAP_FILE: writePinFile(PINS),
    SEND_CALLER_NUMBER: 'true',
    ...overrides,
});

/** Starts the app from a test environment. Returns { base, flow, close }. */
export const startApp = async (envOverrides) => {
    outbound.length = 0;
    logs.length = 0;
    const app = createApp(loadConfig(testEnv(envOverrides)));
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    return {
        base: `http://127.0.0.1:${server.address().port}`,
        flow: app.locals.flow,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
};

/** POSTs a Sinch Voice callback signed exactly as Sinch signs it (Application scheme). */
export const postVoiceEvent = (base, event, { timestamp = new Date().toISOString(), sign = true, secret = SINCH_SECRET } = {}) => {
    const body = JSON.stringify(event);
    const contentType = 'application/json; charset=utf-8';
    const headers = { 'content-type': contentType, 'x-timestamp': timestamp };
    if (sign) {
        headers.authorization = generateAuthorizationHeader('POST', body, contentType, `x-timestamp:${timestamp}`, '/VoiceEvent', SINCH_KEY, secret);
    }
    return realFetch(`${base}/VoiceEvent`, { method: 'POST', headers, body });
};

export const postDsEvent = (base, body, authorization = `Bearer ${DS_SECRET}`) => realFetch(`${base}/DigitalSambaListener`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(authorization && { authorization }) },
    body: JSON.stringify(body),
});

export const ice = (callid, cli = '4930123456') => ({ event: 'ice', callid, cli, timestamp: new Date().toISOString() });
export const pie = (callid, value) => ({ event: 'pie', callid, menuResult: { type: 'sequence', value, menuId: 'main' } });
export const dice = (callid) => ({ event: 'dice', callid, reason: 'MANAGERHANGUP', result: 'ANSWERED' });
