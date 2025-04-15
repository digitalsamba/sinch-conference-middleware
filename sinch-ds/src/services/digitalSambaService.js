/**
 * Digital Samba API Service
 * Handles all interactions with the Digital Samba API
 */
import dotenv from 'dotenv';

dotenv.config();

// Base URL for Digital Samba API from environment variables
const DS_BASE_URL = process.env.DIGITAL_SAMBA_API_URL || 'https://dev-api.monza.digitalsamba.com';
const DS_API_KEY = process.env.DIGITAL_SAMBA_DEVELOPER_KEY;

/**
 * Creates authorization header for Digital Samba API requests
 * @returns {string} The authorization header value
 */
const getAuthHeader = () => {
  if (!DS_API_KEY) {
    throw new Error('Missing Digital Samba Developer Key');
  }
  
  // Using Bearer token authentication as per documentation
  return `Bearer ${DS_API_KEY}`;
};

/**
 * Notify Digital Samba when phone participants join a room
 * @param {string} roomId - The Digital Samba room ID
 * @param {object} participant - Information about the participant(s)
 * @param {string} participant.id - Call ID of the participant
 * @param {string} [participant.name] - Optional name of the participant
 * @param {string} participant.phoneNumber - Phone number of the participant
 * @param {string} [participant.externalId] - Optional external ID for the participant
 * @returns {Promise<Object>} - Response from the Digital Samba API
 */
export const notifyPhoneParticipantJoined = async (roomId, participant) => {
  try {
    const endpoint = `/api/v1/rooms/${roomId}/phone-participants/joined`;
    const url = `${DS_BASE_URL}${endpoint}`;
    
    console.log(`Notifying Digital Samba that phone participant joined room: ${roomId}`);
    console.log(`Using endpoint: ${url}`);
    
    // Format the participant data according to API requirements
    // The API expects an array of participants with call_id, caller_number, and optional name and external_id
    const formattedParticipant = {
      call_id: participant.id,
      caller_number: participant.phoneNumber
    };
    
    // Add optional fields if they exist
    if (participant.name) {
      formattedParticipant.name = participant.name;
    }
    
    if (participant.externalId) {
      formattedParticipant.external_id = participant.externalId;
    }
    
    // Send as an array as required by the API
    const payload = [formattedParticipant];
    
    // Log the payload being sent to Digital Samba
    console.log(`Payload sent to Digital Samba: ${JSON.stringify(payload, null, 2)}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { rawError: errorText };
      }
      
      console.error('Error response from Digital Samba API:', response.status, errorData);
      
      return {
        success: false,
        status: response.status,
        error: errorData,
        endpoint
      };
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Error in notifyPhoneParticipantJoined:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Notify Digital Samba when phone participants leave a room
 * @param {string} roomId - The Digital Samba room ID
 * @param {string} callId - The call ID of the participant that left
 * @returns {Promise<Object>} - Response from the Digital Samba API
 */
export const notifyPhoneParticipantLeft = async (roomId, callId) => {
  try {
    const endpoint = `/api/v1/rooms/${roomId}/phone-participants/left`;
    const url = `${DS_BASE_URL}${endpoint}`;
    
    console.log(`Notifying Digital Samba that phone participant left room: ${roomId}`);
    console.log(`Using endpoint: ${url}`);
    
    // For participants leaving, only the call_ids are needed
    // Send as an array as required by the API
    const payload = [callId];
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { rawError: errorText };
      }
      
      console.error('Error response from Digital Samba API:', response.status, errorData);
      
      return {
        success: false,
        status: response.status,
        error: errorData,
        endpoint
      };
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Error in notifyPhoneParticipantLeft:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export default {
  notifyPhoneParticipantJoined,
  notifyPhoneParticipantLeft
};