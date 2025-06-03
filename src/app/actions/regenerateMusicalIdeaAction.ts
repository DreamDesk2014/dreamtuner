'use server';
import type { MusicParameters } from '@/types';
import { regenerateMusicalIdea as regenerateMusicalIdeaFlow, type RegenerateMusicalIdeaInput, type RegenerateMusicalIdeaOutput } from '@/ai/flows/regenerate-musical-idea';

export async function regenerateMusicalIdeaAction(currentParams: MusicParameters): Promise<{ newIdea: string } | { error: string }> {
  try {
    const flowInput: RegenerateMusicalIdeaInput = {
      keySignature: currentParams.keySignature,
      mode: currentParams.mode,
      tempoBpm: currentParams.tempoBpm,
      moodTags: currentParams.moodTags,
      instrumentHints: currentParams.instrumentHints,
      rhythmicDensity: currentParams.rhythmicDensity,
      harmonicComplexity: currentParams.harmonicComplexity,
      targetValence: currentParams.targetValence,
      targetArousal: currentParams.targetArousal,
      selectedGenre: currentParams.selectedGenre,
    };

    const result: RegenerateMusicalIdeaOutput = await regenerateMusicalIdeaFlow(flowInput);
    return { newIdea: result.newIdea };

  } catch (err) {
    console.error("Error in regenerateMusicalIdeaAction:", err);
    const errorMessage = err instanceof Error ? err.message : "An unknown error occurred while regenerating idea.";
    return { error: `Failed to regenerate idea: ${errorMessage}` };
  }
}
