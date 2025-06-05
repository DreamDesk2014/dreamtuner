
"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Tone from 'tone';
import { Midi as MidiFileParser } from '@tonejs/midi';
import type { MusicParameters, AppInput } from '@/types';
import { getValenceArousalDescription } from '@/lib/constants';
import { generateMidiFile } from '@/lib/midiService';
import { dataURLtoFile } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import {
  MusicalNoteIcon, ClockIcon, MoodHappyIcon, MoodSadIcon, LightningBoltIcon, CogIcon, ScaleIcon, CollectionIcon,
  DocumentTextIcon, DownloadIcon, PhotographIcon, VideoCameraIcon, ClipboardCopyIcon, RefreshIcon,
  LibraryIcon, PlayIcon, PauseIcon, StopIcon
} from './icons/HeroIcons'; // Corrected path
import { Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { SparklesIcon as HeroSparklesIcon } from '../icons/SparklesIcon';
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

const MIN_TIME_GAP = 0.00001; // Epsilon for ensuring strictly increasing times

interface EventTime { time: number; [key: string]: any; }

function ensureStrictlyIncreasingTimes<T extends EventTime>(events: T[]): T[] {
  let lastTime = -Infinity;
  return events.map((e) => {
    // Ensure e.time is a number before comparison
    const currentTime = typeof e.time === 'number' ? e.time : parseFloat(e.time as any);
    if (isNaN(currentTime)) {
        console.warn("Invalid time in event, skipping adjustment:", e);
        return e; // Or handle error appropriately
    }
    const time = currentTime <= lastTime ? lastTime + MIN_TIME_GAP : currentTime;
    lastTime = time;
    return { ...e, time };
  });
}

interface SynthConfigurations {
  melody: Partial<Tone.SynthOptions>;
  bass: Partial<Tone.SynthOptions>;
  chords: Partial<Tone.SynthOptions>;
  kick: Partial<Tone.MembraneSynthOptions>;
  snare: Partial<Tone.NoiseSynthOptions>;
  hiHat: Partial<Tone.MetalSynthOptions>;
}


const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genre: string = '',
  isKidsMode: boolean = false
): SynthConfigurations => {
  const hintsLower = instrumentHints.map(h => h.toLowerCase());
  const genreLower = genre.toLowerCase();

  // Default configurations
  let configs: SynthConfigurations = {
    melody: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.4 }, volume: -3 },
    bass: { oscillator: { type: 'fatsine', count: 2, spread: 10 }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.5 }, volume: -6 }, // detune applied in PolySynth constructor
    chords: { oscillator: { type: 'amtriangle', harmonicity: 0.5 }, volume: -12, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 } },
    kick: { pitchDecay: 0.05, octaves: 10, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: 'exponential' }, volume: 0 },
    snare: { noise: { type: 'pink' }, volume: -8, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } },
    hiHat: { frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3000, octaves: 1.5, volume: -20 },
  };

  if (isKidsMode) {
    configs.melody = { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3 }, volume: -3 };
    configs.bass = { oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.4 }, volume: -6 };
    configs.chords = { oscillator: { type: 'triangle' }, volume: -15, envelope: { attack: 0.1, decay: 0.4, sustain: 0.5, release: 0.8 } };
    configs.kick.pitchDecay = 0.1;
    configs.snare.noise.type = 'white'; configs.snare.envelope.decay = 0.1;
    configs.hiHat.frequency = 300; configs.hiHat.envelope.decay = 0.03;
  } else { // Genre and Hint based adjustments for non-kids mode
    if (genreLower.includes('electronic')) {
      configs.melody.oscillator.type = 'pulse';
      configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = -3;
      configs.chords.oscillator.type = 'pwm'; configs.chords.oscillator.modulationFrequency = 0.5; configs.chords.volume = -10;
    } else if (genreLower.includes('ambient')) {
      configs.melody.envelope = { attack: 0.5, decay: 0.2, sustain: 0.8, release: 2.0 }; configs.melody.volume = -6;
      configs.bass.envelope = { attack: 0.6, decay: 0.3, sustain: 0.9, release: 2.5 }; configs.bass.volume = -9;
      configs.chords.oscillator.type = 'fatsine'; configs.chords.volume = -12;
      configs.chords.envelope = { attack: 1.0, decay: 0.5, sustain: 0.9, release: 3.0 };
    } else if (genreLower.includes('rock') || genreLower.includes('metal')) {
      configs.melody.oscillator.type = 'fatsawtooth'; configs.melody.volume = 0;
      configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = -3;
      configs.chords.oscillator.type = 'fatsawtooth'; configs.chords.volume = -9;
      configs.kick.octaves = 8; configs.kick.envelope.decay = 0.3;
      configs.snare.envelope.decay = 0.1; configs.snare.volume = -6;
    } else if (genreLower.includes('jazz')) {
      configs.melody = { oscillator: { type: 'fmsine', harmonicity: 1.5, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.2 }, volume: -3 }; // Piano-like
      configs.bass = { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.3 }, volume: -6 }; // Acoustic bass-like
      configs.chords = { oscillator: { type: 'fmtriangle', harmonicity: 2, modulationIndex: 3 }, volume: -15, envelope: { attack: 0.02, decay: 0.6, sustain: 0.3, release: 0.5 } }; // Smoother chords
    }

    hintsLower.forEach(hint => {
      if (hint.includes('piano')) {
        configs.melody = { oscillator: { type: 'fmsine', harmonicity: 2.1, modulationIndex: 10, detune: 2 }, envelope: { attack: 0.005, decay: 0.7, sustain: 0.05, release: 0.4 }, volume: -3 };
        if (!genreLower.includes('jazz')) configs.chords = { oscillator: { type: 'fmsine', harmonicity: 2.5, modulationIndex: 8 }, volume: -12, envelope: { attack: 0.01, decay: 0.8, sustain: 0.1, release: 0.5 } };
      } else if (hint.includes('strings') || hint.includes('pad') && !hint.includes('synth pad')) {
        configs.melody = { oscillator: { type: 'fatsawtooth', count: 5, spread: 30 }, envelope: { attack: 0.3, decay: 0.1, sustain: 0.9, release: 1.2 }, volume: -6 };
        configs.chords = { oscillator: { type: 'fatsawtooth', count: 7, spread: 50 }, volume: -10, envelope: { attack: 0.5, decay: 0.2, sustain: 0.9, release: 1.5 } };
      } else if (hint.includes('synth lead') && !isKidsMode) {
        configs.melody = { oscillator: { type: 'pwm', modulationFrequency: 0.3 }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.6 }, volume: 0 };
      } else if (hint.includes('acoustic guitar')) {
         configs.melody = { oscillator: { type: 'fmtriangle', harmonicity: 1.2, modulationIndex: 12 }, envelope: { attack: 0.01, decay: 0.25, sustain: 0.01, release: 0.15}, volume: -4 };
         configs.chords = { oscillator: { type: 'fmtriangle', harmonicity: 1.5, modulationIndex: 10 }, volume: -10, envelope: { attack: 0.02, decay: 0.4, sustain: 0.05, release: 0.25} };
      } else if (hint.includes('flute')) {
        configs.melody = { oscillator: { type: 'triangle8' }, envelope: { attack: 0.06, decay: 0.15, sustain: 0.6, release: 0.35 }, volume: -5 };
      } else if (hint.includes('bell') || hint.includes('xylophone')) {
        configs.melody = { oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.5, sustain: 0.01, release: 0.3, attackCurve: 'exponential' }, volume: -3 };
      }
      // Bass hints
      if (hint.includes('synth bass')) configs.bass = { oscillator: {type: 'fatsquare', count: 3, spread: 15}, envelope: {attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3}, volume: -3};
      else if (hint.includes('acoustic bass') && !genreLower.includes('jazz')) configs.bass = { oscillator: {type: 'sine'}, envelope: {attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.3}, volume: -6};
      // Pad hints (for chords primarily)
      if (hint.includes('synth pad')) configs.chords = {oscillator: {type: 'fatsawtooth', count: 4, spread: 60}, volume: -12, envelope: {attack: 0.4, decay: 0.1, sustain: 0.9, release: 1.2}};
    });
  }

  return configs;
};


