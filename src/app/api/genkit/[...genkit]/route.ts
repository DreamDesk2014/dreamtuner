//
// FILE: src/app/api/genkit/[...genkit]/route.ts
//
import { startFlowsServer } from '@genkit-ai/flow';

// This line imports your main config file to register all your flows
import '@/ai/genkit';

// This exports the route handlers for Next.js
export const { GET, POST, OPTIONS } = startFlowsServer();
