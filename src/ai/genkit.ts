// src/ai/genkit.ts

import { configureGenkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/google-ai';
import { defineFlow, startFlowsServer } from '@genkit-ai/flow';
import { z } from 'zod';

// Configure Genkit with your plugins.
// This is the one and only place you should call configureGenkit.
configureGenkit({
  plugins: [
    googleAI(), // The API key is read automatically from the GEMINI_API_KEY environment variable we set.
  ],
  logSinks: ['stdout'],
  traceSinks: ['stdout'],
  enableTracingAndMetrics: true,
});

// Define your flows here.
// Example flow:
export const menuSuggestionFlow = defineFlow(
  {
    name: 'menuSuggestionFlow',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (prompt) => {
    // Replace with your actual flow logic
    console.log('menuSuggestionFlow received prompt:', prompt);
    return `Suggestions for ${prompt}...`;
  }
);

// IMPORTANT: Do NOT export startFlowsServer() from this file.
// That belongs in your Next.js API route file.
