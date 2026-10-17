import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import './env.js';

import {
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
import { requireAdmin, resolveAdminAuth, safeEqual } from './middleware/auth.js';
import sinchService from './services/sinchService.js';
import { voiceController } from './voice/controller.js';
import * as valid from './validation.js';
import { sendClientError } from './validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_DS_WEBHOOK_SECRET = 'DigitalSambaListener';

// Paths that authenticate themselves (Sinch signature / DS bearer secret) or must stay open.
const PUBLIC_PATHS = new Set(['/VoiceEvent', '/DigitalSambaListener', '/healthz']);

/**
 * Builds the Express application. The database must already be initialised.
 * Options default to the environment so production just calls createApp().
 */
export const createApp = ({
    sinchApplicationKey = process.env.SINCH_APPLICATION_KEY,
    sinchApplicationSecret = process.env.SINCH_APPLICATION_SECRET,
    digitalSambaWebhookSecret = process.env.DIGITAL_SAMBA_WEBHOOK_SECRET || DEFAULT_DS_WEBHOOK_SECRET,
    adminAuth = resolveAdminAuth(),
    corsOrigin = process.env.CORS_ORIGIN,
} = {}) => {
    if (digitalSambaWebhookSecret === DEFAULT_DS_WEBHOOK_SECRET) {
        console.warn('DIGITAL_SAMBA_WEBHOOK_SECRET is unset or the published default; anyone can call /DigitalSambaListener. Set a random value.');
    }
    if (adminAuth.mode === 'locked') {
        console.warn('ADMIN_USERNAME/ADMIN_PASSWORD not set: web UI, /api/* and the log stream are disabled.');
    } else if (adminAuth.mode === 'open') {
        console.warn('ADMIN_AUTH_DISABLED=true: web UI, /api/* and the log stream are open to anyone who can reach this port.');
    }

    // --- Middleware for Digital Samba Webhook Authentication ---
    const verifyDigitalSambaAuth = (req, res, next) => {
        const expectedAuthHeader = `Bearer ${digitalSambaWebhookSecret}`;
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            console.warn('Digital Samba webhook received without Authorization header');
            return res.status(401).json({ error: 'Authorization header is required' });
        }

        if (!safeEqual(authHeader, expectedAuthHeader)) {
            console.warn('Digital Samba webhook received with invalid Authorization header');
            return res.status(403).json({ error: 'Invalid Authorization header' });
        }

        console.info('Digital Samba webhook authenticated successfully');
        next();
    };

    const app = express();

    app.disable('x-powered-by');

    // Liveness probe for Docker/monitoring; touches nothing.
    app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

    // CORS is opt-in: the bundled UI is same-origin and needs none.
    if (corsOrigin) {
        app.use(cors({ origin: corsOrigin.split(',').map((o) => o.trim()) }));
    }

    // Everything except the self-authenticating webhooks is admin-only.
    const adminGate = requireAdmin(adminAuth);
    app.use((req, res, next) => (PUBLIC_PATHS.has(req.path) ? next() : adminGate(req, res, next)));

    // /VoiceEvent needs the raw body for Sinch signature validation; everything else is JSON.
    const jsonParser = express.json();
    app.use((req, res, next) => {
        if (req.path === '/VoiceEvent') {
            captureRawBody(req, res, next);
        } else {
            jsonParser(req, res, next);
        }
    });

    // Serve static files AFTER body parsing middleware
    app.use(express.static(path.join(__dirname, '../public')));

    // --- Sinch Voice callbacks (ICE/PIE/DICE) ---
    voiceController(app, {
        applicationKey: sinchApplicationKey,
        applicationSecret: sinchApplicationSecret
    });

    // --- Digital Samba Webhook Listener ---
    app.post('/DigitalSambaListener', verifyDigitalSambaAuth, async (req, res) => {
        console.info('Received Digital Samba event:', JSON.stringify(req.body, null, 2));
    
        try {
            const event = req.body ?? {};
        
            // Handle events based on the actual Digital Samba event structure
            if (event && event.eventType && event.callId) {
                switch (event.eventType) {
                    case 'phone_participant_muted':
                        console.info(`Processing mute request for call ID: ${event.callId}`);
                        const livecallMute = await getLiveCall(event.callId);
                    
                        if (!livecallMute) {
                            console.warn(`Call ID ${event.callId} not found in live calls`);
                            return res.status(404).json({ error: 'Call not found' });
                        }
                    
                        const muteResult = await sinchService.muteParticipant(livecallMute.conference_id, event.callId);
                    
                        if (!muteResult.success) {
                            console.error(`Failed to mute call ${event.callId}:`, muteResult.error);
                            return res.status(muteResult.status || 500).json({
                                error: 'Failed to mute participant',
                                details: muteResult.error
                            });
                        }
                    
                        console.info(`Successfully muted call ${event.callId} in conference ${livecallMute.conference_id}`);
                        break;
                    
                    case 'phone_participant_unmuted':
                        console.info(`Processing unmute request for call ID: ${event.callId}`);
                        const livecallUnmute = await getLiveCall(event.callId);
                    
                        if (!livecallUnmute) {
                            console.warn(`Call ID ${event.callId} not found in live calls`);
                            return res.status(404).json({ error: 'Call not found' });
                        }
                    
                        const unmuteResult = await sinchService.unmuteParticipant(livecallUnmute.conference_id, event.callId);
                    
                        if (!unmuteResult.success) {
                            console.error(`Failed to unmute call ${event.callId}:`, unmuteResult.error);
                            return res.status(unmuteResult.status || 500).json({
                                error: 'Failed to unmute participant',
                                details: unmuteResult.error
                            });
                        }
                    
                        console.info(`Successfully unmuted call ${event.callId} in conference ${livecallUnmute.conference_id}`);
                        break;
                    
                    default:
                        console.info(`Received unhandled Digital Samba event type: ${event.eventType}`);
                }
            } else {
                console.warn('Received malformed Digital Samba event:', event);
            }
        
            // Acknowledge receipt of the event
            res.status(200).json({ message: 'Event received and processed' });
        } catch (error) {
            console.error('Error processing Digital Samba event:', error);
            res.status(500).json({ error: 'Internal server error', message: error.message });
        }
    });

    // --- API Routes ---

    // API routes for conferences
    app.post('/api/conference', async (req, res) => {
        try {
            const body = req.body ?? {};
            const conference_id = valid.conferenceId(body.conference_id);
            const digitalsamba_room_id = valid.roomId(body.digitalsamba_room_id);
            const result = await addConference({ conference_id, digitalsamba_room_id });
            res.status(201).json({
                id: result.id,
                conference_id,
                digitalsamba_room_id
            });
        } catch (err) {
            if (sendClientError(res, err, { conflict: 'Conference already exists' })) return;
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
        try {
            const body = req.body ?? {};
            const conference_id = valid.conferenceId(body.conference_id);
            const pin = valid.pin(body.pin);
            const display_name = valid.displayName(body.display_name);
            const external_id = valid.externalId(body.external_id);
            const result = await addUser({ conference_id, pin, display_name, external_id });
            res.status(201).json({ 
                id: result.id, 
                conference_id, 
                pin, 
                display_name,
                external_id
            });
        } catch (err) {
            if (sendClientError(res, err, { conflict: 'PIN already in use', missing: 'Conference not found' })) return;
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
        try {
            const pin = valid.pin((req.body ?? {}).pin);
            const result = await deleteUserByPin(pin);
             if (result.changes === 0) {
                 return res.status(404).json({ message: 'User not found' });
            }
            res.json({ message: 'User deleted successfully' });
        } catch (err) {
            if (sendClientError(res, err)) return;
            console.error('Error deleting user:', err);
            res.status(500).json({ error: 'Failed to delete user', message: err.message });
        }
    });

    // Update user external_id
    app.patch('/api/user/:pin/external-id', async (req, res) => {
        try {
            const pin = valid.pin(req.params.pin);
            const external_id = valid.externalId((req.body ?? {}).external_id) ?? null;
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
            if (sendClientError(res, err)) return;
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

    return app;
};
