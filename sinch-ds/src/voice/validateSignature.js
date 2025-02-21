export const validateSignature = (voiceCallbackWebhooks) => {
  return (req, res, next) => {
    console.log('Validating signature...');
    console.log('Headers:', req.headers);
    console.log('Raw Body:', req.rawBody);

    const isValid = voiceCallbackWebhooks.validateAuthenticationHeader(
      req.headers, req.rawBody, '/VoiceEvent', 'POST',
    );

    if (!isValid) {
      console.log('Invalid signature');
      return res.status(401).send('Unauthorized');
    }

    console.log('Signature is valid');
    next();
  };
};
