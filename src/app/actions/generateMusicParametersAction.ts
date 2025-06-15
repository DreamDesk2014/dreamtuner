// src/app/actions/generateMusicParametersAction.ts

'use server';

import type { AppInput, MusicParameters } from '@/types';
// CORRECT: We only need the type definitions here, not the logic.
// The logic will be invoked via an API call.
import { 
    type GenerateMusicalParametersInput,
    type GenerateMusicalParametersOutput
} from '@/ai/flows/generate-musical-parameters.logic';

// CRITICAL: This environment variable MUST be set for this to work.
// In your local development, it should be 'http://localhost:3000'.
// In your deployed Firebase environment, you MUST set this environment variable
// to the public URL of your application (e.g., 'https://dreamtuner.xyz').
const APPLICATION_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function generateMusicParametersAction(
  appInput: AppInput
): Promise<MusicParameters | { error: string }> {
  console.log(`[Server Action] Triggered. Calling Genkit API endpoint at: ${APPLICATION_URL}`);
  try {
    // Step 1: Map the input from the UI (AppInput) to the format
    // expected by the Genkit flow (GenerateMusicalParametersInput).
    const flowInput: GenerateMusicalParametersInput = {
      type: appInput.type,
      content: appInput.text,
      genre: appInput.genre,
      mode: appInput.mode,
      userEnergy: appInput.userEnergy,
      userPositivity: appInput.userPositivity,
      fileDetails: appInput.file ? {
          name: appInput.file.name,
          type: appInput.file.type,
          size: appInput.file.size,
          url: appInput.file.url,
      } : undefined,
      // Add any other necessary fields from AppInput here
    };

    // Step 2: Make a server-to-server fetch call using the FULL, absolute URL.
    // This is the robust, correct pattern that avoids CORS and server context issues.
    const response = await fetch(`${APPLICATION_URL}/api/genkit/generateMusicalParametersFlow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Genkit's server expects the payload to be nested under an "input" key.
      body: JSON.stringify({ input: flowInput }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Genkit API call failed:", errorText);
      throw new Error(`API request failed with status ${response.status}: ${errorText.slice(0, 500)}`);
    }

    const result = await response.json();

    // Step 3: The flow's successful output is nested under the "output" key.
    const flowOutput = result.output as GenerateMusicalParametersOutput;
    
    if (!flowOutput) {
        throw new Error("Flow did not return a valid output from the API.");
    }
    
    // Step 4: Map the output from the flow back to the format
    // your page component expects (MusicParameters).
    const musicParams: MusicParameters = {
        generatedIdea: flowOutput.generatedIdea,
        keySignature: flowOutput.keySignature,
        mode: flowOutput.mode,
        tempoBpm: flowOutput.tempoBpm,
        moodTags: flowOutput.moodTags,
        instrumentHints: flowOutput.instrumentHints,
        rhythmicDensity: flowOutput.rhythmicDensity,
        harmonicComplexity: flowOutput.harmonicComplexity,
        targetValence: flowOutput.targetValence,
        targetArousal: flowOutput.targetArousal,
        originalInput: appInput, // Pass the original input along for regeneration purposes
        // ... map other fields as needed ...
    };

    return musicParams;

  } catch (error) {
    console.error("Critical error in generateMusicParametersAction:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return { error: `Action failed: ${errorMessage}` };
  }
}
