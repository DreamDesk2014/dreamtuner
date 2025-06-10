// src/ai/genkit.ts
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { config as dotenvConfig } from 'dotenv'; // Import dotenv

// Load environment variables from .env file at the project root
// This is a fallback. Next.js automatically loads .env*.
dotenvConfig(); // This line is likely for local dev, Next.js handles .env.local automatically.

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

// --- ADD THESE CONSOLE.LOGS FOR DEBUGGING ---
console.log(`[Genkit Debug] process.env.GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '***** (present)' : 'undefined'}`);
console.log(`[Genkit Debug] process.env.GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? '***** (present)' : 'undefined'}`);
console.log(`[Genkit Debug] Derived apiKey variable: ${apiKey ? '***** (present)' : 'undefined'}`);
// --- END DEBUG LOGS ---

if (!apiKey && process.env.NODE_ENV !== 'production') {
  // In development, if the key isn't found after checking process.env,
  // it's a sign of a local setup issue.
  // In production, we assume the environment variable is set directly via Firebase console.
  console.warn(
    `[Genkit Setup Warning] GEMINI_API_KEY or GOOGLE_API_KEY not found in environment variables.
    If running locally with Next.js, ensure your API key is set in a .env.local file at the project root.
    Example .env.local file content:
    GEMINI_API_KEY=your_actual_api_key_here
    Remember to restart your development server after creating/modifying this file.
    For production on Firebase App Hosting, ensure this is set as a secret/environment variable in the Firebase console.`
  );
}

export const ai = genkit({
  plugins: [
    googleAI({ apiKey: apiKey || undefined })
  ],
  model: 'googleai/gemini-1.5-flash-latest',
  // Set logLevel to debug to get more verbose Genkit logs in the console
  logLevel: 'debug',
});
