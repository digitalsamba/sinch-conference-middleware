# Digital Samba Room <> Sinch Voice API Middleware Application Architecture

This document describes the architecture and flow of this application which integrates Sinch Voice API with Digital Samba video conferencing.

```mermaid
flowchart TB
    subgraph DigitalSambaSetup ["Digital Samba Room Setup"]
        DS1[Create Digital Samba Room] --> DS2[Configure Room Settings]
        DS2 --> DS3[Assign Telephone Number]
        DS3 --> DS4[Configure DTMF Sequence/PIN]
        DS4 --> DS5[Generate Room ID]
        DS5 --> DS6[Map to PSTN Conference]
    end
    
    subgraph ConferenceManagement ["Conference Management Flow"]
        CM1[User accesses UI] -->|Create/Manage Conference| CM2[UI sends requests to server]
        CM1 -->|API Endpoint| CM3[API request]
        CM2 --> CM4[Express server processes requests]
        CM3 --> CM4
        CM4 --> CM5[Store data in SQLite database]
        CM5 --> CM6{Action Required?}
        CM6 -->|Yes| CM7[Communicate with\nSinch Voice API]
        CM6 -->|No| CM8[Return response to user]
        CM7 --> CM8
    end

    subgraph CallHandling ["Call Handling Flow"]
        B1[Sinch Voice API sends webhook\nto /VoiceEvent endpoint] --> B2{Event Type?}
        B2 -->|ICE| B3[Process Incoming Call Event]
        B2 -->|PIE| B4[Process Prompt Input Event\nValidate PIN]
        B2 -->|DICE| B5[Process Disconnected Call Event]
        B3 --> B6[Update Call State in Database]
        B4 --> B6
        B5 --> B6
        B6 --> B7[Update UI with Active Calls]
    end

    subgraph ParticipantFlow ["Participant Join/Leave Flow"]
        C1[User enters PIN] --> C2{PIN Valid?}
        C2 -->|No| C3[Reject Call]
        C2 -->|Yes| C4[Add to live_calls table]
        C4 --> C5{Linked to\nDigital Samba Room?}
        C5 -->|No| C6[Connect to Conference Only]
        C5 -->|Yes| C7{User Type?}
        
        C7 -->|SIP User| C8[Digital Samba Room Connection]
        C7 -->|PSTN User| C9{SIP User Active?}
        
        C8 --> C10[Query all PSTN Participants]
        C10 --> C11[Notify Digital Samba about\neach PSTN participant]
        
        C9 -->|Yes| C12[Notify Digital Samba\nabout phone user joining]
        C9 -->|No| C13[No notification sent]
    end

    subgraph DisconnectFlow ["Disconnect Flow"]
        D1[User Disconnects\nDICE Event] --> D2[Retrieve User Details]
        D2 --> D3{User Type?}
        D3 -->|SIP User| D4[Notify Digital Samba\nabout all PSTN users leaving]
        D3 -->|PSTN User| D5{SIP still active?}
        D5 -->|Yes| D6[Notify Digital Samba\nabout PSTN user leaving]
        D5 -->|No| D7[No notification needed]
        D4 --> D8[Remove from live_calls table]
        D6 --> D8
        D7 --> D8
    end
    
    subgraph WebhookFlow ["Digital Samba Webhook Flow"]
        E1[Digital Samba sends webhook\nto /DigitalSambaListener] --> E2[Authenticate using webhook secret]
        E2 --> E3{Event Type?}
        E3 -->|Mute/Unmute| E4[Trigger corresponding\nSinch API call]
        E3 -->|Other Events| E5[Process accordingly]
        E4 --> E6[Update room state]
        E5 --> E6
    end
    
    subgraph Logging ["Real-time Logging"]
        L1[All application events\nand activities] --> L2[Log processing]
        L2 --> L3[Stream logs to UI\nvia WebSockets]
        L3 --> L4[Real-time monitoring\nand troubleshooting]
    end
    
    %% Connect the subgraphs
    DigitalSambaSetup --> ConferenceManagement
    DS6 --> CallHandling
    CM8 --> CallHandling
    B7 --> ParticipantFlow
    C11 --> WebhookFlow
    C12 --> WebhookFlow
    C13 --> DisconnectFlow
    E6 --> Logging
    
    %% Connect logging to all major components
    DigitalSambaSetup -.-> L1
    ConferenceManagement -.-> L1
    CallHandling -.-> L1
    ParticipantFlow -.-> L1
    DisconnectFlow -.-> L1
    WebhookFlow -.-> L1
```
Workflow Description
1. Digital Samba Room Setup

