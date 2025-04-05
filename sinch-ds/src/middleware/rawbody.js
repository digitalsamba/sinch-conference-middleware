import getRawBody from 'raw-body';
import contentType from 'content-type';

export const captureRawBody = (req, res, next) => {
  // Skip if the request has no body or if it has already been processed
  if (!req.headers['content-type'] || req.rawBody) {
    return next();
  }

  getRawBody(req, {
    length: req.headers['content-length'],
    limit: '1mb',
    encoding: contentType.parse(req.headers['content-type']).parameters.charset || 'utf-8'
  })
    .then((buffer) => {
      req.rawBody = buffer.toString();
      
      // Don't try to parse the body here, we'll let Express do that
      next();
    })
    .catch((err) => {
      console.error('Error capturing raw body:', err);
      next(err);
    });
};