import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './database.js';

// Import your voice controller and other modules
import { voiceController } from './voice/controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3030;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize the voice controller
voiceController(app, {
  applicationKey: process.env.SINCH_APPLICATION_KEY,
  applicationSecret: process.env.SINCH_APPLICATION_SECRET
});

// API routes for conferences
app.post('/api/conference', (req, res) => {
  const { conference_id, digitalsamba_room_id } = req.body;
  
  db.run(
    'INSERT INTO conference (conference_id, digitalsamba_room_id) VALUES (?, ?)',
    [conference_id, digitalsamba_room_id],
    function(err) {
      if (err) {
        console.error('Error creating conference:', err);
        return res.status(500).json({ error: 'Failed to create conference' });
      }
      res.status(201).json({ 
        id: this.lastID, 
        conference_id, 
        digitalsamba_room_id 
      });
    }
  );
});

app.get('/api/conferences', (req, res) => {
  db.all('SELECT * FROM conference', (err, rows) => {
    if (err) {
      console.error('Error fetching conferences:', err);
      return res.status(500).json({ error: 'Failed to fetch conferences' });
    }
    res.json(rows);
  });
});

app.delete('/api/conference/:conference_id', (req, res) => {
  const conference_id = req.params.conference_id;
  
  db.run('DELETE FROM users WHERE conference_id = ?', [conference_id], function(err) {
    if (err) {
      console.error('Error deleting users for conference:', err);
      return res.status(500).json({ error: 'Failed to delete users for conference' });
    }
    
    db.run('DELETE FROM conference WHERE conference_id = ?', [conference_id], function(err) {
      if (err) {
        console.error('Error deleting conference:', err);
        return res.status(500).json({ error: 'Failed to delete conference' });
      }
      res.json({ message: 'Conference and associated users deleted successfully' });
    });
  });
});

// API routes for users
app.post('/api/user', (req, res) => {
  const { conference_id, pin, display_name } = req.body;
  
  db.run(
    'INSERT INTO users (conference_id, pin, display_name) VALUES (?, ?, ?)',
    [conference_id, pin, display_name],
    function(err) {
      if (err) {
        console.error('Error creating user:', err);
        return res.status(500).json({ error: 'Failed to create user' });
      }
      res.status(201).json({ 
        id: this.lastID, 
        conference_id, 
        pin, 
        display_name 
      });
    }
  );
});

app.get('/api/users', (req, res) => {
  const { conference_id } = req.query;
  
  if (conference_id) {
    db.all('SELECT * FROM users WHERE conference_id = ?', [conference_id], (err, rows) => {
      if (err) {
        console.error('Error fetching users for conference:', err);
        return res.status(500).json({ error: 'Failed to fetch users' });
      }
      res.json(rows);
    });
  } else {
    db.all('SELECT * FROM users', (err, rows) => {
      if (err) {
        console.error('Error fetching users:', err);
        return res.status(500).json({ error: 'Failed to fetch users' });
      }
      res.json(rows);
    });
  }
});

app.delete('/api/user', (req, res) => {
  const { pin } = req.body;
  
  db.run('DELETE FROM users WHERE pin = ?', [pin], function(err) {
    if (err) {
      console.error('Error deleting user:', err);
      return res.status(500).json({ error: 'Failed to delete user' });
    }
    res.json({ message: 'User deleted successfully' });
  });
});

// Special endpoint to get conferences with their associated users
app.get('/api/conferences-and-users', (req, res) => {
  db.all('SELECT * FROM conference', (err, conferences) => {
    if (err) {
      console.error('Error fetching conferences:', err);
      return res.status(500).json({ error: 'Failed to fetch conferences and users' });
    }
    
    const promises = conferences.map(conference => {
      return new Promise((resolve, reject) => {
        db.all(
          'SELECT * FROM users WHERE conference_id = ?', 
          [conference.conference_id], 
          (err, users) => {
            if (err) {
              reject(err);
            } else {
              resolve({
                ...conference,
                users: users
              });
            }
          }
        );
      });
    });
    
    Promise.all(promises)
      .then(results => {
        res.json(results);
      })
      .catch(error => {
        console.error('Error fetching users for conferences:', error);
        res.status(500).json({ error: 'Failed to fetch conferences and users' });
      });
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
