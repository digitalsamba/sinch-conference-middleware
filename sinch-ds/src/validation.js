// Small, dependency-free input checks for the admin API.

export class ValidationError extends Error {}

const optionalString = (value, field, max) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
    if (value.length > max) throw new ValidationError(`${field} must be at most ${max} characters`);
    return value;
};

const requiredString = (value, field, max) => {
    const v = optionalString(value, field, max);
    if (v === undefined || !v.trim()) throw new ValidationError(`${field} is required`);
    return v;
};

/** Conference IDs are passed to Sinch and limited to 64 chars by the schema. */
export const conferenceId = (value) => requiredString(value, 'conference_id', 64);
export const roomId = (value) => optionalString(value, 'digitalsamba_room_id', 128);
export const displayName = (value) => optionalString(value, 'display_name', 255);
export const externalId = (value) => optionalString(value, 'external_id', 255);
export const callId = (value) => requiredString(value, 'call_id', 128);

/** PINs are entered by DTMF (max 6 digits, see the ICE menu) and stored as integers. */
export const pin = (value) => {
    const s = typeof value === 'number' ? String(value) : value;
    if (typeof s !== 'string' || !/^\d{1,6}$/.test(s)) {
        throw new ValidationError('pin must be 1 to 6 digits');
    }
    return parseInt(s, 10);
};

// node:sqlite exposes SQLite's extended result code as err.errcode.
const SQLITE_CONSTRAINT_FOREIGNKEY = 787;
const SQLITE_CONSTRAINT_UNIQUE = 2067;
const SQLITE_CONSTRAINT_CHECK = 275;

/**
 * Maps validation and constraint errors to a 4xx response; returns false for anything else.
 */
export const sendClientError = (res, err, { conflict = 'Already exists', missing = 'Referenced record not found' } = {}) => {
    if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return true;
    }
    switch (err?.errcode) {
        case SQLITE_CONSTRAINT_UNIQUE:
            res.status(409).json({ error: conflict });
            return true;
        case SQLITE_CONSTRAINT_FOREIGNKEY:
            res.status(404).json({ error: missing });
            return true;
        case SQLITE_CONSTRAINT_CHECK:
            res.status(400).json({ error: 'Value violates a constraint' });
            return true;
        default:
            return false;
    }
};
