import pkg from '@sinch/sdk-core';
const { VoiceCallbackWebhooks } = pkg;
import { handleDisconnectedCallEvent, handleIncomingCallEvent, handlePinInput } from './serverBusinessLogic.js';
import { validateSignature } from './validateSignature.js';

export const voiceController = (app, sinchClientParameters) => {

  const voiceCallbackWebhooks = new VoiceCallbackWebhooks(sinchClientParameters);

  app.post('/VoiceEvent', validateSignature(voiceCallbackWebhooks), async (req, res) => {
    // Parse the raw body as JSON if it exists
    let parsedBody;
    if (req.rawBody) {
      try {
        parsedBody = JSON.parse(req.rawBody);
      } catch (e) {
        console.error('Error parsing raw body as JSON:', e);
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }

    // Use the parsed body or the existing req.body (if any)
    const requestBody = parsedBody || req.body || {};
    
    const event = voiceCallbackWebhooks.parseEvent(requestBody);
    let response;
    try {
      switch (event.event) {
        case 'ice':
          response = handleIncomingCallEvent(event);
          break;
        case 'pie':
          response = await handlePinInput(event); // Added await here
          break;
        case 'dice':
          response = handleDisconnectedCallEvent(event);
          break;
        default:
          return res.status(400).json({ error: 'Unsupported event type' });
      }
      
      return res.status(200).json(response);
    } 
    catch (error)
    {
      console.error('Error handling event:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
};
