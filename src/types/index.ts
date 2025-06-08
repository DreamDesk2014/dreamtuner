
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
  // 6 senses fields removed
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
}

export interface FlowInput extends FlowInputTypeOriginal {
  voiceDescription?: string;
  additionalContext?: string;
  drawingSoundSequence?: string;
  userEnergy?: number;
  userPositivity?: number;
  // 6 senses fields removed
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

// Add interfaces for other effect options as you need them

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
