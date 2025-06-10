//
// FILE: src/ai/flows/render-kids-drawing-flow.ts
//
import { defineFlow, generate } from '@genkit-ai/flow';
import { geminiProVision } from '@genkit-ai/googleai'; // Using the vision model for images
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
      model: geminiProVision, // Use the vision model
      prompt: `${prompt}:`,
      input: [
        { media: { url: imageUrl } }
      ],
    });
    return llmResponse.text();
  }
);
