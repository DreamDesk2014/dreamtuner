// src/app/api/genkit/[...genkit]/route.ts
import { initializeGenkit } from '@/ai/genkit';
import { handlers } from 'genkit';

// Initialize Genkit only once when this module is loaded on the server.
// This is the CRITICAL call to ensure Genkit is configured.
initializeGenkit();

// Export Genkit's handlers to serve the API endpoints for your flows.
// This uses Next.js App Router's route.ts convention.
export const GET = handlers.forNextJs();
export const POST = handlers.forNextJs();
export const OPTIONS = handlers.forNextJs();

// src/app/api/genkit/[...genkit]/route.ts
import { initializeGenkit } from '@/ai/genkit';
import { handlers } from 'genkit';

// Initialize Genkit only once when this module is loaded on the server.
// This is the CRITICAL call to ensure Genkit is configured.
initializeGenkit();

// Export Genkit's handlers to serve the API endpoints for your flows.
// This uses Next.js App Router's route.ts convention.
export const GET = handlers.forNextJs();
export const POST = handlers.forNextJs();
export const OPTIONS = handlers.forNextJs();

