
import type { GenerateMusicalParametersOutput as AIOutput, GenerateMusicalParametersInput as FlowInputTypeOriginal } from '@/ai/flows/generate-musical-parameters';
import type { RenderKidsDrawingOutput, RenderKidsDrawingInput as RenderKidsDrawingInputOriginal } from '@/ai/flows/render-kids-drawing-flow';
import type { RenderStandardInputArtOutput as StandardArtOutput, RenderStandardInputArtInput as StandardArtInputOriginal } from '@/ai/flows/render-standard-input-art-flow';


export type InputType = 'text' | 'image' | 'video';

export interface FilePreview {
  name: string;
  type: string;
  url?: string;
  size: number;
}

export interface BaseAppInput {
  genre?: string;
  mode: 'standard' | 'kids';
  userEnergy?: number;
  userPositivity?: number;
  promptVariationKey?: string; // e.g., "energetic_riff", "mellow_ballad"
  masterParameterSetId?: string; // ID of a MasterMusicParameterSet
}

export type AppInput = BaseAppInput & (
  | { type: 'text'; content: string; }
  | {
      type: 'image';
      content: string;
      mimeType: string;
      fileDetails: FilePreview;
      voiceDescription?: string;
      additionalContext?: string;
      drawingSoundSequence?: string;
    }
  | {
      type: 'video';
      fileDetails: FilePreview;
      content?: string;
      mimeType?: string;
      additionalContext?: string;
    }
);

export interface MusicParameters extends AIOutput {
  originalInput: AppInput;
  selectedGenre?: string;
  melodicContour?: string;
  melodicPhrasing?: string;
  melodicEmphasis?: string;
}

export interface MasterMusicParameterContext {
  // Subset of MasterMusicParameterSet, relevant for the prompt
  name?: string;
  preferredTempoRange?: { min: number; max: number };
  preferredKeyContext?: string; // e.g., "Major keys like C, G, D" or "Minor keys, often modal"
  preferredInstrumentHints?: string[];
  preferredMelodicContour?: string;
  preferredMelodicPhrasing?: string;
  notesOnDynamics?: string; // e.g., "Wide dynamic range preferred"
}

export interface FlowInput extends FlowInputTypeOriginal {
  voiceDescription?: string;
  additionalContext?: string;
  drawingSoundSequence?: string;
  userEnergy?: number;
  userPositivity?: number;
  masterParameterContext?: MasterMusicParameterContext; // To pass fetched master parameters to Handlebars
}

export interface GeminiMusicParamsResponse {
  keySignature: string;
  mode: 'major' | 'minor' | string;
  tempoBpm: number;
  moodTags: string[];
  instrumentHints: string[];
  rhythmicDensity: number;
  harmonicComplexity: number;
  targetValence: number;
  targetArousal: number;
  generatedIdea: string;
  melodicContour?: string;
  melodicPhrasing?: string;
  melodicEmphasis?: string;
}

export interface NewIdeaResponse {
  newIdea: string;
}

export interface RenderKidsDrawingInput extends Omit<RenderKidsDrawingInputOriginal, 'drawingDataUri' | 'drawingSoundSequence' > {
  drawingDataUri?: string;
  drawingSoundSequence?: string;
}

export interface InstrumentConfigFirebase {
  synthType: 'AMSynth' | 'DuoSynth' | 'FMSynth' | 'MonoSynth' | 'NoiseSynth' | 'PluckSynth' | 'Synth' | 'PolySynth'; // Tone.js synth type
  options: any; // This can be refined later to specific synth options
  volume?: number; // Volume adjustment
  effects?: Array<EffectConfig>; // Array of effect configurations
  filter?: FilterConfig; // Filter settings
  tags: string[]; // Tags for categorization (e.g., "melody", "bass", "pad", "piano")
}

export interface EffectConfig {
  type: 'Chorus' | 'Reverb' | 'Delay' | 'Distortion' | 'FeedbackDelay' | 'Phaser' | 'AutoFilter' | 'AutoWah' | 'Compressor' | 'EQ3' | string; // Common effect types, can be extended
  options: any; // This can be refined later to specific effect options
}

export interface ChorusEffectOptions {
  frequency?: number; // The frequency of the LFO.
  delayTime?: number; // The amount of delay in milliseconds.
  depth?: number; // The depth of the effect.
  feedback?: number; // Amount of feedback from the output back into the input of the chorus.
  spread?: number; // Stereo spread of the chorus.
}

export interface ReverbEffectOptions {
  decay?: number; // The amount of time the reverb will sustain.
  predelay?: number; // The time before the first reflection occurs.
}

