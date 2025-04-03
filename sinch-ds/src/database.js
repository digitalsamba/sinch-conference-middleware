import sqlite3 from 'sqlite3';
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
    // Create conferences table with the digitalsamba_room_id field
    db.run('CREATE TABLE conference (id INTEGER PRIMARY KEY AUTOINCREMENT, conference_id TEXT NOT NULL UNIQUE CHECK(length(conference_id) <= 64), digitalsamba_room_id TEXT)');
    
    // Create users table with token renamed to display_name and made optional
    db.run('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, conference_id TEXT NOT NULL, pin INTEGER NOT NULL UNIQUE, display_name TEXT, FOREIGN KEY(conference_id) REFERENCES conference(conference_id))');
    
    // Create index on digitalsamba_room_id for faster lookups
    db.run('CREATE INDEX idx_conference_digitalsamba_room_id ON conference(digitalsamba_room_id)');
});

// Helper functions for database operations

// Conference operations
export const createConference = (conferenceData) => {
    return new Promise((resolve, reject) => {
        const { conference_id, digitalsamba_room_id = null } = conferenceData;
        
        db.run(
            'INSERT INTO conference (conference_id, digitalsamba_room_id) VALUES (?, ?)',
            [conference_id, digitalsamba_room_id],
            function(err) {
                if (err) return reject(err);
                resolve({ id: this.lastID, conference_id, digitalsamba_room_id });
            }
        );
    });
};

export const getConference = (conference_id) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM conference WHERE conference_id = ?', [conference_id], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

export const getConferenceByDigitalSambaRoomId = (digitalsamba_room_id) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM conference WHERE digitalsamba_room_id = ?', [digitalsamba_room_id], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

export const updateConferenceDigitalSambaRoomId = (conference_id, digitalsamba_room_id) => {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE conference SET digitalsamba_room_id = ? WHERE conference_id = ?',
            [digitalsamba_room_id, conference_id],
            function(err) {
                if (err) return reject(err);
                resolve({ changes: this.changes });
            }
        );
    });
};

// User operations
export const getUserByPin = (pin) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE pin = ?', [pin], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

export const createUser = (userData) => {
    return new Promise((resolve, reject) => {
        const { conference_id, pin, display_name = null } = userData;
        
        db.run(
            'INSERT INTO users (conference_id, pin, display_name) VALUES (?, ?, ?)',
            [conference_id, pin, display_name],
            function(err) {
                if (err) return reject(err);
                resolve({ id: this.lastID, pin, display_name });
            }
        );
    });
};

export const getAllUsers = () => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM users', (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
};

export const getUsersByConferenceId = (conference_id) => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM users WHERE conference_id = ?', [conference_id], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
};

export const updateUserDisplayName = (pin, display_name) => {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE users SET display_name = ? WHERE pin = ?',
            [display_name, pin],
            function(err) {
                if (err) return reject(err);
                resolve({ changes: this.changes });
            }
        );
    });
};

export default db;