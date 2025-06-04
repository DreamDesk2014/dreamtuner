
import type { GenerateMusicalParametersOutput as AIOutput, GenerateMusicalParametersInput as FlowInputTypeOriginal } from '@/ai/flows/generate-musical-parameters';
import type { RenderKidsDrawingOutput } from '@/ai/flows/render-kids-drawing-flow';

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
}

export type AppInput = BaseAppInput & (
  | { type: 'text'; content: string; }
  | { type: 'image'; content: string; mimeType: string; fileDetails: FilePreview; voiceDescription?: string; additionalContext?: string; } 
  | { type: 'video'; fileDetails: FilePreview; additionalContext?: string; }
);

export interface MusicParameters extends AIOutput {
  originalInput: AppInput;
  selectedGenre?: string; 
  // renderedDrawingDataUrl is removed as AI art is handled directly in page.tsx state for Kids Mode
}

export interface FlowInput extends FlowInputTypeOriginal {
  voiceDescription?: string;
  additionalContext?: string;
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

export interface RenderedDrawingResponse extends RenderKidsDrawingOutput {}

    