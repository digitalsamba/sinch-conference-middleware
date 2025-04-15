import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';

dotenv.config();

const verboseSqlite3 = sqlite3.verbose();
let db;

// Use named export directly
export const initializeDatabase = async () => {
    try {
        db = await open({
            filename: process.env.DATABASE_PATH || './conference_data.db',
            driver: verboseSqlite3.Database
        });

        console.log('Connected to the SQLite database.');

        await db.exec('BEGIN TRANSACTION');
        await db.exec('PRAGMA foreign_keys = ON;');

        // Create tables if they don't exist
        await db.exec(`CREATE TABLE IF NOT EXISTS conference (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            conference_id TEXT NOT NULL UNIQUE CHECK(length(conference_id) <= 64), 
            digitalsamba_room_id TEXT,
            ds_pstn_notified BOOLEAN DEFAULT 0 
        )`);
        await db.exec(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            pin INTEGER NOT NULL UNIQUE, 
            conference_id TEXT NOT NULL, 
            display_name TEXT, 
            external_id TEXT, 
            FOREIGN KEY(conference_id) REFERENCES conference(conference_id) ON DELETE CASCADE
        )`); // Added ON DELETE CASCADE
        await db.exec(`CREATE TABLE IF NOT EXISTS live_calls (
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
        )`); // Added ON DELETE CASCADE/SET NULL

        // Create indexes
        await db.exec('CREATE INDEX IF NOT EXISTS idx_live_calls_conference_id ON live_calls (conference_id)');
        await db.exec('CREATE INDEX IF NOT EXISTS idx_live_calls_notified_ds ON live_calls (notified_ds)');

        await db.exec('COMMIT');
        console.log('Database schema verified/created successfully.');

    } catch (err) {
        console.error('Error initializing database:', err.message);
        if (db) {
            try {
                await db.exec('ROLLBACK');
            } catch (rollbackErr) {
                console.error('Error rolling back transaction:', rollbackErr.message);
            }
        }
        throw err;
    }
};


// --- Conference Functions ---
export const getConference = async (conference_id) => {
    if (!db) throw new Error("Database not initialized");
    return db.get('SELECT *, ds_pstn_notified FROM conference WHERE conference_id = ?', [conference_id]);
};

export const markConferenceDsNotified = async (conferenceId) => {
    if (!db) throw new Error("Database not initialized");
    const query = 'UPDATE conference SET ds_pstn_notified = true WHERE conference_id = ?';
    const result = await db.run(query, [conferenceId]);
    return { changes: result.changes };
};


// --- User Functions ---
export const getUserByPin = async (pin) => {
    if (!db) throw new Error("Database not initialized");
    return db.get('SELECT * FROM users WHERE pin = ?', [pin]);
};


// --- Live Call Functions ---
export const addLiveCall = async ({ conference_id, call_id, pin, is_sip, cli }) => {
    if (!db) throw new Error("Database not initialized");
    const query = 'INSERT INTO live_calls (conference_id, call_id, pin, is_sip, cli) VALUES (?, ?, ?, ?, ?)';
    const result = await db.run(query, [conference_id, call_id, pin, is_sip, cli]);
    return { id: result.lastID };
};

export const getLiveCallWithUserInfo = async (callId) => {
    if (!db) throw new Error("Database not initialized");
    const query = `
        SELECT lc.*, u.display_name, u.external_id 
        FROM live_calls lc
        LEFT JOIN users u ON lc.pin = u.pin
        WHERE lc.call_id = ?;
    `;
    return db.get(query, [callId]);
};

export const removeLiveCall = async (callId) => {
    if (!db) throw new Error("Database not initialized");
    const result = await db.run('DELETE FROM live_calls WHERE call_id = ?', [callId]);
    return { changes: result.changes };
};

export const getPendingPstnParticipants = async (conferenceId) => {
    if (!db) throw new Error("Database not initialized");
    const query = `
        SELECT lc.call_id, lc.cli, u.display_name, u.external_id 
        FROM live_calls lc
        JOIN users u ON lc.pin = u.pin
        WHERE lc.conference_id = ? AND lc.is_sip = 0 AND lc.notified_ds = 0;
    `;
    const rows = await db.all(query, [conferenceId]);
    return rows.map(row => ({ call_id: row.call_id, caller_number: row.cli, name: row.display_name, external_id: row.external_id }));
};

export const markParticipantsAsNotified = async (callIds) => {
    if (!db) throw new Error("Database not initialized");
    if (!callIds || callIds.length === 0) return { changes: 0 };
    const placeholders = callIds.map(() => '?').join(',');
    const query = `UPDATE live_calls SET notified_ds = true WHERE call_id IN (${placeholders})`;
    const result = await db.run(query, callIds);
    return { changes: result.changes };
};

/**
 * Retrieves all active PSTN (non-SIP) calls for a specific conference, including user details.
 * Used to inform Digital Samba when a SIP user joins/leaves.
 * @param {string} conferenceId - The ID of the conference.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of active PSTN participant objects.
 */
export const getActivePstnCallsByConference = async (conferenceId) => {
    if (!db) throw new Error("Database not initialized");
    const query = `
        SELECT lc.call_id, lc.cli, u.display_name, u.external_id, lc.pin
        FROM live_calls lc
        LEFT JOIN users u ON lc.pin = u.pin
        WHERE lc.conference_id = ? AND lc.is_sip = 0;
    `;
    return db.all(query, [conferenceId]);
};

/**
 * Checks if a designated SIP user (is_sip = 1) is currently active in the specified conference.
 * Used to determine if notifications for PSTN users should be sent to Digital Samba.
 * @param {string} conferenceId - The ID of the conference.
 * @returns {Promise<boolean>} A promise that resolves to true if a SIP user is active, false otherwise.
 */
export const isSipUserActiveInConference = async (conferenceId) => {
    if (!db) throw new Error("Database not initialized");
    const query = `SELECT 1 FROM live_calls WHERE conference_id = ? AND is_sip = 1 LIMIT 1`;
    const result = await db.get(query, [conferenceId]);
    return !!result; // Return true if a row is found, false otherwise
};


// --- Functions for server.js API Routes ---
export const addConference = async ({ conference_id, digitalsamba_room_id }) => {
    if (!db) throw new Error("Database not initialized");
    const query = 'INSERT INTO conference (conference_id, digitalsamba_room_id) VALUES (?, ?)';
    const result = await db.run(query, [conference_id, digitalsamba_room_id]);
    return { id: result.lastID };
};

export const getAllConferences = async () => {
    if (!db) throw new Error("Database not initialized");
    return db.all('SELECT * FROM conference');
};

export const deleteConference = async (conference_id) => {
    if (!db) throw new Error("Database not initialized");
    // Assumes ON DELETE CASCADE is set for users and live_calls tables
    const result = await db.run('DELETE FROM conference WHERE conference_id = ?', [conference_id]);
    return { changes: result.changes };
};

export const addUser = async ({ conference_id, pin, display_name, external_id }) => {
    if (!db) throw new Error("Database not initialized");
    const query = 'INSERT INTO users (conference_id, pin, display_name, external_id) VALUES (?, ?, ?, ?)';
    const result = await db.run(query, [conference_id, pin, display_name, external_id]);
    return { id: result.lastID };
};

export const getAllUsers = async () => {
    if (!db) throw new Error("Database not initialized");
    return db.all('SELECT * FROM users');
};

export const getUsersByConference = async (conference_id) => {
    if (!db) throw new Error("Database not initialized");
    return db.all('SELECT * FROM users WHERE conference_id = ?', [conference_id]);
};

export const deleteUserByPin = async (pin) => {
    if (!db) throw new Error("Database not initialized");
    const result = await db.run('DELETE FROM users WHERE pin = ?', [pin]);
    return { changes: result.changes };
};

export const updateUserExternalId = async (pin, external_id) => {
    if (!db) throw new Error("Database not initialized");
    const query = 'UPDATE users SET external_id = ? WHERE pin = ?';
    const result = await db.run(query, [external_id, pin]);
    return { changes: result.changes };
};

export const getAllConferencesWithUsers = async () => {
    if (!db) throw new Error("Database not initialized");
    const conferences = await db.all('SELECT * FROM conference');
    const results = await Promise.all(conferences.map(async (conference) => {
        const users = await db.all('SELECT * FROM users WHERE conference_id = ?', [conference.conference_id]);
        return { ...conference, users: users };
    }));
    return results;
};

export const getAllLiveCallsWithUserInfo = async () => {
    if (!db) throw new Error("Database not initialized");
    const query = `
        SELECT lc.*, u.display_name, u.external_id 
        FROM live_calls lc LEFT JOIN users u ON lc.pin = u.pin 
        ORDER BY lc.conference_id, lc.joined_at DESC`;
    return db.all(query);
};

export const getLiveCallsByConferenceWithUserInfo = async (conference_id) => {
    if (!db) throw new Error("Database not initialized");
    const query = `
        SELECT lc.*, u.display_name, u.external_id 
        FROM live_calls lc LEFT JOIN users u ON lc.pin = u.pin 
        WHERE lc.conference_id = ? ORDER BY lc.joined_at DESC`;
    return db.all(query, [conference_id]);
};

export const getLiveCall = async (callId) => {
    if (!db) throw new Error("Database not initialized");
    return db.get('SELECT * FROM live_calls WHERE call_id = ?', [callId]);
};