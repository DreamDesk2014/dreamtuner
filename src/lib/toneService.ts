
'use client';
import * as Tone from 'tone';
import type { MusicParameters } from '@/types';
import { audioBufferToWav } from "./audioBufferToWav"; 

const SAFE_OSC_TYPE = 'triangle' as const;
const MIN_EFFECTIVE_DURATION_SECONDS = 6.0; 
const TIME_EPSILON = 0.00001; // Small offset to ensure unique times

// Helper function for weighted random choice
function weightedRandom(items: string[], weights: number[]): string {
    let sum = 0;
    const r = Math.random();
    for (let i = 0; i < items.length; i++) {
        if (weights[i] < 0) continue; // Skip negative weights
        sum += weights[i];
        if (r <= sum) return items[i];
    }
    // Fallback if weights don't sum to 1 or other issues
    return items.find(item => (weights[items.indexOf(item)] ?? 0) > 0) || items[items.length - 1] || "4n";
}


// Helper functions (can be expanded from midiService.ts logic or kept simple)
const PITCH_CLASSES: { [key: string]: number } = {
    'C': 0, 'B#': 0, 'BS': 0, 'C#': 1, 'DB': 1, 'CS': 1, 'D': 2, 'D#': 3, 'EB': 3, 'DS': 3,
    'E': 4, 'FB': 4, 'F': 5, 'E#': 5, 'ES': 5, 'F#': 6, 'GB': 6, 'FS': 6, 'G': 7,
    'G#': 8, 'AB': 8, 'GS': 8, 'A': 9, 'A#': 10, 'BB': 10, 'AS': 10, 'B': 11, 'CB': 11,
};
const NOTES_ARRAY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DEFAULT_MIDI_NOTE = 60; // C4

