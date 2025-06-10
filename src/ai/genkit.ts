// src/ai/genkit.ts

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { config as dotenvConfig } from 'dotenv'; // Import dotenv

// This dotenvConfig() call is mostly for local dev testing outside Next.js's native env loading
dotenvConfig(); 

// --- Extracted Genkit Initialization Function ---
// This function will be called explicitly by the new API route.
export function initializeGenkit() {
  // Move apiKey definition INSIDE the function
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  // --- ADD THESE CONSOLE.LOGS FOR DEBUGGING ---
  console.log(`[Genkit Debug Init] process.env.GEMINI_API_KEY: ${apiKey ? '***** (present)' : 'undefined'}`);
  console.log(`[Genkit Debug Init] Google Cloud Project ID: ${process.env.GOOGLE_CLOUD_PROJECT || 'undefined'}`);
  console.log(`[Genkit Debug Init] Derived apiKey variable: ${apiKey ? '***** (present)' : 'undefined'}`);
  // --- END DEBUG LOGS ---

  if (!apiKey && process.env.NODE_ENV !== 'production') {
    console.warn(
      `[Genkit Setup Warning] GEMINI_API_KEY or GOOGLE_API_KEY not found in environment variables.
      If running locally with Next.js, ensure your API key is set in a .env.local file at the project root.
      Example .env.local file content:
      GEMINI_API_KEY=your_actual_api_key_here
      Remember to restart your development server after creating/modifying this file.
      For production on Firebase App Hosting, ensure this is set as a secret/environment variable in the Firebase console.`
    );
  }

  // Move the genkit() call INSIDE the function
  genkit({
    plugins: [
      googleAI({ apiKey: apiKey || undefined }),
    ],
    defaultFlow: 'generateMusicalParametersFlow', // Set your default flow name
    logLevel: 'debug', // Keep this for verbose logs
  });

  console.log('[Genkit Debug Init] Genkit configured!');
}

// NOTE: We no longer need 'export const ai = genkit({...})' here.
// The 'ai' variable will be implicitly configured when initializeGenkit() is called.




