//
// FILE: src/ai/genkit.ts
//
import { configureGenkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

// Configure Genkit with the Google AI plugin
configureGenkit({
  plugins: [
    googleAI(), // Reads API key from GEMINI_API_KEY environment variable
  ],
  logSinks: ['stdout'],
  traceSinks: ['stdout'],
  enableTracingAndMetrics: true,
});

// This section finds and exports all flows from your flow files,
// making them available to the Genkit server.
export * from './flows/regenerate-musical-idea';
export * from './flows/render-kids-drawing-flow';
export * from './flows/render-standard-input-art-flow';
