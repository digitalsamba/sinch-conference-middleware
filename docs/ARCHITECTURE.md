# Sinch Conference Middleware Architecture

This document describes the architecture and flow of the Sinch Conference Middleware application, which integrates Sinch Voice API with Digital Samba video conferencing.

## System Flow Diagram

```
+----------------------+     HTTP Requests     +---------------------------+
|                      |<--------------------- |                           |
|     Web Browser      |                       |      Express Server       |
|    (Public UI)       |---------------------> |   (Running on port 3030)  |
|                      |     HTTP Responses    |                           |
+----------+-----------+                       +-----------+---------------+
           ^                                               |
           |                                               |
           |                                               v
           |                                   +-----------+---------------+
           |                WebSocket          |                           |
           +-------------------------------    |   WebSocket Server       |
                 (Log streaming)               | (On same port as Express) |
                                               |                           |
                                               +-----------+---------------+
                                                           |
                  +------------------------------------+   |   +--------------------------------+
                  |                                    |   |   |                                |
                  v                                    v   v   v                                |
        +---------+---------+            +-------------+---+------------+            +---------+--------+
        |                   |            |                              |            |                  |
        |  SQLite Database  |<---------->|   Application Business Logic |<---------->| External Services|
        | conference_data.db|            |                              |            |                  |
        |                   |            +-------------+----------------+            +---------+--------+
        +-------------------+                          |                                      |
               ^   |                                   |                                      |
               |   |                                   v                                      v
               |   |                       +----------+------------+             +-----------+-----------+
               |   |                       |                       |             |                       |
               |   |                       |  Webhook Listeners    |             |  Sinch Voice API      |
               |   |                       |                       |             |  - Mute/Unmute        |
               |   |                       +----------+------------+             |  - Kick               |
               |   |                                  ^                          |  - Conference control |
               |   |                                  |                          |                       |
               |   |                                  |                          +-----------^-----------+
               |   |                                  |                                      |
               |   |                       +----------+------------+             +-----------+-----------+
               |   |                       |                       |             |                       |
               |   |                       | External Applications |------------>| Digital Samba         |
               |   |                       | (Sinch & Digital     |   Webhook   | - Video conferencing  |
               |   |                       |  Samba)              |   Events    | - Room management     |
               |   |                       |                       |             |                       |
               |   |                       +-----------------------+             +-----------^-----------+
               |   |                                                                         |
               |   +-------------------------------------------------------------------------+
               |                      Notification Flow                                      |
               +-------------------------------------------------------------------------------
```

## Application Flow Description

### 1. User Interface Flow
- Users interact with the web UI running in their browser
- The UI communicates with the Express server via HTTP requests
- Real-time server logs are streamed to the UI via WebSockets

### 2. Conference Management Flow
- UI sends requests to create/manage conferences and users
- Express server processes these requests and stores data in SQLite
- When needed, the server communicates with Sinch Voice API

### 3. Call Handling Flow
- Sinch Voice API sends webhooks to `/VoiceEvent` endpoint
- Server processes these events (ICE, ACE, DICE) to track active calls
- Call state is stored in the database
- UI displays active calls and allows mute/unmute operations

### 4. Digital Samba Integration Flow
- Digital Samba sends events to `/DigitalSambaListener` endpoint
- Server authenticates these requests using the webhook secret
- Events for mute/unmute trigger corresponding Sinch API calls
- Server maps Digital Samba room IDs to Sinch conference IDs

### 5. Participant Join/Leave Notification Flow
- When a user joins a Sinch conference via phone:
  - User enters their PIN
  - System validates PIN against the database
  - If valid, the user is added to the `live_calls` table
  - System checks if this conference is linked to a Digital Samba room
  - If linked, the system determines if this is a SIP user (video bridge) or PSTN user (phone)
  
- **SIP User Join flow**:
  - When a SIP (video bridge) user joins the conference:
    - System queries database for all existing PSTN participants in this conference
    - For each PSTN participant, system notifies Digital Samba that a phone user has joined
    - This ensures Digital Samba knows about all phone users already in the call

- **PSTN User Join flow**:
  - When a regular phone user joins:
    - System checks if a SIP user (video bridge) is active in the conference
    - If a SIP user is active, system notifies Digital Samba about the phone user joining
    - If no SIP user is active, no notification is sent (as there's no video session to notify)

- **User Leave flow**:
  - When any user disconnects from the conference (DICE event):
    - System retrieves user details before removing from database
    - If it's a SIP user leaving, notifies Digital Samba about all PSTN users leaving
    - If it's a PSTN user leaving (and a SIP user is still active), notifies Digital Samba
    - Finally removes the call record from the `live_calls` table

### 6. Data Flow
- Conference and user data is persisted in SQLite
- Active call information is updated in real-time
- UI refreshes call data periodically
