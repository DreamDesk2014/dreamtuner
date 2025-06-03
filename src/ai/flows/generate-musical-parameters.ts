
'use server';

/**
 * @fileOverview Generates musical parameters based on user input (text, image, video),
 * and supports a 'kids' mode for interpreting drawings with optional voice hints.
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
  mode: z.enum(['standard', 'kids']).default('standard').optional().describe("The operating mode: 'standard' for general inputs, 'kids' for children's drawings."),
  voiceDescription: z.string().optional().describe("Optional voice-derived text description, especially for Kids Mode drawings."),
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
  model: 'googleai/gemini-1.5-flash-latest', 
  input: {schema: GenerateMusicalParametersInputSchema}, 
  output: {schema: GenerateMusicalParametersOutputSchema},
  prompt: `You are DreamTuner, an AI that translates human expression into musical concepts.

{{#if isKidsMode}}
  {{! Kids Mode Specific Prompt }}
  You are in Kids Mode! Analyze the following child's drawing. Focus on simple shapes, bright colors, the overall energy, and density of strokes.
  Image: {{media url=fileDetails.url}}
  {{#if voiceDescription}}
  The child also provided this voice hint about their drawing: "{{{voiceDescription}}}"
  Use this hint to further understand the drawing's theme or mood, and let it influence the 'generatedIdea'.
  {{/if}}

  Translate these visual elements (and optional voice hint) into simple, playful, and melody-focused musical parameters.
  - keySignature: Use major keys primarily (e.g., "C major", "G major").
  - mode: Should be "major".
  - tempoBpm: Suggest moderate tempos (e.g., 90-130 BPM).
  - moodTags: Suggest clearly happy, playful, calm, or gentle moods (e.g., ["happy", "playful", "bouncy"]).
  - instrumentHints: Suggest kid-friendly instruments like Xylophone, Toy Piano, Ukulele, Recorder, simple Synth sounds (like "Square Lead" or "Sine Wave Pad"), or light percussion (like "Shaker" or "Tambourine").
  - rhythmicDensity: Keep low to medium-low (0.1 to 0.4).
  - harmonicComplexity: Keep very low (0.0 to 0.3).
  - targetValence: Should be positive (0.5 to 1.0).
  - targetArousal: Can be low to mid (-0.5 to 0.5).
  - generatedIdea: A brief, fun, and imaginative textual description (maximum 20 words) of the musical piece inspired by the drawing{{#if voiceDescription}} and the voice hint{{/if}}.

  {{#if genre}}
  The user has also selected a musical genre: '{{{genre}}}'. Try to subtly incorporate this genre if it complements the playful nature, but prioritize the kid-friendly parameters above.
  {{/if}}

{{else}}
  {{! Standard Mode Prompt }}
  {{#if fileDetails.url}}
    Analyze the following image and generate a detailed set of musical parameters that capture its essence (colors, mood, objects, composition).
    Image: {{media url=fileDetails.url}}
  {{else}}
    {{#if fileDetails}}
      Conceptually analyze the video (filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Unknown Video{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}unknown{{/if}}').
      Generate a detailed set of musical parameters that capture its conceptual essence (e.g., theme, pacing, visual mood, implied narrative).
      Note: The video content itself is not provided, only its metadata. Base your analysis on the concept typically associated with a video of this name and type.
    {{else}}
      {{#if content}}
        Analyze the following text and generate a detailed set of musical parameters that capture its essence.
        The text is: {{{content}}}
      {{else}}
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

  For all inputs (unless in Kids mode, which has its own output rules), generate the following musical parameters:
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
{{/if}}

Your response MUST be a JSON object that strictly adheres to the output schema. Do not include any introductory or explanatory text, or markdown formatting, outside of the JSON structure itself.
`
});

const generateMusicalParametersFlow = ai.defineFlow(
  {
    name: 'generateMusicalParametersFlow',
    inputSchema: GenerateMusicalParametersInputSchema,
    outputSchema: GenerateMusicalParametersOutputSchema,
  },
  async (input: GenerateMusicalParametersInput) => {
    const handlebarsContext = {
      ...input,
      isKidsMode: input.mode === 'kids',
    };
    const {output} = await prompt(handlebarsContext); 
    return output!;
  }
);
