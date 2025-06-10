//
// FILE: src/ai/flows/regenerate-musical-idea.ts
//
import { defineFlow, generate } from '@genkit-ai/flow';
import { geminiPro } from '@genkit-ai/googleai'; // Correct import for the model
import { z } from 'zod';

export const regenerateMusicalIdea = defineFlow(
  {
    name: 'regenerateMusicalIdea',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await generate({
      model: geminiPro, // Use the imported model directly
      prompt: `You are a creative assistant for a musician.
               Regenerate the following musical idea into something new: ${prompt}`,
    });
    return llmResponse.text();
  }
);
