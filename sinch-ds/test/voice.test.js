import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, api, postVoiceEvent, outbound, db, DS_WEBHOOK_SECRET } from './helpers.js';
import { pendingCallInfoCount } from '../src/voice/serverBusinessLogic.js';

let ctx;
beforeEach(async () => {
    ctx = await startApp();
    await api(ctx.base, '/api/conference', { method: 'POST', body: { conference_id: 'conf-1', digitalsamba_room_id: 'room-1' } });
    await api(ctx.base, '/api/user', { method: 'POST', body: { conference_id: 'conf-1', pin: 1234, display_name: 'Alice' } });
    await api(ctx.base, '/api/user', { method: 'POST', body: { conference_id: 'conf-1', pin: 9999, display_name: 'SIP Room Bridge' } });
});
afterEach(async () => { await ctx.close(); });

const ice = (callid, cli = '4930123456') => ({ event: 'ice', callid, cli, timestamp: new Date().toISOString() });
const pie = (callid, value) => ({ event: 'pie', callid, menuResult: { type: 'sequence', value, menuId: 'main' } });
const dice = (callid) => ({ event: 'dice', callid, reason: 'MANAGERHANGUP', result: 'ANSWERED' });

test('rejects unsigned, wrongly signed and stale callbacks', async () => {
    let r = await postVoiceEvent(ctx.base, ice('c1'), { sign: false });
    assert.equal(r.status, 401);

    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    r = await postVoiceEvent(ctx.base, ice('c1'), { timestamp: stale });
    assert.equal(r.status, 401, 'a validly signed but hour-old callback is a replay');
});

test('unknown event types get a 400', async () => {
    const r = await postVoiceEvent(ctx.base, { event: 'bogus', callid: 'x' });
    assert.equal(r.status, 400);
});

test('ICE answers with a PIN menu', async () => {
    const r = await postVoiceEvent(ctx.base, ice('c1'));
    assert.equal(r.status, 200);
    const svaml = await r.json();
    assert.equal(svaml.action.name, 'runMenu');
    assert.equal(svaml.action.menus[0].maxDigits, 6);
});

test('PIE with a valid PIN connects to the conference and records the live call', async () => {
    await postVoiceEvent(ctx.base, ice('c1', '4930123456'));
    const r = await postVoiceEvent(ctx.base, pie('c1', '1234#'));
    assert.equal(r.status, 200);
    const svaml = await r.json();
    assert.equal(svaml.action.name, 'connectConf');
    assert.equal(svaml.action.conferenceId, 'conf-1');

    const call = await db.getLiveCall('c1');
    assert.equal(call.conference_id, 'conf-1');
    assert.equal(call.cli, '4930123456');
    assert.equal(call.is_sip, 0);
    // No SIP bridge in the room yet, so Digital Samba is not told.
    assert.equal(outbound.length, 0);
});

test('PIE with an unknown PIN re-prompts instead of returning an empty body', async () => {
    const r = await postVoiceEvent(ctx.base, pie('c1', '0000#'));
    assert.equal(r.status, 200);
    const svaml = await r.json();
    assert.equal(svaml.action.name, 'runMenu');
    assert.match(svaml.action.menus[0].mainPrompt, /Unrecognised PIN/);
    assert.equal(await db.getLiveCall('c1'), undefined);
});

test('SIP bridge joining announces existing phone callers to Digital Samba; DICE cleans up', async () => {
    await postVoiceEvent(ctx.base, ice('phone-1', '4930123456'));
    await postVoiceEvent(ctx.base, pie('phone-1', '1234#'));
    await postVoiceEvent(ctx.base, ice('sip-1', 'sip'));
    await postVoiceEvent(ctx.base, pie('sip-1', '9999#'));

    const joined = outbound.find((c) => c.url.endsWith('/api/v1/rooms/room-1/phone-participants/joined'));
    assert.ok(joined, 'DS joined notification sent');
    assert.equal(joined.body[0].call_id, 'phone-1');
    assert.equal(joined.body[0].caller_number, '+4930123456');
    assert.equal(joined.body[0].name, 'Alice');

    outbound.length = 0;
    const heldBefore = pendingCallInfoCount();
    let r = await postVoiceEvent(ctx.base, dice('phone-1'));
    assert.equal(r.status, 200);
    const left = outbound.find((c) => c.url.endsWith('/api/v1/rooms/room-1/phone-participants/left'));
    assert.deepEqual(left.body, ['phone-1']);
    assert.equal(await db.getLiveCall('phone-1'), undefined);

    r = await postVoiceEvent(ctx.base, dice('sip-1'));
    assert.equal(r.status, 200);
    assert.equal(pendingCallInfoCount(), heldBefore - 2, 'ICE caller info is released on DICE');
});

test('Digital Samba mute webhook requires the secret and mutes via Sinch', async () => {
    await postVoiceEvent(ctx.base, ice('phone-1'));
    await postVoiceEvent(ctx.base, pie('phone-1', '1234#'));
    outbound.length = 0;

    const send = (auth, body) => fetch(`${ctx.base}/DigitalSambaListener`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(auth && { authorization: auth }) },
        body: JSON.stringify(body),
    });

    assert.equal((await send(undefined, {})).status, 401);
    assert.equal((await send('Bearer DigitalSambaListener', {})).status, 403, 'the published default is not accepted');

    let r = await send(`Bearer ${DS_WEBHOOK_SECRET}`, { eventType: 'phone_participant_muted', callId: 'phone-1' });
    assert.equal(r.status, 200);
    assert.equal(outbound.length, 1);
    assert.match(outbound[0].url, /\/calling\/v1\/conferences\/id\/conf-1\/phone-1$/);
    assert.equal(outbound[0].method, 'PATCH');
    assert.deepEqual(outbound[0].body, { command: 'mute' });

    r = await send(`Bearer ${DS_WEBHOOK_SECRET}`, { eventType: 'phone_participant_muted', callId: 'nope' });
    assert.equal(r.status, 404);
});
