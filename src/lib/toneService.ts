
'use client';
import * as Tone from 'tone';
import type { MusicParameters } from '@/types';
import { audioBufferToWav } from "./audioBufferToWav";

const SAFE_OSC_TYPE = 'triangle' as const;
const MIN_EFFECTIVE_DURATION_SECONDS = 4.0;
const TIME_EPSILON = 0.00001; // Small offset to ensure unique times

function weightedRandom(items: (string | number)[], weights: number[]): string | number {
    let sum = 0;
    const r = Math.random();
    for (let i = 0; i < items.length; i++) {
        if (weights[i] < 0) continue;
        sum += weights[i];
        if (r <= sum) return items[i];
    }
    const validItems = items.filter((_, idx) => (weights[idx] ?? 0) > 0);
    return validItems.length > 0 ? validItems[validItems.length - 1] : (items[items.length - 1] || "4n");
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

const STANDARD_MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const STANDARD_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
const BLUES_SCALE_INTERVALS = [0, 3, 5, 6, 7, 10];
const MAJOR_PENTATONIC_INTERVALS = [0, 2, 4, 7, 9];
const MINOR_PENTATONIC_INTERVALS = [0, 3, 5, 7, 10];
const DORIAN_INTERVALS = [0, 2, 3, 5, 7, 9, 10];
const MIXOLYDIAN_INTERVALS = [0, 2, 4, 5, 7, 9, 10];


function getScaleNoteNames(keySignature: string, mode: string, startOctave: number = 4, genre?: string): string[] {
    const baseKeyForScale = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const rootMidiBase = robustNoteToMidi(baseKeyForScale + '0') % 12;
    const genreLower = genre?.toLowerCase();
    const isKids = mode.toLowerCase().includes('kids');

    let intervals: number[];
    if (isKids) {
        intervals = MAJOR_PENTATONIC_INTERVALS; // Default to major pentatonic for kids
    } else if (genreLower?.includes('blues')) {
        intervals = BLUES_SCALE_INTERVALS;
    } else if (genreLower?.includes('jazz') && mode.toLowerCase().includes('minor')) {
        intervals = DORIAN_INTERVALS;
    } else if (genreLower?.includes('jazz')) {
        intervals = MIXOLYDIAN_INTERVALS;
    } else if ((genreLower?.includes('folk') || genreLower?.includes('country')) && mode.toLowerCase().includes('minor')) {
        intervals = MINOR_PENTATONIC_INTERVALS;
    } else if (genreLower?.includes('folk') || genreLower?.includes('country')) {
        intervals = MAJOR_PENTATONIC_INTERVALS;
    } else if (mode.toLowerCase().includes('minor')) {
        intervals = STANDARD_MINOR_INTERVALS;
    } else {
        intervals = STANDARD_MAJOR_INTERVALS;
    }

    return intervals.map(interval => {
        const currentMidiValue = rootMidiBase + interval;
        const octaveOffset = Math.floor(currentMidiValue / 12);
        const noteMidiNumber = (currentMidiValue % 12) + (startOctave + octaveOffset + 1) * 12;
        return midiToNoteName(noteMidiNumber);
    });
}

function getChordNotesForKey(keySignature: string, mode: string, degree: number, octave: number = 3, addSeventh: boolean = false, harmonicComplexity: number = 0.3): string[] {
    const rootNoteName = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const fullScaleForChordRoots = getScaleNoteNames(rootNoteName, mode.replace('kids', ''), octave); // Use standard scale for chord root finding
    
    if (fullScaleForChordRoots.length === 0) return [midiToNoteName(DEFAULT_MIDI_NOTE + (octave - 4) * 12)];

    const chordRootInScaleOctave = fullScaleForChordRoots[(degree - 1 + fullScaleForChordRoots.length) % fullScaleForChordRoots.length];
    const finalChordRootMidi = robustNoteToMidi(chordRootInScaleOctave); // Already in correct octave from getScaleNoteNames

    let thirdInterval = 4; let fifthInterval = 7; let seventhInterval = 10;
    const isMinorKeyOverall = mode.toLowerCase().includes('minor');

    // Diatonic chord qualities based on major key system, then adjusted for minor
    const majorKeyQualities = [
        { third: 4, fifth: 7, seventh: 11 }, // I Maj7
        { third: 3, fifth: 7, seventh: 10 }, // ii m7
        { third: 3, fifth: 7, seventh: 10 }, // iii m7
        { third: 4, fifth: 7, seventh: 11 }, // IV Maj7
        { third: 4, fifth: 7, seventh: 10 }, // V Dom7
        { third: 3, fifth: 7, seventh: 10 }, // vi m7
        { third: 3, fifth: 6, seventh: 10 }, // vii m7b5
    ];

    const qualityIndex = (degree - 1 + 7) % 7;
    let quality = majorKeyQualities[qualityIndex];

    if (isMinorKeyOverall) {
        // Adjust for natural minor based on its relationship to relative major
        // Minor tonic is vi of relative major. So, degree 1 in minor is like degree 6 in major.
        const relativeMajorDegree = (degree + 5 -1 + 7) % 7; // e.g. minor tonic (1) is major's 6th degree
        quality = majorKeyQualities[relativeMajorDegree];
        // Common alteration: V chord in minor is often Major/Dominant
        if (degree === 5 && harmonicComplexity > 0.4) {
             quality = majorKeyQualities[4]; // Make V dominant in minor
        }
    }
    
    thirdInterval = quality.third;
    fifthInterval = quality.fifth;
    seventhInterval = quality.seventh;

    const notes = [
        midiToNoteName(finalChordRootMidi),
        midiToNoteName(finalChordRootMidi + thirdInterval),
        midiToNoteName(finalChordRootMidi + fifthInterval)
    ];
    if (addSeventh || harmonicComplexity > 0.6) {
        notes.push(midiToNoteName(finalChordRootMidi + seventhInterval));
    }
    return notes.filter(name => name && typeof name === 'string');
}


const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genre: string = '',
  isKidsMode: boolean = false,
  harmonicComplexity: number = 0.3,
): any => {
  const genreLower = genre.toLowerCase();
  const hintsLower = instrumentHints.map(h => h.toLowerCase());

  // Base configurations with more variety
  const baseConfigs = {
    pianoMelody: { synthType: Tone.FMSynth, options: { harmonicity: 3.1, modulationIndex: 12, detune: 0, oscillator: { type: "sine" as const, partials: [1, 0.1, 0.05] }, envelope: { attack: 0.005, decay: 0.6, sustain: 0.1, release: 0.8 }, modulation: { type: "triangle" as const }, modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.01, release: 0.4 } }, volume: -9, effects: [{type: Tone.Chorus, frequency: 0.7, delayTime: 3, depth: 0.1, feedback: 0.03}] },
    electricPianoChords: { synthType: Tone.PolySynth, subType: Tone.FMSynth, options: { harmonicity: 2.5, modulationIndex: 8, envelope: { attack: 0.03, decay: 1.0, sustain: 0.2, release: 1.2 }, oscillator: {type: "sine" as const, partials: [1, 0.5, 0.1]} }, volume: -20, effects: [{type: Tone.Chorus, frequency: 1.2, delayTime: 2.8, depth: 0.3}] },
    warmPadChords: { synthType: Tone.PolySynth, subType: Tone.AMSynth, options: { harmonicity: 0.8, modulationType: "sawtooth" as const, envelope: { attack: 1.2, decay: 1.8, sustain: 0.7, release: 3.0 } }, volume: -24 },
    pluckArp: { synthType: Tone.PluckSynth, options: { attackNoise: 0.7, dampening: 3500, resonance: 0.80 }, volume: -20 },
    acousticGuitarArp: { synthType: Tone.PluckSynth, options: { attackNoise: 1.0, dampening: 2800, resonance: 0.65 }, volume: -18 },
    
    synthLeadElectronic: { synthType: Tone.Synth, options: { oscillator: { type: "fatsawtooth" as const, count: 3, spread: 30 }, envelope: { attack: 0.03, decay: 1.2, sustain: 0.4, release: 0.9 } }, volume: -10, effects: [{type: Tone.FeedbackDelay, delayTime: "8n", feedback: 0.3, wet:0.25}] },
    rockGuitarLead: { synthType: Tone.Synth, options: { oscillator: { type: "fatsquare" as const, count: 2, spread: 20 }, envelope: { attack: 0.01, decay: 0.7, sustain: 0.2, release: 0.5 } }, volume: -10, effects: [{type: Tone.Distortion, amount: 0.4}] },
    
    defaultBass: { synthType: Tone.FMSynth, options: { harmonicity: 1.0, modulationIndex: 2.5, envelope: { attack: 0.015, decay: 0.2, sustain: 0.8, release: 0.6 }, oscillator: { type: "triangle" as const } }, volume: -9 },
    subBassElectronic: { synthType: Tone.Synth, options: { oscillator: { type: "sine" as const }, envelope: { attack: 0.015, decay: 0.4, sustain: 1, release: 0.7 } }, volume: -8 },
    rockBassPicked: { synthType: Tone.Synth, options: { oscillator: {type: "fatsquare" as const, count:2, spread:15}, envelope: { attack: 0.012, decay: 0.35, sustain: 0.6, release: 0.55 }}, volume: -9, effects: [{type: Tone.Distortion, amount: 0.15}]},
    jazzUprightBass: { synthType: Tone.FMSynth, options: { harmonicity: 0.7, modulationIndex: 1.8, envelope: { attack: 0.025, decay: 0.6, sustain: 0.15, release: 0.8 }, oscillator:{type:"sine" as const}}, volume: -10},

    kidsToyPiano: { synthType: Tone.FMSynth, options: { harmonicity: 4.5, modulationIndex: 8, oscillator: {type: "triangle" as const}, envelope: {attack: 0.005, decay: 0.2, sustain: 0.01, release: 0.15}}, volume: -10},
    kidsXylophone: { synthType: Tone.MetalSynth, options: { harmonicity: 6, modulationIndex: 5, octaves:1.5, envelope: {attack:0.001, decay:0.3, release:0.3}}, volume: -9},
    kidsUkuleleBass: { synthType: Tone.PluckSynth, options: {attackNoise: 0.6, dampening: 2000, resonance: 0.6}, volume: -12},
    kidsSimplePad: { synthType: Tone.PolySynth, subType: Tone.Synth, options: {oscillator: {type: "triangle" as const}, envelope: {attack: 0.2, decay:0.5, sustain:0.5, release:0.8}}, volume: -22},
    kidsSimpleArp: { synthType: Tone.Synth, options: {oscillator: {type: "square" as const }, envelope: {attack:0.01, decay:0.1, sustain:0.2, release:0.2}}, volume: -24},

    // Drums (volumes adjusted for better mix presence initially)
    kick: { pitchDecay: 0.04, octaves: 5, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.3, sustain: 0.005, release: 1.0, attackCurve: "exponential" as const }, volume: -4 },
    kickElectronic: { pitchDecay: 0.05, octaves: 6, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.2 }, volume: -2 },
    kickRock: { pitchDecay: 0.025, octaves: 4.5, envelope: { attack: 0.002, decay: 0.2, sustain: 0.001, release: 0.8 }, volume: -3 },
    snare: { noise: { type: 'pink' as const, playbackRate: 0.8 }, volume: -10, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.12 } },
    snareElectronic: { noise: { type: 'white' as const, playbackRate: 1.0 }, volume: -8, envelope: { attack: 0.002, decay: 0.1, sustain: 0.01, release: 0.15 } },
    hiHat: { frequency: 400, envelope: { attack: 0.001, decay: 0.04, release: 0.04 }, harmonicity: 3.0, modulationIndex: 10, resonance: 2500, octaves: 1.2, volume: -18 }, // Slightly louder
    hiHatElectronic: { frequency: 500, envelope: { attack: 0.001, decay: 0.025, release: 0.03 }, harmonicity: 2.5, modulationIndex: 8, resonance: 3000, octaves: 1.0, volume: -16 },
    
    kidsKick: { pitchDecay: 0.04, octaves: 4, envelope: { attack: 0.002, decay: 0.15, sustain: 0.01, release: 0.5 }, volume: -6 },
    kidsSnare: { noise: { type: 'white' as const }, volume: -14, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.08 } },
    kidsHiHat: { frequency: 450, envelope: { attack: 0.001, decay: 0.02, release: 0.02 }, harmonicity: 2.5, octaves: 1, volume: -20 },
    tambourine: { noise: {type: 'white' as const, playbackRate: 1.5}, envelope: {attack:0.005, decay:0.05, sustain:0, release:0.06}, volume: -18},
  };

  let melodyConf = { ...baseConfigs.pianoMelody }; // Default to piano
  let bassConf = { ...baseConfigs.defaultBass };
  let chordsConf = { ...baseConfigs.warmPadChords }; // Default to warm pad
  let arpConf = { ...baseConfigs.pluckArp };
  let kickConf = isKidsMode ? { ...baseConfigs.kidsKick } : { ...baseConfigs.kick };
  let snareConf = isKidsMode ? { ...baseConfigs.kidsSnare } : { ...baseConfigs.snare };
  let hiHatConf = isKidsMode ? { ...baseConfigs.kidsHiHat } : { ...baseConfigs.hiHat };
  let useTambourine = false;

  if (isKidsMode) {
    melodyConf = Math.random() < 0.5 ? {...baseConfigs.kidsToyPiano} : {...baseConfigs.kidsXylophone};
    bassConf = {...baseConfigs.kidsUkuleleBass};
    chordsConf = {...baseConfigs.kidsSimplePad};
    arpConf = {...baseConfigs.kidsSimpleArp};
    if (hintsLower.some(h => h.includes("tambourine") || h.includes("shaker"))) useTambourine = true;
  } else {
    // Genre-based adjustments
    if (genreLower.includes("electronic")) {
      melodyConf = { ...baseConfigs.synthLeadElectronic };
      bassConf = { ...baseConfigs.subBassElectronic };
      chordsConf = { ...baseConfigs.warmPadChords, volume: -22 }; // Slightly quieter pad for electronic
      arpConf = { ...baseConfigs.pluckArp, volume: -20 };
      kickConf = { ...baseConfigs.kickElectronic };
      snareConf = { ...baseConfigs.snareElectronic };
      hiHatConf = { ...baseConfigs.hiHatElectronic };
    } else if (genreLower.includes("rock") || genreLower.includes("metal")) {
      melodyConf = { ...baseConfigs.rockGuitarLead };
      bassConf = { ...baseConfigs.rockBassPicked };
      chordsConf = { ...baseConfigs.rockGuitarLead, synthType: Tone.PolySynth, subType: Tone.Synth, options: {...baseConfigs.rockGuitarLead.options}, volume: -18 }; // Power chords essentially
      arpConf = { ...baseConfigs.defaultBass, volume: -26 }; 
      kickConf = { ...baseConfigs.kickRock };
    } else if (genreLower.includes("jazz")) {
      melodyConf = { ...baseConfigs.pianoMelody, volume: -10 };
      bassConf = { ...baseConfigs.jazzUprightBass };
      chordsConf = { ...baseConfigs.electricPianoChords, volume: -18 };
      arpConf = { ...baseConfigs.pluckArp, volume: -25 };
      kickConf = { ...baseConfigs.kick, volume: -12 }; // Lighter kick
      snareConf = { ...baseConfigs.snare, volume: -18 }; // Lighter snare/brushes
      hiHatConf = { ...baseConfigs.hiHat, frequency: 550, volume: -22 }; // More ride-like
    } else if (genreLower.includes("ambient")) {
        melodyConf = { ...baseConfigs.warmPadChords, synthType: Tone.PolySynth, subType: Tone.AMSynth, volume: -18 };
        bassConf = { ...baseConfigs.subBassElectronic, volume: -15 };
        chordsConf = { ...baseConfigs.warmPadChords, volume: -20 };
        arpConf = { ...baseConfigs.pluckArp, volume: -24, options: {...baseConfigs.pluckArp.options, dampening: 4500, attackNoise: 0.4}};
    } else if (genreLower.includes("folk") || genreLower.includes("country")) {
        melodyConf = { ...baseConfigs.acousticGuitarArp, synthType: Tone.PluckSynth, options: {...baseConfigs.acousticGuitarArp.options}, volume: -12 };
        bassConf = { ...baseConfigs.jazzUprightBass, volume: -14}; 
        chordsConf = { synthType: Tone.PolySynth, subType: Tone.PluckSynth, options: {...baseConfigs.acousticGuitarArp.options}, volume: -18 };
        arpConf = { ...baseConfigs.acousticGuitarArp, volume: -20 };
        if (hintsLower.some(h => h.includes("tambourine"))) useTambourine = true;
    } else if (genreLower.includes("funk") || genreLower.includes("soul")) {
        melodyConf = { ...baseConfigs.electricPianoChords, synthType: Tone.PolySynth, subType: Tone.FMSynth, volume: -12}; 
        bassConf = { ...baseConfigs.defaultBass, options: {...baseConfigs.defaultBass.options, harmonicity: 1.3, modulationIndex: 3.8, oscillator: {type: "sawtooth" as const}}, volume: -8};
        chordsConf = { ...baseConfigs.electricPianoChords, volume: -17};
        arpConf = { ...baseConfigs.pluckArp, volume: -22};
        kickConf = { ...baseConfigs.kick, volume: -3 };
        snareConf = { ...baseConfigs.snare, volume: -9 };
        hiHatConf = { ...baseConfigs.hiHat, volume: -17 };
    } else if (genreLower.includes("classical") || genreLower.includes("cinematic")) {
        melodyConf = { ...baseConfigs.pianoMelody, volume: -10 }; 
        bassConf = { ...baseConfigs.defaultBass, options: {...baseConfigs.defaultBass.options, oscillator:{type:"sine" as const}}, volume: -15 }; 
        chordsConf = { ...baseConfigs.warmPadChords, volume: -20 }; 
        arpConf = { ...baseConfigs.pluckArp, volume: -22 }; 
    }

    // Override with specific instrument hints (higher priority)
    hintsLower.forEach(hint => {
      if (hint.includes('piano')) {
        melodyConf = { ...baseConfigs.pianoMelody, volume: -9 };
        if (!hintsLower.some(h => /pad|string/i.test(h))) { // Don't override pads if also mentioned
            chordsConf = { ...baseConfigs.pianoMelody, synthType: Tone.PolySynth, subType: Tone.FMSynth, options: {...baseConfigs.pianoMelody.options}, volume: -18 };
        }
      } else if (hint.includes('electric piano')) {
        melodyConf = { ...baseConfigs.electricPianoChords, synthType: Tone.PolySynth, subType: Tone.FMSynth, options: {...baseConfigs.electricPianoChords.options}, volume: -12};
        chordsConf = { ...baseConfigs.electricPianoChords, volume: -20 };
      } else if (hint.includes('synth pad') || hint.includes('warm pad')) {
        chordsConf = { ...baseConfigs.warmPadChords, volume: -22 };
        if (!hintsLower.some(h => /piano|lead|guitar|pluck/i.test(h))) melodyConf = {...baseConfigs.warmPadChords, synthType: Tone.PolySynth, subType: Tone.AMSynth, volume: -15};
      } else if (hint.includes('pluck') || hint.includes('bell') || hint.includes('xylophone')) {
        melodyConf = { ...baseConfigs.pluckArp, synthType: Tone.PluckSynth, options: {...baseConfigs.pluckArp.options}, volume: -15 };
        arpConf = { ...baseConfigs.pluckArp, volume: -18 };
      } else if (hint.includes('synth lead') || hint.includes('bright synth')) {
        melodyConf = { ...baseConfigs.synthLeadElectronic, volume: -10 };
      } else if (hint.includes('guitar') && hint.includes('acoustic')) {
          melodyConf = {...baseConfigs.acousticGuitarArp, synthType: Tone.PluckSynth, options: {...baseConfigs.acousticGuitarArp.options}, volume: -12};
          chordsConf = {synthType: Tone.PolySynth, subType: Tone.PluckSynth, options: {...baseConfigs.acousticGuitarArp.options}, volume: -18};
          arpConf = {...baseConfigs.acousticGuitarArp, volume: -20};
      } else if (hint.includes('guitar') && (hint.includes('rock') || hint.includes('electric') || hint.includes('distort'))) {
          melodyConf = {...baseConfigs.rockGuitarLead, volume: -10};
          chordsConf = {...baseConfigs.rockGuitarLead, synthType: Tone.PolySynth, subType: Tone.Synth, options: {...baseConfigs.rockGuitarLead.options}, volume: -18}; // Distorted "power chords"
      } else if (hint.includes('sub bass')) {
          bassConf = {...baseConfigs.subBassElectronic, volume: -8};
      } else if (hint.includes('upright bass') || hint.includes('jazz bass')) {
          bassConf = {...baseConfigs.jazzUprightBass, volume: -10};
      } else if (hint.includes('picked bass') || (hint.includes('rock') && hint.includes('bass'))) {
          bassConf = {...baseConfigs.rockBassPicked, volume: -9};
      }
    });
  }

  return {
    melody: melodyConf, bass: bassConf, chords: chordsConf, arpeggio: arpConf,
    kick: kickConf, snare: snareConf, hiHat: hiHatConf, tambourine: useTambourine ? {...baseConfigs.tambourine} : null,
  };
};

