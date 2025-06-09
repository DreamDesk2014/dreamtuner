
'use server';

/**
 * @fileOverview Generates musical parameters based on user input (text, image, video, audio),
 * and supports a 'kids' mode for interpreting drawings with optional voice hints and sound sequences.
 * Also supports user-defined energy (arousal) and positivity (valence) overrides.
 * This flow can now be guided by dynamic prompts and master parameter sets fetched from Firebase.
 *
 * - generateMusicalParameters - A function that handles the generation of musical parameters.
 * - GenerateMusicalParametersInput - The input type for the generateMusicalParameters function.
 * - GenerateMusicalParametersOutput - The return type for the generateMusicalParameters function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { getAIPrompt, getMasterMusicParameterSet } from '@/lib/firestoreService';
import type { AIPrompt, MasterMusicParameterContext, MasterMusicParameterSet, InputType as AppInputType } from '@/types';

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
  promptVariationKey: z.string().optional().describe("Key for a specific prompt variation to use from Firestore."),
  masterParameterSetId: z.string().optional().describe("ID of a MasterMusicParameterSet to use from Firestore for guidance."),
  masterParameterContext: z.any().optional().describe("Pre-fetched master parameter context to inject into the prompt."), 
});
export type GenerateMusicalParametersInput = z.infer<
  typeof GenerateMusicalParametersInputSchema
>;

const GenerateMusicalParametersOutputSchema = z.object({
  keySignature: z.string().describe('The key signature of the music.'),
  mode: z.string().describe('The mode of the music (major or minor).'),
  tempoBpm: z.number().describe('The tempo of the music in BPM.'),
  moodTags: z.array(z.string()).describe('Tags describing the mood of the music.'),
  instrumentHints: z.array(z.string()).describe('Instrument suggestions for the music, including descriptive adjectives (e.g., "Electric Guitar (Distorted Lead, Riffy Melody)", "Synth Pad (Warm, Evolving Background)", "Piano (Acoustic, Bright, Main Melody)"). Ensure hints specify melodic role if applicable.'),
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
  generatedIdea: z.string().describe('A structured description of the musical piece, following a specific format based on mode. (Max 20 words for Kids Mode, Max 45 words for Standard Mode). Structure: [Opening Feel/Intro] + [Core Rhythmic/Harmonic Elements] + [Primary Melodic Instruments & their character] + [Emotional Arc/Climax].'),
  melodicContour: z.string().optional().describe("The overall shape or direction of the primary melody (e.g., 'ascending', 'descending', 'arching', 'wavy', 'stable', 'riff-based', 'improvisational', 'mixed')."),
  melodicPhrasing: z.string().optional().describe("The characteristic phrasing of the main melody (e.g., 'short_motifs', 'long_flowing', 'call_and_response', 'question_answer', 'syncopated_phrases')."),
  melodicEmphasis: z.string().optional().describe("How prominent the main melody is in the overall texture (e.g., 'foreground', 'background', 'interwoven')."),
});
export type GenerateMusicalParametersOutput = z.infer<
  typeof GenerateMusicalParametersOutputSchema
>;

const DEFAULT_PROMPT_TEMPLATE = `You are DreamTuner, an AI that translates human expression into musical concepts.
Pay special attention to crafting a distinct and memorable primary melody.
Based on your analysis of the input, define the 'melodicContour', 'melodicPhrasing', and 'melodicEmphasis' that would best represent its core feeling and style.
Ensure the 'generatedIdea' and 'instrumentHints' for melodic instruments align with these melodic decisions.

{{#if masterParameterContext}}
**Master Parameter Guidance:**
You should aim to align your generated parameters with the following preferences, derived from a master style guide named '{{masterParameterContext.name}}'. Use these as strong suggestions unless the primary input strongly dictates otherwise:
{{#if masterParameterContext.preferredTempoRange}}
- Preferred Tempo: Between {{masterParameterContext.preferredTempoRange.min}} and {{masterParameterContext.preferredTempoRange.max}} BPM.
{{/if}}
{{#if masterParameterContext.preferredKeyContext}}
- Preferred Key Context: {{masterParameterContext.preferredKeyContext}}.
{{/if}}
{{#if masterParameterContext.preferredInstrumentHints}}
- Preferred Instruments: {{masterParameterContext.preferredInstrumentHints}}. Consider these first.
{{/if}}
{{#if masterParameterContext.preferredMelodicContour}}
- Preferred Melodic Contour: {{masterParameterContext.preferredMelodicContour}}.
{{/if}}
{{#if masterParameterContext.preferredMelodicPhrasing}}
- Preferred Melodic Phrasing: {{masterParameterContext.preferredMelodicPhrasing}}.
{{/if}}
{{#if masterParameterContext.notesOnDynamics}}
- Notes on Dynamics: {{masterParameterContext.notesOnDynamics}}.
{{/if}}
Strive for a result that reflects both the user's specific input and this guiding style.
---
{{/if}}

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
    Use this hint as the primary source of inspiration if no drawing is provided (or if the drawing was empty), or to further understand the drawing's theme or mood if a drawing is present. Let it strongly influence the 'generatedIdea', 'moodTags', 'melodicContour', and 'melodicPhrasing'.
    Consider the vocal timbre and prosody (if discernible) to inform instrument choices and melodic character.
  {{else}}
    {{#unless hasKidsDrawing}}
      No drawing or voice hint was provided. Generate very simple, default playful music parameters based on any provided sound sequence, or just generally playful if no sounds either.
    {{/unless}}
  {{/if}}

  {{#if drawingSoundSequence}}
    Additionally, as the child interacted (e.g. drew with different colors), this sequence of musical tones was played: {{{drawingSoundSequence}}}.
    Use these tones (e.g., {{{drawingSoundSequence}}}) as a subtle inspirational cue for the melody, rhythm, or overall playful character of the music. For example, if the tones are generally ascending, it might suggest a more uplifting feel ('melodicContour': 'ascending'). If they are sparse, it might suggest a calmer rhythm.
  {{/if}}

  Translate these visual elements (if drawing exists and is valid) and/or the voice hint (if exists) and/or sound sequence (if exists) into simple, playful, and melody-focused musical parameters.
  Consider a very simple song structure (like Verse-Chorus-Verse-Chorus) when describing the 'generatedIdea' to give it a sense of a complete little song.
  - keySignature: Use major keys primarily (e.g., "C major", "G major").
  - mode: Should be "major".
  - tempoBpm: Suggest moderate tempos (e.g., 90-130 BPM).
  - moodTags: Suggest clearly happy, playful, calm, or gentle moods (e.g., ["happy", "playful", "bouncy"]).
  - instrumentHints: Suggest kid-friendly instruments like "Xylophone (Bright, Mallet, Playful Melody)", "Toy Piano (Celesta-like, Simple Melody)", "Ukulele (Nylon, Strummed Chords)", "Recorder (Wooden, Clear, Simple Tune)", "Synth Lead (Simple Square Wave, Catchy Motif)", "Synth Pad (Soft Sine Wave, Gentle Background)". Indicate melodic role.
  - rhythmicDensity: Keep low to medium-low (0.1 to 0.4).
  - harmonicComplexity: Keep very low (0.0 to 0.3).
  - targetValence: Should be positive (0.5 to 1.0).
  - targetArousal: Can be low to mid (-0.5 to 0.5).
  - generatedIdea (max 20 words): A brief, fun, and imaginative textual description inspired by the drawing (if valid){{#if voiceDescription}} and/or the voice hint{{/if}}{{#if drawingSoundSequence}} and accompanying sounds{{/if}}. If only a voice hint is present, the idea should be based solely on that {{#if drawingSoundSequence}}and the sounds{{/if}}. If only sounds, base it on the sounds. Structure: [Core Concept/Theme] + [Simple Action/Feeling] + [Key Melodic Instrument/Sound].
  - melodicContour: Suggest simple contours like 'ascending' for happy/rising, 'wavy' for playful, 'stable' for calm.
  - melodicPhrasing: Suggest 'short_motifs' or 'question_answer' patterns.
  - melodicEmphasis: 'foreground' for the main simple melody.

  {{#if genre}}
  The user has also selected a musical genre: '{{{genre}}}'.
  Your PRIMARY GOAL in Kids Mode is to create music that is inherently playful, simple, and joyful, using the kid-friendly parameters outlined (major keys, happy moods, toy-like instruments, low complexity).
  If the selected genre (e.g., '{{{genre}}}') can provide a *very subtle hint* that enhances this playful, child-like nature WITHOUT making it sound complex or mature, you may use it for slight inspiration.
  However, the core kid-friendly sound MUST NOT be compromised. If the genre '{{{genre}}}' is generally too mature or complex (e.g., "Metal", "Complex Jazz"), you should largely ignore it and stick to the default playful Kids Mode sound. The musical output must always sound appropriate for a young child.
  {{/if}}

{{else}}
  {{! Standard Mode Prompt }}
  {{#if isInputImageWithData}}
    Analyze the following image.
    Image: {{media url=fileDetails.url}}
    {{#if additionalContext}}User context: "{{{additionalContext}}}"{{/if}}

    Consider:
    - Dominant Colors & Palette: What are they, and what emotions or energy levels (for targetValence/Arousal) do they evoke (e.g., fiery reds for passion, deep blues for melancholy)?
    - Lines & Shapes: Are they sharp and dynamic (suggesting higher rhythmicDensity, possibly tense moods) or soft and flowing (suggesting calmer rhythms, gentler moods)?
    - Light & Shadow: How do contrasts or softness in lighting impact the overall mood and potential for dramatic musical elements?
    - Subject Matter & Implied Narrative: What is depicted? What story or feeling does it tell? This should strongly shape the 'generatedIdea', 'moodTags', and melodic character.
    - Composition & Focus: Is there a clear focal point? How does the arrangement of elements contribute to the feeling?
    - Texture: Does the image appear rough, smooth, detailed, or sparse? This can inform 'rhythmicDensity' and 'instrumentHints'.

    Based on this detailed visual analysis, generate musical parameters.
    Crucially, define a 'melodicContour', 'melodicPhrasing', and 'melodicEmphasis' that captures the image's core essence.
    Ensure the 'generatedIdea' and 'instrumentHints' for melodic instruments align with these melodic decisions.

  {{else if isInputAudioWithData}}
    Analyze the following live audio recording.
    Audio Recording: {{media url=fileDetails.url}}
    Filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Live Audio Recording{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}audio/wav{{/if}}'
    {{#if additionalContext}}Additional context from user: "{{{additionalContext}}}"{{/if}}

    Consider:
    - Vocal Timbre & Prosody (if speech): Analyze vocal qualities (soft, harsh, intonation, rhythm) to inform 'moodTags', 'instrumentHints', and 'melodicContour'.
    - Environmental Sounds & Ambiance: Identify sounds. Do they suggest a location or atmosphere? Translate to 'moodTags' or 'instrumentHints'.
    - Dominant Frequencies & Rhythmic Pulses: These can inspire 'keySignature', 'tempoBpm', and 'rhythmicDensity'.
    - Emotional Content of Non-Linguistic Sounds: Interpret their emotional content for 'targetValence', 'targetArousal', and 'moodTags'.

    Based on this audio analysis, generate musical parameters.
    Define 'melodicContour', 'melodicPhrasing', and 'melodicEmphasis' reflecting the audio's character.
    Ensure the 'generatedIdea' and 'instrumentHints' for melodic instruments align.

  {{else if isInputVideoWithData}}
    Analyze the following live video recording.
    Video Recording: {{media url=fileDetails.url}}
    Filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Live Video Recording{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}video/webm{{/if}}'
    {{#if additionalContext}}Additional context from user: "{{{additionalContext}}}"{{/if}}

    Consider:
    - Visuals: Colors, motion, pacing, overall visual mood.
    - Implied Narrative/Emotion: What story or feeling does the video convey?
    - Auditory Elements (if any are discernible or implied): Similar to audio analysis.

    Based on this video analysis, generate musical parameters.
    Define 'melodicContour', 'melodicPhrasing', and 'melodicEmphasis' reflecting the video's character.
    Ensure the 'generatedIdea' and 'instrumentHints' for melodic instruments align.

  {{else}} {{! This block is for text input OR video/audio file concept (no data URL) }}
    {{#if fileDetails}} {{! This means it's a video/audio file concept (no data URL, or URL is not for image/audio/video data) }}
      {{#if isInputVideoFileConcept}}
      Conceptually analyze the video file (filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Unknown Video{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}unknown{{/if}}').
      Infer common emotional and stylistic associations. E.g., 'action_scene.mov' implies high energy.
      Generate parameters capturing its conceptual essence (theme, pacing, visual mood, narrative).
      {{else if isInputAudioFileConcept}}
      Conceptually analyze the audio file (filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Unknown Audio File{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}unknown{{/if}}').
      Infer common emotional and stylistic associations. E.g., 'sad_song_idea.mp3' implies negative valence.
      Generate parameters capturing its conceptual essence (theme, rhythm, sonic texture, implied mood).
      {{else}} {{! Fallback for other file types if they somehow get here }}
      Conceptually analyze the media file (filename: '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Unknown File{{/if}}', MIME type: '{{#if fileDetails.type}}{{{fileDetails.type}}}{{else}}unknown{{/if}}').
      Generate musical parameters that capture its conceptual essence.
      {{/if}}
      Note: The media content itself is not provided, only its metadata. Base your analysis on the concept typically associated with a file of this name and type.
      {{#if additionalContext}}Additional context from user: "{{{additionalContext}}}"{{/if}}

      Based on this conceptual analysis, generate musical parameters.
      Define 'melodicContour', 'melodicPhrasing', and 'melodicEmphasis'.
      Ensure the 'generatedIdea' and 'instrumentHints' align.

    {{else}} {{! This means it's text input (no fileDetails) }}
      {{#if content}}
        Analyze the following text: "{{{content}}}"
        Consider:
        - Lexical Sentiment & Emotional Keywords: Identify words conveying strong emotions (joy, sorrow, tension) to influence 'moodTags', 'targetValence', 'targetArousal'.
        - Literary Devices & Tone: Consider overall tone (humorous, dramatic, sarcastic) and figurative language.
        - Pacing & Rhythm from Text Structure: Let sentence structure influence 'tempoBpm' and 'rhythmicDensity'.
        - Narrative & Melody: If it tells a story, imagine a melody for its emotional arc.

        Based on this text analysis, generate musical parameters.
        Define 'melodicContour', 'melodicPhrasing', and 'melodicEmphasis'.
        Ensure the 'generatedIdea' and 'instrumentHints' align.
      {{else}}
        No specific input type (text, image/audio/video data, or video/audio file details) was clearly identified. Please generate musical parameters based on any general information available or indicate the need for clearer input.
      {{/if}}
    {{/if}}
  {{/if}}

  {{#if genre}}
    {{#if isGenreAI}}
      **Your Role as AI Musical Visionary (AI Genre Selected):**
      You have been granted **complete creative freedom**. Your primary task is to **explore musically** based on the user's input.
      Deeply interpret the core essence, emotions, and implied narrative of:
      {{#if isInputImageWithData}}the provided image.{{/if}}
      {{#if isInputAudioWithData}}the provided audio recording.{{/if}}
      {{#if isInputVideoWithData}}the provided video recording.{{/if}}
      {{#if isInputVideoFileConcept}}the concept of the video file '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Unknown Video{{/if}}'.{{/if}}
      {{#if isInputAudioFileConcept}}the concept of the audio file '{{#if fileDetails.name}}{{{fileDetails.name}}}{{else}}Unknown Audio{{/if}}'.{{/if}}
      {{#if content}}the text: "{{{content}}}".{{/if}}
      {{#unless isInputImageWithData}}{{#unless isInputAudioWithData}}{{#unless isInputVideoWithData}}{{#unless isInputVideoFileConcept}}{{#unless isInputAudioFileConcept}}{{#unless content}}the general concept provided or implied.{{/unless}}{{/unless}}{{/unless}}{{/unless}}{{/unless}}{{/unless}}
      {{#if additionalContext}}Consider also the user's additional context: "{{{additionalContext}}}".{{/if}}
      
      **Your Goal:** Translate this interpretation into a **unique and cohesive musical composition concept**. Do not feel bound by traditional genre conventions unless you find they organically enhance the input's expression.
      
      You MUST generate all the following musical parameters based on your original, holistic interpretation:
      - keySignature
      - mode (major, minor, or modal if fitting)
      - tempoBpm
      - moodTags (reflecting your interpretation)
      - instrumentHints (choose instruments that best convey your musical vision; be descriptive, e.g., "Synth Lead (Ethereal, Floating Melody)")
      - rhythmicDensity (0.0-1.0)
      - harmonicComplexity (0.0-1.0)
      - targetValence (-1.0 to 1.0) {{#if userPositivity}}(User's positivity preference: {{{userPositivity}}}. This should strongly guide targetValence.){{/if}}
      - targetArousal (-1.0 to 1.0) {{#if userEnergy}}(User's energy preference: {{{userEnergy}}}. This should strongly guide targetArousal.){{/if}}
      - generatedIdea (max 45 words): A structured description of your unique musical piece: [Opening Feel/Intro] + [Core Rhythmic/Harmonic Elements] + [Primary Melodic Instruments & their character] + [Emotional Arc/Climax].
      - melodicContour
      - melodicPhrasing
      - melodicEmphasis

      Strive for something novel, evocative, and musically coherent.

    {{else}}
      **Your Role:** You are an expert musicologist and creative producer. Your goal is to deeply understand the core essence of the user's input, then fuse it with the defining characteristics of the selected genre ('{{{genre}}}') to create a rich, authentic, and inspiring musical concept.
      **Guiding Principle:** The user's original input determines the *emotional core* and initial melodic direction. The selected genre ('{{{genre}}}') determines the *stylistic execution and refinement of the melody*.

      Please ensure the generated musical parameters, including 'melodicContour', 'melodicPhrasing', and 'melodicEmphasis', are stylistically appropriate for '{{{genre}}}', while still reflecting the core essence of the primary input.
    
      {{#if isGenreRock}}
        For Rock:
        - Key Signature: Often major or minor, can have bluesy inflections.
        - Mode: Major or Minor.
        - TempoBpm: Typically 110-170 BPM.
        - MoodTags: Suggest ["energetic", "driving", "powerful", "anthem", "gritty", "rebellious"].
        - InstrumentHints: Suggest ["Electric Guitar (Distorted Lead, Riffy Melody)", "Electric Guitar (Rhythm, Power Chords)", "Bass Guitar (Rock, Solid Foundation)", "Drum Kit (Powerful Rock Beat, Accented Snare)"]. Emphasize melodic role.
        - RhythmicDensity: 0.6 to 0.85.
        - HarmonicComplexity: 0.3 to 0.6.
        - TargetValence: -0.3 to 0.7.
        - TargetArousal: 0.5 to 0.9.
        - MelodicContour: 'riff-based', 'ascending' for anthems, or 'stable' with power.
        - MelodicPhrasing: 'short_motifs', 'call_and_response' (e.g., guitar and vocals).
        - MelodicEmphasis: 'foreground' for lead guitar or vocals.
        - Avoid: Do not use instruments like classical flute or harp. Avoid overly complex, highly syncopated jazz rhythms, or weak, thin drum sounds. The feeling should be powerful and direct.
        - GeneratedIdea (max 45 words): Structure: [Opening Feel/Intro] + [Core Rhythmic/Harmonic Elements] + [Primary Melodic Instruments & their character/contour] + [Emotional Arc/Climax].
      {{else if isGenreJazz}}
        For Jazz (e.g., Swing, Bebop, Cool Jazz):
        - Key Signature: Can be complex, often utilizing modes beyond simple major/minor.
        - Mode: Major, Minor, or Modal (e.g., Dorian, Mixolydian).
        - TempoBpm: Highly variable. Cool Jazz (80-130 BPM), Swing (120-200 BPM), Bebop (200+ BPM).
        - MoodTags: Suggest ["improvisational", "swinging", "sophisticated", "smooth", "bluesy", "intricate"].
        - InstrumentHints: Suggest ["Piano (Jazz Voicings, Comping/Solo Melody)", "Upright Bass (Walking, Acoustic)", "Drum Kit (Jazz - Swing Feel, Brushes, Ride Cymbal)", "Saxophone (Expressive Solo Melody, Tenor/Alto)", "Trumpet (Warm, Solo Melody)"]. Emphasize melodic role.
        - RhythmicDensity: 0.4 to 0.7.
        - HarmonicComplexity: 0.6 to 0.9.
        - TargetValence: -0.5 to 0.6.
        - TargetArousal: 0.1 to 0.7.
        - MelodicContour: 'improvisational', 'wavy', 'arching'.
        - MelodicPhrasing: 'syncopated_phrases', 'long_flowing', 'call_and_response' between instruments.
        - MelodicEmphasis: Often 'interwoven' or 'foreground' for soloists.
        - Avoid: Avoid rigid, straight 4/4 rock drum beats or simple power-chord harmonies. The feel should be fluid, interactive, and harmonically rich, not stiff.
        - GeneratedIdea (max 45 words): Structure: [Opening Feel/Intro] + [Core Rhythmic/Harmonic Elements] + [Primary Melodic Instruments & their improvisational style/phrasing] + [Emotional Arc/Climax].
      {{else if isGenreElectronic}}
        For Electronic (e.g., House, Synthpop, Techno):
        - Key Signature: Often minor or major, can be modal.
        - Mode: Major or Minor, sometimes Dorian or Mixolydian.
        - TempoBpm: House/Synthpop (115-135 BPM), Techno (125-150 BPM).
        - MoodTags: Suggest ["rhythmic", "danceable", "futuristic", "pulsating", "groovy", "atmospheric"].
        - InstrumentHints: Suggest ["Synth Lead (Bright, Plucky, Catchy Melody/Riff)", "Synth Bass (Driving, Sub, FM/Analog-style)", "Synth Pad (Atmospheric, Evolving Background)", "Drum Machine (e.g., 808/909-style Kick, Snare/Clap, Crisp Hi-Hats)", "Arpeggiator (Sequenced, Rhythmic Melody)"]. Emphasize melodic role.
        - RhythmicDensity: 0.7 to 0.9.
        - HarmonicComplexity: 0.2 to 0.6.
        - TargetValence: 0.2 to 0.8.
        - TargetArousal: 0.6 to 0.9.
        - MelodicContour: 'riff-based', 'stable' with variations, or 'ascending' for builds.
        - MelodicPhrasing: 'short_motifs', 'repetitive_phrases_with_evolution'.
        - MelodicEmphasis: 'foreground' for main synth lead/hook, or 'interwoven' for arpeggios.
        - Avoid: Avoid traditional acoustic instruments like violins or acoustic guitars unless explicitly requested or fitting a subgenre (e.g., some forms of IDM). Avoid overly complex, non-repetitive melodic structures for dance-focused subgenres.
        - GeneratedIdea (max 45 words): Structure: [Opening Feel/Intro] + [Core Rhythmic/Harmonic Elements] + [Primary Melodic Instruments & their hook/pattern] + [Emotional Arc/Climax].
      {{else if isGenreCinematic}}
        For Cinematic (e.g., Film Score, Orchestral):
        - Key Signature: Highly variable, can be major, minor, atonal, or modal.
        - Mode: Major, Minor, or other modes depending on the desired emotion.
        - TempoBpm: Extremely variable.
        - MoodTags: Suggest ["epic", "emotional", "suspenseful", "sweeping", "dramatic", "atmospheric", "tense"].
        - InstrumentHints: Suggest ["String Section (Lush, Soaring Melodies/Background)", "Brass Section (Powerful Horns, Thematic Melody)", "Orchestral Percussion (Timpani, Cymbals)", "Piano (Melodic Theme, Chordal)", "Woodwinds (Flute, Clarinet, Oboe for color/melody)"]. Emphasize melodic role.
        - RhythmicDensity: 0.3 to 0.8.
        - HarmonicComplexity: 0.4 to 0.8.
        - TargetValence: Highly variable (-0.9 to 0.9).
        - TargetArousal: Highly variable (-0.9 to 0.9).
        - MelodicContour: 'arching', 'ascending' for tension/triumph, 'descending' for sorrow, 'stable' for underscore.
        - MelodicPhrasing: 'long_flowing' for themes, 'short_motifs' for suspense.
        - MelodicEmphasis: Often 'foreground' for main themes, 'background' for atmospheric textures.
        - Avoid: Avoid overly "pop" song structures unless it's for a specific type of montage. Avoid typical rock/electronic drum machine beats unless for a hybrid score. The focus is often on orchestral color and emotional development.
        - GeneratedIdea (max 45 words): Structure: [Opening Feel/Intro] + [Core Rhythmic/Harmonic Elements] + [Primary Melodic Instruments & their thematic contour/phrasing] + [Emotional Arc/Climax].
      {{else}}
        {{! Fallback for other genres - user provided a genre not in the above list }}
        For the genre '{{{genre}}}', your task is to first briefly define its key musical characteristics in 1-2 sentences (e.g., typical instruments, tempo range, rhythmic feel, common mood, typical melodic style). Then, generate all the musical parameters below, including 'melodicContour', 'melodicPhrasing', and 'melodicEmphasis', based on your own definition. This ensures your output is internally consistent with your understanding of the genre.
        - GeneratedIdea (max 45 words): Structure: [Opening Feel/Intro] + [Core Rhythmic/Harmonic Elements] + [Primary Melodic Instruments & their melodic character] + [Emotional Arc/Climax]. Describe a musical vision.
      {{/if}}
    {{/if}}
  {{else}} {{! No genre selected by user in Standard Mode }}
    {{! Generate parameters without specific genre guidance, relying on input type and content }}
    - generatedIdea (max 45 words): Structure: [Opening Feel/Intro] + [Core Rhythmic/Harmonic Elements] + [Primary Melodic Instruments & their melodic character] + [Emotional Arc/Climax]. Describe a musical vision based on the input content.
    {{! Also define melodicContour, melodicPhrasing, melodicEmphasis based on the input's essence directly }}
    - melodicContour: (Derive from input's overall feel)
    - melodicPhrasing: (Derive from input's structure or flow)
    - melodicEmphasis: (Derive from input's focal points)
  {{/if}}

  {{#if userEnergy}}
  The user has explicitly set a target energy level (arousal) of approximately {{{userEnergy}}} (on a scale of -1.0 to 1.0).
  Ensure the 'targetArousal' in your output closely matches this value.
  {{/if}}
  {{#if userPositivity}}
  The user has explicitly set a target positivity level (valence) of approximately {{{userPositivity}}} (on a scale of -1.0 to 1.0).
  Ensure the 'targetValence' in your output closely matches this value.
  {{/if}}

  {{#unless genre}} {{! Only define these generic parameter instructions if NO genre was provided, otherwise genre-specific blocks handle them. }}
  {{#unless isGenreAI}} {{! Also ensure these are not duplicated if AI genre is selected, as AI genre has its own list }}
  For all inputs (unless in Kids mode, which has its own output rules), generate the following musical parameters:
  - keySignature: The musical key and its quality (e.g., "C# major", "F minor").
  - mode: The musical mode, typically "major" or "minor", but can be modal if appropriate for the genre (e.g., "D Dorian" for Jazz).
  - tempoBpm: The tempo in Beats Per Minute (e.g., 120).
  - moodTags: An array of descriptive tags for the mood. {{#if userEnergy}}If userEnergy is high, lean towards energetic tags. If low, calmer tags.{{/if}} {{#if userPositivity}}If userPositivity is high, lean towards positive tags. If low, negative/somber tags.{{/if}}
  - instrumentHints: An array of suggested instruments with descriptive adjectives and their melodic role (e.g., ["Piano (Acoustic, Bright, Main Melody)", "Strings (Lush Ensemble, Background Harmonies)", "Synth Pad (Warm, Evolving Atmosphere)"]).
  - rhythmicDensity: A numerical value between 0.0 (very sparse, few notes) and 1.0 (very dense, many notes). {{#if userEnergy}}Higher userEnergy might suggest higher rhythmic density, lower userEnergy might suggest lower density.{{/if}}
  - harmonicComplexity: A numerical value between 0.0 (simple, diatonic harmony) and 1.0 (complex, dissonant harmony).
  - targetValence: A numerical value between -1.0 (highly negative emotion) and 1.0 (highly positive emotion). {{#if userPositivity}}This MUST primarily reflect the userPositivity value if provided.{{else}}Derive this from the input content's perceived emotional tone and genre considerations.{{/if}}
  - targetArousal: A numerical value between -1.0 (low energy, calm) and 1.0 (high energy, intense). {{#if userEnergy}}This MUST primarily reflect the userEnergy value if provided.{{else}}Derive this from the input content's perceived energy level and genre considerations.{{/if}}
  {{/unless}}
  {{/unless}}
{{/if}}

Your response MUST be a JSON object that strictly adheres to the output schema. Do not include any introductory or explanatory text, or markdown formatting, outside of the JSON structure itself.
`;


export async function generateMusicalParameters(
  input: GenerateMusicalParametersInput
): Promise<GenerateMusicalParametersOutput> {
  return generateMusicalParametersFlow(input);
}

const generateMusicalParametersFlow = ai.defineFlow(
  {
    name: 'generateMusicalParametersFlow',
    inputSchema: GenerateMusicalParametersInputSchema,
    outputSchema: GenerateMusicalParametersOutputSchema,
  },
  async (input: GenerateMusicalParametersInput) => {
    let promptTemplateToUse = DEFAULT_PROMPT_TEMPLATE;
    let fetchedPromptName: string | undefined = "Default Built-in Prompt";

    const promptCriteria = {
        genre: input.genre,
        mode: input.mode,
        inputType: input.type as AppInputType, 
        variationKey: input.promptVariationKey,
    };
    const dynamicPrompt: AIPrompt | null = await getAIPrompt(promptCriteria);

    if (dynamicPrompt?.promptTemplate) {
      promptTemplateToUse = dynamicPrompt.promptTemplate;
      fetchedPromptName = dynamicPrompt.name;
      console.log(`Using dynamic prompt: "${fetchedPromptName}" (ID: ${dynamicPrompt.promptId}, Version: ${dynamicPrompt.version})`);
    } else {
      console.log("Using default built-in prompt template.");
    }

    let masterParameterContext: MasterMusicParameterContext | undefined;
    const masterParamSet: MasterMusicParameterSet | null = await getMasterMusicParameterSet({
        setId: input.masterParameterSetId,
        genre: input.genre,
    });

    if (masterParamSet) {
        console.log(`Applying Master Parameter Set: "${masterParamSet.name}" (ID: ${masterParamSet.setId})`);
        masterParameterContext = {
            name: masterParamSet.name,
            preferredTempoRange: masterParamSet.targetTempoRange,
            preferredKeyContext: masterParamSet.preferredKeyContext,
            preferredInstrumentHints: masterParamSet.preferredInstrumentHints,
            preferredMelodicContour: masterParamSet.preferredMelodicContour,
            preferredMelodicPhrasing: masterParamSet.preferredMelodicPhrasing,
            notesOnDynamics: masterParamSet.notesOnDynamics,
        };
    }


    const genreLower = input.genre?.toLowerCase();
    const handlebarsContext = {
      ...input,
      isKidsMode: input.mode === 'kids',
      hasKidsDrawing: input.mode === 'kids' && input.fileDetails?.url && input.fileDetails.url !== 'data:,' && input.fileDetails.url.includes('base64') && input.fileDetails.type?.startsWith('image/'),
      isInputImageWithData: input.type === 'image' && input.fileDetails?.url && input.fileDetails.url !== 'data:,' && input.fileDetails.url.includes('base64') && input.fileDetails.type?.startsWith('image/'),
      isInputAudioWithData: input.type === 'video' && input.fileDetails?.url && input.fileDetails.url !== 'data:,' && input.fileDetails.url.includes('base64') && input.fileDetails.type?.startsWith('audio/'),
      isInputVideoWithData: input.type === 'video' && input.fileDetails?.url && input.fileDetails.url !== 'data:,' && input.fileDetails.url.includes('base64') && input.fileDetails.type?.startsWith('video/'),
      isInputVideoFileConcept: input.type === 'video' && input.fileDetails && (!input.fileDetails.url || !input.fileDetails.url.includes('base64')) && input.fileDetails.type?.startsWith('video/'),
      isInputAudioFileConcept: input.type === 'video' && input.fileDetails && (!input.fileDetails.url || !input.fileDetails.url.includes('base64')) && input.fileDetails.type?.startsWith('audio/'),
      isGenreAI: genreLower === 'ai',
      isGenreRock: genreLower === 'rock',
      isGenreJazz: genreLower === 'jazz',
      isGenreElectronic: genreLower === 'electronic',
      isGenreCinematic: genreLower === 'cinematic',
      masterParameterContext: masterParameterContext, 
    };

    const anDefinedPrompt = ai.definePrompt({
      name: `dynamicPrompt_${fetchedPromptName?.replace(/\s+/g, '_') || 'default'}`, 
      model: 'googleai/gemini-1.5-flash-latest',
      input: {schema: GenerateMusicalParametersInputSchema}, 
      output: {schema: GenerateMusicalParametersOutputSchema},
      prompt: promptTemplateToUse,
    });

    const result = await anDefinedPrompt(handlebarsContext);
    const output = result.output;

    if (!output) {
      console.error("Error in generateMusicalParametersFlow: AI prompt did not return a valid output structure.");
      throw new Error("AI prompt failed to produce a valid output structure for musical parameters. The output was null or undefined.");
    }
    return output;
  }
);
