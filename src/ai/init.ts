//
// FILE: src/ai/init.ts
//
import { configureGenkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

console.log('Initializing Genkit...');

configureGenkit({
  plugins: [
    googleAI(),
  ],
  logSinks: ['stdout'],
  traceSinks: ['stdout'],
  enableTracingAndMetrics: true,
});

console.log('Genkit initialized.');
// Final build trigger
