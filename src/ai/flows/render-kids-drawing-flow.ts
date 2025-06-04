
'use server';
/**
 * @fileOverview An AI agent that takes a kid's drawing (or voice hint) and generates an artistic rendition.
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
    .optional() // Made optional
    .describe(
      "A kid's drawing, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'. Optional if voice hint is provided."
    ),
  originalVoiceHint: z.string().optional().describe("The original voice hint provided by the child for their drawing, if any."),
  originalMusicalIdea: z.string().optional().describe("The musical idea generated based on the original drawing and voice hint."),
});
export type RenderKidsDrawingInput = z.infer<typeof RenderKidsDrawingInputSchema>;

const RenderKidsDrawingOutputSchema = z.object({
  renderedDrawingDataUrl: z.string().describe("The AI-generated artistic rendition of the kid's drawing or voice hint, as a data URI (PNG)."),
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
    let mainPromptText: string;
    const genPromptPayload: ({ text: string } | { media: { url: string } })[] = [];

    if (input.drawingDataUri && input.drawingDataUri !== 'data:,' && input.drawingDataUri.includes('base64')) { // Check for valid, non-empty data URI
      mainPromptText = "You are a friendly AI artist. A child has made this drawing. Create a more polished, colorful, and imaginative artistic rendition of it, suitable for a child. Make it look like a beautiful illustration. Keep the style whimsical and fun.";
      genPromptPayload.push({ media: { url: input.drawingDataUri } });
      
      if (input.originalVoiceHint) {
        mainPromptText += `\n\nThe child also described their drawing (or what they intended to draw) as: "${input.originalVoiceHint}". Try to incorporate this feeling or theme into your rendition.`;
      }
    } else if (input.originalVoiceHint) {
      // Voice-only input path
      mainPromptText = `You are a friendly AI artist. A child has described something they are thinking about with their voice: "${input.originalVoiceHint}". Create a colorful, imaginative artistic illustration based *solely* on this voice description, suitable for a child. Make it look like a beautiful illustration. Keep the style whimsical and fun.`;
    } else {
      // This case should ideally be prevented by the frontend logic.
      // If for some reason it's reached, the AI won't have enough input.
      throw new Error("Cannot render art without either a drawing or a voice hint.");
    }
    
    if (input.originalMusicalIdea) {
      mainPromptText += `\n\nThe input also inspired a musical idea described as: "${input.originalMusicalIdea}". Let this musical mood also subtly influence your artistic rendition.`;
    }
    
    genPromptPayload.push({ text: mainPromptText });

    const {media} = await ai.generate({
      model: 'googleai/gemini-2.0-flash-exp', 
      prompt: genPromptPayload,
      config: {
        responseModalities: ['TEXT', 'IMAGE'], 
        safetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }, 
        ],
      },
    });
    
    if (!media?.url) {
        throw new Error("AI failed to generate an image rendition.");
    }

    return { renderedDrawingDataUrl: media.url };
  }
);
