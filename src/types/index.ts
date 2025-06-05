
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
  // For Standard Mode mood sliders
  userEnergy?: number; // Mapped from 0-100 to -1.0 to 1.0
  userPositivity?: number; // Mapped from 0-100 to -1.0 to 1.0
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
      drawingSoundSequence?: string; // For Kids Mode drawing sounds
    } 
  | { type: 'video'; fileDetails: FilePreview; additionalContext?: string; }
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
export interface RenderedDrawingResponse extends RenderKidsDrawingOutput {}

