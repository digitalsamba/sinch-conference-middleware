import sqlite3 from 'sqlite3';
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
    db.run('CREATE TABLE conference (id INTEGER PRIMARY KEY AUTOINCREMENT, conference_id TEXT NOT NULL UNIQUE CHECK(length(conference_id) <= 64))');
    db.run('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, conference_id TEXT NOT NULL, pin INTEGER NOT NULL UNIQUE, token TEXT NOT NULL, FOREIGN KEY(conference_id) REFERENCES conference(conference_id))');
});

export default db;