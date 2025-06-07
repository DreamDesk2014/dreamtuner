
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
export interface RenderedDrawingResponse extends RenderKidsDrawingOutput {}

export interface RenderStandardInputArtInput extends StandardArtInputOriginal {}
export interface RenderedStandardArtResponse extends StandardArtOutput {}
