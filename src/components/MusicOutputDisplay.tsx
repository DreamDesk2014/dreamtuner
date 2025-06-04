
"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import MidiPlayer from 'midi-player-js';
import type { MusicParameters, AppInput } from '@/types';
import { getValenceArousalDescription, SOUNDFONT_URL, SOUND_LOADING_TIMEOUT_MS } from '@/lib/constants';
import { generateMidiFile } from '@/lib/midiService';
import {
  MusicalNoteIcon, ClockIcon, MoodHappyIcon, MoodSadIcon, LightningBoltIcon, CogIcon, ScaleIcon, CollectionIcon,
  DocumentTextIcon, DownloadIcon, PhotographIcon, VideoCameraIcon, ClipboardCopyIcon, RefreshIcon,
  LibraryIcon, PlayIcon, PauseIcon, StopIcon
} from './icons/HeroIcons';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { SparklesIcon as HeroSparklesIcon } from './icons/SparklesIcon';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


interface MusicOutputDisplayProps {
  params: MusicParameters;
  onRegenerateIdea: () => Promise<void>;
  isRegeneratingIdea: boolean;
}

interface ParameterCardProps {
  title: string;
  value: string | number | string[];
  icon: React.ReactNode;
  unit?: string;
  className?: string;
  subText?: string;
}

