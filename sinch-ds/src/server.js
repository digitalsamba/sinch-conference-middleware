import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import http from 'http'; // Import http module
import { WebSocketServer } from 'ws'; // Import WebSocketServer

import {
    initializeDatabase,
    // Functions needed for API routes
    addConference,
    getAllConferences,
    deleteConference,
    addUser,
    getAllUsers,
    getUsersByConference,
    deleteUserByPin,
    updateUserExternalId,
    getAllConferencesWithUsers,
    getAllLiveCallsWithUserInfo,
    getLiveCallsByConferenceWithUserInfo,
    getLiveCall
} from './database.js';
import { captureRawBody } from './middleware/rawbody.js';
import sinchService from './services/sinchService.js';

dotenv.config();

import { voiceController } from './voice/controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app); // Create HTTP server from Express app
const PORT = process.env.PORT || 3030;
// const WS_PORT = process.env.WS_PORT || 3031; // Removed separate WS_PORT

// --- WebSocket Server Setup ---
// Attach WebSocket server to the existing HTTP server
const wss = new WebSocketServer({ server });
const clients = new Set(); // Keep track of connected clients
const logBuffer = []; // Buffer to store recent logs
const MAX_LOG_BUFFER = 100; // Max number of log lines to buffer

// Function to broadcast messages to all connected clients
function broadcast(message) {
    clients.forEach(client => {
        if (client.readyState === client.OPEN) { // Use client.OPEN constant
            client.send(message);
        }
    });
}

// Function to add log to buffer and broadcast
function logAndBroadcast(level, ...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // Add to buffer (and trim if necessary)
    logBuffer.push(logEntry);
    if (logBuffer.length > MAX_LOG_BUFFER) {
        logBuffer.shift(); // Remove the oldest log entry
    }

    // Broadcast to WebSocket clients
    broadcast(logEntry);

    // Also log to the original console method
    originalConsole[level](...args);
}

// Store original console methods
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
};

// Override console methods
console.log = (...args) => logAndBroadcast('log', ...args);
console.warn = (...args) => logAndBroadcast('warn', ...args);
console.error = (...args) => logAndBroadcast('error', ...args);
console.info = (...args) => logAndBroadcast('info', ...args);
console.debug = (...args) => logAndBroadcast('debug', ...args);


