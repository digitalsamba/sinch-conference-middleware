import express from 'express';
import { captureRawBody } from './middleware/rawbody.js';
import { voiceController } from './voice/controller.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import db from './database.js';
import { handlePinInput } from './voice/serverBusinessLogic.js';

dotenv.config();

const app = express();
const port = process.env.port || 3030;

/** @type {import('@sinch/sdk-core').SinchClientParameters} */
const sinchClientParameters = {
  applicationKey: process.env.SINCH_APPLICATION_KEY,
  applicationSecret: process.env.SINCH_APPLICATION_SECRET,
};

app.use(captureRawBody);

app.use((req, res, next) => {
  if (!req.rawBody) {
    bodyParser.json()(req, res, next);
  } else {
    next();
  }
});

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, '../public')));

voiceController(app, sinchClientParameters);

app.post('/api/conference', (req, res) => {
  const { conference_id } = req.body;
  db.run('INSERT INTO conference (conference_id) VALUES (?)', [conference_id], (err) => {
    if (err) {
      return res.status(500).send('Failed to save Conference ID.');
    }
    res.send('Conference ID saved successfully!');
  });
});

app.post('/api/user', (req, res) => {
  const { conference_id, pin, token } = req.body;
  if (isNaN(pin)) {
    return res.status(400).send('PIN must be numeric.');
  }
  db.run('INSERT INTO users (conference_id, pin, token) VALUES (?, ?, ?)', [conference_id, pin, token], (err) => {
    if (err) {
      if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(400).send('Failed to save user: the PIN has already been assigned to a user.');
      }
      return res.status(500).send('Failed to save user.');
    }
    res.send('User saved successfully!');
  });
});

app.get('/api/conferences', (req, res) => {
  db.all('SELECT conference_id FROM conference', [], (err, rows) => {
    if (err) {
      return res.status(500).send('Failed to fetch conferences.');
    }
    res.json(rows);
  });
});

app.get('/api/users', (req, res) => {
  const { conference_id } = req.query;
  let query = 'SELECT conference_id, pin, token FROM users';
  const params = [];
  if (conference_id) {
    query += ' WHERE conference_id = ?';
    params.push(conference_id);
  }
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).send('Failed to fetch users.');
    }
    res.json(rows);
  });
});

// Endpoint to fetch conferences along with their associated users
app.get('/api/conferences-and-users', (req, res) => {
  db.all('SELECT conference_id FROM conference', [], (err, conferences) => {
    if (err) {
      return res.status(500).send('Failed to fetch conferences.');
    }
    const conferenceIds = conferences.map(conference => conference.conference_id);
    db.all('SELECT conference_id, pin, token FROM users WHERE conference_id IN (' + conferenceIds.map(() => '?').join(',') + ')', conferenceIds, (err, users) => {
      if (err) {
        return res.status(500).send('Failed to fetch users.');
      }
      const result = conferences.map(conference => ({
        conference_id: conference.conference_id,
        users: users.filter(user => user.conference_id === conference.conference_id)
      }));
      res.json(result);
    });
  });
});

// Endpoint to delete a conference and related users
app.delete('/api/conference/:conference_id', (req, res) => {
  const { conference_id } = req.params;
  db.run('DELETE FROM users WHERE conference_id = ?', [conference_id], (err) => {
    if (err) {
      return res.status(500).send('Failed to delete users related to the conference.');
    }
    db.run('DELETE FROM conference WHERE conference_id = ?', [conference_id], (err) => {
      if (err) {
        return res.status(500).send('Failed to delete conference.');
      }
      res.send('Conference and related users deleted successfully!');
    });
  });
});

// Endpoint to remove a user from a conference
app.delete('/api/user', (req, res) => {
  const { conference_id, pin } = req.body;
  db.run('DELETE FROM users WHERE conference_id = ? AND pin = ?', [conference_id, pin], (err) => {
    if (err) {
      return res.status(500).send('Failed to delete user from conference.');
    }
    res.send('User removed from conference successfully!');
  });
});

// Endpoint to handle DTMF PIN input
app.post('/api/handlePin', async (req, res) => {
  try {
    const response = await handlePinInput(req.body);
    res.json(response);
  } catch (err) {
    res.status(500).send('Failed to handle PIN input.');
  }
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
