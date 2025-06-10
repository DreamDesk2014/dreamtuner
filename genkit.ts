// src/ai/genkit.ts
import { configure, genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { config as dotenvConfig } from 'dotenv'; // This line is crucial for reading .env

// Load environment variables from a .env file
// Make sure this project's root directory is where your .env file is located.
// In Cloud Shell, if you're in '~/dreamtuner/src/ai', the .env file needs to be in '~/dreamtuner'.
dotenvConfig();

// Retrieve the API key from environment variables
const geminiApiKey = process.env.GEMINI_API_KEY;

// Throw an error if the API key is not set, preventing the app from running without it.
if (!geminiApiKey) {
  // This error will be thrown if GEMINI_API_KEY is not found in .env or environment
  throw new Error("GEMINI_API_KEY is not defined in your environment variables.");
}

// Configure and export the Genkit instance in one go.
// The code inside configure() is run only once when this module is first imported.
export const ai = configure({
  plugins: [
    googleAI({
      apiKey: geminiApiKey,
    }),
  ],
  logLevel: 'debug', // Set to 'info' for production
  enableTracingAndMetrics: true,
});

// You no longer need the initializeGenkit() function or the global variables from the old setup.
