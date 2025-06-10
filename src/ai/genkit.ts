//
// FILE: src/ai/genkit.ts
//
import { configureGenkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

// This file now ONLY configures Genkit.
configureGenkit({
  plugins: [
    googleAI(),
  ],
  logSinks: ['stdout'],
  traceSinks: ['stdout'],
  enableTracingAndMetrics: true,
});
