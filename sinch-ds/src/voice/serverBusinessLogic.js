import { Voice } from '@sinch/sdk-core';
import db from '../database.js';

/**
 * Handles an Incoming Call Event (ICE).
 * @param {Voice.IceRequest} iceRequest - The incoming ICE request object.
 * @return {Voice.IceResponse} The formatted ICE response to handle the incoming call.
 */
export const handleIncomingCallEvent = (iceRequest) => {
  console.log(`Handling 'ICE' event:\n${JSON.stringify(iceRequest, null, 2)}`);

  return new Voice.IceSvamletBuilder()
    .setAction({
      name: 'runMenu',
      barge: true,
      menus: [
        {
          id: 'main',
          mainPrompt: '#tts[Welcome to the conference. Please enter your PIN followed by pound sign.]',
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
    })
    .build();
};

/**
 * Handles the DTMF PIN input.
 * @param {Voice.PromptInputEvent} pieRequest - The PIE request object.
 * @return {Voice.IceResponse} The formatted ICE response to handle the PIE input.
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

  if (user) {
    const conferenceId = user.conference_id;
    console.log(`PIN is valid. Connecting to conference: ${conferenceId}`);

    return new Voice.IceSvamletBuilder()
      .addInstruction({
        name: 'say',
        text: 'Thank you. We will now connect you to the conference.'
      })
      .setAction({
        name: 'connectConf',
        conferenceId: String(conferenceId), // Ensure conferenceId is passed as a string
        moh: 'music3'
      })
      .build();
  } else {
    const instruction = 'Invalid PIN. Please try again.';

    return new Voice.IceSvamletBuilder()
      .setAction({
        name: 'runMenu',
        barge: true,
        menus: [
          {
            id: 'main',
            mainPrompt: '#tts[Invalid PIN. Please enter your PIN followed by pound sign.]',
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
      })
      .build();
  }
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
