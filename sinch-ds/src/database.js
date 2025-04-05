import sqlite3 from 'sqlite3';
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
    // Create conferences table with the digitalsamba_room_id field
    db.run('CREATE TABLE conference (id INTEGER PRIMARY KEY AUTOINCREMENT, conference_id TEXT NOT NULL UNIQUE CHECK(length(conference_id) <= 64), digitalsamba_room_id TEXT)');
    
    // Create users table with token renamed to display_name and made optional
    db.run('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, conference_id TEXT NOT NULL, pin INTEGER NOT NULL UNIQUE, display_name TEXT, FOREIGN KEY(conference_id) REFERENCES conference(conference_id))');
    
    // Create live_calls table to track active calls
    // Modified to store ISO string timestamp for better compatibility
    // Added cli field to store caller number
    db.run(`CREATE TABLE live_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conference_id TEXT NOT NULL,
        call_id TEXT NOT NULL UNIQUE,
        pin INTEGER,
        is_sip BOOLEAN DEFAULT 0,
        start_time TEXT,
        cli TEXT,
        FOREIGN KEY(conference_id) REFERENCES conference(conference_id),
        FOREIGN KEY(pin) REFERENCES users(pin)
    )`);
    
    // Create index on digitalsamba_room_id for faster lookups
    db.run('CREATE INDEX idx_conference_digitalsamba_room_id ON conference(digitalsamba_room_id)');
    
    // Create index on call_id for faster lookups
    db.run('CREATE INDEX idx_live_calls_call_id ON live_calls(call_id)');
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

// Live calls operations
export const addLiveCall = (callData) => {
    return new Promise((resolve, reject) => {
        const { 
            conference_id, 
            call_id, 
            pin = null,
            is_sip = false,
            cli = null
        } = callData;
        
        // Use ISO string format for timestamps to ensure consistency
        const now = new Date().toISOString();
        
        db.run(
            'INSERT INTO live_calls (conference_id, call_id, pin, is_sip, start_time, cli) VALUES (?, ?, ?, ?, ?, ?)',
            [conference_id, call_id, pin, is_sip ? 1 : 0, now, cli],
            function(err) {
                if (err) return reject(err);
                resolve({ 
                    id: this.lastID, 
                    conference_id, 
                    call_id, 
                    pin,
                    is_sip,
                    start_time: now,
                    cli
                });
            }
        );
    });
};

export const getLiveCall = (call_id) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM live_calls WHERE call_id = ?', [call_id], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

export const getLiveCallWithUserInfo = (call_id) => {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT lc.*, u.display_name 
             FROM live_calls lc 
             LEFT JOIN users u ON lc.pin = u.pin 
             WHERE lc.call_id = ?`, 
            [call_id], 
            (err, row) => {
                if (err) return reject(err);
                resolve(row);
            }
        );
    });
};

export const getLiveCallsByConference = (conference_id) => {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM live_calls WHERE conference_id = ?', [conference_id], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
};

export const getLiveCallsByConferenceWithUserInfo = (conference_id) => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT lc.*, u.display_name 
             FROM live_calls lc 
             LEFT JOIN users u ON lc.pin = u.pin 
             WHERE lc.conference_id = ?`, 
            [conference_id], 
            (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            }
        );
    });
};

export const countLiveCallsByConference = (conference_id) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM live_calls WHERE conference_id = ?', [conference_id], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.count : 0);
        });
    });
};

export const removeLiveCall = (call_id) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM live_calls WHERE call_id = ?', [call_id], function(err) {
            if (err) return reject(err);
            resolve({ deleted: this.changes > 0 });
        });
    });
};

export default db;