
'use server';
/**
 * @fileOverview An AI agent that takes a kid's drawing and generates an artistic rendition.
 *
 * - renderKidsDrawing - A function that handles rendering the drawing.
 * - RenderKidsDrawingInput - The input type for the renderKidsDrawing function.
 * - RenderKidsDrawingOutput - The return type for the renderKidsDrawing function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const RenderKidsDrawingInputSchema = z.object({
  drawingDataUri: z
    .string()
    .describe(
      "A kid's drawing, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  originalVoiceHint: z.string().optional().describe("The original voice hint provided by the child for their drawing, if any."),
  originalMusicalIdea: z.string().optional().describe("The musical idea generated based on the original drawing and voice hint."),
});
export type RenderKidsDrawingInput = z.infer<typeof RenderKidsDrawingInputSchema>;

const RenderKidsDrawingOutputSchema = z.object({
  renderedDrawingDataUrl: z.string().describe("The AI-generated artistic rendition of the kid's drawing, as a data URI (PNG)."),
});
export type RenderKidsDrawingOutput = z.infer<typeof RenderKidsDrawingOutputSchema>;

export async function renderKidsDrawing(input: RenderKidsDrawingInput): Promise<RenderKidsDrawingOutput> {
  return renderKidsDrawingFlow(input);
}

const renderKidsDrawingFlow = ai.defineFlow(
  {
    name: 'renderKidsDrawingFlow',
    inputSchema: RenderKidsDrawingInputSchema,
    outputSchema: RenderKidsDrawingOutputSchema,
  },
  async (input) => {
    let promptText = "You are a friendly AI artist. A child has made this drawing. Create a more polished, colorful, and imaginative artistic rendition of it, suitable for a child. Make it look like a beautiful illustration. Keep the style whimsical and fun.";

    if (input.originalVoiceHint) {
      promptText += `\n\nThe child described their drawing as: "${input.originalVoiceHint}". Try to incorporate this feeling or theme into your rendition.`;
    }
    if (input.originalMusicalIdea) {
      promptText += `\n\nThe drawing inspired a musical idea described as: "${input.originalMusicalIdea}". Let this musical mood also subtly influence your artistic rendition.`;
    }


    const {media} = await ai.generate({
      model: 'googleai/gemini-2.0-flash-exp', // IMPORTANT: Only this model currently supports image generation
      prompt: [
        {media: {url: input.drawingDataUri}},
        {text: promptText},
      ],
      config: {
        responseModalities: ['TEXT', 'IMAGE'], // MUST provide both TEXT and IMAGE
        // Low safety settings for creative freedom, but still filtered.
        safetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }, // Stricter for kids
        ],
      },
    });
    
    if (!media?.url) {
        throw new Error("AI failed to generate an image rendition.");
    }

    return { renderedDrawingDataUrl: media.url };
  }
);

