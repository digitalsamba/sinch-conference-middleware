import { Voice } from '@sinch/sdk-core';
import db, { getUserByPin, addLiveCall, getLiveCallWithUserInfo, getConference } from '../database.js';
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
  console.log(`Received PIN: ${pin}`);

  // Strip trailing # from PIN if it exists
  pin = pin.replace(/#$/, '');
  console.log(`Processed PIN: ${pin}`);

  try {
    // Use the imported getUserByPin function to check PIN
    const user = await getUserByPin(parseInt(pin, 10));

    let response;
    
    if (user) {
      const conferenceId = user.conference_id;
      console.log(`PIN is valid. Connecting to conference: ${conferenceId}`);

      // Get CLI from global context if available
      const callId = pieRequest.callid;
      let cli = null;

      if (global.callInfo && global.callInfo[callId]) {
        cli = global.callInfo[callId].cli;
        console.log(`Using stored CLI ${cli} for call ID ${callId}`);
      }

      // Add the call to the live_calls table
      try {
        await addLiveCall({
          conference_id: conferenceId,
          call_id: callId,
          pin: parseInt(pin, 10), // Store the PIN to link with user
          is_sip: false, // Assuming this is a regular phone call, not SIP
          cli: cli // Add the CLI information
        });
        
        console.log(`Call ${callId} added to live_calls table with CLI ${cli}`);
        
        // Check if this conference has a Digital Samba room ID
        const conference = await getConference(conferenceId);
        
        // If the conference has a Digital Samba room ID, notify Digital Samba about the participant joining
        if (conference && conference.digitalsamba_room_id) {
          try {
            // Format the participant data for Digital Samba
            const participantData = {
              id: callId,
              name: user.display_name || `Phone User (${cli || 'Unknown'})`,
              phoneNumber: cli || 'Unknown'
            };
            
            // Add external_id if it exists
            if (user.external_id) {
              participantData.externalId = user.external_id;
              console.log(`Including external_id ${user.external_id} for participant`);
            }
            
            console.log(`Notifying Digital Samba about participant joining room ${conference.digitalsamba_room_id}:`, participantData);
            
            const notificationResult = await digitalSambaService.notifyPhoneParticipantJoined(
              conference.digitalsamba_room_id, 
              participantData
            );
            
            if (notificationResult.success) {
              console.log('Successfully notified Digital Samba of participant joining');
            } else {
              console.error('Failed to notify Digital Samba:', notificationResult.error);
            }
          } catch (dsError) {
            console.error('Error notifying Digital Samba about participant joining:', dsError);
            // Continue with the call even if there's a notification error
          }
        }
      } catch (dbError) {
        console.error('Error adding call to live_calls table:', dbError);
        // Continue with the call even if there's a database error
      }

      response = new Voice.PieSvamletBuilder()
        .addInstruction(Voice.pieInstructionHelper.say('Thank you. We will now connect you to the conference.'))
        .setAction(Voice.pieActionHelper.connectConf({
          conferenceId: String(conferenceId),
          moh: 'music3'
        }))
        .build();
    } 
    else {
      response = new Voice.PieSvamletBuilder()
      .setAction(Voice.pieActionHelper.runMenu({
        barge: true,
        menus: [
          {
            id: 'main',
            mainPrompt: '#tts[Unrecognised PIN. Please enter your PIN followed by hash sign.]',
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
    }
    
    console.log(`PIE Response:\n${JSON.stringify(response, null, 2)}`);
    return response;
  } catch (error) {
    console.error('Error handling PIN input:', error);
    
    // Return an error message to the caller
    const errorResponse = new Voice.PieSvamletBuilder()
      .addInstruction(Voice.pieInstructionHelper.say('Sorry, we encountered a system error. Please try again later.'))
      .setAction(Voice.pieActionHelper.hangup())
      .build();
      
    return errorResponse;
  }
};

/**
 * Handles a disconnected call event (DICE).
 * @param { Voice.DiceRequest } diceRequest - The incoming DICE request object.
 * @return {string} An empty string as a response to the disconnected call event.
 */
export const handleDisconnectedCallEvent = (diceRequest) => {
  console.log(`Handling 'DICE' event:\n${JSON.stringify(diceRequest, null, 2)}`);

  // Remove the call from the live_calls table when it disconnects
  try {
    const callId = diceRequest.callid;
    console.log(`Removing call ${callId} from live_calls table`);
    
    // Using an IIFE to handle the async operation
    (async () => {
      try {
        // Get call information before removing it
        const { getLiveCallWithUserInfo, getConference, removeLiveCall } = await import('../database.js');
        
        // Get call details including the conference ID
        const callDetails = await getLiveCallWithUserInfo(callId);
        
        if (callDetails) {
          // Remove the call from our database
          const result = await removeLiveCall(callId);
          console.log(`Call removed from live_calls table:`, result);
          
          // Check if this conference has a Digital Samba room ID
          const conference = await getConference(callDetails.conference_id);
          
          // If the conference has a Digital Samba room ID, notify Digital Samba about the participant leaving
          if (conference && conference.digitalsamba_room_id) {
            try {
              // Import the Digital Samba service
              const { default: dsService } = await import('../services/digitalSambaService.js');
              
              console.log(`Notifying Digital Samba about participant leaving room ${conference.digitalsamba_room_id} with call ID: ${callId}`);
              
              // Call the updated service with just the call ID
              const notificationResult = await dsService.notifyPhoneParticipantLeft(
                conference.digitalsamba_room_id, 
                callId
              );
              
              if (notificationResult.success) {
                console.log('Successfully notified Digital Samba of participant leaving');
              } else {
                console.error('Failed to notify Digital Samba:', notificationResult.error);
              }
            } catch (dsError) {
              console.error('Error notifying Digital Samba about participant leaving:', dsError);
            }
          }
        }

        // Clean up our call info store
        if (global.callInfo && global.callInfo[callId]) {
          delete global.callInfo[callId];
          console.log(`Removed call info for call ID ${callId}`);
        }
      } catch (err) {
        console.error('Error processing disconnected call:', err);
      }
    })();
  } catch (error) {
    console.error('Error handling disconnected call event:', error);
  }

  return '';
};
