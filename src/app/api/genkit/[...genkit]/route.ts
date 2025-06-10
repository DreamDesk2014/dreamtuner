// src/app/api/genkit/[...genkit]/route.ts

import { startFlowsServer } from '@genkit-ai/flow';

// This line is crucial. It imports your genkit.ts file, which runs the
// configureGenkit() function and makes your flows available.
import '@/ai/genkit';

// This function finds all the flows you defined and creates the
// Next.js API route handlers (GET, POST) for them.
export const { GET, POST, OPTIONS } = startFlowsServer();
