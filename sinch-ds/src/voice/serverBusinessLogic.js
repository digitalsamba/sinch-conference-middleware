import { Voice } from '@sinch/sdk-core';
import db from '../database.js';

/**
 * Handles an Incoming Call Event (ICE).
 * @param {Voice.IceRequest} iceRequest - The incoming ICE request object.
 * @return {Voice.IceResponse} The formatted ICE response to handle the incoming call.
 */
export const handleIncomingCallEvent = (iceRequest) => {
  console.log(`Handling 'ICE' event:\n${JSON.stringify(iceRequest, null, 2)}`);

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

  // Check if the PIN exists in the database
  const user = await new Promise((resolve, reject) => {
    db.get('SELECT conference_id FROM users WHERE pin = ?', [pin], (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });

  let response;
  
  if (user) {
    const conferenceId = user.conference_id;
    console.log(`PIN is valid. Connecting to conference: ${conferenceId}`);

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
};

/**
 * Handles a disconnected call event (DICE).
 * @param { Voice.DiceRequest } diceRequest - The incoming DICE request object.
 * @return {string} An empty string as a response to the disconnected call event.
 */
export const handleDisconnectedCallEvent = (diceRequest) => {
  console.log(`Handling 'DICE' event:\n${JSON.stringify(diceRequest, null, 2)}`);

  return '';
};
