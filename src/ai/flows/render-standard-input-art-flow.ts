//
// FILE: src/ai/flows/render-standard-input-art-flow.ts
//
import { defineFlow, generate } from '@genkit-ai/flow';
import { geminiPro } from '@genkit-ai/googleai'; // Correct import for the model
import { z } from 'zod';

export const renderStandardInputArtFlow = defineFlow(
  {
    name: 'renderStandardInputArtFlow',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (subject) => {
    const llmResponse = await generate({
      model: geminiPro, // Use the imported model directly
      prompt: `Create a detailed, artistic text description of a piece of art based on the following subject: ${subject}`,
    });
    return llmResponse.text();
  }
);
