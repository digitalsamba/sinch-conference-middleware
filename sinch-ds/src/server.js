import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './database.js';
import { captureRawBody } from './middleware/rawbody.js';
import sinchService from './services/sinchService.js';

// Configure dotenv to load environment variables
dotenv.config();

// Import your voice controller and other modules
import { voiceController } from './voice/controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3030;

// Middleware
app.use(cors());

// Apply raw body middleware only to the webhook endpoint
// This middleware must be applied before any body-parser middleware
app.use('/VoiceEvent', captureRawBody);

// Apply JSON parsing middleware to all routes except webhook endpoint
app.use((req, res, next) => {
  if (req.path === '/VoiceEvent') {
    // For webhook endpoint, we'll parse the body manually in the handler
    return next();
  }
  express.json()(req, res, next);
});

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
  const { conference_id, pin, display_name, external_id } = req.body;
  
  db.run(
    'INSERT INTO users (conference_id, pin, display_name, external_id) VALUES (?, ?, ?, ?)',
    [conference_id, pin, display_name, external_id],
    function(err) {
      if (err) {
        console.error('Error creating user:', err);
        return res.status(500).json({ error: 'Failed to create user' });
      }
      res.status(201).json({ 
        id: this.lastID, 
        conference_id, 
        pin, 
        display_name,
        external_id
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

// Add new endpoint to update user external_id
app.patch('/api/user/:pin/external-id', (req, res) => {
  const { pin } = req.params;
  const { external_id } = req.body;
  
  db.run(
    'UPDATE users SET external_id = ? WHERE pin = ?',
    [external_id, pin],
    function(err) {
      if (err) {
        console.error('Error updating user external_id:', err);
        return res.status(500).json({ error: 'Failed to update user external_id' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ 
        message: 'User external_id updated successfully',
        pin,
        external_id
      });
    }
  );
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

// Get all live calls with user information - include external_id in the query
app.get('/api/live-calls', (req, res) => {
    db.all(
        `SELECT lc.id, lc.conference_id, lc.call_id, lc.start_time, lc.is_sip, lc.cli,
                u.display_name, u.external_id
         FROM live_calls lc 
         LEFT JOIN users u ON lc.pin = u.pin 
         ORDER BY lc.conference_id, lc.start_time DESC`,
        (err, rows) => {
            if (err) {
                console.error('Error fetching live calls:', err);
                return res.status(500).json({ error: 'Failed to fetch live calls' });
            }
            res.json(rows);
        }
    );
});

// Get live calls for a specific conference - include external_id in the query
app.get('/api/live-calls/:conference_id', (req, res) => {
    const conference_id = req.params.conference_id;
    
    db.all(
        `SELECT lc.id, lc.conference_id, lc.call_id, lc.start_time, lc.is_sip, lc.cli,
                u.display_name, u.external_id
         FROM live_calls lc 
         LEFT JOIN users u ON lc.pin = u.pin 
         WHERE lc.conference_id = ?
         ORDER BY lc.start_time DESC`,
        [conference_id],
        (err, rows) => {
            if (err) {
                console.error('Error fetching live calls for conference:', err);
                return res.status(500).json({ error: 'Failed to fetch live calls for conference' });
            }
            res.json(rows);
        }
    );
});

// Mute a call - Integrates with the Sinch API
app.post('/api/call/:call_id/mute', async (req, res) => {
    const call_id = req.params.call_id;
    
    try {
        // Get the call information including conference ID
        const livecall = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM live_calls WHERE call_id = ?', [call_id], (err, row) => {
                if (err) return reject(err);
                if (!row) return reject(new Error('Call not found'));
                resolve(row);
            });
        });
        
        if (!livecall) {
            return res.status(404).json({ error: 'Call not found' });
        }
        
        // Call the Sinch API service to mute the participant
        const result = await sinchService.muteParticipant(livecall.conference_id, call_id);
        
        if (!result.success) {
            return res.status(result.status || 500).json({
                error: 'Failed to mute participant',
                sinchError: result.error,
                endpoint: result.endpoint
            });
        }
        
        console.log(`Successfully muted call: ${call_id} in conference ${livecall.conference_id}`);
        res.json({ success: true, message: 'Call muted' });
    } catch (error) {
        console.error('Error muting call:', error);
        res.status(500).json({ error: 'Failed to mute call', message: error.message });
    }
});

// Unmute a call - Integrates with the Sinch API
app.post('/api/call/:call_id/unmute', async (req, res) => {
    const call_id = req.params.call_id;
    
    try {
        // Get the call information including conference ID
        const livecall = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM live_calls WHERE call_id = ?', [call_id], (err, row) => {
                if (err) return reject(err);
                if (!row) return reject(new Error('Call not found'));
                resolve(row);
            });
        });
        
        if (!livecall) {
            return res.status(404).json({ error: 'Call not found' });
        }
        
        // Call the Sinch API service to unmute the participant
        const result = await sinchService.unmuteParticipant(livecall.conference_id, call_id);
        
        if (!result.success) {
            return res.status(result.status || 500).json({
                error: 'Failed to unmute participant',
                sinchError: result.error,
                endpoint: result.endpoint
            });
        }
        
        console.log(`Successfully unmuted call: ${call_id} in conference ${livecall.conference_id}`);
        res.json({ success: true, message: 'Call unmuted' });
    } catch (error) {
        console.error('Error unmuting call:', error);
        res.status(500).json({ error: 'Failed to unmute call', message: error.message });
    }
});

// Kick a call - Integrates with the Sinch API to kick a participant from a conference
app.post('/api/call/:call_id/kick', async (req, res) => {
    const call_id = req.params.call_id;
    
    try {
        // First, get the call information including conference ID
        const livecall = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM live_calls WHERE call_id = ?', [call_id], (err, row) => {
                if (err) return reject(err);
                if (!row) return reject(new Error('Call not found'));
                resolve(row);
            });
        });
        
        if (!livecall) {
            return res.status(404).json({ error: 'Call not found' });
        }
        
        // Call the Sinch API service to kick the participant
        const result = await sinchService.kickParticipant(livecall.conference_id, call_id);
        
        if (!result.success) {
            return res.status(result.status || 500).json({
                error: 'Failed to kick participant from Sinch conference',
                sinchError: result.error,
                endpoint: result.endpoint
            });
        }
        
        // If Sinch API call was successful, remove the call from our database
        db.run('DELETE FROM live_calls WHERE call_id = ?', [call_id], function(err) {
            if (err) {
                console.error('Error removing call from database:', err);
                // Even if DB update fails, we return success since the kick was successful
            }
            
            console.log(`Successfully kicked call: ${call_id} from conference ${livecall.conference_id}`);
            res.json({ 
                success: true, 
                message: 'Call kicked from conference', 
                removed: this.changes > 0 
            });
        });
        
    } catch (error) {
        console.error('Error kicking call:', error);
        res.status(500).json({ error: 'Failed to kick call', message: error.message });
    }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
