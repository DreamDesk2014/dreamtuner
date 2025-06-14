// src/app/actions/generateMusicParametersAction.ts

'use server';

// The import to '@/ai/genkit' has been removed from here.
// Genkit initialization is now handled by src/app/api/genkit/[...genkit]/route.ts

import type { AppInput, MusicParameters, FlowInput } from '@/types';
import { generateMusicalParameters as generateMusicalParametersFlow, type GenerateMusicalParametersOutput } from '@/ai/flows/generate-musical-parameters';

export async function generateMusicParametersAction(input: AppInput): Promise<MusicParameters | { error: string }> {
  try {
    // FlowInput no longer expects sensory descriptions
    const flowInput: FlowInput = {
      type: input.type,
      genre: input.genre,
      mode: input.mode,
    };

    if (input.type === 'text') {
      flowInput.content = input.content;
    } else if (input.type === 'image') {
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
      // Explicitly include new melodic fields, even if undefined initially from AI
      melodicContour: aiResult.melodicContour,
      melodicPhrasing: aiResult.melodicPhrasing,
      melodicEmphasis: aiResult.melodicEmphasis,
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
        return { error: "Gemini API request failed: Input data (e.g. image or audio) might be too large."};
    }
    if (errorMessage.includes("500 Internal Server Error") || errorMessage.toLowerCase().includes("internal error has occurred")) {
      return { error: "The AI service encountered a temporary issue while generating parameters. Please try again in a few moments." };
    }
    if (errorMessage.includes("Handlebars")) {
      return { error: `AI prompt template error: ${errorMessage}` };
    }
    return { error: `Failed to generate music parameters: ${errorMessage}` };
  }
}
