
'use client';
import * as Tone from 'tone';
import type { MusicParameters } from '@/types';
import { audioBufferToWav } from "./audioBufferToWav";

// Constants
const SAFE_OSC_TYPE = 'triangle' as const;
const MIN_EFFECTIVE_DURATION_SECONDS = 5.0;
const TIME_EPSILON = 0.00001;
const DEFAULT_MIDI_NOTE = 60; // C4

// --- Note and Scale Utilities ---
const PITCH_CLASSES: { [key: string]: number } = {
    'C': 0, 'B#': 0, 'BS': 0, 'C#': 1, 'DB': 1, 'CS': 1, 'D': 2, 'D#': 3, 'EB': 3, 'DS': 3,
    'E': 4, 'FB': 4, 'F': 5, 'E#': 5, 'ES': 5, 'F#': 6, 'GB': 6, 'FS': 6, 'G': 7,
    'G#': 8, 'AB': 8, 'GS': 8, 'A': 9, 'A#': 10, 'BB': 10, 'AS': 10, 'B': 11, 'CB': 11,
};
const NOTES_ARRAY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function robustNoteToMidi(noteNameWithOctave: string): number {
    if (typeof noteNameWithOctave !== 'string') return DEFAULT_MIDI_NOTE;
    const match = noteNameWithOctave.match(/([A-G])([#bSsxBF]*)(-?[0-9]+)/i);
    if (!match) {
        const simpleMatch = noteNameWithOctave.match(/([A-G])([#bSsxBF]*)/i);
        if (simpleMatch) return robustNoteToMidi(noteNameWithOctave + '4');
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

const STANDARD_MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const STANDARD_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
const BLUES_SCALE_INTERVALS = [0, 3, 5, 6, 7, 10];
const MAJOR_PENTATONIC_INTERVALS = [0, 2, 4, 7, 9];
const MINOR_PENTATONIC_INTERVALS = [0, 3, 5, 7, 10];
const DORIAN_INTERVALS = [0, 2, 3, 5, 7, 9, 10];
const MIXOLYDIAN_INTERVALS = [0, 2, 4, 5, 7, 9, 10];
const HARMONIC_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 11];
const LYDIAN_INTERVALS = [0, 2, 4, 6, 7, 9, 11]; // For AI genre, potentially
const PHRYGIAN_INTERVALS = [0, 1, 3, 5, 7, 8, 10]; // For AI genre, potentially

function getScaleNoteNames(keySignature: string, mode: string, startOctaveInput: number = 4, genre?: string, harmonicComplexity: number = 0.3): string[] {
    const baseKeyForScale = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const rootMidiBase = robustNoteToMidi(baseKeyForScale + '0') % 12;
    const genreLower = typeof genre === 'string' ? genre.toLowerCase() : "";
    const isKids = typeof mode === 'string' ? mode.toLowerCase().includes('kids') : false;
    const startOctave = isKids ? 4 : startOctaveInput;


    let intervals: number[];
    if (isKids) {
        intervals = MAJOR_PENTATONIC_INTERVALS;
    } else if (genreLower.includes('ai')) {
        if (harmonicComplexity > 0.7) intervals = PHRYGIAN_INTERVALS; // More dissonant
        else if (harmonicComplexity > 0.5) intervals = LYDIAN_INTERVALS; // Brighter, ethereal
        else intervals = typeof mode === 'string' && mode.toLowerCase().includes('minor') ? MINOR_PENTATONIC_INTERVALS : MAJOR_PENTATONIC_INTERVALS; // Default to pentatonics for digital feel
    } else if (genreLower.includes('blues')) {
        intervals = BLUES_SCALE_INTERVALS;
    } else if (genreLower.includes('jazz')) {
        intervals = (typeof mode === 'string' ? mode.toLowerCase().includes('minor') : false) ? DORIAN_INTERVALS : (harmonicComplexity > 0.6 ? MIXOLYDIAN_INTERVALS : STANDARD_MAJOR_INTERVALS);
    } else if ((genreLower.includes('folk') || genreLower.includes('country'))) {
        intervals = (typeof mode === 'string' ? mode.toLowerCase().includes('minor') : false) ? MINOR_PENTATONIC_INTERVALS : MAJOR_PENTATONIC_INTERVALS;
    } else {
        intervals = (typeof mode === 'string' ? mode.toLowerCase().includes('minor') : false) ? (harmonicComplexity > 0.6 ? HARMONIC_MINOR_INTERVALS : STANDARD_MINOR_INTERVALS) : STANDARD_MAJOR_INTERVALS;
    }

    return intervals.map(interval => {
        const currentMidiValue = rootMidiBase + interval;
        const octaveOffset = Math.floor(currentMidiValue / 12);
        const noteMidiNumber = (currentMidiValue % 12) + (startOctave + octaveOffset + 1) * 12;
        return midiToNoteName(noteMidiNumber);
    });
}

function getChordNotesForKey(keySignature: string, mode: string, degree: number, octaveInput: number = 3, addSeventh: boolean = false, genre?: string, harmonicComplexity: number = 0.3): string[] {
    const rootNoteName = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const genreLower = typeof genre === 'string' ? genre.toLowerCase() : "";
    const isKids = typeof mode === 'string' ? mode.toLowerCase().includes('kids') : false;
    const octave = isKids ? 3 : octaveInput;


    const fullScaleForChordRoots = getScaleNoteNames(rootNoteName, typeof mode === 'string' ? mode.replace('kids', '') : "", octave, genre, harmonicComplexity);

    if (fullScaleForChordRoots.length === 0) return [midiToNoteName(DEFAULT_MIDI_NOTE + (octave - 4) * 12)];

    const chordRootInScaleOctave = fullScaleForChordRoots[(degree - 1 + fullScaleForChordRoots.length) % fullScaleForChordRoots.length];
    const finalChordRootMidi = robustNoteToMidi(chordRootInScaleOctave);

    const majorKeyQualities = [
        { type: 'Maj7', third: 4, fifth: 7, seventh: 11 },
        { type: 'm7', third: 3, fifth: 7, seventh: 10 },
        { type: 'm7', third: 3, fifth: 7, seventh: 10 },
        { type: 'Maj7', third: 4, fifth: 7, seventh: 11 },
        { type: 'Dom7', third: 4, fifth: 7, seventh: 10 },
        { type: 'm7', third: 3, fifth: 7, seventh: 10 },
        { type: 'm7b5', third: 3, fifth: 6, seventh: 10 }
    ];
    const naturalMinorKeyQualities = [
        { type: 'm7', third: 3, fifth: 7, seventh: 10 },
        { type: 'm7b5', third: 3, fifth: 6, seventh: 10 },
        { type: 'Maj7', third: 4, fifth: 7, seventh: 11 },
        { type: 'm7', third: 3, fifth: 7, seventh: 10 },
        { type: 'm7', third: 3, fifth: 7, seventh: 10 }, // Often a minor v in simpler pop/folk minor
        { type: 'Maj7', third: 4, fifth: 7, seventh: 11 },
        { type: 'Dom7', third: 4, fifth: 7, seventh: 10 } // Or major V7 for harmonic minor feel
    ];

    let qualityDefinition;
    const isMinorKeyOverall = typeof mode === 'string' ? mode.toLowerCase().includes('minor') : false;
    const currentDegreeIndex = (degree - 1 + 7) % 7;

    if (genreLower.includes('ai') && harmonicComplexity > 0.6) {
        // For AI genre, be more experimental with chord qualities if complexity is high
        const randomChoice = Math.random();
        if (randomChoice < 0.33) qualityDefinition = { type: 'm7b5', third: 3, fifth: 6, seventh: 9 }; // Diminished with b7
        else if (randomChoice < 0.66) qualityDefinition = { type: 'Maj7#5', third: 4, fifth: 8, seventh: 11 }; // Augmented Major 7th
        else qualityDefinition = { type: 'Dom7b9', third: 4, fifth: 7, seventh: 10, nineth: 13 }; // Dom7 b9
    } else if (isMinorKeyOverall) {
        qualityDefinition = naturalMinorKeyQualities[currentDegreeIndex];
        // Make V chord major/dominant in minor keys more often if complexity allows
        if (degree === 5 && (harmonicComplexity > 0.4 || genreLower.includes("jazz") || genreLower.includes("classical"))) {
            qualityDefinition = { type: 'Dom7', third: 4, fifth: 7, seventh: 10 };
        } else if (degree === 7 && harmonicComplexity > 0.5) { // Leading tone chord often diminished
            qualityDefinition = { type: 'dim', third:3, fifth:6, seventh: 9};
        }
    } else {
        qualityDefinition = majorKeyQualities[currentDegreeIndex];
    }

    const notes = [
        midiToNoteName(finalChordRootMidi),
        midiToNoteName(finalChordRootMidi + qualityDefinition.third),
        midiToNoteName(finalChordRootMidi + qualityDefinition.fifth)
    ];

    const shouldAddSeventh = addSeventh ||
                       (genreLower.includes("jazz")) ||
                       (qualityDefinition.type === 'Dom7') ||
                       (qualityDefinition.type === 'm7b5') ||
                       (qualityDefinition.type.includes('Maj7') && harmonicComplexity > 0.6) ||
                       (genreLower.includes('ai') && harmonicComplexity > 0.5);


    if (shouldAddSeventh && !isKids) {
        notes.push(midiToNoteName(finalChordRootMidi + qualityDefinition.seventh));
    }
    if (qualityDefinition.type === 'Dom7b9' && qualityDefinition.nineth && !isKids) {
        notes.push(midiToNoteName(finalChordRootMidi + qualityDefinition.nineth));
    }
    return notes.filter(name => name && typeof name === 'string');
}

// --- Synth Configurations ---
const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genreInput?: string,
  isKidsMode: boolean = false,
  harmonicComplexity: number = 0.3,
  rhythmicDensity: number = 0.5,
): any => {
  const genreLower = typeof genreInput === 'string' ? genreInput.toLowerCase() : "";
  const hintsLower = instrumentHints.map(h => typeof h === 'string' ? h.toLowerCase() : "");

  const baseConfigs = {
    pianoMelody: {
        synthType: Tone.PolySynth, subType: Tone.FMSynth,
        options: { harmonicity: 2.8, modulationIndex: 10, detune: 0, oscillator: { type: "sine" as const, partials: [1, 0.2, 0.1] }, envelope: { attack: 0.015, decay: 0.7, sustain: 0.4, release: 1.2 }, modulation: { type: "triangle" as const }, modulationEnvelope: { attack: 0.02, decay: 0.25, sustain: 0.01, release: 0.5 } },
        volume: -9,
        effects: [{type: Tone.Chorus, frequency: 0.8, delayTime: 3.2, depth: 0.05, feedback: 0.02}],
        filterType: 'lowpass' as const, filterFrequency: 5000, filterRolloff: -12 as const,
        filterEnvelope: { attack: 0.015, decay: 0.3, sustain: 0.01, release: 1.0, baseFrequency: 300, octaves: 3}
    },
    synthLeadElectronic: {
        synthType: Tone.Synth,
        options: { oscillator: { type: "fatsawtooth" as const, count: 3, spread: 25 }, envelope: { attack: 0.04, decay: 1.5, sustain: 0.6, release: 1.0 } }, volume: -10,
        effects: [
            {type: Tone.FeedbackDelay, delayTime: "8n.", feedback: 0.25, wet:0.2},
            {type: Tone.Filter, frequency: 2500, type: 'lowpass' as const, rolloff: -12 as const, Q: 0.8},
            {type: 'LFO_Vibrato', lfoFrequency: 5, lfoDepth: 0.008, lfoType: 'sine' as const}
        ]
    },
    rockGuitarLead: { synthType: Tone.Synth, options: { oscillator: { type: "fatsquare" as const, count: 2, spread: 15 }, envelope: { attack: 0.015, decay: 0.8, sustain: 0.3, release: 0.6 } }, volume: -10, effects: [{type: Tone.Distortion, amount: 0.35}] },
    acousticGuitarLead: { synthType: Tone.PluckSynth, options: { attackNoise: 0.7, dampening: 3000, resonance: 0.70 }, volume: -14, effects: [{type: Tone.Chorus, frequency: 0.5, delayTime: 4, depth: 0.03}] },
    fluteLead: { synthType: Tone.Synth, options: { oscillator: {type: "triangle8" as const }, envelope: {attack: 0.05, decay: 0.4, sustain: 0.6, release: 0.3}}, volume: -12},

    electricPianoChords: {
        synthType: Tone.PolySynth, subType: Tone.FMSynth,
        options: { harmonicity: 2.2, modulationIndex: 7, envelope: { attack: 0.02, decay: 1.2, sustain: 0.4, release: 1.8 }, oscillator: {type: "sine" as const, partials: [1, 0.4, 0.08]} },
        volume: -18,
        effects: [{type: Tone.Chorus, frequency: 1.1, delayTime: 3.0, depth: 0.25}],
        filterType: 'lowpass' as const, filterFrequency: 4500, filterRolloff: -12 as const,
        filterEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.01, release: 1.2, baseFrequency: 250, octaves: 3}
    },
    warmPadChords: {
        synthType: Tone.PolySynth, subType: Tone.AMSynth,
        options: { harmonicity: 0.7, modulationType: "sawtooth" as const, envelope: { attack: 1.5, decay: 2.0, sustain: 0.8, release: 3.5 } }, volume: -22,
        effects: [{type: 'LFO_FilterMod', lfoFrequency: 0.2, lfoDepthOctaves: 0.5, lfoType: 'sine' as const, filterBaseFreq: 400, filterQ: 0.7}]
    },
    stringEnsembleChords: {
        synthType: Tone.PolySynth, subType: Tone.Synth,
        options: { oscillator: {type: "fatsawtooth" as const, count: 5, spread: 40}, envelope: {attack: 0.8, decay: 2.0, sustain:0.8, release: 2.5}}, volume: -20,
        effects: [{type: 'LFO_FilterMod', lfoFrequency: 0.15, lfoDepthOctaves: 0.4, lfoType: 'sine' as const, filterBaseFreq: 500, filterQ: 0.6}]
    },

    pluckArp: { synthType: Tone.PluckSynth, options: { attackNoise: 0.2, dampening: 4500, resonance: 0.75 }, volume: -20 },
    synthArpElectronic: { synthType: Tone.Synth, options: { oscillator: {type: "triangle" as const}, envelope: { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.25}}, volume: -22 },

    defaultBass: { synthType: Tone.FMSynth, options: { harmonicity: 1.0, modulationIndex: 2.5, envelope: { attack: 0.015, decay: 0.2, sustain: 0.8, release: 0.6 }, oscillator: { type: "triangle" as const } }, volume: -9 },
    subBassElectronic: { synthType: Tone.Synth, options: { oscillator: { type: "sine" as const }, envelope: { attack: 0.02, decay: 0.5, sustain: 1, release: 0.8 } }, volume: -7 },
    rockBassPicked: { synthType: Tone.Synth, options: { oscillator: {type: "fatsquare" as const, count:2, spread:10}, envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5 }}, volume: -8, effects: [{type: Tone.Distortion, amount: 0.1}]},
    jazzUprightBass: { synthType: Tone.FMSynth, options: { harmonicity: 0.8, modulationIndex: 1.5, envelope: { attack: 0.03, decay: 0.7, sustain: 0.1, release: 0.9 }, oscillator:{type:"sine" as const, partials: [1, 0.1, 0.02]}}, volume: -10},
    funkSlapBass: { synthType: Tone.Synth, options: { oscillator: {type: "sawtooth" as const}, envelope: {attack: 0.005, decay: 0.15, sustain: 0.01, release: 0.2}, filter: {type: "lowpass", Q: 3, rolloff: -24, frequency: 800}, filterEnvelope: {attack:0.005, decay:0.05, sustain:0, release:0.1, baseFrequency:200, octaves:2.5} }, volume: -8 },

    // AI Genre Synths
    aiSineLead: { synthType: Tone.Synth, options: { oscillator: { type: "sine" as const }, envelope: { attack: 0.005, decay: 0.5, sustain: 0.7, release: 1.0 } }, volume: -10, effects: [{type: Tone.PingPongDelay, delayTime:"8n.", feedback:0.3, wet: 0.25}] },
    aiFMBellArp: { synthType: Tone.FMSynth, options: { harmonicity: 3.5, modulationIndex: 15, envelope: { attack: 0.001, decay: 1.0, sustain: 0.01, release: 1.5 }, oscillator: {type: "sine" as const, partials:[1, 0.05, 0.2]}, modulation: {type:"square" as const} }, volume: -15, effects: [{type: Tone.Reverb, decay: 2.5, wet: 0.3}] },
    aiGlacialPad: { synthType: Tone.PolySynth, subType: Tone.AMSynth, options: { harmonicity: 1.2, modulationType: "sine" as const, envelope: { attack: 3.0, decay: 4.0, sustain: 0.9, release: 5.0 } }, volume: -20, effects: [{type: 'LFO_FilterMod', lfoFrequency: 0.08, lfoDepthOctaves: 1.5, lfoType: 'sine' as const, filterBaseFreq: 200, filterQ: 0.5}, {type: Tone.BitCrusher, bits: 6, wet: 0.1}]},
    aiDeepSineBass: { synthType: Tone.Synth, options: { oscillator: { type: "sine" as const }, envelope: { attack: 0.05, decay: 0.8, sustain: 0.9, release: 1.2 } }, volume: -8 },
    aiNoisePerc: { noise: { type: 'white' as const, playbackRate: 1.0 }, volume: -20, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.05 } }, // For AI Noise "Snare"
    aiClickPerc: { pitchDecay: 0.005, octaves: 1.5, oscillator: {type: "triangle" as const}, envelope: { attack: 0.0005, decay: 0.01, sustain:0, release: 0.02}, volume: -18}, // For AI Click "Kick"


    kidsToyPiano: { synthType: Tone.FMSynth, options: { harmonicity: 4.0, modulationIndex: 7, oscillator: {type: "triangle" as const}, envelope: {attack: 0.008, decay: 0.25, sustain: 0.1, release: 0.2}}, volume: -10},
    kidsXylophone: { synthType: Tone.MetalSynth, options: { harmonicity: 2.5, modulationIndex: 1.5, octaves: 0.3, envelope: {attack:0.002, decay:0.3, release:0.3}}, volume: -13},
    kidsUkuleleBass: { synthType: Tone.PluckSynth, options: {attackNoise: 0.5, dampening: 1800, resonance: 0.55}, volume: -12},
    kidsSimplePad: {
        synthType: Tone.PolySynth, subType: Tone.Synth,
        options: {oscillator: {type: "triangle" as const}, envelope: {attack: 0.3, decay:0.6, sustain:0.4, release:0.9}}, volume: -20,
        effects: [{type: 'LFO_FilterMod', lfoFrequency: 0.1, lfoDepthOctaves: 0.3, lfoType: 'sine' as const, filterBaseFreq: 300, filterQ: 0.5}]
    },
    kidsSimpleArp: { synthType: Tone.Synth, options: {oscillator: {type: "square" as const }, envelope: {attack:0.015, decay:0.12, sustain:0.15, release:0.22}}, volume: -22},

    kick: { pitchDecay: 0.035, octaves: 4.5, oscillator: { type: "sine" as const }, envelope: { attack: 0.0015, decay: 0.25, sustain: 0.002, release: 0.9, attackCurve: "exponential" as const }, volume: -5 },
    kickElectronic: { pitchDecay: 0.045, octaves: 5.5, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.35, sustain: 0.005, release: 1.1 }, volume: -3 },
    kickRock: { pitchDecay: 0.02, octaves: 4, envelope: { attack: 0.0025, decay: 0.18, sustain: 0.001, release: 0.7 }, volume: -4 },
    snare: { noise: { type: 'pink' as const, playbackRate: 0.7 }, volume: -12, envelope: { attack: 0.0015, decay: 0.07, sustain: 0, release: 0.1 } },
    snareElectronic: { noise: { type: 'white' as const, playbackRate: 0.9 }, volume: -10, envelope: { attack: 0.0025, decay: 0.09, sustain: 0.005, release: 0.13 } },
    hiHat: { frequency: 380, envelope: { attack: 0.001, decay: 0.035, release: 0.035 }, harmonicity: 2.8, modulationIndex: 9, resonance: 2200, octaves: 1.1, volume: -18 },
    hiHatElectronic: { frequency: 480, envelope: { attack: 0.001, decay: 0.02, release: 0.025 }, harmonicity: 2.2, modulationIndex: 7, resonance: 2800, octaves: 0.9, volume: -16 },
    rideCymbal: { frequency: 300, envelope: { attack: 0.01, decay: 1.5, sustain: 0, release: 2.0 }, harmonicity: 4, modulationIndex:15, resonance: 5000, octaves: 2.5, volume: -20},

    kidsKick: { pitchDecay: 0.03, octaves: 3.5, envelope: { attack: 0.0025, decay: 0.12, sustain: 0.005, release: 0.4 }, volume: -7 },
    kidsSnare: { noise: { type: 'white' as const }, volume: -15, envelope: { attack: 0.0015, decay: 0.04, sustain: 0, release: 0.07 } },
    kidsHiHat: { frequency: 420, envelope: { attack: 0.001, decay: 0.015, release: 0.015 }, harmonicity: 2.2, octaves: 0.8, volume: -22 },
    tambourine: { noise: {type: 'white' as const, playbackRate: 1.6}, envelope: {attack:0.006, decay:0.06, sustain:0, release:0.07}, volume: -17},
  };

  let melodyConf = { ...baseConfigs.pianoMelody };
  let bassConf = { ...baseConfigs.defaultBass };
  let chordsConf = { ...baseConfigs.warmPadChords };
  let arpConf = { ...baseConfigs.pluckArp };
  let kickConf = { ...baseConfigs.kick };
  let snareConf = { ...baseConfigs.snare };
  let hiHatConf = { ...baseConfigs.hiHat };
  let useTambourine = false;
  let useRideCymbal = false;
  let useAiPerc = false;

  if (isKidsMode) {
    melodyConf = Math.random() < 0.5 ? {...baseConfigs.kidsToyPiano} : {...baseConfigs.kidsXylophone};
    bassConf = {...baseConfigs.kidsUkuleleBass};
    chordsConf = {...baseConfigs.kidsSimplePad};
    arpConf = {...baseConfigs.kidsSimpleArp};
    kickConf = {...baseConfigs.kidsKick};
    snareConf = {...baseConfigs.kidsSnare};
    hiHatConf = {...baseConfigs.kidsHiHat};
    if (hintsLower.some(h => h.includes("tambourine") || h.includes("shaker"))) useTambourine = true;
  } else if (genreLower.includes("ai")) {
    melodyConf = { ...baseConfigs.aiSineLead };
    bassConf = { ...baseConfigs.aiDeepSineBass };
    chordsConf = { ...baseConfigs.aiGlacialPad };
    arpConf = { ...baseConfigs.aiFMBellArp };
    kickConf = { ...baseConfigs.aiClickPerc };
    snareConf = { ...baseConfigs.aiNoisePerc };
    hiHatConf = { ...baseConfigs.aiClickPerc, volume: -22, pitchDecay: 0.002, octaves: 0.5 };
    useAiPerc = true;
  } else {
    // Existing genre logic...
    if (genreLower.includes("electronic") || genreLower.includes("synthwave") || genreLower.includes("techno") || genreLower.includes("house")) {
      melodyConf = { ...baseConfigs.synthLeadElectronic };
      bassConf = { ...baseConfigs.subBassElectronic };
      chordsConf = { ...baseConfigs.warmPadChords, volume: -20 };
      arpConf = { ...baseConfigs.synthArpElectronic };
      kickConf = { ...baseConfigs.kickElectronic };
      snareConf = { ...baseConfigs.snareElectronic };
      hiHatConf = { ...baseConfigs.hiHatElectronic };
    } else if (genreLower.includes("rock") || genreLower.includes("metal") || genreLower.includes("punk")) {
      melodyConf = { ...baseConfigs.rockGuitarLead };
      bassConf = { ...baseConfigs.rockBassPicked };
      chordsConf = { ...baseConfigs.rockGuitarLead, synthType: Tone.PolySynth, subType: Tone.Synth, options: {...baseConfigs.rockGuitarLead.options, envelope: {...baseConfigs.rockGuitarLead.options.envelope, attack:0.005, decay:0.5, sustain:0.01, release:0.3}}, volume: -16 };
      arpConf = { ...baseConfigs.defaultBass, volume: -28 };
      kickConf = { ...baseConfigs.kickRock };
    } else if (genreLower.includes("jazz") || genreLower.includes("swing") || (genreLower.includes("blues") && rhythmicDensity > 0.3)) {
      melodyConf = { ...baseConfigs.pianoMelody, volume: -10 };
      bassConf = { ...baseConfigs.jazzUprightBass };
      chordsConf = { ...baseConfigs.electricPianoChords, volume: -16 };
      arpConf = { ...baseConfigs.pluckArp, volume: -26 };
      kickConf = { ...baseConfigs.kick, volume: -10, envelope: {...baseConfigs.kick.envelope, decay:0.15, sustain:0.001} };
      snareConf = { ...baseConfigs.snare, volume: -16, noise: {type: 'pink', playbackRate: 0.5} };
      hiHatConf = { ...baseConfigs.rideCymbal, volume: -20 };
      useRideCymbal = true;
    } else if (genreLower.includes("ambient") || genreLower.includes("new age")) {
        melodyConf = { ...baseConfigs.warmPadChords, synthType: Tone.PolySynth, subType: Tone.AMSynth, volume: -16 };
        bassConf = { ...baseConfigs.subBassElectronic, volume: -14, options: {...baseConfigs.subBassElectronic.options, envelope: {...baseConfigs.subBassElectronic.options.envelope, attack:0.5, release:1.5}} };
        chordsConf = { ...baseConfigs.warmPadChords, volume: -18 };
        arpConf = { ...baseConfigs.pluckArp, volume: -22, options: {...baseConfigs.pluckArp.options, dampening: 4800, attackNoise: 0.3}};
        kickConf = { ...baseConfigs.kick, volume: -15, envelope: {...baseConfigs.kick.envelope, decay: 0.5, sustain:0.05} };
        snareConf = { ...baseConfigs.snare, volume: -25 };
        hiHatConf = { ...baseConfigs.hiHat, volume: -28 };
    } else if (genreLower.includes("folk") || genreLower.includes("country") || genreLower.includes("acoustic")) {
        melodyConf = { ...baseConfigs.acousticGuitarLead };
        bassConf = { ...baseConfigs.jazzUprightBass, volume: -12};
        chordsConf = { synthType: Tone.PolySynth, subType: Tone.PluckSynth, options: {...baseConfigs.acousticGuitarLead.options}, volume: -16 };
        arpConf = {...baseConfigs.acousticGuitarLead, volume: -18};
        if (hintsLower.some(h => h.includes("tambourine"))) useTambourine = true;
    } else if (genreLower.includes("funk") || genreLower.includes("soul") || genreLower.includes("disco")) {
        melodyConf = { ...baseConfigs.electricPianoChords, synthType: Tone.PolySynth, subType: Tone.FMSynth, volume: -11};
        bassConf = { ...baseConfigs.funkSlapBass};
        chordsConf = { ...baseConfigs.electricPianoChords, volume: -15};
        arpConf = { ...baseConfigs.pluckArp, volume: -20};
        kickConf = { ...baseConfigs.kick, volume: -4 };
        snareConf = { ...baseConfigs.snare, volume: -10 };
        hiHatConf = { ...baseConfigs.hiHat, volume: -17 };
    } else if (genreLower.includes("classical") || genreLower.includes("cinematic") || genreLower.includes("orchestral")) {
        melodyConf = { ...baseConfigs.pianoMelody, volume: -8 };
        bassConf = { ...baseConfigs.defaultBass, options: {...baseConfigs.defaultBass.options, oscillator:{type:"sine" as const}}, volume: -14 };
        chordsConf = { ...baseConfigs.stringEnsembleChords };
        arpConf = { ...baseConfigs.pluckArp, volume: -20 };
        hiHatConf = {...baseConfigs.hiHat, volume: -25}
    }

    hintsLower.forEach(hint => {
      if (hint.includes('piano')) {
        melodyConf = { ...baseConfigs.pianoMelody };
        if (!hintsLower.some(h => /pad|string/i.test(h) || genreLower.includes("jazz"))) {
            chordsConf = { ...baseConfigs.pianoMelody, synthType: Tone.PolySynth, subType: Tone.FMSynth, options: {...baseConfigs.pianoMelody.options}, volume: -16 };
        }
      } else if (hint.includes('electric piano') || hint.includes('rhodes')) {
        melodyConf = { ...baseConfigs.electricPianoChords, synthType: Tone.PolySynth, subType: Tone.FMSynth, options: {...baseConfigs.electricPianoChords.options}, volume: -11};
        chordsConf = { ...baseConfigs.electricPianoChords, volume: -18 };
      } else if (hint.includes('pad') || hint.includes('warm pad') || hint.includes('synth pad')) {
        chordsConf = { ...baseConfigs.warmPadChords };
        if (!hintsLower.some(h => /piano|lead|guitar|pluck/i.test(h))) melodyConf = {...baseConfigs.warmPadChords, synthType: Tone.PolySynth, subType: Tone.AMSynth, volume: -14};
      } else if (hint.includes('strings') || hint.includes('orchestra') || hint.includes('ensemble')) {
        chordsConf = {...baseConfigs.stringEnsembleChords};
        if (!hintsLower.some(h => /piano|lead|guitar|pluck/i.test(h))) melodyConf = {...baseConfigs.stringEnsembleChords, synthType: Tone.PolySynth, subType: Tone.Synth, volume: -14};
      } else if (hint.includes('pluck') || hint.includes('bell') || hint.includes('xylophone') || hint.includes('celesta')) {
        melodyConf = { ...baseConfigs.pluckArp, synthType: Tone.PluckSynth, options: {...baseConfigs.pluckArp.options}, volume: -14 };
        arpConf = { ...baseConfigs.pluckArp };
      } else if (hint.includes('synth lead') || hint.includes('bright synth') || hint.includes('lead synth')) {
        melodyConf = { ...baseConfigs.synthLeadElectronic };
      } else if (hint.includes('guitar') && (hint.includes('acoustic') || hint.includes('folk'))) {
          melodyConf = {...baseConfigs.acousticGuitarLead};
          if (!hintsLower.some(h => /pad|string|piano/i.test(h))) chordsConf = {synthType: Tone.PolySynth, subType: Tone.PluckSynth, options: {...baseConfigs.acousticGuitarLead.options}, volume: -16};
          arpConf = {...baseConfigs.acousticGuitarLead, volume: -18};
      } else if (hint.includes('guitar') && (hint.includes('rock') || hint.includes('electric') || hint.includes('distort'))) {
          melodyConf = {...baseConfigs.rockGuitarLead};
          if (!hintsLower.some(h => /pad|string|piano/i.test(h))) chordsConf = {...baseConfigs.rockGuitarLead, synthType: Tone.PolySynth, subType: Tone.Synth, options: {...baseConfigs.rockGuitarLead.options, envelope: {...baseConfigs.rockGuitarLead.options.envelope, attack:0.005, decay:0.5, sustain:0.01, release:0.3}}, volume: -16};
      } else if (hint.includes('flute') || hint.includes('recorder')) {
          melodyConf = {...baseConfigs.fluteLead};
      }
      if (hint.includes('sub bass') || (hint.includes("bass") && genreLower.includes("electronic"))) {
          bassConf = {...baseConfigs.subBassElectronic};
      } else if (hint.includes('upright bass') || (hint.includes("bass") && genreLower.includes("jazz"))) {
          bassConf = {...baseConfigs.jazzUprightBass};
      } else if (hint.includes('picked bass') || (hint.includes("bass") && (genreLower.includes("rock") || genreLower.includes("metal")))) {
          bassConf = {...baseConfigs.rockBassPicked};
      } else if (hint.includes('slap bass') || (hint.includes("bass") && (genreLower.includes("funk") || genreLower.includes("soul")))) {
          bassConf = {...baseConfigs.funkSlapBass};
      }
    });
  }

  return {
    melody: melodyConf, bass: bassConf, chords: chordsConf, arpeggio: arpConf,
    kick: kickConf, snare: snareConf, hiHat: useRideCymbal ? {...baseConfigs.rideCymbal} : hiHatConf,
    tambourine: useTambourine ? {...baseConfigs.tambourine} : null,
    useAiPerc,
  };
};

const createSynth = (config: any, offlineContext?: Tone.OfflineContext): { instrument: Tone.Instrument, outputNodeToConnect: Tone.ToneAudioNode, filterEnv?: Tone.FrequencyEnvelope } => {
    if (!config || !config.synthType) {
        const defaultConfig = { synthType: Tone.FMSynth, options: { oscillator: { type: SAFE_OSC_TYPE } }, volume: -12 };
        const instrument = new defaultConfig.synthType(defaultConfig.options);
        instrument.volume.value = defaultConfig.volume;
        return { instrument, outputNodeToConnect: instrument };
    }

    let instrument: Tone.Instrument;
    if (config.synthType === Tone.PolySynth) {
        const subSynthType = config.subType || Tone.Synth;
        instrument = new Tone.PolySynth({synth: subSynthType});
        if (config.options) (instrument as Tone.PolySynth).set(config.options);
    } else {
        instrument = new config.synthType(config.options);
    }
    instrument.volume.value = config.volume !== undefined ? config.volume : -12;

    let currentOutputNode: Tone.ToneAudioNode = instrument;
    let filterEnv: Tone.FrequencyEnvelope | undefined;

    // Main Filter and its Envelope (if defined directly on synth config)
    if (config.filterType && config.filterEnvelope) {
        const mainFilter = new Tone.Filter(config.filterFrequency || 5000, config.filterType, config.filterRolloff || -12);
        filterEnv = new Tone.FrequencyEnvelope(config.filterEnvelope);
        filterEnv.connect(mainFilter.frequency);
        instrument.connect(mainFilter);
        currentOutputNode = mainFilter;
    }

    // Additional Effects Chain
    if (config.effects && Array.isArray(config.effects) && config.effects.length > 0) {
        const effectInstances: Tone.ToneAudioNode[] = [];
        config.effects.forEach((effectConf: any) => {
            let effectNodeInstance: Tone.ToneAudioNode | undefined;
            if (effectConf.type === Tone.Distortion) {
                effectNodeInstance = new Tone.Distortion(effectConf.amount || 0.4);
            } else if (effectConf.type === Tone.Chorus) {
                effectNodeInstance = new Tone.Chorus(effectConf.frequency || 1.5, effectConf.delayTime || 3.5, effectConf.depth || 0.7);
                if (effectConf.feedback !== undefined) (effectNodeInstance as Tone.Chorus).feedback.value = effectConf.feedback;
                if (effectConf.wet !== undefined) (effectNodeInstance as Tone.Chorus).wet.value = effectConf.wet;
            } else if (effectConf.type === Tone.FeedbackDelay){
                 effectNodeInstance = new Tone.FeedbackDelay(effectConf.delayTime || "8n", effectConf.feedback || 0.5);
                 if (effectConf.wet !== undefined) (effectNodeInstance as Tone.FeedbackDelay).wet.value = effectConf.wet;
            } else if (effectConf.type === Tone.Filter && !filterEnv) { // Only add if not main filter
                 effectNodeInstance = new Tone.Filter(effectConf.frequency || 1000, effectConf.type || 'lowpass', effectConf.rolloff || -12);
                 if (effectConf.Q !== undefined) (effectNodeInstance as Tone.Filter).Q.value = effectConf.Q;
            } else if (effectConf.type === 'LFO_Vibrato') {
                const lfo = new Tone.LFO(effectConf.lfoFrequency || 5, -effectConf.lfoDepth*100 || -5, effectConf.lfoDepth*100 || 5).start(); // Depth in cents
                lfo.connect(instrument.detune); // Modulates fine pitch
                 // LFO itself isn't chained in currentOutputNode, it modulates the instrument directly
            } else if (effectConf.type === 'LFO_FilterMod') {
                const lfoFilter = effectNodeInstance || (currentOutputNode instanceof Tone.Filter ? currentOutputNode : new Tone.Filter(effectConf.filterBaseFreq || 400, 'lowpass', -12));
                if (!(lfoFilter instanceof Tone.Filter)) return; // Should not happen
                if (effectNodeInstance !== lfoFilter) effectNodeInstance = lfoFilter; // Assign if newly created

                const lfo = new Tone.LFO(effectConf.lfoFrequency || 0.1, 0, 1).start(); // LFO outputs 0-1 for scaling
                const depthScale = (effectConf.filterBaseFreq || 400) * (Math.pow(2, effectConf.lfoDepthOctaves || 1) -1); // Calculate depth in Hz
                const scaledLFO = new Tone.Multiply(depthScale);
                const sumOffset = new Tone.Add(effectConf.filterBaseFreq || 400);

                lfo.connect(scaledLFO);
                scaledLFO.connect(sumOffset.addend);
                sumOffset.connect(lfoFilter.frequency);

            } else if (effectConf.type === Tone.PingPongDelay) {
                 effectNodeInstance = new Tone.PingPongDelay(effectConf.delayTime || "8n", effectConf.feedback || 0.2);
                 if (effectConf.wet !== undefined) (effectNodeInstance as Tone.PingPongDelay).wet.value = effectConf.wet;
            } else if (effectConf.type === Tone.BitCrusher) {
                effectNodeInstance = new Tone.BitCrusher(effectConf.bits || 4);
                if (effectConf.wet !== undefined) (effectNodeInstance as Tone.BitCrusher).wet.value = effectConf.wet;
            } else if (effectConf.type === Tone.Reverb && !(currentOutputNode instanceof Tone.Reverb)) { // Avoid double reverb if already connected to master
                effectNodeInstance = new Tone.Reverb(effectConf.decay || 1.5);
                if (effectConf.wet !== undefined) (effectNodeInstance as Tone.Reverb).wet.value = effectConf.wet;
            }


            if (effectNodeInstance) {
                 effectInstances.push(effectNodeInstance);
            }
        });

        if (effectInstances.length > 0) {
            currentOutputNode.chain(...effectInstances);
            currentOutputNode = effectInstances[effectInstances.length - 1];
        }
    }
    return { instrument, outputNodeToConnect: currentOutputNode, filterEnv };
};


function weightedRandom(items: (string | number)[], weights: number[]): string | number {
    let sum = 0;
    const r = Math.random();
    for (let i = 0; i < items.length; i++) {
        if ((weights[i] ?? 0) <= 0) continue;
        sum += weights[i];
        if (r <= sum) return items[i];
    }
    const validItems = items.filter((_, idx) => (weights[idx] ?? 0) > 0);
    return validItems.length > 0 ? validItems[validItems.length - 1] : (items[items.length - 1] || "4n");
}

function applyHumanization(time: number, intensity: number = 0.01): number {
    return time + (Math.random() * 2 - 1) * intensity;
}

export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  const logPrefix = "[WAV_GEN_DYNAMIC_V4]";
  console.log(`${logPrefix} Starting dynamic synthesis for: ${params.generatedIdea ? params.generatedIdea.substring(0, 30) : "Untitled"}...`);

  if (typeof Tone === 'undefined' || !Tone.context) {
    console.error(`${logPrefix}_ERROR] Tone.js or Tone.context is not available. Aborting.`);
    return null;
  }
   if (Tone.context.state !== 'running') {
    console.warn(`${logPrefix}_WARN] Global Tone.context is NOT 'running' (state: ${Tone.context.state}). This function expects Tone.start() to have been called via user gesture.`);
    return null;
  }

  Tone.Transport.stop(true); Tone.Transport.cancel(0);
  Tone.Destination.volume.value = 0; // Master volume muted during offline render
  Tone.Transport.bpm.value = params.tempoBpm || 120;

  const genreLower = typeof params.selectedGenre === 'string' ? params.selectedGenre.toLowerCase() : "";
  const isKidsMode = params.originalInput.mode === 'kids';
  const { harmonicComplexity = 0.3, rhythmicDensity = 0.5, targetArousal = 0, targetValence = 0 } = params;

  if (genreLower.includes("jazz") || genreLower.includes("swing") || (genreLower.includes("blues") && rhythmicDensity > 0.4)) {
    Tone.Transport.swing = 0.20;
    Tone.Transport.swingSubdivision = "8n";
  } else {
    Tone.Transport.swing = 0;
  }
  console.log(`${logPrefix} Transport BPM: ${Tone.Transport.bpm.value}, Swing: ${Tone.Transport.swing}`);

  const activeSynthConfigs = getSynthConfigurations(params.instrumentHints, params.selectedGenre, isKidsMode, harmonicComplexity, rhythmicDensity);

  const startOffset = 0.1;
  const secondsPerBeat = 60 / (Tone.Transport.bpm.value);
  const beatsPerMeasure = 4;
  const measureDurationSeconds = beatsPerMeasure * secondsPerBeat;
  let overallMaxTime = startOffset;

  const progressionDegreesInput = params.originalInput.mode === 'kids' ? [1, 4, 5, 1] :
                                (genreLower.includes("blues") ? [1,1,4,1,5,4,1,1] :
                                (genreLower.includes("jazz") ? [2,5,1,6] : // II-V-I-VI
                                 (genreLower.includes("ai") && harmonicComplexity > 0.5 ? [1,3,6,2] : // More unusual for AI
                                 [1, 5, 6, 4])))); // Common I-V-vi-IV
  const numChordCycles = isKidsMode ? 2 : (genreLower.includes("ambient") || genreLower.includes("ai") ? 3 : (genreLower.includes("blues") ? 1 : 4));
  const totalChordProgressionSeconds = numChordCycles * progressionDegreesInput.length * measureDurationSeconds;

  const melodyNotesToSchedule: { time: number, note: string, duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const melodyOctave = isKidsMode ? 4 : (genreLower.includes("jazz") || genreLower.includes("classical") || (genreLower.includes("ai") && harmonicComplexity > 0.4) ? 5 : 4);
  const scaleNoteNames = getScaleNoteNames(params.keySignature, params.mode, melodyOctave, params.selectedGenre, harmonicComplexity);
  let melodyCurrentTime = startOffset;
  let lastMelodyEventTime = -TIME_EPSILON;
  let lastMelodyNoteMidi = -1;
  let melodyNoteCounter = 0;

  if (scaleNoteNames.length > 0) {
      let currentMelodyScaleIndex = Math.floor(Math.random() * scaleNoteNames.length);
      if(scaleNoteNames[currentMelodyScaleIndex]) lastMelodyNoteMidi = robustNoteToMidi(scaleNoteNames[currentMelodyScaleIndex]);

      while (melodyCurrentTime < totalChordProgressionSeconds - TIME_EPSILON) {
          let noteDurationNotation: string;
          const arousalFactor = (targetArousal + 1) / 2; // Normalize arousal to 0-1

          if (isKidsMode) {
            noteDurationNotation = weightedRandom(["4n", "8n", "2n"], [0.60 + rhythmicDensity*0.1, 0.30 - rhythmicDensity*0.05, 0.1]) as string;
          } else if (genreLower.includes("ai")) {
             noteDurationNotation = weightedRandom(["1m", "2n", "4n", "dotted8n"], [0.2 + harmonicComplexity*0.2, 0.3, 0.3, 0.2 - harmonicComplexity*0.1]) as string;
          } else if (genreLower.includes("jazz") && rhythmicDensity > 0.3) {
            noteDurationNotation = weightedRandom(["8n", "16n", "8t", "4n", "dotted8n"], [0.50 + arousalFactor*0.1, 0.15, 0.15, 0.1 - arousalFactor*0.05, 0.1]) as string;
          } else if (rhythmicDensity < 0.33) {
            noteDurationNotation = weightedRandom(["1m", "2n", "4n"], [0.2 + arousalFactor*0.1, 0.5, 0.3 - arousalFactor*0.1]) as string;
          } else if (rhythmicDensity < 0.66) {
            noteDurationNotation = weightedRandom(["2n", "4n", "8n"], [0.15, 0.60, 0.25 + arousalFactor*0.05]) as string;
          } else {
            noteDurationNotation = weightedRandom(["4n", "8n", "16n", "8t"], [0.3, 0.5 + arousalFactor*0.1, 0.15 - arousalFactor*0.05, 0.05]) as string;
          }
          let noteDurationSec = Tone.Time(noteDurationNotation).toSeconds();

          if (melodyCurrentTime + noteDurationSec > totalChordProgressionSeconds + TIME_EPSILON) {
              noteDurationSec = totalChordProgressionSeconds - melodyCurrentTime;
              if (noteDurationSec <= TIME_EPSILON * 5) break;
              if (noteDurationSec >= Tone.Time("1m").toSeconds() - TIME_EPSILON) noteDurationNotation = "1m";
              else if (noteDurationSec >= Tone.Time("2n").toSeconds() - TIME_EPSILON) noteDurationNotation = "2n";
              else if (noteDurationSec >= Tone.Time("4n").toSeconds() - TIME_EPSILON) noteDurationNotation = "4n";
              else if (noteDurationSec >= Tone.Time("8n").toSeconds() - TIME_EPSILON) noteDurationNotation = "8n";
              else if (noteDurationSec >= Tone.Time("16n").toSeconds() - TIME_EPSILON) noteDurationNotation = "16n";
              else break;
              noteDurationSec = Tone.Time(noteDurationNotation).toSeconds();
          }
           if (melodyCurrentTime >= totalChordProgressionSeconds - TIME_EPSILON) break;

          melodyNoteCounter++;
          const restProbabilityBase = isKidsMode ? 0.25 : (genreLower.includes("ai")? 0.35 : 0.18);
          const phraseEndRestProb = isKidsMode ? 0.35 : (genreLower.includes("ai")? 0.45 : 0.28);
          const restProbability = (melodyNoteCounter % (isKidsMode ? 3 : (genreLower.includes("ai")? 2 : 4)) === 0) ? phraseEndRestProb : (restProbabilityBase - (rhythmicDensity * 0.12) - arousalFactor * 0.04);

          if (Math.random() < restProbability && melodyCurrentTime > startOffset + secondsPerBeat * 0.5 && melodyNotesToSchedule.length > 0) {
              let restDurNotation = rhythmicDensity < 0.5 ? "8n" : "16n";
              if (noteDurationNotation === "2n" || noteDurationNotation === "1m") restDurNotation = "4n";
              const restDurSec = Tone.Time(restDurNotation).toSeconds();
              if (melodyCurrentTime + restDurSec <= totalChordProgressionSeconds + TIME_EPSILON) {
                  melodyCurrentTime += restDurSec;
                  melodyNoteCounter = 0;
                  if (melodyCurrentTime >= totalChordProgressionSeconds - TIME_EPSILON) break;
                  continue;
              }
          }

          const currentChordDegree = progressionDegreesInput[Math.floor(melodyCurrentTime / measureDurationSeconds) % progressionDegreesInput.length];
          const chordNotesForMelody = getChordNotesForKey(params.keySignature, params.mode, currentChordDegree, melodyOctave, harmonicComplexity > 0.5, params.selectedGenre, harmonicComplexity)
                                       .map(n => robustNoteToMidi(n));

          let nextNoteMidi;
          const preferChordTone = Math.random() < (isKidsMode ? 0.65 : (genreLower.includes("ai") ? 0.5 : 0.75));
          const preferStepwise = Math.random() < (isKidsMode ? 0.75 : (genreLower.includes("ai") ? 0.4 : 0.85));

          if (preferChordTone && chordNotesForMelody.length > 0) {
              nextNoteMidi = chordNotesForMelody[Math.floor(Math.random() * chordNotesForMelody.length)];
          } else if (preferStepwise && lastMelodyNoteMidi !== -1) {
              const possibleSteps = genreLower.includes("ai") ? [-3, -1, 1, 3, 5, -5] : [-2, -1, 1, 2];
              const nextStep = possibleSteps[Math.floor(Math.random() * possibleSteps.length)];
              let candidateNote = lastMelodyNoteMidi + nextStep;
              const scaleMidiNotes = scaleNoteNames.map(n => robustNoteToMidi(n));
              if (!scaleMidiNotes.includes(candidateNote) && scaleMidiNotes.length > 0) {
                  nextNoteMidi = scaleMidiNotes.reduce((prev, curr) => (Math.abs(curr - candidateNote) < Math.abs(prev - candidateNote) ? curr : prev));
              } else {
                  nextNoteMidi = candidateNote;
              }
          } else {
              currentMelodyScaleIndex = (currentMelodyScaleIndex + (Math.random() < 0.5 ? 1 : -1) + scaleNoteNames.length) % scaleNoteNames.length;
              if(scaleNoteNames[currentMelodyScaleIndex]) nextNoteMidi = robustNoteToMidi(scaleNoteNames[currentMelodyScaleIndex]);
              else nextNoteMidi = DEFAULT_MIDI_NOTE;
          }
          nextNoteMidi = Math.max(21, Math.min(108, nextNoteMidi || DEFAULT_MIDI_NOTE));
          lastMelodyNoteMidi = nextNoteMidi;

          const noteName = midiToNoteName(nextNoteMidi);
          const baseVelMelody = isKidsMode ? 0.50 : (genreLower.includes("ai")? 0.45 : 0.55);
          const velocity = Math.min(0.9, Math.max(0.15, baseVelMelody + (targetArousal * 0.18) + (targetValence * 0.04) + (Math.random() * 0.12 - 0.06) + (melodyNoteCounter === 1 ? 0.04 : 0) ));

          let newTime = applyHumanization(melodyCurrentTime, 0.004);
          if (newTime <= lastMelodyEventTime) newTime = lastMelodyEventTime + TIME_EPSILON;
          if (newTime >= totalChordProgressionSeconds - TIME_EPSILON) break;

          melodyNotesToSchedule.push({ time: newTime, note: noteName, duration: noteDurationNotation, velocity, filterAttack: true });
          lastMelodyEventTime = newTime;
          overallMaxTime = Math.max(overallMaxTime, newTime + noteDurationSec);
          melodyCurrentTime = newTime + noteDurationSec;
      }
  }
  console.log(`${logPrefix} Generated ${melodyNotesToSchedule.length} melody notes. Melody time: ${melodyCurrentTime.toFixed(2)}s`);

  const bassNotesToSchedule: { time: number, note: string, duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const bassOctave = isKidsMode ? 2 : (genreLower.includes("jazz") || genreLower.includes("funk") ? 2 : (genreLower.includes("rock") || genreLower.includes("metal") || genreLower.includes("ai") ? 1 : 2));
  let lastBassEventTime = -TIME_EPSILON;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegreesInput.length; i++) {
        const degree = progressionDegreesInput[i];
        const currentMeasureStartTime = startOffset + (cycle * progressionDegreesInput.length * measureDurationSeconds) + (i * measureDurationSeconds);
        const chordNotesForBass = getChordNotesForKey(params.keySignature, params.mode, degree, bassOctave, harmonicComplexity > 0.5, params.selectedGenre, harmonicComplexity);
        const rootNote = chordNotesForBass[0] || midiToNoteName(DEFAULT_MIDI_NOTE + (bassOctave -4)*12);
        const fifthNote = chordNotesForBass[2 % chordNotesForBass.length] || rootNote;
        const thirdNote = chordNotesForBass[1 % chordNotesForBass.length] || rootNote;
        const scaleForWalk = getScaleNoteNames(params.keySignature, params.mode, bassOctave, params.selectedGenre, harmonicComplexity);

        const baseVelBass = (isKidsMode ? 0.45 : (genreLower.includes("ai")? 0.40 : 0.55)) + (targetArousal * 0.12);

        if (isKidsMode) {
            let time = applyHumanization(currentMeasureStartTime, 0.01);
            if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
            bassNotesToSchedule.push({ time, note: rootNote, duration: "2n", velocity: Math.min(0.70, baseVelBass + 0.1), filterAttack:true });
            lastBassEventTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + Tone.Time("2n").toSeconds());
        } else if (genreLower.includes("jazz")) {
            let currentWalkNoteMidi = robustNoteToMidi(rootNote);
            for (let beat = 0; beat < beatsPerMeasure; beat++) {
                let time = applyHumanization(currentMeasureStartTime + beat * secondsPerBeat, 0.02);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: midiToNoteName(currentWalkNoteMidi), duration: "4n", velocity: Math.min(0.70, baseVelBass + (beat === 0 ? 0.04 : -0.04) + Math.random()*0.03), filterAttack: beat % 2 === 0 });
                lastBassEventTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat);
                const targetNotesMidi = beat < 2 ? [robustNoteToMidi(thirdNote), robustNoteToMidi(fifthNote)] : [robustNoteToMidi(fifthNote), robustNoteToMidi(rootNote) + (Math.random() < 0.3 ? 7 : 0)];
                let closestDist = Infinity;
                let nextNoteMidi = currentWalkNoteMidi;
                [...targetNotesMidi, ...scaleForWalk.map(n => robustNoteToMidi(n))].forEach(tnMidi => {
                    if (tnMidi === currentWalkNoteMidi) return;
                    const dist = Math.abs(tnMidi - currentWalkNoteMidi);
                    if (dist < closestDist && dist <=4 ) {
                        closestDist = dist;
                        nextNoteMidi = tnMidi;
                    }
                });
                currentWalkNoteMidi = nextNoteMidi;
            }
        } else if (genreLower.includes("funk") || genreLower.includes("soul")) {
            const pattern = [
                { note: rootNote, timeOffset: 0, duration: "8n", accent: true }, { rest: true, timeOffset: secondsPerBeat * 0.5, duration: "16n" },
                { note: rootNote, timeOffset: secondsPerBeat * 0.75, duration: "16n", accent: false }, { note: fifthNote, timeOffset: secondsPerBeat * 1.5, duration: "8n", accent: false },
                { rest: true, timeOffset: secondsPerBeat * 2.0, duration: "16n"}, { note: rootNote, timeOffset: secondsPerBeat * 2.25, duration: "16n", accent: true },
                { note: thirdNote, timeOffset: secondsPerBeat * 3.0, duration: "8n", accent: false }, { note: fifthNote, timeOffset: secondsPerBeat * 3.5, duration: "8n", accent: false},
            ];
            pattern.forEach(p => {
                if (p.rest) return;
                let time = applyHumanization(currentMeasureStartTime + p.timeOffset, 0.015);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: p.note as string, duration: p.duration, velocity: Math.min(0.75, baseVelBass + (p.accent ? 0.08 : 0) + Math.random()*0.04), filterAttack: p.accent });
                lastBassEventTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(p.duration).toSeconds());
            });
        } else if ((genreLower.includes("electronic") || genreLower.includes("ai")) && rhythmicDensity > 0.3) {
            const subdivisions = rhythmicDensity > 0.65 ? 4 : (genreLower.includes("ai") && rhythmicDensity > 0.4 ? 3 : 2); // Allow triplets for AI
            const noteDur = subdivisions === 4 ? "16n" : (subdivisions === 3 ? "8t" : "8n");
            for (let beat = 0; beat < beatsPerMeasure * subdivisions; beat++) {
                 let time = applyHumanization(currentMeasureStartTime + beat * (secondsPerBeat / subdivisions), 0.005);
                 if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                 bassNotesToSchedule.push({ time, note: rootNote, duration: noteDur, velocity: Math.min(0.70, baseVelBass + (beat % subdivisions === 0 ? 0.04 : 0)), filterAttack: beat % subdivisions === 0 });
                 lastBassEventTime = time;
                 overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat/subdivisions);
            }
        }
        else { // Default for Rock, Pop, etc.
            for (let beat = 0; beat < beatsPerMeasure; beat++) {
                let time = applyHumanization(currentMeasureStartTime + beat * secondsPerBeat, 0.01);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: (beat === 1 && rhythmicDensity > 0.4 && Math.random() < 0.3) ? fifthNote : rootNote, duration: "4n", velocity: Math.min(0.75, baseVelBass + (beat === 0 || beat === 2 ? 0.08 : -0.04)), filterAttack: beat % 2 === 0 });
                lastBassEventTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat);
            }
        }
    }
  }
  console.log(`${logPrefix} Generated ${bassNotesToSchedule.length} bass notes.`);

  const chordEventsToSchedule: { time: number, notes: string[], duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const chordOctave = isKidsMode ? 3 : (genreLower.includes("jazz") || genreLower.includes("classical") || (genreLower.includes("ai") && harmonicComplexity > 0.5) ? 4 : 3);
  let lastChordEventTime = -TIME_EPSILON;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegreesInput.length; i++) {
      const degree = progressionDegreesInput[i];
      const currentMeasureStartTime = startOffset + (cycle * progressionDegreesInput.length * measureDurationSeconds) + (i * measureDurationSeconds);
      const addSeventhForChord = !isKidsMode && (harmonicComplexity > 0.5 || genreLower.includes("jazz") || genreLower.includes("ai"));
      const chordNoteNames = getChordNotesForKey(params.keySignature, params.mode, degree, chordOctave, addSeventhForChord, params.selectedGenre, harmonicComplexity);

      const baseVelChord = (isKidsMode ? 0.25 : (genreLower.includes("ai") ? 0.20 : 0.35)) + (targetArousal * 0.10) + (targetValence * 0.04);

      if (chordNoteNames.length > 0) {
          if (isKidsMode || genreLower.includes("ambient") || genreLower.includes("classical") || genreLower.includes("ai")) {
            let time = applyHumanization(currentMeasureStartTime, 0.01);
            if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
            chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: genreLower.includes("ai") && rhythmicDensity > 0.5 ? "2n" : "1m", velocity: Math.min(0.55, baseVelChord), filterAttack:true });
            lastChordEventTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + (genreLower.includes("ai") && rhythmicDensity > 0.5 ? measureDurationSeconds/2 : measureDurationSeconds));
          } else if (genreLower.includes("funk") || genreLower.includes("reggae") || (genreLower.includes("electronic") && rhythmicDensity > 0.6)) {
              const numStabs = rhythmicDensity > 0.6 ? (genreLower.includes("reggae") ? 2 : 4) : 2;
              const stabDuration = numStabs === 4 ? "16n" : (genreLower.includes("reggae") ? "4n" : "8n");
              for(let s=0; s < numStabs; s++) {
                  let timeOffset = s * (measureDurationSeconds / numStabs);
                  if (genreLower.includes("reggae")) timeOffset = (s * 2 + 1) * (secondsPerBeat); // Off-beats for reggae
                  let time = applyHumanization(currentMeasureStartTime + timeOffset, 0.015);
                  if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;

                  chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: stabDuration, velocity: Math.min(0.60, baseVelChord + 0.08 + Math.random()*0.04), filterAttack: s % 2 === 0 });
                  lastChordEventTime = time;
                  overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(stabDuration).toSeconds());
                  if (genreLower.includes("reggae") && s >=1) break;
              }
          } else if (genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("country")){
              const strumPattern = rhythmicDensity > 0.55 ? ["0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5"] : ["0", "1", "2", "3"]; // 8ths or Quarters
              const strumDur = rhythmicDensity > 0.55 ? "8n" : "4n";
              strumPattern.forEach(beatOffsetStr => {
                  let time = applyHumanization(currentMeasureStartTime + parseFloat(beatOffsetStr) * secondsPerBeat, 0.01);
                  if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
                  chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: strumDur, velocity: Math.min(0.55, baseVelChord + (beatOffsetStr === "0" ? 0.04 : 0) + Math.random()*0.02), filterAttack: beatOffsetStr === "0" });
                  lastChordEventTime = time;
                  overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(strumDur).toSeconds());
              });
          } else { // Default sustained chords
            let time = applyHumanization(currentMeasureStartTime, 0.01);
            if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
            chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: "1m", velocity: Math.min(0.55, baseVelChord), filterAttack:true });
            lastChordEventTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + measureDurationSeconds);
          }
      }
    }
  }
  console.log(`${logPrefix} Generated ${chordEventsToSchedule.length} chord events.`);

  const arpeggioNotesToSchedule: { time: number, note: string, duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const arpeggioOctave = isKidsMode ? 4 : (harmonicComplexity > 0.3 ? (genreLower.includes("ambient") || genreLower.includes("ai") ? 3 : 4) : 3);
  let lastArpEventTime = -TIME_EPSILON;

  const playArp = !isKidsMode || (isKidsMode && harmonicComplexity > 0.1 && rhythmicDensity > 0.05);
  if (playArp && (genreLower.includes("electronic") || genreLower.includes("pop") || genreLower.includes("ambient") || genreLower.includes("classical") || genreLower.includes("ai") || isKidsMode || harmonicComplexity > 0.4)) {
    chordEventsToSchedule.forEach(chordEvent => {
        const currentChordNotesForArp = chordEvent.notes.map(n => midiToNoteName(robustNoteToMidi(n.replace(/[0-9]+$/, String(arpeggioOctave)))));
        if (currentChordNotesForArp.length > 0) {
            const arpPattern = genreLower.includes("ai") ? [0,2,1,3,0,3,1,2] : [0, 1, 2, 1];
            if (genreLower.includes("classical")) arpPattern.push(0, 2, 1, 2);

            const arpNoteDurationNotation = (rhythmicDensity > 0.4 || genreLower.includes("electronic") || genreLower.includes("ai")) ? "16n" : "8n";
            const arpNoteDurationSeconds = Tone.Time(arpNoteDurationNotation).toSeconds();
            const notesPerBeatForArp = arpNoteDurationNotation === "16n" ? 4 : 2;
            const beatsToArpeggiate = isKidsMode ? (rhythmicDensity > 0.1 ? 1:0) : (rhythmicDensity > 0.2 && harmonicComplexity > 0.2 ? (genreLower.includes("ambient") ? beatsPerMeasure : (genreLower.includes("ai") ? beatsPerMeasure : 2)) : (harmonicComplexity > 0.5 ? 1 : 0));

            for (let beat = 0; beat < beatsToArpeggiate; beat++) {
                for (let i = 0; i < notesPerBeatForArp; i++) {
                    let time = applyHumanization(chordEvent.time + (beat * secondsPerBeat) + (i * arpNoteDurationSeconds), 0.003);
                     if (time < chordEvent.time + Tone.Time(chordEvent.duration).toSeconds() - TIME_EPSILON * 2) {
                        if (time <= lastArpEventTime) time = lastArpEventTime + TIME_EPSILON;
                        const noteIndexInChord = arpPattern[i % arpPattern.length] % currentChordNotesForArp.length;
                        arpeggioNotesToSchedule.push({ time, note: currentChordNotesForArp[noteIndexInChord], duration: arpNoteDurationNotation, velocity: Math.min(0.45, 0.15 + (targetArousal * 0.10) + Math.random() * 0.03), filterAttack: i % 2 === 0 });
                        lastArpEventTime = time;
                        overallMaxTime = Math.max(overallMaxTime, time + arpNoteDurationSeconds);
                    }
                }
            }
        }
    });
  }
  console.log(`${logPrefix} Generated ${arpeggioNotesToSchedule.length} arpeggio notes.`);

  const drumEventsToSchedule: { synth: 'kick' | 'snare' | 'hiHat' | 'tambourine', time: number, duration: string, velocity: number, pitch?: string | number }[] = [];
  const numDrumMeasures = numChordCycles * progressionDegreesInput.length;
  const humanizeAmountDrums = 0.008; // Slightly less humanization for drums to keep them tighter
  let lastDrumTimes = { kick: -TIME_EPSILON, snare: -TIME_EPSILON, hiHat: -TIME_EPSILON, tambourine: -TIME_EPSILON };


  for (let measure = 0; measure < numDrumMeasures; measure++) {
    const baseVelDrum = (isKidsMode ? 0.50 : (genreLower.includes("ai") ? 0.45 : 0.60)) + (targetArousal * 0.18);
    for (let beat = 0; beat < beatsPerMeasure; beat++) {
      const beatStartTime = startOffset + (measure * measureDurationSeconds) + (beat * secondsPerBeat);

      let addKick = false; let kickTime = beatStartTime;
      if (isKidsMode) { addKick = beat === 0;
      } else if (genreLower.includes("electronic") || genreLower.includes("house") || genreLower.includes("techno") || (genreLower.includes("ai") && rhythmicDensity > 0.4)) { addKick = true;
      } else if (genreLower.includes("funk") || genreLower.includes("soul")) { addKick = (beat === 0) || (beat === 2 && Math.random() < 0.6) || (Math.random() < rhythmicDensity * 0.35);
          if(addKick && beat > 0) kickTime = beatStartTime + (Math.random() < 0.5 ? -secondsPerBeat*0.25 : secondsPerBeat*0.25) * (Math.random()*0.5);
      } else { addKick = beat === 0 || beat === 2;
      }
      if (addKick) {
        let time = applyHumanization(kickTime, humanizeAmountDrums);
        if (time <= lastDrumTimes.kick) time = lastDrumTimes.kick + TIME_EPSILON;
        const kickPitch = activeSynthConfigs.useAiPerc ? undefined : "C2"; // No specific pitch for AI perc
        drumEventsToSchedule.push({ synth: 'kick', time, duration: "8n", velocity: Math.min(0.90, baseVelDrum + 0.18), pitch: kickPitch });
        lastDrumTimes.kick = time;
      }

      let addSnare = false; let snareTime = beatStartTime;
      if (isKidsMode) { addSnare = activeSynthConfigs.tambourine ? false : beat === 2;
      } else if (genreLower.includes("electronic") || genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("funk") || genreLower.includes("soul") || genreLower.includes("country") || (genreLower.includes("ai") && rhythmicDensity > 0.3)) { addSnare = beat === 1 || beat === 3;
      } else if (genreLower.includes("jazz")) { addSnare = (beat === 1 || beat === 3) && Math.random() < 0.25;
      } else if (genreLower.includes("reggae")) { addSnare = beat === 2; }
      if (addSnare) {
        let time = applyHumanization(snareTime, humanizeAmountDrums * 1.2);
        if (time <= lastDrumTimes.snare) time = lastDrumTimes.snare + TIME_EPSILON;
        const snarePitch = activeSynthConfigs.useAiPerc ? undefined : "D2";
        drumEventsToSchedule.push({ synth: 'snare', time, duration: "16n", velocity: Math.min(0.85, baseVelDrum + 0.08), pitch: snarePitch });
        lastDrumTimes.snare = time;
      }

      if (isKidsMode && activeSynthConfigs.tambourine && (beat === 1 || beat === 3)) {
         let time = applyHumanization(beatStartTime, humanizeAmountDrums);
         if (time <= lastDrumTimes.tambourine) time = lastDrumTimes.tambourine + TIME_EPSILON;
         drumEventsToSchedule.push({synth: 'tambourine', time, duration: "8n", velocity: Math.min(0.65, baseVelDrum - 0.06)});
         lastDrumTimes.tambourine = time;
      }

      let hiHatSubdivisions = 0;
      if (isKidsMode) { hiHatSubdivisions = rhythmicDensity > 0.3 ? 1 : 0;
      } else if (genreLower.includes("jazz") || genreLower.includes("swing") || (genreLower.includes("blues") && rhythmicDensity > 0.3)) { hiHatSubdivisions = 3;
      } else if (genreLower.includes("funk") || genreLower.includes("soul") || ((genreLower.includes("electronic") || genreLower.includes("ai")) && rhythmicDensity > 0.55)) { hiHatSubdivisions = 4;
      } else if (rhythmicDensity > 0.15) { hiHatSubdivisions = 2;
      }

      if (hiHatSubdivisions > 0) {
        const hiHatNoteDuration = hiHatSubdivisions === 1 ? "4n" : hiHatSubdivisions === 2 ? "8n" : hiHatSubdivisions === 3 ? "8t" : "16n";
        for (let subBeat = 0; subBeat < hiHatSubdivisions; subBeat++) {
          let time = applyHumanization(beatStartTime + (subBeat * (secondsPerBeat / hiHatSubdivisions)), humanizeAmountDrums * 0.5);
           if (Tone.Transport.swing > 0 && hiHatSubdivisions === 2 && subBeat === 1) time += Tone.Transport.swing * (secondsPerBeat/2) * 0.5;
           if (Tone.Transport.swing > 0 && hiHatSubdivisions === 3 && subBeat > 0) time += Tone.Transport.swing * (secondsPerBeat/3) * (subBeat === 1 ? 0.33 : 0.66) * 0.5;

          if (time <= lastDrumTimes.hiHat) time = lastDrumTimes.hiHat + TIME_EPSILON;

          const hiHatPitchForToneJS = activeSynthConfigs.hiHat.frequency || 400;
          const hiHatVelocity = Math.min(0.55, (baseVelDrum * 0.45) + (Math.random() * 0.08) - (subBeat % 2 === 1 && hiHatSubdivisions > 1 ? 0.04:0) );

          if (!isKidsMode && !genreLower.includes("jazz") && !genreLower.includes("classical") && hiHatSubdivisions >= 2 && subBeat === hiHatSubdivisions -1 && Math.random() < 0.15) {
              drumEventsToSchedule.push({ synth: 'hiHat', time, duration: "8n", velocity: hiHatVelocity + 0.08, pitch: hiHatPitchForToneJS + 100 }); // Open hi-hat feel
          } else {
              drumEventsToSchedule.push({ synth: 'hiHat', time, duration: hiHatNoteDuration, velocity: hiHatVelocity, pitch: hiHatPitchForToneJS });
          }
          lastDrumTimes.hiHat = time;
        }
      }
    }
    if (!isKidsMode && (measure + 1) % 4 === 0 && measure < numDrumMeasures -1 && rhythmicDensity > 0.5 && (genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("funk"))){
        const fillStartTime = startOffset + ((measure + 1) * measureDurationSeconds) - secondsPerBeat;
        for(let f=0; f<4; f++){
            let time = applyHumanization(fillStartTime + f * (secondsPerBeat/4), humanizeAmountDrums*0.8);
            if (time <= lastDrumTimes.snare) time = lastDrumTimes.snare + TIME_EPSILON;
            const snarePitch = activeSynthConfigs.useAiPerc ? undefined : "D2";
            drumEventsToSchedule.push({synth: 'snare', time, duration: "16n", velocity: Math.min(0.80, baseVelDrum + 0.12 + Math.random()*0.04), pitch: snarePitch});
            lastDrumTimes.snare = time;
        }
    }
  }
  drumEventsToSchedule.forEach(ev => { overallMaxTime = Math.max(overallMaxTime, ev.time + Tone.Time(ev.duration).toSeconds()); });
  console.log(`${logPrefix} Generated ${drumEventsToSchedule.length} drum events.`);

  const renderDuration = Math.max(overallMaxTime + 3.0, MIN_EFFECTIVE_DURATION_SECONDS); // Add tail
  console.log(`${logPrefix} Calculated renderDuration: ${renderDuration.toFixed(2)}s.`);

  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log(`${logPrefix}_OFFLINE] Inside Tone.Offline. Offline Context SR: ${offlineContext.sampleRate}`);
      offlineContext.transport.bpm.value = Tone.Transport.bpm.value;
      if (Tone.Transport.swing > 0) {
          offlineContext.transport.swing = Tone.Transport.swing;
          offlineContext.transport.swingSubdivision = Tone.Transport.swingSubdivision;
      }

      const masterReverb = new Tone.Reverb(isKidsMode || genreLower.includes("ai") ? 0.8 : 1.8).toDestination();
      masterReverb.wet.value = isKidsMode ? 0.15 : (genreLower.includes("ai") ? 0.30 : 0.25);
      await masterReverb.ready;
      console.log(`${logPrefix}_OFFLINE] Master Reverb created. Wet: ${masterReverb.wet.value}`);

      const melodySynthSetup = createSynth(activeSynthConfigs.melody, offlineContext);
      const melodySynth = melodySynthSetup.instrument;
      melodySynthSetup.outputNodeToConnect.connect(masterReverb);

      const bassSynthSetup = createSynth(activeSynthConfigs.bass, offlineContext);
      const bassSynth = bassSynthSetup.instrument;
      bassSynthSetup.outputNodeToConnect.toDestination();

      const chordSynthSetup = createSynth(activeSynthConfigs.chords, offlineContext);
      const chordSynth = chordSynthSetup.instrument;
      chordSynthSetup.outputNodeToConnect.connect(masterReverb);

      let arpeggioSynth: Tone.Instrument | undefined;
      let arpeggioFilterEnv: Tone.FrequencyEnvelope | undefined;
      if (arpeggioNotesToSchedule.length > 0 && activeSynthConfigs.arpeggio) {
        const arpSynthSetup = createSynth(activeSynthConfigs.arpeggio, offlineContext);
        arpeggioSynth = arpSynthSetup.instrument;
        arpeggioFilterEnv = arpSynthSetup.filterEnv;
        arpSynthSetup.outputNodeToConnect.connect(masterReverb);
      }
      console.log(`${logPrefix}_OFFLINE] Melodic/Harmonic Synths created and connected.`);

      melodyNotesToSchedule.forEach((ev) => {
        (melodySynth as any).triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity);
        if (melodySynthSetup.filterEnv && ev.filterAttack) melodySynthSetup.filterEnv.triggerAttackRelease(ev.duration, ev.time);
      });
      bassNotesToSchedule.forEach((ev) => {
        (bassSynth as any).triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity);
        if (bassSynthSetup.filterEnv && ev.filterAttack) bassSynthSetup.filterEnv.triggerAttackRelease(ev.duration, ev.time);
      });
      chordEventsToSchedule.forEach((ev) => {
        (chordSynth as any).triggerAttackRelease(ev.notes, ev.duration, ev.time, ev.velocity);
        if (chordSynthSetup.filterEnv && ev.filterAttack) chordSynthSetup.filterEnv.triggerAttackRelease(ev.duration, ev.time);
      });
      if (arpeggioSynth) {
        arpeggioNotesToSchedule.forEach((ev) => {
            (arpeggioSynth as any).triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity);
            if (arpeggioFilterEnv && ev.filterAttack) arpeggioFilterEnv.triggerAttackRelease(ev.duration, ev.time);
        });
      }

      console.log(`${logPrefix}_OFFLINE] Setting up drum synths.`);
      const kickSynth = new Tone.MembraneSynth(activeSynthConfigs.kick).toDestination();
      const snareSynth = new Tone.NoiseSynth(activeSynthConfigs.snare).toDestination();
      const hiHatSynth = new Tone.MetalSynth(activeSynthConfigs.hiHat).toDestination();
      let tambourineSynth;
      if (activeSynthConfigs.tambourine) {
        tambourineSynth = new Tone.NoiseSynth(activeSynthConfigs.tambourine).toDestination();
      }
      console.log(`${logPrefix}_OFFLINE] Drum synths created.`);

      drumEventsToSchedule.forEach(ev => {
        const { synth, time, duration, velocity, pitch } = ev;
        if (synth === 'kick') {
          kickSynth.triggerAttackRelease(pitch as string || "C2", duration, time, velocity);
        } else if (synth === 'snare') {
          snareSynth.triggerAttackRelease(duration, time, velocity);
        } else if (synth === 'hiHat') {
          hiHatSynth.triggerAttackRelease(pitch as string | number, duration, time, velocity);
        } else if (synth === 'tambourine' && tambourineSynth) {
            tambourineSynth.triggerAttackRelease(duration, time, velocity);
        }
      });
      console.log(`${logPrefix}_OFFLINE] All events scheduled for offline rendering.`);

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
    if (isSilent) console.warn(`${logPrefix}_WARN] Rendered AudioBuffer appears to be silent or very quiet. Max sample value: ${maxVal.toExponential(3)}`);
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

