import { Voice } from '@sinch/sdk-core';
import {
    getUserByPin,
    addLiveCall,
    getLiveCallWithUserInfo,
    getConference,
    removeLiveCall,
    getActivePstnCallsByConference,
    isSipUserActiveInConference // Import the new function
} from '../database.js';
import digitalSambaService from '../services/digitalSambaService.js';

/**
 * Handles an Incoming Call Event (ICE).
 * @param {Voice.IceRequest} iceRequest - The incoming ICE request object.
 * @return {Voice.IceResponse} The formatted ICE response to handle the incoming call.
 */
export const handleIncomingCallEvent = (iceRequest) => {
  console.log(`Handling 'ICE' event:\n${JSON.stringify(iceRequest, null, 2)}`);

  // Store the call information in application state for use in PIN input
  // We'll store both the callId and cli (caller number) to associate with the call later
  if (iceRequest && iceRequest.cli) {
    // Store in global context to access later
    if (!global.callInfo) {
      global.callInfo = {};
    }
    global.callInfo[iceRequest.callid] = {
      cli: iceRequest.cli
    };
    console.log(`Stored CLI ${iceRequest.cli} for call ID ${iceRequest.callid}`);
  }

  const response = new Voice.IceSvamletBuilder()
    .setAction(Voice.iceActionHelper.runMenu({
      barge: true,
      menus: [
        {
          id: 'main',
          mainPrompt: '#tts[Welcome to the conference. Please enter your PIN followed by hash sign.]',
          maxDigits: 6,
          timeoutMills: 30000,
          options: [
            {
              dtmf: '#',
              action: 'return'
            }
          ]
        }
      ]
    }))
    .build();
  
  console.log(`ICE Response:\n${JSON.stringify(response, null, 2)}`);
  return response;
};


/**
 * Handles the DTMF PIN input.
 * @param {Voice.PromptInputEvent} pieRequest - The PIE request object.
 * @return {Voice.PieResponse} The formatted PIE response to handle the PIN input.
 */
