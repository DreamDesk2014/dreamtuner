'use client';
import * as Tone from 'tone';
import type { MusicParameters } from '@/types';
import { audioBufferToWav } from "./audioBufferToWav";

const SAFE_OSC_TYPE = 'triangle' as const;
const MIN_EFFECTIVE_DURATION_SECONDS = 4.0;
const TIME_EPSILON = 0.00001; // Small offset to ensure unique times

// Helper function for weighted random choice
function weightedRandom(items: string[], weights: number[]): string {
    let sum = 0;
    const r = Math.random();
    for (let i = 0; i < items.length; i++) {
        if (weights[i] < 0) continue;
        sum += weights[i];
        if (r <= sum) return items[i];
    }
    return items.find(item => (weights[items.indexOf(item)] ?? 0) > 0) || items[items.length - 1] || "4n";
}

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
        return DEFAULT_MIDI_NOTE;
    }
    let pitchClassName = match[1].toUpperCase();
    const accidentals = match[2]?.toUpperCase() || '';
    const octave = parseInt(match[3], 10);
    if (isNaN(octave)) return DEFAULT_MIDI_NOTE;

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
            return DEFAULT_MIDI_NOTE;
        }
    }
    const finalMidiNumber = midiNumberBase + (effectiveOctave + 1) * 12;
    return (finalMidiNumber >= 0 && finalMidiNumber <= 127) ? finalMidiNumber : DEFAULT_MIDI_NOTE;
}

function midiToNoteName(midiNumber: number): string {
    if (typeof midiNumber !== 'number' || isNaN(midiNumber) || midiNumber < 0 || midiNumber > 127) {
        midiNumber = DEFAULT_MIDI_NOTE;
    }
    const octave = Math.floor(midiNumber / 12) - 1;
    const noteIndex = midiNumber % 12;
    if (noteIndex < 0 || noteIndex >= NOTES_ARRAY.length) return 'C4';
    return NOTES_ARRAY[noteIndex] + octave;
}

