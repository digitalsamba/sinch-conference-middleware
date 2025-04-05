/**
 * Sinch API Service
 * Handles all interactions with the Sinch Voice API for conference management
 */
import dotenv from 'dotenv';

dotenv.config();

// Base URL for Sinch API
const SINCH_BASE_URL = 'https://calling.api.sinch.com';

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
  
  return `Basic ${Buffer.from(`${applicationKey}:${applicationSecret}`).toString('base64')}`;
};

/**
 * Kicks a participant from a conference
 * @param {string} conferenceId - The ID of the conference
 * @param {string} callId - The call ID of the participant to kick
 * @returns {Promise<Object>} - Response from the Sinch API
 */
export const kickParticipant = async (conferenceId, callId) => {
  try {
    const kickEndpoint = `/calling/v1/conferences/id/${conferenceId}/${callId}`;
    const url = `${SINCH_BASE_URL}${kickEndpoint}`;
    
    console.log(`Attempting to kick participant: ${callId} from conference: ${conferenceId}`);
    console.log(`Using endpoint: ${url}`);
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json'
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
        endpoint: kickEndpoint
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
    const muteEndpoint = `/calling/v1/conferences/id/${conferenceId}/${callId}`;
    const url = `${SINCH_BASE_URL}${muteEndpoint}`;
    
    console.log(`Attempting to mute participant: ${callId} in conference: ${conferenceId}`);
    console.log(`Using endpoint: ${url}`);
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json'
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
        endpoint: muteEndpoint
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
    const unmuteEndpoint = `/calling/v1/conferences/id/${conferenceId}/${callId}`;
    const url = `${SINCH_BASE_URL}${unmuteEndpoint}`;
    
    console.log(`Attempting to unmute participant: ${callId} in conference: ${conferenceId}`);
    console.log(`Using endpoint: ${url}`);
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json'
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
        endpoint: unmuteEndpoint
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