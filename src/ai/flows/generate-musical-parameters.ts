// src/ai/flows/generate-musical-parameters.ts

// This file now acts as a clean wrapper for the Genkit framework.
import '@/ai/init'; // CRITICAL: This ensures Genkit is initialized before the flow is defined.
import { defineFlow } from '@genkit-ai/flow';

// Import the schemas and the core logic function from our new .logic.ts file
import {
  generateMusicalParametersLogic,
  GenerateMusicalParametersInputSchema,
  GenerateMusicalParametersOutputSchema,
  type GenerateMusicalParametersInput,
  type GenerateMusicalParametersOutput,
} from './generate-musical-parameters.logic';

// Define the Genkit flow that wraps our logic function
export const generateMusicalParametersFlow = defineFlow(
  {
    name: 'generateMusicalParametersFlow',
    inputSchema: GenerateMusicalParametersInputSchema,
    outputSchema: GenerateMusicalParametersOutputSchema,
  },
  async (input: GenerateMusicalParametersInput): Promise<GenerateMusicalParametersOutput> => {
    // The only job of the flow is to call our pure logic function.
    // This cleanly separates the Genkit framework from your business logic.
    return await generateMusicalParametersLogic(input);
  }
);