const ParameterCardComponent: React.FC<ParameterCardProps> = ({ title, value, icon, unit, className, subText }) => {
  let displayValue: React.ReactNode;
  if (Array.isArray(value)) {
    displayValue = value.length > 0 ? value.join(', ') : 'N/A';
  } else if (typeof value === 'number' && (title.toLowerCase().includes('density') || title.toLowerCase().includes('complexity') || title.toLowerCase().includes('valence') || title.toLowerCase().includes('arousal'))) {
    displayValue = value.toFixed(2);
  } else {
    displayValue = String(value);
  }

  return (
    <Card className={`bg-nebula-gray/80 border-slate-700 flex flex-col ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center text-stardust-blue mb-1">
          {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5" })}
          <CardTitle className="ml-2 text-md font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="text-galaxy-white text-lg font-light truncate" title={Array.isArray(value) ? value.join(', ') : String(value)}>
          {displayValue}
          {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
        </p>
        {subText && (
          <p className="text-xs text-muted-foreground mt-1">{subText}</p>
        )}
      </CardContent>
    </Card>
  );
};

export const MusicOutputDisplay: React.FC<MusicOutputDisplayProps> = ({ params, onRegenerateIdea, isRegeneratingIdea }) => {
  const [midiError, setMidiError] = useState<string | null>(null);
  const [isGeneratingMidiForDownload, setIsGeneratingMidiForDownload] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const midiPlayerRef = useRef<any>(null);
  const [isPlayerLoadingSounds, setIsPlayerLoadingSounds] = useState<boolean>(false);
  const [isPlaybackReady, setIsPlaybackReady] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const totalMidiTicksRef = useRef<number>(0);
  const [midiFileStructLoaded, setMidiFileStructLoaded] = useState<boolean>(false);
  const soundLoadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isPlayerLoadingSoundsRef = useRef(isPlayerLoadingSounds);
  useEffect(() => {
    isPlayerLoadingSoundsRef.current = isPlayerLoadingSounds;
  }, [isPlayerLoadingSounds]);

  useEffect(() => {
    MidiPlayer.Player.SOUNDFONT_URL = SOUNDFONT_URL;
    const player = new MidiPlayer.Player((event: any) => {
      if (event.name === 'End of File') {
        setIsPlaying(false);
        setPlaybackProgress(100);
        setIsPlaybackReady(false); 
      }
      if (event.name === 'Playing' || event.name === 'playbackStart') {
        if (soundLoadingTimeoutRef.current) {
          clearTimeout(soundLoadingTimeoutRef.current);
          soundLoadingTimeoutRef.current = null;
        }
        setIsPlayerLoadingSounds(false);
        setIsPlaybackReady(true);
        setIsPlaying(true);
        setPlayerError(null);
      }
      if (event.name === 'playbackPause') setIsPlaying(false);
      if (event.name === 'playbackStop') {
        if (soundLoadingTimeoutRef.current) {
          clearTimeout(soundLoadingTimeoutRef.current);
          soundLoadingTimeoutRef.current = null;
        }
        setIsPlayerLoadingSounds(false);
        setIsPlaying(false);
        setIsPlaybackReady(false);
        setPlaybackProgress(0);
      }
      if (event.name === 'playing' && event.tick !== undefined) {
        if (totalMidiTicksRef.current > 0) {
          const progress = (event.tick / totalMidiTicksRef.current) * 100;
          setPlaybackProgress(progress);
        }
      }
    });

    player.on('fileLoaded', () => {
       totalMidiTicksRef.current = player.getTotalTicks();
       setMidiFileStructLoaded(true);
    });

    player.on('soundfontLoaded', () => {
      if (soundLoadingTimeoutRef.current) {
        clearTimeout(soundLoadingTimeoutRef.current);
        soundLoadingTimeoutRef.current = null;
      }
      setIsPlayerLoadingSounds(false);
    });

    player.on('soundfontError', (err: any) => {
      if (soundLoadingTimeoutRef.current) {
        clearTimeout(soundLoadingTimeoutRef.current);
        soundLoadingTimeoutRef.current = null;
      }
      const errorMessage = err?.message || err?.error || "Soundfont loading error.";
      setPlayerError(`SoundFont Error: ${String(errorMessage)}`);
      setIsPlayerLoadingSounds(false);
      setIsPlaybackReady(false);
      setIsPlaying(false);
    });

    player.on('error', (err: any) => {
      if (soundLoadingTimeoutRef.current) {
        clearTimeout(soundLoadingTimeoutRef.current);
        soundLoadingTimeoutRef.current = null;
      }
      const errorMessage = err?.message || err?.error || err || "An unknown player error occurred.";
      setPlayerError(String(errorMessage));
      setIsPlayerLoadingSounds(false);
      setIsPlaybackReady(false);
      setIsPlaying(false);
      setMidiFileStructLoaded(false);
      setPlaybackProgress(0);
    });

    midiPlayerRef.current = player;

    return () => {
      if (midiPlayerRef.current) {
        midiPlayerRef.current.stop();
        midiPlayerRef.current = null; 
      }
      if (soundLoadingTimeoutRef.current) {
        clearTimeout(soundLoadingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const player = midiPlayerRef.current;
    if (params && player) {
      if (soundLoadingTimeoutRef.current) {
        clearTimeout(soundLoadingTimeoutRef.current);
        soundLoadingTimeoutRef.current = null;
      }
      player.stop(); 
      setPlayerError(null);
      setMidiFileStructLoaded(false); 
      setPlaybackProgress(0); 
      totalMidiTicksRef.current = 0;


      try {
        const midiDataUri = generateMidiFile(params);
        if (!midiDataUri || !midiDataUri.startsWith('data:audio/midi;base64,')) {
          setPlayerError("Failed to generate valid MIDI data.");
          setMidiFileStructLoaded(false);
          return;
        }
        player.loadDataUri(midiDataUri); 
      } catch (error) {
        setPlayerError(error instanceof Error ? error.message : "Failed to prepare MIDI for playback.");
        setMidiFileStructLoaded(false);
      }
    } else if (!params && player) {
        if (soundLoadingTimeoutRef.current) {
          clearTimeout(soundLoadingTimeoutRef.current);
          soundLoadingTimeoutRef.current = null;
        }
        player.stop(); 
        setMidiFileStructLoaded(false); 
    }
  }, [params]);

  const handlePlayPause = useCallback(() => {
    const player = midiPlayerRef.current;
    if (!player) { setPlayerError("Player not available."); return; }

    if (!midiFileStructLoaded && !player.isPlaying() && !isPlayerLoadingSoundsRef.current){
        setPlayerError("MIDI data not ready. Please wait."); return;
    }

    const audioContext = player.audioContext;
    const performPlayAction = () => {
        if (player.isPlaying()) {
            if (soundLoadingTimeoutRef.current) clearTimeout(soundLoadingTimeoutRef.current);
            player.pause(); 
        } else {
            if (playbackProgress >= 99) {
                 player.skipToSeconds(0);
                 setPlaybackProgress(0); 
            }
            setIsPlayerLoadingSounds(true);
            setPlayerError(null);
            setIsPlaybackReady(false); 

            if (soundLoadingTimeoutRef.current) clearTimeout(soundLoadingTimeoutRef.current);
            soundLoadingTimeoutRef.current = setTimeout(() => {
              const currentPlayer = midiPlayerRef.current; 
              if (currentPlayer && isPlayerLoadingSoundsRef.current) { 
                 setPlayerError("Sound loading timed out. Check connection or try a different genre.");
                 currentPlayer.stop(); 
                 setIsPlayerLoadingSounds(false); 
                 setIsPlaying(false); 
                 setIsPlaybackReady(false); 
              }
              soundLoadingTimeoutRef.current = null; 
            }, SOUND_LOADING_TIMEOUT_MS);
            player.play(); 
        }
    };

    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().then(performPlayAction).catch((e: Error) => {
        setPlayerError(`Audio system error: ${e.message}. Please interact with the page and try again.`);
        if (soundLoadingTimeoutRef.current) clearTimeout(soundLoadingTimeoutRef.current);
        setIsPlayerLoadingSounds(false);
      });
    } else {
      performPlayAction();
    }
  }, [playbackProgress, midiFileStructLoaded]);

  const handleStop = useCallback(() => {
    const player = midiPlayerRef.current;
    if (!player) return;

    if (soundLoadingTimeoutRef.current) {
      clearTimeout(soundLoadingTimeoutRef.current);
      soundLoadingTimeoutRef.current = null;
    }
    
    setIsPlayerLoadingSounds(false);
    setIsPlaying(false);
    setIsPlaybackReady(false);
    setPlaybackProgress(0);
    setPlayerError(null); 

    player.stop();
  }, []);

  const handleDownloadMidi = () => {
    setMidiError(null); setIsGeneratingMidiForDownload(true);
    try {
      const midiDataUri = generateMidiFile(params);
      if (!midiDataUri || !midiDataUri.startsWith('data:audio/midi;base64,')) throw new Error("Generated MIDI data was invalid.");
      const link = document.createElement('a');
      link.href = midiDataUri;
      let baseFileName = 'dreamtuner_music';
      if(params.generatedIdea) baseFileName = params.generatedIdea.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_').slice(0,30);
      else if (params.originalInput.type === 'text' && params.originalInput.content) baseFileName = params.originalInput.content.substring(0,30).replace(/[^\w\s]/gi, '').replace(/\s+/g, '_');
      else if ((params.originalInput.type === 'image' || params.originalInput.type === 'video') && params.originalInput.fileDetails) baseFileName = params.originalInput.fileDetails.name.split('.')[0].replace(/[^\w\s]/gi, '').replace(/\s+/g, '_').slice(0,30);
      link.download = `${baseFileName || 'dreamtuner_output'}.mid`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : "Unknown error generating MIDI.");
    } finally {
      setIsGeneratingMidiForDownload(false);
    }
  };

  const handleCopyDetails = async () => {
    setIsCopied(false); setCopyError(null);
    let originalInputSummary = "";
    switch(params.originalInput.type) {
      case 'text': originalInputSummary = `Text: "${params.originalInput.content ? params.originalInput.content.substring(0, 100) : ''}${params.originalInput.content && params.originalInput.content.length > 100 ? '...' : ''}"`; break;
      case 'image': originalInputSummary = `${params.originalInput.mode === 'kids' ? "Child's Original Concept" : "Image"}: ${params.originalInput.fileDetails.name}`; 
        if (params.originalInput.mode === 'kids' && params.originalInput.voiceDescription) {
            originalInputSummary += `\nChild's Voice Hint: "${params.originalInput.voiceDescription}"`;
        }
        if (params.originalInput.additionalContext) {
          originalInputSummary += `\nAdditional Context: "${params.originalInput.additionalContext}"`;
        }
        break;
      case 'video': // Covers both video and audio concepts
        const fileTypeLabel = params.originalInput.fileDetails.type.startsWith('video/') ? 'Video' : 
                              params.originalInput.fileDetails.type.startsWith('audio/') ? 'Audio' : 'Media';
        originalInputSummary = `${fileTypeLabel} Concept: ${params.originalInput.fileDetails.name}`; 
        if (params.originalInput.additionalContext) {
          originalInputSummary += `\nAdditional Context: "${params.originalInput.additionalContext}"`;
        }
        break;
    }
    if (params.selectedGenre) originalInputSummary += `\nGenre: ${params.selectedGenre}`;


    const detailsToCopy = `DreamTuner - Musical Essence (${params.originalInput.mode} mode):
----------------------------------
Generated Idea: ${params.generatedIdea}
Original Input: ${originalInputSummary}
----------------------------------
Key: ${params.keySignature} ${params.mode}
Tempo: ${params.tempoBpm} BPM
Mood Tags: ${(params.moodTags || []).join(', ') || 'N/A'}
Instrument Hints: ${(params.instrumentHints || []).join(', ') || 'N/A'}
Rhythmic Density: ${params.rhythmicDensity.toFixed(2)} (${getRhythmicDensityDescription(params.rhythmicDensity)})
Harmonic Complexity: ${params.harmonicComplexity.toFixed(2)} (${getHarmonicComplexityDescription(params.harmonicComplexity)})
Target Valence: ${params.targetValence.toFixed(2)} (${getValenceArousalDescription(params.targetValence, params.targetArousal).split('(')[0].trim()})
Target Arousal: ${params.targetArousal.toFixed(2)}
----------------------------------
    `.trim();

    try {
      await navigator.clipboard.writeText(detailsToCopy);
      setIsCopied(true); setTimeout(() => setIsCopied(false), 3000);
    } catch (err) {
      setCopyError("Failed to copy. Browser might not support this or permissions denied."); setTimeout(() => setCopyError(null), 5000);
    }
  };

  const renderOriginalInputInfo = (input: AppInput) => {
    let icon: React.ReactNode; let title: string; let content: React.ReactNode;
    switch(input.type) {
      case 'text':
        icon = <DocumentTextIcon className="w-6 h-6" />; title = "Original Input Text";
        content = <ScrollArea className="h-24"><p className="text-muted-foreground text-sm italic whitespace-pre-wrap font-code">{input.content || ""}</p></ScrollArea>;
        break;
      case 'image':
        icon = <PhotographIcon className="w-6 h-6" />; 
        title = input.mode === 'kids' ? "Child's Original Concept" : "Original Input Image";
        content = (<>
            {input.fileDetails.url && input.fileDetails.size > 0 ? 
                <>
                    <p className="text-muted-foreground text-sm italic">Drawing: {input.fileDetails.name}</p>
                    <Image src={input.fileDetails.url} alt={input.fileDetails.name} data-ai-hint={input.mode === 'kids' ? "kids drawing" : "abstract texture"} width={160} height={160} className="mt-2 rounded max-h-40 object-contain border border-slate-700"/>
                </>
                : input.mode === 'kids' && input.voiceDescription ? 
                <p className="text-muted-foreground text-sm italic">Input was voice-only.</p> 
                :  <p className="text-muted-foreground text-sm italic">Filename: {input.fileDetails.name}</p>
            }
             {input.mode === 'kids' && input.voiceDescription && (
                <p className="text-muted-foreground text-xs italic mt-2">Voice Hint: "{input.voiceDescription}"</p>
             )}
             {input.mode === 'standard' && input.additionalContext && (
                <p className="text-muted-foreground text-xs italic mt-2">Additional Context: "{input.additionalContext}"</p>
             )}
          </>);
        break;
      case 'video': // Covers both video and audio concepts
        icon = <VideoCameraIcon className="w-6 h-6" />; title = "Original Input Video/Audio Concept";
        const fileTypeDisplay = input.fileDetails.type.startsWith('video/') ? 'Video' : 
                                input.fileDetails.type.startsWith('audio/') ? 'Audio' : 'Media';
        content = <>
            <p className="text-muted-foreground text-sm italic">{fileTypeDisplay} Concept: {input.fileDetails.name} (Analyzed conceptually)</p>
            {input.additionalContext && (
                <p className="text-muted-foreground text-xs italic mt-2">Additional Context: "{input.additionalContext}"</p>
             )}
        </>;
        break;
      default: return null;
    }
    return (
      <Card className="mt-8 bg-nebula-gray/80 border-slate-700">
        <CardHeader>
          <div className="flex items-center text-stardust-blue mb-2">
            {icon} <CardTitle className="ml-2 text-lg font-semibold">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>{content}</CardContent>
        {params.selectedGenre && (
          <CardFooter className="border-t border-slate-700 pt-4 flex-col items-start">
            {input.mode === 'kids' ? (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="selected-genre" className="border-b-0">
                  <AccordionTrigger className="py-1 hover:no-underline text-sm">
                    <div className="flex items-center text-stardust-blue">
                      <LibraryIcon className="w-5 h-5" /> 
                      <h5 className="ml-2 text-sm font-semibold">Selected Genre (Tap to view)</h5>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-0 pl-7">
                    <p className="text-muted-foreground text-sm">{params.selectedGenre}</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : (
              <div className="flex items-center text-stardust-blue">
                <LibraryIcon className="w-5 h-5" /> 
                <h5 className="ml-2 text-sm font-semibold">Selected Genre:</h5>
                <p className="text-muted-foreground text-sm ml-2">{params.selectedGenre}</p>
              </div>
            )}
          </CardFooter>
        )}
      </Card>
    );
  }


  const getRhythmicDensityDescription = (density: number) => {
    if (density > 0.8) return "Very Active & Dense"; if (density > 0.6) return "Quite Active";
    if (density > 0.4) return "Moderately Active"; if (density > 0.2) return "Less Active";
    return "Very Sparse";
  };
  const getHarmonicComplexityDescription = (complexity: number) => {
    let desc = "";
    if (complexity > 0.8) desc = "Highly Complex"; else if (complexity > 0.6) desc = "Complex";
    else if (complexity > 0.4) desc = "Moderately Complex"; else if (complexity > 0.2) desc = "Fairly Simple";
    else desc = "Very Simple";
    if (complexity > 0.6) desc += " (7ths Added)"; else if (complexity > 0.4) desc += " (Some Extended Chords)";
    else desc += " (Mainly Triads)";
    return desc;
  };

  const player = midiPlayerRef.current;
  const playButtonDisabled = !player ||
                             (!midiFileStructLoaded && !isPlayerLoadingSounds && !isPlaying) ||
                             (isPlayerLoadingSounds && !isPlaying); 
  const showLoadingSpinnerInPlayButton = isPlayerLoadingSounds && !isPlaying;

  let statusMessage = "";
  if (playerError) {
    statusMessage = `Player Error: ${playerError}`;
  } else if (params && !midiFileStructLoaded && !isPlaying && !isPlayerLoadingSounds) {
    statusMessage = "Preparing MIDI data...";
  } else if (midiFileStructLoaded && isPlayerLoadingSounds && !isPlaying) {
    statusMessage = "Loading instrument sounds...";
  } else if (midiFileStructLoaded && !isPlayerLoadingSounds && isPlaybackReady && !isPlaying && playbackProgress < 1) {
    statusMessage = "Ready to play.";
  } else if (midiFileStructLoaded && !isPlayerLoadingSounds && !isPlaybackReady && !isPlaying && playbackProgress >= 99) {
    statusMessage = "Playback finished. Play again?";
  }


  return (
    <div className="space-y-8 animate-fadeIn">
      <Card className="p-6 bg-gradient-to-r from-cosmic-purple to-stardust-blue shadow-xl text-center border-none">
        <CardTitle className="text-3xl font-bold text-primary-foreground mb-2">Musical Essence Unveiled</CardTitle>
        <div className="flex items-center justify-center space-x-2">
          <CardDescription className="text-lg text-purple-100 italic">"{params.generatedIdea}"</CardDescription>
          <Button variant="ghost" size="icon" onClick={onRegenerateIdea} disabled={isRegeneratingIdea} className="text-purple-200 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-purple-300 rounded-full" title="Regenerate Idea">
            {isRegeneratingIdea ? <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" fill="currentColor"></path></svg> : <RefreshIcon className="w-5 h-5" />}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ParameterCardComponent title="Key Signature" value={`${params.keySignature} ${params.mode}`} icon={<MusicalNoteIcon />} />
        <ParameterCardComponent title="Tempo" value={params.tempoBpm} unit="BPM" icon={<ClockIcon />} />
        <ParameterCardComponent title="Mood Tags" value={params.moodTags || []} icon={params.targetValence > 0 ? <MoodHappyIcon /> : <MoodSadIcon />} />
        <ParameterCardComponent title="Instrument Hints" value={params.instrumentHints || []} icon={<CollectionIcon />} />
        <ParameterCardComponent title="Valence & Arousal" value={`V: ${params.targetValence.toFixed(2)}, A: ${params.targetArousal.toFixed(2)}`} icon={<LightningBoltIcon />} subText={getValenceArousalDescription(params.targetValence, params.targetArousal)} />
        <ParameterCardComponent title="Rhythmic Density" value={params.rhythmicDensity} icon={<ScaleIcon />} subText={getRhythmicDensityDescription(params.rhythmicDensity)} />
        <ParameterCardComponent title="Harmonic Complexity" value={params.harmonicComplexity} icon={<CogIcon />} subText={getHarmonicComplexityDescription(params.harmonicComplexity)} />
        {params.selectedGenre && params.originalInput.mode === 'standard' && (
          <ParameterCardComponent title="Selected Genre" value={params.selectedGenre} icon={<LibraryIcon />} />
        )}
      </div>

      <Card className="mt-8 p-4 bg-nebula-gray/80 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-stardust-blue text-center">Listen to Your Tune</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center space-x-3">
            <Button onClick={handlePlayPause} disabled={playButtonDisabled} size="icon" className="p-3 rounded-full bg-cosmic-purple text-primary-foreground hover:bg-purple-700 disabled:bg-slate-600">
              {showLoadingSpinnerInPlayButton ? <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path></svg> : isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
            </Button>
            <Button onClick={handleStop} disabled={!player || (!isPlaying && !isPlaybackReady && !isPlayerLoadingSounds && playbackProgress === 0)} size="icon" className="p-3 rounded-full bg-slate-600 text-primary-foreground hover:bg-slate-500 disabled:bg-slate-700">
              <StopIcon className="w-6 h-6" />
            </Button>
          </div>
          <Progress value={playbackProgress} className="mt-4 h-2.5 [&>div]:bg-stardust-blue" aria-label="MIDI playback progress" />
          {statusMessage && <p className={`text-sm text-center mt-2 ${playerError ? 'text-red-400' : 'text-stardust-blue animate-pulse-subtle'}`}>{statusMessage}</p>}
        </CardContent>
      </Card>

      <div className="mt-8 text-center space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
        <Button onClick={handleDownloadMidi} disabled={isGeneratingMidiForDownload} className="w-full sm:w-auto bg-stardust-blue hover:bg-sky-500 text-primary-foreground">
          {isGeneratingMidiForDownload ? <><svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path></svg>Generating...</> : <><DownloadIcon className="w-5 h-5 mr-2 group-hover:scale-110" />Download MIDI</>}
        </Button>
        <Button onClick={handleCopyDetails} disabled={isCopied} variant="outline" className="w-full sm:w-auto border-slate-500 text-slate-200 hover:bg-slate-700 hover:text-slate-100">
           {isCopied ? <><ClipboardCopyIcon className="w-5 h-5 mr-2 text-green-400" />Copied!</> : <><ClipboardCopyIcon className="w-5 h-5 mr-2 group-hover:scale-110" />Copy Details</>}
        </Button>
      </div>
      <div className="text-center mt-2 h-4"> 
        {midiError && <p className="text-red-400 text-sm">{`MIDI Download Error: ${midiError}`}</p>}
        {copyError && <p className="text-red-400 text-sm">{copyError}</p>}
      </div>
      
      {params.originalInput && renderOriginalInputInfo(params.originalInput)}
      
    </div>
  );
};

    
