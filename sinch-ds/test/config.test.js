import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ConfigError, loadConfig } from '../src/config.js';
import { testEnv, writePinFile } from './helpers.js';

const problems = (overrides) => {
    try {
        loadConfig(testEnv(overrides));
    } catch (err) {
        assert.ok(err instanceof ConfigError, err.message);
        return err.message;
    }
    assert.fail('expected a ConfigError');
};

test('a valid environment and PIN map load', () => {
    const config = loadConfig(testEnv());
    assert.equal(config.pins.get('4321').displayName, 'SIP');
    assert.equal(config.rooms.get('conf-1'), 'room-uuid-1');
    assert.equal(config.sinch.apiUrl, 'https://calling-euc1.api.sinch.com');
});

test('the shipped pins.example.json is valid', () => {
    const config = loadConfig(testEnv({ PIN_MAP_FILE: new URL('../pins.example.json', import.meta.url).pathname }));
    assert.equal(config.pins.size, 3);
    assert.ok(JSON.parse(readFileSync(new URL('../pins.example.json', import.meta.url))));
});

test('refuses to start without the DS webhook secret, unless ALLOW_INSECURE_DEV=true', () => {
    assert.match(problems({ DIGITAL_SAMBA_WEBHOOK_SECRET: '' }), /DIGITAL_SAMBA_WEBHOOK_SECRET is required/);
    assert.match(problems({ DIGITAL_SAMBA_WEBHOOK_SECRET: 'DigitalSambaListener' }), /old published default/);
    assert.equal(loadConfig(testEnv({ DIGITAL_SAMBA_WEBHOOK_SECRET: '', ALLOW_INSECURE_DEV: 'true' })).insecureDev, true);
});

test('missing credentials, bad region and missing DS key are all reported at once', () => {
    const msg = problems({ SINCH_APPLICATION_KEY: '', SINCH_APPLICATION_SECRET: '', SINCH_REGION: 'mars', DIGITAL_SAMBA_DEVELOPER_KEY: '' });
    assert.match(msg, /SINCH_APPLICATION_KEY is required/);
    assert.match(msg, /SINCH_APPLICATION_SECRET is required/);
    assert.match(msg, /SINCH_REGION must be one of/);
    assert.match(msg, /DIGITAL_SAMBA_DEVELOPER_KEY is required/);
});

test('PIN map errors are clear and never echo a PIN', () => {
    const cases = [
        ['not json', /not valid JSON/],
        ['[]', /must be a JSON object/],
        ['{}', /no entries/],
        [{ 98765432: { conferenceId: 'c', displayName: 'A' } }, /entry 1: the PIN must be 1-6 digits/],
        [{ '0123': { conferenceId: 'c', displayName: 'A' } }, /leading zero/],
        [{ 111: { conferenceId: '', displayName: 'A' } }, /conferenceId must be a non-empty string/],
        [{ 111: { conferenceId: 'c'.repeat(65), displayName: 'A' } }, /at most 64/],
        [{ 111: { conferenceId: 'c' } }, /displayName must be a non-empty string/],
        [{ 111: { conferenceId: 'c', displayName: 'A', dsRoomID: 'x' } }, /unknown field "dsRoomID"/],
        [{ 111: { conferenceId: 'c', displayName: 'A', dsRoomId: 'r1' }, 222: { conferenceId: 'c', displayName: 'B', dsRoomId: 'r2' } }, /entry 2: conference "c" is already linked to a different dsRoomId/],
    ];
    for (const [pins, expected] of cases) {
        const msg = problems({ PIN_MAP_FILE: writePinFile(pins) });
        assert.match(msg, expected);
        assert.doesNotMatch(msg, /98765432|0123|111|222/);
    }
    assert.match(problems({ PIN_MAP_FILE: '/nonexistent/pins.json' }), /cannot read PIN_MAP_FILE.*ENOENT/);
});
