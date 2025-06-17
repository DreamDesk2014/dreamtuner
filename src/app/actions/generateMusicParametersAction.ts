// src/app/actions/generateMusicParametersAction.ts

'use server';

import type { AppInput, MusicParameters } from '@/types';
// CORRECT: We now import the PURE LOGIC function and its types from the .logic.ts file.
// This is safe because the .logic.ts file does NOT contain `defineFlow`.
import {
    generateMusicalParametersLogic,
    type GenerateMusicalParametersInput,
    type GenerateMusicalParametersOutput
} from '@/ai/flows/generate-musical-parameters.logic';

export async function generateMusicParametersAction(
  appInput: AppInput
): Promise<MusicParameters | { error: string }> {
  console.log(`[Server Action] Triggered. Calling logic function directly.`);
  // --- DEBUG LINE ---
  console.log('GOOGLE_AI_API_KEY:', process.env.GOOGLE_AI_API_KEY);
  // ------------------

  try {
    // Step 1: Map the input from the UI (AppInput) to the format
    // expected by our logic function (GenerateMusicalParametersInput).
    const logicInput: GenerateMusicalParametersInput = {
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
      // The masterParameterContext will be handled within the logic file itself.
    };

    // Step 2: Directly and safely call the pure logic function.
    // This avoids all previous networking and import errors because the logic
    // file ensures Genkit is initialized before running.
    const flowOutput = await generateMusicalParametersLogic(logicInput);

    // Step 3: Map the output from the logic function back to the format
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
    };

    return musicParams;

  } catch (error) {
    console.error("Critical error in generateMusicParametersAction:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return { error: `Action failed: ${errorMessage}` };
  }
}
