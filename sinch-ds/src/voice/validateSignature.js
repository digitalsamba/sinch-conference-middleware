export const validateSignature = (voiceCallbackWebhooks) => {
  return (req, res, next) => {
    const isValid = voiceCallbackWebhooks.validateAuthenticationHeader(
      req.headers, req.rawBody, '/VoiceEvent', 'POST',
    );

    if (!isValid) {
      return res.status(401).send('Unauthorized');
    }

    next();
  };
};
