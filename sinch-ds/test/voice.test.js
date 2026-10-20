import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, postVoiceEvent, outbound, logs, ice, pie, dice, ROOM } from './helpers.js';

let ctx;
beforeEach(async () => { ctx = await startApp(); });
afterEach(async () => { await ctx.close(); });

const send = async (event) => {
    const res = await postVoiceEvent(ctx.base, event);
    assert.equal(res.status, 200);
    return res.json();
};
const dsCalls = async (change) => {
    await ctx.flow.settled();
    return outbound.filter((c) => c.url === `https://ds.example.test/api/v1/rooms/${ROOM}/phone-participants/${change}`);
};

test('ICE answers with the PIN menu (6 DTMF digits, # ends input)', async () => {
    const svaml = await send(ice('c1'));
    assert.equal(svaml.action.name, 'runMenu');
    assert.equal(svaml.action.barge, true);
    assert.deepEqual(svaml.action.menus, [{
        id: 'main',
        mainPrompt: '#tts[Welcome to the conference. Please enter your PIN followed by hash sign.]',
        maxDigits: 6,
        timeoutMills: 30000,
        options: [{ dtmf: '#', action: 'return' }],
    }]);
});

test('PIE with a valid PIN connects to the configured conference (QA path: SIP leg, "<pin>#")', async () => {
    await send(ice('sip-1', 'sip-trunk'));
    const svaml = await send(pie('sip-1', '4321#'));
    assert.deepEqual(svaml.instructions, [{ name: 'say', text: 'Thank you. We will now connect you to the conference.' }]);
    assert.deepEqual(svaml.action, { name: 'connectConf', conferenceId: 'conf-1', moh: 'music3' });
    assert.equal(ctx.flow.findCall('sip-1').isSip, true);
});

test('PIN without # and with leading zeros still matches', async () => {
    assert.equal((await send(pie('c1', '1234'))).action.conferenceId, 'conf-1');
    assert.equal((await send(pie('c2', '01234#'))).action.conferenceId, 'conf-1');
});

test('PIE with an invalid PIN, or no input, re-prompts', async () => {
    for (const value of ['0000#', '#', '', '12a4#']) {
        const svaml = await send(pie('c1', value));
        assert.equal(svaml.action.name, 'runMenu', `value ${JSON.stringify(value)}`);
        assert.match(svaml.action.menus[0].mainPrompt, /Unrecognised PIN/);
    }
    assert.equal(ctx.flow.findCall('c1'), undefined);
});

test('an unrecognised PIN logs why (menu result type, input method, digit count), not the digits', async () => {
    await send({ event: 'pie', callid: 't1', menuResult: { type: 'timeout', value: '', inputMethod: 'dtmf', menuId: 'main' } });
    await send({ event: 'pie', callid: 't2', menuResult: { type: 'sequence', value: '9876#', inputMethod: 'dtmf', menuId: 'main' } });
    const all = logs.join('\n');
    assert.match(all, /PIE t1: PIN not recognised \(timeout, dtmf, 0 digit\(s\)\)/);
    assert.match(all, /PIE t2: PIN not recognised \(sequence, dtmf, 4 digit\(s\)\)/);
    assert.doesNotMatch(all, /9876/);
});

test('SIP leg joining announces phone callers already in the conference', async () => {
    await send(ice('phone-1', '4930123456'));
    await send(pie('phone-1', '1234#'));
    assert.equal((await dsCalls('joined')).length, 0, 'no room leg yet: DS is not told');

    await send(ice('sip-1', 'sip'));
    await send(pie('sip-1', '4321#'));
    const [joined, ...rest] = await dsCalls('joined');
    assert.equal(rest.length, 0);
    assert.deepEqual(joined.body, [{ call_id: 'phone-1', name: 'Alice', caller_number: '+4930123456', external_id: 'ext-a' }]);
    assert.equal(joined.headers.authorization, 'Bearer test-ds-key');
});

test('phone caller joining while the SIP leg is present is announced', async () => {
    await send(pie('sip-1', '4321#'));
    await send(ice('phone-2', '4930999999'));
    await send(pie('phone-2', '5678#'));
    const joined = await dsCalls('joined');
    assert.deepEqual(joined.map((c) => c.body), [[{ call_id: 'phone-2', name: 'Bob', caller_number: '+4930999999' }]]);
});

test('caller numbers are not sent to DS unless SEND_CALLER_NUMBER=true', async () => {
    await ctx.close();
    ctx = await startApp({ SEND_CALLER_NUMBER: undefined });
    await send(pie('sip-1', '4321#'));
    await send(ice('phone-2', '4930999999'));
    await send(pie('phone-2', '5678#'));
    const joined = await dsCalls('joined');
    assert.deepEqual(joined.map((c) => c.body), [[{ call_id: 'phone-2', name: 'Bob' }]]);
});

test('DICE: phone caller leaving is reported; SIP leg leaving reports all phone callers left', async () => {
    await send(pie('sip-1', '4321#'));
    await send(pie('phone-1', '1234#'));
    await send(pie('phone-2', '5678#'));
    outbound.length = 0;

    await send(dice('phone-1'));
    assert.deepEqual((await dsCalls('left')).map((c) => c.body), [['phone-1']]);
    assert.equal(ctx.flow.findCall('phone-1'), undefined);

    outbound.length = 0;
    await send(dice('sip-1'));
    assert.deepEqual((await dsCalls('left')).map((c) => c.body), [['phone-2']]);
});

test('conferences without a dsRoomId never call Digital Samba', async () => {
    await send(pie('c7', '7777#'));
    await send(dice('c7'));
    await ctx.flow.settled();
    assert.equal(outbound.length, 0);
});

test('bad signature, stale timestamp or unsigned callback -> 401', async () => {
    assert.equal((await postVoiceEvent(ctx.base, ice('c1'), { sign: false })).status, 401);
    assert.equal((await postVoiceEvent(ctx.base, ice('c1'), { secret: Buffer.from('wrong').toString('base64') })).status, 401);
    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    assert.equal((await postVoiceEvent(ctx.base, ice('c1'), { timestamp: stale })).status, 401, 'replay outside window');
});

test('unknown event types -> 400', async () => {
    for (const event of ['ace', 'constructor', undefined]) {
        assert.equal((await postVoiceEvent(ctx.base, { event, callid: 'x' })).status, 400);
    }
});

test('logs carry neither PINs nor full caller numbers', async () => {
    await send(ice('phone-1', '4930123456'));
    await send(pie('phone-1', '1234#'));
    await send(pie('phone-x', '0000#'));
    const all = logs.join('\n');
    assert.doesNotMatch(all, /4930123456|1234#|0000/);
    assert.match(all, /493…3456/);
});
