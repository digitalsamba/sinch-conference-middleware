// The call flow. Sinch reports every call leg as ICE (incoming) -> PIE (PIN entered) -> DICE
// (hung up). We decide which conference a leg joins and keep Digital Samba's view of "who is
// on the phone" in step with the conference.
//
// Two kinds of leg meet in a Sinch conference:
//   - phone (PSTN) callers who dialled the Sinch number;
//   - the SIP leg: the Digital Samba room itself, dialling the same number. Its PIN entry has a
//     displayName starting with "SIP". Phone callers are only *in the DS room* while this leg is
//     in the conference, so that is when DS gets told about them.
import { svaml } from './sinch.js';

// State lives in memory only: a restart drops it, and calls already in a conference carry on
// (Sinch hosts the audio). Bounded, because a DICE can go missing and must not leak memory.
const MAX_TRACKED_CALLS = 2000;
const CALL_TTL_MS = 6 * 60 * 60 * 1000;

/** "+4930123456" -> "+49…3456": enough to tell calls apart in logs, not enough to identify anyone. */
export const maskNumber = (number) => (number ? `${String(number).slice(0, 3)}…${String(number).slice(-4)}` : 'unknown');

export const createCallFlow = ({ pins, rooms }, ds) => {
    const callers = new Map(); // callId -> { cli }, between ICE and a good PIN
    const live = new Map(); // callId -> call in a conference (see onPie)
    const inFlight = new Set();

    // Maps keep insertion order, so the oldest entries are first: drop expired ones and,
    // if still full, the oldest, before adding a new one.
    const remember = (map, callId, value) => {
        for (const [id, old] of map) {
            if (Date.now() - old.at < CALL_TTL_MS && map.size < MAX_TRACKED_CALLS) break;
            map.delete(id);
        }
        map.delete(callId);
        map.set(callId, { ...value, at: Date.now() });
    };
    const phonesIn = (conferenceId) => [...live.values()].filter((c) => c.conferenceId === conferenceId && !c.isSip);
    const sipLegIn = (conferenceId) => [...live.values()].some((c) => c.conferenceId === conferenceId && c.isSip);

    // DS is told in the background: Sinch waits only a few seconds for our SVAML, and a slow
    // or failing DS API must never stop a caller from reaching the conference.
    const notify = (what, send) => {
        const job = send()
            .then(() => console.log(`Digital Samba notified: ${what}`))
            .catch((err) => console.error(`Digital Samba notification (${what}) failed: ${err.message}`))
            .finally(() => inFlight.delete(job));
        inFlight.add(job);
    };

    const onIce = (event) => {
        // The caller's number (CLI) is only in the ICE; keep it until the PIN arrives.
        remember(callers, event.callid, { cli: event.cli });
        console.log(`ICE ${event.callid} from ${maskNumber(event.cli)}: asking for PIN`);
        return svaml.askForPin();
    };

    const onPie = (event) => {
        try {
            const digits = String(event.menuResult?.value ?? '').replace(/#$/, '');
            const entry = /^\d+$/.test(digits) ? pins.get(digits.replace(/^0+(?=\d)/, '')) : undefined;
            if (!entry) {
                // Say why without logging the digits: a timeout or 0 digits means the caller's
                // keypresses never reached Sinch (phone/carrier DTMF), not a wrong PIN.
                const { type = '?', inputMethod = '?' } = event.menuResult ?? {};
                console.log(`PIE ${event.callid}: PIN not recognised (${type}, ${inputMethod}, ${digits.length} digit(s)), asking again`);
                return svaml.askAgain();
            }
            const call = {
                callId: event.callid,
                conferenceId: entry.conferenceId,
                isSip: entry.displayName.startsWith('SIP'),
                cli: callers.get(event.callid)?.cli,
                displayName: entry.displayName,
                externalId: entry.externalId,
            };
            callers.delete(call.callId);
            remember(live, call.callId, call);
            console.log(`PIE ${call.callId}: joining conference ${call.conferenceId} as ${call.isSip ? 'the SIP leg' : 'a phone caller'}`);

            const roomId = rooms.get(call.conferenceId);
            if (roomId && call.isSip) {
                // The room just arrived: everyone already on the phone becomes visible in it.
                const phones = phonesIn(call.conferenceId);
                if (phones.length) notify(`${phones.length} joined room ${roomId}`, () => ds.joined(roomId, phones));
            } else if (roomId && sipLegIn(call.conferenceId)) {
                notify(`${call.callId} joined room ${roomId}`, () => ds.joined(roomId, [call]));
            }
            return svaml.joinConference(call.conferenceId);
        } catch (err) {
            console.error(`PIE ${event.callid} failed: ${err.message}`);
            return svaml.sorryHangUp();
        }
    };

    const onDice = (event) => {
        const call = live.get(event.callid);
        callers.delete(event.callid);
        live.delete(event.callid);
        console.log(`DICE ${event.callid}${call ? ` left conference ${call.conferenceId}` : ''}`);

        const roomId = call && rooms.get(call.conferenceId);
        if (roomId && call.isSip) {
            // The room left, so from its point of view every phone caller left with it.
            const ids = phonesIn(call.conferenceId).map((c) => c.callId);
            if (ids.length) notify(`${ids.length} left room ${roomId}`, () => ds.left(roomId, ids));
        } else if (roomId && sipLegIn(call.conferenceId)) {
            notify(`${call.callId} left room ${roomId}`, () => ds.left(roomId, [call.callId]));
        }
        return ''; // Sinch ignores the DICE response body.
    };

    return {
        onIce,
        onPie,
        onDice,
        findCall: (callId) => live.get(callId),
        /** Resolves once background DS notifications have finished (tests, graceful shutdown). */
        settled: () => Promise.allSettled([...inFlight]),
    };
};
