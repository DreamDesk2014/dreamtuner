
'use server';
/**
 * @fileOverview An AI agent that generates an artistic rendition based on standard mode inputs
 * (text, image, or video/audio concept) and the generated musical idea.
 *
 * - renderStandardInputArt - A function that handles rendering the art.
 * - RenderStandardInputArtInput - The input type for the renderStandardInputArt function.
 * - RenderStandardInputArtOutput - The return type for the renderStandardInputArt function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { AppInput, FilePreview as AppFilePreview } from '@/types'; // For richer input typing

const FilePreviewSchema = z.object({
  name: z.string(),
  type: z.string(),
  url: z.string().optional().describe(
    "The image content as a data URI (if applicable). Expected format: 'data:<mimetype>;base64,<encoded_data>'."
  ),
  size: z.number(),
});

const RenderStandardInputArtInputSchema = z.object({
  originalInputType: z.enum(['text', 'image', 'video']),
  originalTextContent: z.string().optional().describe("The original text input, if type is 'text'."),
  originalFileDetails: FilePreviewSchema.optional().describe("Details of the original file input (image or video/audio concept)."),
  // originalImageDataUri: z.string().optional().describe("The original image as a data URI, if type is 'image'. We'll use originalFileDetails.url instead."),
  additionalContext: z.string().optional().describe("Additional textual context provided by the user for image/video inputs."),
  generatedMusicalIdea: z.string().describe("The textual description of the musical piece generated from the input."),
});

export type RenderStandardInputArtInput = z.infer<typeof RenderStandardInputArtInputSchema>;

const RenderStandardInputArtOutputSchema = z.object({
  renderedArtDataUrl: z.string().describe("The AI-generated artistic rendition, as a data URI (PNG)."),
});
export type RenderStandardInputArtOutput = z.infer<typeof RenderStandardInputArtOutputSchema>;

export async function renderStandardInputArt(input: RenderStandardInputArtInput): Promise<RenderStandardInputArtOutput> {
  return renderStandardInputArtFlow(input);
}

const renderStandardInputArtFlow = ai.defineFlow(
  {
    name: 'renderStandardInputArtFlow',
    inputSchema: RenderStandardInputArtInputSchema,
    outputSchema: RenderStandardInputArtOutputSchema,
  },
  async (input) => {
    let mainPromptText: string;
    const genPromptPayload: ({ text: string } | { media: { url: string } })[] = [];

    mainPromptText = `You are an AI artist. Based on the following input and the musical idea it inspired, create a visually striking and evocative artistic representation.
The musical idea is: "${input.generatedMusicalIdea}". Let this musical mood strongly influence your artistic rendition.
Aim for a style that is artistic, perhaps abstract or impressionistic, but clearly related to the theme. Avoid photorealism unless the input strongly suggests it. Make it beautiful and engaging.`;

    if (input.originalInputType === 'image' && input.originalFileDetails?.url && input.originalFileDetails.url !== 'data:,' && input.originalFileDetails.url.includes('base64')) {
      mainPromptText += `\n\nThe original input was an image.`;
      if (input.additionalContext) {
        mainPromptText += ` The user provided this additional context: "${input.additionalContext}".`;
      }
      mainPromptText += `\nConsider the visual elements, colors, and mood of this image for your artwork.`;
      genPromptPayload.push({ media: { url: input.originalFileDetails.url } });
    } else if (input.originalInputType === 'text' && input.originalTextContent) {
      mainPromptText += `\n\nThe original input was the following text: "${input.originalTextContent}".`;
    } else if (input.originalInputType === 'video' && input.originalFileDetails) {
      const fileTypeLabel = input.originalFileDetails.type.startsWith('video/') ? 'video' :
                            input.originalFileDetails.type.startsWith('audio/') ? 'audio' : 'media';
      mainPromptText += `\n\nThe original input was a ${fileTypeLabel} concept named '${input.originalFileDetails.name}' (type: ${input.originalFileDetails.type}).`;
      if (input.additionalContext) {
        mainPromptText += ` The user provided this additional context: "${input.additionalContext}".`;
      }
      mainPromptText += `\nInterpret the conceptual essence of this ${fileTypeLabel}.`;
    } else {
      // Fallback if input is not clearly defined, though frontend should prevent this
      mainPromptText += `\n\nThe input was not clearly specified, focus on the musical idea provided.`;
    }

    genPromptPayload.push({ text: mainPromptText });

    const {media} = await ai.generate({
      model: 'googleai/gemini-2.0-flash-exp',
      prompt: genPromptPayload,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        safetySettings: [ // Using similar safety settings as kids mode for consistency
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      },
    });

    if (!media?.url) {
        throw new Error("AI failed to generate an image rendition for the standard input.");
    }

    return { renderedArtDataUrl: media.url };
  }
);
