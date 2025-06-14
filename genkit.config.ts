// genkit.config.ts
import { defineConfig } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

export default defineConfig({
 plugins: [googleAI()],
  logLevel: 'debug', // optional
});
// genkit.config.ts
import { defineConfig } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

export default defineConfig({
  plugins: [googleAI()],
  logLevel: 'debug', // optional
});