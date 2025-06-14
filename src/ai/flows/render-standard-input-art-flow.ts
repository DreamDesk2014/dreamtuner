//
// FILE: src/ai/flows/render-standard-input-art-flow.ts
//
import { defineFlow } from '@genkit-ai/flow';
import { generate } from '@genkit-ai/ai'; // Import generate from @genkit-ai/ai
import { gemini15Pro } from '@genkit-ai/googleai'; // Correct import for the model
import { z } from 'zod';

export const renderStandardInputArtFlow = defineFlow(
  {
    name: 'renderStandardInputArtFlow',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (subject) => {
    const llmResponse = await generate({
      model: gemini15Pro, // Use the imported model directly
      prompt: `Create a detailed, artistic text description of a piece of art based on the following subject: ${subject}`,
    });
    return llmResponse.text();
  }
);
