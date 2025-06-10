// src/ai/genkit.ts

import { configureGenkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai'; // This is the correct import
import { defineFlow } from '@genkit-ai/flow';
import { z } from 'zod';

// Configure Genkit with the correct googleAI plugin
configureGenkit({
  plugins: [
    googleAI(), // This now matches the correct package
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
    console.log('menuSuggestionFlow received prompt:', prompt);
    return `Suggestions for ${prompt}...`;
  }
);
