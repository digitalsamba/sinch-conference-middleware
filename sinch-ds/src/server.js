import http from 'http';
import './env.js';

import { initializeDatabase, closeDatabase } from './database.js';
import { createApp } from './app.js';
import { installLogBroadcast, attachLogWebSocket } from './logStream.js';
import { resolveAdminAuth, checkAdminRequest } from './middleware/auth.js';

const PORT = process.env.PORT || 3030;

// Mirror console output to the UI's live log view (WebSocket on the same port).
installLogBroadcast();

try {
    await initializeDatabase();
    console.log('Database initialized successfully.');
} catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
}

const adminAuth = resolveAdminAuth();
const app = createApp({ adminAuth });
const server = http.createServer(app);
// The log stream carries caller numbers and call IDs: same credentials as the UI.
const wss = attachLogWebSocket(server, {
    verifyClient: ({ req }) => checkAdminRequest(adminAuth, req.headers.authorization) === 'ok',
});

server.listen(PORT, () => {
    console.log(`HTTP Server listening on port ${PORT}`);
});

// Docker sends SIGTERM on stop; without a handler Node (as PID 1) ignores it and is
// SIGKILLed 10 s later. Close cleanly so SQLite is not interrupted mid-write.
const shutdown = (signal) => {
    console.log(`${signal} received, shutting down.`);
    wss.clients.forEach((client) => client.terminate());
    server.close(() => {
        closeDatabase();
        process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
