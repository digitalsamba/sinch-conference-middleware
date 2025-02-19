export const captureRawBody = (req, res, next) => {
  let data = '';

  req.on('data', (chunk) => {
    data += chunk;
  });

  req.on('end', () => {
    req.rawBody = data;
    try {
      req.body = JSON.parse(data); // Parse the body as JSON
    } catch (err) {
      // If the JSON parsing fails, skip it (for cases where the body isn't JSON)
      req.body = {};
    }
    next();
  });

  req.on('error', (err) => {
    next(err);
  });
};
