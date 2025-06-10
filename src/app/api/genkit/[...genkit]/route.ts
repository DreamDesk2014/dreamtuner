//
// FILE: src/app/api/genkit/[...genkit]/route.ts
//
import { startFlowsServer } from '@genkit-ai/flow';

// Run the configuration from your main genkit file
import '@/ai/genkit';

// Now, explicitly import all your flows so the server knows about them
import '@/ai/flows/regenerate-musical-idea';
import '@/ai/flows/render-kids-drawing-flow';
import '@/ai/flows/render-standard-input-art-flow';

// Start the server
export const { GET, POST, OPTIONS } = startFlowsServer();
