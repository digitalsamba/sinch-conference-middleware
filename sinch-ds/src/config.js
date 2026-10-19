// All configuration is read and checked once, before the server starts: a misconfigured
// bridge should refuse to boot with a clear message, not fail on the first phone call.
import { readFileSync } from 'node:fs';

export class ConfigError extends Error {}

// Sinch Calling API endpoints. Use the region your Sinch app (and the DS room's SIP trunk)
// lives in; a conference only exists in the region that created it.
export const SINCH_REGIONS = {
    global: 'https://calling.api.sinch.com',
    europe: 'https://calling-euc1.api.sinch.com',
    northAmerica: 'https://calling-use1.api.sinch.com',
    southAmerica: 'https://calling-sae1.api.sinch.com',
    asiaSouthEast1: 'https://calling-apse1.api.sinch.com',
    asiaSouthEast2: 'https://calling-apse2.api.sinch.com',
};

// The PIN menu collects at most 6 digits (see sinch.js). No leading zero: callers who type
// "0123" are matched to PIN "123", as earlier versions (which stored PINs as integers) did.
const PIN_PATTERN = /^[1-9]\d{0,5}$/;
const ENTRY_KEYS = new Set(['conferenceId', 'displayName', 'externalId', 'dsRoomId']);
const isText = (v, max = 256) => typeof v === 'string' && v.trim() !== '' && v.length <= max;

/**
 * Parses the PIN map: { "<pin>": { conferenceId, displayName, externalId?, dsRoomId? } }.
 * Returns the PIN lookup plus conferenceId -> Digital Samba room ID. Errors name entries by
 * position, never by PIN, because PINs are the dial-in credentials.
 */
export const parsePinMap = (text) => {
    let raw;
    try { raw = JSON.parse(text); } catch (err) { throw new ConfigError(`PIN map is not valid JSON: ${err.message}`); }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new ConfigError('PIN map must be a JSON object of "<pin>": { ... } entries');
    }
    const pins = new Map();
    const rooms = new Map();
    const problems = [];
    Object.entries(raw).forEach(([pin, entry], i) => {
        const at = `PIN map entry ${i + 1}`;
        if (!PIN_PATTERN.test(pin)) problems.push(`${at}: the PIN must be 1-6 digits without a leading zero`);
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return problems.push(`${at}: must be an object`);
        for (const key of Object.keys(entry)) if (!ENTRY_KEYS.has(key)) problems.push(`${at}: unknown field "${key}"`);
        // 64 characters is Sinch's limit for a conference ID.
        if (!isText(entry.conferenceId, 64)) problems.push(`${at}: conferenceId must be a non-empty string of at most 64 characters`);
        if (!isText(entry.displayName)) problems.push(`${at}: displayName must be a non-empty string`);
        for (const key of ['externalId', 'dsRoomId']) {
            if (entry[key] !== undefined && !isText(entry[key])) problems.push(`${at}: ${key}, if given, must be a non-empty string`);
        }
        // The room belongs to the conference, so every entry for one conference must agree.
        if (entry.dsRoomId && rooms.has(entry.conferenceId) && rooms.get(entry.conferenceId) !== entry.dsRoomId) {
            problems.push(`${at}: conference "${entry.conferenceId}" is already linked to a different dsRoomId`);
        }
        if (entry.dsRoomId) rooms.set(entry.conferenceId, entry.dsRoomId);
        pins.set(pin, entry);
    });
    if (pins.size === 0 && problems.length === 0) problems.push('PIN map has no entries');
    if (problems.length) throw new ConfigError(problems.join('\n'));
    return { pins, rooms };
};

/** Builds the runtime config from environment variables. Throws ConfigError listing every problem. */
export const loadConfig = (env = process.env) => {
    const problems = [];
    const required = (name) => env[name] || void problems.push(`${name} is required`);

    const insecureDev = env.ALLOW_INSECURE_DEV === 'true';
    const webhookSecret = env.DIGITAL_SAMBA_WEBHOOK_SECRET || '';
    if (!webhookSecret && !insecureDev) {
        problems.push('DIGITAL_SAMBA_WEBHOOK_SECRET is required (or ALLOW_INSECURE_DEV=true for a local experiment)');
    }
    if (webhookSecret === 'DigitalSambaListener') problems.push('DIGITAL_SAMBA_WEBHOOK_SECRET must not be the old published default');

    const region = env.SINCH_REGION || 'europe';
    if (!SINCH_REGIONS[region]) problems.push(`SINCH_REGION must be one of: ${Object.keys(SINCH_REGIONS).join(', ')}`);

    const pinMapFile = env.PIN_MAP_FILE || 'pins.json';
    let pinMap = { pins: new Map(), rooms: new Map() };
    try {
        pinMap = parsePinMap(readFileSync(pinMapFile, 'utf8'));
    } catch (err) {
        problems.push(err instanceof ConfigError ? err.message : `cannot read PIN_MAP_FILE (${pinMapFile}): ${err.code || err.message}`);
    }
    // Without a developer key there is no way to tell Digital Samba who dialled in.
    if (pinMap.rooms.size && !env.DIGITAL_SAMBA_DEVELOPER_KEY) {
        problems.push('DIGITAL_SAMBA_DEVELOPER_KEY is required because the PIN map links conferences to Digital Samba rooms');
    }

    const config = {
        port: Number(env.PORT) || 3030,
        insecureDev,
        ...pinMap,
        sinch: {
            applicationKey: required('SINCH_APPLICATION_KEY'),
            applicationSecret: required('SINCH_APPLICATION_SECRET'),
            apiUrl: SINCH_REGIONS[region],
        },
        ds: {
            apiUrl: (env.DIGITAL_SAMBA_API_URL || 'https://api.digitalsamba.com').replace(/\/+$/, ''),
            developerKey: env.DIGITAL_SAMBA_DEVELOPER_KEY,
            webhookSecret,
            sendCallerNumber: env.SEND_CALLER_NUMBER === 'true', // opt-in: callers' numbers are personal data
        },
    };
    if (problems.length) throw new ConfigError(problems.join('\n'));
    return config;
};
