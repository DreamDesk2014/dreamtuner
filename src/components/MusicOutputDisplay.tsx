
"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
// import * as Tone from 'tone'; // Commented out
// import { Midi as MidiFileParser } from '@tonejs/midi'; // Commented out
import type { MusicParameters, AppInput } from '@/types';
import { getValenceArousalDescription } from '@/lib/constants';
import { generateMidiFile } from '@/lib/midiService';
import { dataURLtoFile } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import {
  MusicalNoteIcon, ClockIcon, MoodHappyIcon, MoodSadIcon, LightningBoltIcon, CogIcon, ScaleIcon, CollectionIcon,
  DocumentTextIcon, DownloadIcon, PhotographIcon, VideoCameraIcon, ClipboardCopyIcon, RefreshIcon,
  LibraryIcon, ExclamationCircleIcon // PlayIcon, PauseIcon, StopIcon commented out, AlertTriangle replaced
} from './icons/HeroIcons';
import { Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
// import { Progress } from "@/components/ui/progress"; // Commented out
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

// interface EventTime { time: number; [key: string]: any; } // Commented out
// const MIN_TIME_GAP = 0.001; // Commented out

// function ensureStrictlyIncreasingTimes(events: EventTime[], label = "Track"): EventTime[] { // Commented out
//   if (!events || events.length === 0) { // Commented out
//     return []; // Commented out
//   } // Commented out
//   const sortedEvents = [...events].sort((a, b) => { // Commented out
//     const timeA = typeof a.time === 'number' ? a.time : parseFloat(a.time as any); // Commented out
//     const timeB = typeof b.time === 'number' ? b.time : parseFloat(b.time as any); // Commented out
//     if (isNaN(timeA) && isNaN(timeB)) return 0; // Commented out
//     if (isNaN(timeA)) return 1; // Commented out
//     if (isNaN(timeB)) return -1; // Commented out
//     return timeA - timeB; // Commented out
//   }); // Commented out

//   const adjustedEvents: EventTime[] = []; // Commented out
//   let lastTime = -Infinity; // Commented out

//   for (let i = 0; i < sortedEvents.length; i++) { // Commented out
//     const event = sortedEvents[i]; // Commented out
//     let newTime = typeof event.time === 'number' ? event.time : parseFloat(event.time as any); // Commented out

//     if (isNaN(newTime)) { // Commented out
//       console.warn(`[${label}] Event with invalid time encountered at original index for event:`, event, `Setting time to ${lastTime + MIN_TIME_GAP}`); // Commented out
//       newTime = lastTime + MIN_TIME_GAP; // Commented out
//     } else if (newTime <= lastTime) { // Commented out
//       console.warn(`[${label}] Adjusted overlapping note time from ${event.time} -> ${lastTime + MIN_TIME_GAP} (index: ${i})`); // Commented out
//       newTime = lastTime + MIN_TIME_GAP; // Commented out
//     } // Commented out
    
//     adjustedEvents.push({ ...event, time: newTime }); // Commented out
//     lastTime = newTime; // Commented out
//   } // Commented out
//   return adjustedEvents; // Commented out
// } // Commented out


// interface SynthConfigurations { // Commented out
//   melody: any;  // Commented out
//   bass: any;  // Commented out
//   chords: any;  // Commented out
//   kick: any;  // Commented out
//   snare: any;  // Commented out
//   hiHat: any;  // Commented out
// } // Commented out

// const getSynthConfigurations = ( // Commented out
//   instrumentHints: string[] = [], // Commented out
//   genre: string = '', // Commented out
//   isKidsMode: boolean = false // Commented out
// ): SynthConfigurations => { // Commented out
//   const hintsLower = instrumentHints.map(h => h.toLowerCase()); // Commented out
//   const genreLower = genre.toLowerCase(); // Commented out

//   let configs: SynthConfigurations = { // Commented out
//     melody: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.4 }, volume: -3 }, // Commented out
//     bass: { oscillator: { type: 'fatsine', count: 2, spread: 10 }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.5 }, volume: -6 }, // Commented out
//     chords: { oscillator: { type: 'amtriangle', harmonicity: 0.5 }, volume: -12, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 } }, // Commented out
//     kick: { pitchDecay: 0.05, octaves: 10, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: 'exponential' }, volume: 0 }, // Commented out
//     snare: { noise: { type: 'pink' }, volume: -8, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } }, // Commented out
//     hiHat: { frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3000, octaves: 1.5, volume: -20 }, // Commented out
//   }; // Commented out

//   if (isKidsMode) { // Commented out
//     configs.melody = { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3 }, volume: -3 }; // Commented out
//     configs.bass = { oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.4 }, volume: -6 }; // Commented out
//     configs.chords = { oscillator: { type: 'triangle' }, volume: -15, envelope: { attack: 0.1, decay: 0.4, sustain: 0.5, release: 0.8 } }; // Commented out
//     configs.kick.pitchDecay = 0.1; // Commented out
//     configs.snare.noise.type = 'white'; configs.snare.envelope.decay = 0.1; // Commented out
//     configs.hiHat.frequency = 300; configs.hiHat.envelope.decay = 0.03; // Commented out
//   } else { // Commented out
//     if (genreLower.includes('electronic')) { // Commented out
//       configs.melody.oscillator.type = 'pulse'; // Commented out
//       configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = -3; // Commented out
//       configs.chords.oscillator.type = 'pwm'; configs.chords.oscillator.modulationFrequency = 0.5; configs.chords.volume = -10; // Commented out
//     } else if (genreLower.includes('ambient')) { // Commented out
//       configs.melody.envelope = { attack: 0.5, decay: 0.2, sustain: 0.8, release: 2.0 }; configs.melody.volume = -6; // Commented out
//       configs.bass.envelope = { attack: 0.6, decay: 0.3, sustain: 0.9, release: 2.5 }; configs.bass.volume = -9; // Commented out
//       configs.chords.oscillator.type = 'fatsine'; configs.chords.volume = -12; // Commented out
//       configs.chords.envelope = { attack: 1.0, decay: 0.5, sustain: 0.9, release: 3.0 }; // Commented out
//     } else if (genreLower.includes('rock') || genreLower.includes('metal')) { // Commented out
//       configs.melody.oscillator.type = 'fatsawtooth'; configs.melody.volume = 0; // Commented out
//       configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = -3; // Commented out
//       configs.chords.oscillator.type = 'fatsawtooth'; configs.chords.volume = -9; // Commented out
//       configs.kick.octaves = 8; configs.kick.envelope.decay = 0.3; // Commented out
//       configs.snare.envelope.decay = 0.1; configs.snare.volume = -6; // Commented out
//     } else if (genreLower.includes('jazz')) { // Commented out
//       configs.melody = { oscillator: { type: 'fmsine', harmonicity: 1.5, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.2 }, volume: -3 }; // Commented out
//       configs.bass = { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.3 }, volume: -6 }; // Commented out
//       configs.chords = { oscillator: { type: 'fmtriangle', harmonicity: 2, modulationIndex: 3 }, volume: -15, envelope: { attack: 0.02, decay: 0.6, sustain: 0.3, release: 0.5 } }; // Commented out
//     } // Commented out

//     hintsLower.forEach(hint => { // Commented out
//       if (hint.includes('piano') && !isKidsMode) { // Commented out
//         if (!genreLower.includes('jazz')) configs.chords = { oscillator: { type: 'fmsine', harmonicity: 2.5, modulationIndex: 8 }, volume: -12, envelope: { attack: 0.01, decay: 0.8, sustain: 0.1, release: 0.5 } }; // Commented out
//       } else if (hint.includes('strings') || hint.includes('pad') && !hint.includes('synth pad')) { // Commented out
//         configs.melody = { oscillator: { type: 'fatsawtooth', count: 5, spread: 30 }, envelope: { attack: 0.3, decay: 0.1, sustain: 0.9, release: 1.2 }, volume: -6 }; // Commented out
//         configs.chords = { oscillator: { type: 'fatsawtooth', count: 7, spread: 50 }, volume: -10, envelope: { attack: 0.5, decay: 0.2, sustain: 0.9, release: 1.5 } }; // Commented out
//       } else if (hint.includes('synth lead') && !isKidsMode) { // Commented out
//         configs.melody = { oscillator: { type: 'pwm', modulationFrequency: 0.3 }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.6 }, volume: 0 }; // Commented out
//       } else if (hint.includes('acoustic guitar') && !isKidsMode) { // Commented out
//          configs.melody = { oscillator: { type: 'fmtriangle', harmonicity: 1.2, modulationIndex: 12 }, envelope: { attack: 0.01, decay: 0.25, sustain: 0.01, release: 0.15}, volume: -4 }; // Commented out
//          configs.chords = { oscillator: { type: 'fmtriangle', harmonicity: 1.5, modulationIndex: 10 }, volume: -10, envelope: { attack: 0.02, decay: 0.4, sustain: 0.05, release: 0.25} }; // Commented out
//       } else if (hint.includes('flute')) { // Commented out
//         configs.melody = { oscillator: { type: 'triangle8' }, envelope: { attack: 0.06, decay: 0.15, sustain: 0.6, release: 0.35 }, volume: -5 }; // Commented out
//       } else if (hint.includes('bell') || hint.includes('xylophone')) { // Commented out
//         configs.melody = { oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.5, sustain: 0.01, release: 0.3, attackCurve: 'exponential' }, volume: -3 }; // Commented out
//       } // Commented out
//       if (hint.includes('synth bass')) configs.bass = { oscillator: {type: 'fatsquare', count: 3, spread: 15}, envelope: {attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3}, volume: -3}; // Commented out
//       else if (hint.includes('acoustic bass') && !genreLower.includes('jazz')) configs.bass = { oscillator: {type: 'sine'}, envelope: {attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.3}, volume: -6}; // Commented out
//       if (hint.includes('synth pad')) configs.chords = {oscillator: {type: 'fatsawtooth', count: 4, spread: 60}, volume: -12, envelope: {attack: 0.4, decay: 0.1, sustain: 0.9, release: 1.2}}; // Commented out
//     }); // Commented out
//   } // Commented out
//   return configs; // Commented out
// }; // Commented out


export const MusicOutputDisplay: React.FC<MusicOutputDisplayProps> = ({ params, onRegenerateIdea, isRegeneratingIdea, standardModeArtUrl }) => {
  const [midiError, setMidiError] = useState<string | null>(null);
  const [isGeneratingMidiForDownload, setIsGeneratingMidiForDownload] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // const [isPlaying, setIsPlaying] = useState<boolean>(false); // Commented out
  // const [isLoadingTone, setIsLoadingTone] = useState<boolean>(false); // Commented out
  // const [toneError, setToneError] = useState<string | null>(null); // Commented out
  // const [playbackProgress, setPlaybackProgress] = useState<number>(0); // Commented out
  // const [currentMidiDuration, setCurrentMidiDuration] = useState<number>(0); // Commented out
  // const [pianoSamplesLoaded, setPianoSamplesLoaded] = useState(false); // Commented out

  // const synthsRef = useRef<{ // Commented out
  //   melody?: Tone.PolySynth | Tone.Sampler, // Commented out
  //   bass?: Tone.PolySynth, // Commented out
  //   chords?: Tone.PolySynth, // Commented out
  //   kick?: Tone.MembraneSynth, // Commented out
  //   snare?: Tone.NoiseSynth, // Commented out
  //   hiHat?: Tone.MetalSynth, // Commented out
  //   parts: (Tone.Part | Tone.Sequence)[] // Commented out
  // }>({parts: []}); // Commented out
  // const progressIntervalRef = useRef<NodeJS.Timeout | null>(null); // Commented out

  // const generatePianoSampleUrls = () => { // Commented out
  //   const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]; // Commented out
  //   const salamanderFileNotes = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"]; // Commented out
  //   const urls: Record<string, string> = {}; // Commented out
  //   for (let octave = 1; octave <= 7; octave++) { // Commented out
  //     notes.forEach((note, index) => { // Commented out
  //       urls[`${note}${octave}`] = `${salamanderFileNotes[index]}${octave}.mp3`; // Commented out
  //     }); // Commented out
  //   } // Commented out
  //   return urls; // Commented out
  // }; // Commented out


  // useEffect(() => { // Commented out
    // Initialize non-sampler synths // Commented out
    // synthsRef.current.bass = new Tone.PolySynth(Tone.Synth, { detune: -1200 }).toDestination(); // Commented out
    // synthsRef.current.chords = new Tone.PolySynth(Tone.Synth).toDestination(); // Commented out
    // synthsRef.current.kick = new Tone.MembraneSynth().toDestination(); // Commented out
    // synthsRef.current.snare = new Tone.NoiseSynth().toDestination(); // Commented out
    // synthsRef.current.hiHat = new Tone.MetalSynth().toDestination(); // Commented out

  //   return () => { // Commented out
  //     if (Tone.Transport.state === 'started') { // Commented out
  //       Tone.Transport.stop(); // Commented out
  //     } // Commented out
  //     Tone.Transport.cancel(0); // Commented out
  //     synthsRef.current.parts.forEach(part => part.dispose()); // Commented out
  //     Object.values(synthsRef.current).forEach(synthOrParts => { // Commented out
  //       if (synthOrParts && typeof (synthOrParts as any).dispose === 'function' && !Array.isArray(synthOrParts)) { // Commented out
  //           (synthOrParts as any).dispose(); // Commented out
  //       } // Commented out
  //     }); // Commented out
  //     synthsRef.current = { parts: [] }; // Reset parts array // Commented out
  //     if (progressIntervalRef.current) { // Commented out
  //       clearInterval(progressIntervalRef.current); // Commented out
  //     } // Commented out
  //   }; // Commented out
  // }, []); // Commented out


  // const loadAndScheduleMidi = useCallback(async () => { // Commented out
  //   let usePianoSampler = false; // Defined here to be accessible in finally // Commented out
  //   if (!params ) { // Removed synth checks as they are commented out // Commented out
  //     setToneError("Params not available."); // Commented out
  //     return; // Commented out
  //   } // Commented out
    // Ensure synths are initialized if they were disposed or are null // Commented out
    // if (!synthsRef.current.melody) { // Commented out
    //    usePianoSampler = params.instrumentHints.some(h => h.toLowerCase().includes('piano')) && params.originalInput.mode !== 'kids'; // Commented out
    //    if (usePianoSampler) { // Commented out
    //         synthsRef.current.melody = new Tone.Sampler({ // Commented out
    //             urls: generatePianoSampleUrls(), // Commented out
    //             baseUrl: "https://tonejs.github.io/audio/salamander/", // Commented out
    //             release: 1, // Commented out
    //             onload: () => { setPianoSamplesLoaded(true); } // Commented out
    //         }).toDestination(); // Commented out
    //         synthsRef.current.melody.volume.value = -3; // Commented out
    //    } else { // Commented out
    //         synthsRef.current.melody = new Tone.PolySynth(Tone.Synth).toDestination(); // Commented out
    //         setPianoSamplesLoaded(true); // Considered loaded for non-sampler // Commented out
    //    } // Commented out
    // } // Commented out
    // if (!synthsRef.current.bass) synthsRef.current.bass = new Tone.PolySynth(Tone.Synth, { detune: -1200 }).toDestination(); // Commented out
    // if (!synthsRef.current.chords) synthsRef.current.chords = new Tone.PolySynth(Tone.Synth).toDestination(); // Commented out
    // if (!synthsRef.current.kick) synthsRef.current.kick = new Tone.MembraneSynth().toDestination(); // Commented out
    // if (!synthsRef.current.snare) synthsRef.current.snare = new Tone.NoiseSynth().toDestination(); // Commented out
    // if (!synthsRef.current.hiHat) synthsRef.current.hiHat = new Tone.MetalSynth().toDestination(); // Commented out


  //   setIsLoadingTone(true); // Commented out
  //   setToneError(null); // Commented out
  //   setIsPlaying(false); // Commented out
  //   setPlaybackProgress(0); // Commented out
  //   setCurrentMidiDuration(0); // Commented out
  //   setPianoSamplesLoaded(false); // Reset piano samples loaded state // Commented out

  //   if (Tone.Transport.state === 'started') Tone.Transport.stop(); // Commented out
  //   Tone.Transport.cancel(0); // Commented out
  //   Tone.Transport.position = 0; // Commented out
  //   synthsRef.current.parts.forEach(part => part.dispose()); // Commented out
  //   synthsRef.current.parts = []; // Commented out

  //   try { // Commented out
  //     usePianoSampler = params.instrumentHints.some(h => h.toLowerCase().includes('piano')) && params.originalInput.mode !== 'kids'; // Commented out
      
  //     if (synthsRef.current.melody && typeof (synthsRef.current.melody as any).dispose === 'function') { // Commented out
  //         (synthsRef.current.melody as any).dispose(); // Commented out
  //     } // Commented out

  //     if (usePianoSampler) { // Commented out
  //       console.log("Using Piano Sampler for melody"); // Commented out
  //       const pianoSampler = new Tone.Sampler({ // Commented out
  //           urls: generatePianoSampleUrls(), // Commented out
  //           baseUrl: "https://tonejs.github.io/audio/salamander/", // Commented out
  //           release: 1, // Commented out
  //           onload: () => { // Commented out
  //               console.log('Piano samples loaded successfully for melody track.'); // Commented out
  //               setPianoSamplesLoaded(true); // Commented out
  //               // if (Tone.Transport.state === 'paused' && isPlaying) { // Auto-play if was meant to play // Commented out
  //               //   Tone.Transport.start(); // Commented out
  //               // } // Commented out
  //           } // Commented out
  //       }).toDestination(); // Commented out
  //       pianoSampler.volume.value = -3; // Commented out
  //       synthsRef.current.melody = pianoSampler; // Commented out
  //     } else { // Commented out
  //         console.log("Using PolySynth for melody"); // Commented out
  //         synthsRef.current.melody = new Tone.PolySynth(Tone.Synth).toDestination(); // Commented out
  //         setPianoSamplesLoaded(true); // Consider non-sampler as "loaded" for playback readiness // Commented out
  //     } // Commented out

  //     const synthConfigs = getSynthConfigurations( // Commented out
  //       params.instrumentHints, // Commented out
  //       params.selectedGenre, // Commented out
  //       params.originalInput.mode === 'kids' // Commented out
  //     ); // Commented out
      
  //     if (!usePianoSampler && synthsRef.current.melody instanceof Tone.PolySynth) { // Commented out
  //         synthsRef.current.melody.set(synthConfigs.melody); // Commented out
  //     } // Commented out
  //     synthsRef.current.bass?.set(synthConfigs.bass); // Commented out
  //     synthsRef.current.chords?.set(synthConfigs.chords); // Commented out
  //     synthsRef.current.kick?.set(synthConfigs.kick); // Commented out
  //     synthsRef.current.snare?.set(synthConfigs.snare); // Commented out
  //     synthsRef.current.hiHat?.set(synthConfigs.hiHat); // Commented out

  //     const midiDataUri = generateMidiFile(params); // Commented out
  //     if (!midiDataUri || !midiDataUri.startsWith('data:audio/midi;base64,')) { // Commented out
  //       throw new Error("Failed to generate valid MIDI data."); // Commented out
  //     } // Commented out

  //     const parsedMidi = await MidiFileParser.fromUrl(midiDataUri); // Commented out
  //     setCurrentMidiDuration(parsedMidi.duration); // Commented out
  //     Tone.Transport.bpm.value = params.tempoBpm; // Commented out

  //     const newParts: (Tone.Part)[] = []; // Commented out
  //     const drumEvents: { kick: EventTime[], snare: EventTime[], hiHat: EventTime[] } = { kick: [], snare: [], hiHat: [] }; // Commented out
      
  //     parsedMidi.tracks.forEach((track) => { // Commented out
  //       if (track.channel === 9) {  // Commented out
  //         track.notes.forEach(note => { // Commented out
  //           const noteTimeInput = note.time; // Commented out
  //           const noteDurationInput = note.duration; // Commented out
  //           const noteVelocityInput = note.velocity; // Commented out

  //           const noteTime = parseFloat(noteTimeInput as any); // Commented out
  //           let noteDuration = parseFloat(noteDurationInput as any); // Commented out
  //           const noteVelocity = parseFloat(noteVelocityInput as any); // Commented out

  //           if (isNaN(noteTime) || isNaN(noteDuration) || isNaN(noteVelocity)) { // Commented out
  //             console.warn(`[Drums] Skipping note with invalid time/duration/velocity:`, note); // Commented out
  //             return; // Commented out
  //           } // Commented out
  //           let effectiveDuration = Math.max(noteDuration > 0 ? noteDuration : 0.05, 0.05); // Commented out

  //           let drumType: 'kick' | 'snare' | 'hiHat' | null = null; // Commented out
  //           let pitchToPlay: string | number | undefined = undefined; // Commented out

  //           if (note.midi === 35 || note.midi === 36) { drumType = 'kick'; pitchToPlay = "C1"; }  // Commented out
  //           else if (note.midi === 38 || note.midi === 40) { drumType = 'snare'; }  // Commented out
  //           else if (note.midi === 42 || note.midi === 44 || note.midi === 46) {  // Commented out
  //             drumType = 'hiHat'; // Commented out
  //             pitchToPlay = note.midi === 46 ? 400 : 250;  // Commented out
  //           } // Commented out

  //           if (drumType) { // Commented out
  //             const event: EventTime = { time: noteTime, duration: effectiveDuration, velocity: noteVelocity, pitch: pitchToPlay }; // Commented out
  //             if (drumType === 'kick') drumEvents.kick.push(event); // Commented out
  //             else if (drumType === 'snare') drumEvents.snare.push(event); // Commented out
  //             else if (drumType === 'hiHat') drumEvents.hiHat.push(event); // Commented out
  //           } // Commented out
  //         }); // Commented out
  //       } else {  // Commented out
  //         let activeSynth: Tone.PolySynth | Tone.Sampler | undefined; // Commented out
  //         const { melody: melodyInstrument, bass: bassInstrument, chordsPad: chordsPadInstrument } = mapInstrumentHintToGM(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids'); // Commented out

  //         if (track.instrument.number === melodyInstrument && synthsRef.current.melody) activeSynth = synthsRef.current.melody; // Commented out
  //         else if (track.instrument.number === bassInstrument && synthsRef.current.bass) activeSynth = synthsRef.current.bass; // Commented out
  //         else if (track.instrument.number === chordsPadInstrument && synthsRef.current.chords) activeSynth = synthsRef.current.chords; // Commented out
  //         else if (synthsRef.current.melody) activeSynth = synthsRef.current.melody;  // Commented out

  //         if (activeSynth) { // Commented out
  //           const trackEvents: EventTime[] = track.notes.map(n => { // Commented out
  //             const noteTimeInput = n.time; // Commented out
  //             const noteDurationInput = n.duration; // Commented out
  //             const noteVelocityInput = n.velocity; // Commented out
  //             const noteNameInput = n.name; // Commented out

  //             const noteTime = parseFloat(noteTimeInput as any); // Commented out
  //             let noteDuration = parseFloat(noteDurationInput as any); // Commented out
  //             const noteVelocity = parseFloat(noteVelocityInput as any); // Commented out

  //             if (typeof noteNameInput === 'string' && !isNaN(noteTime) && !isNaN(noteDuration) && !isNaN(noteVelocity)) { // Commented out
  //               let effectiveDuration = Math.max(noteDuration > 0 ? noteDuration : 0.05, 0.05); // Commented out
  //               return { time: noteTime, name: noteNameInput, duration: effectiveDuration, velocity: noteVelocity }; // Commented out
  //             } // Commented out
  //             console.warn(`[${track.name || 'Pitched'}] Skipping note with invalid properties:`, n); // Commented out
  //             return null; // Commented out
  //           }).filter(e => e !== null) as EventTime[]; // Commented out

  //           if (trackEvents.length > 0) { // Commented out
  //             const correctedTrackEvents = ensureStrictlyIncreasingTimes(trackEvents, `Track-${track.name || 'pitched'}`); // Commented out
  //             const part = new Tone.Part(((time, value) => { // Commented out
  //               if (value.name && typeof value.name === 'string' && activeSynth) { // Commented out
  //                 const effectiveDuration = Math.max(parseFloat(value.duration as any), 0.05); // Commented out
  //                 activeSynth.triggerAttackRelease(value.name, effectiveDuration, time, value.velocity); // Commented out
  //               } else { // Commented out
  //                 console.warn(`[${track.name || 'Pitched'}] Invalid note data for synth:`, value); // Commented out
  //               } // Commented out
  //             }) as any, correctedTrackEvents); // Commented out
  //             newParts.push(part); // Commented out
  //           } // Commented out
  //         } // Commented out
  //       } // Commented out
  //     }); // Commented out

  //     if (drumEvents.kick.length > 0 && synthsRef.current.kick) { // Commented out
  //       const correctedKickEvents = ensureStrictlyIncreasingTimes(drumEvents.kick, "Kick"); // Commented out
  //       const kickPart = new Tone.Part(((time, value) => { // Commented out
  //         const drumSynth = synthsRef.current.kick; // Commented out
  //         if (drumSynth && value.pitch && (typeof value.pitch === 'string' || typeof value.pitch === 'number')) { // Commented out
  //             const effectiveDuration = Math.max(parseFloat(value.duration as any), 0.05); // Commented out
  //             drumSynth.triggerAttackRelease(value.pitch as string, effectiveDuration, time, value.velocity); // Commented out
  //         } else { console.warn("[Kick] Invalid pitch or synth not ready", value); } // Commented out
  //       }) as any, correctedKickEvents); // Commented out
  //       newParts.push(kickPart); // Commented out
  //     } // Commented out
  //     if (drumEvents.snare.length > 0 && synthsRef.current.snare) { // Commented out
  //       const correctedSnareEvents = ensureStrictlyIncreasingTimes(drumEvents.snare, "Snare"); // Commented out
  //       const snarePart = new Tone.Part(((time, value) => { // Commented out
  //         const drumSynth = synthsRef.current.snare; // Commented out
  //         if (drumSynth) { // Commented out
  //           const effectiveDuration = Math.max(parseFloat(value.duration as any), 0.05); // Commented out
  //           drumSynth.triggerAttackRelease(effectiveDuration, time, value.velocity); // Corrected signature // Commented out
  //         } // Commented out
  //       }) as any, correctedSnareEvents); // Commented out
  //       newParts.push(snarePart); // Commented out
  //     } // Commented out
  //     if (drumEvents.hiHat.length > 0 && synthsRef.current.hiHat) { // Commented out
  //       const correctedHiHatEvents = ensureStrictlyIncreasingTimes(drumEvents.hiHat, "HiHat"); // Commented out
  //       const hiHatPart = new Tone.Part(((time, value) => { // Commented out
  //         const drumSynth = synthsRef.current.hiHat as Tone.MetalSynth; // Commented out
  //         if (drumSynth) { // Commented out
  //           if (value.pitch && typeof value.pitch === 'number') { // Commented out
  //             drumSynth.frequency.setValueAtTime(value.pitch, time); // Commented out
  //           } // Commented out
  //           const effectiveDuration = Math.max(parseFloat(value.duration as any), 0.05); // Commented out
  //           drumSynth.triggerAttackRelease(effectiveDuration, time, value.velocity); // Commented out
  //         } // Commented out
  //       }) as any, correctedHiHatEvents); // Commented out
  //       newParts.push(hiHatPart); // Commented out
  //     } // Commented out

  //     newParts.forEach(part => part.start(0)); // Commented out
  //     synthsRef.current.parts = newParts; // Commented out

  //   } catch (error) { // Commented out
  //     console.error("Tone.js MIDI loading/scheduling error:", error); // Commented out
  //     setToneError(error instanceof Error ? error.message : "Error loading or scheduling MIDI with Tone.js"); // Commented out
  //   } finally { // Commented out
  //     setIsLoadingTone(false); // Commented out
  //     // if (!usePianoSampler && isPlaying) {  // Commented out
  //     //     Tone.Transport.start(); // Commented out
  //     // } // Commented out
  //   } // Commented out
  // }, [params]); // Removed isPlaying from deps as it was causing re-trigger // Commented out

  // useEffect(() => { // Commented out
  //   if (params) { // Commented out
  //     loadAndScheduleMidi(); // Commented out
  //   } // Commented out
  // // eslint-disable-next-line react-hooks/exhaustive-deps // Commented out
  // }, [params]); // Commented out

  // const updateProgress = useCallback(() => { // Commented out
  //   if (!isPlaying || !currentMidiDuration) { // Commented out
  //     setPlaybackProgress(0); // Commented out
  //     return; // Commented out
  //   } // Commented out
  //   const progress = (Tone.Transport.seconds / currentMidiDuration) * 100; // Commented out
  //   setPlaybackProgress(Math.min(progress, 100)); // Commented out
  // }, [currentMidiDuration, isPlaying]); // Commented out

  // useEffect(() => { // Commented out
  //   const endOfTransportHandler = () => { // Commented out
  //     setIsPlaying(false); // Commented out
  //     setPlaybackProgress(100); // Commented out
  //     if (progressIntervalRef.current) { // Commented out
  //       clearInterval(progressIntervalRef.current); // Commented out
  //       progressIntervalRef.current = null; // Commented out
  //     } // Commented out
  //     Tone.Transport.position = 0;  // Commented out
  //   }; // Commented out
  //   Tone.Transport.on('stop', endOfTransportHandler); // Commented out
  //   return () => { // Commented out
  //     Tone.Transport.off('stop', endOfTransportHandler); // Commented out
  //   }; // Commented out
  // }, []); // Commented out

  // const handlePlayPause = async () => { // Commented out
  //   if (isLoadingTone || !pianoSamplesLoaded) {  // Commented out
  //       toast({title: "Player Loading", description: "Player is still loading resources, please wait."}); // Commented out
  //       return; // Commented out
  //   } // Commented out
  //   if (!currentMidiDuration) { // Commented out
  //     setToneError("MIDI data not loaded or duration is zero."); // Commented out
  //     return; // Commented out
  //   } // Commented out

  //   if (Tone.Transport.state !== 'started') { // Commented out
  //     await Tone.start();  // Commented out
  //     Tone.Transport.start(); // Commented out
  //     setIsPlaying(true); // Commented out
  //     if (progressIntervalRef.current) clearInterval(progressIntervalRef.current); // Commented out
  //     progressIntervalRef.current = setInterval(updateProgress, 100); // Commented out
  //   } else { // Commented out
  //     Tone.Transport.pause(); // Commented out
  //     setIsPlaying(false); // Commented out
  //     if (progressIntervalRef.current) { // Commented out
  //       clearInterval(progressIntervalRef.current); // Commented out
  //       progressIntervalRef.current = null; // Commented out
  //     } // Commented out
  //   } // Commented out
  // }; // Commented out

  // const handleStop = async () => { // Commented out
  //   if (isLoadingTone) return; // Commented out
  //   Tone.Transport.stop(); // Commented out
  //   setIsPlaying(false); // Commented out
  //   setPlaybackProgress(0); // Commented out
  //   if (progressIntervalRef.current) { // Commented out
  //     clearInterval(progressIntervalRef.current); // Commented out
  //     progressIntervalRef.current = null; // Commented out
  //   } // Commented out
  //   Tone.Transport.position = 0;  // Commented out
  // }; // Commented out

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

  // const playButtonDisabled = isLoadingTone || !currentMidiDuration || !pianoSamplesLoaded; // Commented out
  // const showLoadingSpinnerInPlayButton = isLoadingTone || (params.instrumentHints.some(h => h.toLowerCase().includes('piano')) && !pianoSamplesLoaded && params.originalInput.mode !== 'kids'); // Commented out
  
  // let statusMessage = ""; // Commented out
  // if (toneError) statusMessage = `Player Error: ${toneError}`; // Commented out
  // else if (isLoadingTone) statusMessage = "Preparing your tune..."; // Commented out
  // else if (showLoadingSpinnerInPlayButton) statusMessage = "Loading piano samples..."; // Commented out
  // else if (!isPlaying && currentMidiDuration > 0 && playbackProgress < 1) statusMessage = "Ready to play."; // Commented out
  // else if (!isPlaying && currentMidiDuration > 0 && playbackProgress >= 100) statusMessage = "Playback finished. Play again?"; // Commented out


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
            {/* Player Controls Removed/Commented Out */}
            {/* <div className="flex items-center justify-center space-x-2 my-4">
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
            <p className="text-xs text-center text-muted-foreground h-4">{statusMessage}</p> */}
             <Alert variant="default" className="mt-4 bg-slate-700/50 border-slate-600 text-slate-300">
              <ExclamationCircleIcon className="h-5 w-5 text-amber-400" />
              <AlertTitle className="text-amber-400">Player Under Development</AlertTitle>
              <AlertDescription>
                In-browser MIDI playback is temporarily disabled while we fine-tune it.
                You can still download the MIDI file below to listen with your favorite MIDI player.
              </AlertDescription>
            </Alert>
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

