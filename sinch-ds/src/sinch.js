// Everything that speaks Sinch: checking that a callback really came from Sinch, the SVAML
// we answer callbacks with, and the Calling API used to mute/unmute a conference participant.
import { Voice, VoiceCallbackWebhooks } from '@sinch/sdk-core';

// Sinch signs x-timestamp, but the SDK does not check its age; without this window a
// captured callback could be replayed for ever.
export const MAX_CALLBACK_SKEW_MS = 15 * 60 * 1000;

/** Express middleware: 401 unless the request carries a valid, recent Sinch signature. */
export const verifySinchSignature = ({ applicationKey, applicationSecret }, now = Date.now) => {
    const webhooks = new VoiceCallbackWebhooks({ applicationKey, applicationSecret });
    return (req, res, next) => {
        // Sinch signs the exact bytes it sent, so this route keeps the body as raw text.
        const body = typeof req.body === 'string' ? req.body : '';
        let valid = false;
        try {
            valid = webhooks.validateAuthenticationHeader(req.headers, body, '/VoiceEvent', 'POST');
        } catch { /* malformed header: not valid */ }
        if (valid && /^application\s/i.test(req.headers.authorization || '')) {
            valid = Math.abs(now() - Date.parse(req.headers['x-timestamp'])) <= MAX_CALLBACK_SKEW_MS;
        }
        if (!valid) {
            console.warn('Rejected /VoiceEvent: missing/invalid signature or stale x-timestamp');
            return res.status(401).send('Unauthorized');
        }
        next();
    };
};

// The PIN prompt is a contract with callers already in the field, including test rigs that
// dial in and send "<pin>#" as DTMF: up to 6 digits, '#' ends input early, 30 s to type.
const pinMenu = (prompt) => ({
    barge: true,
    menus: [{
        id: 'main',
        mainPrompt: `#tts[${prompt}]`,
        maxDigits: 6,
        timeoutMills: 30000,
        options: [{ dtmf: '#', action: 'return' }],
    }],
});

export const svaml = {
    // ICE answer: play the prompt and collect digits; Sinch then sends a PIE with the result.
    askForPin: () => new Voice.IceSvamletBuilder()
        .setAction(Voice.iceActionHelper.runMenu(pinMenu('Welcome to the conference. Please enter your PIN followed by hash sign.')))
        .build(),
    // PIE answer for a wrong PIN: ask again rather than leave the caller in silence.
    askAgain: () => new Voice.PieSvamletBuilder()
        .setAction(Voice.pieActionHelper.runMenu(pinMenu('Unrecognised PIN. Please enter your PIN followed by hash sign.')))
        .build(),
    // PIE answer for a good PIN: Sinch creates the conference on first join, so no setup call is needed.
    joinConference: (conferenceId) => new Voice.PieSvamletBuilder()
        .addInstruction(Voice.pieInstructionHelper.say('Thank you. We will now connect you to the conference.'))
        .setAction(Voice.pieActionHelper.connectConf({ conferenceId: String(conferenceId), moh: 'music3' }))
        .build(),
    sorryHangUp: () => new Voice.PieSvamletBuilder()
        .addInstruction(Voice.pieInstructionHelper.say('Sorry, we encountered a system error. Please try again later.'))
        .setAction(Voice.pieActionHelper.hangup())
        .build(),
};

/** Sinch Calling API: mute/unmute one participant (call leg) in a conference. */
export const createSinchApi = ({ applicationKey, applicationSecret, apiUrl }) => {
    const authorization = 'Basic ' + Buffer.from(`${applicationKey}:${applicationSecret}`).toString('base64');
    const send = async (conferenceId, callId, command) => {
        const url = `${apiUrl}/calling/v1/conferences/id/${encodeURIComponent(conferenceId)}/${encodeURIComponent(callId)}`;
        const res = await fetch(url, {
            method: 'PATCH',
            headers: { authorization, 'content-type': 'application/json' },
            body: JSON.stringify({ command }),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`Sinch ${command} failed: HTTP ${res.status}`);
    };
    return {
        mute: (conferenceId, callId) => send(conferenceId, callId, 'mute'),
        unmute: (conferenceId, callId) => send(conferenceId, callId, 'unmute'),
    };
};
