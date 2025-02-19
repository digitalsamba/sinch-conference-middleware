import express from 'express';
import { captureRawBody } from './middleware/rawbody.js';
import { voiceController } from './voice/controller.js';
import * as dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = process.env.port || 3001;

/** @type {import('@sinch/sdk-core').SinchClientParameters} */
const sinchClientParameters = {
  applicationKey: process.env.SINCH_APPLICATION_KEY,
  applicationSecret: process.env.SINCH_APPLICATION_SECRET,
};

app.use(captureRawBody);

voiceController(app, sinchClientParameters);

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
