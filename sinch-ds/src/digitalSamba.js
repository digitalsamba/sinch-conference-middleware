// Digital Samba REST API: tell a room which phone participants are (no longer) with it, so
// they appear in the participant list and can be muted from the room.
// https://developer.digitalsamba.com/rest-api/
export const createDsApi = ({ apiUrl, developerKey, sendCallerNumber }) => {
    const post = async (roomId, change, payload) => {
        const res = await fetch(`${apiUrl}/api/v1/rooms/${encodeURIComponent(roomId)}/phone-participants/${change}`, {
            method: 'POST',
            headers: { authorization: `Bearer ${developerKey}`, 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`Digital Samba ${change} failed: HTTP ${res.status}`);
    };

    // Sinch reports numbers as bare digits; DS expects E.164 with a leading '+'.
    const e164 = (number) => (/^\d+$/.test(number) ? `+${number}` : number);

    return {
        // call_id is the Sinch call ID: DS sends it back in mute/unmute webhooks.
        joined: (roomId, calls) => post(roomId, 'joined', calls.map((call) => ({
            call_id: call.callId,
            name: call.displayName,
            ...(sendCallerNumber && call.cli && { caller_number: e164(call.cli) }),
            ...(call.externalId && { external_id: call.externalId }),
        }))),
        left: (roomId, callIds) => post(roomId, 'left', callIds),
    };
};
