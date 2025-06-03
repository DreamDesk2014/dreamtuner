
'use server';

/**
 * @fileOverview Generates musical parameters based on user input (text, image, video).
 *
 * - generateMusicalParameters - A function that handles the generation of musical parameters.
 * - GenerateMusicalParametersInput - The input type for the generateMusicalParameters function.
 * - GenerateMusicalParametersOutput - The return type for the generateMusicalParameters function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateMusicalParametersInputSchema = z.object({
  type: z.enum(['text', 'image', 'video']),
  content: z.string().optional(),
  mimeType: z.string().optional(),
  fileDetails: z
    .object({
      name: z.string(),
      type: z.string(),
      size: z.number(),
      url: z.string().optional().describe(
        "The image content as a data URI. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
      ),
    })
    .optional(),
  genre: z.string().optional(),
});
export type GenerateMusicalParametersInput = z.infer<
  typeof GenerateMusicalParametersInputSchema
>;

const GenerateMusicalParametersOutputSchema = z.object({
  keySignature: z.string().describe('The key signature of the music.'),
  mode: z.string().describe('The mode of the music (major or minor).'),
  tempoBpm: z.number().describe('The tempo of the music in BPM.'),
  moodTags: z.array(z.string()).describe('Tags describing the mood of the music.'),
  instrumentHints: z.array(z.string()).describe('Instrument suggestions for the music.'),
  rhythmicDensity: z
    .number()
    .describe('A value between 0 and 1 representing the rhythmic density.'),
  harmonicComplexity: z
    .number()
    .describe('A value between 0 and 1 representing the harmonic complexity.'),
  targetValence: z
    .number()
    .describe('A value between -1 and 1 representing the valence of the music.'),
  targetArousal: z
    .number()
    .describe('A value between -1 and 1 representing the arousal of the music.'),
  generatedIdea: z.string().describe('A short description of the musical piece.'),
});
export type GenerateMusicalParametersOutput = z.infer<
  typeof GenerateMusicalParametersOutputSchema
>;

export async function generateMusicalParameters(
  input: GenerateMusicalParametersInput
): Promise<GenerateMusicalParametersOutput> {
  return generateMusicalParametersFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateMusicalParametersPrompt',
  model: 'googleai/gemini-pro-vision', // Specify a vision-capable model
  input: {schema: GenerateMusicalParametersInputSchema},
  output: {schema: GenerateMusicalParametersOutputSchema},
  prompt: `You are DreamTuner, an AI that translates human expression into musical concepts.

{{! Check for image first, as fileDetails.url is most specific }}
{{#if fileDetails.url}}
Analyze the following image and generate a detailed set of musical parameters that capture its essence (colors, mood, objects, composition).
Image: {{media url=fileDetails.url}}
{{else}}
  {{! Not an image; check if it's video (has fileDetails but no url) }}
  {{#if fileDetails}}
Conceptually analyze the video (filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Unknown Video{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}unknown{{/if}}').
Generate a detailed set of musical parameters that capture its conceptual essence (e.g., theme, pacing, visual mood, implied narrative).
Note: The video content itself is not provided, only its metadata. Base your analysis on the concept typically associated with a video of this name and type.
  {{else}}
    {{! Not an image or video; check if it's text (has content but no fileDetails) }}
    {{#if content}}
Analyze the following text and generate a detailed set of musical parameters that capture its essence.
The text is: {{{content}}}
    {{else}}
{{! Fallback if none of the primary conditions are met }}
No specific input type (text, image with URL, or video details) was clearly identified. Please generate musical parameters based on any general information available or indicate the need for clearer input.
    {{/if}}
  {{/if}}
{{/if}}

{{#if genre}}
The user has specified a musical genre: '{{{genre}}}'.
Please ensure the generated musical parameters are stylistically appropriate for this genre, while still reflecting the core essence of the primary input (text, image, or video concept).
{{else}}
No specific musical genre was provided. You have creative freedom to suggest parameters based purely on the input's perceived essence.
{{/if}}

For all inputs, generate the following musical parameters:
- keySignature: The musical key and its quality (e.g., "C# major", "F minor").
- mode: The musical mode, typically "major" or "minor".
- tempoBpm: The tempo in Beats Per Minute (e.g., 120).
- moodTags: An array of descriptive tags for the mood (e.g., ["epic", "uplifting", "mysterious"]).
- instrumentHints: An array of suggested instruments (e.g., ["Piano", "Strings", "Synth Pad"]).
- rhythmicDensity: A numerical value between 0.0 (very sparse, few notes) and 1.0 (very dense, many notes).
- harmonicComplexity: A numerical value between 0.0 (simple, diatonic harmony) and 1.0 (complex, dissonant harmony).
- targetValence: A numerical value between -1.0 (highly negative emotion) and 1.0 (highly positive emotion).
- targetArousal: A numerical value between -1.0 (low energy, calm) and 1.0 (high energy, intense).
- generatedIdea: A brief, evocative textual description (maximum 30 words) of the musical piece envisioned from these parameters.

Your response MUST be a JSON object that strictly adheres to the output schema. Do not include any introductory or explanatory text, or markdown formatting, outside of the JSON structure itself.
`
});

const generateMusicalParametersFlow = ai.defineFlow(
  {
    name: 'generateMusicalParametersFlow',
    inputSchema: GenerateMusicalParametersInputSchema,
    outputSchema: GenerateMusicalParametersOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

