//
// FILE: src/ai/flows/render-kids-drawing-flow.ts
//
import { defineFlow } from '@genkit-ai/flow';
import { generate } from '@genkit-ai/ai'; // Import generate from @genkit-ai/ai
import { gemini15Pro } from '@genkit-ai/googleai'; // Using the correct vision model for images
import { z } from 'zod';

export const renderKidsDrawingFlow = defineFlow(
  {
    name: 'renderKidsDrawingFlow',
    inputSchema: z.object({
        prompt: z.string(),
        imageUrl: z.string().url(),
    }),
    outputSchema: z.string(),
  },
  async ({ prompt, imageUrl }) => {
    const llmResponse = await generate({
      model: gemini15Pro, // Use the vision model
      prompt: `${prompt}:`,
      input: [
        { media: { url: imageUrl } }
      ],
    });
    return llmResponse.text();
  }
);
