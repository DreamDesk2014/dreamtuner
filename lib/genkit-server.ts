// lib/genkit-server.ts
import { genkit } from 'genkit';
// Assuming your genkit.config.ts is at the project root level, using absolute path from project root
import config from '@/../genkit.config';

genkit(config); // this initializes Genkit with config at cold start