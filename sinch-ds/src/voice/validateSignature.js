// Sinch includes x-timestamp in the signed string but the SDK does not check it is
// recent, so a captured callback could be replayed indefinitely. Reject anything
// signed more than this far from our clock.
export const MAX_CALLBACK_SKEW_MS = 15 * 60 * 1000;

export const validateSignature = (voiceCallbackWebhooks, { now = () => Date.now() } = {}) => {
  return (req, res, next) => {
    try {
      // Use an empty string if rawBody is undefined or null
      const body = req.rawBody || '';

      const isValid = voiceCallbackWebhooks.validateAuthenticationHeader(
        req.headers, body, '/VoiceEvent', 'POST',
      );

      if (!isValid) {
        console.warn('Rejected /VoiceEvent callback: invalid signature');
        return res.status(401).send('Unauthorized');
      }

      if (/^application\s/i.test(req.headers.authorization || '')) {
        const signedAt = Date.parse(req.headers['x-timestamp']);
        if (Number.isNaN(signedAt) || Math.abs(now() - signedAt) > MAX_CALLBACK_SKEW_MS) {
          console.warn('Rejected /VoiceEvent callback: x-timestamp missing or outside the allowed window');
          return res.status(401).send('Unauthorized');
        }
      }

      next();
    } catch (error) {
      console.error('Error validating signature:', error);
      return res.status(500).json({ error: 'Error validating signature' });
    }
  };
};
