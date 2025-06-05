
"use client";
import React, { useState, useCallback, useEffect } from 'react';
import { MusicOutputDisplay } from '@/components/MusicOutputDisplay';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { generateMusicParametersAction } from '@/app/actions/generateMusicParametersAction';
import { regenerateMusicalIdeaAction } from '@/app/actions/regenerateMusicalIdeaAction';
import { renderKidsDrawingAction } from '@/app/actions/renderKidsDrawingAction';
import { renderStandardInputArtAction } from '@/app/actions/renderStandardInputArtAction'; // New action
import type { MusicParameters, AppInput, RenderKidsDrawingInput, RenderedDrawingResponse, RenderedStandardArtResponse } from '@/types';
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
import Image from 'next/image'; // For displaying AI art
import { Button } from '@/components/ui/button';
import { Download, Share2, ListMusic, Album } from 'lucide-react';
import { dataURLtoFile } from '@/lib/utils';
import { generateMidiFile } from '@/lib/midiService';


export default function DreamTunerPage() {
  const [musicParams, setMusicParams] = useState<MusicParameters | null>(null);
  const [isLoadingMusic, setIsLoadingMusic] = useState<boolean>(false);
  const [isRegeneratingIdea, setIsRegeneratingIdea] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  const [currentMode, setCurrentMode] = useState<'standard' | 'kids' | 'comingSoon'>('standard');
  const [isClientMounted, setIsClientMounted] = useState(false);

  // Kids Mode Art State
  const [aiKidsArtUrl, setAiKidsArtUrl] = useState<string | null>(null);
  const [isRenderingAiKidsArt, setIsRenderingAiKidsArt] = useState<boolean>(false);
  const [aiKidsArtError, setAiKidsArtError] = useState<string | null>(null);
  const [currentKidsMusicParams, setCurrentKidsMusicParams] = useState<MusicParameters | null>(null);

  // Standard Mode Art State
  const [standardModeAiArtUrl, setStandardModeAiArtUrl] = useState<string | null>(null);
  const [isRenderingStandardModeAiArt, setIsRenderingStandardModeAiArt] = useState<boolean>(false);
  const [standardModeAiArtError, setStandardModeAiArtError] = useState<string | null>(null);
  const [isSharingStandardArt, setIsSharingStandardArt] = useState<boolean>(false);
  const [shareStandardArtError, setShareStandardArtError] = useState<string | null>(null);

  const [selectedGenre, setSelectedGenre] = useState<string>(MUSIC_GENRES[0] || '');


  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  const resetAllArtStates = () => {
    setAiKidsArtUrl(null);
    setAiKidsArtError(null);
    setIsRenderingAiKidsArt(false);
    setStandardModeAiArtUrl(null);
    setStandardModeAiArtError(null);
    setIsRenderingStandardModeAiArt(false);
  };

  const handleModeChange = (newMode: 'standard' | 'kids' | 'comingSoon') => {
    setCurrentMode(newMode);
    setMusicParams(null);
    setError(null);
    resetAllArtStates();
    setShowWelcome(newMode !== 'comingSoon'); // Don't show welcome for "Coming Soon"
    if (newMode !== 'comingSoon') {
      setSelectedGenre(MUSIC_GENRES[0] || '');
    }
    setCurrentKidsMusicParams(null);
  };

  const handleStandardModeSubmit = useCallback(async (input: AppInput) => {
    setIsLoadingMusic(true);
    setError(null);
    setMusicParams(null);
    setShowWelcome(false);
    resetAllArtStates();
    setCurrentKidsMusicParams(null);

    try {
      toast({ title: "DreamTuner Magic ✨", description: "Generating musical ideas..." });
      const musicResult = await generateMusicParametersAction(input);
      if ('error' in musicResult) {
        setError(musicResult.error);
        setMusicParams(null);
      } else {
        setMusicParams(musicResult);
        setError(null);

        if (musicResult.generatedIdea) {
          setIsRenderingStandardModeAiArt(true);
          setStandardModeAiArtError(null);
          setStandardModeAiArtUrl(null);
          toast({ title: "AI Artist at Work 🎨", description: "Crafting visual representation..." });

          try {
            const artResult = await renderStandardInputArtAction(
              musicResult.originalInput,
              musicResult.generatedIdea
            );
            if ('error' in artResult) {
              setStandardModeAiArtError(artResult.error);
              toast({ variant: "destructive", title: "Standard Art Hiccup", description: `Couldn't create art: ${artResult.error}` });
            } else if (artResult.renderedArtDataUrl) {
              setStandardModeAiArtUrl(artResult.renderedArtDataUrl);
              setStandardModeAiArtError(null);
              toast({ title: "Standard Artwork Ready!", description: "Your AI art has been created!" });
            }
          } catch (artErr) {
            console.error("Error rendering standard mode AI art:", artErr);
            const specificArtError = artErr instanceof Error ? `AI art rendering failed: ${artErr.message}` : "Unknown AI art rendering error.";
            setStandardModeAiArtError(specificArtError);
            toast({ variant: "destructive", title: "Standard Art Error", description: "Something went wrong while creating the art." });
          } finally {
            setIsRenderingStandardModeAiArt(false);
          }
        }
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
    setStandardModeAiArtUrl(null);
    setStandardModeAiArtError(null);
    setIsRenderingStandardModeAiArt(false);
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
        setMusicParams(prevParams => {
          if (!prevParams) return null;
          const updatedParams = { ...prevParams, generatedIdea: result.newIdea };

          if (currentMode === 'standard' && updatedParams.originalInput) {
            setIsRenderingStandardModeAiArt(true);
            setStandardModeAiArtError(null);
            setStandardModeAiArtUrl(null); 
            toast({ title: "AI Artist at Work 🎨", description: "Reimagining visual for new idea..." });

            renderStandardInputArtAction(updatedParams.originalInput, result.newIdea)
              .then(artResult => {
                if ('error' in artResult) {
                  setStandardModeAiArtError(artResult.error);
                  toast({ variant: "destructive", title: "Standard Art Hiccup", description: `Couldn't update art: ${artResult.error}` });
                } else if (artResult.renderedArtDataUrl) {
                  setStandardModeAiArtUrl(artResult.renderedArtDataUrl);
                  setStandardModeAiArtError(null);
                  toast({ title: "Standard Artwork Updated!", description: "AI art for new idea is ready!" });
                }
              })
              .catch(artErr => {
                console.error("Error re-rendering standard mode AI art:", artErr);
                setStandardModeAiArtError(artErr instanceof Error ? artErr.message : "Unknown error updating art.");
              })
              .finally(() => {
                setIsRenderingStandardModeAiArt(false);
              });
          }
          return updatedParams;
        });
      }
    } catch (err) {
      console.error("Error regenerating idea:", err);
      setError(err instanceof Error ? `Failed to regenerate idea: ${err.message}` : "Unknown error regenerating idea.");
    } finally {
      setIsRegeneratingIdea(false);
    }
  }, [musicParams, currentMode]);


  const handleDownloadStandardArt = () => {
    if (standardModeAiArtUrl) {
      const link = document.createElement('a');
      link.href = standardModeAiArtUrl;
      link.download = 'dreamtuner_standard_art.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleShareStandardCreation = async () => {
    setShareStandardArtError(null);
    if (!navigator.share) {
      toast({ variant: "destructive", title: "Share Not Supported", description: "Web Share API is not available." });
      setShareStandardArtError("Web Share API not supported.");
      return;
    }
    if (!standardModeAiArtUrl && !musicParams) {
        toast({ variant: "destructive", title: "Nothing to Share", description: "Please generate music and art first." });
        return;
    }

    setIsSharingStandardArt(true);
    const filesToShareAttempt: (File | null)[] = [];
    let shareText = "Check out what I made with DreamTuner!";
    if (musicParams?.generatedIdea) {
        shareText += `\nMusical Idea: "${musicParams.generatedIdea}"`;
    }

    try {
        if (standardModeAiArtUrl) {
            const artFile = dataURLtoFile(standardModeAiArtUrl, "dreamtuner_standard_art.png");
            if (artFile) filesToShareAttempt.push(artFile);
        }
        if (musicParams) {
            const midiDataUri = generateMidiFile(musicParams);
            if (midiDataUri && midiDataUri.startsWith('data:audio/midi;base64,')) {
                let baseFileName = 'dreamtuner_standard_music';
                if (musicParams.generatedIdea) {
                    baseFileName = musicParams.generatedIdea.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_').slice(0, 25);
                }
                const midiFile = dataURLtoFile(midiDataUri, `${baseFileName}.mid`);
                if (midiFile) filesToShareAttempt.push(midiFile);
            } else {
                 console.warn("Could not generate MIDI for standard mode sharing or MIDI data was invalid.");
            }
        }
        const validFilesToShare = filesToShareAttempt.filter(f => f !== null) as File[];
        if (validFilesToShare.length === 0) {
           throw new Error("No shareable content could be prepared.");
        }

        await navigator.share({
            title: "My DreamTuner Creation!",
            text: shareText,
            files: validFilesToShare,
        });
        toast({ title: "Shared Creation Successfully!" });
    } catch (error: any) {
        if (error.name === 'AbortError') {
            toast({ title: "Share Cancelled", variant: "default" });
        } else {
            toast({ variant: "destructive", title: "Share Failed", description: error.message || "Could not share." });
        }
        setShareStandardArtError(error.message || "Failed to share creation.");
    } finally {
        setIsSharingStandardArt(false);
    }
  };


  let mainSubtitle = "Translate Your Words, Images, or Video Concepts into Musical Vibrations";
  if (currentMode === 'kids') {
    mainSubtitle = "Draw, make sounds, add voice hints! Hear music & see AI art!";
  } else if (currentMode === 'comingSoon') {
    mainSubtitle = "Exciting new features are on the way!";
  }

  const isLoadingOverall = isLoadingMusic || isRenderingStandardModeAiArt || isRenderingAiKidsArt;

  return (
    <div className="min-h-screen bg-gradient-to-tr from-gradient-blue-dark to-gradient-blue-light/65 text-galaxy-white flex flex-col items-center p-4 sm:p-8 font-body">
      <NavigationBar />
      <header className="w-full max-w-3xl mb-8 text-center">
        <div className="flex items-center justify-center space-x-2 sm:space-x-3 mb-2">
          <LogoIcon className="w-10 h-10 sm:w-12 sm:h-12" />
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight font-headline">
            {currentMode === 'kids' ? (
              <>
                <span style={{ color: 'rgb(0, 41, 66)' }}>Dream</span>
                <span style={{ color: 'rgb(41, 171, 226)' }}>Tuner</span>
                <span style={{ color: 'hsl(var(--accent))' }}> Kids!</span>
              </>
            ) : (
              <>
                <span style={{ color: 'rgb(0, 41, 66)' }}>Dream</span>
                <span style={{ color: 'rgb(41, 171, 226)' }}>Tuner</span>
              </>
            )}
          </h1>
          <Badge variant="outline" className="border-amber-500 text-amber-400 text-[10px] sm:text-xs font-semibold px-1 py-px sm:px-1.5 sm:py-0.5">BETA</Badge>
        </div>
        <p className="text-md sm:text-lg text-slate-300">{mainSubtitle}</p>
      </header>

      <main className="w-full max-w-3xl">
        <Tabs value={currentMode} onValueChange={(value) => handleModeChange(value as 'standard' | 'kids' | 'comingSoon')} className="w-full mb-8">
          <TabsList className="grid w-full grid-cols-3 bg-nebula-gray/80 border border-slate-700">
            <TabsTrigger value="standard" className="data-[state=active]:bg-cosmic-purple data-[state=active]:text-primary-foreground">Standard Mode</TabsTrigger>
            <TabsTrigger value="kids" className="data-[state=active]:bg-stardust-blue data-[state=active]:text-primary-foreground">Kids Mode</TabsTrigger>
            <TabsTrigger value="comingSoon" className="data-[state=active]:bg-slate-600 data-[state=active]:text-primary-foreground">Coming Soon!</TabsTrigger>
          </TabsList>

          <TabsContent value="standard" className="mt-6">
            <StandardModeTab
              onSubmit={handleStandardModeSubmit}
              isLoading={isLoadingMusic || isRenderingStandardModeAiArt} 
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

          <TabsContent value="comingSoon" className="mt-6">
            <Card className="bg-nebula-gray shadow-xl rounded-xl border-slate-700">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-semibold text-stardust-blue mb-2 font-headline">
                  <ListMusic className="inline-block w-7 h-7 mr-2 -mt-1" />
                  Your DreamTuner Collections
                </CardTitle>
                <CardDescription className="text-slate-300">
                  This is where your saved musical dreams and their artistic impressions will live!
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 text-center space-y-6">
                <div className="flex flex-col items-center space-y-4 p-6 bg-nebula-gray/50 rounded-lg border border-dashed border-slate-600">
                  <Album className="w-24 h-24 text-slate-500" />
                  <h3 className="text-xl font-semibold text-slate-400">Feature Coming Soon!</h3>
                  <p className="text-sm text-slate-400 max-w-md">
                    Imagine a gallery of all your creations! Each entry will feature an "album cover" generated by AI,
                    your unique musical idea, and the MIDI file. You'll be able to browse, replay, and re-share your favorite DreamTuner moments.
                  </p>
                  <p className="text-xs text-slate-500">Stay tuned for updates!</p>
                </div>
                 <div className="mt-4 p-4 bg-slate-800/30 rounded-md border border-slate-700">
                    <h4 className="text-lg font-medium text-stardust-blue mb-3">Example: "Cosmic Lullaby"</h4>
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                        <Image
                            src="https://placehold.co/150x150.png"
                            alt="Placeholder Album Art"
                            data-ai-hint="space nebula stars"
                            width={150}
                            height={150}
                            className="rounded-md border border-slate-600 shadow-md object-cover"
                        />
                        <div className="text-left space-y-1 text-sm">
                            <p><strong className="text-slate-300">Title:</strong> Cosmic Lullaby</p>
                            <p><strong className="text-slate-300">Genre:</strong> Ambient</p>
                            <p><strong className="text-slate-300">Date Created:</strong> Sometime in the Future!</p>
                            <p className="text-slate-400 italic">"A gentle journey through starry skies..."</p>
                            <Button variant="outline" size="sm" className="mt-2 border-slate-500 text-slate-300" disabled>Play (Placeholder)</Button>
                        </div>
                    </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {currentMode !== 'comingSoon' && isLoadingMusic && !musicParams && (
          <div className="mt-10 text-center">
            <LoadingSpinner />
            <p className="mt-4 text-lg text-stardust-blue animate-pulse-subtle">
              {currentMode === 'standard' ? 'DreamTuning your input... (Art will follow)' : 'DreamTuning music for your creation... (AI art will follow!)'}
            </p>
          </div>
        )}
        {currentMode === 'standard' && isRenderingStandardModeAiArt && musicParams && (
             <div className="mt-10 text-center">
                <LoadingSpinner />
                <p className="mt-4 text-lg text-stardust-blue animate-pulse-subtle">
                    AI Artist is painting your vision...
                </p>
            </div>
        )}


        {currentMode !== 'comingSoon' && error && !isLoadingOverall && (
          <div className="mt-10">
            <ErrorMessage message={error} />
          </div>
        )}

        {currentMode !== 'comingSoon' && showWelcome && !isLoadingOverall && !error && !musicParams && !aiKidsArtUrl && !standardModeAiArtUrl && (
          <Card className="mt-10 text-center p-6 bg-nebula-gray/80 rounded-lg border-slate-700">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold text-stardust-blue mb-3 font-headline">Welcome to DreamTuner</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300">
                {currentMode === 'standard'
                  ? "Enter text (or speak!), upload an image, or specify a video/audio concept. Select a genre, and DreamTuner will unveil its musical soul and an AI artistic impression."
                  : "Sketch on the canvas (hear notes as you pick colors!), record a voice hint, or do both! Select a genre if you like, and click 'Tune My Creation!' to see and hear the magic!"
                }
              </p>
            </CardContent>
          </Card>
        )}

        {currentMode !== 'comingSoon' && musicParams && !isLoadingMusic && (
          <Card className="mt-10 bg-nebula-gray shadow-2xl rounded-xl border-slate-700">
            <CardContent className="p-6 sm:p-10">
              <MusicOutputDisplay
                params={musicParams}
                onRegenerateIdea={handleRegenerateIdea}
                isRegeneratingIdea={isRegeneratingIdea}
                standardModeArtUrl={standardModeAiArtUrl} 
              />
            </CardContent>
          </Card>
        )}

        {currentMode === 'standard' && standardModeAiArtError && !isRenderingStandardModeAiArt && (
          <div className="mt-6">
            <ErrorMessage message={`Standard Mode AI Artist Error: ${standardModeAiArtError}`} />
          </div>
        )}
        {currentMode === 'standard' && standardModeAiArtUrl && !isRenderingStandardModeAiArt && (
          <Card className="mt-6 bg-nebula-gray/70 border-slate-600">
            <CardHeader>
              <CardTitle className="text-center text-xl font-semibold text-stardust-blue">AI's Artistic Rendition</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
              <Image
                src={standardModeAiArtUrl}
                alt="AI Rendered Art for Standard Input"
                data-ai-hint="abstract artistic"
                width={500}
                height={300}
                className="rounded-md max-h-80 object-contain border border-slate-500 shadow-lg"
                unoptimized
              />
               <div className="flex space-x-2">
                <Button onClick={handleDownloadStandardArt} variant="outline" className="border-stardust-blue text-stardust-blue hover:bg-stardust-blue/10">
                    <Download className="w-4 h-4 mr-2" />
                    Download Art
                </Button>
              </div>
              {shareStandardArtError && <p className="text-red-400 text-xs text-center mt-2">{`Share Error: ${shareStandardArtError}`}</p>}
            </CardContent>
          </Card>
        )}

      </main>
      <Footer />
    </div>
  );
}
    