function robustNoteToMidi(noteNameWithOctave: string): number {
    if (typeof noteNameWithOctave !== 'string') return DEFAULT_MIDI_NOTE;
    const match = noteNameWithOctave.match(/([A-G])([#bSsxBF]*)(-?[0-9]+)/i);
    if (!match) {
        const simpleMatch = noteNameWithOctave.match(/([A-G])([#bSsxBF]*)/i);
        if (simpleMatch) {
            return robustNoteToMidi(noteNameWithOctave + '4');
        }
        // console.warn(`[robustNoteToMidi_WARN] Invalid note format: '${noteNameWithOctave}', defaulting to C4.`);
        return DEFAULT_MIDI_NOTE;
    }
    let pitchClassName = match[1].toUpperCase();
    const accidentals = match[2]?.toUpperCase() || '';
    const octave = parseInt(match[3], 10);
    if (isNaN(octave)) {
        // console.warn(`[robustNoteToMidi_WARN] Invalid octave in note: '${noteNameWithOctave}', defaulting to C4.`);
        return DEFAULT_MIDI_NOTE;
    }
    let fullPitchName = pitchClassName;
    if (accidentals.includes('#') || accidentals.includes('S')) fullPitchName += '#';
    else if (accidentals.includes('B') || (accidentals.includes('F') && pitchClassName !== 'F' && pitchClassName !== 'B')) fullPitchName += 'B';

    let effectiveOctave = octave;
    if (fullPitchName === 'E#') { fullPitchName = 'F'; }
    else if (fullPitchName === 'B#') { fullPitchName = 'C'; effectiveOctave = octave + 1; }
    else if (fullPitchName === 'CB') { fullPitchName = 'B'; effectiveOctave = octave - 1; }
    else if (fullPitchName === 'FB') { fullPitchName = 'E'; }

    let midiNumberBase = PITCH_CLASSES[fullPitchName];
    if (midiNumberBase === undefined) {
        midiNumberBase = PITCH_CLASSES[pitchClassName];
        if (midiNumberBase !== undefined) {
            for (const char of accidentals) {
                if (char === '#' || char === 'S') midiNumberBase = (midiNumberBase + 1);
                else if (char === 'B' || char === 'F') midiNumberBase = (midiNumberBase - 1);
            }
            midiNumberBase = (midiNumberBase % 12 + 12) % 12;
        } else {
            // console.warn(`[robustNoteToMidi_WARN] Unknown base pitch class: '${pitchClassName}' from '${noteNameWithOctave}', defaulting to C4.`);
            return DEFAULT_MIDI_NOTE;
        }
    }
    const finalMidiNumber = midiNumberBase + (effectiveOctave + 1) * 12;
    return (finalMidiNumber >= 0 && finalMidiNumber <= 127) ? finalMidiNumber : DEFAULT_MIDI_NOTE;
}

function midiToNoteName(midiNumber: number): string {
    if (typeof midiNumber !== 'number' || isNaN(midiNumber) || midiNumber < 0 || midiNumber > 127) {
        // console.warn(`[midiToNoteName_WARN] Invalid MIDI number ${midiNumber}, defaulting to C4.`);
        midiNumber = DEFAULT_MIDI_NOTE;
    }
    const octave = Math.floor(midiNumber / 12) - 1;
    const noteIndex = midiNumber % 12;
    if (noteIndex < 0 || noteIndex >= NOTES_ARRAY.length) {
    //   console.warn(`[midiToNoteName_WARN] Invalid note index ${noteIndex} from MIDI ${midiNumber}, defaulting to C4.`);
      return 'C4';
    }
    return NOTES_ARRAY[noteIndex] + octave;
}

function getScaleNoteNames(keySignature: string, mode: string, startOctave: number = 4): string[] {
    const baseKeyForScale = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const rootMidiBase = robustNoteToMidi(baseKeyForScale + '0') % 12;

    let intervals: number[];
    if (mode.toLowerCase().includes('minor')) {
        intervals = [0, 2, 3, 5, 7, 8, 10]; // Natural Minor
    } else {
        intervals = [0, 2, 4, 5, 7, 9, 11]; // Major
    }

    return intervals.map(interval => {
        const currentMidiValue = rootMidiBase + interval;
        const octaveOffset = Math.floor(currentMidiValue / 12);
        const noteMidiNumber = (currentMidiValue % 12) + (startOctave + octaveOffset + 1) * 12;
        return midiToNoteName(noteMidiNumber);
    });
}

function getChordNotesForKey(keySignature: string, mode: string, degree: number, octave: number = 3): string[] {
    const rootNoteName = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const scaleNoteNames = getScaleNoteNames(rootNoteName, mode, octave); // Get scale notes starting from chord octave
    if (scaleNoteNames.length < 7) return [midiToNoteName(DEFAULT_MIDI_NOTE + (octave - 4) * 12)];


    // Determine the root note of the chord based on the degree in the key
    const chordRootInScaleOctave = scaleNoteNames[(degree - 1 + 7) % 7]; // Get the name like "C4", "G3" etc.
    const chordRootMidi = robustNoteToMidi(chordRootInScaleOctave); // Get its MIDI number

    // Ensure the chord root is actually in the target `octave` for consistency
    const desiredChordRootName = midiToNoteName( (robustNoteToMidi(chordRootInScaleOctave + '0') % 12) + (octave+1)*12);
    const finalChordRootMidi = robustNoteToMidi(desiredChordRootName);


    let thirdInterval = 4; // Major third
    let fifthInterval = 7; // Perfect fifth
    const isMinorKey = mode.toLowerCase().includes('minor');

    // Basic diatonic chord qualities for major key (adjustments for minor key)
    if (isMinorKey) { // Using harmonic minor for V typically, but let's keep it simple for now with natural minor qualities
        switch (degree) {
            case 1: thirdInterval = 3; break; // i (minor)
            case 2: thirdInterval = 3; fifthInterval = 6; break; // ii° (diminished)
            case 3: thirdInterval = 4; break; // III (major) - relative major
            case 4: thirdInterval = 3; break; // iv (minor)
            case 5: thirdInterval = 3; break; // v (minor) - natural minor's v
            // case 5: thirdInterval = 4; break; // V (Major) - if using harmonic minor for dominant
            case 6: thirdInterval = 4; break; // VI (major)
            case 7: thirdInterval = 4; break; // VII (major)
            default: break;
        }
    } else { // Major key
        switch (degree) {
            case 1: thirdInterval = 4; break; // I (Major)
            case 2: thirdInterval = 3; break; // ii (minor)
            case 3: thirdInterval = 3; break; // iii (minor)
            case 4: thirdInterval = 4; break; // IV (Major)
            case 5: thirdInterval = 4; break; // V (Major)
            case 6: thirdInterval = 3; break; // vi (minor)
            case 7: thirdInterval = 3; fifthInterval = 6; break; // vii° (diminished)
            default: break;
        }
    }

    return [
        midiToNoteName(finalChordRootMidi),
        midiToNoteName(finalChordRootMidi + thirdInterval),
        midiToNoteName(finalChordRootMidi + fifthInterval)
    ].filter(name => name !== undefined && name !== null) as string[];
}

const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genre: string = '',
  isKidsMode: boolean = false,
): any => {
  const genreLower = genre.toLowerCase();
  const hintsLower = instrumentHints.map(h => h.toLowerCase());

  let configs: any = {
    melody: { oscillator: { type: 'fmsine' as const, harmonicity: 1.8, modulationIndex: 6, modulationType: "triangle" as const }, envelope: { attack: 0.025, decay: 0.35, sustain: 0.5, release: 0.75 }, volume: -6 },
    bass: { oscillator: { type: 'fmsine' as const, harmonicity: 1.0, modulationIndex: 2.5 }, envelope: { attack: 0.015, decay: 0.2, sustain: 0.8, release: 0.6 }, volume: -9 },
    chords: { oscillator: { type: 'amtriangle' as const, harmonicity: 0.6, modulationType: "sine" as const }, volume: -18, envelope: { attack: 0.2, decay: 0.7, sustain: 0.3, release: 1.4 } },
    arpeggio: { oscillator: { type: SAFE_OSC_TYPE, partials: [1, 0.18, 0.04] }, envelope: { attack: 0.012, decay: 0.12, sustain: 0.08, release: 0.18 }, volume: -22 },
    kick: { pitchDecay: 0.035, octaves: 5.5, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.28, sustain: 0.005, release: 0.9, attackCurve: "exponential" as const }, volume: -4 },
    snare: { noise: { type: 'pink' as const, playbackRate: 0.75 }, volume: -11, envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.1 } },
    hiHat: { frequency: 380, envelope: { attack: 0.001, decay: 0.025, release: 0.025 }, harmonicity: 3.2, modulationIndex: 12, resonance: 2300, octaves: 1.0, volume: -16 },
    piano: {
        harmonicity: 2.8, modulationIndex: 12,
        oscillator: { type: "fmsine" as const, partials: [1, 0.35, 0.12, 0.07, 0.025] },
        envelope: { attack: 0.01, decay: 0.55, sustain: 0.04, release: 0.75 },
        modulation: { type: "square" as const },
        modulationEnvelope: { attack: 0.012, decay: 0.25, sustain: 0.004, release: 0.45 },
        volume: -9
    }
  };

  if (isKidsMode) {
    configs.melody = { oscillator: { type: 'triangle' as const }, envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.4 }, volume: -3 };
    configs.bass = { oscillator: { type: 'sine' as const }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.3 }, volume: -6 };
    configs.chords = { oscillator: { type: 'square' as const }, envelope: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 }, volume: -14 };
    configs.arpeggio = { oscillator: { type: 'sawtooth' as const }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.2 }, volume: -18 };
    configs.kick.volume = -3;
    configs.snare.volume = -9;
    configs.hiHat.volume = -15;
    if (hintsLower.some(h => h.includes('piano') || h.includes('toy piano'))) {
        configs.melody = { ...configs.piano, volume: -6 };
        configs.chords = { ...configs.piano, volume: -16 };
    }
  } else {
     if (hintsLower.some(h => h.includes('piano'))) {
        configs.melody = { ...configs.piano, volume: -6 };
        configs.chords = { ...configs.piano, volume: -12 };
    } else if (genreLower.includes('electronic') || genreLower.includes('pop')) {
      configs.melody.oscillator.type = 'fatsawtooth' as const; ((configs.melody.oscillator) as any).count = 3; ((configs.melody.oscillator) as any).spread = 15; configs.melody.volume = -6;
      configs.bass = { oscillator: {type: 'fatsquare' as const, count: 2, spread: 18}, envelope: { attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.5 }, volume: -7 };
      configs.chords.oscillator.type = 'fatsawtooth' as const; ((configs.chords.oscillator) as any).count = 4; ((configs.chords.oscillator) as any).spread = 35; configs.chords.volume = -20;
      configs.arpeggio.oscillator.type = SAFE_OSC_TYPE; configs.arpeggio.volume = -24;
    } else if (genreLower.includes('rock') || genreLower.includes('metal')) {
      configs.melody.oscillator.type = 'fatsawtooth' as const; ((configs.melody.oscillator) as any).count = 2; ((configs.melody.oscillator) as any).spread = 18; configs.melody.envelope.attack = 0.01; configs.melody.volume = -6;
      configs.bass = { oscillator: {type: 'fatsquare' as const, count: 2, spread: 20}, envelope: { attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.6 }, volume: -8 };
      configs.chords.oscillator.type = 'fatsquare' as const; ((configs.chords.oscillator) as any).count = 3; ((configs.chords.oscillator) as any).spread = 22; configs.chords.volume = -18;
      configs.kick.volume = -1;
      configs.snare.volume = -7;
    } else if (genreLower.includes('jazz')) {
      configs.melody = { ...configs.piano, volume: -6 };
      configs.bass.oscillator.type = 'sine' as const; configs.bass.envelope = { attack: 0.005, decay: 0.1, sustain: 0.9, release: 0.4 }; configs.bass.volume = -9;
      configs.chords = { ...configs.piano, volume: -16 };
      configs.kick.volume = -9;
      configs.snare.volume = -12;
      configs.hiHat.volume = -18;
    }
  }
  return configs;
};


