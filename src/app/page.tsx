
"use client";
import React, { useState, useCallback, useEffect } from 'react';
import { MusicOutputDisplay } from '@/components/MusicOutputDisplay';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { generateMusicParametersAction } from '@/app/actions/generateMusicParametersAction';
import { regenerateMusicalIdeaAction } from '@/app/actions/regenerateMusicalIdeaAction';
import { renderKidsDrawingAction } from '@/app/actions/renderKidsDrawingAction';
import { renderStandardInputArtAction } from '@/app/actions/renderStandardInputArtAction';
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
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Download, Share2, Disc3, SlidersHorizontal, Library, Users } from 'lucide-react';
import { dataURLtoFile } from '@/lib/utils';
import { generateMidiFile } from '@/lib/midiService';

const LOCAL_STORAGE_KEY = 'dreamTunerLastSession';

interface StoredSessionData {
  musicParams: MusicParameters | null;
  aiKidsArtUrl: string | null;
  standardModeAiArtUrl: string | null;
  currentMode: 'standard' | 'kids' | 'comingSoon';
  selectedGenre: string;
  timestamp: number;
}

export default function DreamTunerPage() {
  const [musicParams, setMusicParams] = useState<MusicParameters | null>(null);
  const [isLoadingMusic, setIsLoadingMusic] = useState<boolean>(false);
  const [isRegeneratingIdea, setIsRegeneratingIdea] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  const [currentMode, setCurrentMode] = useState<'standard' | 'kids' | 'comingSoon'>('standard');
  const [isClientMounted, setIsClientMounted] = useState(false);

  const [aiKidsArtUrl, setAiKidsArtUrl] = useState<string | null>(null);
  const [isRenderingAiKidsArt, setIsRenderingAiKidsArt] = useState<boolean>(false);
  const [aiKidsArtError, setAiKidsArtError] = useState<string | null>(null);
  const [currentKidsMusicParams, setCurrentKidsMusicParams] = useState<MusicParameters | null>(null);

  const [standardModeAiArtUrl, setStandardModeAiArtUrl] = useState<string | null>(null);
  const [isRenderingStandardModeAiArt, setIsRenderingStandardModeAiArt] = useState<boolean>(false);
  const [standardModeAiArtError, setStandardModeAiArtError] = useState<string | null>(null);
  const [isSharingStandardArt, setIsSharingStandardArt] = useState<boolean>(false);
  const [shareStandardArtError, setShareStandardArtError] = useState<string | null>(null);

  const [selectedGenre, setSelectedGenre] = useState<string>(MUSIC_GENRES[0] || '');

  useEffect(() => {
    setIsClientMounted(true);
    try {
      const storedSession = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (storedSession) {
        const sessionData = JSON.parse(storedSession) as StoredSessionData;
        setMusicParams(sessionData.musicParams);
        setAiKidsArtUrl(sessionData.aiKidsArtUrl);
        setStandardModeAiArtUrl(sessionData.standardModeAiArtUrl);
        setCurrentMode(sessionData.currentMode);
        setSelectedGenre(sessionData.selectedGenre || MUSIC_GENRES[0] || '');
        if (sessionData.musicParams || sessionData.aiKidsArtUrl || sessionData.standardModeAiArtUrl) {
          setShowWelcome(false);
        }
        if (sessionData.currentMode === 'kids' && sessionData.musicParams) {
            setCurrentKidsMusicParams(sessionData.musicParams);
        }
      }
    } catch (e) {
      console.error("Failed to load session from localStorage:", e);
      localStorage.removeItem(LOCAL_STORAGE_KEY); 
    }
  }, []);

  useEffect(() => {
    if (isClientMounted && (musicParams || aiKidsArtUrl || standardModeAiArtUrl)) {
      try {
        const sessionData: StoredSessionData = {
          musicParams,
          aiKidsArtUrl,
          standardModeAiArtUrl,
          currentMode,
          selectedGenre,
          timestamp: Date.now(),
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessionData));
      } catch (e) {
        console.error("Failed to save session to localStorage:", e);
      }
    } else if (isClientMounted && !musicParams && !aiKidsArtUrl && !standardModeAiArtUrl && currentMode !== 'comingSoon') {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, [isClientMounted, musicParams, aiKidsArtUrl, standardModeAiArtUrl, currentMode, selectedGenre]);


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
    setShowWelcome(newMode !== 'comingSoon');
    if (newMode !== 'comingSoon') {
      setSelectedGenre(MUSIC_GENRES[0] || '');
    }
    setCurrentKidsMusicParams(null);
    if (isClientMounted && newMode === 'comingSoon') { 
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
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
    mainSubtitle = "Get Ready to Mix and Scratch! Exciting Features Ahead!";
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
                <span style={{ color: 'rgb(41, 171, 226)' }}>Dream</span>
                <span style={{ color: 'rgb(41, 171, 226)' }}>Tuner</span>
                <span style={{ color: 'hsl(var(--accent))' }}> Kids!</span>
              </>
            ) : (
              <>
                <span style={{ color: 'rgb(41, 171, 226)' }}>Dream</span>
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
            <TabsTrigger value="standard" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Standard Mode</TabsTrigger>
            <TabsTrigger value="kids" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">Kids Mode</TabsTrigger>
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

          <TabsContent value="comingSoon" className="mt-6 space-y-8">
            <Card className="bg-nebula-gray shadow-xl rounded-xl border-slate-700">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-semibold text-accent mb-2 font-headline">
                  <SlidersHorizontal className="inline-block w-7 h-7 mr-2 -mt-1" />
                  AI-Powered DJ Console
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Unleash your inner DJ! Experiment with your AI-generated musical compositions.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 text-center space-y-6">
                <div className="flex flex-col items-center space-y-4 p-6 bg-nebula-gray/50 rounded-lg border border-dashed border-slate-600">
                  <Disc3 className="w-24 h-24 text-slate-500 animate-spin [animation-duration:5s]" />
                  <h3 className="text-xl font-semibold text-slate-400">Feature Coming Soon!</h3>
                  <p className="text-sm text-slate-400 max-w-md">
                    Get ready to mix, scratch, and transform your DreamTuner creations! Our upcoming AI DJ Console will let you:
                  </p>
                  <ul className="text-xs text-slate-400 list-disc list-inside text-left max-w-sm space-y-1">
                    <li>Load your generated MIDI stems (melody, bass, chords, drums).</li>
                    <li>Apply real-time AI-powered effects (filters, delays, reverbs).</li>
                    <li>Experiment with tempo and pitch shifting.</li>
                    <li>Try AI beat-matching and looping.</li>
                    <li>Discover AI-suggested transitions and mashup ideas.</li>
                  </ul>
                  <p className="text-xs text-slate-500 mt-2">Stay tuned for the drop!</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-nebula-gray shadow-xl rounded-xl border-slate-700">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-semibold text-accent mb-2 font-headline">
                  <Library className="inline-block w-7 h-7 mr-2 -mt-1" />
                  Your Personal Music Library
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Save, organize, and revisit your unique DreamTuner creations.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 text-center space-y-6">
                <div className="flex flex-col items-center space-y-4 p-6 bg-nebula-gray/50 rounded-lg border border-dashed border-slate-600">
                  <Users className="w-24 h-24 text-slate-500" />
                  <h3 className="text-xl font-semibold text-slate-400">Feature Coming Soon!</h3>
                  <p className="text-sm text-slate-400 max-w-md">
                    Build your collection of AI-generated musical ideas and artworks. Features will include:
                  </p>
                  <ul className="text-xs text-slate-400 list-disc list-inside text-left max-w-sm space-y-1">
                    <li>Saving your favorite generated music parameters and AI art.</li>
                    <li>Customizing album/track titles and descriptions.</li>
                    <li>Generating or uploading custom cover art for your creations.</li>
                    <li>Organizing creations into playlists or albums.</li>
                    <li>Easy sharing of your saved items.</li>
                  </ul>
                  <p className="text-xs text-slate-500 mt-2">Curate your dreams!</p>
                </div>
                <div className="mt-4 p-4 bg-slate-800/30 rounded-md border border-slate-700">
                    <h4 className="text-lg font-medium text-accent mb-3">Example Album: "Neon Dreams Vol. 1"</h4>
                    <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4">
                        <Image
                            src="/logo.png"
                            alt="DreamTuner Logo as Album Art"
                            width={150}
                            height={150}
                            className="rounded-md border border-slate-600 shadow-md object-cover mx-auto sm:mx-0"
                        />
                        <div className="space-y-1 text-sm flex-grow">
                            <p><strong className="text-slate-300">Album:</strong> Neon Dreams Vol. 1</p>
                            <p><strong className="text-slate-300">Artist:</strong> DreamTuner User</p>
                            <p><strong className="text-slate-300">Tracks:</strong> 5 (Saved Creations)</p>
                            <p className="text-slate-400 italic">"A collection of vibrant soundscapes from late-night musings."</p>
                            <Button variant="outline" size="sm" className="mt-2 border-slate-500 text-slate-300" disabled>View Album (Placeholder)</Button>
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
            <p className="mt-4 text-lg text-accent animate-pulse-subtle">
              {currentMode === 'standard' ? 'DreamTuning your input... (Art will follow)' : 'DreamTuning music for your creation... (AI art will follow!)'}
            </p>
          </div>
        )}
        {currentMode === 'standard' && isRenderingStandardModeAiArt && musicParams && (
             <div className="mt-10 text-center">
                <LoadingSpinner />
                <p className="mt-4 text-lg text-accent animate-pulse-subtle">
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
              <CardTitle className="text-2xl font-semibold text-accent mb-3 font-headline">Welcome to DreamTuner</CardTitle>
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
              <CardTitle className="text-center text-xl font-semibold text-accent">AI's Artistic Rendition</CardTitle>
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
                <Button onClick={handleDownloadStandardArt} variant="outline" className="border-accent text-accent hover:bg-accent/10">
                    <Download className="w-4 h-4 mr-2" />
                    Download Art
                </Button>
                <Button onClick={handleShareStandardCreation} disabled={isSharingStandardArt || (!standardModeAiArtUrl && !musicParams)} variant="outline" className="border-green-500 text-green-400 hover:bg-green-500/10 hover:text-green-300">
                    {isSharingStandardArt ? <><svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path></svg>Sharing...</> : <><Share2 className="w-4 h-4 mr-2" />Share Creation</>}
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
    

    


