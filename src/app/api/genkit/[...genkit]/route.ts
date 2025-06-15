// src/app/api/genkit/[...genkit]/route.ts

import { startFlowsServer } from '@genkit-ai/flow';
import { generateMusicalParametersFlow } from '@/ai/flows/generate-musical-parameters';

export const POST = startFlowsServer({
  flows: [
    generateMusicalParametersFlow,
  ],
  cors: {
    origin: '*',
  },
});
