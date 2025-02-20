import getRawBody from 'raw-body';
import contentType from 'content-type';

export function captureRawBody(req, res, next) {
  if (!req.headers['content-type']) {
    console.error('Missing Content-Type header');
    return next();
  }

  console.log('Headers:', req.headers);

  getRawBody(req, {
    length: req.headers['content-length'],
    limit: '1mb',
    encoding: contentType.parse(req).parameters?.charset || 'utf-8',
  }, (err, string) => {
    if (err) {
      console.error('Error processing raw body:', err);
      return next(err);
    }
    req.rawBody = string;
    console.log('Raw Body Captured:', req.rawBody);
    next();
  });
}