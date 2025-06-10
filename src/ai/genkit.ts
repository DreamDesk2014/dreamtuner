// src/ai/genkit.ts

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { config as dotenvConfig } from 'dotenv'; // Import dotenv

// This dotenvConfig() call is mostly for local dev testing outside Next.js's native env loading
dotenvConfig(); 

// Use a global flag to ensure Genkit is only initialized once per server instance
declare global {
  var __genkitInitialized: boolean;
}

// --- Extracted Genkit Initialization Function ---
// This function will configure Genkit and return the 'ai' object.
export function initializeGenkit() {
  if (global.__genkitInitialized) {
    console.log('[Genkit Debug Final] Genkit already initialized globally. Skipping re-initialization.');
    return; 
  }

  // --- CRITICAL DEBUGGING STEP: HARDCODE API KEY ---
  // Replace "YOUR_ACTUAL_GEMINI_API_KEY_STRING_HERE" with your actual Gemini API key.
  // Make sure it's surrounded by double quotes.
  const debugApiKey = "AIzaSyCFqQm3bNb_Zb4mQyMXh08XZtah-EviDhc"; // <<< TEMPORARY HARDCODED KEY

  // --- KEEP THESE CONSOLE.LOGS FOR DEBUGGING ---
  console.log(`[Genkit Debug Final] HARDCODED API KEY USED: ${debugApiKey ? '***** (present)' : 'undefined'}`);
  console.log(`[Genkit Debug Final] Google Cloud Project ID: ${process.env.GOOGLE_CLOUD_PROJECT || 'undefined'}`); // Still check this
  console.log(`[Genkit Debug Final] Derived apiKey variable (using hardcoded): ${debugApiKey ? '***** (present)' : 'undefined'}`);
  // --- END DEBUG LOGS ---

  if (!debugApiKey && process.env.NODE_ENV !== 'production') {
    console.warn(
      `[Genkit Setup Warning] HARDCODED GEMINI_API_KEY not found (this should not happen in debug mode).`
    );
  }

  // --- Genkit Initialization ---
  const configuredAi = genkit({
    plugins: [
      googleAI({ apiKey: debugApiKey || undefined }), // Pass the HARDCODED key
    ],
    defaultFlow: 'generateMusicalParametersFlow', 
    logLevel: 'debug', 
  });

  console.log('[Genkit Debug Final] Genkit configured!');
  global.__genkitInitialized = true; 
  return configuredAi; 
}