function getScaleNoteNames(keySignature: string, mode: string, startOctave: number = 4): string[] {
    const baseKeyForScale = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const rootMidiBase = robustNoteToMidi(baseKeyForScale + '0') % 12;

    let intervals: number[];
    if (mode.toLowerCase().includes('minor')) {
        intervals = [0, 2, 3, 5, 7, 8, 10];
    } else {
        intervals = [0, 2, 4, 5, 7, 9, 11];
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
    const scaleNoteNames = getScaleNoteNames(rootNoteName, mode, octave);
    if (scaleNoteNames.length < 7) return [midiToNoteName(DEFAULT_MIDI_NOTE + (octave - 4) * 12)];

    const chordRootInScaleOctave = scaleNoteNames[(degree - 1 + 7) % 7];
    const desiredChordRootName = midiToNoteName((robustNoteToMidi(chordRootInScaleOctave + '0') % 12) + (octave + 1) * 12);
    const finalChordRootMidi = robustNoteToMidi(desiredChordRootName);

    let thirdInterval = 4; let fifthInterval = 7;
    const isMinorKey = mode.toLowerCase().includes('minor');

    if (isMinorKey) {
        switch (degree) {
            case 1: thirdInterval = 3; break;
            case 2: thirdInterval = 3; fifthInterval = 6; break;
            case 3: thirdInterval = 4; break;
            case 4: thirdInterval = 3; break;
            case 5: thirdInterval = 3; break;
            case 6: thirdInterval = 4; break;
            case 7: thirdInterval = 4; break;
        }
    } else {
        switch (degree) {
            case 1: thirdInterval = 4; break;
            case 2: thirdInterval = 3; break;
            case 3: thirdInterval = 3; break;
            case 4: thirdInterval = 4; break;
            case 5: thirdInterval = 4; break;
            case 6: thirdInterval = 3; break;
            case 7: thirdInterval = 3; fifthInterval = 6; break;
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

  const baseConfigs = {
    defaultMelody: { synthType: Tone.FMSynth, options: { harmonicity: 1.8, modulationIndex: 6, modulationType: "triangle" as const, envelope: { attack: 0.025, decay: 0.35, sustain: 0.5, release: 0.75 } }, volume: -9 },
    defaultBass: { synthType: Tone.FMSynth, options: { harmonicity: 1.0, modulationIndex: 2.5, envelope: { attack: 0.015, decay: 0.2, sustain: 0.8, release: 0.6 } }, volume: -9 },
    defaultChords: { synthType: Tone.PolySynth, subType: Tone.AMSynth, options: { harmonicity: 0.6, modulationType: "sine" as const, envelope: { attack: 0.2, decay: 0.7, sustain: 0.3, release: 1.4 } }, volume: -20 },
    defaultArpeggio: { synthType: Tone.FMSynth, options: { oscillator: { type: SAFE_OSC_TYPE, partials: [1, 0.18, 0.04] }, envelope: { attack: 0.012, decay: 0.12, sustain: 0.08, release: 0.18 } }, volume: -24 },
    
    pianoMelody: { synthType: Tone.PolySynth, subType: Tone.FMSynth, options: { harmonicity: 2.8, modulationIndex: 12, oscillator: { type: "fmsine", partials: [1, 0.35, 0.12, 0.07, 0.025] }, envelope: { attack: 0.01, decay: 0.55, sustain: 0.04, release: 0.75 }, modulation: { type: "square" }, modulationEnvelope: { attack: 0.012, decay: 0.25, sustain: 0.004, release: 0.45 } }, volume: -9 },
    electricPianoChords: { synthType: Tone.PolySynth, subType: Tone.FMSynth, options: { harmonicity: 3.5, modulationIndex: 10, envelope: { attack: 0.02, decay: 0.8, sustain: 0.1, release: 0.9 } }, volume: -18 },
    warmPadChords: { synthType: Tone.PolySynth, subType: Tone.AMSynth, options: { harmonicity: 0.7, modulationType: "sine", envelope: { attack: 0.8, decay: 1.5, sustain: 0.6, release: 2.5 } }, volume: -22 },
    pluckArp: { synthType: Tone.PluckSynth, options: { attackNoise: 0.8, dampening: 3000, resonance: 0.85 }, volume: -18 },
    synthLeadElectronic: { synthType: Tone.Synth, options: { oscillator: { type: "fatsawtooth", count: 3, spread: 20 }, envelope: { attack: 0.01, decay: 0.8, sustain: 0.2, release: 0.5 } }, volume: -10 },
    subBassElectronic: { synthType: Tone.Synth, options: { oscillator: { type: "sine" }, envelope: { attack: 0.01, decay: 0.3, sustain: 1, release: 0.5 } }, volume: -6 },
    rockGuitarLead: { synthType: Tone.Synth, options: { oscillator: { type: "fatsquare", count: 2, spread: 15 }, envelope: { attack: 0.005, decay: 0.5, sustain: 0.1, release: 0.3 } }, volume: -10, effects: [{type: Tone.Distortion, amount: 0.3}] }, // Example effect
    acousticGuitarArp: { synthType: Tone.PluckSynth, options: { attackNoise: 1, dampening: 4000, resonance: 0.7 }, volume: -15 },


    kick: { pitchDecay: 0.035, octaves: 5.5, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.28, sustain: 0.005, release: 0.9, attackCurve: "exponential" as const }, volume: -6 },
    snare: { noise: { type: 'pink' as const, playbackRate: 0.75 }, volume: -12, envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.1 } },
    hiHat: { frequency: 380, envelope: { attack: 0.001, decay: 0.025, release: 0.025 }, harmonicity: 3.2, modulationIndex: 12, resonance: 2300, octaves: 1.0, volume: -18 },
  };

  let finalConfigs = {
    melody: { ...baseConfigs.defaultMelody },
    bass: { ...baseConfigs.defaultBass },
    chords: { ...baseConfigs.defaultChords },
    arpeggio: { ...baseConfigs.defaultArpeggio },
    kick: { ...baseConfigs.kick },
    snare: { ...baseConfigs.snare },
    hiHat: { ...baseConfigs.hiHat },
  };

  if (isKidsMode) {
    finalConfigs.melody = { synthType: Tone.Synth, options: { oscillator: { type: 'triangle' as const }, envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.4 } }, volume: -6 };
    finalConfigs.bass = { synthType: Tone.Synth, options: { oscillator: { type: 'sine' as const }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.3 } }, volume: -9 };
    finalConfigs.chords = { synthType: Tone.PolySynth, subType: Tone.Synth, options: { oscillator: { type: 'square' as const }, envelope: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 } }, volume: -18 };
    finalConfigs.arpeggio = { synthType: Tone.Synth, options: { oscillator: { type: 'sawtooth' as const }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.2 } }, volume: -22 };
    if (hintsLower.some(h => h.includes('piano') || h.includes('toy piano'))) {
        finalConfigs.melody = { ...baseConfigs.pianoMelody, volume: -8 };
        finalConfigs.chords = { ...baseConfigs.pianoMelody, volume: -20 }; // Use melody piano for chords too
    }
    return finalConfigs;
  }

  // Genre-based adjustments
  if (genreLower.includes("electronic") || genreLower.includes("pop")) {
    finalConfigs.melody = { ...baseConfigs.synthLeadElectronic };
    finalConfigs.bass = { ...baseConfigs.subBassElectronic };
    finalConfigs.chords = { ...baseConfigs.warmPadChords, volume: -20 };
    finalConfigs.arpeggio = { ...baseConfigs.pluckArp, volume: -22 };
    finalConfigs.kick.volume = -4;
    finalConfigs.snare.volume = -10;
  } else if (genreLower.includes("rock") || genreLower.includes("metal")) {
    finalConfigs.melody = { ...baseConfigs.rockGuitarLead };
    finalConfigs.bass = { synthType: Tone.Synth, options: { oscillator: {type: 'fatsquare' as const, count: 2, spread: 20}, envelope: { attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.6 } }, volume: -9 };
    finalConfigs.chords = { synthType: Tone.PolySynth, subType: Tone.Synth, options: { oscillator: { type: 'fatsquare' as const, count: 3, spread: 22 }, envelope: { attack: 0.02, decay: 0.6, sustain: 0.2, release: 0.4 } }, volume: -18 };
    finalConfigs.kick.volume = -2;
    finalConfigs.snare.volume = -8;
  } else if (genreLower.includes("jazz")) {
    finalConfigs.melody = { ...baseConfigs.pianoMelody, volume: -8 };
    finalConfigs.bass = { synthType: Tone.Synth, options: { oscillator: { type: 'sine' as const }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.9, release: 0.4 } }, volume: -10 };
    finalConfigs.chords = { ...baseConfigs.electricPianoChords, volume: -18 };
    finalConfigs.kick.volume = -10;
    finalConfigs.snare.volume = -15;
    finalConfigs.hiHat.volume = -20;
  } else if (genreLower.includes("ambient")) {
      finalConfigs.melody = { ...baseConfigs.warmPadChords, synthType: Tone.PolySynth, subType: Tone.AMSynth, volume: -15 }; // Use pad for melody
      finalConfigs.bass = { ...baseConfigs.subBassElectronic, volume: -12 };
      finalConfigs.chords = { ...baseConfigs.warmPadChords, volume: -18 };
      finalConfigs.arpeggio = { ...baseConfigs.defaultArpeggio, volume: -26, options: {...baseConfigs.defaultArpeggio.options, envelope: { attack: 0.1, decay: 0.5, sustain: 0.1, release: 1.0}}};
  } else if (genreLower.includes("folk")) {
      finalConfigs.melody = { ...baseConfigs.acousticGuitarArp, synthType: Tone.PluckSynth, volume: -10 };
      finalConfigs.chords = { ...baseConfigs.acousticGuitarArp, synthType: Tone.PolySynth, subType: Tone.PluckSynth, volume: -16 }; // Poly Pluck for chords
      finalConfigs.arpeggio = { ...baseConfigs.acousticGuitarArp, volume: -18 };
  }


  // Override with specific instrument hints
  hintsLower.forEach(hint => {
    if (hint.includes('piano')) {
      finalConfigs.melody = { ...baseConfigs.pianoMelody, volume: -8 };
      finalConfigs.chords = { ...baseConfigs.pianoMelody, volume: -16 }; // Use melody piano for chords
    } else if (hint.includes('electric piano')) {
      finalConfigs.chords = { ...baseConfigs.electricPianoChords };
    } else if (hint.includes('synth pad') || hint.includes('warm pad')) {
      finalConfigs.chords = { ...baseConfigs.warmPadChords };
    } else if (hint.includes('pluck') || hint.includes('bell')) {
      finalConfigs.arpeggio = { ...baseConfigs.pluckArp };
      if (!hintsLower.some(h => h.includes('piano') || h.includes('lead'))) { // Don't override melody if piano/lead already set
         finalConfigs.melody = { ...baseConfigs.pluckArp, synthType: Tone.PluckSynth, volume: -12 };
      }
    } else if (hint.includes('synth lead') || hint.includes('bright synth')) {
      finalConfigs.melody = { ...baseConfigs.synthLeadElectronic };
    } else if (hint.includes('guitar') && hint.includes('acoustic')) {
        finalConfigs.melody = {...baseConfigs.acousticGuitarArp, synthType: Tone.PluckSynth, volume: -10};
        finalConfigs.arpeggio = {...baseConfigs.acousticGuitarArp, volume: -16};
    } else if (hint.includes('guitar') && (hint.includes('rock') || hint.includes('electric'))) {
        finalConfigs.melody = {...baseConfigs.rockGuitarLead};
    } else if (hint.includes('sub bass')) {
        finalConfigs.bass = {...baseConfigs.subBassElectronic};
    }
  });

  return finalConfigs;
};


