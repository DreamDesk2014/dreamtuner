// src/app/api/genkit/[...genkit]/route.ts

import { initializeGenkit, ai } from '@/ai/genkit'; // Import both the function and the 'ai' export
import { handlers } from 'genkit'; // Import Genkit's API handlers

// CRITICAL: Call initializeGenkit() explicitly here.
// This ensures Genkit is configured when this API route is accessed.
const genkitAiInstance = initializeGenkit(); // Call it and store the returned instance

// Export Genkit's handlers to serve the API endpoints for your flows.
// This uses Next.js App Router's route.ts convention.
// Pass the initialized 'ai' instance directly to the handlers.
export const GET = handlers.forNextJs(genkitAiInstance); 
export const POST = handlers.forNextJs(genkitAiInstance);
export const OPTIONS = handlers.forNextJs(genkitAiInstance);