Purpose: Establishes the foundation for integrating web-based Digital Samba rooms with telephone-based PSTN conferences provided by the Sinch Voice API.

Process:

Create a Digital Samba room assigning a telephone number and a DTMF sequence which act as a PIN to join a specfic conference.
A unique Room ID is generated for identification within the system
The Digital Samba room is connected to a PSTN conference via a Sinch SIP trunk and APIs provided by Sinch and Digital Samba enabling integration between web and phone users

2. Conference Management Flow

Purpose: Provides interfaces for administrators to create and manage conferences and their users.
Process:

Administrators can access the system through either the UI or API endpoints
Administrators can create conferences, create users and thier mandatory PIN and associate these users with conferences.
Active PINs must be unique accross the platform as they are used to route users to specific conferences.
Conferences and PINs should be deleted after use.
The server processes these requests and stores conference configuration data in the applications SQLite database.

*NOTE* The conference context is something that exists only on the applications side. The application uses PINs to route users to specific conferences with the help our the Sinch Voice API. 

3. Call Handling Flow

Purpose: Processes incoming call events from the Sinch Voice API and maintains call state.

Process:

Sinch Voice API sends webhooks to the applications /VoiceEvent endpoint when call events occur
This endpoint is configured in your Sinch Dashboard
The application processes these events based on their type:

ICE (Incoming Call Event): Handles new calls entering the system
PIE (Prompt Input Event): Processes PIN input and validates against configured PINs
DICE (Disconnected Call Event): Manages call termination and cleanup

Call state information is stored in the application database
Valid PINs are routed to applications pre-configured conferences using the *ConnectConf* Sinch Voice Application Markup Language (SVAML) Action  
The applications Active calls UI is updated with active call information for monitoring purposes

4. Participant Join/Leave Flow

Purpose: Manages the integration between phone users and web users by tracking participants with the Digital Samba API.
Process:

When users dial in, they enter their PIN to access the conference
The system validates the PIN against configured values
Valid users are added to the live_calls table in the application database
The system determines if the call is linked to a Digital Samba room
The system differentiates between user types:

SIP User: Represents the Digital Samba room connection
PSTN User: Regular phone participants

When a SIP User joins:

The system queries for all existing PSTN participants already in the conference
For each PSTN participant, the system notifies Digital Samba that a phone user has joined
This ensures the web interface displays all current phone participants

When a PSTN User joins:

The system checks if a SIP user (Digital Samba room) is active
If active, Digital Samba is notified about the new phone user
If no SIP user is active, no notification is sent (as there's no web<>SIP audio session to update)

5. Disconnect Flow

Purpose: Handles users leaving conferences and ensures proper cleanup and notifications.
Process:

When a user disconnects, a DICE event is triggered
The system retrieves user details from the database before removing the record
The system handles the disconnect based on user type:

If a SIP user leaves: The system notifies Digital Samba about all PSTN users leaving (as web<>SIP audio is no longer connected)
If a PSTN user leaves: The system checks if a SIP user is still active

If a SIP user is active, Digital Samba is notified about the phone user leaving
If no SIP user is active, no notification is needed

Finally, the call record is removed from the live_calls table

6. Digital Samba Webhook Flow

Purpose: Processes events from Digital Samba to keep allow room moderators to control connected phone users
Process:

Digital Samba sends webhook events to the /DigitalSambaListener endpoint
The server authenticates these requests using the configured webhook secret
This webhook is configured in the Webhooks section of your Digital Samba Dashboard (or through an API call)
At this point, the system processes different event types:

Mute/Unmute events: Trigger corresponding Sinch API calls to mute/unmute phone participants

The room state is updated in the database to maintain consistency

7. Real-time Logging

Purpose: Provides comprehensive visibility into system operations for monitoring and troubleshooting.
Process:

All application events and activities across all components are captured
Logs are processed and formatted for readability and analysis
These logs are streamed to the UI in real-time via WebSockets
Administrators can monitor system activity and troubleshoot issues as they occur

Note: This logging system covers all components of the application, providing end-to-end visibility

**Integration Overview**
The application creates a bridge between Digital Samba web conferences and traditional phone conferences by:

Establishing Digital Samba rooms as the foundation
Providing management interfaces for conference configuration
Processing call events from the Sinch Voice API
Route users to appropiate conferences based on their PIN
Tracking phone participants in Digital Samba rooms
Processing Digital Samba in room events to control connected phone users via the Sinch API
Providing comprehensive real-time logging

