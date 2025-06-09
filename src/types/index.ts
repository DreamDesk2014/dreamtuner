
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
  promptVariationKey?: string; 
  masterParameterSetId?: string; 
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
  name?: string;
  preferredTempoRange?: { min: number; max: number };
  preferredKeyContext?: string; 
  preferredInstrumentHints?: string[];
  preferredMelodicContour?: string;
  preferredMelodicPhrasing?: string;
  notesOnDynamics?: string; 
}

export interface FlowInput extends FlowInputTypeOriginal {
  voiceDescription?: string;
  additionalContext?: string;
  drawingSoundSequence?: string;
  userEnergy?: number;
  userPositivity?: number;
  masterParameterContext?: MasterMusicParameterContext; 
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
  synthType: 'AMSynth' | 'DuoSynth' | 'FMSynth' | 'MonoSynth' | 'NoiseSynth' | 'PluckSynth' | 'Synth' | 'PolySynth'; 
  options: any; 
  volume?: number; 
  effects?: Array<EffectConfig>; 
  filter?: FilterConfig; 
  tags: string[]; 
}

export interface EffectConfig {
  type: 'Chorus' | 'Reverb' | 'Delay' | 'Distortion' | 'FeedbackDelay' | 'Phaser' | 'AutoFilter' | 'AutoWah' | 'Compressor' | 'EQ3' | string; 
  options: any; 
}

export interface ChorusEffectOptions {
  frequency?: number; 
  delayTime?: number; 
  depth?: number; 
  feedback?: number; 
  spread?: number; 
}

export interface ReverbEffectOptions {
  decay?: number; 
  predelay?: number; 
}

export interface FilterConfig {
  type: 'lowpass' | 'highpass' | 'bandpass' | 'allpass' | 'notch' | 'peaking' | 'lowshelf' | 'highshelf'; 
  frequency?: number; 
  Q?: number; 
  gain?: number; 
  rolloff?: -12 | -24 | -48 | -96; 
}

export interface RenderedDrawingResponse extends RenderKidsDrawingOutput {}

export interface RenderStandardInputArtInput extends StandardArtInputOriginal {}
export interface RenderedStandardArtResponse extends StandardArtOutput {}

export interface FirebaseSampleInstrument {
  id: string; 
  name: string; 
  category: string; 
  description?: string; 
  tags?: string[]; 

  samples: { 
    [noteIdentifier: string]: string; 
  } | string; 

  baseUrl?: string; 

  attack?: number; 
  release?: number; 
  volume?: number; 
  loop?: boolean | { start: number; end: number; }; 
  pitch?: string | number; 

  isEnabled?: boolean; 
  version?: number; 
  createdAt?: any; 
  updatedAt?: any; 
}

export interface AIPrompt {
  promptId: string; 
  name: string; 
  description?: string; 
  genreTags?: string[]; 
  moodTags?: string[]; 
  modeTags?: Array<'standard' | 'kids'>; 
  inputTypeTags?: InputType[]; 
  variationKey?: string; 
  promptTemplate: string; 
  version: number; 
  isEnabled: boolean; 
  createdAt?: any; 
  updatedAt?: any; 
}

export interface MasterMusicParameterSet {
  setId: string; 
  name: string; 
  description?: string;
  genreTags?: string[]; 
  moodTags?: string[]; 

  targetTempoRange?: { min: number; max: number };
  targetRhythmicDensityRange?: { min: number; max: number };
  targetHarmonicComplexityRange?: { min: number; max: number };
  targetValenceRange?: { min: number; max: number }; 
  targetArousalRange?: { min: number; max: number }; 

  preferredKeyContext?: string; 
  preferredInstrumentHints?: string[]; 
  preferredMelodicContour?: string; 
  preferredMelodicPhrasing?: string; 
  notesOnDynamics?: string; 

  version: number;
  isEnabled: boolean;
  createdAt?: any; 
  updatedAt?: any; 
}

export type InstrumentOutput = {
    instrument: Tone.Sampler | Tone.Instrument;
    outputNodeToConnect: Tone.ToneAudioNode;
    filterEnv?: Tone.FrequencyEnvelope;
    availableNotes?: string[]; 
};