const createSynth = (config: any, offlineContext: Tone.OfflineContext) => {
    if (!config || !config.synthType) {
        console.warn("[CreateSynth_WARN] Invalid synth config, using default FMSynth", config);
        // Fallback to a very basic FMSynth if config is entirely missing
        const defaultConfig = { synthType: Tone.FMSynth, options: { oscillator: { type: "triangle" as const } }, volume: -12 };
        return new defaultConfig.synthType(defaultConfig.options);
    }
    let synthInstance;
    if (config.synthType === Tone.PolySynth) {
        const subSynthType = config.subType || Tone.Synth; // Default to Tone.Synth if subType not specified
        synthInstance = new Tone.PolySynth(subSynthType, config.options);
    } else {
        synthInstance = new config.synthType(config.options);
    }
    synthInstance.volume.value = config.volume !== undefined ? config.volume : -12;

    let effectChainEndNode = synthInstance;
    if (config.effects && Array.isArray(config.effects)) {
        config.effects.forEach((effectConf: any) => {
            let effectNode;
            if (effectConf.type === Tone.Distortion) {
                effectNode = new Tone.Distortion(effectConf.amount || 0.4);
            } else if (effectConf.type === Tone.Chorus) {
                effectNode = new Tone.Chorus(effectConf.frequency || 1.5, effectConf.delayTime || 3.5, effectConf.depth || 0.7);
                if (effectConf.feedback) (effectNode as Tone.Chorus).feedback.value = effectConf.feedback;
            } else if (effectConf.type === Tone.FeedbackDelay){
                 effectNode = new Tone.FeedbackDelay(effectConf.delayTime || "8n", effectConf.feedback || 0.5);
                 if (effectConf.wet) (effectNode as Tone.FeedbackDelay).wet.value = effectConf.wet;
            }
            if (effectNode) {
                effectChainEndNode.connect(effectNode);
                effectChainEndNode = effectNode; // Update the end of the chain
            }
        });
    }
    // The final node in the chain (either the synth itself or the last effect) is returned.
    // This node will then be connected to reverb or destination.
    return effectChainEndNode;
};


