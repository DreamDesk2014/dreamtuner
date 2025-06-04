
import type { GenerateMusicalParametersOutput as AIOutput, GenerateMusicalParametersInput as FlowInputTypeOriginal } from '@/ai/flows/generate-musical-parameters';
import type { RenderKidsDrawingOutput, RenderKidsDrawingInput as RenderKidsDrawingInputOriginal } from '@/ai/flows/render-kids-drawing-flow';

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

// Update RenderKidsDrawingInput to make drawingDataUri optional
export interface RenderKidsDrawingInput extends Omit<RenderKidsDrawingInputOriginal, 'drawingDataUri'> {
  drawingDataUri?: string; // Made optional
}
export interface RenderedDrawingResponse extends RenderKidsDrawingOutput {}

    