/**
 * Digital Samba API Service
 * Handles all interactions with the Digital Samba API
 */
import dotenv from 'dotenv';

dotenv.config();

// Base URL for Digital Samba API from environment variables
const DS_BASE_URL = process.env.DIGITAL_SAMBA_API_URL || 'https://api.digitalsamba.com';
const DS_API_KEY = process.env.DIGITAL_SAMBA_DEVELOPER_KEY;
// Control whether caller numbers are sent to Digital Samba (defaults to true)
const SEND_CALLER_NUMBER = process.env.SEND_CALLER_NUMBER !== 'false';

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
      call_id: participant.id
    };

    // Format and include phoneNumber based on environment setting
    if (participant.phoneNumber && SEND_CALLER_NUMBER) {
      // Check if the phone number consists only of digits
      if (/^\d+$/.test(participant.phoneNumber)) {
        // Prepend "+" to convert to international format
        formattedParticipant.caller_number = `+${participant.phoneNumber}`;
        console.log(`Converted phone number to international format: ${formattedParticipant.caller_number}`);
      } else {
        // Use as-is if it already has a "+" or contains non-digit characters
        formattedParticipant.caller_number = participant.phoneNumber;
      }
    } else if (!SEND_CALLER_NUMBER) {
      console.log('Caller number omitted from Digital Samba notification as per configuration');
    }
    
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