export const MusicOutputDisplay: React.FC<MusicOutputDisplayProps> = ({ params, onRegenerateIdea, isRegeneratingIdea, standardModeArtUrl }) => {
  const [midiError, setMidiError] = useState<string | null>(null);
  const [isGeneratingMidiForDownload, setIsGeneratingMidiForDownload] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);

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
    parts: (Tone.Part | Tone.Sequence)[]
  }>({parts: []});
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initial synth creation - will be configured dynamically later
    synthsRef.current = {
      melody: new Tone.PolySynth(Tone.Synth).toDestination(),
      bass: new Tone.PolySynth(Tone.Synth, { detune: -1200 }).toDestination(), // Keep detune for bass
      chords: new Tone.PolySynth(Tone.Synth).toDestination(),
      kick: new Tone.MembraneSynth().toDestination(),
      snare: new Tone.NoiseSynth().toDestination(),
      hiHat: new Tone.MetalSynth().toDestination(),
      parts: []
    };
    
    return () => {
      Tone.Transport.stop();
      Tone.Transport.cancel(0);
      synthsRef.current.parts.forEach(part => part.dispose());
      Object.values(synthsRef.current).forEach(synthOrParts => {
        if (synthOrParts && typeof (synthOrParts as any).dispose === 'function' && !Array.isArray(synthOrParts)) {
            (synthOrParts as any).dispose();
        }
      });
      synthsRef.current = { parts: [] }; // Clear refs
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const loadAndScheduleMidi = async () => {
      if (!params || !synthsRef.current.melody || !synthsRef.current.kick || !synthsRef.current.snare || !synthsRef.current.hiHat || !synthsRef.current.bass || !synthsRef.current.chords) { 
        return;
      }

      setIsLoadingTone(true);
      setToneError(null);
      setIsPlaying(false);
      setPlaybackProgress(0);
      setCurrentMidiDuration(0);
      
      Tone.Transport.stop();
      Tone.Transport.cancel(0);
      Tone.Transport.position = 0;
      synthsRef.current.parts.forEach(part => part.dispose());
      synthsRef.current.parts = [];

      try {
        // Apply dynamic synth configurations
        const synthConfigs = getSynthConfigurations(
          params.instrumentHints,
          params.selectedGenre,
          params.originalInput.mode === 'kids'
        );

        if (synthsRef.current.melody) synthsRef.current.melody.set(synthConfigs.melody);
        if (synthsRef.current.bass) synthsRef.current.bass.set(synthConfigs.bass);
        if (synthsRef.current.chords) synthsRef.current.chords.set(synthConfigs.chords);
        if (synthsRef.current.kick) synthsRef.current.kick.set(synthConfigs.kick);
        if (synthsRef.current.snare) synthsRef.current.snare.set(synthConfigs.snare);
        if (synthsRef.current.hiHat) synthsRef.current.hiHat.set(synthConfigs.hiHat);


        const midiDataUri = generateMidiFile(params);
        if (!midiDataUri || !midiDataUri.startsWith('data:audio/midi;base64,')) {
          throw new Error("Failed to generate valid MIDI data.");
        }
        
        const parsedMidi = await MidiFileParser.fromUrl(midiDataUri);
        setCurrentMidiDuration(parsedMidi.duration);
        Tone.Transport.bpm.value = params.tempoBpm;

        const newParts: (Tone.Part | Tone.Sequence)[] = [];
        const drumEvents: { kick: EventTime[], snare: EventTime[], hiHat: EventTime[] } = { kick: [], snare: [], hiHat: [] };
        const lastDrumEventTimes = { kick: -Infinity, snare: -Infinity, hiHat: -Infinity };
        const epsilon = 0.0001;
        
        parsedMidi.tracks.forEach((track, trackIndex) => {
          if (track.channel === 9) { // Drum track
            track.notes.forEach(note => {
                const noteTime = parseFloat(note.time as any);
                const noteDuration = parseFloat(note.duration as any);
                const noteVelocity = parseFloat(note.velocity as any);

                if (isNaN(noteTime) || isNaN(noteDuration) || isNaN(noteVelocity)) {
                    console.warn("Skipping drum note with invalid time/duration/velocity:", note);
                    return; 
                }

                let drumType: 'kick' | 'snare' | 'hiHat' | null = null;
                let pitchToPlay: string | number | undefined = undefined;
                
                if (note.midi === 35 || note.midi === 36) { drumType = 'kick'; pitchToPlay = "C1"; }
                else if (note.midi === 38 || note.midi === 40) { drumType = 'snare'; }
                else if (note.midi === 42 || note.midi === 44 || note.midi === 46) { 
                    drumType = 'hiHat'; 
                    pitchToPlay = note.midi === 46 ? 400 : 250; 
                }

                if (drumType) {
                    let eventTime = noteTime;
                    if (eventTime <= lastDrumEventTimes[drumType]) {
                        eventTime = lastDrumEventTimes[drumType] + epsilon;
                    }
                    lastDrumEventTimes[drumType] = eventTime;
                    const event: EventTime = { time: eventTime, duration: noteDuration, velocity: noteVelocity, pitch: pitchToPlay };
                    if (drumType === 'kick') drumEvents.kick.push(event);
                    else if (drumType === 'snare') drumEvents.snare.push(event);
                    else if (drumType === 'hiHat') drumEvents.hiHat.push(event);
                }
            });
          } else { 
            let synth: Tone.PolySynth | undefined;
            if (trackIndex === 0 && synthsRef.current.melody) synth = synthsRef.current.melody;
            else if (trackIndex === 1 && synthsRef.current.bass) synth = synthsRef.current.bass;
            else if (synthsRef.current.chords) synth = synthsRef.current.chords; 
            
            if (synth) {
              const trackEvents = track.notes.map(n => {
                const noteTime = parseFloat(n.time as any);
                const noteDuration = parseFloat(n.duration as any);
                const noteVelocity = parseFloat(n.velocity as any);
                if (typeof n.name === 'string' && !isNaN(noteTime) && !isNaN(noteDuration) && !isNaN(noteVelocity)) {
                  return { time: noteTime, name: n.name, duration: noteDuration, velocity: noteVelocity };
                }
                return null;
              }).filter(e => e !== null) as EventTime[];

              if (trackEvents.length > 0) {
                const correctedTrackEvents = ensureStrictlyIncreasingTimes(trackEvents);
                const part = new Tone.Part(((time, value) => {
                  if (value.name && synth) { 
                    synth.triggerAttackRelease(value.name, value.duration, time, value.velocity);
                  }
                }) as any, correctedTrackEvents);
                newParts.push(part);
              }
            }
          }
        });

        if (drumEvents.kick.length > 0 && synthsRef.current.kick) {
            const correctedKickEvents = ensureStrictlyIncreasingTimes(drumEvents.kick.sort((a,b) => a.time - b.time));
            const kickPart = new Tone.Part(((time, value) => {
                if (value.pitch && synthsRef.current.kick) synthsRef.current.kick.triggerAttackRelease(value.pitch as string, value.duration, time, value.velocity);
            }) as any, correctedKickEvents);
            newParts.push(kickPart);
        }
        if (drumEvents.snare.length > 0 && synthsRef.current.snare) {
             const correctedSnareEvents = ensureStrictlyIncreasingTimes(drumEvents.snare.sort((a,b) => a.time - b.time));
            const snarePart = new Tone.Part(((time, value) => {
                 if (synthsRef.current.snare) synthsRef.current.snare.triggerAttackRelease(value.duration, time, value.velocity);
            }) as any, correctedSnareEvents);
            newParts.push(snarePart);
        }
        if (drumEvents.hiHat.length > 0 && synthsRef.current.hiHat) {
            const correctedHiHatEvents = ensureStrictlyIncreasingTimes(drumEvents.hiHat.sort((a,b) => a.time - b.time));
            const hiHatPart = new Tone.Part(((time, value) => {
                if (typeof value.pitch === 'number' && synthsRef.current.hiHat) synthsRef.current.hiHat.frequency.setValueAtTime(value.pitch, time);
                if (synthsRef.current.hiHat) synthsRef.current.hiHat.triggerAttackRelease(value.duration, time, value.velocity);
            }) as any, correctedHiHatEvents);
            newParts.push(hiHatPart);
        }
        
        newParts.forEach(part => part.start(0));
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
        originalInputSummary = `${fileTypeDisplay} Concept: ${params.originalInput.fileDetails.name}`;
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
    statusMessage = "Preparing your tune...";
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
          <CardTitle className="text-lg font-semibold text-stardust-blue text-center">Listen to Your Tune</CardTitle>
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

