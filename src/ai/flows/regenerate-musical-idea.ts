//
// FILE: src/ai/flows/regenerate-musical-idea.ts
//
import { defineFlow } from '@genkit-ai/flow';
import { generate } from '@genkit-ai/ai'; // Correct import for generate
import { z } from 'zod';

export const regenerateMusicalIdea = defineFlow(
  {
    name: 'regenerateMusicalIdea',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    const llmResponse = await generate({
      // Reference the model by its string identifier
      model: 'google-ai/gemini-pro',
      prompt: `You are a creative assistant for a musician.
               Regenerate the following musical idea into something new: ${prompt}`,
    });
    return llmResponse.text();
  }
);
