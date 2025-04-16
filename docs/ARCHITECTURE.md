# Digital Samba <> Sinch Conference Middleware Architecture

This document describes the architecture and flow of the Sinch Conference Middleware application, which integrates Sinch Voice API with Digital Samba video conferencing.

# Digital Samba & PSTN Integration Application

## Application Flow Diagram

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
