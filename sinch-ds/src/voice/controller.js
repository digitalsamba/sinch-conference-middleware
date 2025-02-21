import pkg from '@sinch/sdk-core';
const { VoiceCallbackWebhooks } = pkg;
import { handleDisconnectedCallEvent, handleIncomingCallEvent, handleAnsweredCallEvent, handlePinInput } from './serverBusinessLogic.js';
import { validateSignature } from './validateSignature.js';

export const voiceController = (app, sinchClientParameters) => {

  const voiceCallbackWebhooks = new VoiceCallbackWebhooks(sinchClientParameters);

  app.post('/VoiceEvent', validateSignature(voiceCallbackWebhooks), async (req, res) => {

    const event = voiceCallbackWebhooks.parseEvent(req.body);
    let response;
    switch (event.event) {
      case 'ice':
        response = handleIncomingCallEvent(event);
        break;
      case 'ace':
        response = handleAnsweredCallEvent(event);
        break;
      case 'dice':
        response = handleDisconnectedCallEvent(event);
        break;
      case 'pie':
        response = handlePinInput(event);
        break;
      default:
        return res.status(400).json({ error: 'Unsupported event type' });
    }

    return res.status(200).json(response);
  });
};
