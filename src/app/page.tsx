
"use client";
import React, { useState, useCallback, useId } from 'react';
import { InputForm } from '@/components/InputForm';
import { MusicOutputDisplay } from '@/components/MusicOutputDisplay';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { DrawingCanvas } from '@/components/DrawingCanvas';
import { generateMusicParametersAction } from '@/app/actions/generateMusicParametersAction';
import { regenerateMusicalIdeaAction } from '@/app/actions/regenerateMusicalIdeaAction';
import type { MusicParameters, AppInput, FilePreview } from '@/types';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { Footer } from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { SparklesIcon } from '@/components/icons/SparklesIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MUSIC_GENRES } from '@/lib/constants';

export default function DreamTunerPage() {
  const [musicParams, setMusicParams] = useState<MusicParameters | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRegeneratingIdea, setIsRegeneratingIdea] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  const [currentMode, setCurrentMode] = useState<'standard' | 'kids'>('standard');
  
  const drawingCanvasRef = React.useRef<{ getDataURL: () => string; clearCanvas: () => void }>(null);
  const [selectedGenre, setSelectedGenre] = useState<string>(MUSIC_GENRES[0] || '');
  const genreSelectId = useId();


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

  const handleDrawingSubmit = useCallback(async () => {
    if (!drawingCanvasRef.current) {
      setError("Drawing canvas is not ready.");
      return;
    }
    const drawingDataURL = drawingCanvasRef.current.getDataURL();
    if (!drawingDataURL || drawingDataURL === 'data:,') {
        setError("Please draw something on the canvas first!");
        return;
    }

    const base64Content = drawingDataURL.split(',')[1];
    if (!base64Content) {
      setError("Failed to process drawing data.");
      return;
    }
    
    const fileDetails: FilePreview = {
      name: "kids_drawing.png",
      type: "image/png",
      size: base64Content.length * 0.75, // Approximate size
      url: drawingDataURL,
    };

    const kidsInput: AppInput = {
      type: 'image',
      content: base64Content,
      mimeType: 'image/png',
      fileDetails: fileDetails,
      genre: selectedGenre,
      mode: 'kids',
    };
    handleInputSubmit(kidsInput);
  }, [handleInputSubmit, selectedGenre]);


  const handleRegenerateIdea = useCallback(async () => {
    if (!musicParams) return;
    setIsRegeneratingIdea(true);
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
  
  const mainTitle = currentMode === 'kids' ? "DreamTuner Kids!" : "DreamTuner";
  const mainSubtitle = currentMode === 'kids' 
    ? "Draw a picture and hear its music!"
    : "Translate Your Words, Images, or Video Concepts into Musical Vibrations";

  return (
    <div className="min-h-screen bg-gradient-to-br from-nebula-dark via-slate-900 to-nebula-dark text-galaxy-white flex flex-col items-center p-4 sm:p-8 font-body">
      <header className="w-full max-w-3xl mb-8 text-center">
        <div className="flex items-center justify-center space-x-3 mb-2">
          <LogoIcon className="w-12 h-12 text-stardust-blue" />
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-stardust-blue to-cosmic-purple font-headline">
            {mainTitle}
          </h1>
        </div>
        <p className="text-lg text-slate-300">{mainSubtitle}</p>
      </header>

      <main className="w-full max-w-3xl">
        <Tabs value={currentMode} onValueChange={(value) => setCurrentMode(value as 'standard' | 'kids')} className="w-full mb-8">
          <TabsList className="grid w-full grid-cols-2 bg-nebula-gray/80 border border-slate-700">
            <TabsTrigger value="standard" className="data-[state=active]:bg-cosmic-purple data-[state=active]:text-primary-foreground">Standard Mode</TabsTrigger>
            <TabsTrigger value="kids" className="data-[state=active]:bg-stardust-blue data-[state=active]:text-primary-foreground">Kids Mode</TabsTrigger>
          </TabsList>
        
          <TabsContent value="standard" className="mt-0">
            <Card className="bg-nebula-gray shadow-2xl rounded-xl border-slate-700">
              <CardContent className="p-6 sm:p-10">
                <InputForm 
                  onSubmit={(input) => handleInputSubmit({...input, mode: 'standard'})} 
                  isLoading={isLoading} 
                  selectedGenre={selectedGenre}
                  onGenreChange={setSelectedGenre}
                />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="kids" className="mt-0">
            <Card className="bg-nebula-gray shadow-2xl rounded-xl border-slate-700">
              <CardHeader>
                <CardTitle className="text-center text-2xl font-semibold text-stardust-blue">Draw Your Music!</CardTitle>
              </CardHeader>
              <CardContent className="p-6 sm:p-10 space-y-6">
                <DrawingCanvas ref={drawingCanvasRef} width={500} height={300} />
                <div className="mt-4">
                  <Label htmlFor={genreSelectId + "-kids"} className="block text-lg font-medium text-stardust-blue mb-3">
                    What kind of music style? (Optional):
                  </Label>
                  <Select value={selectedGenre} onValueChange={setSelectedGenre} disabled={isLoading}>
                    <SelectTrigger id={genreSelectId + "-kids"} className="w-full p-3 bg-nebula-gray border border-slate-600 rounded-lg shadow-sm focus:ring-2 focus:ring-cosmic-purple focus:border-cosmic-purple transition-colors duration-150 text-galaxy-white">
                      <SelectValue placeholder="Select a genre" />
                    </SelectTrigger>
                    <SelectContent className="bg-nebula-gray border-slate-500 text-galaxy-white">
                      {MUSIC_GENRES.map(genre => (
                        <SelectItem key={genre} value={genre} className="hover:bg-cosmic-purple/50 focus:bg-cosmic-purple/60">
                          {genre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleDrawingSubmit}
                  disabled={isLoading}
                  className="w-full text-base font-medium rounded-md shadow-sm text-primary-foreground bg-gradient-to-r from-stardust-blue to-green-400 hover:from-sky-500 hover:to-green-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-nebula-dark focus:ring-stardust-blue disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 group"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Tuning Your Drawing...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-5 h-5 mr-2 text-yellow-300 group-hover:scale-110 transition-transform" />
                      Tune My Drawing!
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs> {/* Tabs component now correctly wraps TabsContent */}
        
        {isLoading && (
          <div className="mt-10 text-center">
            <LoadingSpinner />
            <p className="mt-4 text-lg text-stardust-blue animate-pulse-subtle">
              {currentMode === 'kids' ? 'DreamTuning your awesome drawing...' : 'DreamTuning your input...'}
            </p>
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
                revealing the key, tempo, mood, and instrumental colors hidden within your input. Or, switch to Kids Mode and draw something!
              </p>
            </CardContent>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}
