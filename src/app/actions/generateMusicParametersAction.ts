
'use server';
import type { AppInput, MusicParameters, FlowInput } from '@/types';
import { generateMusicalParameters as generateMusicalParametersFlow, type GenerateMusicalParametersOutput } from '@/ai/flows/generate-musical-parameters';

export async function generateMusicParametersAction(input: AppInput): Promise<MusicParameters | { error: string }> {
  try {
    // Map AppInput to FlowInput
    const flowInput: FlowInput = {
      type: input.type,
      genre: input.genre,
      mode: input.mode, // Pass the mode
    };

    if (input.type === 'text') {
      flowInput.content = input.content;
    } else if (input.type === 'image') {
      // The AI flow's prompt for image uses {{media url=fileDetails.url}}
      // So, the base64 data string should be passed as fileDetails.url
      flowInput.content = input.content; // Keep base64 in content for reference if needed
      flowInput.mimeType = input.mimeType;
      flowInput.fileDetails = {
        name: input.fileDetails.name,
        type: input.fileDetails.type,
        size: input.fileDetails.size,
        url: input.fileDetails.url, // This should be the base64 data URI
      };
    } else if (input.type === 'video') {
      flowInput.fileDetails = input.fileDetails;
    }
    
    const aiResult: GenerateMusicalParametersOutput = await generateMusicalParametersFlow(flowInput);

    const resultForClient: MusicParameters = {
      ...aiResult,
      originalInput: input, // originalInput now includes the mode
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
