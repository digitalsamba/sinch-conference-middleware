/**
 * Sinch API Service
 * Handles all interactions with the Sinch Voice API for conference management
 */
import dotenv from 'dotenv';

dotenv.config();

// Available Sinch API endpoints
const SINCH_ENDPOINTS = {
  global: 'https://calling.api.sinch.com',
  europe: 'https://calling-euc1.api.sinch.com',
  northAmerica: 'https://calling-use1.api.sinch.com',
  southAmerica: 'https://calling-sae1.api.sinch.com',
  asiaSouthEast1: 'https://calling-apse1.api.sinch.com',
  asiaSouthEast2: 'https://calling-apse2.api.sinch.com'
};

// Get the base URL from environment variable or use Europe by default
const SINCH_REGION = process.env.SINCH_REGION || 'europe';
const SINCH_BASE_URL = SINCH_ENDPOINTS[SINCH_REGION] || SINCH_ENDPOINTS.europe;

/**
 * Creates authorization header for Sinch API requests
 * @returns {string} The authorization header value
 */
const getAuthHeader = () => {
  const applicationKey = process.env.SINCH_APPLICATION_KEY;
  const applicationSecret = process.env.SINCH_APPLICATION_SECRET;
  
  if (!applicationKey || !applicationSecret) {
    throw new Error('Missing Sinch API credentials');
  }
  
  // Add space between 'Basic ' and the encoded string to match exactly with the documentation
  return 'Basic ' + Buffer.from(`${applicationKey}:${applicationSecret}`).toString('base64');
};

/**
 * Kicks a participant from a conference
 * @param {string} conferenceId - The ID of the conference
 * @param {string} callId - The call ID of the participant to kick
 * @returns {Promise<Object>} - Response from the Sinch API
 */
export const kickParticipant = async (conferenceId, callId) => {
  try {
    // Format the URL exactly as shown in the documentation
    const url = `${SINCH_BASE_URL}/calling/v1/conferences/id/${conferenceId}/${callId}`;
    
    console.log(`Attempting to kick participant: ${callId} from conference: ${conferenceId}`);
    console.log(`Using endpoint: ${url}`);
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader()
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { rawError: errorText };
      }
      
      console.error('Error response from Sinch API:', response.status, errorData);
      
      return {
        success: false,
        status: response.status,
        error: errorData,
        endpoint: url
      };
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Error in kickParticipant:', error);
    throw error;
  }
};

/**
 * Mutes a participant in a conference
 * @param {string} conferenceId - The ID of the conference
 * @param {string} callId - The call ID of the participant to mute
 * @returns {Promise<Object>} - Response from the Sinch API
 */
export const muteParticipant = async (conferenceId, callId) => {
  try {
    // Format the URL exactly as shown in the documentation
    const url = `${SINCH_BASE_URL}/calling/v1/conferences/id/${conferenceId}/${callId}`;
    
    console.log(`Attempting to mute participant: ${callId} in conference: ${conferenceId}`);
    console.log(`Using endpoint: ${url}`);
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader()
      },
      body: JSON.stringify({ command: 'mute' })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { rawError: errorText };
      }
      
      console.error('Error response from Sinch API:', response.status, errorData);
      
      return {
        success: false,
        status: response.status,
        error: errorData,
        endpoint: url
      };
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Error in muteParticipant:', error);
    throw error;
  }
};

/**
 * Unmutes a participant in a conference
 * @param {string} conferenceId - The ID of the conference
 * @param {string} callId - The call ID of the participant to unmute
 * @returns {Promise<Object>} - Response from the Sinch API
 */
export const unmuteParticipant = async (conferenceId, callId) => {
  try {
    // Format the URL exactly as shown in the documentation
    const url = `${SINCH_BASE_URL}/calling/v1/conferences/id/${conferenceId}/${callId}`;
    
    console.log(`Attempting to unmute participant: ${callId} in conference: ${conferenceId}`);
    console.log(`Using endpoint: ${url}`);
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader()
      },
      body: JSON.stringify({ command: 'unmute' })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { rawError: errorText };
      }
      
      console.error('Error response from Sinch API:', response.status, errorData);
      
      return {
        success: false,
        status: response.status,
        error: errorData,
        endpoint: url
      };
    }
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Error in unmuteParticipant:', error);
    throw error;
  }
};

export default {
  kickParticipant,
  muteParticipant,
  unmuteParticipant
};