export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  const logPrefix = "[WAV_GEN_DIRECT_REVERB_M_B_C_A_DRUMS]";
  console.log(`${logPrefix} Starting direct synthesis for: ${params.generatedIdea.substring(0, 30)}...`);

  if (Tone.context.state !== 'running') {
    console.error(`${logPrefix}_ERROR] Global Tone.context is NOT 'running'. Aborting WAV generation.`);
    return null;
  }
  console.log(`${logPrefix} Global Tone.context state is 'running'.`);

  Tone.Transport.stop(true); Tone.Transport.cancel(0);
  console.log(`${logPrefix} Global Tone.Transport cleared and stopped.`);
  Tone.Destination.volume.value = -6; // Overall mix level
  console.log(`${logPrefix} Global Tone.Destination volume set to ${Tone.Destination.volume.value}dB.`);
  Tone.Transport.bpm.value = params.tempoBpm || 120;
  console.log(`${logPrefix} Transport BPM set to: ${Tone.Transport.bpm.value}`);

  const activeSynthConfigs = getSynthConfigurations(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids');

  const startOffset = 0.2;
  const secondsPerBeat = 60 / (params.tempoBpm || 120);
  const beatsPerMeasure = 4;
  const measureDurationSeconds = beatsPerMeasure * secondsPerBeat;
  let overallMaxTime = startOffset;

  const progressionDegrees = [1, 5, 6, 4];
  const numChordCycles = params.originalInput.mode === 'kids' ? 2 : 3; // Kids mode shorter
  const chordDurationNotation = "1m";
  const chordDurationSeconds = Tone.Time(chordDurationNotation).toSeconds();

  const melodyNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const melodyOctave = params.originalInput.mode === 'kids' ? 5 : 4;
  const scaleNoteNames = getScaleNoteNames(params.keySignature, params.mode, melodyOctave);
  let melodyCurrentTime = startOffset;
  let currentMelodyScaleIndex = 0;
  const totalMelodyDurationSeconds = numChordCycles * progressionDegrees.length * measureDurationSeconds;

  if (scaleNoteNames.length > 0) {
      while (melodyCurrentTime < totalMelodyDurationSeconds) {
          let noteDurationNotation: string;
          const density = params.rhythmicDensity || 0.5;
          if (density < 0.33) noteDurationNotation = weightedRandom(["4n", "8n", "2n"], [0.6, 0.3, 0.1]);
          else if (density < 0.66) noteDurationNotation = weightedRandom(["8n", "4n", "16n"], [0.5, 0.3, 0.2]);
          else noteDurationNotation = weightedRandom(["16n", "8n", "8t"], [0.6, 0.3, 0.1]);
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
          if (stepRoll < 0.65) step = Math.random() < 0.5 ? 1 : -1;
          else if (stepRoll < 0.9) step = Math.random() < 0.5 ? 2 : -2;
          else step = Math.random() < 0.5 ? 3 : -3;
          currentMelodyScaleIndex = (currentMelodyScaleIndex + step + scaleNoteNames.length * 7) % scaleNoteNames.length;
          const noteName = scaleNoteNames[currentMelodyScaleIndex];
          const velocity = 0.65 + Math.random() * 0.15;

          if (melodyNotesToSchedule.length > 0) {
              const lastNoteEv = melodyNotesToSchedule[melodyNotesToSchedule.length - 1];
              if (melodyCurrentTime < lastNoteEv.time + Tone.Time(lastNoteEv.duration).toSeconds() * 0.5 ) {
                melodyCurrentTime = lastNoteEv.time + Tone.Time(lastNoteEv.duration).toSeconds() * 0.5 + TIME_EPSILON;
              }
              if (melodyCurrentTime < lastNoteEv.time + TIME_EPSILON ) {
                 melodyCurrentTime = lastNoteEv.time + TIME_EPSILON;
              }
          }
          if (melodyCurrentTime >= totalMelodyDurationSeconds) break;
          melodyNotesToSchedule.push({ time: melodyCurrentTime, note: noteName, duration: noteDurationNotation, velocity });
          overallMaxTime = Math.max(overallMaxTime, melodyCurrentTime + noteDurationSec);
          melodyCurrentTime += noteDurationSec;
      }
  }

  const bassNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const bassOctave = params.originalInput.mode === 'kids' ? 3 : 2;
  const bassNoteDurationNotation = "2n";
  const bassNoteDurationSeconds = Tone.Time(bassNoteDurationNotation).toSeconds();
  let bassCurrentTime = startOffset;
  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (const degree of progressionDegrees) {
      const chordNotesForBassRoot = getChordNotesForKey(params.keySignature, params.mode, degree, bassOctave);
      if (chordNotesForBassRoot.length > 0) {
        const bassNoteName = chordNotesForBassRoot[0];
        bassNotesToSchedule.push({ time: bassCurrentTime, note: bassNoteName, duration: bassNoteDurationNotation, velocity: 0.6 });
        overallMaxTime = Math.max(overallMaxTime, bassCurrentTime + bassNoteDurationSeconds);
      }
      bassCurrentTime += measureDurationSeconds;
    }
  }

  const chordEventsToSchedule: { time: number, notes: string[], duration: string, velocity: number }[] = [];
  const chordOctave = params.originalInput.mode === 'kids' ? 4 : 3;
  let chordCurrentTimeForSched = startOffset;
  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (const degree of progressionDegrees) {
      const chordNoteNames = getChordNotesForKey(params.keySignature, params.mode, degree, chordOctave);
      if (chordNoteNames.length > 0) {
          chordEventsToSchedule.push({ time: chordCurrentTimeForSched, notes: chordNoteNames, duration: chordDurationNotation, velocity: 0.45 });
          overallMaxTime = Math.max(overallMaxTime, chordCurrentTimeForSched + chordDurationSeconds);
      }
      chordCurrentTimeForSched += measureDurationSeconds;
    }
  }

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
        midiToNoteName(robustNoteToMidi(currentChordNotesForArp[0]) + 12), // Octave up for 4th arp note
      ];
      for (let beat = 0; beat < 2; beat++) {
        for (let i = 0; i < arpPattern.length; i++) {
          const noteTime = chordEvent.time + (beat * secondsPerBeat) + (i * arpNoteDurationSeconds);
           if (noteTime < chordEvent.time + chordDurationSeconds) {
            arpeggioNotesToSchedule.push({ time: noteTime, note: arpPattern[i], duration: arpNoteDurationNotation, velocity: 0.35 });
            overallMaxTime = Math.max(overallMaxTime, noteTime + arpNoteDurationSeconds);
          }
        }
      }
    }
  });

  const drumEventsToSchedule: { synth: 'kick' | 'snare' | 'hiHat', time: number, duration: string, velocity: number, pitch?: string | number}[] = [];
  const numDrumMeasures = numChordCycles * progressionDegrees.length;
  let lastKickTime = -TIME_EPSILON, lastSnareTime = -TIME_EPSILON, lastHiHatTime = -TIME_EPSILON;
  for (let measure = 0; measure < numDrumMeasures; measure++) {
    for (let beat = 0; beat < beatsPerMeasure; beat++) {
      const currentTimeForDrumsThisBeat = startOffset + (measure * measureDurationSeconds) + (beat * secondsPerBeat);
      if (beat === 0 || beat === 2) {
        let kickTime = currentTimeForDrumsThisBeat;
        if (kickTime <= lastKickTime) kickTime = lastKickTime + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'kick', time: kickTime, duration: "8n", velocity: 0.8, pitch: "C2" });
        lastKickTime = kickTime;
      }
      if (beat === 1 || beat === 3) {
        let snareTime = currentTimeForDrumsThisBeat;
        if (snareTime <= lastSnareTime) snareTime = lastSnareTime + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'snare', time: snareTime, duration: "16n", velocity: 0.7 });
        lastSnareTime = snareTime;
      }
      const hiHatSubdivisions = params.rhythmicDensity < 0.4 ? 1 : (params.rhythmicDensity < 0.7 ? 2 : 4);
      const hiHatDurationNotation = hiHatSubdivisions === 1 ? "4n" : (hiHatSubdivisions === 2 ? "8n" : "16n");
      for (let subBeat = 0; subBeat < hiHatSubdivisions; subBeat++) {
        let hiHatTime = currentTimeForDrumsThisBeat + (subBeat * (secondsPerBeat / hiHatSubdivisions));
        if (hiHatTime <= lastHiHatTime) hiHatTime = lastHiHatTime + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'hiHat', time: hiHatTime, duration: hiHatDurationNotation, velocity: 0.45, pitch: activeSynthConfigs.hiHat.frequency || 300 });
        lastHiHatTime = hiHatTime;
      }
    }
  }
  drumEventsToSchedule.forEach(ev => { overallMaxTime = Math.max(overallMaxTime, ev.time + Tone.Time(ev.duration).toSeconds()); });
  
  const renderDuration = Math.max(overallMaxTime + 2.5, MIN_EFFECTIVE_DURATION_SECONDS);
  console.log(`${logPrefix} Calculated renderDuration: ${renderDuration.toFixed(2)}s.`);

  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log(`${logPrefix}_OFFLINE] Inside Tone.Offline. Offline Context SR: ${offlineContext.sampleRate}`);
      offlineContext.transport.bpm.value = Tone.Transport.bpm.value;

      const reverb = new Tone.Reverb(1.2).connect(offlineContext.destination); // Default to 1.2s decay
      await reverb.ready;
      console.log(`${logPrefix}_OFFLINE] Reverb created and ready.`);

      // --- Instantiate Synths Dynamically ---
      const createSynth = (config: any) => {
          let synthInstance;
          if (config.synthType === Tone.PolySynth) {
              synthInstance = new Tone.PolySynth(config.subType || Tone.Synth, config.options);
          } else if (config.synthType === Tone.PluckSynth) {
              synthInstance = new Tone.PluckSynth(config.options);
          } else { // Default to Tone.Synth or specific FMSynth etc.
              synthInstance = new config.synthType(config.options);
          }
          synthInstance.volume.value = config.volume !== undefined ? config.volume : -12; // Default volume if not set

          // Apply simple effects if defined
          if (config.effects && Array.isArray(config.effects)) {
              let effectChain = synthInstance;
              config.effects.forEach((effectConf: any) => {
                  if (effectConf.type === Tone.Distortion) {
                      const dist = new Tone.Distortion(effectConf.amount || 0.4);
                      effectChain = effectChain.connect(dist);
                  }
                  // Add more effects here (Chorus, Delay etc.)
              });
              return effectChain; // Return the end of the effect chain
          }
          return synthInstance;
      };
      
      const melodySynth = createSynth(activeSynthConfigs.melody).connect(reverb);
      const bassSynth = createSynth(activeSynthConfigs.bass).connect(offlineContext.destination); // Bass usually dry
      const chordSynth = createSynth(activeSynthConfigs.chords).connect(reverb);
      const arpeggioSynth = createSynth(activeSynthConfigs.arpeggio).connect(reverb);

      console.log(`${logPrefix}_OFFLINE] Melody, Bass, Chord, Arp Synths created dynamically.`);

      melodyNotesToSchedule.forEach((ev) => melodySynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
      bassNotesToSchedule.forEach((ev) => bassSynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
      chordEventsToSchedule.forEach((ev) => chordSynth.triggerAttackRelease(ev.notes, ev.duration, ev.time, ev.velocity));
      arpeggioNotesToSchedule.forEach((ev) => arpeggioSynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));

      console.log(`${logPrefix}_OFFLINE] Setting up drum synths.`);
      const kickSynth = new Tone.MembraneSynth(activeSynthConfigs.kick).connect(offlineContext.destination);
      const snareSynth = new Tone.NoiseSynth(activeSynthConfigs.snare).connect(offlineContext.destination);
      const hiHatSynth = new Tone.MetalSynth(activeSynthConfigs.hiHat).connect(offlineContext.destination);
      console.log(`${logPrefix}_OFFLINE] Drum synths created and connected to offlineContext.destination.`);
      console.log(`${logPrefix}_OFFLINE] Scheduling ${drumEventsToSchedule.length} drum events.`);

      drumEventsToSchedule.forEach(ev => {
        const { synth, time, duration, velocity, pitch } = ev;
        let correctedTime = time;
        if (synth === 'kick') {
          if (correctedTime <= lastKickTime) correctedTime = lastKickTime + TIME_EPSILON;
          if (pitch) kickSynth.triggerAttackRelease(pitch as string, duration, correctedTime, velocity);
          lastKickTime = correctedTime;
        } else if (synth === 'snare') {
          if (correctedTime <= lastSnareTime) correctedTime = lastSnareTime + TIME_EPSILON;
          snareSynth.triggerAttackRelease(duration, correctedTime, velocity);
          lastSnareTime = correctedTime;
        } else if (synth === 'hiHat') {
          if (correctedTime <= lastHiHatTime) correctedTime = lastHiHatTime + TIME_EPSILON;
          hiHatSynth.triggerAttackRelease(typeof pitch === 'number' ? pitch : (activeSynthConfigs.hiHat.frequency || 300), duration, correctedTime, velocity);
          lastHiHatTime = correctedTime;
        }
      });

    }, renderDuration);

    console.log(`${logPrefix} Tone.Offline rendering complete. AudioBuffer duration: ${audioBuffer.duration.toFixed(3)}s`);
    let isSilent = true; let maxVal = 0;
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      const channelData = audioBuffer.getChannelData(i);
      for (let j = 0; j < channelData.length; j++) {
        if (Math.abs(channelData[j]) > 1e-5) { isSilent = false; }
        if (Math.abs(channelData[j]) > maxVal) { maxVal = Math.abs(channelData[j]); }
      }
    }
    if (isSilent) console.warn(`${logPrefix}_WARN] Rendered AudioBuffer appears to be silent or very quiet.`);
    else console.log(`${logPrefix} Rendered AudioBuffer contains non-zero samples. Max sample value: ${maxVal.toExponential(3)}`);

    const wavDataBuffer = audioBufferToWav(audioBuffer);
    console.log(`${logPrefix} WAV data buffer created. Size: ${wavDataBuffer.byteLength} bytes.`);
    return new Blob([wavDataBuffer], { type: 'audio/wav' });

  } catch (error) {
    console.error(`${logPrefix}_ERROR] Error during WAV generation process:`, error);
    if (error instanceof Error) {
        console.error(`${logPrefix}_ERROR_DETAILS] Name: ${error.name}, Message: ${error.message}, Stack: ${error.stack}`);
    }
    return null;
  }
};