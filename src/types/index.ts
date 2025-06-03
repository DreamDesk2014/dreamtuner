
import type { GenerateMusicalParametersOutput as AIOutput, GenerateMusicalParametersInput as FlowInputType } from '@/ai/flows/generate-musical-parameters';

export type InputType = 'text' | 'image' | 'video'; // Kept for InputForm internal state if needed

export interface FilePreview {
  name: string;
  type: string; // MIME type
  url?: string; // For image preview (data URL) or for sending to AI flow
  size: number; // In bytes
}

// AppInput is the data structure the client-side form will prepare
// It includes the mode of operation.
export interface BaseAppInput {
  genre?: string;
  mode: 'standard' | 'kids';
}

export type AppInput = BaseAppInput & (
  | { type: 'text'; content: string; }
  | { type: 'image'; content: string; mimeType: string; fileDetails: FilePreview; } // content is base64 for AI
  | { type: 'video'; fileDetails: FilePreview; }
);

// MusicParameters is what the client expects to receive and display
// It augments the AI output with original input details, including the mode.
export interface MusicParameters extends AIOutput {
  originalInput: AppInput;
  selectedGenre?: string; // This is somewhat redundant as originalInput.genre exists.
}

// For mapping to AI Flow input schema which will be updated
export type FlowInput = FlowInputType;


// Helper type for the structure Gemini might return if not perfectly matching AIOutput
// Keeping it for reference or if direct API calls were hypothetically made elsewhere.
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
