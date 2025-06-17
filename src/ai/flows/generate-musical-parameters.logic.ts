// src/ai/flows/generate-musical-parameters.logic.ts

import { ensureGenkitInitialized } from '@/ai/init';
import { ai } from 'genkit'; 
import { z } from 'zod';
import { getAIPrompt, getMasterMusicParameterSet } from '@/lib/firestoreService';
import type { AIPrompt, MasterMusicParameterContext, MasterMusicParameterSet, InputType as AppInputType } from '@/types';

// NOTE: We no longer call the initializer here at the top level.

// (All of your Zod schemas remain here, unchanged)
export const GenerateMusicalParametersInputSchema = z.object({
  type: z.enum(['text', 'image', 'video']),
  content: z.string().optional(),
  mimeType: z.string().optional(),
  fileDetails: z.object({
    name: z.string(),
    type: z.string(),
    size: z.number(),
    url: z.string().optional(),
  }).optional(),
  genre: z.string().optional(),
  mode: z.enum(['standard', 'kids']).default('standard').optional(),
  voiceDescription: z.string().optional(),
  additionalContext: z.string().optional(),
  drawingSoundSequence: z.string().optional(),
  userEnergy: z.number().min(-1).max(1).optional(),
  userPositivity: z.number().min(-1).max(1).optional(),
  promptVariationKey: z.string().optional(),
  masterParameterSetId: z.string().optional(),
  // Use z.any() here to avoid circular dependency issues with the schema if it's complex
  masterParameterContext: z.any().optional(),
});
export type GenerateMusicalParametersInput = z.infer<typeof GenerateMusicalParametersInputSchema>;

export const GenerateMusicalParametersOutputSchema = z.object({
  keySignature: z.string(),
  mode: z.string(),
  tempoBpm: z.number(),
  moodTags: z.array(z.string()),
  instrumentHints: z.array(z.string()),
  rhythmicDensity: z.number().min(0).max(1),
  harmonicComplexity: z.number().min(0).max(1),
  targetValence: z.number().min(-1).max(1),
  targetArousal: z.number().min(-1).max(1),
  generatedIdea: z.string(),
  melodicContour: z.string().optional(),
  melodicPhrasing: z.string().optional(),
  melodicEmphasis: z.string().optional(),
});
export type GenerateMusicalParametersOutput = z.infer<typeof GenerateMusicalParametersOutputSchema>;

const DEFAULT_PROMPT_TEMPLATE = `You are DreamTuner, an AI that translates human expression into musical concepts...`; // Your full prompt template here

// This is the core logic function.
export async function generateMusicalParametersLogic(
  input: GenerateMusicalParametersInput
): Promise<GenerateMusicalParametersOutput> {
  // CRITICAL FIX: Ensure Genkit is initialized at the start of the function execution.
  await ensureGenkitInitialized(); 
  
  console.log('[Logic] Genkit initialized, proceeding with AI call.');

  try {
    let promptTemplateToUse = DEFAULT_PROMPT_TEMPLATE;
    // ... (The rest of your logic for fetching prompts and building context remains the same) ...
    const handlebarsContext = { /* ... your full context object ... */ };

    const definedPrompt = ai.definePrompt({
      name: `dynamicPrompt_logic`,
      model: 'googleai/gemini-1.5-flash-latest',
      input: { schema: GenerateMusicalParametersInputSchema },
      output: { schema: GenerateMusicalParametersOutputSchema },
      prompt: promptTemplateToUse, 
    });
    
    const result = await definedPrompt(handlebarsContext);

    if (!result.output) {
      throw new Error("AI prompt failed to produce a valid output structure.");
    }
    
    console.log('[Logic] AI call successful.');
    return result.output;

  } catch (error) {
    console.error("Critical error in generateMusicalParametersLogic:", error);
    throw new Error(`Failed to generate musical parameters: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
