import { DatabaseSync } from 'node:sqlite';
import './env.js';

let db;

// node:sqlite refuses to bind `undefined` and JS booleans; sqlite3 used to coerce
// them silently (undefined -> NULL, true/false -> 1/0). Keep that behaviour.
const bindable = (value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
};
const params = (values) => values.map(bindable);

const requireDb = () => {
    if (!db) throw new Error('Database not initialized');
    return db;
};

const get = (sql, values = []) => requireDb().prepare(sql).get(...params(values));
const all = (sql, values = []) => requireDb().prepare(sql).all(...params(values));
const run = (sql, values = []) => {
    const result = requireDb().prepare(sql).run(...params(values));
    return { changes: Number(result.changes), lastID: Number(result.lastInsertRowid) };
};

/**
 * Opens (creating if needed) the SQLite database and ensures the schema exists.
 * @param {string} [filename] - Defaults to DATABASE_PATH or ./conference_data.db. Pass ':memory:' in tests.
 */
export const initializeDatabase = async (filename = process.env.DATABASE_PATH || './conference_data.db') => {
    try {
        if (db) db.close();
        // Matches the previous sqlite3 behaviour, where the PRAGMA was issued inside a
        // transaction and therefore never took effect.
        db = new DatabaseSync(filename, { enableForeignKeyConstraints: false });

        console.log('Connected to the SQLite database.');

        db.exec('BEGIN TRANSACTION');

        db.exec(`CREATE TABLE IF NOT EXISTS conference (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conference_id TEXT NOT NULL UNIQUE CHECK(length(conference_id) <= 64),
            digitalsamba_room_id TEXT,
            ds_pstn_notified BOOLEAN DEFAULT 0
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pin INTEGER NOT NULL UNIQUE,
            conference_id TEXT NOT NULL,
            display_name TEXT,
            external_id TEXT,
            FOREIGN KEY(conference_id) REFERENCES conference(conference_id) ON DELETE CASCADE
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS live_calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conference_id TEXT NOT NULL,
            call_id TEXT NOT NULL UNIQUE,
            pin INTEGER,
            is_sip BOOLEAN DEFAULT 0,
            cli TEXT,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            notified_ds BOOLEAN DEFAULT 0,
            FOREIGN KEY(conference_id) REFERENCES conference(conference_id) ON DELETE CASCADE,
            FOREIGN KEY(pin) REFERENCES users(pin) ON DELETE SET NULL
        )`);

        db.exec('CREATE INDEX IF NOT EXISTS idx_live_calls_conference_id ON live_calls (conference_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_live_calls_notified_ds ON live_calls (notified_ds)');

        db.exec('COMMIT');
        console.log('Database schema verified/created successfully.');
    } catch (err) {
        console.error('Error initializing database:', err.message);
        if (db?.isTransaction) {
            try {
                db.exec('ROLLBACK');
            } catch (rollbackErr) {
                console.error('Error rolling back transaction:', rollbackErr.message);
            }
        }
        throw err;
    }
};

export const closeDatabase = () => {
    if (db) {
        db.close();
        db = undefined;
    }
};


// --- Conference Functions ---
export const getConference = async (conference_id) =>
    get('SELECT * FROM conference WHERE conference_id = ?', [conference_id]);

export const markConferenceDsNotified = async (conferenceId) => {
    const { changes } = run('UPDATE conference SET ds_pstn_notified = 1 WHERE conference_id = ?', [conferenceId]);
    return { changes };
};


// --- User Functions ---
export const getUserByPin = async (pin) => get('SELECT * FROM users WHERE pin = ?', [pin]);


// --- Live Call Functions ---
export const addLiveCall = async ({ conference_id, call_id, pin, is_sip, cli }) => {
    const { lastID } = run(
        'INSERT INTO live_calls (conference_id, call_id, pin, is_sip, cli) VALUES (?, ?, ?, ?, ?)',
        [conference_id, call_id, pin, is_sip, cli]
    );
    return { id: lastID };
};

export const getLiveCallWithUserInfo = async (callId) => get(`
        SELECT lc.*, u.display_name, u.external_id
        FROM live_calls lc
        LEFT JOIN users u ON lc.pin = u.pin
        WHERE lc.call_id = ?`, [callId]);

export const removeLiveCall = async (callId) => {
    const { changes } = run('DELETE FROM live_calls WHERE call_id = ?', [callId]);
    return { changes };
};

