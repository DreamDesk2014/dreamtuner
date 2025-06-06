
'use server';
import { renderKidsDrawing as renderKidsDrawingFlow, type RenderKidsDrawingOutput } from '@/ai/flows/render-kids-drawing-flow';
import type { RenderedDrawingResponse, RenderKidsDrawingInput } from '@/types'; // Import RenderKidsDrawingInput

export async function renderKidsDrawingAction(
    drawingDataUri?: string, 
    originalVoiceHint?: string, 
    originalMusicalIdea?: string,
    drawingSoundSequence?: string // New parameter
): Promise<RenderedDrawingResponse | { error: string }> {
  try {
    const flowInput: RenderKidsDrawingInput = { 
        drawingDataUri,
        originalVoiceHint,
        originalMusicalIdea,
        drawingSoundSequence // Pass to flow
    };
    const result: RenderKidsDrawingOutput = await renderKidsDrawingFlow(flowInput);
    return result;
  } catch (err) {
    console.error("Error in renderKidsDrawingAction:", err);
    const errorMessage = err instanceof Error ? err.message : "An unknown error occurred while rendering the drawing.";
     if (errorMessage.includes("API_KEY_INVALID") || errorMessage.includes("PERMISSION_DENIED")) {
      return { error: "Gemini API request failed for image rendering: Invalid API Key or insufficient permissions." };
    }
    if (errorMessage.includes("User location is not supported") || errorMessage.includes("location not supported for the API use")) {
      return { error: "Gemini API request failed for image rendering: Service not available in your region." };
    }
    if (errorMessage.toLowerCase().includes("size") || errorMessage.toLowerCase().includes("request payload")){
        return { error: "Gemini API request failed for image rendering: Input data (e.g. drawing) might be too large."};
    }
    if (errorMessage.toLowerCase().includes("safety settings")){
        return { error: "AI could not render the drawing due to safety filters. Please try a different drawing."};
    }
    if (errorMessage.includes("500 Internal Server Error") || errorMessage.toLowerCase().includes("internal error has occurred")) {
      return { error: "The AI art generator encountered a temporary server issue. Please try again in a few moments." };
    }
    return { error: `Failed to render drawing: ${errorMessage}` };
  }
}

