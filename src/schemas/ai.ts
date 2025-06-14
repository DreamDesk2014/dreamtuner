// src/schemas/ai.ts
// This file defines shared Zod schemas for validating data structures used in AI interactions.
// These schemas will be used by the backend (API routes, Genkit flows) for runtime validation
// and by the frontend (via src/types/index.ts) to derive TypeScript types.

import { z } from 'zod';

// 1. Schema for FilePreview (used within AppInput for image/video types)
export const FilePreviewSchema = z.object({
  name: z.string(),
  type: z.string(), // MIME type, e.g., "image/png", "video/mp4"
  url: z.string().optional(),
  size: z.number().int(),
});

// 2. Schema for BaseAppInput (common properties across all AppInput types)
// This will be `.and()`'ed with each specific input type.
export const BaseAppInputSchemaZod = z.object({
  genre: z.string().optional(),
  mode: z.enum(['standard', 'kids']), // Enforces 'standard' or 'kids'
  userEnergy: z.number().int().min(-10).max(10).optional(),
  userPositivity: z.number().int().min(-10).max(10).optional(),
  promptVariationKey: z.string().optional(),
  masterParameterSetId: z.string().optional(),
});

// 3. Schemas for each specific AppInput type (members of the discriminated union)
// These use `z.literal` for the discriminator field ('type').
const AppInputTextTypeSchema = z.object({
  type: z.literal('text'), // Discriminator for 'text' input
  content: z.string().min(1, "Text content cannot be empty for 'text' type input."), // Main text content
});

const AppInputImageTypeSchema = z.object({
  type: z.literal('image'), // Discriminator for 'image' input
  content: z.string(), // Base64 data URI of the image
  mimeType: z.string(),
  fileDetails: FilePreviewSchema,
  voiceDescription: z.string().optional(),
  additionalContext: z.string().optional(),
  drawingSoundSequence: z.string().optional(),
});

const AppInputVideoTypeSchema = z.object({
  type: z.literal('video'), // Discriminator for 'video' input
  fileDetails: FilePreviewSchema,
  content: z.string().optional(), // Video content (data URI or URL)
  mimeType: z.string().optional(),
  additionalContext: z.string().optional(),
});

// 4. Final MusicInputSchema: A discriminated union combined with BaseAppInputSchemaZod.
// This accurately mirrors your frontend's AppInput type structure.
export const MusicInputSchema = z.discriminatedUnion("type", [
  AppInputTextTypeSchema,
  AppInputImageTypeSchema,
  AppInputVideoTypeSchema,
]).and(BaseAppInputSchemaZod); // Merge with base properties to apply to each union member


// 5. Schema for the Gemini Music Parameters Response (raw AI output before frontend processing)
// This directly represents the structure you expect from the AI model.
export const GeminiMusicParamsResponseSchema = z.object({
  keySignature: z.string(),
  mode: z.union([z.literal('major'), z.literal('minor'), z.string()]),
  tempoBpm: z.number().int(),
  moodTags: z.array(z.string()),
  instrumentHints: z.array(z.string()),
  rhythmicDensity: z.number(),
  harmonicComplexity: z.number(),
  targetValence: z.number(),
  targetArousal: z.number(),
  generatedIdea: z.string(),
  melodicContour: z.string().optional(),
  melodicPhrasing: z.string().optional(),
  melodicEmphasis: z.string().optional(),
});

// 6. Final MusicOutputSchema (which corresponds to your MusicParameters type)
// It extends the raw AI response with application-specific fields like `originalInput`.
// This is the *final* object structure returned by your API endpoint.
export const MusicOutputSchema = GeminiMusicParamsResponseSchema.extend({
  originalInput: MusicInputSchema, // Embeds the exact input that generated this output
  selectedGenre: z.string().optional(), // An additional field expected by frontend's MusicParameters
});