// Loads sinch-ds/.env (if present) into process.env exactly once, before any module
// reads configuration. Variables already set in the environment take precedence.
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
