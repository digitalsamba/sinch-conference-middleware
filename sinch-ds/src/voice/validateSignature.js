export const validateSignature = (voiceCallbackWebhooks) => {
  return (req, res, next) => {
    console.log('Validating signature...');
    console.log('Headers:', req.headers);
    console.log('Raw Body:', req.rawBody);

    try {
      // Use an empty string if rawBody is undefined or null
      const body = req.rawBody || '';
      
      const isValid = voiceCallbackWebhooks.validateAuthenticationHeader(
        req.headers, body, '/VoiceEvent', 'POST',
      );

      if (!isValid) {
        console.log('Invalid signature');
        return res.status(401).send('Unauthorized');
      }

      console.log('Signature is valid');
      next();
    } catch (error) {
      console.error('Error validating signature:', error);
      return res.status(500).json({ error: 'Error validating signature' });
    }
  };
};
