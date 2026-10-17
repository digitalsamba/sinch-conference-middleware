import express from 'express';

// Sinch signs the exact bytes it sends, so /VoiceEvent needs the untouched body.
// express.text() with a catch-all type keeps it as a string on req.body; we copy it
// to req.rawBody (the name the signature validator and controller already use).
const textParser = express.text({ type: () => true, limit: '1mb' });

export const captureRawBody = (req, res, next) => {
  // Skip if the request has no body type or if it has already been processed
  if (!req.headers['content-type'] || req.rawBody !== undefined) {
    return next();
  }

  textParser(req, res, (err) => {
    if (err) {
      console.error('Error capturing raw body:', err.message);
      return next(err);
    }
    req.rawBody = typeof req.body === 'string' ? req.body : undefined;
    req.body = undefined;
    next();
  });
};