export const getPendingPstnParticipants = async (conferenceId) => {
    const rows = all(`
        SELECT lc.call_id, lc.cli, u.display_name, u.external_id
        FROM live_calls lc
        JOIN users u ON lc.pin = u.pin
        WHERE lc.conference_id = ? AND lc.is_sip = 0 AND lc.notified_ds = 0`, [conferenceId]);
    return rows.map(row => ({ call_id: row.call_id, caller_number: row.cli, name: row.display_name, external_id: row.external_id }));
};

export const markParticipantsAsNotified = async (callIds) => {
    if (!callIds || callIds.length === 0) return { changes: 0 };
    const placeholders = callIds.map(() => '?').join(',');
    const { changes } = run(`UPDATE live_calls SET notified_ds = 1 WHERE call_id IN (${placeholders})`, callIds);
    return { changes };
};

/**
 * Retrieves all active PSTN (non-SIP) calls for a specific conference, including user details.
 * Used to inform Digital Samba when a SIP user joins/leaves.
 * @param {string} conferenceId - The ID of the conference.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of active PSTN participant objects.
 */
export const getActivePstnCallsByConference = async (conferenceId) => all(`
        SELECT lc.call_id, lc.cli, u.display_name, u.external_id, lc.pin
        FROM live_calls lc
        LEFT JOIN users u ON lc.pin = u.pin
        WHERE lc.conference_id = ? AND lc.is_sip = 0`, [conferenceId]);

/**
 * Checks if a designated SIP user (is_sip = 1) is currently active in the specified conference.
 * Used to determine if notifications for PSTN users should be sent to Digital Samba.
 * @param {string} conferenceId - The ID of the conference.
 * @returns {Promise<boolean>} A promise that resolves to true if a SIP user is active, false otherwise.
 */
export const isSipUserActiveInConference = async (conferenceId) =>
    !!get('SELECT 1 FROM live_calls WHERE conference_id = ? AND is_sip = 1 LIMIT 1', [conferenceId]);


// --- Functions for server.js API Routes ---
export const addConference = async ({ conference_id, digitalsamba_room_id }) => {
    const { lastID } = run('INSERT INTO conference (conference_id, digitalsamba_room_id) VALUES (?, ?)', [conference_id, digitalsamba_room_id]);
    return { id: lastID };
};

export const getAllConferences = async () => all('SELECT * FROM conference');

export const deleteConference = async (conference_id) => {
    const { changes } = run('DELETE FROM conference WHERE conference_id = ?', [conference_id]);
    return { changes };
};

export const addUser = async ({ conference_id, pin, display_name, external_id }) => {
    const { lastID } = run(
        'INSERT INTO users (conference_id, pin, display_name, external_id) VALUES (?, ?, ?, ?)',
        [conference_id, pin, display_name, external_id]
    );
    return { id: lastID };
};

export const getAllUsers = async () => all('SELECT * FROM users');

export const getUsersByConference = async (conference_id) =>
    all('SELECT * FROM users WHERE conference_id = ?', [conference_id]);

export const deleteUserByPin = async (pin) => {
    const { changes } = run('DELETE FROM users WHERE pin = ?', [pin]);
    return { changes };
};

export const updateUserExternalId = async (pin, external_id) => {
    const { changes } = run('UPDATE users SET external_id = ? WHERE pin = ?', [external_id, pin]);
    return { changes };
};

export const getAllConferencesWithUsers = async () => {
    const conferences = all('SELECT * FROM conference');
    return conferences.map((conference) => ({
        ...conference,
        users: all('SELECT * FROM users WHERE conference_id = ?', [conference.conference_id])
    }));
};

export const getAllLiveCallsWithUserInfo = async () => all(`
        SELECT lc.*, u.display_name, u.external_id
        FROM live_calls lc LEFT JOIN users u ON lc.pin = u.pin
        ORDER BY lc.conference_id, lc.joined_at DESC`);

export const getLiveCallsByConferenceWithUserInfo = async (conference_id) => all(`
        SELECT lc.*, u.display_name, u.external_id
        FROM live_calls lc LEFT JOIN users u ON lc.pin = u.pin
        WHERE lc.conference_id = ? ORDER BY lc.joined_at DESC`, [conference_id]);

export const getLiveCall = async (callId) => get('SELECT * FROM live_calls WHERE call_id = ?', [callId]);
