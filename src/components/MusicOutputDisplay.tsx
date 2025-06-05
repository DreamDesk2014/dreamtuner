
"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Tone from 'tone';
import { Midi as MidiFileParser } from '@tonejs/midi'; // Using alias
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from '@/components/ui/separator';

interface MusicOutputDisplayProps {
  params: MusicParameters;
  onRegenerateIdea: () => void;
  isRegeneratingIdea: boolean;
  standardModeArtUrl: string | null;
}

interface EventTime { time: number; [key: string]: any; }

// Increased epsilon for more robustness
const MIN_TIME_GAP = 0.001;

function ensureStrictlyIncreasingTimes<T extends EventTime>(events: T[], debugLabel?: string): T[] {
  if (!events || events.length === 0) return [];
  
  // Ensure events are sorted by their original time first
  const sortedEvents = [...events].sort((a, b) => {
    const timeA = typeof a.time === 'number' ? a.time : parseFloat(a.time as any);
    const timeB = typeof b.time === 'number' ? b.time : parseFloat(b.time as any);
    if (isNaN(timeA) || isNaN(timeB)) return 0; // Keep order if invalid times
    return timeA - timeB;
  });

  if (debugLabel) console.log(`[${debugLabel}] Before ensureStrictlyIncreasingTimes (after initial sort):`, JSON.parse(JSON.stringify(sortedEvents.map(e => e.time))));
  
  let lastTime = -Infinity;
  const correctedEvents = sortedEvents.map((e) => {
    const originalEventTime = typeof e.time === 'number' ? e.time : parseFloat(e.time as any);
    
    if (isNaN(originalEventTime)) {
        console.warn(`[${debugLabel}] Invalid time in event, skipping adjustment:`, e);
        return e; // Return original if time is invalid
    }

    let time = originalEventTime;
    if (time <= lastTime) {
      time = lastTime + MIN_TIME_GAP;
    }
    lastTime = time;
    return { ...e, time };
  });

  if (debugLabel) console.log(`[${debugLabel}] After ensureStrictlyIncreasingTimes:`, JSON.parse(JSON.stringify(correctedEvents.map(e => e.time))));
  return correctedEvents;
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

  let configs: SynthConfigurations = {
    melody: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.4 }, volume: -3 },
    bass: { oscillator: { type: 'fatsine', count: 2, spread: 10 }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.5 }, volume: -6 },
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
  } else {
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
      configs.melody = { oscillator: { type: 'fmsine', harmonicity: 1.5, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.2 }, volume: -3 };
      configs.bass = { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.3 }, volume: -6 };
      configs.chords = { oscillator: { type: 'fmtriangle', harmonicity: 2, modulationIndex: 3 }, volume: -15, envelope: { attack: 0.02, decay: 0.6, sustain: 0.3, release: 0.5 } };
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
      if (hint.includes('synth bass')) configs.bass = { oscillator: {type: 'fatsquare', count: 3, spread: 15}, envelope: {attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3}, volume: -3};
      else if (hint.includes('acoustic bass') && !genreLower.includes('jazz')) configs.bass = { oscillator: {type: 'sine'}, envelope: {attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.3}, volume: -6};
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
    synthsRef.current = {
      melody: new Tone.PolySynth(Tone.Synth).toDestination(),
      bass: new Tone.PolySynth(Tone.Synth, { detune: -1200 }).toDestination(), // Detune for bass range
      chords: new Tone.PolySynth(Tone.Synth).toDestination(),
      kick: new Tone.MembraneSynth().toDestination(),
      snare: new Tone.NoiseSynth().toDestination(),
      hiHat: new Tone.MetalSynth().toDestination(),
      parts: []
    };
    
    return () => {
      // Stop transport and dispose of all parts and synths on component unmount
      if (Tone.Transport.state === 'started') {
        Tone.Transport.stop();
      }
      Tone.Transport.cancel(0); // Clear all scheduled events
      synthsRef.current.parts.forEach(part => part.dispose());
      Object.values(synthsRef.current).forEach(synthOrParts => {
        // Check if it's a synth and has a dispose method
        if (synthOrParts && typeof (synthOrParts as any).dispose === 'function' && !Array.isArray(synthOrParts)) {
            (synthOrParts as any).dispose();
        }
      });
      synthsRef.current = { parts: [] }; // Reset parts array
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []); // Empty dependency array ensures this runs only on mount and unmount

  useEffect(() => {
    const loadAndScheduleMidi = async () => {
      if (!params || !synthsRef.current.melody || !synthsRef.current.kick || !synthsRef.current.snare || !synthsRef.current.hiHat || !synthsRef.current.bass || !synthsRef.current.chords) { 
        setToneError("Synths not initialized yet.");
        return;
      }

      setIsLoadingTone(true);
      setToneError(null);
      setIsPlaying(false); // Stop playback if it was playing before new params
      setPlaybackProgress(0);
      setCurrentMidiDuration(0);
      
      // Stop transport and cancel previous events before loading new ones
      if (Tone.Transport.state === 'started') Tone.Transport.stop();
      Tone.Transport.cancel(0);
      Tone.Transport.position = 0; // Reset transport position
      synthsRef.current.parts.forEach(part => part.dispose()); // Dispose old parts
      synthsRef.current.parts = []; // Clear parts array

      try {
        // Get and apply synth configurations based on AI params
        const synthConfigs = getSynthConfigurations(
          params.instrumentHints,
          params.selectedGenre,
          params.originalInput.mode === 'kids'
        );

        synthsRef.current.melody?.set(synthConfigs.melody);
        synthsRef.current.bass?.set(synthConfigs.bass);
        synthsRef.current.chords?.set(synthConfigs.chords);
        synthsRef.current.kick?.set(synthConfigs.kick);
        synthsRef.current.snare?.set(synthConfigs.snare);
        synthsRef.current.hiHat?.set(synthConfigs.hiHat);

        const midiDataUri = generateMidiFile(params);
        if (!midiDataUri || !midiDataUri.startsWith('data:audio/midi;base64,')) {
          throw new Error("Failed to generate valid MIDI data.");
        }
        
        const parsedMidi = await MidiFileParser.fromUrl(midiDataUri);
        setCurrentMidiDuration(parsedMidi.duration);
        Tone.Transport.bpm.value = params.tempoBpm;

        const newParts: (Tone.Part)[] = []; // Store new parts to be started later
        
        // For drums, collect all events for each drum type first
        const drumEvents: { kick: EventTime[], snare: EventTime[], hiHat: EventTime[] } = { kick: [], snare: [], hiHat: [] };
        
        parsedMidi.tracks.forEach((track) => {
          if (track.channel === 9) { // Drum track (usually channel 10 in MIDI, 9 in 0-indexed arrays)
            track.notes.forEach(note => {
                const noteTime = parseFloat(note.time as any);
                const noteDuration = parseFloat(note.duration as any);
                const noteVelocity = parseFloat(note.velocity as any);

                if (isNaN(noteTime) || isNaN(noteDuration) || isNaN(noteVelocity)) {
                    console.warn("Skipping drum note with invalid time/duration/velocity:", note);
                    return; 
                }

                let drumType: 'kick' | 'snare' | 'hiHat' | null = null;
                let pitchToPlay: string | number | undefined = undefined; // For MembraneSynth (kick) or MetalSynth (hi-hat freq)
                
                // Standard GM Drum Map (simplified)
                if (note.midi === 35 || note.midi === 36) { drumType = 'kick'; pitchToPlay = "C1"; } // Acoustic Bass Drum, Bass Drum 1
                else if (note.midi === 38 || note.midi === 40) { drumType = 'snare'; } // Acoustic Snare, Electric Snare
                else if (note.midi === 42 || note.midi === 44 || note.midi === 46) { 
                    // Closed Hi-Hat, Pedal Hi-Hat, Open Hi-Hat
                    drumType = 'hiHat'; 
                    pitchToPlay = note.midi === 46 ? 400 : 250; // Higher freq for open hi-hat
                }

                if (drumType) {
                    const event: EventTime = { time: noteTime, duration: noteDuration, velocity: noteVelocity, pitch: pitchToPlay };
                    if (drumType === 'kick') drumEvents.kick.push(event);
                    else if (drumType === 'snare') drumEvents.snare.push(event);
                    else if (drumType === 'hiHat') drumEvents.hiHat.push(event);
                }
            });
          } else { // Pitched instrument tracks
            let synth: Tone.PolySynth | undefined;
            // Rudimentary track-to-synth mapping (can be improved)
            // This depends on how generateMidiFile orders tracks
            const { melody: melodyInstrument, bass: bassInstrument, chordsPad: chordsPadInstrument } = mapInstrumentHintToGM(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids');
            if (track.instrument.number === melodyInstrument && synthsRef.current.melody) synth = synthsRef.current.melody;
            else if (track.instrument.number === bassInstrument && synthsRef.current.bass) synth = synthsRef.current.bass;
            else if (track.instrument.number === chordsPadInstrument && synthsRef.current.chords) synth = synthsRef.current.chords;
            else if (synthsRef.current.melody) synth = synthsRef.current.melody; // Fallback to melody synth if no specific match

            if (synth) {
              const trackEvents: EventTime[] = track.notes.map(n => {
                const noteTime = parseFloat(n.time as any);
                const noteDuration = parseFloat(n.duration as any);
                const noteVelocity = parseFloat(n.velocity as any);
                if (typeof n.name === 'string' && !isNaN(noteTime) && !isNaN(noteDuration) && !isNaN(noteVelocity)) {
                  return { time: noteTime, name: n.name, duration: noteDuration, velocity: noteVelocity };
                }
                console.warn("Skipping pitched note with invalid properties:", n);
                return null;
              }).filter(e => e !== null) as EventTime[];

              if (trackEvents.length > 0) {
                const correctedTrackEvents = ensureStrictlyIncreasingTimes(trackEvents, `Track-${track.name || 'pitched'}`);
                const part = new Tone.Part(((time, value) => {
                  if (value.name && synth) { // Ensure value.name and synth are valid
                    synth.triggerAttackRelease(value.name, value.duration, time, value.velocity);
                  }
                }) as any, correctedTrackEvents);
                newParts.push(part);
              }
            }
          }
        });
        
        // Create and add drum parts
        if (drumEvents.kick.length > 0 && synthsRef.current.kick) {
            const correctedKickEvents = ensureStrictlyIncreasingTimes(drumEvents.kick, "Kick");
            // console.log("Corrected Kick Events:", JSON.parse(JSON.stringify(correctedKickEvents.map(e => e.time))));
            const kickPart = new Tone.Part(((time, value) => {
                if (value.pitch && synthsRef.current.kick) synthsRef.current.kick.triggerAttackRelease(value.pitch as string, value.duration, time, value.velocity);
            }) as any, correctedKickEvents);
            newParts.push(kickPart);
        }
        if (drumEvents.snare.length > 0 && synthsRef.current.snare) {
            const correctedSnareEvents = ensureStrictlyIncreasingTimes(drumEvents.snare, "Snare");
            // console.log("Corrected Snare Events:", JSON.parse(JSON.stringify(correctedSnareEvents.map(e => e.time))));
            const snarePart = new Tone.Part(((time, value) => {
                 if (synthsRef.current.snare) synthsRef.current.snare.triggerAttackRelease(value.duration, time, value.velocity);
            }) as any, correctedSnareEvents);
            newParts.push(snarePart);
        }
        if (drumEvents.hiHat.length > 0 && synthsRef.current.hiHat) {
            const correctedHiHatEvents = ensureStrictlyIncreasingTimes(drumEvents.hiHat, "HiHat");
            // console.log("Corrected HiHat Events:", JSON.parse(JSON.stringify(correctedHiHatEvents.map(e => e.time))));
            const hiHatPart = new Tone.Part(((time, value) => {
                // MetalSynth might not use pitch in triggerAttackRelease, depends on config.
                // It's often frequency based. Assuming value.pitch holds frequency for hihat if needed.
                if (value.pitch && typeof value.pitch === 'number' && synthsRef.current.hiHat) synthsRef.current.hiHat.frequency.setValueAtTime(value.pitch, time);
                if (synthsRef.current.hiHat) synthsRef.current.hiHat.triggerAttackRelease(value.duration, time, value.velocity);
            }) as any, correctedHiHatEvents);
            newParts.push(hiHatPart);
        }
        
        // Start all new parts at the beginning of the transport
        newParts.forEach(part => part.start(0));
        synthsRef.current.parts = newParts; // Store new parts

      } catch (error) {
        console.error("Tone.js MIDI loading/scheduling error:", error);
        setToneError(error instanceof Error ? error.message : "Error loading or scheduling MIDI with Tone.js");
      } finally {
        setIsLoadingTone(false);
      }
    };

    loadAndScheduleMidi();

  }, [params]); // Re-run when params change

  const updateProgress = useCallback(() => {
    if (Tone.Transport.state === "started" && currentMidiDuration > 0) {
      const progress = (Tone.Transport.seconds / currentMidiDuration) * 100;
      setPlaybackProgress(Math.min(progress, 100)); // Cap progress at 100
    } else if (Tone.Transport.state !== "started") {
       if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
       progressIntervalRef.current = null;
       // Ensure progress hits 100% if playback finished and wasn't exactly on an interval
       if(playbackProgress >= 99.9 && !isPlaying) { 
         setPlaybackProgress(100);
       }
    }
  }, [currentMidiDuration, isPlaying, playbackProgress]); // playbackProgress added to deps to avoid stale closure issues

  useEffect(() => {
    const endOfTransportHandler = () => {
      setIsPlaying(false);
      setPlaybackProgress(100); // Explicitly set to 100% on stop
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
  }, []); // Empty dependency, sets up global transport listener once


  const handlePlayPause = async () => {
    setToneError(null);
    try {
      if (Tone.context.state !== 'running') {
        await Tone.start(); // Ensure AudioContext is running
      }

      if (Tone.Transport.state === 'started') {
        Tone.Transport.pause();
        setIsPlaying(false);
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      } else {
        // If playback finished and user hits play again, restart from beginning
        if (playbackProgress >= 100 && currentMidiDuration > 0) { // Check currentMidiDuration to ensure it's loaded
             Tone.Transport.position = 0; // Reset transport
             setPlaybackProgress(0); // Reset progress bar
        }
        Tone.Transport.start();
        setIsPlaying(true);
        // Clear any existing interval before starting a new one
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = setInterval(updateProgress, 100);
      }
    } catch (error) {
      console.error("Tone.js play/pause error:", error);
      setToneError(error instanceof Error ? error.message : "Playback error");
      setIsPlaying(false); // Ensure isPlaying is false on error
    }
  };

  const handleStop = async () => {
    try {
      // No need to await Tone.start() here, stop should work regardless of context state
      // if transport was started.
      if (Tone.context.state !== 'running' && Tone.Transport.state !== 'stopped') { // Only start if trying to stop a non-stopped transport on a non-running context
        await Tone.start(); 
      }
      Tone.Transport.stop(); // This will also trigger the 'stop' event handled by endOfTransportHandler
      // setIsPlaying(false); // Handled by endOfTransportHandler
      // setPlaybackProgress(0); // Handled by endOfTransportHandler
      // if (progressIntervalRef.current) { // Handled by endOfTransportHandler
      //   clearInterval(progressIntervalRef.current);
      //   progressIntervalRef.current = null;
      // }
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
      // Create a more descriptive filename
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
      case 'video': 
        const fileTypeDisplay = params.originalInput.fileDetails.type.startsWith('video/') ? 'Video' :
                              params.originalInput.fileDetails.type.startsWith('audio/') ? 'Audio' : 'Media';
        originalInputSummary = `${fileTypeDisplay} Concept: ${params.originalInput.fileDetails.name}`;
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

  const handleShare = async () => {
    setShareError(null);
    if (!navigator.share) {
      toast({ variant: "destructive", title: "Share Not Supported", description: "Web Share API is not available." });
      setShareError("Web Share API not supported."); return;
    }
    setIsSharing(true);
    try {
      const filesToShareAttempt: (File | null)[] = [];
      let shareText = `Check out this musical idea from DreamTuner: "${params.generatedIdea}"`;
      // Generate MIDI for sharing
      const midiDataUri = generateMidiFile(params);
      if (midiDataUri && midiDataUri.startsWith('data:audio/midi;base64,')) {
        let baseFileName = 'dreamtuner_music';
        if(params.generatedIdea) baseFileName = params.generatedIdea.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_').slice(0,30);
        const midiFile = dataURLtoFile(midiDataUri, `${baseFileName}.mid`);
        if (midiFile) filesToShareAttempt.push(midiFile);
      }
      // Add art if it's standard mode and art URL exists
      if (params.originalInput.mode === 'standard' && standardModeArtUrl) {
        const artFile = dataURLtoFile(standardModeArtUrl, "dreamtuner_standard_art.png");
        if (artFile) filesToShareAttempt.push(artFile);
        shareText += "\nIt also inspired this AI artwork!";
      }
      const validFilesToShare = filesToShareAttempt.filter(file => file !== null) as File[];
      if (validFilesToShare.length === 0) throw new Error("No shareable content prepared.");
      await navigator.share({ title: `DreamTuner: "${params.generatedIdea}"`, text: shareText, files: validFilesToShare });
      toast({ title: "Shared Successfully!" });
    } catch (error: any) {
      if (error.name === 'AbortError') toast({ title: "Share Cancelled" });
      else toast({ variant: "destructive", title: "Share Failed", description: error.message || "Could not share." });
      setShareError(error.message || "Failed to share.");
    } finally { setIsSharing(false); }
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
        const lines = originalTextContent.split('\n');
        const renderedElements: React.ReactNode[] = [];

        const isClearlyNoteLine = (line: string): boolean => {
            // Basic check for common note patterns (e.g., C4, G#3, Ab5)
            // or lines that are very short and look like musical notation.
            // This is a heuristic and can be improved.
            return /^[A-G][#bSsxBF]?[0-9]$/.test(line.trim()) || 
                   (line.trim().length < 10 && /[A-G]/.test(line));
        };
        
        for (let i = 0; i < lines.length; i++) {
            let currentLine = lines[i];
            // If a line might be musical notation, and the next line also looks like it,
            // try to keep them on the same visual line if they are short.
            if (isClearlyNoteLine(currentLine) && 
                i + 1 < lines.length && 
                isClearlyNoteLine(lines[i+1]) &&
                currentLine.length < 20 && lines[i+1].length < 20
            ) {
                renderedElements.push(<p key={i} className="text-muted-foreground text-sm whitespace-pre-wrap">{currentLine.trim()}  |  {lines[i+1].trim()}</p>);
                i++; // Skip next line as it's combined
            } else {
                renderedElements.push(<p key={i} className="text-muted-foreground text-sm whitespace-pre-wrap">{currentLine}</p>);
            }
        }

        contentDisplay = (
          <>
            <ScrollArea className="h-auto max-h-80 mb-3 pr-3">
                <div className="space-y-1">{renderedElements}</div>
            </ScrollArea>
            <Separator className="my-3 bg-slate-600" />
            <div className="space-y-1 text-sm mt-3">
              <p><strong className="text-stardust-blue">Generated Idea:</strong> <span className="text-galaxy-white italic">"{params.generatedIdea}"</span></p>
              <p><strong className="text-stardust-blue">Key:</strong> {params.keySignature} {params.mode}</p>
              <p><strong className="text-stardust-blue">Tempo:</strong> {params.tempoBpm} BPM</p>
              {params.selectedGenre && (<p><strong className="text-stardust-blue">Selected Genre:</strong> {params.selectedGenre}</p>)}
            </div>
          </>
        );
        // For text, use an accordion to make it collapsible
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
        contentDisplay = (
          <>
            {input.fileDetails.url && input.fileDetails.size > 0 ? (
                 <>
                    <p className="text-muted-foreground text-sm italic">
                        {input.mode === 'kids' ? 'Drawing:' : 'Image:'} {input.fileDetails.name}
                    </p>
                    <Image src={input.fileDetails.url} alt={input.fileDetails.name} data-ai-hint={input.mode === 'kids' ? "kids drawing" : "abstract texture"} width={160} height={160} className="mt-2 rounded max-h-40 object-contain border border-slate-700"/>
                 </>
            ) : input.mode === 'kids' && input.voiceDescription ? (
                <p className="text-muted-foreground text-sm italic">Input was voice-only.</p>
            ) : (
                <p className="text-muted-foreground text-sm italic">Filename: {input.fileDetails.name}</p>
            )}
            {input.mode === 'kids' && input.voiceDescription && (
              <p className="text-muted-foreground text-xs italic mt-2">Voice Hint: "{input.voiceDescription}"</p>
            )}
            {input.mode === 'standard' && input.additionalContext && (
              <p className="text-muted-foreground text-xs italic mt-2">Additional Context: "{input.additionalContext}"</p>
            )}
          </>
        );
        break;
      case 'video': // Also handles audio concepts / recorded audio
        icon = <VideoCameraIcon className="w-6 h-6" />;
        title = "Original Input Concept";
        const fileTypeDisplay = input.fileDetails.type.startsWith('video/') ? 'Video' :
                              input.fileDetails.type.startsWith('audio/') ? 'Audio' : 'Media';
        contentDisplay = (
          <>
            <p className="text-muted-foreground text-sm italic">
              {fileTypeDisplay} Concept: {input.fileDetails.name} (Analyzed conceptually{input.fileDetails.url && input.fileDetails.type.startsWith('audio/') ? ' from live recording' : ''})
            </p>
            {input.additionalContext && (
              <p className="text-muted-foreground text-xs italic mt-2">Additional Context: "{input.additionalContext}"</p>
            )}
            {/* Preview for recorded audio */}
            {input.fileDetails.url && input.fileDetails.type.startsWith('audio/') && (
                <audio controls src={input.fileDetails.url} className="w-full mt-2" />
            )}
          </>
        );
        break;
      default:
        return null;
    }

    // Add genre to footer if it exists and it's not a text input in standard mode (already shown in accordion)
    if (params.selectedGenre && (input.type !== 'text' || input.mode === 'kids')) {
      footerContent = (
          <div className="space-y-1 text-sm">
             <p><strong className="text-stardust-blue">Selected Genre:</strong> {params.selectedGenre}</p>
          </div>
      );
    }


    return (
      <Card className="mt-8 bg-nebula-gray/80 border-slate-700">
        <CardHeader>
          <div className="flex items-center text-stardust-blue mb-2">
            {icon}
            <CardTitle className="ml-2 text-lg font-semibold">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {contentDisplay}
        </CardContent>
        {footerContent && (
            <CardFooter className="border-t border-slate-700 pt-4 flex-col items-start">
                {footerContent}
            </CardFooter>
        )}
      </Card>
    );
  }

  const getRhythmicDensityDescription = (density: number) => {
    if (density < 0.2) return "Very Sparse";
    if (density < 0.4) return "Sparse";
    if (density < 0.6) return "Moderate";
    if (density < 0.8) return "Dense";
    return "Very Dense";
  };

  const getHarmonicComplexityDescription = (complexity: number) => {
    if (complexity < 0.2) return "Very Simple";
    if (complexity < 0.4) return "Simple";
    if (complexity < 0.6) return "Moderate";
    if (complexity < 0.8) return "Complex";
    return "Very Complex";
  };
  
  const playButtonDisabled = isLoadingTone || !currentMidiDuration; // Play button disabled if loading Tone or no MIDI duration
  const showLoadingSpinnerInPlayButton = isLoadingTone; // Show spinner only when actively loading Tone and its resources

  // Status message logic
  let statusMessage = "";
  if (toneError) statusMessage = `Player Error: ${toneError}`;
  else if (isLoadingTone) statusMessage = "Preparing your tune...";
  else if (!isPlaying && currentMidiDuration > 0 && playbackProgress < 1) statusMessage = "Ready to play.";
  else if (!isPlaying && currentMidiDuration > 0 && playbackProgress >= 100) statusMessage = "Playback finished. Play again?";
  // No message if playing, or if idle and no MIDI loaded yet.

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Generated Idea Display */}
      <Card className="p-6 bg-primary shadow-xl text-center border-none">
        <CardTitle className="text-3xl font-bold text-primary-foreground mb-2">Musical Essence Unveiled</CardTitle>
        <div className="flex items-center justify-center space-x-2">
            <CardDescription className="text-lg text-primary-foreground/80 italic">
            "{params.generatedIdea}"
            </CardDescription>
            <Button
                variant="ghost"
                size="icon"
                onClick={onRegenerateIdea}
                disabled={isRegeneratingIdea}
                className="text-primary-foreground/70 hover:text-primary-foreground disabled:opacity-50"
                title="Regenerate Idea"
            >
            {isRegeneratingIdea ? (
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle>
                    <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" fill="currentColor"></path>
                </svg>
            ) : (
                <RefreshIcon className="w-5 h-5" />
            )}
            </Button>
        </div>
      </Card>

      {/* Musical Parameters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ParameterCardComponent title="Key Signature" value={`${params.keySignature} ${params.mode}`} icon={<MusicalNoteIcon />} />
        <ParameterCardComponent title="Tempo" value={params.tempoBpm} unit="BPM" icon={<ClockIcon />} />
        <ParameterCardComponent title="Mood Tags" value={params.moodTags || []} icon={params.targetValence > 0 ? <MoodHappyIcon /> : <MoodSadIcon />} />
        <ParameterCardComponent title="Instrument Hints" value={params.instrumentHints || []} icon={<CollectionIcon />} />
        <ParameterCardComponent title="Valence &amp; Arousal" value={`V: ${params.targetValence.toFixed(2)}, A: ${params.targetArousal.toFixed(2)}`} icon={<LightningBoltIcon />} subText={getValenceArousalDescription(params.targetValence, params.targetArousal)} />
        <ParameterCardComponent title="Rhythmic Density" value={params.rhythmicDensity.toFixed(2)} icon={<ScaleIcon />} subText={getRhythmicDensityDescription(params.rhythmicDensity)} />
        <ParameterCardComponent title="Harmonic Complexity" value={params.harmonicComplexity.toFixed(2)} icon={<CogIcon />} subText={getHarmonicComplexityDescription(params.harmonicComplexity)} />
        {params.selectedGenre && params.originalInput.mode === 'standard' && ( // Only show genre card here for standard mode, as it's also in the original input card otherwise for kids
            <ParameterCardComponent title="Selected Genre" value={params.selectedGenre} icon={<LibraryIcon />} />
        )}
      </div>

      {/* MIDI Player Card */}
      <Card className="mt-8 p-4 bg-nebula-gray/80 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-stardust-blue text-center">Listen to Your Tune</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center space-x-3">
            <Button onClick={handlePlayPause} disabled={playButtonDisabled} size="icon" className="p-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-slate-600">
               {showLoadingSpinnerInPlayButton ? (
                <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle>
                  <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path>
                </svg>
              ) : isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
            </Button>
            <Button onClick={handleStop} disabled={isLoadingTone || (!isPlaying && playbackProgress === 0)} size="icon" className="p-3 rounded-full bg-slate-600 text-primary-foreground hover:bg-slate-500 disabled:bg-slate-700">
              <StopIcon className="w-6 h-6" />
            </Button>
          </div>
          <Progress value={playbackProgress} className="mt-4 h-2.5 [&>div]:bg-stardust-blue" aria-label="Playback progress"/>
          {statusMessage && (
            <p className={`text-sm text-center mt-2 ${toneError ? 'text-red-400' : 'text-stardust-blue animate-pulse-subtle'}`}>
              {statusMessage}
            </p>
          )}
        </CardContent>
      </Card>
      
      {/* Action Buttons: Download, Copy, Share */}
      <div className="mt-8 text-center space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
        <Button onClick={handleDownloadMidi} disabled={isGeneratingMidiForDownload} className="w-full sm:w-auto bg-stardust-blue hover:bg-sky-500 text-primary-foreground">
          {isGeneratingMidiForDownload ? (
             <><svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path></svg>Generating...</>
          ) : (
            <><DownloadIcon className="w-5 h-5 mr-2" />Download MIDI</>
          )}
        </Button>
        <Button onClick={handleCopyDetails} disabled={isCopied} variant="outline" className="w-full sm:w-auto border-slate-500 text-slate-200 hover:bg-slate-700 hover:text-slate-100">
          {isCopied ? (
            <><ClipboardCopyIcon className="w-5 h-5 mr-2 text-green-400" />Copied!</>
          ) : (
            <><ClipboardCopyIcon className="w-5 h-5 mr-2" />Copy Details</>
          )}
        </Button>
        <Button 
            onClick={handleShare} 
            disabled={isSharing || (params.originalInput.mode === 'standard' && !standardModeArtUrl && !params) || (params.originalInput.mode === 'kids' && !params) } // Disable if standard mode has no art and no params, or kids mode no params
            variant="outline" 
            className="w-full sm:w-auto border-green-500 text-green-400 hover:bg-green-500/10 hover:text-green-300"
        >
             {isSharing ? (
                <><svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path></svg>Sharing...</>
             ) : (
                <><Share2 className="w-5 h-5 mr-2" />Share Creation</>
             )}
        </Button>
      </div>
      <div className="text-center mt-2 h-4"> {/* Placeholder for error messages to prevent layout shift */}
        {midiError && <p className="text-red-400 text-sm">{`MIDI Error: ${midiError}`}</p>}
        {copyError && <p className="text-red-400 text-sm">{copyError}</p>}
        {shareError && <p className="text-red-400 text-sm">{`Share Error: ${shareError}`}</p>}
      </div>

      {/* Original Input Info Card */}
      {params.originalInput && renderOriginalInputInfo(params.originalInput)}
    </div>
  );
};

// Minimal ParameterCardComponent to avoid breaking the structure
const ParameterCardComponent: React.FC<{title: string; value: any; icon: React.ReactNode; unit?: string; subText?: string; className?:string}> = ({ title, value, icon, unit, subText, className }) => (
  <Card className={`bg-nebula-gray/80 border-slate-700 ${className}`}>
    <CardHeader className="pb-2">
        <div className="flex items-center text-stardust-blue mb-1">
            {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5" })}
            <CardTitle className="ml-2 text-md font-semibold">{title}</CardTitle>
        </div>
    </CardHeader>
    <CardContent>
        <p className="text-galaxy-white text-lg font-light truncate">
            {Array.isArray(value) ? value.join(', ') : String(value)}
            {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
        </p>
        {subText && <p className="text-xs text-muted-foreground mt-1">{subText}</p>}
    </CardContent>
  </Card>
);

// Helper to map instrument hints to GM numbers for midi-writer-js
// This is a simplified mapping
const mapInstrumentHintToGM = (hints: string[], genre?: string, isKidsMode: boolean = false): { melody: number; bass: number; chordsPad: number; arpeggioSynth: number } => {
    // Default to some synth sounds if no specific hints
    let mapping = { melody: 80, bass: 38, chordsPad: 89, arpeggioSynth: 81 }; // Synth Lead, Synth Bass, Synth Pad, Synth FX
    const genreLower = genre?.toLowerCase();

    if (isKidsMode) {
        // Kids mode: simple, recognizable sounds
        mapping = { melody: 13, bass: 24, chordsPad: 8, arpeggioSynth: 74 }; // Xylophone, Ukulele, Celesta, Recorder
        (hints || []).forEach(hint => {
            const hLower = hint.toLowerCase();
            if (/xylophone/i.test(hLower)) mapping.melody = 13;
            else if (/toy piano|celesta|music box/i.test(hLower)) { mapping.melody = 8; mapping.arpeggioSynth = 8; }
            else if (/ukulele/i.test(hLower)) { mapping.melody = 24; mapping.bass = 24;}
            else if (/recorder/i.test(hLower)) mapping.melody = 74;
            else if (/simple synth|synth lead/i.test(hLower)) mapping.melody = 80;
            else if (/synth pad/i.test(hLower)) mapping.chordsPad = 89;
        });
        return mapping;
    }


    // Genre-based defaults (can be refined)
    if (genreLower) {
        if (genreLower.includes("rock")) { mapping = { melody: 27, bass: 34, chordsPad: 27, arpeggioSynth: 27 }; } // Electric Guitar (clean), Picked Bass
        else if (genreLower.includes("pop")) { mapping = { melody: 80, bass: 38, chordsPad: 90, arpeggioSynth: 81 }; } // Synth Lead, Synth Bass, Synth Pad
        else if (genreLower.includes("jazz")) { mapping = { melody: 1, bass: 32, chordsPad: 1, arpeggioSynth: 52 }; } // Piano, Acoustic Bass, Vibraphone
        else if (genreLower.includes("electronic")) { mapping = { melody: 80, bass: 38, chordsPad: 90, arpeggioSynth: 81 }; }
        else if (genreLower.includes("ambient")) { mapping = { melody: 90, bass: 90, chordsPad: 89, arpeggioSynth: 99 }; } // Pad (warm), Pad (sweep), FX (crystal)
        else if (genreLower.includes("classical") || genreLower.includes("cinematic")) { mapping = { melody: 40, bass: 42, chordsPad: 48, arpeggioSynth: 49 }; } // Violin, Cello, Strings Ens
        else if (genreLower.includes("folk")) { mapping = { melody: 24, bass: 32, chordsPad: 24, arpeggioSynth: 73 }; } // Acoustic Guitar, Acoustic Bass, Flute
    }

    // Override with specific hints if provided
    (hints || []).forEach(hint => {
        const hLower = hint.toLowerCase();
        if (/piano/i.test(hLower)) { mapping.melody = 0; if (genreLower?.includes("jazz") || !genreLower) mapping.chordsPad = 0; }
        else if (/flute/i.test(hLower)) mapping.melody = 73;
        else if (/violin|strings/i.test(hLower) && !/ensemble|pad/i.test(hLower)) mapping.melody = 40;
        else if (/guitar/i.test(hLower) && !/bass|acoustic/i.test(hLower)) mapping.melody = 27; // Default to electric clean
        else if (/acoustic guitar/i.test(hLower)) mapping.melody = 24;
        else if (/trumpet|brass/i.test(hLower) && !/section/i.test(hLower)) mapping.melody = 56;
        else if (/sax|saxophone/i.test(hLower)) mapping.melody = 65; // Alto Sax
        else if (/bell|celesta|glockenspiel|music box/i.test(hLower)) { mapping.melody = 9; mapping.arpeggioSynth = 14; } // Celesta, Tubular Bells
        else if (/bright synth|synth lead/i.test(hLower)) mapping.melody = 80; // Square Lead
        else if (/warm lead|soft lead/i.test(hLower)) mapping.melody = 81; // Saw Lead
        else if (/organ/i.test(hLower)) mapping.melody = 19; // Church Organ or Rock Organ based on context

        if (/synth bass|bass synth/i.test(hLower)) mapping.bass = 38;
        else if (/acoustic bass|double bass|upright bass/i.test(hLower)) mapping.bass = 32;
        else if (/picked bass/i.test(hLower)) mapping.bass = 34;
        else if (/cello/i.test(hLower) && (genreLower?.includes("classical") || genreLower?.includes("cinematic"))) mapping.bass = 42;


        if (/string ensemble|strings pad/i.test(hLower)) mapping.chordsPad = 48;
        else if (/synth pad|ambient pad|warm pad/i.test(hLower)) mapping.chordsPad = 89; // Pad 2 (warm)
        else if (/dark pad|sweep pad/i.test(hLower)) mapping.chordsPad = 96; // Pad 8 (sweep)
        else if (/organ/i.test(hLower) && (genreLower?.includes("blues") || genreLower?.includes("funk") || genreLower?.includes("reggae"))) mapping.chordsPad = 19; // Rock Organ
        else if (/electric piano/i.test(hLower) && (genreLower?.includes("jazz") || genreLower?.includes("soul") || genreLower?.includes("funk"))) mapping.chordsPad = 4; // Electric Piano 1
        else if (/choir|voice|aahs/i.test(hLower)) mapping.chordsPad = 52; // Choir Aahs

        if (/arp|arpeggio|pluck|sequence/i.test(hLower)) mapping.arpeggioSynth = 99; // FX 4 (atmosphere) - can be more specific
        else if (/fx|sound effect/i.test(hLower)) mapping.arpeggioSynth = 102; // FX 7 (echoes)
    });
    return mapping;
};
