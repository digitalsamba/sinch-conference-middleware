// HTTP surface: exactly three routes. There is deliberately no admin API, UI or live log:
// configuration is a file, and anything that could list PINs or calls is an attack surface.
import crypto from 'node:crypto';
import express from 'express';
import { createCallFlow } from './callFlow.js';
import { createDsApi } from './digitalSamba.js';
import { createSinchApi, verifySinchSignature } from './sinch.js';

// Constant-time compare; hashing first means the secret's length does not leak either.
const safeEqual = (a, b) => crypto.timingSafeEqual(
    crypto.createHash('sha256').update(String(a)).digest(),
    crypto.createHash('sha256').update(String(b)).digest(),
);

// Lookup tables as Maps, so an event named e.g. "constructor" cannot reach Object.prototype.
const VOICE_EVENTS = ['ice', 'pie', 'dice'];
const DS_COMMANDS = new Map([['phone_participant_muted', 'mute'], ['phone_participant_unmuted', 'unmute']]);

export const createApp = (config, { ds = createDsApi(config.ds), sinch = createSinchApi(config.sinch) } = {}) => {
    const flow = createCallFlow(config, ds);
    const app = express();
    app.disable('x-powered-by');
    app.locals.flow = flow;

    app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

    // Sinch Voice callbacks. Configure https://<host>/VoiceEvent as the app's callback URL.
    app.post('/VoiceEvent',
        express.text({ type: () => true, limit: '64kb' }), // raw text: the signature covers the exact bytes
        verifySinchSignature(config.sinch),
        (req, res) => {
            let event;
            try { event = JSON.parse(req.body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
            if (!VOICE_EVENTS.includes(event?.event)) return res.status(400).json({ error: 'Unsupported event type' });
            const handler = { ice: flow.onIce, pie: flow.onPie, dice: flow.onDice }[event.event];
            res.json(handler(event));
        });

    // Digital Samba webhooks: a moderator muted/unmuted a phone participant in the room.
    // DS sends the shared secret as "Authorization: Bearer <secret>". Checked before parsing.
    const dsAuthorized = (req) => (config.ds.webhookSecret
        ? safeEqual(req.get('authorization') ?? '', `Bearer ${config.ds.webhookSecret}`)
        : config.insecureDev);
    app.post('/DigitalSambaListener',
        (req, res, next) => (dsAuthorized(req) ? next() : res.status(401).json({ error: 'Unauthorized' })),
        express.json({ limit: '64kb' }),
        async (req, res) => {
            const { eventType, callId } = req.body ?? {};
            const command = DS_COMMANDS.get(eventType);
            // Acknowledge events we do not act on, so DS does not retry them.
            if (!command) return res.json({ ignored: true });
            const call = flow.findCall(String(callId));
            if (!call) return res.status(404).json({ error: 'Call not found' });
            try {
                await sinch[command](call.conferenceId, call.callId);
            } catch (err) {
                console.error(`${command} ${call.callId} failed: ${err.message}`);
                return res.status(502).json({ error: `Could not ${command} participant` });
            }
            console.log(`${command}d ${call.callId} in conference ${call.conferenceId}`);
            res.json({ ok: true });
        });

    // Errors (e.g. oversized or malformed bodies): status only, never a stack trace or the body.
    app.use((err, req, res, _next) => {
        if (!err.expose) console.error(`${req.method} ${req.path}: ${err.message}`);
        res.status(err.status || 500).json({ error: err.expose ? err.message : 'Internal error' });
    });
    return app;
};