export const handlePinInput = async (pieRequest) => {
  console.log(`Handling 'PIE' event:\n${JSON.stringify(pieRequest, null, 2)}`);
  let pin = pieRequest.menuResult.value;
  pin = pin.replace(/#$/, '');
  console.log(`Processed PIN: ${pin}`);

  try {
    const user = await getUserByPin(parseInt(pin, 10));
    let response;

    if (user) {
      const conferenceId = user.conference_id;
      const callId = pieRequest.callid;
      let cli = global.callInfo && global.callInfo[callId] ? global.callInfo[callId].cli : null;
      const isSipUser = user.display_name?.startsWith('SIP');

      console.log(`PIN valid for user: ${user.display_name}, is_sip: ${isSipUser}. Connecting to conference: ${conferenceId}`);

      // Add the call to the live_calls table FIRST
      try {
        await addLiveCall({
          conference_id: conferenceId,
          call_id: callId,
          pin: parseInt(pin, 10),
          is_sip: isSipUser,
          cli: cli
        });
        console.log(`Call ${callId} added to live_calls table. is_sip: ${isSipUser}, CLI: ${cli}`);
      } catch (dbError) {
        console.error('Error adding call to live_calls table:', dbError);
        // Decide if we should proceed without DB record
      }

      // Check for Digital Samba room and handle notifications
      const conference = await getConference(conferenceId);
      if (conference && conference.digitalsamba_room_id) {
        const roomId = conference.digitalsamba_room_id;

        if (isSipUser) {
          // SIP User Joined: Notify DS about all *other* active PSTN participants
          console.log(`SIP user ${user.display_name} joined. Notifying DS about existing PSTN users in room ${roomId}.`);
          try {
            const pstnParticipants = await getActivePstnCallsByConference(conferenceId);
            console.log(`Found ${pstnParticipants.length} active PSTN participants to notify DS about.`);
            for (const pstnUser of pstnParticipants) {
              // Prepare data with API-specific keys
              const participantDataForApi = {
                call_id: pstnUser.call_id,
                caller_number: pstnUser.cli || 'Unknown',
                ...(pstnUser.display_name && { name: pstnUser.display_name }),
                ...(pstnUser.external_id && { external_id: pstnUser.external_id })
              };
              console.log(`  -> Notifying DS: Joined - ${JSON.stringify(participantDataForApi)}`);
              // Pass the original structure to the service function
              const participantDataInternal = {
                id: pstnUser.call_id,
                name: pstnUser.display_name || `Phone User (${pstnUser.cli || 'Unknown'})`,
                phoneNumber: pstnUser.cli || 'Unknown',
                ...(pstnUser.external_id && { externalId: pstnUser.external_id })
              };
              await digitalSambaService.notifyPhoneParticipantJoined(roomId, participantDataInternal);
            }
          } catch (dsError) {
            console.error('Error notifying Digital Samba about existing PSTN users:', dsError);
          }
        } else {
          // Regular PSTN User Joined: Notify DS *only if SIP user is already active*
          console.log(`PSTN user ${user.display_name} joined conference ${conferenceId}.`);
          try {
            const sipUserActive = await isSipUserActiveInConference(conferenceId);
            if (sipUserActive) {
              console.log(`SIP user is active. Notifying DS about joining PSTN user in room ${roomId}.`);
              // Prepare data with API-specific keys for logging consistency
              const participantDataForApi = {
                call_id: callId,
                caller_number: cli || 'Unknown',
                ...(user.display_name && { name: user.display_name }),
                ...(user.external_id && { external_id: user.external_id })
              };
              console.log(`  -> Notifying DS: Joined - ${JSON.stringify(participantDataForApi)}`);

              // Pass the original structure to the service function
              const participantDataInternal = {
                id: callId,
                name: user.display_name || `Phone User (${cli || 'Unknown'})`,
                phoneNumber: cli || 'Unknown',
                ...(user.external_id && { externalId: user.external_id })
              };
              await digitalSambaService.notifyPhoneParticipantJoined(roomId, participantDataInternal);
            } else {
              console.log(`SIP user is not active. Skipping DS notification for PSTN user ${user.display_name}.`);
            }
          } catch (error) {
            console.error('Error checking SIP status or notifying Digital Samba about joining PSTN user:', error);
          }
        }
      }

      // Build the response to connect the user to the conference (unchanged)
      response = new Voice.PieSvamletBuilder()
        .addInstruction(Voice.pieInstructionHelper.say('Thank you. We will now connect you to the conference.'))
        .setAction(Voice.pieActionHelper.connectConf({
          conferenceId: String(conferenceId),
          moh: 'music3'
        }))
        .build();

    } else {
       // ... (handle invalid PIN - unchanged) ...
    }

    console.log(`PIE Response:\n${JSON.stringify(response, null, 2)}`);
    return response;

  } catch (error) {
     // ... (handle general error - unchanged) ...
  }
};

/**
 * Handles a disconnected call event (DICE).
 * @param { Voice.DiceRequest } diceRequest - The incoming DICE request object.
 * @return {string} An empty string as a response to the disconnected call event.
 */
export const handleDisconnectedCallEvent = async (diceRequest) => {
  console.log(`Handling 'DICE' event:\n${JSON.stringify(diceRequest, null, 2)}`);
  const callId = diceRequest.callid;

  try {
    // Get call details *before* removing it
    const callDetails = await getLiveCallWithUserInfo(callId);

    if (callDetails) {
      const conferenceId = callDetails.conference_id;
      const isSipUser = callDetails.display_name?.startsWith('SIP');
      console.log(`Call ${callId} disconnected. User: ${callDetails.display_name}, is_sip: ${isSipUser}, Conference: ${conferenceId}`);

      // Check for Digital Samba room and handle notifications
      const conference = await getConference(conferenceId);
      if (conference && conference.digitalsamba_room_id) {
         const roomId = conference.digitalsamba_room_id;

        if (isSipUser) {
          // SIP User Left: Notify DS about all *other* active PSTN participants leaving
          console.log(`SIP user ${callDetails.display_name} left. Notifying DS that existing PSTN users left room ${roomId}.`);
           try {
            // Fetch PSTN users *before* removing the SIP user's call record
            const pstnParticipants = await getActivePstnCallsByConference(conferenceId);
            console.log(`Found ${pstnParticipants.length} active PSTN participants to notify DS about leaving.`);
            for (const pstnUser of pstnParticipants) {
                // Don't notify about the SIP user themselves leaving in this loop
                if (pstnUser.call_id !== callId) {
                    console.log(`  -> Notifying DS: Left - Call ID ${pstnUser.call_id}`);
                    await digitalSambaService.notifyPhoneParticipantLeft(roomId, pstnUser.call_id);
                }
            }
          } catch (dsError) {
            console.error('Error notifying Digital Samba about existing PSTN users leaving:', dsError);
          }
        } else {
          // Regular PSTN User Left: Notify DS *only if SIP user is still active*
          console.log(`PSTN user ${callDetails.display_name} left conference ${conferenceId}.`);
          try {
             // Check if SIP user is active *before* removing the PSTN user record
             const sipUserActive = await isSipUserActiveInConference(conferenceId);
             if (sipUserActive) {
                 console.log(`SIP user is active. Notifying DS about leaving PSTN user in room ${roomId}.`);
                 console.log(`  -> Notifying DS: Left - Call ID ${callId}`);
                 await digitalSambaService.notifyPhoneParticipantLeft(roomId, callId);
             } else {
                 console.log(`SIP user is not active. Skipping DS notification for leaving PSTN user ${callDetails.display_name}.`);
             }
          } catch (error) {
            console.error('Error checking SIP status or notifying Digital Samba about leaving PSTN user:', error);
          }
        }
      }

      // Remove the call from our database AFTER handling notifications
      try {
          const removeResult = await removeLiveCall(callId);
          console.log(`Call removal result from live_calls table:`, removeResult);
      } catch (dbError) {
          console.error(`Error removing call ${callId} from live_calls table:`, dbError);
      }

    } else {
      console.log(`Call ${callId} not found in live_calls table during DICE handling.`);
    }

    // Clean up global call info store (unchanged)
    if (global.callInfo && global.callInfo[callId]) {
      delete global.callInfo[callId];
      console.log(`Removed call info for call ID ${callId}`);
    }
  } catch (error) {
    console.error('Error handling disconnected call event:', error);
  }

  // DICE expects no response body
  return ''; 
};