export interface FilterConfig {
  type: 'lowpass' | 'highpass' | 'bandpass' | 'allpass' | 'notch' | 'peaking' | 'lowshelf' | 'highshelf'; // Filter type
  frequency?: number; // The cutoff frequency of the filter.
  Q?: number; // The quality factor of the filter.
  gain?: number; // The gain of the filter (for peaking and shelf filters).
  rolloff?: -12 | -24 | -48 | -96; // The rolloff of the filter.
}

export interface RenderedDrawingResponse extends RenderKidsDrawingOutput {}

export interface RenderStandardInputArtInput extends StandardArtInputOriginal {}
export interface RenderedStandardArtResponse extends StandardArtOutput {}

// Defines the structure for storing sample instrument data in Firebase
export interface FirebaseSampleInstrument {
  id: string; // Unique ID for the instrument (matches document ID)
  name: string; // User-friendly name (e.g., "Grand Piano", "808 Kick")
  category: string; // e.g., "Piano", "Drum", "Synth", "Guitar", "Strings"
  description?: string; // Optional description
  tags?: string[]; // For filtering (e.g., "acoustic", "electronic", "percussive", "sustained")

  samples: { // Multi-sample mapping: maps MIDI note numbers (as strings or numbers) to sample URLs
    [noteIdentifier: string]: string; // e.g., { "C4": "url/to/piano_c4.wav", "62": "url/to/piano_d4.wav" }
  } | string; // A single URL for simpler instruments if the sampler handles pitching

  baseUrl?: string; // Optional base URL if samples are relative paths (e.g., "/samples/piano/")

  attack?: number; // Default attack time in seconds
  release?: number; // Default release time in seconds
  volume?: number; // Default volume adjustment in dB (Tone.js Sampler usually takes volume in dB)
  loop?: boolean | { start: number; end: number; }; // Loop points if applicable
  pitch?: string | number; // Base pitch if 'samples' is a single URL and the sample needs pitching (e.g. "C4")

  isEnabled?: boolean; // To easily enable/disable this sample set
  version?: number; // For versioning sample sets
  createdAt?: any; // Firestore Timestamp
  updatedAt?: any; // Firestore Timestamp
}

// Defines the structure for AI Prompts in Firebase
export interface AIPrompt {
  promptId: string; // Unique ID for the prompt (matches document ID)
  name: string; // Descriptive name for the prompt
  description?: string; // Optional description
  genreTags?: string[]; // Genres this prompt is suitable for (e.g., ["Rock", "Pop"])
  moodTags?: string[]; // Moods this prompt aims to achieve (e.g., ["Energetic", "Melancholy"])
  modeTags?: Array<'standard' | 'kids'>; // Modes this prompt applies to
  inputTypeTags?: InputType[]; // Input types this prompt is optimized for
  variationKey?: string; // For multiple variations of a genre/mood prompt (e.g., "rock_ballad", "rock_anthem")
  promptTemplate: string; // The actual Handlebars prompt template string
  version: number; // For versioning prompts
  isEnabled: boolean; // To easily enable/disable this prompt
  createdAt?: any; // Firestore Timestamp
  updatedAt?: any; // Firestore Timestamp
}

// Defines the structure for Master Music Parameter Sets in Firebase
export interface MasterMusicParameterSet {
  setId: string; // Unique ID for the parameter set (matches document ID)
  name: string; // Descriptive name (e.g., "Energetic Pop Style", "Ambient Chill Guide")
  description?: string;
  genreTags?: string[]; // Genres this set is primarily for
  moodTags?: string[]; // Moods this set aligns with

  // Target ranges or preferences for musical parameters
  targetTempoRange?: { min: number; max: number };
  targetRhythmicDensityRange?: { min: number; max: number };
  targetHarmonicComplexityRange?: { min: number; max: number };
  targetValenceRange?: { min: number; max: number }; // e.g., 0.5 to 1.0 for positive
  targetArousalRange?: { min: number; max: number }; // e.g., 0.3 to 0.8 for energetic

  preferredKeyContext?: string; // e.g., "Primarily major keys", "Minor keys, often modal like Dorian"
  preferredInstrumentHints?: string[]; // e.g., ["Synth Lead (Bright)", "Distorted Guitar", "Warm Pad"]
  preferredMelodicContour?: string; // e.g., "ascending", "riff-based"
  preferredMelodicPhrasing?: string; // e.g., "short_motifs", "long_flowing"
  notesOnDynamics?: string; // Textual hint for dynamics, e.g., "Wide dynamic range preferred", "Compressed and punchy"

  version: number;
  isEnabled: boolean;
  createdAt?: any; // Firestore Timestamp
  updatedAt?: any; // Firestore Timestamp
}

export type InstrumentOutput = {
    instrument: Tone.Sampler | Tone.Instrument;
    outputNodeToConnect: Tone.ToneAudioNode;
    filterEnv?: Tone.FrequencyEnvelope;
    availableNotes?: string[]; // For samplers, the keys of the samples map
};
    
