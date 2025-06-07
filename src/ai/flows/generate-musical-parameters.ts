
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
  type: z.enum(['text', 'image', 'video']),
  content: z.string().optional(),
  mimeType: z.string().optional(),
  fileDetails: z
    .object({
      name: z.string(),
      type: z.string(),
      size: z.number(),
      url: z.string().optional().describe(
        "The image, audio, or video content as a data URI. Expected format: 'data:<mimetype>;base64,<encoded_data>'. For video/audio file concepts (not data), this will be absent."
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
  instrumentHints: z.array(z.string()).describe('Instrument suggestions for the music, including descriptive adjectives (e.g., "Electric Guitar (Distorted Lead)", "Synth Pad (Warm, Evolving)").'),
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
  generatedIdea: z.string().describe('A structured description of the musical piece, following the format: [Opening Feel/Intro] + [Core Rhythmic/Harmonic Elements] + [Primary Melodic Instruments] + [Emotional Arc/Climax]. (Max 20 words for Kids Mode, Max 45 words for Standard Mode).'),
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
  Consider a very simple song structure (like Verse-Chorus-Verse-Chorus) when describing the 'generatedIdea' to give it a sense of a complete little song.
  - keySignature: Use major keys primarily (e.g., "C major", "G major").
  - mode: Should be "major".
  - tempoBpm: Suggest moderate tempos (e.g., 90-130 BPM).
  - moodTags: Suggest clearly happy, playful, calm, or gentle moods (e.g., ["happy", "playful", "bouncy"]).
  - instrumentHints: Suggest kid-friendly instruments like "Xylophone (Bright, Mallet)", "Toy Piano (Celesta-like)", "Ukulele (Nylon, Strummed)", "Recorder (Wooden, Clear)", "Synth Lead (Simple Square Wave)", "Synth Pad (Soft Sine Wave)", "Light Percussion (Shaker, Tambourine)".
  - rhythmicDensity: Keep low to medium-low (0.1 to 0.4).
  - harmonicComplexity: Keep very low (0.0 to 0.3).
  - targetValence: Should be positive (0.5 to 1.0).
  - targetArousal: Can be low to mid (-0.5 to 0.5).
  - generatedIdea (max 20 words): A brief, fun, and imaginative textual description inspired by the drawing (if valid){{#if voiceDescription}} and/or the voice hint{{/if}}{{#if drawingSoundSequence}} and accompanying sounds{{/if}}. If only a voice hint is present, the idea should be based solely on that {{#if drawingSoundSequence}}and the sounds{{/if}}. If only sounds, base it on the sounds.

  {{#if genre}}
  The user has also selected a musical genre: '{{{genre}}}'.
  Your PRIMARY GOAL in Kids Mode is to create music that is inherently playful, simple, and joyful, using the kid-friendly parameters outlined (major keys, happy moods, toy-like instruments, low complexity).
  If the selected genre (e.g., '{{{genre}}}') can provide a *very subtle hint* that enhances this playful, child-like nature WITHOUT making it sound complex or mature, you may use it for slight inspiration.
  However, the core kid-friendly sound MUST NOT be compromised. If the genre '{{{genre}}}' is generally too mature or complex (e.g., "Metal", "Complex Jazz"), you should largely ignore it and stick to the default playful Kids Mode sound. The musical output must always sound appropriate for a young child.
  {{/if}}

{{else}}
  {{! Standard Mode Prompt }}
  {{#if isInputImageWithData}}
    Analyze the following image and generate a detailed set of musical parameters that capture its essence (colors, mood, objects, composition).
    Image: {{media url=fileDetails.url}}
    {{#if additionalContext}}
    Additional context from user: "{{{additionalContext}}}"
    Consider this context when generating parameters.
    {{/if}}
  {{else if isInputAudioWithData}}
    Analyze the following live audio recording and generate a detailed set of musical parameters that capture its essence (sounds, rhythm, mood, implied environment).
    Audio Recording: {{media url=fileDetails.url}}
    Filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Live Audio Recording{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}audio/wav{{/if}}'
    {{#if additionalContext}}
    Additional context from user: "{{{additionalContext}}}"
    Consider this context when generating parameters.
    {{/if}}
  {{else if isInputVideoWithData}}
    Analyze the following live video recording and generate a detailed set of musical parameters that capture its essence (visuals, motion, implied mood, etc.).
    Video Recording: {{media url=fileDetails.url}}
    Filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Live Video Recording{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}video/webm{{/if}}'
    {{#if additionalContext}}
    Additional context from user: "{{{additionalContext}}}"
    Consider this context when generating parameters.
    {{/if}}
  {{else}} {{! This block is for text input OR video/audio file concept (no data URL) }}
    {{#if fileDetails}} {{! This means it's a video/audio file concept (no data URL, or URL is not for image/audio/video data) }}
      {{#if isInputVideoFileConcept}}
      Conceptually analyze the video file (filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Unknown Video{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}unknown{{/if}}').
      Generate a detailed set of musical parameters that capture its conceptual essence (e.g., theme, pacing, visual mood, implied narrative).
      {{else if isInputAudioFileConcept}}
      Conceptually analyze the audio file (filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Unknown Audio File{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}unknown{{/if}}').
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
    {{else}} {{! This means it's text input (no fileDetails) }}
      {{#if content}}
        Analyze the following text and generate a detailed set of musical parameters that capture its essence.
        The text is: {{{content}}}
      {{else}}
        No specific input type (text, image/audio/video data, or video/audio file details) was clearly identified. Please generate musical parameters based on any general information available or indicate the need for clearer input.
      {{/if}}
    {{/if}}
  {{/if}}

  {{#if genre}}
    **Your Role:** You are an expert musicologist and creative producer. Your goal is to deeply understand the core essence of the user's input, then fuse it with the defining characteristics of the selected genre to create a rich, authentic, and inspiring musical concept.
    **Guiding Principle:** The user's original input (text/image/video) determines the *emotional core* of the music. The selected genre ('{{{genre}}}') determines the *stylistic execution*.

    Please ensure the generated musical parameters are stylistically appropriate for '{{{genre}}}', while still reflecting the core essence of the primary input.

    {{#eq genre "Rock"}}
      For Rock:
      - Key Signature: Often major or minor, can have bluesy inflections (e.g., C major, A minor, E minor blues).
      - Mode: Major or Minor.
      - TempoBpm: Typically 110-170 BPM. Mid-tempo rock (120-140 BPM) is common.
      - MoodTags: Suggest ["energetic", "driving", "powerful", "anthem", "gritty", "rebellious"].
      - InstrumentHints: Suggest ["Electric Guitar (Distorted Lead, Riffy)", "Electric Guitar (Rhythm, Power Chords)", "Bass Guitar (Rock, Solid Foundation)", "Drum Kit (Powerful Rock Beat, Accented Snare)", "Vocals (Strong, Melodic, possibly Edgy)"].
      - RhythmicDensity: 0.6 to 0.85 (active, strong beat, but with clear pulse).
      - HarmonicComplexity: 0.3 to 0.6 (often diatonic, power chords, simple to moderate progressions).
      - TargetValence: -0.3 to 0.7 (can be defiant, anthemic, or upbeat).
      - TargetArousal: 0.5 to 0.9 (high energy).
      - **Avoid:** Do not use instruments like classical flute or harp. Avoid overly complex, highly syncopated jazz rhythms, or weak, thin drum sounds. The feeling should be powerful and direct.
    {{else eq genre "Jazz"}}
      For Jazz (e.g., Swing, Bebop, Cool Jazz):
      - Key Signature: Can be complex, often utilizing modes beyond simple major/minor.
      - Mode: Major, Minor, or Modal (e.g., Dorian, Mixolydian).
      - TempoBpm: Highly variable. Cool Jazz (80-130 BPM), Swing (120-200 BPM), Bebop (200+ BPM).
      - MoodTags: Suggest ["improvisational", "swinging", "sophisticated", "smooth", "bluesy", "intricate"].
      - InstrumentHints: Suggest ["Piano (Jazz Voicings, Comping/Solo)", "Upright Bass (Walking, Acoustic)", "Drum Kit (Jazz - Swing Feel, Brushes, Ride Cymbal)", "Saxophone (Expressive Solo, Tenor/Alto)", "Trumpet (Warm, Solo)"].
      - RhythmicDensity: 0.4 to 0.7 (focus on swing feel, syncopation, interactive rhythms).
      - HarmonicComplexity: 0.6 to 0.9 (7ths, 9ths, 11ths, altered chords, complex progressions).
      - TargetValence: -0.5 to 0.6 (can be melancholic, cool, thoughtful, or joyful).
      - TargetArousal: 0.1 to 0.7 (can range from very mellow to highly energetic).
      - **Avoid:** Avoid rigid, straight 4/4 rock drum beats or simple power-chord harmonies. The feel should be fluid, interactive, and harmonically rich, not stiff.
    {{else eq genre "Electronic"}}
      For Electronic (e.g., House, Synthpop, Techno):
      - Key Signature: Often minor or major, can be modal.
      - Mode: Major or Minor, sometimes Dorian or Mixolydian.
      - TempoBpm: House/Synthpop (115-135 BPM), Techno (125-150 BPM).
      - MoodTags: Suggest ["rhythmic", "danceable", "futuristic", "pulsating", "groovy", "atmospheric"].
      - InstrumentHints: Suggest ["Synth Lead (Bright, Plucky, Sawtooth)", "Synth Bass (Driving, Sub, FM/Analog-style)", "Synth Pad (Atmospheric, Evolving, Lush)", "Drum Machine (e.g., 808/909-style Kick, Snare/Clap, Crisp Hi-Hats)", "Arpeggiator (Sequenced, Rhythmic)"].
      - RhythmicDensity: 0.7 to 0.9 (highly rhythmic, layered, often repetitive but evolving).
      - HarmonicComplexity: 0.2 to 0.6 (can be loop-based with simple changes, or have more evolving chord progressions).
      - TargetValence: 0.2 to 0.8 (often upbeat and energetic, can also be darker for techno).
      - TargetArousal: 0.6 to 0.9 (energetic, designed for movement).
      - **Avoid:** Avoid traditional acoustic instruments like violins or acoustic guitars unless explicitly requested or fitting a subgenre (e.g., some forms of IDM). Avoid overly complex, non-repetitive melodic structures for dance-focused subgenres.
    {{else eq genre "Cinematic"}}
      For Cinematic (e.g., Film Score, Orchestral):
      - Key Signature: Highly variable, can be major, minor, atonal, or modal.
      - Mode: Major, Minor, or other modes depending on the desired emotion.
      - TempoBpm: Extremely variable (Slow: 50-80 BPM for tension/emotion, Fast: 120-180 BPM for action).
      - MoodTags: Suggest ["epic", "emotional", "suspenseful", "sweeping", "dramatic", "atmospheric", "tense"].
      - InstrumentHints: Suggest ["String Section (Lush, Soaring Violins, Deep Cellos)", "Brass Section (Powerful Horns, Trumpets)", "Orchestral Percussion (Timpani, Cymbals)", "Piano (Melodic, Chordal)", "Woodwinds (Flute, Clarinet, Oboe for color)", "Synth Pad (Underlying Atmosphere, Hybrid Scores)"].
      - RhythmicDensity: 0.3 to 0.8 (can range from sparse atmospheric to dense action cues).
      - HarmonicComplexity: 0.4 to 0.8 (can be simple and diatonic or highly complex and dissonant).
      - TargetValence: Highly variable (-0.9 to 0.9), depending on the scene's emotion.
      - TargetArousal: Highly variable (-0.9 to 0.9).
      - **Avoid:** Avoid overly "pop" song structures unless it's for a specific type of montage. Avoid typical rock/electronic drum machine beats unless for a hybrid score. The focus is often on orchestral color and emotional development.
    {{else}}
      {{! Fallback for other genres }}
      For the genre '{{{genre}}}', your task is to first briefly define its key musical characteristics in 1-2 sentences (e.g., typical instruments, tempo range, rhythmic feel, common mood). Then, generate all the musical parameters below based on your own definition. This ensures your output is internally consistent with your understanding of the genre.
    {{/eq}} {{! This closes the last #eq genre block and the chain of #eq...#else eq...#else }}
  {{/if}} {{! This closes the main #if genre block }}


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
  - mode: The musical mode, typically "major" or "minor", but can be modal if appropriate for the genre (e.g., "D Dorian" for Jazz).
  - tempoBpm: The tempo in Beats Per Minute (e.g., 120).
  - moodTags: An array of descriptive tags for the mood. {{#if userEnergy}}If userEnergy is high, lean towards energetic tags. If low, calmer tags.{{/if}} {{#if userPositivity}}If userPositivity is high, lean towards positive tags. If low, negative/somber tags.{{/if}}
  - instrumentHints: An array of suggested instruments with descriptive adjectives (e.g., ["Piano (Acoustic, Bright)", "Strings (Lush Ensemble)", "Synth Pad (Warm, Evolving)"]).
  - rhythmicDensity: A numerical value between 0.0 (very sparse, few notes) and 1.0 (very dense, many notes). {{#if userEnergy}}Higher userEnergy might suggest higher rhythmic density, lower userEnergy might suggest lower density.{{/if}}
  - harmonicComplexity: A numerical value between 0.0 (simple, diatonic harmony) and 1.0 (complex, dissonant harmony).
  - targetValence: A numerical value between -1.0 (highly negative emotion) and 1.0 (highly positive emotion). {{#if userPositivity}}This MUST primarily reflect the userPositivity value if provided.{{else}}Derive this from the input content's perceived emotional tone and genre considerations.{{/if}}
  - targetArousal: A numerical value between -1.0 (low energy, calm) and 1.0 (high energy, intense). {{#if userEnergy}}This MUST primarily reflect the userEnergy value if provided.{{else}}Derive this from the input content's perceived energy level and genre considerations.{{/if}}
  - generatedIdea (max 45 words): Describe a complete musical vision using a structure like: **[Opening Feel/Intro] + [Core Rhythmic/Harmonic Elements] + [Primary Melodic Instruments] + [Emotional Arc/Climax].**
    Example: "A gentle piano intro leads into a steady acoustic drum beat and warm bassline, supporting a heartfelt vocal melody that builds to an uplifting, string-backed chorus."
{{/if}} {{! This closes the main standard mode {{else}} block (which is the counterpart to {{#if isKidsMode}} )}}

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
      hasKidsDrawing: input.mode === 'kids' && input.fileDetails?.url && input.fileDetails.url !== 'data:,' && input.fileDetails.url.includes('base64') && input.fileDetails.type?.startsWith('image/'),
      isInputImageWithData: input.type === 'image' && input.fileDetails?.url && input.fileDetails.url !== 'data:,' && input.fileDetails.url.includes('base64') && input.fileDetails.type?.startsWith('image/'),
      isInputAudioWithData: input.type === 'video' && input.fileDetails?.url && input.fileDetails.url !== 'data:,' && input.fileDetails.url.includes('base64') && input.fileDetails.type?.startsWith('audio/'),
      isInputVideoWithData: input.type === 'video' && input.fileDetails?.url && input.fileDetails.url !== 'data:,' && input.fileDetails.url.includes('base64') && input.fileDetails.type?.startsWith('video/'),
      isInputVideoFileConcept: input.type === 'video' && input.fileDetails && (!input.fileDetails.url || !input.fileDetails.url.includes('base64')) && input.fileDetails.type?.startsWith('video/'),
      isInputAudioFileConcept: input.type === 'video' && input.fileDetails && (!input.fileDetails.url || !input.fileDetails.url.includes('base64')) && input.fileDetails.type?.startsWith('audio/'),
    };
    const {output} = await prompt(handlebarsContext);
    return output!;
  }
);
    
