
'use server';
import { renderStandardInputArt as renderStandardInputArtFlow, type RenderStandardInputArtOutput } from '@/ai/flows/render-standard-input-art-flow';
import type { RenderedStandardArtResponse, RenderStandardInputArtInput, AppInput } from '@/types';

export async function renderStandardInputArtAction(
    originalAppInput: AppInput,
    generatedMusicalIdea: string
): Promise<RenderedStandardArtResponse | { error: string }> {
  try {
    const flowInput: RenderStandardInputArtInput = {
      originalInputType: originalAppInput.type,
      generatedMusicalIdea: generatedMusicalIdea,
      additionalContext: (originalAppInput.type === 'image' || originalAppInput.type === 'video') ? originalAppInput.additionalContext : undefined,
    };

    if (originalAppInput.type === 'text') {
      flowInput.originalTextContent = originalAppInput.content;
    } else if (originalAppInput.type === 'image') {
      flowInput.originalFileDetails = originalAppInput.fileDetails; // url is included here
    } else if (originalAppInput.type === 'video') {
      flowInput.originalFileDetails = originalAppInput.fileDetails;
    }

    const result: RenderStandardInputArtOutput = await renderStandardInputArtFlow(flowInput);
    return result;

  } catch (err) {
    console.error("Error in renderStandardInputArtAction:", err);
    const errorMessage = err instanceof Error ? err.message : "An unknown error occurred while rendering standard mode art.";
     if (errorMessage.includes("API_KEY_INVALID") || errorMessage.includes("PERMISSION_DENIED")) {
      return { error: "Gemini API request failed for art rendering: Invalid API Key or insufficient permissions." };
    }
    if (errorMessage.includes("User location is not supported") || errorMessage.includes("location not supported for the API use")) {
      return { error: "Gemini API request failed for art rendering: Service not available in your region." };
    }
    if (errorMessage.toLowerCase().includes("size") || errorMessage.toLowerCase().includes("request payload")){
        return { error: "Gemini API request failed for art rendering: Input data (e.g. image) might be too large."};
    }
    if (errorMessage.toLowerCase().includes("safety settings")){
        return { error: "AI could not render the art due to safety filters. Please try a different input."};
    }
    return { error: `Failed to render art: ${errorMessage}` };
  }
}