wss.on('connection', (ws, req) => { // req is available here if needed
    const clientIp = req.socket.remoteAddress; // Example: Get client IP
    console.info(`WebSocket client connected from ${clientIp}`); // Use overridden console.info
    clients.add(ws);

    // Send buffered logs to the newly connected client
    ws.send(JSON.stringify({ type: 'buffer', data: logBuffer }));

    ws.on('message', (message) => {
        // Handle messages from clients if needed (e.g., commands)
        console.info(`Received WebSocket message from ${clientIp}: ${message}`); // Use overridden console.info
    });

    ws.on('close', () => {
        console.info(`WebSocket client disconnected: ${clientIp}`); // Use overridden console.info
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error from ${clientIp}:`, error); // Use overridden console.error
        clients.delete(ws); // Remove client on error as well
    });
});

// --- Database Initialization --- 
initializeDatabase().then(() => {
    console.log("Database initialized successfully.");

    // Middleware
    app.use(cors());

    // Conditionally apply body parsing middleware
    app.use((req, res, next) => {
        // Use startsWith to handle potential query parameters on the webhook URL
        if (req.path === '/VoiceEvent') {
            // For /VoiceEvent, use captureRawBody
            captureRawBody(req, res, next);
        } else {
            // For all other routes, use express.json()
            express.json()(req, res, next);
        }
    });

    // Serve static files AFTER body parsing middleware
    app.use(express.static(path.join(__dirname, '../public')));

    // Initialize the voice controller (ensure it uses named imports if needed)
    voiceController(app, {
        applicationKey: process.env.SINCH_APPLICATION_KEY,
        applicationSecret: process.env.SINCH_APPLICATION_SECRET
    });

    // --- API Routes (Should now work with imported functions) ---

    // API routes for conferences
    app.post('/api/conference', async (req, res) => {
        const { conference_id, digitalsamba_room_id } = req.body;
        try {
            const result = await addConference({ conference_id, digitalsamba_room_id }); 
            res.status(201).json({ 
                id: result.id, // Assuming addConference returns the inserted ID
                conference_id, 
                digitalsamba_room_id 
            });
        } catch (err) {
            console.error('Error creating conference:', err);
            res.status(500).json({ error: 'Failed to create conference', message: err.message });
        }
    });

    app.get('/api/conferences', async (req, res) => {
        try {
            const rows = await getAllConferences(); 
            res.json(rows);
        } catch (err) {
            console.error('Error fetching conferences:', err);
            res.status(500).json({ error: 'Failed to fetch conferences', message: err.message });
        }
    });

    app.delete('/api/conference/:conference_id', async (req, res) => {
        const conference_id = req.params.conference_id;
        try {
            const result = await deleteConference(conference_id); 
            if (result.changes === 0) {
                 return res.status(404).json({ message: 'Conference not found' });
            }
            res.json({ message: 'Conference and associated users deleted successfully' });
        } catch (err) {
            console.error('Error deleting conference:', err);
            res.status(500).json({ error: 'Failed to delete conference', message: err.message });
        }
    });

    // API routes for users
    app.post('/api/user', async (req, res) => {
        const { conference_id, pin, display_name, external_id } = req.body;
        try {
            const result = await addUser({ conference_id, pin, display_name, external_id });
            res.status(201).json({ 
                id: result.id, 
                conference_id, 
                pin, 
                display_name,
                external_id
            });
        } catch (err) {
            console.error('Error creating user:', err);
            res.status(500).json({ error: 'Failed to create user', message: err.message });
        }
    });

    app.get('/api/users', async (req, res) => {
        const { conference_id } = req.query;
        try {
            let rows;
            if (conference_id) {
                rows = await getUsersByConference(conference_id);
            } else {
                rows = await getAllUsers();
            }
            res.json(rows);
        } catch (err) {
            console.error('Error fetching users:', err);
            res.status(500).json({ error: 'Failed to fetch users', message: err.message });
        }
    });

    app.delete('/api/user', async (req, res) => {
        const { pin } = req.body;
        try {
            const result = await deleteUserByPin(pin);
             if (result.changes === 0) {
                 return res.status(404).json({ message: 'User not found' });
            }
            res.json({ message: 'User deleted successfully' });
        } catch (err) {
            console.error('Error deleting user:', err);
            res.status(500).json({ error: 'Failed to delete user', message: err.message });
        }
    });

    // Update user external_id
    app.patch('/api/user/:pin/external-id', async (req, res) => {
        const { pin } = req.params;
        const { external_id } = req.body;
        try {
            const result = await updateUserExternalId(pin, external_id);
            if (result.changes === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json({ 
                message: 'User external_id updated successfully',
                pin,
                external_id
            });
        } catch (err) {
            console.error('Error updating user external_id:', err);
            res.status(500).json({ error: 'Failed to update user external_id', message: err.message });
        }
    });

    // Get conferences with their associated users
    app.get('/api/conferences-and-users', async (req, res) => {
        try {
            const results = await getAllConferencesWithUsers();
            res.json(results);
        } catch (error) {
            console.error('Error fetching conferences and users:', error);
            res.status(500).json({ error: 'Failed to fetch conferences and users', message: error.message });
        }
    });

    // Get all live calls with user information
    app.get('/api/live-calls', async (req, res) => {
        try {
            const rows = await getAllLiveCallsWithUserInfo();
            res.json(rows);
        } catch (err) {
            console.error('Error fetching live calls:', err);
            res.status(500).json({ error: 'Failed to fetch live calls', message: err.message });
        }
    });

    // Get live calls for a specific conference
    app.get('/api/live-calls/:conference_id', async (req, res) => {
        const conference_id = req.params.conference_id;
        try {
            const rows = await getLiveCallsByConferenceWithUserInfo(conference_id);
            res.json(rows);
        } catch (err) {
            console.error('Error fetching live calls for conference:', err);
            res.status(500).json({ error: 'Failed to fetch live calls for conference', message: err.message });
        }
    });

    // Mute a call
    app.post('/api/call/:call_id/mute', async (req, res) => {
        const call_id = req.params.call_id;
        try {
            const livecall = await getLiveCall(call_id);
            if (!livecall) {
                return res.status(404).json({ error: 'Call not found' });
            }
            
            const result = await sinchService.muteParticipant(livecall.conference_id, call_id);
            
            if (!result.success) {
                return res.status(result.status || 500).json({
                    error: 'Failed to mute participant',
                    sinchError: result.error,
                    endpoint: result.endpoint
                });
            }
            
            console.log(`Successfully muted call: ${call_id} in conference ${livecall.conference_id}`);
            res.json({ success: true, message: 'Call muted' });
        } catch (error) {
            console.error('Error muting call:', error);
            res.status(500).json({ error: 'Failed to mute call', message: error.message });
        }
    });

    // Unmute a call
    app.post('/api/call/:call_id/unmute', async (req, res) => {
        const call_id = req.params.call_id;
        try {
            const livecall = await getLiveCall(call_id);
            if (!livecall) {
                return res.status(404).json({ error: 'Call not found' });
            }
            
            const result = await sinchService.unmuteParticipant(livecall.conference_id, call_id);
            
            if (!result.success) {
                return res.status(result.status || 500).json({
                    error: 'Failed to unmute participant',
                    sinchError: result.error,
                    endpoint: result.endpoint
                });
            }
            
            console.log(`Successfully unmuted call: ${call_id} in conference ${livecall.conference_id}`);
            res.json({ success: true, message: 'Call unmuted' });
        } catch (error) {
            console.error('Error unmuting call:', error);
            res.status(500).json({ error: 'Failed to unmute call', message: error.message });
        }
    });

    // Kick a participant
    app.post('/api/call/:call_id/kick', async (req, res) => {
        const call_id = req.params.call_id;
        try {
            const livecall = await getLiveCall(call_id);
            if (!livecall) {
                return res.status(404).json({ error: 'Call not found' });
            }
            
            const result = await sinchService.kickParticipant(livecall.conference_id, call_id);
            
            if (!result.success) {
                return res.status(result.status || 500).json({
                    error: 'Failed to kick participant',
                    sinchError: result.error,
                    endpoint: result.endpoint
                });
            }
            
            console.log(`Successfully kicked call: ${call_id} from conference ${livecall.conference_id}`);
            res.json({ success: true, message: 'Participant kicked' });
        } catch (error) {
            console.error('Error kicking participant:', error);
            res.status(500).json({ error: 'Failed to kick participant', message: error.message });
        }
    });

    // Start the HTTP server (using the 'server' instance)
    server.listen(PORT, () => { // Use server.listen instead of app.listen
        console.log(`HTTP Server listening on port ${PORT}`); // Use overridden console.log
    });

}).catch(err => {
    console.error("Failed to initialize database:", err); // Use overridden console.error
    process.exit(1); // Exit if DB initialization fails
});
