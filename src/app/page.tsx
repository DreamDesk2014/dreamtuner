
"use client";
import React, { useState, useCallback, useId, useEffect, useRef } from 'react';
import { InputForm } from '@/components/InputForm';
import { MusicOutputDisplay } from '@/components/MusicOutputDisplay';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { DrawingCanvas } from '@/components/DrawingCanvas';
import { generateMusicParametersAction } from '@/app/actions/generateMusicParametersAction';
import { regenerateMusicalIdeaAction } from '@/app/actions/regenerateMusicalIdeaAction';
import { renderKidsDrawingAction } from '@/app/actions/renderKidsDrawingAction';
import type { MusicParameters, AppInput, FilePreview } from '@/types';
import { LogoIcon } from '@/components/icons/LogoIcon';
import { Footer } from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { SparklesIcon } from '@/components/icons/SparklesIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MUSIC_GENRES } from '@/lib/constants';
import useSpeechRecognition from '@/hooks/useSpeechRecognition';
import { Mic, MicOff, Image as LucideImage, Download } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import Image from 'next/image';


export default function DreamTunerPage() {
  const [musicParams, setMusicParams] = useState<MusicParameters | null>(null);
  const [isLoadingMusic, setIsLoadingMusic] = useState<boolean>(false);
  const [isRegeneratingIdea, setIsRegeneratingIdea] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  const [currentMode, setCurrentMode] = useState<'standard' | 'kids'>('standard');
  const [isClientMounted, setIsClientMounted] = useState(false);

  // State for Kids Mode AI Art
  const [aiKidsArtUrl, setAiKidsArtUrl] = useState<string | null>(null);
  const [isRenderingAiKidsArt, setIsRenderingAiKidsArt] = useState<boolean>(false);
  const [aiKidsArtError, setAiKidsArtError] = useState<string | null>(null);

  useEffect(() => {
    setIsClientMounted(true);
  }, []);
  
  const drawingCanvasRef = useRef<{ getDataURL: () => string; clearCanvas: () => void }>(null);
  const [selectedGenre, setSelectedGenre] = useState<string>(MUSIC_GENRES[0] || '');
  const genreSelectId = useId();

  const {
    transcript: kidsVoiceTranscript,
    interimTranscript: kidsInterimTranscript,
    isListening: isListeningKids,
    startListening: startListeningKids,
    stopListening: stopListeningKids,
    hasRecognitionSupport: hasRecognitionSupportKids,
    error: speechErrorKids,
    resetTranscript: resetKidsTranscript
  } = useSpeechRecognition();

  const handleModeChange = (newMode: 'standard' | 'kids') => {
    setCurrentMode(newMode);
    setMusicParams(null);
    setError(null);
    setShowWelcome(true);
    setSelectedGenre(MUSIC_GENRES[0] || ''); 

    setAiKidsArtUrl(null);
    setIsRenderingAiKidsArt(false);
    setAiKidsArtError(null);

    if (drawingCanvasRef.current) {
      drawingCanvasRef.current.clearCanvas();
    }
    resetKidsTranscript();
    if (isListeningKids) { // Stop listening if active during mode change
        stopListeningKids();
    }
  };


  const handleStandardInputSubmit = useCallback(async (input: AppInput) => {
    setIsLoadingMusic(true);
    setError(null);
    setMusicParams(null);
    setShowWelcome(false);

    // Ensure Kids Mode art is cleared if switching from Kids to Standard results
    setAiKidsArtUrl(null);
    setAiKidsArtError(null);
    setIsRenderingAiKidsArt(false);

    try {
      const musicResult = await generateMusicParametersAction(input);
      if ('error' in musicResult) {
        setError(musicResult.error);
        setMusicParams(null);
      } else {
        setMusicParams(musicResult);
      }
    } catch (err) {
      console.error("Error in standard submission process:", err);
      setError(err instanceof Error ? `Failed process input: ${err.message}.` : "An unknown error occurred.");
      setMusicParams(null);
    } finally {
      setIsLoadingMusic(false);
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
        toast({ variant: "destructive", title: "Empty Canvas", description: "Please draw something before tuning!" });
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
      size: base64Content.length * 0.75, 
      url: drawingDataURL,
    };

    const kidsInput: AppInput = {
      type: 'image',
      content: base64Content, 
      mimeType: 'image/png',
      fileDetails: fileDetails, 
      genre: selectedGenre,
      mode: 'kids',
      voiceDescription: kidsVoiceTranscript.trim() || undefined, 
    };

    setIsLoadingMusic(true);
    setIsRenderingAiKidsArt(true); // Start loading for AI art as well
    setError(null);
    setMusicParams(null);
    setAiKidsArtUrl(null);
    setAiKidsArtError(null);
    setShowWelcome(false);

    let generatedMusicalIdea: string | undefined = undefined;

    // Generate Music First
    try {
      toast({ title: "DreamTuner Magic ✨", description: "Generating musical ideas for your drawing..." });
      const musicResult = await generateMusicParametersAction(kidsInput);
      if ('error' in musicResult) {
        setError(musicResult.error);
        setMusicParams(null);
      } else {
        setMusicParams(musicResult);
        generatedMusicalIdea = musicResult.generatedIdea;
        // Don't toast success for music yet, wait for art
      }
    } catch (err) {
      console.error("Error in music generation for drawing:", err);
      setError(err instanceof Error ? `Music generation failed: ${err.message}.` : "Unknown music generation error.");
      setMusicParams(null);
    } finally {
      setIsLoadingMusic(false); // Music part is done
    }

    // Then Render AI Art, regardless of music success, if drawingDataURL exists
    if (drawingDataURL) {
        try {
            toast({ title: "AI Artist at Work 🎨", description: "Reimagining your awesome drawing..." });
            const renderResult = await renderKidsDrawingAction(drawingDataURL, kidsInput.voiceDescription, generatedMusicalIdea);
            if ('error' in renderResult) {
                setAiKidsArtError(renderResult.error);
                toast({ variant: "destructive", title: "AI Artist Hiccup", description: `Couldn't render the drawing: ${renderResult.error}` });
            } else if (renderResult.renderedDrawingDataUrl) {
                setAiKidsArtUrl(renderResult.renderedDrawingDataUrl);
                toast({ title: "Artwork Ready!", description: "Your drawing has been reimagined!" });
            }
        } catch (err) {
            console.error("Error rendering AI art:", err);
            setAiKidsArtError(err instanceof Error ? `AI art rendering failed: ${err.message}` : "Unknown AI art rendering error.");
            toast({ variant: "destructive", title: "AI Artist Error", description: "Something went wrong while creating the art." });
        } finally {
            setIsRenderingAiKidsArt(false); // Art part is done
        }
    } else {
        setIsRenderingAiKidsArt(false); // No drawing data URL, so stop art rendering
    }

  }, [selectedGenre, kidsVoiceTranscript]);

  const handleKidsVoiceInputToggle = () => {
    if (isListeningKids) {
      stopListeningKids();
    } else {
      resetKidsTranscript();
      startListeningKids();
    }
  };

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

  const handleDownloadAiArt = () => {
    if (aiKidsArtUrl) {
      const link = document.createElement('a');
      link.href = aiKidsArtUrl;
      link.download = 'dreamtuner_ai_rendition.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
  
  const mainTitle = currentMode === 'kids' ? "DreamTuner Kids!" : "DreamTuner";
  const mainSubtitle = currentMode === 'kids' 
    ? "Draw a picture, add a voice hint, and hear its music & see it reimagined!"
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
        <Tabs value={currentMode} onValueChange={(value) => handleModeChange(value as 'standard' | 'kids')} className="w-full mb-8">
          <TabsList className="grid w-full grid-cols-2 bg-nebula-gray/80 border border-slate-700">
            <TabsTrigger value="standard" className="data-[state=active]:bg-cosmic-purple data-[state=active]:text-primary-foreground">Standard Mode</TabsTrigger>
            <TabsTrigger value="kids" className="data-[state=active]:bg-stardust-blue data-[state=active]:text-primary-foreground">Kids Mode</TabsTrigger>
          </TabsList>
        
          <TabsContent value="standard" className="mt-6">
            <Card className="bg-nebula-gray shadow-2xl rounded-xl border-slate-700">
              <CardContent className="p-6 sm:p-10">
                <InputForm 
                  key={`input-form-${currentMode}`}
                  onSubmit={(input) => handleStandardInputSubmit({...input, mode: 'standard'})} 
                  isLoading={isLoadingMusic} 
                  selectedGenre={selectedGenre}
                  onGenreChange={setSelectedGenre}
                />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="kids" className="mt-6">
            <Card className="bg-nebula-gray shadow-2xl rounded-xl border-slate-700">
              <CardHeader>
                <CardTitle className="text-center text-2xl font-semibold text-stardust-blue">Draw Your Music!</CardTitle>
                <CardDescription className="text-center text-sm text-slate-300">Sketch something, add a voice hint if you like, and see what music it makes and how AI sees your art!</CardDescription>
              </CardHeader>
              <CardContent className="p-6 sm:p-10 space-y-6">
                <DrawingCanvas ref={drawingCanvasRef} width={500} height={300} />
                
                <div className="mt-4 space-y-2">
                  <Label className="block text-md font-medium text-stardust-blue">
                    Add a Voice Hint (Optional):
                  </Label>
                  {isClientMounted && hasRecognitionSupportKids ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleKidsVoiceInputToggle}
                      disabled={isLoadingMusic || isRenderingAiKidsArt} // Corrected: Remove isListeningKids
                      className="w-full text-sm border-slate-600 hover:bg-slate-700 flex items-center justify-center"
                    >
                      {isListeningKids ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                      {isListeningKids ? 'Stop Listening & Save Hint' : 'Record Voice Hint'}
                    </Button>
                  ) : isClientMounted && !hasRecognitionSupportKids ? (
                     <p className="text-xs text-muted-foreground text-center">Voice input not supported in this browser.</p>
                  ) : null }
                  {isListeningKids && (
                    <p className="text-sm text-slate-300 text-center p-2 bg-slate-700/50 rounded-md">
                      Listening: <em className="text-galaxy-white">{kidsVoiceTranscript}{kidsInterimTranscript}</em>
                    </p>
                  )}
                  {!isListeningKids && kidsVoiceTranscript && (
                     <p className="text-sm text-slate-300 text-center p-2 bg-slate-700/50 rounded-md">
                      Your hint: <em className="text-galaxy-white">{kidsVoiceTranscript}</em>
                    </p>
                  )}
                  {speechErrorKids && <p className="mt-1 text-xs text-red-400 text-center">{speechErrorKids}</p>}
                </div>

                <div className="mt-4">
                  <Label htmlFor={genreSelectId + "-kids"} className="block text-lg font-medium text-stardust-blue mb-3">
                    What kind of music style? (Optional):
                  </Label>
                  <Select value={selectedGenre} onValueChange={setSelectedGenre} disabled={isLoadingMusic || isListeningKids || isRenderingAiKidsArt}>
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
                  disabled={isLoadingMusic || isListeningKids || isRenderingAiKidsArt}
                  className="w-full text-base font-medium rounded-md shadow-sm text-primary-foreground bg-gradient-to-r from-stardust-blue to-green-400 hover:from-sky-500 hover:to-green-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-nebula-dark focus:ring-stardust-blue disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 group"
                  size="lg"
                >
                  {(isLoadingMusic && !isRenderingAiKidsArt) || (isLoadingMusic && isRenderingAiKidsArt) ? ( // Combined loading for music phase
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Tuning Music...
                    </>
                  ) : !isLoadingMusic && isRenderingAiKidsArt ? ( // Art rendering phase (music is done)
                     <>
                      <LucideImage className="animate-pulse -ml-1 mr-3 h-5 w-5 text-primary-foreground" />
                      AI Painting Your Sketch...
                    </>
                  ) : ( // Idle
                    <>
                      <SparklesIcon className="w-5 h-5 mr-2 text-yellow-300 group-hover:scale-110 transition-transform" />
                      Tune My Drawing!
                    </>
                  )}
                </Button>

                {/* AI Rendered Art Section - Directly under "Tune My Drawing!" button */}
                {isRenderingAiKidsArt && !aiKidsArtUrl && ( // Show loading for art only if not yet loaded
                  <div className="mt-6 text-center">
                    <LoadingSpinner />
                    <p className="mt-2 text-sm text-stardust-blue animate-pulse-subtle">AI is reimagining your drawing...</p>
                  </div>
                )}
                {aiKidsArtError && (
                  <div className="mt-6">
                    <ErrorMessage message={`AI Artist Error: ${aiKidsArtError}`} />
                  </div>
                )}
                {aiKidsArtUrl && !isRenderingAiKidsArt && (
                  <Card className="mt-6 bg-nebula-gray/50 border-slate-600">
                    <CardHeader>
                      <CardTitle className="text-center text-xl font-semibold text-stardust-blue">AI's Artistic Rendition!</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center space-y-4">
                      <Image 
                        src={aiKidsArtUrl} 
                        alt="AI Rendered Sketch of Kid's Drawing" 
                        data-ai-hint="illustration drawing"
                        width={400} 
                        height={250} 
                        className="rounded-md max-h-64 object-contain border border-slate-500 shadow-lg"
                      />
                      <Button onClick={handleDownloadAiArt} variant="outline" className="border-stardust-blue text-stardust-blue hover:bg-stardust-blue/10">
                        <Download className="w-4 h-4 mr-2" />
                        Download AI Art
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        {/* Display area for general loading (Standard Mode), errors, welcome, or music results */}
        {/* General Loading for Standard Mode (music only) */}
        {isLoadingMusic && !musicParams && currentMode === 'standard' && (
          <div className="mt-10 text-center">
            <LoadingSpinner />
            <p className="mt-4 text-lg text-stardust-blue animate-pulse-subtle">
              DreamTuning your input...
            </p>
          </div>
        )}
        
        {/* Loading for Kids Mode Music Generation (if AI art hasn't started/finished yet) */}
        {isLoadingMusic && currentMode === 'kids' && !musicParams && !aiKidsArtUrl && !isRenderingAiKidsArt && (
           <div className="mt-10 text-center">
            <LoadingSpinner />
            <p className="mt-4 text-lg text-stardust-blue animate-pulse-subtle">
                DreamTuning music for your awesome drawing...
            </p>
          </div>
        )}

        {/* General Error Display (if not loading) */}
        {error && !isLoadingMusic && !isRenderingAiKidsArt && (
          <div className="mt-10">
            <ErrorMessage message={error} />
          </div>
        )}
        
        {/* Welcome Message */}
        {showWelcome && !isLoadingMusic && !error && !musicParams && !aiKidsArtUrl && (
          <Card className="mt-10 text-center p-6 bg-nebula-gray/80 rounded-lg border-slate-700">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold text-stardust-blue mb-3 font-headline">Welcome to DreamTuner</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300">
                {currentMode === 'standard' 
                  ? "Enter text (or speak!), upload an image, or specify a video concept. Select a genre, and DreamTuner will unveil its musical soul."
                  : "Sketch on the canvas, optionally add a voice hint or genre, and click 'Tune My Drawing!' to see and hear the magic!"
                }
              </p>
            </CardContent>
          </Card>
        )}

        {/* Music Output Display - Now separate from AI Art in Kids Mode */}
        {musicParams && !isLoadingMusic && ( // Show music params if they exist and music is no longer loading
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
    
