
"use client";
import React, { useState, useCallback, useEffect } from 'react';
import { MusicOutputDisplay } from '@/components/MusicOutputDisplay';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { generateMusicParametersAction } from '@/app/actions/generateMusicParametersAction';
import { regenerateMusicalIdeaAction } from '@/app/actions/regenerateMusicalIdeaAction';
import { renderKidsDrawingAction } from '@/app/actions/renderKidsDrawingAction';
import type { MusicParameters, AppInput, RenderKidsDrawingInput, RenderedDrawingResponse } from '@/types';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { Footer } from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StandardModeTab } from '@/components/StandardModeTab';
import { KidsModeTab } from '@/components/KidsModeTab';
import { toast } from '@/hooks/use-toast';
import { MUSIC_GENRES } from '@/lib/constants';
import { NavigationBar } from '@/components/NavigationBar';
import { Badge } from "@/components/ui/badge";


export default function DreamTunerPage() {
  const [musicParams, setMusicParams] = useState<MusicParameters | null>(null);
  const [isLoadingMusic, setIsLoadingMusic] = useState<boolean>(false);
  const [isRegeneratingIdea, setIsRegeneratingIdea] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  const [currentMode, setCurrentMode] = useState<'standard' | 'kids'>('standard');
  const [isClientMounted, setIsClientMounted] = useState(false);

  const [aiKidsArtUrl, setAiKidsArtUrl] = useState<string | null>(null);
  const [isRenderingAiKidsArt, setIsRenderingAiKidsArt] = useState<boolean>(false);
  const [aiKidsArtError, setAiKidsArtError] = useState<string | null>(null);
  
  const [selectedGenre, setSelectedGenre] = useState<string>(MUSIC_GENRES[0] || '');
  const [currentKidsMusicParams, setCurrentKidsMusicParams] = useState<MusicParameters | null>(null);


  useEffect(() => {
    setIsClientMounted(true);
  }, []);
  
  const handleModeChange = (newMode: 'standard' | 'kids') => {
    setCurrentMode(newMode);
    setMusicParams(null);
    setError(null);
    setAiKidsArtUrl(null);
    setAiKidsArtError(null);
    setShowWelcome(true);
    setSelectedGenre(MUSIC_GENRES[0] || ''); 
    setCurrentKidsMusicParams(null);
  };

  const handleStandardModeSubmit = useCallback(async (input: AppInput) => {
    setIsLoadingMusic(true);
    setError(null);
    setMusicParams(null);
    setShowWelcome(false);
    setAiKidsArtUrl(null); 
    setAiKidsArtError(null);
    setIsRenderingAiKidsArt(false);
    setCurrentKidsMusicParams(null);


    try {
      const musicResult = await generateMusicParametersAction(input);
      if ('error' in musicResult) {
        setError(musicResult.error);
        setMusicParams(null);
      } else {
        setMusicParams(musicResult);
        setError(null);
      }
    } catch (err) {
      console.error("Error in standard submission process:", err);
      setError(err instanceof Error ? `Failed process input: ${err.message}.` : "An unknown error occurred.");
      setMusicParams(null);
    } finally {
      setIsLoadingMusic(false);
    }
  }, []);

  const handleKidsModeTuneCreation = useCallback(async (
    musicInput: AppInput, 
    artInput: RenderKidsDrawingInput | null
  ): Promise<{ musicError?: string; artError?: string; musicParamsResult?: MusicParameters, artUrlResult?: string }> => {
    
    setIsLoadingMusic(true);
    if (artInput) setIsRenderingAiKidsArt(true);
    setError(null);
    setMusicParams(null);
    setCurrentKidsMusicParams(null); 
    setAiKidsArtUrl(null);
    setAiKidsArtError(null);
    setShowWelcome(false);

    let generatedMusicalIdea: string | undefined = undefined;
    let musicParametersResult: MusicParameters | undefined = undefined;
    let musicGenError: string | undefined = undefined;
    let artRenderError: string | undefined = undefined;
    let artRenderUrl: string | undefined = undefined;

    try {
      toast({ title: "DreamTuner Magic ✨", description: "Generating musical ideas..." });
      const musicResult = await generateMusicParametersAction(musicInput);
      if ('error' in musicResult) {
        musicGenError = musicResult.error;
        setError(musicResult.error); 
        setMusicParams(null);
      } else {
        musicParametersResult = musicResult;
        setMusicParams(musicResult);
        setCurrentKidsMusicParams(musicResult); 
        generatedMusicalIdea = musicResult.generatedIdea;
        setError(null);
      }
    } catch (err) {
      console.error("Error in music generation for drawing/voice:", err);
      const specificError = err instanceof Error ? `Music generation failed: ${err.message}.` : "Unknown music generation error.";
      musicGenError = specificError;
      setError(specificError);
      setMusicParams(null);
    } finally {
      setIsLoadingMusic(false);
    }

    if (artInput) {
      artInput.originalMusicalIdea = generatedMusicalIdea; 
      try {
        toast({ title: "AI Artist at Work 🎨", description: "Reimagining your concept..." });
        const artResult = await renderKidsDrawingAction(
            artInput.drawingDataUri, 
            artInput.originalVoiceHint, 
            artInput.originalMusicalIdea,
            artInput.drawingSoundSequence
        );
        if ('error' in artResult) {
            artRenderError = artResult.error;
            setAiKidsArtError(artResult.error);
            toast({ variant: "destructive", title: "AI Artist Hiccup", description: `Couldn't create art: ${artResult.error}` });
        } else if (artResult.renderedDrawingDataUrl) {
            artRenderUrl = artResult.renderedDrawingDataUrl;
            setAiKidsArtUrl(artResult.renderedDrawingDataUrl);
            setAiKidsArtError(null);
            toast({ title: "Artwork Ready!", description: "Your AI art has been created!" });
        }
      } catch (err) {
        console.error("Error rendering AI art:", err);
        const specificError = err instanceof Error ? `AI art rendering failed: ${err.message}` : "Unknown AI art rendering error.";
        artRenderError = specificError;
        setAiKidsArtError(specificError);
        toast({ variant: "destructive", title: "AI Artist Error", description: "Something went wrong while creating the art." });
      } finally {
        setIsRenderingAiKidsArt(false);
      }
    } else {
        setIsRenderingAiKidsArt(false);
    }
    
    return { musicError: musicGenError, artError: artRenderError, musicParamsResult: musicParametersResult, artUrlResult: artRenderUrl };

  }, []);


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
    ? "Draw, make sounds, add voice hints! Hear music & see AI art!"
    : "Translate Your Words, Images, or Video Concepts into Musical Vibrations";

  return (
    <div className="min-h-screen bg-gradient-to-br from-nebula-dark via-slate-900 to-nebula-dark text-galaxy-white flex flex-col items-center p-4 sm:p-8 font-body">
      <NavigationBar />
      <header className="w-full max-w-3xl mb-8 text-center">
        <div className="flex items-center justify-center space-x-2 sm:space-x-3 mb-2">
          <LogoIcon className="w-10 h-10 sm:w-12 sm:h-12" /> 
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-stardust-blue to-cosmic-purple font-headline">
            {mainTitle}
          </h1>
          <Badge variant="outline" className="border-amber-500 text-amber-400 text-xs sm:text-sm font-semibold px-1.5 py-0.5 sm:px-2">BETA</Badge>
        </div>
        <p className="text-md sm:text-lg text-slate-300">{mainSubtitle}</p>
      </header>

      <main className="w-full max-w-3xl">
        <Tabs value={currentMode} onValueChange={(value) => handleModeChange(value as 'standard' | 'kids')} className="w-full mb-8">
          <TabsList className="grid w-full grid-cols-2 bg-nebula-gray/80 border border-slate-700">
            <TabsTrigger value="standard" className="data-[state=active]:bg-cosmic-purple data-[state=active]:text-primary-foreground">Standard Mode</TabsTrigger>
            <TabsTrigger value="kids" className="data-[state=active]:bg-stardust-blue data-[state=active]:text-primary-foreground">Kids Mode</TabsTrigger>
          </TabsList>
        
          <TabsContent value="standard" className="mt-6">
            <StandardModeTab
              onSubmit={handleStandardModeSubmit}
              isLoading={isLoadingMusic}
              selectedGenre={selectedGenre}
              onGenreChange={setSelectedGenre}
            />
          </TabsContent>
          
          <TabsContent value="kids" className="mt-6">
            <KidsModeTab
              key={`kids-mode-tab-${currentMode}`} 
              onTuneCreation={handleKidsModeTuneCreation}
              isLoadingMusic={isLoadingMusic}
              isRenderingArt={isRenderingAiKidsArt}
              aiKidsArtUrlProp={aiKidsArtUrl} 
              aiKidsArtErrorProp={aiKidsArtError}
              selectedGenre={selectedGenre}
              onGenreChange={setSelectedGenre}
              isClientMounted={isClientMounted}
              currentMusicParamsFromPage={currentKidsMusicParams}
            />
          </TabsContent>
        </Tabs>
        
        {isLoadingMusic && currentMode === 'standard' && !musicParams && (
          <div className="mt-10 text-center">
            <LoadingSpinner />
            <p className="mt-4 text-lg text-stardust-blue animate-pulse-subtle">
              DreamTuning your input...
            </p>
          </div>
        )}
        
         {isLoadingMusic && currentMode === 'kids' && !musicParams && !aiKidsArtUrl && (
           <div className="mt-10 text-center">
            <LoadingSpinner />
            <p className="mt-4 text-lg text-stardust-blue animate-pulse-subtle">
                DreamTuning music for your creation... (AI art will follow!)
            </p>
          </div>
        )}


        {error && !isLoadingMusic && !isRenderingAiKidsArt && (
          <div className="mt-10">
            <ErrorMessage message={error} />
          </div>
        )}
        
        {showWelcome && !isLoadingMusic && !isRenderingAiKidsArt && !error && !musicParams && !aiKidsArtUrl && (
          <Card className="mt-10 text-center p-6 bg-nebula-gray/80 rounded-lg border-slate-700">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold text-stardust-blue mb-3 font-headline">Welcome to DreamTuner</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300">
                {currentMode === 'standard' 
                  ? "Enter text (or speak!), upload an image, or specify a video/audio concept. Select a genre, and DreamTuner will unveil its musical soul."
                  : "Sketch on the canvas (hear notes as you pick colors!), record a voice hint, or do both! Select a genre if you like, and click 'Tune My Creation!' to see and hear the magic!"
                }
              </p>
            </CardContent>
          </Card>
        )}

        {musicParams && !isLoadingMusic && ( 
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
      </main>
      <Footer />
    </div>
  );
}
