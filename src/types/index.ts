import type { GenerateMusicalParametersOutput as AIOutput, GenerateMusicalParametersInput as AIInput } from '@/ai/flows/generate-musical-parameters';

export type InputType = 'text' | 'image' | 'video';

export interface FilePreview {
  name: string;
  type: string; // MIME type
  url?: string; // For image preview (data URL) or for sending to AI flow
  size: number; // In bytes
}

// AppInput is the data structure the client-side form will prepare
export type AppInput = 
  | { type: 'text'; content: string; genre?: string; }
  | { type: 'image'; content: string; mimeType: string; fileDetails: FilePreview; genre?: string; } // content is base64 for API
  | { type: 'video'; fileDetails: FilePreview; genre?: string; };

// MusicParameters is what the client expects to receive and display
// It augments the AI output with original input details
export interface MusicParameters extends AIOutput {
  originalInput: AppInput;
  selectedGenre?: string;
}

// For mapping to AI Flow input
export type FlowInput = AIInput;

// Helper type for the structure Gemini might return if not perfectly matching AIOutput (used in user's geminiService, might not be needed if flows are strict)
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
