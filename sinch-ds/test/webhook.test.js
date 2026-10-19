import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, postVoiceEvent, postDsEvent, outbound, pie } from './helpers.js';

let ctx;
afterEach(async () => { await ctx?.close(); });

const inConference = async (callId, pin) => {
    assert.equal((await postVoiceEvent(ctx.base, pie(callId, `${pin}#`))).status, 200);
    outbound.length = 0;
};

test('healthz is open', async () => {
    ctx = await startApp();
    const res = await fetch(`${ctx.base}/healthz`);
    assert.deepEqual(await res.json(), { status: 'ok' });
});

test('DS webhook without the secret, or with a wrong one -> 401, nothing sent to Sinch', async () => {
    ctx = await startApp();
    await inConference('phone-1', 1234);
    const mute = { eventType: 'phone_participant_muted', callId: 'phone-1' };
    assert.equal((await postDsEvent(ctx.base, mute, null)).status, 401);
    assert.equal((await postDsEvent(ctx.base, mute, 'Bearer wrong')).status, 401);
    assert.equal((await postDsEvent(ctx.base, mute, 'Bearer DigitalSambaListener')).status, 401);
    assert.equal(outbound.length, 0);
});

test('DS mute / unmute webhooks call Sinch for that call in its conference', async () => {
    ctx = await startApp();
    await inConference('phone-1', 1234);
    for (const [eventType, command] of [['phone_participant_muted', 'mute'], ['phone_participant_unmuted', 'unmute']]) {
        outbound.length = 0;
        const res = await postDsEvent(ctx.base, { eventType, callId: 'phone-1' });
        assert.equal(res.status, 200);
        assert.equal(outbound.length, 1);
        assert.equal(outbound[0].url, 'https://calling-euc1.api.sinch.com/calling/v1/conferences/id/conf-1/phone-1');
        assert.equal(outbound[0].method, 'PATCH');
        assert.deepEqual(outbound[0].body, { command });
    }
});

test('DS webhook for an unknown call -> 404; other event types are acknowledged and ignored', async () => {
    ctx = await startApp();
    assert.equal((await postDsEvent(ctx.base, { eventType: 'phone_participant_muted', callId: 'nope' })).status, 404);
    const res = await postDsEvent(ctx.base, { eventType: 'room_joined' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ignored: true });
    assert.equal(outbound.length, 0);
});

test('ALLOW_INSECURE_DEV without a secret leaves the DS webhook open (local experiments only)', async () => {
    ctx = await startApp({ DIGITAL_SAMBA_WEBHOOK_SECRET: '', ALLOW_INSECURE_DEV: 'true' });
    await inConference('phone-1', 1234);
    assert.equal((await postDsEvent(ctx.base, { eventType: 'phone_participant_muted', callId: 'phone-1' }, null)).status, 200);
});