export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  const logPrefix = "[WAV_GEN_DIRECT_REVERB_M_B_C_A_DRUMS_MELODY_ENHANCED]";
  console.log(`${logPrefix} Starting direct synthesis for: ${params.generatedIdea.substring(0, 30)}...`);

  if (Tone.context.state !== 'running') {
    console.error(`${logPrefix}_ERROR] Global Tone.context is NOT 'running'. Aborting WAV generation.`);
    return null;
  }
  console.log(`${logPrefix} Global Tone.context state is 'running'.`);

  Tone.Transport.stop(true);
  Tone.Transport.cancel(0);
  console.log(`${logPrefix} Global Tone.Transport cleared and stopped.`);
  Tone.Destination.volume.value = 0; 
  console.log(`${logPrefix} Global Tone.Destination volume set to ${Tone.Destination.volume.value}dB.`);
  Tone.Transport.bpm.value = params.tempoBpm || 120;
  console.log(`${logPrefix} Transport BPM set to: ${Tone.Transport.bpm.value}`);

  const synthConfigs = getSynthConfigurations(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids');

  const startOffset = 0.2; // Start audio slightly after t=0
  const secondsPerBeat = 60 / (params.tempoBpm || 120);
  const beatsPerMeasure = 4;
  const measureDurationSeconds = beatsPerMeasure * secondsPerBeat;
  let overallMaxTime = startOffset;

  // --- Chord Progression Setup (used by multiple parts) ---
  const progressionDegrees = [1, 5, 6, 4]; // I-V-vi-IV
  const numChordCycles = 2; // Play progression twice
  const chordDurationNotation = "1m"; // Each chord lasts one measure
  const chordDurationSeconds = Tone.Time(chordDurationNotation).toSeconds(); // == measureDurationSeconds

  // --- Melody Generation (Enhanced) ---
  const melodyNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const melodyOctave = params.originalInput.mode === 'kids' ? 5 : 4;
  const scaleNoteNames = getScaleNoteNames(params.keySignature, params.mode, melodyOctave);
  let melodyCurrentTime = startOffset;
  let currentMelodyScaleIndex = 0; // Start on the root

  const totalMelodyDurationSeconds = numChordCycles * progressionDegrees.length * measureDurationSeconds;
  // console.log(`${logPrefix}_ALGO_MELODY] Target total melody duration: ${totalMelodyDurationSeconds.toFixed(2)}s`);

  if (scaleNoteNames.length > 0) {
      while (melodyCurrentTime < totalMelodyDurationSeconds) {
          let noteDurationNotation: string;
          const density = params.rhythmicDensity || 0.5;

          if (density < 0.33) { // Slower, longer notes
              noteDurationNotation = weightedRandom(["4n", "8n", "2n"], [0.6, 0.3, 0.1]);
          } else if (density < 0.66) { // Medium
              noteDurationNotation = weightedRandom(["8n", "4n", "16n"], [0.5, 0.3, 0.2]);
          } else { // Faster, shorter notes
              noteDurationNotation = weightedRandom(["16n", "8n", "8t"], [0.6, 0.3, 0.1]);
          }
          
          let noteDurationSec = Tone.Time(noteDurationNotation).toSeconds();

          if (melodyCurrentTime + noteDurationSec > totalMelodyDurationSeconds + TIME_EPSILON) {
              noteDurationSec = totalMelodyDurationSeconds - melodyCurrentTime;
              if (noteDurationSec <= TIME_EPSILON * 2) break; 

              if (noteDurationSec >= Tone.Time("2n").toSeconds() - TIME_EPSILON) noteDurationNotation = "2n";
              else if (noteDurationSec >= Tone.Time("4n").toSeconds() - TIME_EPSILON) noteDurationNotation = "4n";
              else if (noteDurationSec >= Tone.Time("8n").toSeconds() - TIME_EPSILON) noteDurationNotation = "8n";
              else if (noteDurationSec >= Tone.Time("16n").toSeconds() - TIME_EPSILON) noteDurationNotation = "16n";
              else break; 
              noteDurationSec = Tone.Time(noteDurationNotation).toSeconds();
          }
          if (melodyCurrentTime >= totalMelodyDurationSeconds) break;

          const restProbability = 0.2 - (density * 0.15);
          if (Math.random() < restProbability && melodyCurrentTime > startOffset + secondsPerBeat * 0.5) {
              let restDurationNotation = density < 0.5 ? "8n" : "16n";
              if (noteDurationNotation === "2n" || noteDurationNotation === "1m") restDurationNotation = "4n";
              
              const restDurationSec = Tone.Time(restDurationNotation).toSeconds();
               if (melodyCurrentTime + restDurationSec <= totalMelodyDurationSeconds + TIME_EPSILON) {
                  melodyCurrentTime += restDurationSec;
                  if (melodyCurrentTime >= totalMelodyDurationSeconds) break;
                  continue;
              }
          }

          const stepRoll = Math.random();
          let step: number;
          if (stepRoll < 0.65) { 
              step = Math.random() < 0.5 ? 1 : -1;
          } else if (stepRoll < 0.9) { 
              step = Math.random() < 0.5 ? 2 : -2;
          } else { 
              step = Math.random() < 0.5 ? 3 : -3;
          }
          
          currentMelodyScaleIndex = (currentMelodyScaleIndex + step + scaleNoteNames.length * 7) % scaleNoteNames.length;
          const noteName = scaleNoteNames[currentMelodyScaleIndex];
          const velocity = 0.65 + Math.random() * 0.15; // Velocity between 0.65 and 0.8

          if (melodyNotesToSchedule.length > 0) {
              const lastNoteEv = melodyNotesToSchedule[melodyNotesToSchedule.length - 1];
              if (melodyCurrentTime < lastNoteEv.time + Tone.Time(lastNoteEv.duration).toSeconds() * 0.5 ) { // Ensure some separation
                melodyCurrentTime = lastNoteEv.time + Tone.Time(lastNoteEv.duration).toSeconds() * 0.5 + TIME_EPSILON;
              }
              if (melodyCurrentTime < lastNoteEv.time + TIME_EPSILON ) { // Stricter check for same time
                 melodyCurrentTime = lastNoteEv.time + TIME_EPSILON;
              }
          }
          if (melodyCurrentTime >= totalMelodyDurationSeconds) break;
          
          melodyNotesToSchedule.push({ time: melodyCurrentTime, note: noteName, duration: noteDurationNotation, velocity });
          overallMaxTime = Math.max(overallMaxTime, melodyCurrentTime + noteDurationSec);
          melodyCurrentTime += noteDurationSec;
      }
  }
//   console.log(`${logPrefix}_ALGO_MELODY] Generated ${melodyNotesToSchedule.length} dynamic melody notes.`);


  // --- Bass Line Generation ---
  const bassNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const bassOctave = params.originalInput.mode === 'kids' ? 3 : 2;
  const bassNoteDurationNotation = "2n";
  const bassNoteDurationSeconds = Tone.Time(bassNoteDurationNotation).toSeconds();
  let bassCurrentTime = startOffset;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (const degree of progressionDegrees) {
      const chordNotesForBassRoot = getChordNotesForKey(params.keySignature, params.mode, degree, bassOctave);
      if (chordNotesForBassRoot.length > 0) {
        const bassNoteName = chordNotesForBassRoot[0]; // Use the root of the chord
        bassNotesToSchedule.push({ time: bassCurrentTime, note: bassNoteName, duration: bassNoteDurationNotation, velocity: 0.6 });
        overallMaxTime = Math.max(overallMaxTime, bassCurrentTime + bassNoteDurationSeconds);
      }
      bassCurrentTime += measureDurationSeconds;
    }
  }

  // --- Chord Generation ---
  const chordEventsToSchedule: { time: number, notes: string[], duration: string, velocity: number }[] = [];
  const chordOctave = params.originalInput.mode === 'kids' ? 4 : 3;
  let chordCurrentTimeForSched = startOffset;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (const degree of progressionDegrees) {
      const chordNoteNames = getChordNotesForKey(params.keySignature, params.mode, degree, chordOctave);
      if (chordNoteNames.length > 0) {
          chordEventsToSchedule.push({ time: chordCurrentTimeForSched, notes: chordNoteNames, duration: chordDurationNotation, velocity: 0.5 });
          overallMaxTime = Math.max(overallMaxTime, chordCurrentTimeForSched + chordDurationSeconds);
      }
      chordCurrentTimeForSched += measureDurationSeconds;
    }
  }

  // --- Arpeggio Generation ---
  const arpeggioNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const arpeggioOctave = params.originalInput.mode === 'kids' ? 5 : 4;
  const arpNoteDurationNotation = "16n";
  const arpNoteDurationSeconds = Tone.Time(arpNoteDurationNotation).toSeconds();

  chordEventsToSchedule.forEach(chordEvent => {
    const currentChordNotesForArp = chordEvent.notes.map(n => midiToNoteName(robustNoteToMidi(n.replace(/[0-9]+$/, String(arpeggioOctave)))));
    if (currentChordNotesForArp.length > 0) {
      const arpPattern = [
        currentChordNotesForArp[0],
        currentChordNotesForArp[1 % currentChordNotesForArp.length],
        currentChordNotesForArp[2 % currentChordNotesForArp.length],
        currentChordNotesForArp[0 % currentChordNotesForArp.length], // Could be octave up: midiToNoteName(robustNoteToMidi(currentChordNotesForArp[0]) + 12)
      ];
      for (let beat = 0; beat < 2; beat++) { // Arpeggio for first 2 beats of the measure
        for (let i = 0; i < arpPattern.length; i++) {
          const noteTime = chordEvent.time + (beat * secondsPerBeat) + (i * arpNoteDurationSeconds);
           if (noteTime < chordEvent.time + chordDurationSeconds) { // Ensure arp doesn't spill into next chord's measure too much
            arpeggioNotesToSchedule.push({ time: noteTime, note: arpPattern[i], duration: arpNoteDurationNotation, velocity: 0.4 });
            overallMaxTime = Math.max(overallMaxTime, noteTime + arpNoteDurationSeconds);
          }
        }
      }
    }
  });

  // --- Drum Generation ---
  const drumEventsToSchedule: { synth: 'kick' | 'snare' | 'hiHat', time: number, duration: string, velocity: number, pitch?: string | number}[] = [];
  const numDrumMeasures = numChordCycles * progressionDegrees.length;
  let lastKickTime = -TIME_EPSILON, lastSnareTime = -TIME_EPSILON, lastHiHatTime = -TIME_EPSILON; // Initialize to allow first event at startOffset

  for (let measure = 0; measure < numDrumMeasures; measure++) {
    for (let beat = 0; beat < beatsPerMeasure; beat++) {
      const currentTimeForDrumsThisBeat = startOffset + (measure * measureDurationSeconds) + (beat * secondsPerBeat);

      // Kick
      if (beat === 0 || beat === 2) {
        let kickTime = currentTimeForDrumsThisBeat;
        if (kickTime <= lastKickTime) kickTime = lastKickTime + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'kick', time: kickTime, duration: "8n", velocity: 0.8, pitch: "C2" });
        lastKickTime = kickTime;
      }
      // Snare
      if (beat === 1 || beat === 3) {
        let snareTime = currentTimeForDrumsThisBeat;
        if (snareTime <= lastSnareTime) snareTime = lastSnareTime + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'snare', time: snareTime, duration: "16n", velocity: 0.7 });
        lastSnareTime = snareTime;
      }
      // Hi-Hat
      const hiHatSubdivisions = params.rhythmicDensity < 0.4 ? 1 : (params.rhythmicDensity < 0.7 ? 2 : 4);
      const hiHatDurationNotation = hiHatSubdivisions === 1 ? "4n" : (hiHatSubdivisions === 2 ? "8n" : "16n");
      for (let subBeat = 0; subBeat < hiHatSubdivisions; subBeat++) {
        let hiHatTime = currentTimeForDrumsThisBeat + (subBeat * (secondsPerBeat / hiHatSubdivisions));
        if (hiHatTime <= lastHiHatTime) hiHatTime = lastHiHatTime + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'hiHat', time: hiHatTime, duration: hiHatDurationNotation, velocity: 0.5, pitch: synthConfigs.hiHat.frequency || 300 });
        lastHiHatTime = hiHatTime;
      }
    }
  }
  drumEventsToSchedule.forEach(ev => {
      overallMaxTime = Math.max(overallMaxTime, ev.time + Tone.Time(ev.duration).toSeconds());
  });
  
  const renderDuration = Math.max(overallMaxTime + 2.5, MIN_EFFECTIVE_DURATION_SECONDS); // Add tail
  console.log(`${logPrefix} Calculated renderDuration: ${renderDuration.toFixed(2)}s.`);

  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      // console.log(`${logPrefix}_OFFLINE] Inside Tone.Offline. Offline Context SR: ${offlineContext.sampleRate}`);
      offlineContext.transport.bpm.value = Tone.Transport.bpm.value;

      const reverb = new Tone.Reverb(1.2).connect(offlineContext.destination);
      await reverb.ready;
      // console.log(`${logPrefix}_OFFLINE] Reverb created and ready.`);

      const melodySynth = new Tone.PolySynth(Tone.FMSynth, synthConfigs.melody).connect(reverb);
      melodySynth.volume.value = synthConfigs.melody.volume !== undefined ? synthConfigs.melody.volume : -6;
    //   console.log(`${logPrefix}_OFFLINE] MelodySynth (FMSynth) created. Volume: ${melodySynth.volume.value}`);
    //   console.log(`${logPrefix}_OFFLINE] Scheduling ${melodyNotesToSchedule.length} melody notes.`);
      melodyNotesToSchedule.forEach((ev) => melodySynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));

      const bassSynth = new Tone.Synth(synthConfigs.bass).connect(offlineContext.destination); // Bass direct to output
    //   console.log(`${logPrefix}_OFFLINE] BassSynth created. Volume: ${bassSynth.volume.value}`);
    //   console.log(`${logPrefix}_OFFLINE] Scheduling ${bassNotesToSchedule.length} bass notes.`);
      bassNotesToSchedule.forEach((ev) => bassSynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));

      const chordSynth = new Tone.PolySynth(Tone.FMSynth, synthConfigs.chords).connect(reverb);
      chordSynth.volume.value = synthConfigs.chords.volume !== undefined ? synthConfigs.chords.volume : -12;
    //   console.log(`${logPrefix}_OFFLINE] ChordSynth (FMSynth) created. Volume: ${chordSynth.volume.value}`);
    //   console.log(`${logPrefix}_OFFLINE] Scheduling ${chordEventsToSchedule.length} chord events.`);
      chordEventsToSchedule.forEach((ev) => chordSynth.triggerAttackRelease(ev.notes, ev.duration, ev.time, ev.velocity));

      const arpeggioSynth = new Tone.PolySynth(Tone.FMSynth, synthConfigs.arpeggio).connect(reverb);
      arpeggioSynth.volume.value = synthConfigs.arpeggio.volume !== undefined ? synthConfigs.arpeggio.volume : -15;
    //   console.log(`${logPrefix}_OFFLINE] ArpeggioSynth (FMSynth) created. Volume: ${arpeggioSynth.volume.value}`);
    //   console.log(`${logPrefix}_OFFLINE] Scheduling ${arpeggioNotesToSchedule.length} arpeggio notes.`);
      arpeggioNotesToSchedule.forEach((ev) => arpeggioSynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));

    //   console.log(`${logPrefix}_OFFLINE] Setting up drum synths.`);
      const kickSynth = new Tone.MembraneSynth(synthConfigs.kick).connect(offlineContext.destination);
      const snareSynth = new Tone.NoiseSynth(synthConfigs.snare).connect(offlineContext.destination);
      const hiHatSynth = new Tone.MetalSynth(synthConfigs.hiHat).connect(offlineContext.destination);
    //   console.log(`${logPrefix}_OFFLINE] Drum synths created and connected to offlineContext.destination.`);
    //   console.log(`${logPrefix}_OFFLINE] Scheduling ${drumEventsToSchedule.length} drum events.`);

      drumEventsToSchedule.forEach(ev => {
        const { synth, time, duration, velocity, pitch } = ev;
        // console.log(`${logPrefix}_OFFLINE_DRUM_EVENT] Synth=${synth}, Time=${time.toFixed(3)}, Dur=${duration}, Vel=${velocity.toFixed(2)}, Pitch=${pitch}`);
        if (synth === 'kick') {
          if (pitch) kickSynth.triggerAttackRelease(pitch as string, duration, time, velocity);
        } else if (synth === 'snare') {
          snareSynth.triggerAttackRelease(duration, time, velocity);
        } else if (synth === 'hiHat') {
          hiHatSynth.triggerAttackRelease(
            typeof pitch === 'number' ? pitch : (synthConfigs.hiHat.frequency || 300),
            duration,
            time,
            velocity
          );
        }
      });

    }, renderDuration);

    // console.log(`${logPrefix} Tone.Offline rendering complete. AudioBuffer duration: ${audioBuffer.duration.toFixed(3)}s`);

    let isSilent = true; let maxVal = 0;
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      const channelData = audioBuffer.getChannelData(i);
      for (let j = 0; j < channelData.length; j++) {
        if (Math.abs(channelData[j]) > 1e-5) { isSilent = false; }
        if (Math.abs(channelData[j]) > maxVal) { maxVal = Math.abs(channelData[j]); }
      }
    //   if (!isSilent) console.log(`${logPrefix}_OFFLINE] Channel ${i} max absolute value: ${maxVal.toExponential(3)}`);
    //   if (!isSilent) break;
    }

    // if (isSilent) console.warn(`${logPrefix}_WARN] Rendered AudioBuffer appears to be silent or very quiet.`);
    // else console.log(`${logPrefix} Rendered AudioBuffer contains non-zero samples.`);

    const wavDataBuffer = audioBufferToWav(audioBuffer);
    // console.log(`${logPrefix} WAV data buffer created. Size: ${wavDataBuffer.byteLength} bytes.`);
    return new Blob([wavDataBuffer], { type: 'audio/wav' });

  } catch (error) {
    console.error(`${logPrefix}_ERROR] Error during WAV generation process:`, error);
    if (error instanceof Error) {
        console.error(`${logPrefix}_ERROR_DETAILS] Name: ${error.name}, Message: ${error.message}, Stack: ${error.stack}`);
    }
    return null;
  }
};
