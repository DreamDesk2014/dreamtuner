
"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Tone from 'tone';
// import { Midi } from 'tone'; // Reverted this specific import
import type { MusicParameters, AppInput } from '@/types';
import { getValenceArousalDescription } from '@/lib/constants';
import { generateMidiFile } from '@/lib/midiService';
import { dataURLtoFile } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import {
  MusicalNoteIcon, ClockIcon, MoodHappyIcon, MoodSadIcon, LightningBoltIcon, CogIcon, ScaleIcon, CollectionIcon,
  DocumentTextIcon, DownloadIcon, PhotographIcon, VideoCameraIcon, ClipboardCopyIcon, RefreshIcon,
  LibraryIcon, PlayIcon, PauseIcon, StopIcon
} from './icons/HeroIcons';
import { Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { SparklesIcon as HeroSparklesIcon } from './icons/SparklesIcon';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from '@/components/ui/separator';


interface MusicOutputDisplayProps {
  params: MusicParameters;
  onRegenerateIdea: () => Promise<void>;
  isRegeneratingIdea: boolean;
  standardModeArtUrl?: string | null;
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

export const MusicOutputDisplay: React.FC<MusicOutputDisplayProps> = ({ params, onRegenerateIdea, isRegeneratingIdea, standardModeArtUrl }) => {
  const [midiError, setMidiError] = useState<string | null>(null);
  const [isGeneratingMidiForDownload, setIsGeneratingMidiForDownload] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // Tone.js specific state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoadingTone, setIsLoadingTone] = useState<boolean>(false);
  const [toneError, setToneError] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const [currentMidiDuration, setCurrentMidiDuration] = useState<number>(0);
  
  const synthsRef = useRef<{ 
    melody?: Tone.PolySynth, 
    bass?: Tone.PolySynth, 
    chords?: Tone.PolySynth,
    kick?: Tone.MembraneSynth,
    snare?: Tone.NoiseSynth,
    hiHat?: Tone.MetalSynth,
    parts?: Tone.Part[]
  }>({});
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Tone.js synths
  useEffect(() => {
    synthsRef.current = {
      melody: new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 } }).toDestination(),
      bass: new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsine' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 } }).toDestination(),
      chords: new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'amtriangle', harmonicity: 0.5 }, volume: -8, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1 } }).toDestination(),
      kick: new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 10, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: 'exponential' } }).toDestination(),
      snare: new Tone.NoiseSynth({ noise: { type: 'pink' }, volume: -5, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } }).toDestination(),
      hiHat: new Tone.MetalSynth({ frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3000, octaves: 1.5, volume: -15 }).toDestination(),
      parts: []
    };
    if(synthsRef.current.bass) synthsRef.current.bass.set({ oscillator: {type: "fmsine"}, detune: -1200 }); 
    
    return () => {
      Tone.Transport.cancel();
      Tone.Transport.clear(0); // Clear all scheduled events
      Object.values(synthsRef.current).forEach(synthOrParts => {
        if (Array.isArray(synthOrParts)) { 
            synthOrParts.forEach(part => part.dispose());
        } else if (synthOrParts && typeof (synthOrParts as any).dispose === 'function') {
            (synthOrParts as any).dispose();
        }
      });
      synthsRef.current = {};
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  // Load and schedule MIDI when params change
  useEffect(() => {
    const loadAndScheduleMidi = async () => {
      if (!params || !Object.keys(synthsRef.current).length || !synthsRef.current.melody) return; // Check if synths are initialized

      setIsLoadingTone(true);
      setToneError(null);
      setIsPlaying(false);
      setPlaybackProgress(0);
      setCurrentMidiDuration(0);
      
      Tone.Transport.stop();
      Tone.Transport.cancel(0);
      Tone.Transport.position = 0;
      synthsRef.current.parts?.forEach(part => part.dispose());
      synthsRef.current.parts = [];


      try {
        const midiDataUri = generateMidiFile(params);
        console.log("Generated MIDI Data URI for playback:", midiDataUri);
        if (!midiDataUri || !midiDataUri.startsWith('data:audio/midi;base64,')) {
          throw new Error("Failed to generate valid MIDI data for Tone.js. URI was: " + (midiDataUri ? midiDataUri.substring(0,100) + "..." : "undefined/null"));
        }
        if (!Tone.Midi || typeof Tone.Midi.fromUrl !== 'function') {
          console.error("Tone.Midi or Tone.Midi.fromUrl is not available.", Tone.Midi);
          throw new Error("Tone.Midi.fromUrl is not a function. Check Tone.js import or version.");
        }

        const parsedMidi = await Tone.Midi.fromUrl(midiDataUri); // Use Tone.Midi.fromUrl
        setCurrentMidiDuration(parsedMidi.duration);
        Tone.Transport.bpm.value = params.tempoBpm;

        const newParts: Tone.Part[] = [];

        parsedMidi.tracks.forEach((track, trackIndex) => {
          let synth: Tone.Synth | Tone.PolySynth | Tone.MembraneSynth | Tone.NoiseSynth | Tone.MetalSynth | undefined;
          
          if (track.channel === 9) { 
            track.notes.forEach(note => {
                let drumSynth: Tone.MembraneSynth | Tone.NoiseSynth | Tone.MetalSynth | undefined;
                let pitchToPlay: string | number | undefined = undefined;

                if (note.midi === 35 || note.midi === 36) { 
                    drumSynth = synthsRef.current.kick;
                } else if (note.midi === 38 || note.midi === 40) { 
                    drumSynth = synthsRef.current.snare;
                } else if (note.midi === 42 || note.midi === 44 || note.midi === 46) { 
                    drumSynth = synthsRef.current.hiHat;
                    pitchToPlay = note.midi === 46 ? 400 : 250; 
                }

                if (drumSynth) {
                    const part = new Tone.Part(((time, value) => {
                        if (drumSynth instanceof Tone.MembraneSynth && value.pitch) drumSynth.triggerAttackRelease(value.pitch, value.duration, time, value.velocity);
                        else if (drumSynth instanceof Tone.NoiseSynth) drumSynth.triggerAttackRelease(value.duration, time, value.velocity);
                        else if (drumSynth instanceof Tone.MetalSynth) drumSynth.triggerAttackRelease(value.duration, time, value.velocity);
                    }) as any, [{ time: note.time, duration: note.duration, velocity: note.velocity, pitch: pitchToPlay }]).start(0); // Cast to any to avoid type error
                    newParts.push(part);
                }
            });
          } else { 
            if (trackIndex === 0 && synthsRef.current.melody) synth = synthsRef.current.melody;
            else if (trackIndex === 1 && synthsRef.current.bass) synth = synthsRef.current.bass;
            else if (synthsRef.current.chords) synth = synthsRef.current.chords;
            
            if (synth) {
              const part = new Tone.Part(((time, value) => {
                (synth as Tone.PolySynth).triggerAttackRelease(value.name, value.duration, time, value.velocity);
              }) as any, track.notes.map(n => ({ time: n.time, name: n.name, duration: n.duration, velocity: n.velocity }))).start(0);  // Cast to any to avoid type error
              newParts.push(part);
            }
          }
        });
        synthsRef.current.parts = newParts;

      } catch (error) {
        console.error("Tone.js MIDI loading/scheduling error:", error);
        setToneError(error instanceof Error ? error.message : "Error loading or scheduling MIDI with Tone.js");
      } finally {
        setIsLoadingTone(false);
      }
    };

    loadAndScheduleMidi();

  }, [params]);


  const updateProgress = useCallback(() => {
    if (Tone.Transport.state === "started" && currentMidiDuration > 0) {
      const progress = (Tone.Transport.seconds / currentMidiDuration) * 100;
      setPlaybackProgress(Math.min(progress, 100));
    } else if (Tone.Transport.state !== "started") {
       if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
       progressIntervalRef.current = null;
       if(playbackProgress > 99 && playbackProgress < 100.1 && !isPlaying) { 
         setPlaybackProgress(100);
       }
    }
  }, [currentMidiDuration, isPlaying, playbackProgress]);


  useEffect(() => {
    const endOfTransportHandler = () => {
      setIsPlaying(false);
      setPlaybackProgress(100);
       if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
       progressIntervalRef.current = null;
    };

    Tone.Transport.on('stop', endOfTransportHandler);
    
    return () => {
      Tone.Transport.off('stop', endOfTransportHandler);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);


  const handlePlayPause = async () => {
    setToneError(null);
    try {
      if (Tone.context.state !== 'running') {
        await Tone.start();
      }

      if (Tone.Transport.state === 'started') {
        Tone.Transport.pause();
        setIsPlaying(false);
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      } else {
        if (playbackProgress >= 100 && currentMidiDuration > 0) { 
             Tone.Transport.position = 0;
             setPlaybackProgress(0);
             synthsRef.current.parts?.forEach(part => part.start(0)); 
        }
        Tone.Transport.start();
        setIsPlaying(true);
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = setInterval(updateProgress, 100);
      }
    } catch (error) {
      console.error("Tone.js play/pause error:", error);
      setToneError(error instanceof Error ? error.message : "Playback error");
      setIsPlaying(false);
    }
  };

  const handleStop = async () => {
    try {
      if (Tone.context.state !== 'running') {
        await Tone.start(); 
      }
      Tone.Transport.stop();
      Tone.Transport.position = 0; 
      synthsRef.current.parts?.forEach(part => { 
        part.stop(0); 
      });

      setIsPlaying(false);
      setPlaybackProgress(0);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    } catch (error) {
      console.error("Tone.js stop error:", error);
      setToneError(error instanceof Error ? error.message : "Stop error");
    }
  };


  const handleDownloadMidi = () => {
    setMidiError(null); setIsGeneratingMidiForDownload(true);
    try {
      const midiDataUri = generateMidiFile(params);
      if (!midiDataUri || !midiDataUri.startsWith('data:audio/midi;base64,')) throw new Error("Generated MIDI data was invalid.");
      const link = document.createElement('a');
      link.href = midiDataUri;
      let baseFileName = 'dreamtuner_music';
      if(params.generatedIdea) baseFileName = params.generatedIdea.replace(/[^\\w\\s]/gi, '').replace(/\\s+/g, '_').slice(0,30);
      else if (params.originalInput.type === 'text' && params.originalInput.content) baseFileName = params.originalInput.content.substring(0,30).replace(/[^\\w\\s]/gi, '').replace(/\\s+/g, '_');
      else if ((params.originalInput.type === 'image' || params.originalInput.type === 'video') && params.originalInput.fileDetails) baseFileName = params.originalInput.fileDetails.name.split('.')[0].replace(/[^\\w\\s]/gi, '').replace(/\\s+/g, '_').slice(0,30);
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
            originalInputSummary += `\\nChild's Voice Hint: "${params.originalInput.voiceDescription}"`;
        }
        if (params.originalInput.additionalContext) {
          originalInputSummary += `\\nAdditional Context: "${params.originalInput.additionalContext}"`;
        }
        break;
      case 'video': 
        const fileTypeLabel = params.originalInput.fileDetails.type.startsWith('video/') ? 'Video' :
                              params.originalInput.fileDetails.type.startsWith('audio/') ? 'Audio' : 'Media';
        originalInputSummary = `${fileTypeLabel} Concept: ${params.originalInput.fileDetails.name}`;
        if (params.originalInput.additionalContext) {
          originalInputSummary += `\\nAdditional Context: "${params.originalInput.additionalContext}"`;
        }
        break;
    }
    if (params.selectedGenre) originalInputSummary += `\\nGenre: ${params.selectedGenre}`;


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

  const handleShare = async () => {
    setShareError(null);
    if (!navigator.share) {
      toast({
        variant: "destructive",
        title: "Share Not Supported",
        description: "Web Share API is not available on your browser.",
      });
      setShareError("Web Share API not supported.");
      return;
    }

    setIsSharing(true);
    try {
      const filesToShareAttempt: (File | null)[] = [];
      let shareText = `Check out this musical idea from DreamTuner: "${params.generatedIdea}"`;
      
      const midiDataUri = generateMidiFile(params);
      if (midiDataUri && midiDataUri.startsWith('data:audio/midi;base64,')) {
        let baseFileName = 'dreamtuner_music';
        if(params.generatedIdea) baseFileName = params.generatedIdea.replace(/[^\\w\\s]/gi, '').replace(/\\s+/g, '_').slice(0,30);
        const midiFile = dataURLtoFile(midiDataUri, `${baseFileName}.mid`);
        if (midiFile) filesToShareAttempt.push(midiFile);
        else console.warn("Could not convert MIDI data to a shareable file.");
      } else {
        console.warn("Generated MIDI data was invalid for sharing.");
      }

      if (params.originalInput.mode === 'standard' && standardModeArtUrl) {
        const artFile = dataURLtoFile(standardModeArtUrl, "dreamtuner_standard_art.png");
        if (artFile) filesToShareAttempt.push(artFile);
        else console.warn("Could not convert Standard Mode AI art to a shareable file.");
        shareText += "\\nIt also inspired this AI artwork!";
      }
      
      const validFilesToShare = filesToShareAttempt.filter(file => file !== null) as File[];

      if (validFilesToShare.length === 0) {
        throw new Error("No shareable content could be prepared from MusicOutputDisplay.");
      }

      const shareData: ShareData = {
        title: `DreamTuner Creation: "${params.generatedIdea}"`,
        text: shareText,
        files: validFilesToShare,
      };

      await navigator.share(shareData);
      toast({ title: "Shared Successfully!" });

    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast({ title: "Share Cancelled", variant: "default" });
      } else if (error.name === 'NotAllowedError') {
        toast({
          variant: "destructive",
          title: "Share Permission Denied",
          description: "Browser or OS denied share permission.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Share Failed",
          description: error.message || "Could not share the content.",
        });
      }
      setShareError(error.message || "Failed to share.");
      console.error("Share error from MusicOutputDisplay:", error);
    } finally {
      setIsSharing(false);
    }
  };


  const renderOriginalInputInfo = (input: AppInput) => {
    let icon: React.ReactNode;
    let title: string;
    let contentDisplay: React.ReactNode;
    let footerContent: React.ReactNode = null;

    switch(input.type) {
      case 'text':
        icon = <DocumentTextIcon className="w-6 h-6" />;
        title = "Original Text & Generated Core";

        const originalTextContent = input.content || "";
        const lines = originalTextContent.split('\\n');
        const renderedElements: React.ReactNode[] = [];

        const isClearlyNoteLine = (line: string): boolean => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return false;
          if (/^([CDEFGAB][#b♭♯]?[0-9]?(\\s*[-–—]\\s*)?)+$/.test(trimmedLine)) {
              const words = trimmedLine.split(/[\\s-]+/).filter(w => w.length > 0);
              let noteLikeWords = 0;
              let nonNoteLikeWords = 0;
              words.forEach(word => {
                  if (/^[CDEFGAB][#b♭♯]?[0-9]?$/.test(word)) {
                      noteLikeWords++;
                  } else {
                      nonNoteLikeWords++;
                  }
              });
              return noteLikeWords > nonNoteLikeWords || (noteLikeWords > 0 && nonNoteLikeWords === 0);
          }
          return false;
        };

        for (let i = 0; i < lines.length; i++) {
          const currentLine = lines[i];
          if (!currentLine.trim() && i > 0 && i < lines.length -1 && lines[i-1].trim() && lines[i+1].trim()) {
             renderedElements.push(<div key={`spacer-${i}`} className="h-1"></div>);
          } else if (currentLine.trim()) {
             renderedElements.push(
              <p key={`lyric-${i}`} className="text-muted-foreground text-sm whitespace-pre-wrap">
                {currentLine}
              </p>
            );
            if (i + 1 < lines.length) {
              const nextLine = lines[i+1];
              if (isClearlyNoteLine(nextLine.trim())) {
                renderedElements.push(
                  <p key={`notes-${i}`} className="text-stardust-blue/90 text-xs whitespace-pre-wrap font-code ml-2 tracking-wider">
                    {nextLine}
                  </p>
                );
                i++;
              }
            }
          }
        }

        contentDisplay = (
          <>
            <ScrollArea className="h-auto max-h-80 mb-3 pr-3">
              <div className="space-y-1">
                {renderedElements.map((el, index) => <React.Fragment key={index}>{el}</React.Fragment>)}
              </div>
            </ScrollArea>
            <Separator className="my-3 bg-slate-600" />
            <div className="space-y-1 text-sm mt-3">
              <p><strong className="text-stardust-blue">Generated Musical Idea:</strong> <span className="text-galaxy-white italic">"{params.generatedIdea}"</span></p>
              <p><strong className="text-stardust-blue">Key:</strong> {params.keySignature} {params.mode}</p>
              <p><strong className="text-stardust-blue">Tempo:</strong> {params.tempoBpm} BPM</p>
              {params.selectedGenre && (
                <p><strong className="text-stardust-blue">Selected Genre:</strong> {params.selectedGenre}</p>
              )}
            </div>
          </>
        );
        return (
          <Card className="mt-8 bg-nebula-gray/80 border-slate-700">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="original-input-text" className="border-b-0">
                <AccordionTrigger className="p-6 hover:no-underline">
                  <div className="flex items-center text-stardust-blue">
                    {icon}
                    <CardTitle className="ml-2 text-lg font-semibold">{title}</CardTitle>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  {contentDisplay}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
        );

      case 'image':
        icon = <PhotographIcon className="w-6 h-6" />;
        title = input.mode === 'kids' ? "Child's Original Concept" : "Original Input Image";
        contentDisplay = (<>
            {input.fileDetails.url && input.fileDetails.size > 0 ?
                <>
                    <p className="text-muted-foreground text-sm italic">{input.mode === 'kids' ? 'Drawing:' : 'Image:'} {input.fileDetails.name}</p>
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
      case 'video': 
        icon = <VideoCameraIcon className="w-6 h-6" />; title = "Original Input Concept";
        const fileTypeDisplay = input.fileDetails.type.startsWith('video/') ? 'Video' :
                                input.fileDetails.type.startsWith('audio/') ? 'Audio' : 'Media';
        contentDisplay = <>
            <p className="text-muted-foreground text-sm italic">{fileTypeDisplay} Concept: {input.fileDetails.name} (Analyzed conceptually{input.fileDetails.url && input.fileDetails.type.startsWith('audio/') ? ' from live recording' : ''})</p>
            {input.additionalContext && (
                <p className="text-muted-foreground text-xs italic mt-2">Additional Context: "{input.additionalContext}"</p>
             )}
            {input.fileDetails.url && input.fileDetails.type.startsWith('audio/') && (
                <audio controls src={input.fileDetails.url} className="w-full mt-2" />
            )}
        </>;
        break;
      default: return null;
    }

    if (params.selectedGenre && (input.type !== 'text' || input.mode === 'kids')) {
      const genreDisplay = (
        <div className="flex items-center text-stardust-blue">
          <LibraryIcon className="w-5 h-5" />
          <h5 className="ml-2 text-sm font-semibold">Selected Genre:</h5>
          <p className="text-muted-foreground text-sm ml-2">{params.selectedGenre}</p>
        </div>
      );
      if (input.mode === 'kids') {
        footerContent = (
           <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="selected-genre-kids" className="border-b-0">
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
        );
      } else {
         footerContent = genreDisplay;
      }
    }


    return (
      <Card className="mt-8 bg-nebula-gray/80 border-slate-700">
        <CardHeader>
          <div className="flex items-center text-stardust-blue mb-2">
            {icon} <CardTitle className="ml-2 text-lg font-semibold">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>{contentDisplay}</CardContent>
        {footerContent && (
          <CardFooter className="border-t border-slate-700 pt-4 flex-col items-start">
             {footerContent}
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

  const playButtonDisabled = isLoadingTone || !currentMidiDuration;
  const showLoadingSpinnerInPlayButton = isLoadingTone;

  let statusMessage = "";
  if (toneError) {
    statusMessage = `Player Error: ${toneError}`;
  } else if (isLoadingTone) {
    statusMessage = "Preparing your tune with Tone.js...";
  } else if (!isPlaying && currentMidiDuration > 0 && playbackProgress < 1) {
    statusMessage = "Ready to play.";
  } else if (!isPlaying && currentMidiDuration > 0 && playbackProgress >= 100) {
    statusMessage = "Playback finished. Play again?";
  }


  return (
    <div className="space-y-8 animate-fadeIn">
      <Card className="p-6 bg-primary shadow-xl text-center border-none">
        <CardTitle className="text-3xl font-bold text-primary-foreground mb-2">Musical Essence Unveiled</CardTitle>
        <div className="flex items-center justify-center space-x-2">
          <CardDescription className="text-lg text-primary-foreground/80 italic">"{params.generatedIdea}"</CardDescription>
          <Button variant="ghost" size="icon" onClick={onRegenerateIdea} disabled={isRegeneratingIdea} className="text-primary-foreground/70 hover:text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed focus:ring-primary rounded-full" title="Regenerate Idea">
            {isRegeneratingIdea ? <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" fill="currentColor"></path></svg> : <RefreshIcon className="w-5 h-5" />}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ParameterCardComponent title="Key Signature" value={`${params.keySignature} ${params.mode}`} icon={<MusicalNoteIcon />} />
        <ParameterCardComponent title="Tempo" value={params.tempoBpm} unit="BPM" icon={<ClockIcon />} />
        <ParameterCardComponent title="Mood Tags" value={params.moodTags || []} icon={params.targetValence > 0 ? <MoodHappyIcon /> : <MoodSadIcon />} />
        <ParameterCardComponent title="Instrument Hints" value={params.instrumentHints || []} icon={<CollectionIcon />} />
        <ParameterCardComponent title="Valence &amp; Arousal" value={`V: ${params.targetValence.toFixed(2)}, A: ${params.targetArousal.toFixed(2)}`} icon={<LightningBoltIcon />} subText={getValenceArousalDescription(params.targetValence, params.targetArousal)} />
        <ParameterCardComponent title="Rhythmic Density" value={params.rhythmicDensity} icon={<ScaleIcon />} subText={getRhythmicDensityDescription(params.rhythmicDensity)} />
        <ParameterCardComponent title="Harmonic Complexity" value={params.harmonicComplexity} icon={<CogIcon />} subText={getHarmonicComplexityDescription(params.harmonicComplexity)} />
        {params.selectedGenre && params.originalInput.mode === 'standard' && (
          <ParameterCardComponent title="Selected Genre" value={params.selectedGenre} icon={<LibraryIcon />} />
        )}
      </div>

      <Card className="mt-8 p-4 bg-nebula-gray/80 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-stardust-blue text-center">Listen to Your Tune (Tone.js)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center space-x-3">
            <Button onClick={handlePlayPause} disabled={playButtonDisabled} size="icon" className="p-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-slate-600">
              {showLoadingSpinnerInPlayButton ? <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path></svg> : isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
            </Button>
            <Button onClick={handleStop} disabled={isLoadingTone || (!isPlaying && playbackProgress === 0)} size="icon" className="p-3 rounded-full bg-slate-600 text-primary-foreground hover:bg-slate-500 disabled:bg-slate-700">
              <StopIcon className="w-6 h-6" />
            </Button>
          </div>
          <Progress value={playbackProgress} className="mt-4 h-2.5 [&>div]:bg-stardust-blue" aria-label="Tone.js playback progress" />
          {statusMessage && <p className={`text-sm text-center mt-2 ${toneError ? 'text-red-400' : 'text-stardust-blue animate-pulse-subtle'}`}>{statusMessage}</p>}
        </CardContent>
      </Card>

      <div className="mt-8 text-center space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
        <Button onClick={handleDownloadMidi} disabled={isGeneratingMidiForDownload} className="w-full sm:w-auto bg-stardust-blue hover:bg-sky-500 text-primary-foreground">
          {isGeneratingMidiForDownload ? <><svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path></svg>Generating...</> : <><DownloadIcon className="w-5 h-5 mr-2 group-hover:scale-110" />Download MIDI</>}
        </Button>
        <Button onClick={handleCopyDetails} disabled={isCopied} variant="outline" className="w-full sm:w-auto border-slate-500 text-slate-200 hover:bg-slate-700 hover:text-slate-100">
           {isCopied ? <><ClipboardCopyIcon className="w-5 h-5 mr-2 text-green-400" />Copied!</> : <><ClipboardCopyIcon className="w-5 h-5 mr-2 group-hover:scale-110" />Copy Details</>}
        </Button>
        <Button 
          onClick={handleShare} 
          disabled={isSharing || (params.originalInput.mode === 'standard' && !standardModeArtUrl && !params) || (params.originalInput.mode === 'kids' && !params) } 
          variant="outline" 
          className="w-full sm:w-auto border-green-500 text-green-400 hover:bg-green-500/10 hover:text-green-300"
        >
          {isSharing ? <><svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path></svg>Sharing...</> : <><Share2 className="w-5 h-5 mr-2 group-hover:scale-110" />Share Creation</>}
        </Button>
      </div>
      <div className="text-center mt-2 h-4">
        {midiError && <p className="text-red-400 text-sm">{`MIDI Download Error: ${midiError}`}</p>}
        {copyError && <p className="text-red-400 text-sm">{copyError}</p>}
        {shareError && <p className="text-red-400 text-sm">{`Share Error: ${shareError}`}</p>}
      </div>

      {params.originalInput && renderOriginalInputInfo(params.originalInput)}

    </div>
  );
};