export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  const logPrefix = "[WAV_GEN_DYNAMIC_V3]";
  console.log(`${logPrefix} Starting dynamic synthesis for: ${params.generatedIdea.substring(0, 30)}...`);

  if (typeof Tone === 'undefined' || !Tone.context) {
    console.error(`${logPrefix}_ERROR] Tone.js or Tone.context is not available. Aborting.`);
    return null;
  }
  if (Tone.context.state !== 'running') {
    console.warn(`${logPrefix}_WARN] Global Tone.context is NOT 'running' (state: ${Tone.context.state}). Attempting Tone.start() internally, but this might not be ideal if called not from a direct user gesture.`);
    // await Tone.start(); // This might fail if not a direct user gesture context. MusicOutputDisplay handles the main Tone.start()
    if (Tone.context.state !== 'running') {
        console.error(`${logPrefix}_ERROR] Global Tone.context still NOT 'running' after internal attempt. Aborting WAV generation.`);
        return null;
    }
  }
  
  Tone.Transport.stop(true); Tone.Transport.cancel(0);
  Tone.Destination.volume.value = -6; // Overall mix level slightly reduced
  Tone.Transport.bpm.value = params.tempoBpm || 120;
  
  const genreLower = params.selectedGenre?.toLowerCase() || "";
  if (genreLower.includes("jazz") || genreLower.includes("swing")) {
    Tone.Transport.swing = 0.25; 
    Tone.Transport.swingSubdivision = "8n";
  } else {
    Tone.Transport.swing = 0;
  }
  console.log(`${logPrefix} Transport BPM: ${Tone.Transport.bpm.value}, Swing: ${Tone.Transport.swing}`);

  const isKidsMode = params.originalInput.mode === 'kids';
  const activeSynthConfigs = getSynthConfigurations(params.instrumentHints, params.selectedGenre, isKidsMode, params.harmonicComplexity);

  const startOffset = 0.1; 
  const secondsPerBeat = 60 / (Tone.Transport.bpm.value);
  const beatsPerMeasure = 4;
  const measureDurationSeconds = beatsPerMeasure * secondsPerBeat;
  let overallMaxTime = startOffset;

  const progressionDegrees = params.mode.toLowerCase().includes('minor') ? [1, 6, 3, 7] : [1, 5, 6, 4];
  const numChordCycles = isKidsMode ? 2 : (genreLower.includes("ambient") || genreLower.includes("classical") ? 3 : 4); // Fewer cycles for kids/ambient
  const chordDurationNotation = "1m";
  const totalChordProgressionSeconds = numChordCycles * progressionDegrees.length * measureDurationSeconds;


  // --- Melody Generation ---
  const melodyNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const melodyOctave = isKidsMode ? 5 : (genreLower.includes("jazz") || genreLower.includes("classical") ? 5 : 4);
  const scaleNoteNames = getScaleNoteNames(params.keySignature, params.mode, melodyOctave, params.selectedGenre);
  let melodyCurrentTime = startOffset;
  let currentMelodyScaleIndex = Math.floor(Math.random() * Math.max(1, scaleNoteNames.length));
  
  if (scaleNoteNames.length > 0) {
      while (melodyCurrentTime < totalChordProgressionSeconds - TIME_EPSILON) {
          let noteDurationNotation: string;
          const density = params.rhythmicDensity || 0.5;
          const arousalFactor = (params.targetArousal + 1) / 2; // 0 to 1

          if (isKidsMode) {
            noteDurationNotation = weightedRandom(["4n", "8n", "2n"], [0.6 + density*0.2, 0.3 - density*0.1, 0.1]) as string;
          } else if (genreLower.includes("jazz") && density > 0.3) {
            noteDurationNotation = weightedRandom(["8n", "16n", "8t", "4n"], [0.4 + arousalFactor*0.2, 0.3, 0.2, 0.1 - arousalFactor*0.1]) as string;
          } else if (density < 0.33) {
            noteDurationNotation = weightedRandom(["2n", "4n", "1m"], [0.5, 0.4 - arousalFactor*0.1, 0.1 + arousalFactor*0.1]) as string;
          } else if (density < 0.66) {
            noteDurationNotation = weightedRandom(["4n", "8n", "2n"], [0.5, 0.3 + arousalFactor*0.1, 0.2 - arousalFactor*0.1]) as string;
          } else {
            noteDurationNotation = weightedRandom(["8n", "16n", "4n", "8t"], [0.5 + arousalFactor*0.2, 0.3, 0.15 - arousalFactor*0.1, 0.05]) as string;
          }
          let noteDurationSec = Tone.Time(noteDurationNotation).toSeconds();

          if (melodyCurrentTime + noteDurationSec > totalChordProgressionSeconds + TIME_EPSILON) { // Ensure melody fits
              noteDurationSec = totalChordProgressionSeconds - melodyCurrentTime;
              if (noteDurationSec <= TIME_EPSILON * 2) break; // Too short to schedule
              // Find closest standard duration
              if (noteDurationSec >= Tone.Time("1m").toSeconds() - TIME_EPSILON) noteDurationNotation = "1m";
              else if (noteDurationSec >= Tone.Time("2n").toSeconds() - TIME_EPSILON) noteDurationNotation = "2n";
              else if (noteDurationSec >= Tone.Time("4n").toSeconds() - TIME_EPSILON) noteDurationNotation = "4n";
              else if (noteDurationSec >= Tone.Time("8n").toSeconds() - TIME_EPSILON) noteDurationNotation = "8n";
              else if (noteDurationSec >= Tone.Time("16n").toSeconds() - TIME_EPSILON) noteDurationNotation = "16n";
              else break; 
              noteDurationSec = Tone.Time(noteDurationNotation).toSeconds(); // Recalculate actual duration
          }
           if (melodyCurrentTime >= totalChordProgressionSeconds - TIME_EPSILON) break;

          const restProbability = isKidsMode ? 0.1 : (0.20 - (density * 0.15) - arousalFactor * 0.05);
          if (Math.random() < restProbability && melodyCurrentTime > startOffset + secondsPerBeat * 0.25 && melodyNotesToSchedule.length > 0) {
              let restDurNotation = density < 0.5 ? "8n" : "16n";
              if (noteDurationNotation === "2n" || noteDurationNotation === "1m") restDurNotation = "4n";
              const restDurSec = Tone.Time(restDurNotation).toSeconds();
              if (melodyCurrentTime + restDurSec <= totalChordProgressionSeconds + TIME_EPSILON) {
                  melodyCurrentTime += restDurSec;
                   if (melodyCurrentTime >= totalChordProgressionSeconds - TIME_EPSILON) break;
                  continue;
              }
          }

          const stepRoll = Math.random();
          let step: number;
          if (stepRoll < 0.55) step = Math.random() < 0.5 ? 1 : -1; 
          else if (stepRoll < 0.80) step = Math.random() < 0.5 ? 2 : -2; 
          else step = Math.random() < 0.5 ? (Math.random() < 0.7 ? 3 : 4) : (Math.random() < 0.7 ? -3 : -4); // Occasional larger leaps
          currentMelodyScaleIndex = (currentMelodyScaleIndex + step + scaleNoteNames.length * 7) % scaleNoteNames.length;
          const noteName = scaleNoteNames[currentMelodyScaleIndex];
          
          // Velocity influenced by arousal and a bit of randomness
          const baseVelMelody = isKidsMode ? 0.6 : 0.65;
          const velocity = Math.min(0.95, Math.max(0.25, baseVelMelody + (params.targetArousal * 0.15) + (Math.random() * 0.1 - 0.05)));

          let newTime = melodyCurrentTime;
          if (melodyNotesToSchedule.length > 0) {
            const lastEvent = melodyNotesToSchedule[melodyNotesToSchedule.length - 1];
            const lastEventEndTime = lastEvent.time + Tone.Time(lastEvent.duration).toSeconds();
            if (newTime < lastEventEndTime - TIME_EPSILON) newTime = lastEventEndTime + TIME_EPSILON;
          }
          if (newTime >= totalChordProgressionSeconds - TIME_EPSILON) break;

          melodyNotesToSchedule.push({ time: newTime, note: noteName, duration: noteDurationNotation, velocity });
          overallMaxTime = Math.max(overallMaxTime, newTime + noteDurationSec);
          melodyCurrentTime = newTime + noteDurationSec;
      }
  }
  console.log(`${logPrefix} Generated ${melodyNotesToSchedule.length} melody notes. Melody time: ${melodyCurrentTime.toFixed(2)}s`);

  // --- Bass Line Generation ---
  const bassNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const bassOctave = isKidsMode ? 2 : (genreLower.includes("jazz") || genreLower.includes("funk") ? 2 : (genreLower.includes("rock") || genreLower.includes("metal") ? 1 : 2));
  let lastBassTime = -TIME_EPSILON;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegrees.length; i++) {
        const degree = progressionDegrees[i];
        const measureStartTime = startOffset + (cycle * progressionDegrees.length * measureDurationSeconds) + (i * measureDurationSeconds);
        const chordNotesForBass = getChordNotesForKey(params.keySignature, params.mode, degree, bassOctave, params.harmonicComplexity > 0.5, params.harmonicComplexity);
        const rootNote = chordNotesForBass[0];
        const fifthNote = chordNotesForBass[2 % chordNotesForBass.length] || rootNote; // Fallback to root if no 5th

        const baseVelBass = 0.55 + (params.targetArousal * 0.1);
        
        if (isKidsMode) {
            let time = measureStartTime;
            if (time <= lastBassTime) time = lastBassTime + TIME_EPSILON;
            bassNotesToSchedule.push({ time, note: rootNote, duration: "2n", velocity: Math.min(0.8, baseVelBass + 0.1) });
            lastBassTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + Tone.Time("2n").toSeconds());

            time = measureStartTime + Tone.Time("2n").toSeconds();
            if (time <= lastBassTime) time = lastBassTime + TIME_EPSILON;
            bassNotesToSchedule.push({ time, note: rootNote, duration: "2n", velocity: Math.min(0.8, baseVelBass) });
            lastBassTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + Tone.Time("2n").toSeconds());
        } else if (genreLower.includes("jazz")) {
            const scaleForWalk = getScaleNoteNames(params.keySignature, params.mode, bassOctave, params.selectedGenre);
            let currentWalkNote = rootNote;
            for (let beat = 0; beat < beatsPerMeasure; beat++) {
                let time = measureStartTime + beat * secondsPerBeat;
                if (time <= lastBassTime) time = lastBassTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: currentWalkNote, duration: "4n", velocity: Math.min(0.8, baseVelBass + (beat === 0 ? 0.1 : -0.05) + Math.random()*0.05) });
                lastBassTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat);
                // Simple walk: move to next scale tone, prioritizing chord tones
                const currentRootMidi = robustNoteToMidi(currentWalkNote);
                const nextNoteOptions = scaleForWalk.filter(n => Math.abs(robustNoteToMidi(n) - currentRootMidi) <=2 && n !== currentWalkNote );
                currentWalkNote = nextNoteOptions.length > 0 ? nextNoteOptions[Math.floor(Math.random()*nextNoteOptions.length)] : scaleForWalk[(scaleForWalk.indexOf(currentWalkNote)+1+scaleForWalk.length)%scaleForWalk.length];
            }
        } else if (genreLower.includes("funk") || genreLower.includes("soul")) {
            const pattern = [
                { note: rootNote, timeOffset: 0, duration: "8n", accent: true },
                { note: rootNote, timeOffset: secondsPerBeat * 0.75, duration: "16n", accent: false }, // Syncopated
                { note: fifthNote, timeOffset: secondsPerBeat * 1.5, duration: "8n", accent: false },
                { note: rootNote, timeOffset: secondsPerBeat * 2.5, duration: "8n", accent: true },
                { note: fifthNote, timeOffset: secondsPerBeat * 3.25, duration: "16n", accent: false},
            ];
            pattern.forEach(p => {
                let time = measureStartTime + p.timeOffset;
                if (time <= lastBassTime) time = lastBassTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: p.note, duration: p.duration, velocity: Math.min(0.85, baseVelBass + (p.accent ? 0.15:0) + Math.random()*0.05)});
                lastBassTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(p.duration).toSeconds());
            });
        } else if (genreLower.includes("electronic") && params.rhythmicDensity > 0.4) {
            for (let beat = 0; beat < beatsPerMeasure * 2; beat++) { // 8th notes
                 let time = measureStartTime + beat * (secondsPerBeat / 2);
                 if (time <= lastBassTime) time = lastBassTime + TIME_EPSILON;
                 bassNotesToSchedule.push({ time, note: rootNote, duration: "8n", velocity: Math.min(0.8, baseVelBass + (beat % 2 === 0 ? 0.05 : 0)) });
                 lastBassTime = time;
                 overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat/2);
            }
        }
        else { // Default Rock/Pop/etc. Quarter notes
            for (let beat = 0; beat < beatsPerMeasure; beat++) {
                let time = measureStartTime + beat * secondsPerBeat;
                if (time <= lastBassTime) time = lastBassTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: rootNote, duration: "4n", velocity: Math.min(0.8, baseVelBass + (beat === 0 || beat === 2 ? 0.1 : 0)) });
                lastBassTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat);
            }
        }
    }
  }
  console.log(`${logPrefix} Generated ${bassNotesToSchedule.length} bass notes.`);


  // --- Chord Generation ---
  const chordEventsToSchedule: { time: number, notes: string[], duration: string, velocity: number }[] = [];
  const chordOctave = isKidsMode ? 3 : (genreLower.includes("jazz") || genreLower.includes("classical") ? 4 : 3);
  let lastChordTime = -TIME_EPSILON;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegrees.length; i++) {
      const degree = progressionDegrees[i];
      const measureStartTime = startOffset + (cycle * progressionDegrees.length * measureDurationSeconds) + (i * measureDurationSeconds);
      const addSeventhForChord = !isKidsMode && (params.harmonicComplexity > 0.55 || genreLower.includes("jazz"));
      const chordNoteNames = getChordNotesForKey(params.keySignature, params.mode, degree, chordOctave, addSeventhForChord, params.harmonicComplexity);
      
      const baseVelChord = 0.35 + (params.targetArousal * 0.1);

      if (chordNoteNames.length > 0) {
          if (!isKidsMode && (genreLower.includes("funk") || genreLower.includes("reggae"))) {
              const numStabs = params.rhythmicDensity > 0.5 ? 4 : 2;
              const stabDuration = numStabs === 4 ? "16n" : "8n";
              for(let s=0; s < numStabs; s++) {
                  let time = measureStartTime + s * (measureDurationSeconds / numStabs) + (Math.random()-0.5)*0.03; // Add slight humanization
                  if (s > 0 && time <= lastChordTime) time = lastChordTime + TIME_EPSILON;
                  chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: stabDuration, velocity: Math.min(0.7, baseVelChord + 0.1 + Math.random()*0.05) });
                  lastChordTime = time;
                  overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(stabDuration).toSeconds());
              }
          } else if (!isKidsMode && (genreLower.includes("rock") || genreLower.includes("metal")) && params.rhythmicDensity > 0.4){
              const numStrums = params.rhythmicDensity > 0.7 ? 4 : 2; // More strums for higher density
              const strumDur = numStrums === 4 ? "4n" : "2n";
              for(let s=0; s < numStrums; s++) { 
                 let time = measureStartTime + s * (measureDurationSeconds / numStrums);
                 if (s > 0 && time <= lastChordTime) time = lastChordTime + TIME_EPSILON;
                 chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: strumDur, velocity: Math.min(0.7, baseVelChord + Math.random()*0.1) });
                 lastChordTime = time;
                 overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(strumDur).toSeconds());
              }
          } else { // Default sustained chords
            let time = measureStartTime;
            if (time <= lastChordTime) time = lastChordTime + TIME_EPSILON;
            chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: chordDurationNotation, velocity: Math.min(0.65, baseVelChord) });
            lastChordTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(chordDurationNotation).toSeconds());
          }
      }
    }
  }
  console.log(`${logPrefix} Generated ${chordEventsToSchedule.length} chord events.`);

  // --- Arpeggio Generation ---
  const arpeggioNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const arpeggioOctave = isKidsMode ? 4 : (params.harmonicComplexity > 0.4 ? 5 : 4);
  const arpNoteDurationNotation = !isKidsMode && (params.rhythmicDensity > 0.55 || genreLower.includes("electronic")) ? "16n" : "8n";
  const arpNoteDurationSeconds = Tone.Time(arpNoteDurationNotation).toSeconds();
  let lastArpTime = -TIME_EPSILON;
  
  const shouldPlayArp = !isKidsMode || (isKidsMode && params.harmonicComplexity > 0.15 && params.rhythmicDensity > 0.1);
  if (shouldPlayArp) {
    chordEventsToSchedule.forEach(chordEvent => {
        const currentChordNotesForArp = chordEvent.notes.map(n => midiToNoteName(robustNoteToMidi(n.replace(/[0-9]+$/, String(arpeggioOctave)))));
        if (currentChordNotesForArp.length > 0) {
            const arpPatternBase = [
                currentChordNotesForArp[0],
                currentChordNotesForArp[1 % currentChordNotesForArp.length],
                currentChordNotesForArp[Math.min(2, currentChordNotesForArp.length -1)], // Ensure 3rd note is valid
                currentChordNotesForArp[1 % currentChordNotesForArp.length], // Example: Up-down like
            ];
            const arpPattern = genreLower.includes("classical") ? // Different pattern for classical
                [currentChordNotesForArp[0], currentChordNotesForArp[Math.min(1, currentChordNotesForArp.length-1)], currentChordNotesForArp[Math.min(2, currentChordNotesForArp.length-1)], midiToNoteName(robustNoteToMidi(currentChordNotesForArp[0])+12)]
                : arpPatternBase;

            const notesPerBeatForArp = arpNoteDurationNotation === "16n" ? 4 : 2;
            const beatsToArpeggiate = isKidsMode ? 1 : (params.rhythmicDensity > 0.25 && params.harmonicComplexity > 0.25 ? (genreLower.includes("ambient") ? beatsPerMeasure : 2) : 1);

            for (let beat = 0; beat < beatsToArpeggiate; beat++) {
                for (let i = 0; i < notesPerBeatForArp; i++) {
                    let time = chordEvent.time + (beat * secondsPerBeat) + (i * arpNoteDurationSeconds);
                    if (time < chordEvent.time + Tone.Time(chordEvent.duration).toSeconds() - TIME_EPSILON) {
                        if (time <= lastArpTime) time = lastArpTime + TIME_EPSILON;
                        arpeggioNotesToSchedule.push({ time, note: arpPattern[i % arpPattern.length], duration: arpNoteDurationNotation, velocity: Math.min(0.55, 0.25 + (params.targetArousal * 0.1) + Math.random() * 0.05) });
                        lastArpTime = time;
                        overallMaxTime = Math.max(overallMaxTime, time + arpNoteDurationSeconds);
                    }
                }
            }
        }
    });
  }
  console.log(`${logPrefix} Generated ${arpeggioNotesToSchedule.length} arpeggio notes.`);

  // --- Drum Generation ---
  const drumEventsToSchedule: { synth: 'kick' | 'snare' | 'hiHat' | 'tambourine', time: number, duration: string, velocity: number, pitch?: string | number }[] = [];
  const numDrumMeasures = numChordCycles * progressionDegrees.length;
  let lastKickTimeD = -TIME_EPSILON, lastSnareTimeD = -TIME_EPSILON, lastHiHatTimeD = -TIME_EPSILON, lastTambourineTimeD = -TIME_EPSILON;

  for (let measure = 0; measure < numDrumMeasures; measure++) {
    for (let beat = 0; beat < beatsPerMeasure; beat++) {
      const currentTimeForDrumsThisBeat = startOffset + (measure * measureDurationSeconds) + (beat * secondsPerBeat);
      const baseVelDrum = 0.6 + (params.targetArousal * 0.15);

      // Kick
      let addKick = false;
      if (isKidsMode) { addKick = beat === 0;
      } else if (genreLower.includes("electronic")) { addKick = true; // Four on the floor
      } else if (genreLower.includes("funk") || genreLower.includes("soul")) { addKick = beat === 0 || (beat === 2 && Math.random() < 0.7) || (Math.random() < params.rhythmicDensity * 0.4);
      } else { addKick = beat === 0 || beat === 2; // Default Rock/Pop
      }
      if (addKick) {
        let time = currentTimeForDrumsThisBeat + (Math.random()-0.5)*0.01; // Humanize
        if (time <= lastKickTimeD) time = lastKickTimeD + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'kick', time, duration: "8n", velocity: Math.min(0.9, baseVelDrum + 0.15), pitch: "C2" });
        lastKickTimeD = time;
        overallMaxTime = Math.max(overallMaxTime, time + Tone.Time("8n").toSeconds());
      }

      // Snare
      let addSnare = false;
      if (isKidsMode) { addSnare = activeSynthConfigs.tambourine ? false : beat === 2;
      } else if (genreLower.includes("electronic") || genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("funk") || genreLower.includes("soul")) { addSnare = beat === 1 || beat === 3;
      } else if (genreLower.includes("jazz")) { addSnare = (beat === 1 || beat === 3) && Math.random() < 0.3; // Light snare
      }
      if (addSnare) {
        let time = currentTimeForDrumsThisBeat + (Math.random()-0.5)*0.015;
        if (time <= lastSnareTimeD) time = lastSnareTimeD + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'snare', time, duration: "16n", velocity: Math.min(0.85, baseVelDrum + 0.05), pitch: "D2" });
        lastSnareTimeD = time;
        overallMaxTime = Math.max(overallMaxTime, time + Tone.Time("16n").toSeconds());
      }
      
      // Tambourine for Kids mode if specified
      if (isKidsMode && activeSynthConfigs.tambourine && (beat === 1 || beat ===3)) {
         let time = currentTimeForDrumsThisBeat + (Math.random()-0.5)*0.01;
         if (time <= lastTambourineTimeD) time = lastTambourineTimeD + TIME_EPSILON;
         drumEventsToSchedule.push({synth: 'tambourine', time, duration: "8n", velocity: Math.min(0.7, baseVelDrum - 0.1)});
         lastTambourineTimeD = time;
         overallMaxTime = Math.max(overallMaxTime, time + Tone.Time("8n").toSeconds());
      }


      // Hi-Hat
      let hiHatSubdivisions = 0;
      if (isKidsMode) { hiHatSubdivisions = params.rhythmicDensity > 0.3 ? 2 : 0; // Quarters or nothing for kids
      } else if (genreLower.includes("jazz")) { hiHatSubdivisions = 3; // Swing: Q, E, E
      } else if (genreLower.includes("funk") || genreLower.includes("soul") || (genreLower.includes("electronic") && params.rhythmicDensity > 0.6)) { hiHatSubdivisions = 4; // 16ths
      } else if (params.rhythmicDensity > 0.2) { hiHatSubdivisions = 2; // 8ths
      }
      
      if (hiHatSubdivisions > 0) {
        const hiHatNoteDuration = hiHatSubdivisions === 1 ? "4n" : hiHatSubdivisions === 2 ? "8n" : hiHatSubdivisions === 3 ? "8t" : "16n";
        for (let subBeat = 0; subBeat < hiHatSubdivisions; subBeat++) {
          let time = currentTimeForDrumsThisBeat + (subBeat * (secondsPerBeat / hiHatSubdivisions)) + (Math.random()-0.5)*0.005;
          if (time <= lastHiHatTimeD) time = lastHiHatTimeD + TIME_EPSILON;
          
          let hiHatPitch = activeSynthConfigs.hiHat.frequency || 400;
          if (genreLower.includes("jazz")) hiHatPitch = 600 + Math.random()*100; // Ride-like for jazz

          drumEventsToSchedule.push({ synth: 'hiHat', time, duration: hiHatNoteDuration, velocity: Math.min(0.65, (baseVelDrum * 0.6) + (Math.random() * 0.1) - (subBeat % 2 === 1 ? 0.05:0) ), pitch: hiHatPitch });
          lastHiHatTimeD = time;
          overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(hiHatNoteDuration).toSeconds());
        }
      }
    }
  }
  drumEventsToSchedule.forEach(ev => { overallMaxTime = Math.max(overallMaxTime, ev.time + Tone.Time(ev.duration).toSeconds()); });
  console.log(`${logPrefix} Generated ${drumEventsToSchedule.length} drum events. Final overallMaxTime: ${overallMaxTime.toFixed(2)}`);

  const renderDuration = Math.max(overallMaxTime + 2.5, MIN_EFFECTIVE_DURATION_SECONDS); // Add 2.5s tail
  console.log(`${logPrefix} Calculated renderDuration: ${renderDuration.toFixed(2)}s.`);

  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log(`${logPrefix}_OFFLINE] Inside Tone.Offline. Offline Context SR: ${offlineContext.sampleRate}`);
      offlineContext.transport.bpm.value = Tone.Transport.bpm.value;
      if (Tone.Transport.swing > 0) {
          offlineContext.transport.swing = Tone.Transport.swing;
          offlineContext.transport.swingSubdivision = Tone.Transport.swingSubdivision;
      }

      const reverb = new Tone.Reverb(isKidsMode ? 0.5 : 1.0).toDestination(); 
      reverb.wet.value = isKidsMode ? 0.15 : 0.25;
      await reverb.ready;
      console.log(`${logPrefix}_OFFLINE] Reverb created and ready. Wet: ${reverb.wet.value}`);

      const melodySynth = createSynth(activeSynthConfigs.melody, offlineContext).connect(reverb);
      const bassSynth = createSynth(activeSynthConfigs.bass, offlineContext).toDestination(); // Bass usually dry
      const chordSynth = createSynth(activeSynthConfigs.chords, offlineContext).connect(reverb);
      let arpeggioSynth;
      if (arpeggioNotesToSchedule.length > 0 && activeSynthConfigs.arpeggio) {
        arpeggioSynth = createSynth(activeSynthConfigs.arpeggio, offlineContext).connect(reverb);
      }
      console.log(`${logPrefix}_OFFLINE] Melody, Bass, Chord, Arp Synths created and connected.`);

      melodyNotesToSchedule.forEach((ev) => melodySynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
      bassNotesToSchedule.forEach((ev) => bassSynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
      chordEventsToSchedule.forEach((ev) => chordSynth.triggerAttackRelease(ev.notes, ev.duration, ev.time, ev.velocity));
      if (arpeggioSynth) {
        arpeggioNotesToSchedule.forEach((ev) => arpeggioSynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
      }
      
      console.log(`${logPrefix}_OFFLINE] Setting up drum synths.`);
      const kickSynth = new Tone.MembraneSynth(activeSynthConfigs.kick).toDestination();
      const snareSynth = new Tone.NoiseSynth(activeSynthConfigs.snare).toDestination();
      const hiHatSynth = new Tone.MetalSynth(activeSynthConfigs.hiHat).toDestination();
      let tambourineSynth;
      if (activeSynthConfigs.tambourine) {
        tambourineSynth = new Tone.NoiseSynth(activeSynthConfigs.tambourine).toDestination();
      }
      console.log(`${logPrefix}_OFFLINE] Drum synths created and connected to offlineContext.destination.`);
      
      lastKickTimeD = -TIME_EPSILON; lastSnareTimeD = -TIME_EPSILON; lastHiHatTimeD = -TIME_EPSILON; lastTambourineTimeD = -TIME_EPSILON;
      drumEventsToSchedule.forEach(ev => {
        const { synth, time, duration, velocity, pitch } = ev;
        let correctedTime = time; // Humanization already applied if any
        
        if (synth === 'kick') {
          if (correctedTime <= lastKickTimeD) correctedTime = lastKickTimeD + TIME_EPSILON;
          kickSynth.triggerAttackRelease(pitch as string || "C2", duration, correctedTime, velocity);
          lastKickTimeD = correctedTime;
        } else if (synth === 'snare') {
          if (correctedTime <= lastSnareTimeD) correctedTime = lastSnareTimeD + TIME_EPSILON;
          snareSynth.triggerAttackRelease(duration, correctedTime, velocity);
          lastSnareTimeD = correctedTime;
        } else if (synth === 'hiHat') {
          if (correctedTime <= lastHiHatTimeD) correctedTime = lastHiHatTimeD + TIME_EPSILON;
          hiHatSynth.triggerAttackRelease(pitch as string | number, duration, correctedTime, velocity);
          lastHiHatTimeD = correctedTime;
        } else if (synth === 'tambourine' && tambourineSynth) {
            if (correctedTime <= lastTambourineTimeD) correctedTime = lastTambourineTimeD + TIME_EPSILON;
            tambourineSynth.triggerAttackRelease(duration, correctedTime, velocity);
            lastTambourineTimeD = correctedTime;
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

