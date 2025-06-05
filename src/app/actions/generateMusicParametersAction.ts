
'use server';
import type { AppInput, MusicParameters, FlowInput } from '@/types';
import { generateMusicalParameters as generateMusicalParametersFlow, type GenerateMusicalParametersOutput } from '@/ai/flows/generate-musical-parameters';

export async function generateMusicParametersAction(input: AppInput): Promise<MusicParameters | { error: string }> {
  try {
    const flowInput: FlowInput = {
      type: input.type,
      genre: input.genre,
      mode: input.mode,
    };

    if (input.type === 'text') {
      flowInput.content = input.content;
    } else if (input.type === 'image') {
      flowInput.content = input.content; 
      flowInput.mimeType = input.mimeType;
      flowInput.fileDetails = {
        name: input.fileDetails.name,
        type: input.fileDetails.type,
        size: input.fileDetails.size,
        url: input.fileDetails.url, 
      };
      if (input.voiceDescription) { 
        flowInput.voiceDescription = input.voiceDescription;
      }
      if (input.additionalContext) { 
        flowInput.additionalContext = input.additionalContext;
      }
      if (input.drawingSoundSequence && input.mode === 'kids') {
        flowInput.drawingSoundSequence = input.drawingSoundSequence;
      }
    } else if (input.type === 'video') {
      flowInput.fileDetails = input.fileDetails;
      if (input.additionalContext) { 
        flowInput.additionalContext = input.additionalContext;
      }
    }
    
    // Add mood slider values if present (for standard mode)
    if (input.mode === 'standard') {
      if (input.userEnergy !== undefined) {
        flowInput.userEnergy = input.userEnergy;
      }
      if (input.userPositivity !== undefined) {
        flowInput.userPositivity = input.userPositivity;
      }
    }
    
    const aiResult: GenerateMusicalParametersOutput = await generateMusicalParametersFlow(flowInput);

    const resultForClient: MusicParameters = {
      ...aiResult,
      originalInput: input, 
      selectedGenre: input.genre,
    };
    return resultForClient;

  } catch (err) {
    console.error("Error in generateMusicParametersAction:", err);
    const errorMessage = err instanceof Error ? err.message : "An unknown error occurred while generating music parameters.";
    if (errorMessage.includes("API_KEY_INVALID") || errorMessage.includes("PERMISSION_DENIED")) {
      return { error: "Gemini API request failed: Invalid API Key or insufficient permissions." };
    }
    if (errorMessage.includes("User location is not supported") || errorMessage.includes("location not supported for the API use")) {
      return { error: "Gemini API request failed: Service not available in your region." };
    }
    if (errorMessage.toLowerCase().includes("size") || errorMessage.toLowerCase().includes("request payload")){
        return { error: "Gemini API request failed: Input data (e.g. image) might be too large."};
    }
    if (errorMessage.includes("Handlebars")) {
      return { error: `AI prompt template error: ${errorMessage}` };
    }
    return { error: `Failed to generate music parameters: ${errorMessage}` };
  }
}

