// src/ai/genkit.ts

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { config as dotenvConfig } from 'dotenv'; // Import dotenv

dotenvConfig(); 

// Use a global flag to ensure Genkit is only initialized once per server instance
declare global {
  var __genkitInitialized: boolean;
  var __genkitAiInstance: any; // Declare it globally
}

// --- Export 'ai' for other modules to import ---
// This 'ai' will be assigned the configured Genkit instance when initializeGenkit() is called.
export let ai: any; // Declare 'ai' as an exported variable

// --- Genkit Initialization Function ---
export function initializeGenkit() {
  if (global.__genkitInitialized && global.__genkitAiInstance) {
    console.log('[Genkit Debug Final] Genkit already initialized globally. Returning existing instance.');
    ai = global.__genkitAiInstance; // Ensure the exported 'ai' is also updated
    return global.__genkitAiInstance; 
  }

  // --- CRITICAL DEBUGGING STEP: HARDCODE API KEY ---
  // Replace "YOUR_ACTUAL_GEMINI_API_KEY_STRING_HERE" with your actual Gemini API key.
  // Make sure it's surrounded by double quotes.
  const debugApiKey = "AIzaSyCFqQm3bNb_Zb4mQyMXh08XZtah-EviDhc"; // <<< TEMPORARY HARDCODED KEY

  // --- KEEP THESE CONSOLE.LOGS FOR DEBUGGING ---
  console.log(`[Genkit Debug Final] process.env.GEMINI_API_KEY: ${debugApiKey ? '***** (present)' : 'undefined'}`);
  console.log(`[Genkit Debug Final] Google Cloud Project ID: ${process.env.GOOGLE_CLOUD_PROJECT || 'undefined'}`);
  console.log(`[Genkit Debug Final] Derived apiKey variable: ${debugApiKey ? '***** (present)' : 'undefined'}`);
  // --- END DEBUG LOGS ---

  if (!debugApiKey && process.env.NODE_ENV !== 'production') {
    console.warn(
      `[Genkit Setup Warning] HARDCODED GEMINI_API_KEY or GOOGLE_API_KEY not found (this should not happen in debug mode).`
    );
  }

  // --- Configure Genkit ---
  const configuredAi = genkit({
    plugins: [
      googleAI({ apiKey: debugApiKey || undefined }),
    ],
    defaultFlow: 'generateMusicalParametersFlow', // Set your default flow name
    logLevel: 'debug', // Keep this for verbose logs
  });

  console.log('[Genkit Debug Final] Genkit configured!');
  global.__genkitInitialized = true; 
  global.__genkitAiInstance = configuredAi; // Store the configured instance globally
  ai = configuredAi; // Assign to the exported 'ai' variable
  return configuredAi; 
}
