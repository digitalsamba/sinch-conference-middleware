import { validateSignature } from './validateSignature.js';
import { VoiceCallbackWebhooks } from '@sinch/sdk-core';
import { handleDisconnectedCallEvent, handleIncomingCallEvent } from './serverBusinessLogic.js';

export const voiceController = (app, sinchClientParameters) => {

  const voiceCallbackWebhooks = new VoiceCallbackWebhooks(sinchClientParameters);

  app.post('/VoiceEvent', validateSignature(voiceCallbackWebhooks), async (req, res) => {

    const event = voiceCallbackWebhooks.parseEvent(req.body);
    let response;
    switch (event.event) {
      case 'ice':
        response = handleIncomingCallEvent(event);
        break;
      case 'dice':
        response = handleDisconnectedCallEvent(event);
        break;
      default:
        res.status(400).json({ error: 'Unsupported event type' });
    }

    return res.status(200).json(response);
  });
};
