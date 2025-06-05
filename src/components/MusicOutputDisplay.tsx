
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
  LibraryIcon, PlayIcon, PauseIcon, StopIcon, ExclamationCircleIcon
} from './icons/HeroIcons';
import { Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


interface MusicOutputDisplayProps {
  params: MusicParameters;
  onRegenerateIdea: () => void;
  isRegeneratingIdea: boolean;
  standardModeArtUrl: string | null;
}

interface EventTime { time: number; [key: string]: any; }

const MIN_TIME_GAP = 0.001; // Epsilon for time adjustments

function ensureStrictlyIncreasingTimes(events: EventTime[], label = "Track"): EventTime[] {
  if (!events || events.length === 0) {
    return [];
  }
  // First, sort by time to handle cases where events might not be pre-sorted.
  const sortedEvents = [...events].sort((a, b) => {
    const timeA = typeof a.time === 'number' ? a.time : parseFloat(a.time as any);
    const timeB = typeof b.time === 'number' ? b.time : parseFloat(b.time as any);
    if (isNaN(timeA) && isNaN(timeB)) return 0;
    if (isNaN(timeA)) return 1; // Treat NaN as greater
    if (isNaN(timeB)) return -1; // Treat NaN as greater
    return timeA - timeB;
  });

  const adjustedEvents: EventTime[] = [];
  let lastTime = -Infinity;

  for (let i = 0; i < sortedEvents.length; i++) {
    const event = sortedEvents[i];
    let newTime = typeof event.time === 'number' ? event.time : parseFloat(event.time as any);

    if (isNaN(newTime)) {
      console.warn(`[${label}] Event with invalid time encountered at original index for event:`, event, `Setting time to ${lastTime + MIN_TIME_GAP}`);
      newTime = lastTime + MIN_TIME_GAP;
    } else if (newTime <= lastTime) {
      // console.warn(`[${label}] Adjusted overlapping note time from ${event.time} -> ${lastTime + MIN_TIME_GAP} (index: ${i})`);
      newTime = lastTime + MIN_TIME_GAP;
    }
    
    adjustedEvents.push({ ...event, time: newTime });
    lastTime = newTime;
  }
  return adjustedEvents;
}


interface SynthConfigurations {
  melody: any; 
  bass: any; 
  chords: any; 
  kick: any; 
  snare: any; 
  hiHat: any; 
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
      if (hint.includes('piano') && !isKidsMode) { // Piano hint, not in kids mode
        // Melody is handled by sampler, chords might still be synth or sampler if piano is also for chords.
        // For simplicity, keep chords synth here unless explicitly handled by sampler logic later
        if (!genreLower.includes('jazz')) configs.chords = { oscillator: { type: 'fmsine', harmonicity: 2.5, modulationIndex: 8 }, volume: -12, envelope: { attack: 0.01, decay: 0.8, sustain: 0.1, release: 0.5 } };
      } else if (hint.includes('strings') || hint.includes('pad') && !hint.includes('synth pad')) {
        configs.melody = { oscillator: { type: 'fatsawtooth', count: 5, spread: 30 }, envelope: { attack: 0.3, decay: 0.1, sustain: 0.9, release: 1.2 }, volume: -6 };
        configs.chords = { oscillator: { type: 'fatsawtooth', count: 7, spread: 50 }, volume: -10, envelope: { attack: 0.5, decay: 0.2, sustain: 0.9, release: 1.5 } };
      } else if (hint.includes('synth lead') && !isKidsMode) {
        configs.melody = { oscillator: { type: 'pwm', modulationFrequency: 0.3 }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.6 }, volume: 0 };
      } else if (hint.includes('acoustic guitar') && !isKidsMode) { // Acoustic Guitar
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
  const [pianoSamplesLoaded, setPianoSamplesLoaded] = useState(false);

  const synthsRef = useRef<{
    melody?: Tone.PolySynth | Tone.Sampler,
    bass?: Tone.PolySynth,
    chords?: Tone.PolySynth,
    kick?: Tone.MembraneSynth,
    snare?: Tone.NoiseSynth,
    hiHat?: Tone.MetalSynth,
    parts: (Tone.Part | Tone.Sequence)[]
  }>({parts: []});
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const generatePianoSampleUrls = () => {
    const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const salamanderFileNotes = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
    const urls: Record<string, string> = {};
    for (let octave = 1; octave <= 7; octave++) {
      notes.forEach((note, index) => {
        urls[`${note}${octave}`] = `${salamanderFileNotes[index]}${octave}.mp3`;
      });
    }
    return urls;
  };


  useEffect(() => {
    // Initialize non-sampler synths
    synthsRef.current.bass = new Tone.PolySynth(Tone.Synth, { detune: -1200 }).toDestination();
    synthsRef.current.chords = new Tone.PolySynth(Tone.Synth).toDestination();
    synthsRef.current.kick = new Tone.MembraneSynth().toDestination();
    synthsRef.current.snare = new Tone.NoiseSynth().toDestination();
    synthsRef.current.hiHat = new Tone.MetalSynth().toDestination();

    return () => {
      if (Tone.Transport.state === 'started') {
        Tone.Transport.stop();
      }
      Tone.Transport.cancel(0);
      synthsRef.current.parts.forEach(part => part.dispose());
      Object.values(synthsRef.current).forEach(synthOrParts => {
        if (synthOrParts && typeof (synthOrParts as any).dispose === 'function' && !Array.isArray(synthOrParts)) {
            (synthOrParts as any).dispose();
        }
      });
      synthsRef.current = { parts: [] }; // Reset parts array
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);


  const loadAndScheduleMidi = useCallback(async () => {
    if (!params || !synthsRef.current.kick || !synthsRef.current.snare || !synthsRef.current.hiHat || !synthsRef.current.bass || !synthsRef.current.chords ) {
      setToneError("Core synths not initialized yet.");
      return;
    }

    setIsLoadingTone(true);
    setToneError(null);
    setIsPlaying(false);
    setPlaybackProgress(0);
    setCurrentMidiDuration(0);
    setPianoSamplesLoaded(false);

    if (Tone.Transport.state === 'started') Tone.Transport.stop();
    Tone.Transport.cancel(0);
    Tone.Transport.position = 0;
    synthsRef.current.parts.forEach(part => part.dispose());
    synthsRef.current.parts = [];

    try {
      const synthConfigs = getSynthConfigurations(
        params.instrumentHints,
        params.selectedGenre,
        params.originalInput.mode === 'kids'
      );

      // Dispose previous melody synth/sampler
      synthsRef.current.melody?.dispose();

      const usePianoSampler = params.instrumentHints.some(h => h.toLowerCase().includes('piano')) && params.originalInput.mode !== 'kids';

      if (usePianoSampler) {
        console.log("Using Piano Sampler for melody");
        const pianoSampler = new Tone.Sampler({
            urls: generatePianoSampleUrls(),
            baseUrl: "https://tonejs.github.io/audio/salamander/",
            release: 1,
            onload: () => {
                console.log('Piano samples loaded successfully for melody track.');
                setPianoSamplesLoaded(true);
                if (Tone.Transport.state === 'paused' && isPlaying) { // Auto-play if was meant to play
                  Tone.Transport.start();
                }
            }
        }).toDestination();
        pianoSampler.volume.value = -3;
        synthsRef.current.melody = pianoSampler;
      } else {
          console.log("Using PolySynth for melody");
          synthsRef.current.melody = new Tone.PolySynth(Tone.Synth).toDestination();
          synthsRef.current.melody.set(synthConfigs.melody);
          setPianoSamplesLoaded(true); // Consider non-sampler as "loaded" for playback readiness
      }
      
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

      const newParts: (Tone.Part)[] = [];
      const drumEvents: { kick: EventTime[], snare: EventTime[], hiHat: EventTime[] } = { kick: [], snare: [], hiHat: [] };
      
      parsedMidi.tracks.forEach((track) => {
        if (track.channel === 9) { 
          track.notes.forEach(note => {
            const noteTimeInput = note.time;
            const noteDurationInput = note.duration;
            const noteVelocityInput = note.velocity;

            const noteTime = parseFloat(noteTimeInput as any);
            let noteDuration = parseFloat(noteDurationInput as any);
            const noteVelocity = parseFloat(noteVelocityInput as any);

            if (isNaN(noteTime) || isNaN(noteDuration) || isNaN(noteVelocity)) {
              console.warn(`[Drums] Skipping note with invalid time/duration/velocity:`, note);
              return;
            }
            let effectiveDuration = Math.max(noteDuration > 0 ? noteDuration : 0.05, 0.05);

            let drumType: 'kick' | 'snare' | 'hiHat' | null = null;
            let pitchToPlay: string | number | undefined = undefined;

            if (note.midi === 35 || note.midi === 36) { drumType = 'kick'; pitchToPlay = "C1"; } 
            else if (note.midi === 38 || note.midi === 40) { drumType = 'snare'; } 
            else if (note.midi === 42 || note.midi === 44 || note.midi === 46) { 
              drumType = 'hiHat';
              pitchToPlay = note.midi === 46 ? 400 : 250; 
            }

            if (drumType) {
              const event: EventTime = { time: noteTime, duration: effectiveDuration, velocity: noteVelocity, pitch: pitchToPlay };
              if (drumType === 'kick') drumEvents.kick.push(event);
              else if (drumType === 'snare') drumEvents.snare.push(event);
              else if (drumType === 'hiHat') drumEvents.hiHat.push(event);
            }
          });
        } else { 
          let activeSynth: Tone.PolySynth | Tone.Sampler | undefined;
          const { melody: melodyInstrument, bass: bassInstrument, chordsPad: chordsPadInstrument } = mapInstrumentHintToGM(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids');

          if (track.instrument.number === melodyInstrument && synthsRef.current.melody) activeSynth = synthsRef.current.melody;
          else if (track.instrument.number === bassInstrument && synthsRef.current.bass) activeSynth = synthsRef.current.bass;
          else if (track.instrument.number === chordsPadInstrument && synthsRef.current.chords) activeSynth = synthsRef.current.chords;
          else if (synthsRef.current.melody) activeSynth = synthsRef.current.melody; 

          if (activeSynth) {
            const trackEvents: EventTime[] = track.notes.map(n => {
              const noteTimeInput = n.time;
              const noteDurationInput = n.duration;
              const noteVelocityInput = n.velocity;
              const noteNameInput = n.name;

              const noteTime = parseFloat(noteTimeInput as any);
              let noteDuration = parseFloat(noteDurationInput as any);
              const noteVelocity = parseFloat(noteVelocityInput as any);

              if (typeof noteNameInput === 'string' && !isNaN(noteTime) && !isNaN(noteDuration) && !isNaN(noteVelocity)) {
                let effectiveDuration = Math.max(noteDuration > 0 ? noteDuration : 0.05, 0.05);
                return { time: noteTime, name: noteNameInput, duration: effectiveDuration, velocity: noteVelocity };
              }
              console.warn(`[${track.name || 'Pitched'}] Skipping note with invalid properties:`, n);
              return null;
            }).filter(e => e !== null) as EventTime[];

            if (trackEvents.length > 0) {
              const correctedTrackEvents = ensureStrictlyIncreasingTimes(trackEvents, `Track-${track.name || 'pitched'}`);
              const part = new Tone.Part(((time, value) => {
                if (value.name && typeof value.name === 'string' && activeSynth) {
                  const effectiveDuration = Math.max(parseFloat(value.duration as any), 0.05);
                  activeSynth.triggerAttackRelease(value.name, effectiveDuration, time, value.velocity);
                } else {
                  console.warn(`[${track.name || 'Pitched'}] Invalid note data for synth:`, value);
                }
              }) as any, correctedTrackEvents);
              newParts.push(part);
            }
          }
        }
      });

      if (drumEvents.kick.length > 0 && synthsRef.current.kick) {
        const correctedKickEvents = ensureStrictlyIncreasingTimes(drumEvents.kick, "Kick");
        const kickPart = new Tone.Part(((time, value) => {
          const drumSynth = synthsRef.current.kick;
          if (drumSynth && value.pitch && (typeof value.pitch === 'string' || typeof value.pitch === 'number')) {
              const effectiveDuration = Math.max(parseFloat(value.duration as any), 0.05);
              drumSynth.triggerAttackRelease(value.pitch as string, effectiveDuration, time, value.velocity);
          } else { console.warn("[Kick] Invalid pitch or synth not ready", value); }
        }) as any, correctedKickEvents);
        newParts.push(kickPart);
      }
      if (drumEvents.snare.length > 0 && synthsRef.current.snare) {
        const correctedSnareEvents = ensureStrictlyIncreasingTimes(drumEvents.snare, "Snare");
        const snarePart = new Tone.Part(((time, value) => {
          const drumSynth = synthsRef.current.snare;
          if (drumSynth) {
            const effectiveDuration = Math.max(parseFloat(value.duration as any), 0.05);
            drumSynth.triggerAttackRelease(effectiveDuration, time, value.velocity);
          }
        }) as any, correctedSnareEvents);
        newParts.push(snarePart);
      }
      if (drumEvents.hiHat.length > 0 && synthsRef.current.hiHat) {
        const correctedHiHatEvents = ensureStrictlyIncreasingTimes(drumEvents.hiHat, "HiHat");
        const hiHatPart = new Tone.Part(((time, value) => {
          const drumSynth = synthsRef.current.hiHat as Tone.MetalSynth;
          if (drumSynth) {
            if (value.pitch && typeof value.pitch === 'number') {
              drumSynth.frequency.setValueAtTime(value.pitch, time);
            }
            const effectiveDuration = Math.max(parseFloat(value.duration as any), 0.05);
            drumSynth.triggerAttackRelease(effectiveDuration, time, value.velocity);
          }
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
      // If not using sampler, or if sampler already loaded, pianoSamplesLoaded will be true.
      // If using sampler and it's still loading, this won't auto-play yet.
      if (!usePianoSampler && isPlaying) { // if it was supposed to be playing and not using sampler
          Tone.Transport.start();
      }
    }
  }, [params, isPlaying]); // Added isPlaying to deps to handle auto-play after sample load

  useEffect(() => {
    if (params) {
      loadAndScheduleMidi();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]); // loadAndScheduleMidi is memoized and will be called when params change

  const updateProgress = useCallback(() => {
    if (!isPlaying || !currentMidiDuration) {
      setPlaybackProgress(0);
      return;
    }
    const progress = (Tone.Transport.seconds / currentMidiDuration) * 100;
    setPlaybackProgress(Math.min(progress, 100));
  }, [currentMidiDuration, isPlaying]);

  useEffect(() => {
    const endOfTransportHandler = () => {
      setIsPlaying(false);
      setPlaybackProgress(100);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      Tone.Transport.position = 0; 
    };
    Tone.Transport.on('stop', endOfTransportHandler);
    return () => {
      Tone.Transport.off('stop', endOfTransportHandler);
    };
  }, []);

  const handlePlayPause = async () => {
    if (isLoadingTone || !pianoSamplesLoaded) { // Don't allow play if Tone is loading or piano samples aren't ready
        toast({title: "Player Loading", description: "Player is still loading resources, please wait."});
        return;
    }
    if (!currentMidiDuration) {
      setToneError("MIDI data not loaded or duration is zero.");
      return;
    }

    if (Tone.Transport.state !== 'started') {
      await Tone.start(); 
      Tone.Transport.start();
      setIsPlaying(true);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = setInterval(updateProgress, 100);
    } else {
      Tone.Transport.pause();
      setIsPlaying(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
  };

  const handleStop = async () => {
    if (isLoadingTone) return;
    Tone.Transport.stop();
    setIsPlaying(false);
    setPlaybackProgress(0);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    Tone.Transport.position = 0; 
  };

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
      const midiDataUri = generateMidiFile(params);
      if (midiDataUri && midiDataUri.startsWith('data:audio/midi;base64,')) {
        let baseFileName = 'dreamtuner_music';
        if(params.generatedIdea) baseFileName = params.generatedIdea.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_').slice(0,30);
        const midiFile = dataURLtoFile(midiDataUri, `${baseFileName}.mid`);
        if (midiFile) filesToShareAttempt.push(midiFile);
      }
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
            return /^[A-G][#bSsxBF]?[0-9]$/.test(line.trim()) ||
                   (line.trim().length < 10 && /[A-G]/.test(line));
        };

        for (let i = 0; i < lines.length; i++) {
            let currentLine = lines[i];
            if (isClearlyNoteLine(currentLine) &&
                i + 1 < lines.length &&
                isClearlyNoteLine(lines[i+1]) &&
                currentLine.length < 20 && lines[i+1].length < 20
            ) {
                renderedElements.push(<p key={i} className="text-muted-foreground text-sm whitespace-pre-wrap">{currentLine.trim()}  |  {lines[i+1].trim()}</p>);
                i++;
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
      case 'video':
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
            {input.fileDetails.url && input.fileDetails.type.startsWith('audio/') && (
                <audio controls src={input.fileDetails.url} className="w-full mt-2" />
            )}
          </>
        );
        break;
      default:
        return null;
    }

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

  const playButtonDisabled = isLoadingTone || !currentMidiDuration || !pianoSamplesLoaded;
  const showLoadingSpinnerInPlayButton = isLoadingTone || (params.instrumentHints.some(h => h.toLowerCase().includes('piano')) && !pianoSamplesLoaded && params.originalInput.mode !== 'kids');
  
  let statusMessage = "";
  if (toneError) statusMessage = `Player Error: ${toneError}`;
  else if (isLoadingTone) statusMessage = "Preparing your tune...";
  else if (showLoadingSpinnerInPlayButton) statusMessage = "Loading piano samples...";
  else if (!isPlaying && currentMidiDuration > 0 && playbackProgress < 1) statusMessage = "Ready to play.";
  else if (!isPlaying && currentMidiDuration > 0 && playbackProgress >= 100) statusMessage = "Playback finished. Play again?";


  return (
    <div className="space-y-8 animate-fadeIn">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ParameterCardComponent title="Key Signature" value={`${params.keySignature} ${params.mode}`} icon={<MusicalNoteIcon />} />
        <ParameterCardComponent title="Tempo" value={params.tempoBpm} unit="BPM" icon={<ClockIcon />} />
        <ParameterCardComponent title="Mood Tags" value={params.moodTags || []} icon={params.targetValence > 0 ? <MoodHappyIcon /> : <MoodSadIcon />} />
        <ParameterCardComponent title="Instrument Hints" value={params.instrumentHints || []} icon={<CollectionIcon />} />
        <ParameterCardComponent title="Valence &amp; Arousal" value={`V: ${params.targetValence.toFixed(2)}, A: ${params.targetArousal.toFixed(2)}`} icon={<LightningBoltIcon />} subText={getValenceArousalDescription(params.targetValence, params.targetArousal)} />
        <ParameterCardComponent title="Rhythmic Density" value={params.rhythmicDensity.toFixed(2)} icon={<ScaleIcon />} subText={getRhythmicDensityDescription(params.rhythmicDensity)} />
        <ParameterCardComponent title="Harmonic Complexity" value={params.harmonicComplexity.toFixed(2)} icon={<CogIcon />} subText={getHarmonicComplexityDescription(params.harmonicComplexity)} />
        {params.selectedGenre && params.originalInput.mode === 'standard' && (
            <ParameterCardComponent title="Selected Genre" value={params.selectedGenre} icon={<LibraryIcon />} />
        )}
      </div>

      <Card className="mt-8 p-4 bg-nebula-gray/80 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-stardust-blue text-center">Listen to Your Tune</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="flex items-center justify-center space-x-2 my-4">
                <Button onClick={handlePlayPause} disabled={playButtonDisabled || showLoadingSpinnerInPlayButton} variant="outline" size="icon" className="w-12 h-12 rounded-full border-stardust-blue text-stardust-blue hover:bg-stardust-blue/10">
                {showLoadingSpinnerInPlayButton ? (
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle>
                        <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" fill="currentColor"></path>
                    </svg>
                ) : isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                </Button>
                <Button onClick={handleStop} disabled={isLoadingTone || !currentMidiDuration} variant="outline" size="icon" className="w-12 h-12 rounded-full border-slate-500 text-slate-300 hover:bg-slate-700/50">
                    <StopIcon className="w-6 h-6" />
                </Button>
            </div>
            <Progress value={playbackProgress} className="w-full h-2 mt-3 mb-1 [&>span]:bg-stardust-blue" />
            <p className="text-xs text-center text-muted-foreground h-4">{statusMessage}</p>
        </CardContent>
      </Card>

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
            disabled={isSharing || (params.originalInput.mode === 'standard' && !standardModeArtUrl && !params) || (params.originalInput.mode === 'kids' && !params) }
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
      <div className="text-center mt-2 h-4">
        {midiError && <p className="text-red-400 text-sm">{`MIDI Error: ${midiError}`}</p>}
        {copyError && <p className="text-red-400 text-sm">{copyError}</p>}
        {shareError && <p className="text-red-400 text-sm">{`Share Error: ${shareError}`}</p>}
      </div>

      {params.originalInput && renderOriginalInputInfo(params.originalInput)}
    </div>
  );
};

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

const mapInstrumentHintToGM = (hints: string[], genre?: string, isKidsMode: boolean = false): { melody: number; bass: number; chordsPad: number; arpeggioSynth: number } => {
    let mapping = { melody: 80, bass: 38, chordsPad: 89, arpeggioSynth: 81 }; // Default to Synth Lead, Synth Bass, Synth Pad, Synth Pluck
    const genreLower = genre?.toLowerCase();

    if (isKidsMode) {
        mapping = { melody: 13, bass: 24, chordsPad: 8, arpeggioSynth: 74 }; // Xylo, Ukulele, Celesta, Recorder
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


    if (genreLower) {
        if (genreLower.includes("rock")) { mapping = { melody: 27, bass: 34, chordsPad: 27, arpeggioSynth: 27 }; } // Electric Guitar, Picked Bass, EG, EG
        else if (genreLower.includes("pop")) { mapping = { melody: 80, bass: 38, chordsPad: 90, arpeggioSynth: 81 }; } // Synth Lead, Synth Bass, Pad (New Age), Synth Lead
        else if (genreLower.includes("jazz")) { mapping = { melody: 1, bass: 32, chordsPad: 1, arpeggioSynth: 52 }; } // Piano, Acoustic Bass, Piano, Voice Aahs
        else if (genreLower.includes("electronic")) { mapping = { melody: 80, bass: 38, chordsPad: 90, arpeggioSynth: 81 }; }
        else if (genreLower.includes("ambient")) { mapping = { melody: 90, bass: 90, chordsPad: 89, arpeggioSynth: 99 }; } // Pad (Warm), Pad (Warm), Pad (New Age), FX (Crystal)
        else if (genreLower.includes("classical") || genreLower.includes("cinematic")) { mapping = { melody: 40, bass: 42, chordsPad: 48, arpeggioSynth: 49 }; } // Violin, Cello, Strings, Strings
        else if (genreLower.includes("folk")) { mapping = { melody: 24, bass: 32, chordsPad: 24, arpeggioSynth: 73 }; } // Acoustic Guitar, Acoustic Bass, AG, Flute
    }

    (hints || []).forEach(hint => {
        const hLower = hint.toLowerCase();
        if (/piano/i.test(hLower)) { mapping.melody = 0; if (genreLower?.includes("jazz") || !genreLower) mapping.chordsPad = 0; }
        else if (/flute/i.test(hLower)) mapping.melody = 73;
        else if (/violin|strings/i.test(hLower) && !/ensemble|pad/i.test(hLower)) mapping.melody = 40;
        else if (/guitar/i.test(hLower) && !/bass|acoustic/i.test(hLower)) mapping.melody = 27;
        else if (/acoustic guitar/i.test(hLower)) mapping.melody = 24;
        else if (/trumpet|brass/i.test(hLower) && !/section/i.test(hLower)) mapping.melody = 56;
        else if (/sax|saxophone/i.test(hLower)) mapping.melody = 65;
        else if (/bell|celesta|glockenspiel|music box/i.test(hLower)) { mapping.melody = 9; mapping.arpeggioSynth = 14; }
        else if (/bright synth|synth lead/i.test(hLower)) mapping.melody = 80;
        else if (/warm lead|soft lead/i.test(hLower)) mapping.melody = 81;
        else if (/organ/i.test(hLower)) mapping.melody = 19;

        if (/synth bass|bass synth/i.test(hLower)) mapping.bass = 38;
        else if (/acoustic bass|double bass|upright bass/i.test(hLower)) mapping.bass = 32;
        else if (/picked bass/i.test(hLower)) mapping.bass = 34;
        else if (/cello/i.test(hLower) && (genreLower?.includes("classical") || genreLower?.includes("cinematic"))) mapping.bass = 42;


        if (/string ensemble|strings pad/i.test(hLower)) mapping.chordsPad = 48;
        else if (/synth pad|ambient pad|warm pad/i.test(hLower)) mapping.chordsPad = 89;
        else if (/dark pad|sweep pad/i.test(hLower)) mapping.chordsPad = 96;
        else if (/organ/i.test(hLower) && (genreLower?.includes("blues") || genreLower?.includes("funk") || genreLower?.includes("reggae"))) mapping.chordsPad = 19;
        else if (/electric piano/i.test(hLower) && (genreLower?.includes("jazz") || genreLower?.includes("soul") || genreLower?.includes("funk"))) mapping.chordsPad = 4;
        else if (/choir|voice|aahs/i.test(hLower)) mapping.chordsPad = 52;

        if (/arp|arpeggio|pluck|sequence/i.test(hLower)) mapping.arpeggioSynth = 99;
        else if (/fx|sound effect/i.test(hLower)) mapping.arpeggioSynth = 102;
    });
    return mapping;
};
