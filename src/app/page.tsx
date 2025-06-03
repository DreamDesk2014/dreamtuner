
"use client";
import React, { useState, useCallback } from 'react';
import { InputForm } from '@/components/InputForm';
import { MusicOutputDisplay } from '@/components/MusicOutputDisplay';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { generateMusicParametersAction } from '@/app/actions/generateMusicParametersAction';
import { regenerateMusicalIdeaAction } from '@/app/actions/regenerateMusicalIdeaAction';
import type { MusicParameters, AppInput } from '@/types';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { Footer } from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DreamTunerPage() {
  const [musicParams, setMusicParams] = useState<MusicParameters | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRegeneratingIdea, setIsRegeneratingIdea] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);

  const handleInputSubmit = useCallback(async (input: AppInput) => {
    setIsLoading(true);
    setError(null);
    setMusicParams(null);
    setShowWelcome(false);

    try {
      const result = await generateMusicParametersAction(input);
      if ('error' in result) {
        setError(result.error);
      } else {
        setMusicParams(result);
      }
    } catch (err) {
      console.error("Error generating music parameters:", err);
      setError(err instanceof Error ? `Failed to generate music: ${err.message}.` : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRegenerateIdea = useCallback(async () => {
    if (!musicParams) return;
    setIsRegeneratingIdea(true);
    // Clear only regeneration-specific errors, or keep general errors if they exist
    // For simplicity, clearing all errors for now.
    setError(null); 
    try {
      const result = await regenerateMusicalIdeaAction(musicParams);
      if ('error' in result) {
        setError(result.error);
      } else {
        setMusicParams(prevParams => prevParams ? { ...prevParams, generatedIdea: result.newIdea } : null);
      }
    } catch (err) {
      console.error("Error regenerating idea:", err);
      setError(err instanceof Error ? `Failed to regenerate idea: ${err.message}` : "Unknown error regenerating idea.");
    } finally {
      setIsRegeneratingIdea(false);
    }
  }, [musicParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-nebula-dark via-slate-900 to-nebula-dark text-galaxy-white flex flex-col items-center p-4 sm:p-8 font-body">
      <header className="w-full max-w-3xl mb-8 text-center">
        <div className="flex items-center justify-center space-x-3 mb-2">
          <LogoIcon className="w-12 h-12 text-stardust-blue" />
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-stardust-blue to-cosmic-purple font-headline">
            DreamTuner
          </h1>
        </div>
        <p className="text-lg text-slate-300">Translate Your Words, Images, or Video Concepts into Musical Vibrations</p>
      </header>

      <main className="w-full max-w-3xl">
        <Card className="bg-nebula-gray shadow-2xl rounded-xl border-slate-700">
          <CardContent className="p-6 sm:p-10">
            <InputForm onSubmit={handleInputSubmit} isLoading={isLoading} />
          </CardContent>
        </Card>
        
        {isLoading && (
          <div className="mt-10 text-center">
            <LoadingSpinner />
            <p className="mt-4 text-lg text-stardust-blue animate-pulse-subtle">DreamTuning your input...</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="mt-10">
            <ErrorMessage message={error} />
          </div>
        )}
        
        {musicParams && !isLoading && (
          <Card className="mt-10 bg-nebula-gray shadow-2xl rounded-xl border-slate-700">
            <CardContent className="p-6 sm:p-10">
              <MusicOutputDisplay 
                params={musicParams} 
                onRegenerateIdea={handleRegenerateIdea}
                isRegeneratingIdea={isRegeneratingIdea}
              />
            </CardContent>
          </Card>
        )}

        {showWelcome && !isLoading && !error && !musicParams && (
          <Card className="mt-10 text-center p-6 bg-nebula-gray/80 rounded-lg border-slate-700">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold text-stardust-blue mb-3 font-headline">Welcome to DreamTuner</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300">
                Enter text, upload an image, or specify a video concept. Select a genre, and DreamTuner will unveil its musical soul,
                revealing the key, tempo, mood, and instrumental colors hidden within your input.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
