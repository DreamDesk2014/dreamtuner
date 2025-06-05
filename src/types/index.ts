
import type { GenerateMusicalParametersOutput as AIOutput, GenerateMusicalParametersInput as FlowInputTypeOriginal } from '@/ai/flows/generate-musical-parameters';
import type { RenderKidsDrawingOutput, RenderKidsDrawingInput as RenderKidsDrawingInputOriginal } from '@/ai/flows/render-kids-drawing-flow';
// Added for standard mode art generation
import type { RenderStandardInputArtOutput as StandardArtOutput, RenderStandardInputArtInput as StandardArtInputOriginal } from '@/ai/flows/render-standard-input-art-flow';


export type InputType = 'text' | 'image' | 'video'; // 'video' also serves for 'audio' concepts/data

export interface FilePreview {
  name: string;
  type: string;
  url?: string; // Can be data URI for images or recorded audio
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
      content: string; // Base64 content for image
      mimeType: string;
      fileDetails: FilePreview; // Includes URL for image data URI
      voiceDescription?: string; // Primarily for Kids Mode
      additionalContext?: string; // For Standard Mode image/video
      drawingSoundSequence?: string; // For Kids Mode drawing sounds
    }
  | { 
      type: 'video'; // Also used for audio file concepts AND recorded audio data
      fileDetails: FilePreview; // If url is present and type is audio/*, it's recorded audio data URI
      content?: string; // Base64 part of the audio data URI, if it's a recording
      mimeType?: string; // Mime type of the recorded audio e.g. "audio/wav"
      additionalContext?: string; 
    }
);

export interface MusicParameters extends AIOutput {
  originalInput: AppInput;
  selectedGenre?: string;
}

// Ensure FlowInput can receive the audio data URI via fileDetails.url
export interface FlowInput extends FlowInputTypeOriginal {
  voiceDescription?: string;
  additionalContext?: string;
  drawingSoundSequence?: string;
  userEnergy?: number;
  userPositivity?: number;
  // fileDetails.url can now also be an audio data URI
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

// Types for Standard Mode AI Art Generation
export interface RenderStandardInputArtInput extends StandardArtInputOriginal {}
export interface RenderedStandardArtResponse extends StandardArtOutput {}

