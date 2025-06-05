
'use server';

/**
 * @fileOverview Generates musical parameters based on user input (text, image, video, audio),
 * and supports a 'kids' mode for interpreting drawings with optional voice hints and sound sequences.
 * Also supports user-defined energy (arousal) and positivity (valence) overrides.
 *
 * - generateMusicalParameters - A function that handles the generation of musical parameters.
 * - GenerateMusicalParametersInput - The input type for the generateMusicalParameters function.
 * - GenerateMusicalParametersOutput - The return type for the generateMusicalParameters function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateMusicalParametersInputSchema = z.object({
  type: z.enum(['text', 'image', 'video']), // 'video' type covers video and audio concepts
  content: z.string().optional(),
  mimeType: z.string().optional(),
  fileDetails: z
    .object({
      name: z.string(),
      type: z.string(), // Will be e.g., 'video/mp4' or 'audio/mpeg'
      size: z.number(),
      url: z.string().optional().describe(
        "The image content as a data URI. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
      ),
    })
    .optional(),
  genre: z.string().optional(),
  mode: z.enum(['standard', 'kids']).default('standard').optional().describe("The operating mode: 'standard' for general inputs, 'kids' for children's drawings."),
  voiceDescription: z.string().optional().describe("Optional voice-derived text description, especially for Kids Mode drawings."),
  additionalContext: z.string().optional().describe("Optional textual context provided by the user for an image, video, or audio input in standard mode."),
  drawingSoundSequence: z.string().optional().describe("A comma-separated sequence of musical notes (e.g., C4,E4,G4) played when the child used different colors while drawing. Available only in Kids Mode."),
  userEnergy: z.number().min(-1).max(1).optional().describe("Optional user-defined energy level for the music (-1.0 low to 1.0 high). If provided, this should strongly influence targetArousal."),
  userPositivity: z.number().min(-1).max(1).optional().describe("Optional user-defined positivity level for the music (-1.0 negative to 1.0 positive). If provided, this should strongly influence targetValence."),
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
    .describe("A value between -1 and 1 representing the valence of the music. If the user provided a 'userPositivity' value, this should directly reflect it."),
  targetArousal: z
    .number()
    .describe("A value between -1 and 1 representing the arousal of the music. If the user provided a 'userEnergy' value, this should directly reflect it."),
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
  You are in Kids Mode!
  {{#if hasKidsDrawing}} {{! Child provided a real drawing }}
    Analyze the following child's drawing. Focus on simple shapes, bright colors, the overall energy, and density of strokes.
    Image: {{media url=fileDetails.url}}
  {{else}} {{! No real drawing, might be voice-only or empty canvas with only sounds }}
    {{#if voiceDescription}}
      A child has provided a voice hint{{#unless hasKidsDrawing}} instead of a drawing (or the drawing was empty){{/unless}}.
    {{else}}
      Generate playful music parameters. {{! Fallback if somehow drawing, voice are empty and sounds are also empty - frontend should prevent this }}
    {{/if}}
  {{/if}}

  {{#if voiceDescription}}
    The child also provided this voice hint{{#if hasKidsDrawing}} about their drawing{{/if}}: "{{{voiceDescription}}}"
    Use this hint as the primary source of inspiration if no drawing is provided (or if the drawing was empty), or to further understand the drawing's theme or mood if a drawing is present. Let it strongly influence the 'generatedIdea'.
  {{else}}
    {{#unless hasKidsDrawing}}
      No drawing or voice hint was provided. Generate very simple, default playful music parameters based on any provided sound sequence, or just generally playful if no sounds either.
    {{/unless}}
  {{/if}}

  {{#if drawingSoundSequence}}
    Additionally, as the child interacted (e.g. drew with different colors), this sequence of musical tones was played: {{{drawingSoundSequence}}}.
    Use these tones (e.g., {{{drawingSoundSequence}}}) as a subtle inspirational cue for the melody, rhythm, or overall playful character of the music. For example, if the tones are generally ascending, it might suggest a more uplifting feel. If they are sparse, it might suggest a calmer rhythm.
  {{/if}}

  Translate these visual elements (if drawing exists and is valid) and/or the voice hint (if exists) and/or sound sequence (if exists) into simple, playful, and melody-focused musical parameters.
  - keySignature: Use major keys primarily (e.g., "C major", "G major").
  - mode: Should be "major".
  - tempoBpm: Suggest moderate tempos (e.g., 90-130 BPM).
  - moodTags: Suggest clearly happy, playful, calm, or gentle moods (e.g., ["happy", "playful", "bouncy"]).
  - instrumentHints: Suggest kid-friendly instruments like Xylophone, Toy Piano, Ukulele, Recorder, simple Synth sounds (like "Square Lead" or "Sine Wave Pad"), or light percussion (like "Shaker" or "Tambourine").
  - rhythmicDensity: Keep low to medium-low (0.1 to 0.4).
  - harmonicComplexity: Keep very low (0.0 to 0.3).
  - targetValence: Should be positive (0.5 to 1.0).
  - targetArousal: Can be low to mid (-0.5 to 0.5).
  - generatedIdea: A brief, fun, and imaginative textual description (maximum 20 words) inspired by the drawing (if valid){{#if voiceDescription}} and/or the voice hint{{/if}}{{#if drawingSoundSequence}} and accompanying sounds{{/if}}. If only a voice hint is present, the idea should be based solely on that {{#if drawingSoundSequence}}and the sounds{{/if}}. If only sounds, base it on the sounds.

  {{#if genre}}
  The user has also selected a musical genre: '{{{genre}}}'.
  Your PRIMARY GOAL in Kids Mode is to create music that is inherently playful, simple, and joyful, using the kid-friendly parameters outlined (major keys, happy moods, toy-like instruments, low complexity).
  If the selected genre (e.g., '{{{genre}}}') can provide a *very subtle hint* that enhances this playful, child-like nature WITHOUT making it sound complex or mature, you may use it for slight inspiration.
  However, the core kid-friendly sound MUST NOT be compromised. If the genre '{{{genre}}}' is generally too mature or complex (e.g., "Metal", "Complex Jazz"), you should largely ignore it and stick to the default playful Kids Mode sound. The musical output must always sound appropriate for a young child.
  {{/if}}

{{else}}
  {{! Standard Mode Prompt }}
  {{#if fileDetails.url}} {{! This is for image input with URL }}
    Analyze the following image and generate a detailed set of musical parameters that capture its essence (colors, mood, objects, composition).
    Image: {{media url=fileDetails.url}}
    {{#if additionalContext}}
    Additional context from user: "{{{additionalContext}}}"
    Consider this context when generating parameters.
    {{/if}}
  {{else}} {{! This block is for text input OR video/audio concept }}
    {{#if fileDetails}} {{! This means it's video/audio concept (no URL) }}
      {{#if isInputVideo}}
      Conceptually analyze the video (filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Unknown Video{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}unknown{{/if}}').
      Generate a detailed set of musical parameters that capture its conceptual essence (e.g., theme, pacing, visual mood, implied narrative).
      {{else if isInputAudio}}
      Conceptually analyze the audio (filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Unknown Audio{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}unknown{{/if}}').
      Generate a detailed set of musical parameters that capture its conceptual essence (e.g., theme, rhythm, sonic texture, implied mood).
      {{else}} {{! Fallback for other file types if they somehow get here }}
      Conceptually analyze the media file (filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Unknown File{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}unknown{{/if}}').
      Generate a detailed set of musical parameters that capture its conceptual essence.
      {{/if}}
      Note: The media content itself is not provided, only its metadata. Base your analysis on the concept typically associated with a file of this name and type.
      {{#if additionalContext}}
      Additional context from user: "{{{additionalContext}}}"
      Consider this context when generating parameters.
      {{/if}}
    {{else}} {{! This means it's text input (no fileDetails or no fileDetails.url) }}
      {{#if content}}
        Analyze the following text and generate a detailed set of musical parameters that capture its essence.
        The text is: {{{content}}}
      {{else}}
        No specific input type (text, image with URL, or video/audio details) was clearly identified. Please generate musical parameters based on any general information available or indicate the need for clearer input.
      {{/if}}
    {{/if}}
  {{/if}}

  {{#if genre}}
  The user has specified a musical genre: '{{{genre}}}'.
  Please ensure the generated musical parameters are stylistically appropriate for this genre, while still reflecting the core essence of the primary input (text, image, or video/audio concept).
  {{/if}}

  {{#if userEnergy}}
  The user has explicitly set a target energy level (arousal) of approximately {{{userEnergy}}} (on a scale of -1.0 to 1.0).
  Ensure the 'targetArousal' in your output closely matches this value.
  {{/if}}
  {{#if userPositivity}}
  The user has explicitly set a target positivity level (valence) of approximately {{{userPositivity}}} (on a scale of -1.0 to 1.0).
  Ensure the 'targetValence' in your output closely matches this value.
  {{/if}}

  For all inputs (unless in Kids mode, which has its own output rules), generate the following musical parameters:
  - keySignature: The musical key and its quality (e.g., "C# major", "F minor").
  - mode: The musical mode, typically "major" or "minor".
  - tempoBpm: The tempo in Beats Per Minute (e.g., 120).
  - moodTags: An array of descriptive tags for the mood. {{#if userEnergy}}If userEnergy is high, lean towards energetic tags. If low, calmer tags.{{/if}} {{#if userPositivity}}If userPositivity is high, lean towards positive tags. If low, negative/somber tags.{{/if}}
  - instrumentHints: An array of suggested instruments (e.g., ["Piano", "Strings", "Synth Pad"]).
  - rhythmicDensity: A numerical value between 0.0 (very sparse, few notes) and 1.0 (very dense, many notes). {{#if userEnergy}}Higher userEnergy might suggest higher rhythmic density, lower userEnergy might suggest lower density.{{/if}}
  - harmonicComplexity: A numerical value between 0.0 (simple, diatonic harmony) and 1.0 (complex, dissonant harmony).
  - targetValence: A numerical value between -1.0 (highly negative emotion) and 1.0 (highly positive emotion). {{#if userPositivity}}This MUST primarily reflect the userPositivity value if provided.{{else}}Derive this from the input content's perceived emotional tone.{{/if}}
  - targetArousal: A numerical value between -1.0 (low energy, calm) and 1.0 (high energy, intense). {{#if userEnergy}}This MUST primarily reflect the userEnergy value if provided.{{else}}Derive this from the input content's perceived energy level.{{/if}}
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
      isInputVideo: input.fileDetails?.type?.startsWith('video/'),
      isInputAudio: input.fileDetails?.type?.startsWith('audio/'),
      hasKidsDrawing: input.mode === 'kids' && input.fileDetails?.url && input.fileDetails.url !== 'data:,' && input.fileDetails.url.includes('base64'),
    };
    const {output} = await prompt(handlebarsContext);
    return output!;
  }
);

