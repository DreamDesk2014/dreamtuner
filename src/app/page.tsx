
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
import { Download, Share2, Disc3, SlidersHorizontal, Library, Users, Swords } from 'lucide-react';
import { dataURLtoFile } from '@/lib/utils';
import { logEvent, getSessionId } from '@/lib/firestoreService';

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
    logEvent('user_interactions', { 
      eventName: 'app_loaded', 
      eventDetails: { userAgent: navigator.userAgent, initialMode: currentMode, appName: "DreamTuner" },
      sessionId: getSessionId() 
    }).catch(console.error);

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
        logEvent('user_interactions', { 
          eventName: 'session_restored', 
          eventDetails: { 
            hadMusicParams: !!sessionData.musicParams,
            hadKidsArt: !!sessionData.aiKidsArtUrl,
            hadStandardArt: !!sessionData.standardModeAiArtUrl,
            restoredMode: sessionData.currentMode 
          },
          sessionId: getSessionId() 
        }).catch(console.error);
      }
    } catch (e) {
      console.error("Failed to load session from localStorage:", e);
      localStorage.removeItem(LOCAL_STORAGE_KEY); 
      logEvent('errors', { 
        eventName: 'localStorage_load_error', 
        eventDetails: { error: (e instanceof Error ? e.message : String(e)) },
        sessionId: getSessionId() 
      }).catch(console.error);
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
         logEvent('errors', { 
          eventName: 'localStorage_save_error', 
          eventDetails: { error: (e instanceof Error ? e.message : String(e)) },
          sessionId: getSessionId() 
        }).catch(console.error);
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
    const oldMode = currentMode;
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
        logEvent('user_interactions', { 
            eventName: 'coming_soon_tab_viewed', 
            sessionId: getSessionId() 
        }).catch(console.error);
    }
    logEvent('user_interactions', { 
      eventName: 'mode_changed', 
      eventDetails: { newMode: newMode, previousMode: oldMode },
      sessionId: getSessionId()
    }).catch(console.error);
  };

  const handleStandardModeSubmit = useCallback(async (input: AppInput) => {
    setIsLoadingMusic(true);
    setError(null);
    setMusicParams(null);
    setShowWelcome(false);
    resetAllArtStates();
    setCurrentKidsMusicParams(null);
    
    const startTime = Date.now();
    logEvent('user_interactions', { 
      eventName: 'standard_generation_started', 
      eventDetails: { 
        inputType: input.type, 
        genre: input.genre, 
        mode: input.mode,
        userEnergyUsed: input.userEnergy !== undefined && input.userEnergy !== 0,
        userPositivityUsed: input.userPositivity !== undefined && input.userPositivity !== 0,
      },
      sessionId: getSessionId()
    }).catch(console.error);

    try {
      toast({ title: "DreamTuner Magic ✨", description: "Generating musical ideas..." });
      const musicResult = await generateMusicParametersAction(input);
      if ('error' in musicResult) {
        setError(musicResult.error);
        setMusicParams(null);
        logEvent('errors', { 
          eventName: 'standard_music_generation_error', 
          eventDetails: { error: musicResult.error, inputType: input.type, durationMs: Date.now() - startTime },
          sessionId: getSessionId()
        }).catch(console.error);
      } else {
        setMusicParams(musicResult);
        setError(null);
        logEvent('user_interactions', { 
          eventName: 'standard_music_generation_success', 
          eventDetails: { inputType: input.type, durationMs: Date.now() - startTime, idea: musicResult.generatedIdea.substring(0,50) },
          sessionId: getSessionId()
        }).catch(console.error);

        if (musicResult.generatedIdea) {
          setIsRenderingStandardModeAiArt(true);
          setStandardModeAiArtError(null);
          setStandardModeAiArtUrl(null);
          toast({ title: "AI Artist at Work 🎨", description: "Crafting visual representation..." });
          const artStartTime = Date.now();
          logEvent('user_interactions', { 
            eventName: 'standard_art_generation_started', 
            eventDetails: { inputType: musicResult.originalInput.type },
            sessionId: getSessionId()
          }).catch(console.error);

          try {
            const artResult = await renderStandardInputArtAction(
              musicResult.originalInput,
              musicResult.generatedIdea
            );
            if ('error' in artResult) {
              setStandardModeAiArtError(artResult.error);
              toast({ variant: "destructive", title: "Standard Art Hiccup", description: `Couldn't create art: ${artResult.error}` });
              logEvent('errors', { 
                eventName: 'standard_art_generation_error', 
                eventDetails: { error: artResult.error, inputType: musicResult.originalInput.type, durationMs: Date.now() - artStartTime },
                sessionId: getSessionId()
              }).catch(console.error);
            } else if (artResult.renderedArtDataUrl) {
              setStandardModeAiArtUrl(artResult.renderedArtDataUrl);
              setStandardModeAiArtError(null);
              toast({ title: "Standard Artwork Ready!", description: "Your AI art has been created!" });
              logEvent('user_interactions', { 
                eventName: 'standard_art_generation_success', 
                eventDetails: { inputType: musicResult.originalInput.type, durationMs: Date.now() - artStartTime },
                sessionId: getSessionId()
              }).catch(console.error);
            }
          } catch (artErr) {
            console.error("Error rendering standard mode AI art:", artErr);
            const specificArtError = artErr instanceof Error ? `AI art rendering failed: ${artErr.message}` : "Unknown AI art rendering error.";
            setStandardModeAiArtError(specificArtError);
            toast({ variant: "destructive", title: "Standard Art Error", description: "Something went wrong while creating the art." });
            logEvent('errors', { 
              eventName: 'standard_art_generation_exception', 
              eventDetails: { error: specificArtError, inputType: musicResult.originalInput.type, durationMs: Date.now() - artStartTime },
              sessionId: getSessionId()
            }).catch(console.error);
          } finally {
            setIsRenderingStandardModeAiArt(false);
          }
        }
      }
    } catch (err) {
      console.error("Error in standard submission process:", err);
      const errorMessage = err instanceof Error ? `Failed process input: ${err.message}.` : "An unknown error occurred.";
      setError(errorMessage);
      setMusicParams(null);
      logEvent('errors', { 
        eventName: 'standard_submission_exception', 
        eventDetails: { error: errorMessage, inputType: input.type, durationMs: Date.now() - startTime },
        sessionId: getSessionId()
      }).catch(console.error);
    } finally {
      setIsLoadingMusic(false);
    }
  }, [selectedGenre, getSessionId]);

  const handleKidsModeTuneCreation = useCallback(async (
    musicInput: AppInput,
    artInput: RenderKidsDrawingInput | null,
    drawingToolSummary?: { colorsUsedCount: number; wasClearCanvasUsed: boolean; }
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
    
    const overallStartTime = Date.now();
    logEvent('user_interactions', { 
      eventName: 'kids_tune_creation_started', 
      eventDetails: { 
        hasDrawing: !!artInput?.drawingDataUri, 
        hasVoiceHint: !!artInput?.originalVoiceHint,
        genre: musicInput.genre,
        drawingSoundSequenceLength: musicInput.drawingSoundSequence?.split(',').length || 0,
        ...(drawingToolSummary || {})
      },
      sessionId: getSessionId()
    }).catch(console.error);

    let generatedMusicalIdea: string | undefined = undefined;
    let musicParametersResult: MusicParameters | undefined = undefined;
    let musicGenError: string | undefined = undefined;
    let artRenderError: string | undefined = undefined;
    let artRenderUrl: string | undefined = undefined;

    const musicStartTime = Date.now();
    try {
      toast({ title: "DreamTuner Magic ✨", description: "Generating musical ideas..." });
      const musicResult = await generateMusicParametersAction(musicInput);
      if ('error' in musicResult) {
        musicGenError = musicResult.error;
        setError(musicResult.error);
        setMusicParams(null);
        logEvent('errors', { 
          eventName: 'kids_music_generation_error', 
          eventDetails: { error: musicResult.error, durationMs: Date.now() - musicStartTime },
          sessionId: getSessionId()
        }).catch(console.error);
      } else {
        musicParametersResult = musicResult;
        setMusicParams(musicResult);
        setCurrentKidsMusicParams(musicResult);
        generatedMusicalIdea = musicResult.generatedIdea;
        setError(null);
         logEvent('user_interactions', { 
          eventName: 'kids_music_generation_success', 
          eventDetails: { durationMs: Date.now() - musicStartTime, idea: musicResult.generatedIdea.substring(0,50) },
          sessionId: getSessionId()
        }).catch(console.error);
      }
    } catch (err) {
      console.error("Error in music generation for drawing/voice:", err);
      const specificError = err instanceof Error ? `Music generation failed: ${err.message}.` : "Unknown music generation error.";
      musicGenError = specificError;
      setError(specificError);
      setMusicParams(null);
      logEvent('errors', { 
        eventName: 'kids_music_generation_exception', 
        eventDetails: { error: specificError, durationMs: Date.now() - musicStartTime },
        sessionId: getSessionId()
      }).catch(console.error);
    } finally {
      setIsLoadingMusic(false);
    }

    if (artInput) {
      artInput.originalMusicalIdea = generatedMusicalIdea;
      const artStartTime = Date.now();
      logEvent('user_interactions', { 
        eventName: 'kids_art_generation_started', 
        eventDetails: { hasDrawing: !!artInput.drawingDataUri, hasVoiceHint: !!artInput.originalVoiceHint },
        sessionId: getSessionId()
      }).catch(console.error);
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
            logEvent('errors', { 
              eventName: 'kids_art_generation_error', 
              eventDetails: { error: artResult.error, durationMs: Date.now() - artStartTime },
              sessionId: getSessionId()
            }).catch(console.error);
        } else if (artResult.renderedDrawingDataUrl) {
            artRenderUrl = artResult.renderedDrawingDataUrl;
            setAiKidsArtUrl(artResult.renderedDrawingDataUrl);
            setAiKidsArtError(null);
            toast({ title: "Artwork Ready!", description: "Your AI art has been created!" });
            logEvent('user_interactions', { 
              eventName: 'kids_art_generation_success', 
              eventDetails: { durationMs: Date.now() - artStartTime },
              sessionId: getSessionId()
            }).catch(console.error);
        }
      } catch (err) {
        console.error("Error rendering AI art:", err);
        const specificError = err instanceof Error ? `AI art rendering failed: ${err.message}` : "Unknown AI art rendering error.";
        artRenderError = specificError;
        setAiKidsArtError(specificError);
        toast({ variant: "destructive", title: "AI Artist Error", description: "Something went wrong while creating the art." });
        logEvent('errors', { 
          eventName: 'kids_art_generation_exception', 
          eventDetails: { error: specificError, durationMs: Date.now() - artStartTime },
          sessionId: getSessionId()
        }).catch(console.error);
      } finally {
        setIsRenderingAiKidsArt(false);
      }
    } else {
        setIsRenderingAiKidsArt(false);
    }
     logEvent('user_interactions', { 
      eventName: 'kids_tune_creation_completed', 
      eventDetails: { 
        durationMs: Date.now() - overallStartTime, 
        musicSuccess: !musicGenError, 
        artSuccess: artInput ? !artRenderError : undefined 
      },
      sessionId: getSessionId()
    }).catch(console.error);

    return { musicError: musicGenError, artError: artRenderError, musicParamsResult: musicParametersResult, artUrlResult: artRenderUrl };
  }, [selectedGenre, getSessionId]);


  const handleRegenerateIdea = useCallback(async () => {
    if (!musicParams) return;
    setIsRegeneratingIdea(true);
    setError(null);
    const startTime = Date.now();
    logEvent('user_interactions', { 
      eventName: 'regenerate_idea_started', 
      eventDetails: { currentMode: currentMode, originalIdea: musicParams.generatedIdea.substring(0,50) },
      sessionId: getSessionId()
    }).catch(console.error);
    try {
      const result = await regenerateMusicalIdeaAction(musicParams);
      if ('error' in result) {
        setError(result.error);
        logEvent('errors', { 
          eventName: 'regenerate_idea_error', 
          eventDetails: { error: result.error, durationMs: Date.now() - startTime },
          sessionId: getSessionId()
        }).catch(console.error);
      } else {
        logEvent('user_interactions', { 
          eventName: 'regenerate_idea_success', 
          eventDetails: { durationMs: Date.now() - startTime, newIdea: result.newIdea.substring(0,50) },
          sessionId: getSessionId()
        }).catch(console.error);
        setMusicParams(prevParams => {
          if (!prevParams) return null;
          const updatedParams = { ...prevParams, generatedIdea: result.newIdea };

          if (currentMode === 'standard' && updatedParams.originalInput) {
            setIsRenderingStandardModeAiArt(true);
            setStandardModeAiArtError(null);
            setStandardModeAiArtUrl(null); 
            toast({ title: "AI Artist at Work 🎨", description: "Reimagining visual for new idea..." });
            const artStartTime = Date.now();
            logEvent('user_interactions', { 
              eventName: 'standard_art_regeneration_started', 
              eventDetails: { inputType: updatedParams.originalInput.type },
              sessionId: getSessionId()
            }).catch(console.error);

            renderStandardInputArtAction(updatedParams.originalInput, result.newIdea)
              .then(artResult => {
                if ('error' in artResult) {
                  setStandardModeAiArtError(artResult.error);
                  toast({ variant: "destructive", title: "Standard Art Hiccup", description: `Couldn't update art: ${artResult.error}` });
                  logEvent('errors', { 
                    eventName: 'standard_art_regeneration_error', 
                    eventDetails: { error: artResult.error, durationMs: Date.now() - artStartTime },
                    sessionId: getSessionId()
                  }).catch(console.error);
                } else if (artResult.renderedArtDataUrl) {
                  setStandardModeAiArtUrl(artResult.renderedArtDataUrl);
                  setStandardModeAiArtError(null);
                  toast({ title: "Standard Artwork Updated!", description: "AI art for new idea is ready!" });
                   logEvent('user_interactions', { 
                    eventName: 'standard_art_regeneration_success', 
                    eventDetails: { durationMs: Date.now() - artStartTime },
                    sessionId: getSessionId()
                  }).catch(console.error);
                }
              })
              .catch(artErr => {
                console.error("Error re-rendering standard mode AI art:", artErr);
                const artErrorMessage = artErr instanceof Error ? artErr.message : "Unknown error updating art.";
                setStandardModeAiArtError(artErrorMessage);
                 logEvent('errors', { 
                  eventName: 'standard_art_regeneration_exception', 
                  eventDetails: { error: artErrorMessage, durationMs: Date.now() - artStartTime },
                  sessionId: getSessionId()
                }).catch(console.error);
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
      const errorMessage = err instanceof Error ? `Failed to regenerate idea: ${err.message}` : "Unknown error regenerating idea.";
      setError(errorMessage);
      logEvent('errors', { 
        eventName: 'regenerate_idea_exception', 
        eventDetails: { error: errorMessage, durationMs: Date.now() - startTime },
        sessionId: getSessionId()
      }).catch(console.error);
    } finally {
      setIsRegeneratingIdea(false);
    }
  }, [musicParams, currentMode, getSessionId]);


  const handleDownloadStandardArt = () => {
    if (standardModeAiArtUrl) {
      const link = document.createElement('a');
      link.href = standardModeAiArtUrl;
      link.download = 'dreamtuner_standard_art.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
       logEvent('user_interactions', { 
        eventName: 'standard_art_downloaded', 
        sessionId: getSessionId()
      }).catch(console.error);
    }
  };

  const handleShareStandardCreation = async () => {
    setShareStandardArtError(null);
    if (!navigator.share) {
      toast({ variant: "destructive", title: "Share Not Supported", description: "Web Share API is not available." });
      setShareStandardArtError("Web Share API not supported.");
      logEvent('errors', { 
        eventName: 'share_api_not_supported', 
        eventDetails: { mode: 'standard' },
        sessionId: getSessionId()
      }).catch(console.error);
      return;
    }
    if (!standardModeAiArtUrl && (!musicParams || !musicParams.generatedIdea)) {
        toast({ variant: "destructive", title: "Nothing to Share", description: "Please generate art or a musical idea first." });
        return;
    }

    setIsSharingStandardArt(true);
    const filesToShare: File[] = [];
    let shareText = "Check out what I made with DreamTuner!";
    
    if (musicParams?.generatedIdea) {
        shareText += `\nMusical Idea: "${musicParams.generatedIdea}"`;
    }
    logEvent('user_interactions', { 
      eventName: 'standard_share_initiated', 
      eventDetails: { hasArt: !!standardModeAiArtUrl, hasMusic: !!musicParams },
      sessionId: getSessionId()
    }).catch(console.error);

    try {
        if (standardModeAiArtUrl) {
            const artFile = dataURLtoFile(standardModeAiArtUrl, "dreamtuner_standard_art.png");
            if (artFile) filesToShare.push(artFile);
            else console.warn("Could not convert art data URL to file for sharing.");
        }
        
        const sharePayload: ShareData = {
            title: "My DreamTuner Creation!",
            text: shareText,
        };
        if (filesToShare.length > 0) {
            sharePayload.files = filesToShare;
        }

        await navigator.share(sharePayload);
        toast({ title: "Shared Creation Successfully!" });
        logEvent('user_interactions', { 
          eventName: 'standard_share_success', 
          sessionId: getSessionId()
        }).catch(console.error);
    } catch (error: any) {
        if (error.name === 'AbortError') {
            toast({ title: "Share Cancelled", variant: "default" });
            logEvent('user_interactions', { 
              eventName: 'standard_share_cancelled', 
              sessionId: getSessionId()
            }).catch(console.error);
        } else {
            toast({ variant: "destructive", title: "Share Failed", description: error.message || "Could not share." });
            logEvent('errors', { 
              eventName: 'standard_share_error', 
              eventDetails: { error: error.message || "Failed to share creation." },
              sessionId: getSessionId()
            }).catch(console.error);
        }
        setShareStandardArtError(error.message || "Failed to share creation.");
    } finally {
        setIsSharingStandardArt(false);
    }
  };


  let mainSubtitle = "Translates your concepts into musical vibrations.";
  if (currentMode === 'kids') {
    mainSubtitle = "Draw, make sounds, add voice hints! Hear music & see AI art!";
  } else if (currentMode === 'comingSoon') {
    mainSubtitle = "Get Ready! Exciting Features Ahead!";
  }

  const isLoadingOverall = isLoadingMusic || isRenderingStandardModeAiArt || isRenderingAiKidsArt;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center p-4 sm:p-8 font-body">
      <NavigationBar />
      <header className="w-full max-w-3xl mb-8 text-center">
        <div className="flex items-center justify-center space-x-2 sm:space-x-3 mb-2">
          <LogoIcon className="w-10 h-10 sm:w-12 sm:h-12" />
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight font-headline">
            {currentMode === 'kids' ? (
              <>
                <span style={{ color: 'hsl(var(--primary))' }}>Dream</span>
                <span style={{ color: 'hsl(var(--accent))' }}>Tuner</span>
                <span className="text-primary"> Kids!</span>
              </>
            ) : (
              <>
                <span style={{ color: 'hsl(var(--primary))' }}>Dream</span>
                <span style={{ color: 'hsl(var(--accent))' }}>Tuner</span>
              </>
            )}
          </h1>
          <Badge variant="outline" className="border-accent text-accent text-[10px] sm:text-xs font-semibold px-1 py-px sm:px-1.5 sm:py-0.5">BETA</Badge>
        </div>
        <p className="text-md sm:text-lg text-muted-foreground">{mainSubtitle}</p>
      </header>

      <main className="w-full max-w-3xl">
        <Tabs value={currentMode} onValueChange={(value) => handleModeChange(value as 'standard' | 'kids' | 'comingSoon')} className="w-full mb-8">
          <TabsList className="grid w-full grid-cols-3 bg-card border border-border">
            <TabsTrigger value="standard" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Standard Mode</TabsTrigger>
            <TabsTrigger value="kids" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Kids Mode</TabsTrigger>
            <TabsTrigger value="comingSoon" className="data-[state=active]:bg-muted data-[state=active]:text-muted-foreground">Coming Soon!</TabsTrigger>
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
            <Card className="bg-card shadow-xl rounded-xl border-border">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-semibold text-primary mb-2 font-headline">
                  <Swords className="inline-block w-7 h-7 mr-2 -mt-1" />
                  Battle Of The AIs! - Who's the Better Musician?
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Witness AI models go head-to-head in DreamTuner, composing music based on the same prompts. You be the judge!
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 text-center space-y-6">
                <div className="flex flex-col items-center space-y-4 p-6 bg-background/50 rounded-lg border border-dashed border-border">
                   <Image
                      src="https://placehold.co/300x200.png"
                      alt="AI Battle Concept Art"
                      data-ai-hint="AI robots music"
                      width={300}
                      height={200}
                      className="rounded-md border border-border shadow-md object-cover mx-auto"
                    />
                  <h3 className="text-xl font-semibold text-muted-foreground">Feature Coming Soon!</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Prepare for a musical showdown! Different AI models will:
                  </p>
                  <ul className="text-xs text-muted-foreground list-disc list-inside text-left max-w-sm space-y-1">
                    <li>Receive identical creative briefs (text, image, or kid's input).</li>
                    <li>Generate unique musical parameters and ideas.</li>
                    <li>Compete for your vote on creativity, mood-matching, and overall appeal.</li>
                    <li>Learn which AI's style resonates most with different genres and inputs!</li>
                  </ul>
                  <p className="text-xs text-muted-foreground/70 mt-2">The ultimate AI jam session awaits!</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card shadow-xl rounded-xl border-border">
              <CardHeader className="text-center">
                <CardTitle className="text-xl font-semibold text-primary mb-1 font-headline">
                  <SlidersHorizontal className="inline-block w-6 h-6 mr-2 -mt-1" />
                  AI-Powered DJ Console (Compact)
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Mix and experiment with your AI-generated compositions.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 text-center space-y-4">
                <div className="flex flex-col items-center space-y-3 p-4 bg-background/50 rounded-lg border border-dashed border-border">
                  <Disc3 className="w-16 h-16 text-muted-foreground animate-spin [animation-duration:5s]" />
                  <h3 className="text-lg font-semibold text-muted-foreground">Feature Coming Soon!</h3>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Load generated MIDI stems. Apply AI effects, tempo/pitch shifts, and explore AI beat-matching.
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Stay tuned for the drop!</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card shadow-xl rounded-xl border-border">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-semibold text-primary mb-2 font-headline">
                  <Library className="inline-block w-7 h-7 mr-2 -mt-1" />
                  Your Personal Music Library
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Save, organize, and revisit your unique DreamTuner creations.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 text-center space-y-6">
                <div className="flex flex-col items-center space-y-4 p-6 bg-background/50 rounded-lg border border-dashed border-border">
                  <Users className="w-24 h-24 text-muted-foreground" />
                  <h3 className="text-xl font-semibold text-muted-foreground">Feature Coming Soon!</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Build your collection of AI-generated musical ideas and artworks. Features will include:
                  </p>
                  <ul className="text-xs text-muted-foreground list-disc list-inside text-left max-w-sm space-y-1">
                    <li>Saving your favorite generated music parameters and AI art.</li>
                    <li>Customizing album/track titles and descriptions.</li>
                    <li>Generating or uploading custom cover art for your creations.</li>
                    <li>Organizing creations into playlists or albums.</li>
                    <li>Easy sharing of your saved items.</li>
                  </ul>
                  <p className="text-xs text-muted-foreground/70 mt-2">Curate your resonant frequencies!</p>
                </div>
                <div className="mt-4 p-4 bg-muted/30 rounded-md border border-border">
                    <h4 className="text-lg font-medium text-primary mb-3">Example Album: "Indigo Echoes Vol. 1"</h4>
                    <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4">
                        <Image
                            src="https://placehold.co/150x150.png"
                            alt="DreamTuner Placeholder Album Art"
                            data-ai-hint="abstract album cover"
                            width={150}
                            height={150}
                            className="rounded-md border border-border shadow-md object-cover mx-auto sm:mx-0"
                        />
                        <div className="space-y-1 text-sm flex-grow">
                            <p><strong className="text-foreground">Album:</strong> Indigo Echoes Vol. 1</p>
                            <p><strong className="text-foreground">Artist:</strong> DreamTuner User</p>
                            <p><strong className="text-foreground">Tracks:</strong> 5 (Saved Creations)</p>
                            <p className="text-muted-foreground italic">"A collection of vibrant soundscapes from deep space."</p>
                            <Button variant="outline" size="sm" className="mt-2 border-border text-foreground" disabled>View Album (Placeholder)</Button>
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
              {currentMode === 'standard' ? 'Tuning your input... (Art will follow)' : 'Tuning music for your creation... (AI art will follow!)'}
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
          <Card className="mt-10 text-center p-6 bg-card rounded-lg border-border">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold text-primary mb-3 font-headline">Welcome to DreamTuner</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {currentMode === 'standard'
                  ? "Enter text (or speak!), upload an image, or specify a video/audio concept. Select a genre, and DreamTuner will unveil its musical soul and an AI artistic impression."
                  : "Sketch on the canvas (hear notes as you pick colors!), record a voice hint, or do both! Select a genre if you like, and click 'Tune My Creation!' to see and hear the magic!"
                }
              </p>
            </CardContent>
          </Card>
        )}

        {currentMode !== 'comingSoon' && musicParams && !isLoadingMusic && (
          <div className="mt-10 bg-card shadow-2xl rounded-xl border-border">
            <MusicOutputDisplay
              params={musicParams}
              onRegenerateIdea={handleRegenerateIdea}
              isRegeneratingIdea={isRegeneratingIdea}
              standardModeArtUrl={standardModeAiArtUrl} 
            />
          </div>
        )}

        {currentMode === 'standard' && standardModeAiArtError && !isRenderingStandardModeAiArt && (
          <div className="mt-6">
            <ErrorMessage message={`Standard Mode AI Artist Error: ${standardModeAiArtError}`} />
          </div>
        )}
        {currentMode === 'standard' && standardModeAiArtUrl && !isRenderingStandardModeAiArt && (
          <Card className="mt-6 bg-card border-border">
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
                className="rounded-md max-h-80 object-contain border border-border shadow-lg"
                unoptimized
              />
               <div className="flex space-x-2">
                <Button onClick={handleDownloadStandardArt} variant="outline" className="border-accent text-accent hover:bg-accent/10">
                    <Download className="w-4 h-4 mr-2" />
                    Download Art
                </Button>
                <Button 
                    onClick={handleShareStandardCreation} 
                    disabled={isSharingStandardArt || (!standardModeAiArtUrl && (!musicParams || !musicParams.generatedIdea))}
                    variant="outline" 
                    className="border-green-500 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                >
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
