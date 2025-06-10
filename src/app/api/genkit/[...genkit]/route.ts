//
// FILE: src/app/api/genkit/[...genkit]/route.ts
//
import { startFlowsServer } from '@genkit-ai/flow';
import { NextRequest } from 'next/server';

// Create a promise that resolves when Genkit is initialized
const genkitLoader = new Promise<any>((resolve) => {
  // We use a dynamic import() to load the init file.
  // This changes how Next.js handles the import during the build.
  import('@/ai/init').then(() => {
    // After init.ts is loaded, we then load all the flows
    // to ensure they are registered.
    Promise.all([
        import('@/ai/flows/regenerate-musical-idea'),
        import('@/ai/flows/render-kids-drawing-flow'),
        import('@/ai/flows/render-standard-input-art-flow'),
    ]).then(() => resolve(startFlowsServer()));
  });
});

// Create handlers that wait for the promise to resolve
export async function GET(req: NextRequest) {
  const handler = await genkitLoader;
  return handler.GET(req);
}

export async function POST(req: NextRequest) {
  const handler = await genkitLoader;
  return handler.POST(req);
}

export async function OPTIONS(req: NextRequest) {
  const handler = await genkitLoader;
  return handler.OPTIONS(req);
}
