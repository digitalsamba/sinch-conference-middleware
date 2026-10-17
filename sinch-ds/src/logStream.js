import { WebSocketServer } from 'ws';

const MAX_LOG_BUFFER = 100; // Max number of log lines kept for newly connected clients
const logBuffer = [];
const clients = new Set();
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
};

const broadcast = (message) => {
    clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
            client.send(message);
        }
    });
};

const logAndBroadcast = (level, ...args) => {
    const timestamp = new Date().toISOString();
    const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    logBuffer.push(logEntry);
    if (logBuffer.length > MAX_LOG_BUFFER) {
        logBuffer.shift();
    }

    broadcast(logEntry);
    originalConsole[level](...args);
};

/** Overrides console.* so every log line is also buffered and streamed to UI clients. */
export const installLogBroadcast = () => {
    for (const level of Object.keys(originalConsole)) {
        console[level] = (...args) => logAndBroadcast(level, ...args);
    }
};

/** Attaches the log-streaming WebSocket server to an existing HTTP server. */
export const attachLogWebSocket = (server, options = {}) => {
    const wss = new WebSocketServer({ server, ...options });

    wss.on('connection', (ws, req) => {
        const clientIp = req.socket.remoteAddress;
        console.info(`WebSocket client connected from ${clientIp}`);
        clients.add(ws);

        // Send buffered logs to the newly connected client
        ws.send(JSON.stringify({ type: 'buffer', data: logBuffer }));

        ws.on('close', () => {
            console.info(`WebSocket client disconnected: ${clientIp}`);
            clients.delete(ws);
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error from ${clientIp}:`, error);
            clients.delete(ws);
        });
    });

    return wss;
};
