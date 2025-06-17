// src/ai/init.ts

// This file is the single source of truth for Genkit initialization.
import { configureGenkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { createLogger, format, transports } from 'winston';

// State to track initialization
let isConfigured = false;
let initPromise: Promise<void> | null = null;

// Initialize a production-ready Winston logger as recommended.
const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console(),
  ],
});

// Configuration interface for flexibility
interface GenkitConfig {
  plugins?: any[];
  logLevel?: string;
  enableTracingAndMetrics?: boolean;
  [key: string]: any; // Allow additional Genkit options
}

/**
 * Initializes Genkit if not already configured. Safe for concurrent calls.
 * @param options Optional configuration overrides for Genkit.
 * @returns A promise that resolves when initialization is complete.
 * @throws Error if GOOGLE_AI_API_KEY is not set or initialization fails.
 */
export async function ensureGenkitInitialized(options: GenkitConfig = {}): Promise<void> {
  if (isConfigured) {
    logger.debug('Genkit already configured. Skipping initialization.');
    return;
  }
  if (initPromise) {
    logger.debug('Genkit initialization already in progress. Awaiting completion.');
    return initPromise;
  }

  initPromise = (async () => {
    try {
      logger.debug('Initializing Genkit...');

      // Validate API key - a crucial addition for robust error handling.
      if (!process.env.GOOGLE_AI_API_KEY) {
        const error = new Error('CRITICAL ERROR: GOOGLE_AI_API_KEY environment variable is not set.');
        logger.error(error.message);
        throw error;
      }

      // Default configuration with environment-based values
      const defaultConfig: GenkitConfig = {
        plugins: [googleAI({ apiKey: process.env.GOOGLE_AI_API_KEY })],
        logLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        enableTracingAndMetrics: true,
      };

      // Merge default config with provided options
      const config = { ...defaultConfig, ...options };

      await configureGenkit(config);
      isConfigured = true;
      logger.info('Genkit configured successfully.');

    } catch (error) {
      logger.error('Failed to initialize Genkit', { errorMessage: error instanceof Error ? error.message : String(error) });
      throw error; // Re-throw to allow callers to handle
    } finally {
      initPromise = null; // Reset promise after completion
    }
  })();

  return initPromise;
}

// Note: We do not export 'ai' from this file. 
// Other modules will import 'ai' from 'genkit' directly, but only AFTER 
// calling ensureGenkitInitialized() to guarantee it is ready.
