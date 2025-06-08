
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import { config as dotenvConfig } from 'dotenv'; // Import dotenv

// Load environment variables from .env file at the project root
// This is a fallback. Next.js automatically loads .env*.
dotenvConfig();

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

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
    // Explicitly pass the API key to the googleAI plugin.
    // The plugin would normally try to read from process.env itself,
    // but this makes the dependency clearer and more robust.
    googleAI({ apiKey: apiKey || undefined })
  ],
  // The model defined here is a default for ai.generate() calls if not overridden.
  // Individual prompts/flows can specify their own models.
  // 'googleai/gemini-2.0-flash' does not seem to be a valid model identifier for Gemini 1.5 Flash via Genkit.
  // Let's use 'gemini-1.5-flash-latest' which is commonly used and valid.
  // If a flow specifies its own model (like generate-musical-parameters.ts does), that will take precedence.
  model: 'googleai/gemini-1.5-flash-latest',
});
