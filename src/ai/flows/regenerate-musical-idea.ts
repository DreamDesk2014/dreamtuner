
// regenerate-musical-idea.ts
'use server';
/**
 * @fileOverview AI agent for regenerating the "Generated Idea" text based on existing musical parameters.
 *
 * - regenerateMusicalIdea - A function that regenerates the musical idea.
 * - RegenerateMusicalIdeaInput - The input type for the regenerateMusicalIdea function.
 * - RegenerateMusicalIdeaOutput - The return type for the regenerateMusicalIdea function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const RegenerateMusicalIdeaInputSchema = z.object({
  keySignature: z.string().describe('The key signature of the musical piece.'),
  mode: z.string().describe('The mode of the musical piece (e.g., major, minor).'),
  tempoBpm: z.number().describe('The tempo of the musical piece in BPM.'),
  moodTags: z.array(z.string()).describe('Tags describing the mood of the musical piece.'),
  instrumentHints: z.array(z.string()).describe('Hints for the instruments used in the musical piece.'),
  rhythmicDensity: z.number().describe('The rhythmic density of the musical piece (0.0 to 1.0).'),
  harmonicComplexity: z.number().describe('The harmonic complexity of the musical piece (0.0 to 1.0).'),
  targetValence: z.number().describe('The target valence of the musical piece (-1.0 to 1.0).'),
  targetArousal: z.number().describe('The target arousal of the musical piece (-1.0 to 1.0).'),
  selectedGenre: z.string().optional().describe('The selected music genre.'),
});

export type RegenerateMusicalIdeaInput = z.infer<typeof RegenerateMusicalIdeaInputSchema>;

const RegenerateMusicalIdeaOutputSchema = z.object({
  newIdea: z.string().describe('A new, short, evocative description of the musical piece.'),
});

export type RegenerateMusicalIdeaOutput = z.infer<typeof RegenerateMusicalIdeaOutputSchema>;

export async function regenerateMusicalIdea(input: RegenerateMusicalIdeaInput): Promise<RegenerateMusicalIdeaOutput> {
  return regenerateMusicalIdeaFlow(input);
}

const regenerateMusicalIdeaPrompt = ai.definePrompt({
  name: 'regenerateMusicalIdeaPrompt',
  input: {schema: RegenerateMusicalIdeaInputSchema},
  output: {schema: RegenerateMusicalIdeaOutputSchema},
  prompt: `You are DreamTuner, an AI skilled at crafting evocative musical descriptions.\nGiven the following fixed musical parameters:\n- Key: {{{keySignature}}} {{{mode}}}\n- Tempo: {{{tempoBpm}}} BPM\n- Mood Tags: {{#if moodTags}}{{{moodTags.join ", "}}}{{else}}None specified{{/if}}\n- Instrument Hints: {{#if instrumentHints}}{{{instrumentHints.join ", "}}}{{else}}None specified{{/if}}\n- Rhythmic Density: {{{rhythmicDensity}}}\n- Harmonic Complexity: {{{harmonicComplexity}}}\n- Target Valence: {{{targetValence}}}\n- Target Arousal: {{{targetArousal}}}\n{{#if selectedGenre}}- Selected Genre: {{{selectedGenre}}}{{/if}}\n\nGenerate ONLY a new, short, evocative textual description (max 30 words) for a musical piece that embodies these parameters.\nYour response MUST be a JSON object containing only one key \"newIdea\" with the string value of the new description.\nDo NOT change any of the provided musical parameters. Only provide the \"newIdea\".\n\nExample response format:\n{\n  \"newIdea\": \"A vibrant dance under neon city lights.\"\n}\n`
});

const regenerateMusicalIdeaFlow = ai.defineFlow(
  {
    name: 'regenerateMusicalIdeaFlow',
    inputSchema: RegenerateMusicalIdeaInputSchema,
    outputSchema: RegenerateMusicalIdeaOutputSchema,
  },
  async input => {
    const result = await regenerateMusicalIdeaPrompt(input);
    const output = result.output;

    if (!output) {
      console.error("Error in regenerateMusicalIdeaFlow: AI prompt did not return a valid output structure.");
      // Consider logging input for debugging
      // console.error("Input to prompt:", JSON.stringify(input));
      throw new Error("AI prompt failed to produce a valid output structure for regenerating the idea.");
    }
    return output;
  }
);

