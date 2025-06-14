// src/lib/genkit-server.ts
 
import { defineFlow, init as initializeGenkit } from '@genkit-ai/flow';
import { z } from 'zod';

// Define your flows here or import them from other files
defineFlow(
  {
    name: 'helloFlow',
    inputSchema: z.object({
      name: z.string().optional(),
    }),
    outputSchema: z.string(),
  },
  async (input) => {
    const name = input.name ?? 'World';
    return `Hello, ${name}!` as string; // Added type assertion for clarity
  }
);

// Only initialize once per cold start
initializeGenkit({
  // If using Google Cloud, Firebase, etc., include relevant plugins here
  // plugins: [yourPlugin()],
  flows: [], // You can list flows explicitly or let Genkit pick up from `defineFlow` calls
  logLevel: 'debug',
});