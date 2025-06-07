
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

function getScaleNoteNames(keySignature: string, mode: string, startOctave: number = 4, genre?: string, harmonicComplexity: number = 0.3): string[] {
    const baseKeyForScale = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const rootMidiBase = robustNoteToMidi(baseKeyForScale + '0') % 12;
    const genreLower = typeof genre === 'string' ? genre.toLowerCase() : "";
    const isKids = typeof mode === 'string' ? mode.toLowerCase().includes('kids') : false;

    let intervals: number[];
    if (isKids) {
        intervals = MAJOR_PENTATONIC_INTERVALS;
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

function getChordNotesForKey(keySignature: string, mode: string, degree: number, octave: number = 3, addSeventh: boolean = false, genre?: string, harmonicComplexity: number = 0.3): string[] {
    const rootNoteName = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const genreLower = typeof genre === 'string' ? genre.toLowerCase() : ""; 
    
    const fullScaleForChordRoots = getScaleNoteNames(rootNoteName, mode.replace('kids', ''), octave, genre, harmonicComplexity);
    
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
        { type: 'm7', third: 3, fifth: 7, seventh: 10 },    
        { type: 'Maj7', third: 4, fifth: 7, seventh: 11 },  
        { type: 'Dom7', third: 4, fifth: 7, seventh: 10 }   
    ];

    let qualityDefinition;
    const isMinorKeyOverall = typeof mode === 'string' ? mode.toLowerCase().includes('minor') : false;
    const currentDegreeIndex = (degree - 1 + 7) % 7;

    if (isMinorKeyOverall) {
        qualityDefinition = naturalMinorKeyQualities[currentDegreeIndex];
        if (degree === 5 && harmonicComplexity > 0.4) {
            qualityDefinition = { type: 'Dom7', third: 4, fifth: 7, seventh: 10 }; 
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
                       (qualityDefinition.type.includes('Maj7') && harmonicComplexity > 0.6);

    if (shouldAddSeventh) {
        notes.push(midiToNoteName(finalChordRootMidi + qualityDefinition.seventh));
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
    pianoMelody: { synthType: Tone.PolySynth, subType: Tone.FMSynth, options: { harmonicity: 2.8, modulationIndex: 10, detune: 0, oscillator: { type: "sine" as const, partials: [1, 0.2, 0.1] }, envelope: { attack: 0.01, decay: 0.7, sustain: 0.05, release: 0.9 }, modulation: { type: "triangle" as const }, modulationEnvelope: { attack: 0.02, decay: 0.25, sustain: 0.01, release: 0.5 } }, volume: -9, effects: [{type: Tone.Chorus, frequency: 0.8, delayTime: 3.2, depth: 0.05, feedback: 0.02}] },
    synthLeadElectronic: { synthType: Tone.Synth, options: { oscillator: { type: "fatsawtooth" as const, count: 3, spread: 25 }, envelope: { attack: 0.04, decay: 1.5, sustain: 0.3, release: 1.0 } }, volume: -10, effects: [{type: Tone.FeedbackDelay, delayTime: "8n.", feedback: 0.25, wet:0.2}] },
    rockGuitarLead: { synthType: Tone.Synth, options: { oscillator: { type: "fatsquare" as const, count: 2, spread: 15 }, envelope: { attack: 0.015, decay: 0.8, sustain: 0.1, release: 0.6 } }, volume: -10, effects: [{type: Tone.Distortion, amount: 0.35}] },
    acousticGuitarLead: { synthType: Tone.PluckSynth, options: { attackNoise: 0.8, dampening: 3200, resonance: 0.75 }, volume: -14, effects: [{type: Tone.Chorus, frequency: 0.5, delayTime: 4, depth: 0.03}] },
    fluteLead: { synthType: Tone.Synth, options: { oscillator: {type: "triangle8" as const }, envelope: {attack: 0.05, decay: 0.4, sustain: 0.6, release: 0.3}}, volume: -12},

    electricPianoChords: { synthType: Tone.PolySynth, subType: Tone.FMSynth, options: { harmonicity: 2.2, modulationIndex: 7, envelope: { attack: 0.04, decay: 1.2, sustain: 0.15, release: 1.5 }, oscillator: {type: "sine" as const, partials: [1, 0.4, 0.08]} }, volume: -18, effects: [{type: Tone.Chorus, frequency: 1.1, delayTime: 3.0, depth: 0.25}] },
    warmPadChords: { synthType: Tone.PolySynth, subType: Tone.AMSynth, options: { harmonicity: 0.7, modulationType: "sawtooth" as const, envelope: { attack: 1.5, decay: 2.0, sustain: 0.8, release: 3.5 } }, volume: -22 },
    stringEnsembleChords: { synthType: Tone.PolySynth, subType: Tone.Synth, options: { oscillator: {type: "fatsawtooth" as const, count: 5, spread: 40}, envelope: {attack: 0.8, decay: 2.0, sustain:0.6, release: 2.5}}, volume: -20},

    pluckArp: { synthType: Tone.PluckSynth, options: { attackNoise: 0.6, dampening: 3800, resonance: 0.82 }, volume: -20 },
    synthArpElectronic: { synthType: Tone.Synth, options: { oscillator: {type: "triangle" as const}, envelope: { attack: 0.01, decay: 0.15, sustain: 0.05, release: 0.25}}, volume: -22 },
    
    defaultBass: { synthType: Tone.FMSynth, options: { harmonicity: 1.0, modulationIndex: 2.5, envelope: { attack: 0.015, decay: 0.2, sustain: 0.8, release: 0.6 }, oscillator: { type: "triangle" as const } }, volume: -9 },
    subBassElectronic: { synthType: Tone.Synth, options: { oscillator: { type: "sine" as const }, envelope: { attack: 0.02, decay: 0.5, sustain: 1, release: 0.8 } }, volume: -7 },
    rockBassPicked: { synthType: Tone.Synth, options: { oscillator: {type: "fatsquare" as const, count:2, spread:10}, envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5 }}, volume: -8, effects: [{type: Tone.Distortion, amount: 0.1}]},
    jazzUprightBass: { synthType: Tone.FMSynth, options: { harmonicity: 0.8, modulationIndex: 1.5, envelope: { attack: 0.03, decay: 0.7, sustain: 0.1, release: 0.9 }, oscillator:{type:"sine" as const, partials: [1, 0.1, 0.02]}}, volume: -10},
    funkSlapBass: { synthType: Tone.Synth, options: { oscillator: {type: "sawtooth" as const}, envelope: {attack: 0.005, decay: 0.15, sustain: 0.01, release: 0.2}, filter: {type: "lowpass", Q: 3, rolloff: -24, frequency: 800}, filterEnvelope: {attack:0.005, decay:0.05, sustain:0, release:0.1, baseFrequency:200, octaves:2.5} }, volume: -8 },

    kidsToyPiano: { synthType: Tone.FMSynth, options: { harmonicity: 4.0, modulationIndex: 7, oscillator: {type: "triangle" as const}, envelope: {attack: 0.008, decay: 0.25, sustain: 0.01, release: 0.2}}, volume: -10},
    kidsXylophone: { synthType: Tone.MetalSynth, options: { harmonicity: 5.5, modulationIndex: 4.5, octaves:1.2, envelope: {attack:0.002, decay:0.35, release:0.35}}, volume: -9},
    kidsUkuleleBass: { synthType: Tone.PluckSynth, options: {attackNoise: 0.5, dampening: 1800, resonance: 0.55}, volume: -12},
    kidsSimplePad: { synthType: Tone.PolySynth, subType: Tone.Synth, options: {oscillator: {type: "triangle" as const}, envelope: {attack: 0.3, decay:0.6, sustain:0.4, release:0.9}}, volume: -20},
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

  if (isKidsMode) {
    melodyConf = Math.random() < 0.5 ? {...baseConfigs.kidsToyPiano} : {...baseConfigs.kidsXylophone};
    bassConf = {...baseConfigs.kidsUkuleleBass};
    chordsConf = {...baseConfigs.kidsSimplePad};
    arpConf = {...baseConfigs.kidsSimpleArp};
    kickConf = {...baseConfigs.kidsKick};
    snareConf = {...baseConfigs.kidsSnare};
    hiHatConf = {...baseConfigs.kidsHiHat};
    if (hintsLower.some(h => h.includes("tambourine") || h.includes("shaker"))) useTambourine = true;
  } else {
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
        arpConf = { ...baseConfigs.acousticGuitarLead, volume: -18 };
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
  };
};

const createSynth = (config: any, offlineContext?: Tone.OfflineContext): { instrument: Tone.Instrument, outputNodeToConnect: Tone.ToneAudioNode } => {
    if (!config || !config.synthType) {
        const defaultConfig = { synthType: Tone.FMSynth, options: { oscillator: { type: SAFE_OSC_TYPE } }, volume: -12 };
        const synth = new defaultConfig.synthType(defaultConfig.options) as Tone.Instrument; // Cast to base type
        synth.volume.value = defaultConfig.volume;
        return { instrument: synth, outputNodeToConnect: synth };
    }

    let synthInstance: Tone.Instrument;
    if (config.synthType === Tone.PolySynth) {
        const subSynthType = config.subType || Tone.Synth;
        synthInstance = new Tone.PolySynth({synth: subSynthType});
        if(config.options) (synthInstance as Tone.PolySynth).set(config.options);
    } else {
        synthInstance = new config.synthType(config.options) as Tone.Instrument;
    }
    synthInstance.volume.value = config.volume !== undefined ? config.volume : -12;

    let finalOutputNode: Tone.ToneAudioNode = synthInstance;

    if (config.effects && Array.isArray(config.effects) && config.effects.length > 0) {
        const effectInstances = config.effects.map((effectConf: any) => {
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
            }
            return effectNodeInstance;
        }).filter(Boolean) as Tone.ToneAudioNode[]; 

        if (effectInstances.length > 0) {
            synthInstance.chain(...effectInstances);
            finalOutputNode = effectInstances[effectInstances.length - 1];
        }
    }
    return { instrument: synthInstance, outputNodeToConnect: finalOutputNode };
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
  const logPrefix = "[WAV_GEN_DYNAMIC_V3]"; 
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
  Tone.Destination.volume.value = 0; 
  Tone.Transport.bpm.value = params.tempoBpm || 120;
  
  const genreLower = typeof params.selectedGenre === 'string' ? params.selectedGenre.toLowerCase() : "";
  const isKidsMode = params.originalInput.mode === 'kids';
  const { harmonicComplexity, rhythmicDensity, targetArousal, targetValence } = params;

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

  const progressionDegrees = isKidsMode ? [1, 4, 5, 1] : 
                            (genreLower.includes("blues") ? [1,1,4,1,5,4,1,1] : 
                            (genreLower.includes("jazz") ? [2,5,1,6] : 
                             [1, 5, 6, 4])); 
  const numChordCycles = isKidsMode ? 2 : (genreLower.includes("ambient") ? 3 : (genreLower.includes("blues") ? 1 : 4));
  const totalChordProgressionSeconds = numChordCycles * progressionDegrees.length * measureDurationSeconds;

  const melodyNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const melodyOctave = isKidsMode ? 5 : (genreLower.includes("jazz") || genreLower.includes("classical") ? 5 : 4);
  const scaleNoteNames = getScaleNoteNames(params.keySignature, params.mode, melodyOctave, params.selectedGenre, harmonicComplexity);
  let melodyCurrentTime = startOffset;
  let lastMelodyEventTime = -TIME_EPSILON;
  
  if (scaleNoteNames.length > 0) {
      let currentMelodyScaleIndex = Math.floor(Math.random() * scaleNoteNames.length);
      while (melodyCurrentTime < totalChordProgressionSeconds - TIME_EPSILON) {
          let noteDurationNotation: string;
          const arousalFactor = (targetArousal + 1) / 2; 

          if (isKidsMode) {
            noteDurationNotation = weightedRandom(["4n", "8n", "2n"], [0.6 + rhythmicDensity*0.2, 0.3 - rhythmicDensity*0.1, 0.1]) as string;
          } else if (genreLower.includes("jazz") && rhythmicDensity > 0.3) {
            noteDurationNotation = weightedRandom(["8n", "16n", "8t", "4n"], [0.4 + arousalFactor*0.2, 0.3, 0.2, 0.1 - arousalFactor*0.1]) as string;
          } else if (rhythmicDensity < 0.33) {
            noteDurationNotation = weightedRandom(["2n", "4n", "1m"], [0.5, 0.4 - arousalFactor*0.1, 0.1 + arousalFactor*0.1]) as string;
          } else if (rhythmicDensity < 0.66) {
            noteDurationNotation = weightedRandom(["4n", "8n", "2n"], [0.5, 0.3 + arousalFactor*0.1, 0.2 - arousalFactor*0.1]) as string;
          } else {
            noteDurationNotation = weightedRandom(["8n", "16n", "4n", "8t"], [0.5 + arousalFactor*0.2, 0.3, 0.15 - arousalFactor*0.1, 0.05]) as string;
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

          const restProbability = isKidsMode ? 0.15 : (0.25 - (rhythmicDensity * 0.20) - arousalFactor * 0.08);
          if (Math.random() < restProbability && melodyCurrentTime > startOffset + secondsPerBeat * 0.5 && melodyNotesToSchedule.length > 0) {
              let restDurNotation = rhythmicDensity < 0.5 ? "8n" : "16n";
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
          if (stepRoll < 0.60) step = Math.random() < 0.5 ? 1 : -1; 
          else if (stepRoll < 0.85) step = Math.random() < 0.5 ? 2 : -2; 
          else step = Math.random() < 0.5 ? (Math.random() < 0.6 ? 3 : 4) : (Math.random() < 0.6 ? -3 : -4);
          currentMelodyScaleIndex = (currentMelodyScaleIndex + step + scaleNoteNames.length * 7) % scaleNoteNames.length;
          const noteName = scaleNoteNames[currentMelodyScaleIndex];
          
          const baseVelMelody = isKidsMode ? 0.55 : 0.60;
          const velocity = Math.min(0.9, Math.max(0.2, baseVelMelody + (targetArousal * 0.2) + (targetValence * 0.05) + (Math.random() * 0.15 - 0.075)));

          let newTime = applyHumanization(melodyCurrentTime, 0.015);
          if (newTime <= lastMelodyEventTime) newTime = lastMelodyEventTime + TIME_EPSILON;
          if (newTime >= totalChordProgressionSeconds - TIME_EPSILON) break;

          melodyNotesToSchedule.push({ time: newTime, note: noteName, duration: noteDurationNotation, velocity });
          lastMelodyEventTime = newTime;
          overallMaxTime = Math.max(overallMaxTime, newTime + noteDurationSec);
          melodyCurrentTime = newTime + noteDurationSec;
      }
  }
  console.log(`${logPrefix} Generated ${melodyNotesToSchedule.length} melody notes. Melody time: ${melodyCurrentTime.toFixed(2)}s`);

  const bassNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const bassOctave = isKidsMode ? 2 : (genreLower.includes("jazz") || genreLower.includes("funk") ? 2 : (genreLower.includes("rock") || genreLower.includes("metal") ? 1 : 2));
  let lastBassEventTime = -TIME_EPSILON;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegrees.length; i++) {
        const degree = progressionDegrees[i];
        const currentMeasureStartTime = startOffset + (cycle * progressionDegrees.length * measureDurationSeconds) + (i * measureDurationSeconds);
        const chordNotesForBass = getChordNotesForKey(params.keySignature, params.mode, degree, bassOctave, harmonicComplexity > 0.5, params.selectedGenre, harmonicComplexity);
        const rootNote = chordNotesForBass[0];
        const fifthNote = chordNotesForBass[2 % chordNotesForBass.length] || rootNote;
        const thirdNote = chordNotesForBass[1 % chordNotesForBass.length] || rootNote;
        const scaleForWalk = getScaleNoteNames(params.keySignature, params.mode, bassOctave, params.selectedGenre, harmonicComplexity);

        const baseVelBass = 0.5 + (targetArousal * 0.15);
        
        if (isKidsMode) {
            let time = applyHumanization(currentMeasureStartTime, 0.01);
            if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
            bassNotesToSchedule.push({ time, note: rootNote, duration: "2n", velocity: Math.min(0.75, baseVelBass + 0.1) });
            lastBassEventTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + Tone.Time("2n").toSeconds());
        } else if (genreLower.includes("jazz")) {
            let currentWalkNoteMidi = robustNoteToMidi(rootNote);
            for (let beat = 0; beat < beatsPerMeasure; beat++) {
                let time = applyHumanization(currentMeasureStartTime + beat * secondsPerBeat, 0.02);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: midiToNoteName(currentWalkNoteMidi), duration: "4n", velocity: Math.min(0.75, baseVelBass + (beat === 0 ? 0.05 : -0.05) + Math.random()*0.04) });
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
                { note: rootNote, timeOffset: 0, duration: "8n", accent: true },
                { rest: true, timeOffset: secondsPerBeat * 0.5, duration: "16n" },
                { note: rootNote, timeOffset: secondsPerBeat * 0.75, duration: "16n", accent: false }, 
                { note: fifthNote, timeOffset: secondsPerBeat * 1.5, duration: "8n", accent: false },
                { rest: true, timeOffset: secondsPerBeat * 2.0, duration: "16n"},
                { note: rootNote, timeOffset: secondsPerBeat * 2.25, duration: "16n", accent: true },
                { note: thirdNote, timeOffset: secondsPerBeat * 3.0, duration: "8n", accent: false },
                { note: fifthNote, timeOffset: secondsPerBeat * 3.5, duration: "8n", accent: false},
            ];
            pattern.forEach(p => {
                if (p.rest) return;
                let time = applyHumanization(currentMeasureStartTime + p.timeOffset, 0.015);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: p.note as string, duration: p.duration, velocity: Math.min(0.8, baseVelBass + (p.accent ? 0.1 : 0) + Math.random()*0.05)});
                lastBassEventTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(p.duration).toSeconds());
            });
        } else if (genreLower.includes("electronic") && rhythmicDensity > 0.3) {
            const subdivisions = rhythmicDensity > 0.65 ? 4 : 2; 
            const noteDur = subdivisions === 4 ? "16n" : "8n";
            for (let beat = 0; beat < beatsPerMeasure * subdivisions; beat++) {
                 let time = applyHumanization(currentMeasureStartTime + beat * (secondsPerBeat / subdivisions), 0.005);
                 if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                 bassNotesToSchedule.push({ time, note: rootNote, duration: noteDur, velocity: Math.min(0.75, baseVelBass + (beat % subdivisions === 0 ? 0.05 : 0)) });
                 lastBassEventTime = time;
                 overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat/subdivisions);
            }
        }
        else { 
            for (let beat = 0; beat < beatsPerMeasure; beat++) {
                let time = applyHumanization(currentMeasureStartTime + beat * secondsPerBeat, 0.01);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: (beat === 1 && rhythmicDensity > 0.4 && Math.random() < 0.3) ? fifthNote : rootNote, duration: "4n", velocity: Math.min(0.8, baseVelBass + (beat === 0 || beat === 2 ? 0.1 : -0.05)) });
                lastBassEventTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat);
            }
        }
    }
  }
  console.log(`${logPrefix} Generated ${bassNotesToSchedule.length} bass notes.`);

  const chordEventsToSchedule: { time: number, notes: string[], duration: string, velocity: number }[] = [];
  const chordOctave = isKidsMode ? 3 : (genreLower.includes("jazz") || genreLower.includes("classical") ? 4 : 3);
  let lastChordEventTime = -TIME_EPSILON;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegrees.length; i++) {
      const degree = progressionDegrees[i];
      const currentMeasureStartTime = startOffset + (cycle * progressionDegrees.length * measureDurationSeconds) + (i * measureDurationSeconds);
      const addSeventhForChord = !isKidsMode && (harmonicComplexity > 0.5 || genreLower.includes("jazz"));
      const chordNoteNames = getChordNotesForKey(params.keySignature, params.mode, degree, chordOctave, addSeventhForChord, params.selectedGenre, harmonicComplexity);
      
      const baseVelChord = 0.3 + (targetArousal * 0.12) + (targetValence * 0.05);

      if (chordNoteNames.length > 0) {
          if (isKidsMode || genreLower.includes("ambient") || genreLower.includes("classical")) {
            let time = applyHumanization(currentMeasureStartTime, 0.01);
            if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
            chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: "1m", velocity: Math.min(0.6, baseVelChord) });
            lastChordEventTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + measureDurationSeconds);
          } else if (genreLower.includes("funk") || genreLower.includes("reggae") || (genreLower.includes("electronic") && rhythmicDensity > 0.6)) {
              const numStabs = rhythmicDensity > 0.6 ? (genreLower.includes("reggae") ? 2 : 4) : 2; 
              const stabDuration = numStabs === 4 ? "16n" : (genreLower.includes("reggae") ? "4n" : "8n");
              for(let s=0; s < numStabs; s++) {
                  let timeOffset = s * (measureDurationSeconds / numStabs);
                  if (genreLower.includes("reggae")) timeOffset = (s * 2 + 1) * (secondsPerBeat); 
                  let time = applyHumanization(currentMeasureStartTime + timeOffset, 0.015);
                  if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
                  
                  chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: stabDuration, velocity: Math.min(0.65, baseVelChord + 0.1 + Math.random()*0.05) });
                  lastChordEventTime = time;
                  overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(stabDuration).toSeconds());
                  if (genreLower.includes("reggae") && s >=1) break; 
              }
          } else if (genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("country")){
              const strumPattern = rhythmicDensity > 0.55 ? ["0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5"] : ["0", "1", "2", "3"]; 
              const strumDur = rhythmicDensity > 0.55 ? "8n" : "4n";
              strumPattern.forEach(beatOffsetStr => {
                  let time = applyHumanization(currentMeasureStartTime + parseFloat(beatOffsetStr) * secondsPerBeat, 0.01);
                  if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
                  chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: strumDur, velocity: Math.min(0.6, baseVelChord + (beatOffsetStr === "0" ? 0.05 : 0) + Math.random()*0.03) });
                  lastChordEventTime = time;
                  overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(strumDur).toSeconds());
              });
          } else { 
            let time = applyHumanization(currentMeasureStartTime, 0.01);
            if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
            chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: "1m", velocity: Math.min(0.6, baseVelChord) });
            lastChordEventTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + measureDurationSeconds);
          }
      }
    }
  }
  console.log(`${logPrefix} Generated ${chordEventsToSchedule.length} chord events.`);

  const arpeggioNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const arpeggioOctave = isKidsMode ? 4 : (harmonicComplexity > 0.3 ? 5 : 4);
  let lastArpEventTime = -TIME_EPSILON;
  
  const playArp = !isKidsMode || (isKidsMode && harmonicComplexity > 0.1 && rhythmicDensity > 0.05);
  if (playArp && (genreLower.includes("electronic") || genreLower.includes("pop") || genreLower.includes("ambient") || genreLower.includes("classical") || isKidsMode || harmonicComplexity > 0.4)) {
    chordEventsToSchedule.forEach(chordEvent => {
        const currentChordNotesForArp = chordEvent.notes.map(n => midiToNoteName(robustNoteToMidi(n.replace(/[0-9]+$/, String(arpeggioOctave)))));
        if (currentChordNotesForArp.length > 0) {
            const arpPattern = [0, 1, 2, 1]; 
            if (genreLower.includes("classical")) arpPattern.push(0, 2, 1, 2); 
            
            const arpNoteDurationNotation = (rhythmicDensity > 0.6 || genreLower.includes("electronic")) ? "16n" : "8n";
            const arpNoteDurationSeconds = Tone.Time(arpNoteDurationNotation).toSeconds();
            const notesPerBeatForArp = arpNoteDurationNotation === "16n" ? 4 : 2;
            const beatsToArpeggiate = isKidsMode ? 1 : (rhythmicDensity > 0.2 && harmonicComplexity > 0.2 ? (genreLower.includes("ambient") ? beatsPerMeasure : 2) : (harmonicComplexity > 0.5 ? 1 : 0));

            for (let beat = 0; beat < beatsToArpeggiate; beat++) {
                for (let i = 0; i < notesPerBeatForArp; i++) {
                    let time = applyHumanization(chordEvent.time + (beat * secondsPerBeat) + (i * arpNoteDurationSeconds), 0.008);
                     if (time < chordEvent.time + Tone.Time(chordEvent.duration).toSeconds() - TIME_EPSILON * 2) {
                        if (time <= lastArpEventTime) time = lastArpEventTime + TIME_EPSILON;
                        const noteIndexInChord = arpPattern[i % arpPattern.length] % currentChordNotesForArp.length;
                        arpeggioNotesToSchedule.push({ time, note: currentChordNotesForArp[noteIndexInChord], duration: arpNoteDurationNotation, velocity: Math.min(0.5, 0.2 + (targetArousal * 0.12) + Math.random() * 0.04) });
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
  const numDrumMeasures = numChordCycles * progressionDegrees.length;
  let lastDrumTimes = { kick: -TIME_EPSILON, snare: -TIME_EPSILON, hiHat: -TIME_EPSILON, tambourine: -TIME_EPSILON };
  const humanizeAmount = 0.01; 

  for (let measure = 0; measure < numDrumMeasures; measure++) {
    const baseVelDrum = 0.55 + (targetArousal * 0.2); // Moved declaration here
    for (let beat = 0; beat < beatsPerMeasure; beat++) {
      const beatStartTime = startOffset + (measure * measureDurationSeconds) + (beat * secondsPerBeat);
      
      let addKick = false; let kickTime = beatStartTime;
      if (isKidsMode) { addKick = beat === 0;
      } else if (genreLower.includes("electronic") || genreLower.includes("house") || genreLower.includes("techno")) { addKick = true;
      } else if (genreLower.includes("funk") || genreLower.includes("soul")) { addKick = (beat === 0) || (beat === 2 && Math.random() < 0.6) || (Math.random() < rhythmicDensity * 0.35);
          if(addKick && beat > 0) kickTime = beatStartTime + (Math.random() < 0.5 ? -secondsPerBeat*0.25 : secondsPerBeat*0.25) * (Math.random()*0.5); 
      } else { addKick = beat === 0 || beat === 2;
      }
      if (addKick) {
        let time = applyHumanization(kickTime, humanizeAmount);
        if (time <= lastDrumTimes.kick) time = lastDrumTimes.kick + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'kick', time, duration: "8n", velocity: Math.min(0.95, baseVelDrum + 0.2), pitch: "C2" });
        lastDrumTimes.kick = time;
      }

      let addSnare = false; let snareTime = beatStartTime;
      if (isKidsMode) { addSnare = activeSynthConfigs.tambourine ? false : beat === 2;
      } else if (genreLower.includes("electronic") || genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("funk") || genreLower.includes("soul") || genreLower.includes("country")) { addSnare = beat === 1 || beat === 3;
      } else if (genreLower.includes("jazz")) { addSnare = (beat === 1 || beat === 3) && Math.random() < 0.25; 
      } else if (genreLower.includes("reggae")) { addSnare = beat === 2; }
      if (addSnare) {
        let time = applyHumanization(snareTime, humanizeAmount * 1.2);
        if (time <= lastDrumTimes.snare) time = lastDrumTimes.snare + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'snare', time, duration: "16n", velocity: Math.min(0.9, baseVelDrum + 0.1), pitch: "D2" });
        lastDrumTimes.snare = time;
      }
      
      if (isKidsMode && activeSynthConfigs.tambourine && (beat === 1 || beat === 3)) {
         let time = applyHumanization(beatStartTime, humanizeAmount);
         if (time <= lastDrumTimes.tambourine) time = lastDrumTimes.tambourine + TIME_EPSILON;
         drumEventsToSchedule.push({synth: 'tambourine', time, duration: "8n", velocity: Math.min(0.7, baseVelDrum - 0.05)});
         lastDrumTimes.tambourine = time;
      }

      let hiHatSubdivisions = 0; const useRide = activeSynthConfigs.hiHat.frequency > 450; 
      if (isKidsMode) { hiHatSubdivisions = rhythmicDensity > 0.3 ? 1 : 0; 
      } else if (genreLower.includes("jazz") || genreLower.includes("swing") || (genreLower.includes("blues") && rhythmicDensity > 0.3)) { hiHatSubdivisions = 3; 
      } else if (genreLower.includes("funk") || genreLower.includes("soul") || (genreLower.includes("electronic") && rhythmicDensity > 0.55)) { hiHatSubdivisions = 4; 
      } else if (rhythmicDensity > 0.15) { hiHatSubdivisions = 2; 
      }
      
      if (hiHatSubdivisions > 0) {
        const hiHatNoteDuration = hiHatSubdivisions === 1 ? "4n" : hiHatSubdivisions === 2 ? "8n" : hiHatSubdivisions === 3 ? "8t" : "16n";
        for (let subBeat = 0; subBeat < hiHatSubdivisions; subBeat++) {
          let time = applyHumanization(beatStartTime + (subBeat * (secondsPerBeat / hiHatSubdivisions)), humanizeAmount * 0.5);
           if (Tone.Transport.swing > 0 && hiHatSubdivisions === 2 && subBeat === 1) time += Tone.Transport.swing * (secondsPerBeat/2) * 0.5; 
           if (Tone.Transport.swing > 0 && hiHatSubdivisions === 3 && subBeat > 0) time += Tone.Transport.swing * (secondsPerBeat/3) * (subBeat === 1 ? 0.33 : 0.66) * 0.5;

          if (time <= lastDrumTimes.hiHat) time = lastDrumTimes.hiHat + TIME_EPSILON;
          
          const hiHatPitch = activeSynthConfigs.hiHat.frequency || 400;
          const hiHatVelocity = Math.min(0.6, (baseVelDrum * 0.5) + (Math.random() * 0.1) - (subBeat % 2 === 1 && hiHatSubdivisions > 1 ? 0.05:0) );

          if (!isKidsMode && !genreLower.includes("jazz") && !genreLower.includes("classical") && hiHatSubdivisions >= 2 && subBeat === hiHatSubdivisions -1 && Math.random() < 0.15) {
              drumEventsToSchedule.push({ synth: 'hiHat', time, duration: "8n", velocity: hiHatVelocity + 0.1, pitch: hiHatPitch + 100 });
          } else {
              drumEventsToSchedule.push({ synth: 'hiHat', time, duration: hiHatNoteDuration, velocity: hiHatVelocity, pitch: hiHatPitch });
          }
          lastDrumTimes.hiHat = time;
        }
      }
    }
    if (!isKidsMode && (measure + 1) % 4 === 0 && measure < numDrumMeasures -1 && rhythmicDensity > 0.5 && (genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("funk"))){
        const fillStartTime = startOffset + ((measure + 1) * measureDurationSeconds) - secondsPerBeat; 
        for(let f=0; f<4; f++){
            let time = applyHumanization(fillStartTime + f * (secondsPerBeat/4), humanizeAmount*0.8);
            if (time <= lastDrumTimes.snare) time = lastDrumTimes.snare + TIME_EPSILON;
            drumEventsToSchedule.push({synth: 'snare', time, duration: "16n", velocity: Math.min(0.85, baseVelDrum + 0.15 + Math.random()*0.05), pitch: "D2"});
            lastDrumTimes.snare = time;
        }
    }
  }
  drumEventsToSchedule.forEach(ev => { overallMaxTime = Math.max(overallMaxTime, ev.time + Tone.Time(ev.duration).toSeconds()); });
  console.log(`${logPrefix} Generated ${drumEventsToSchedule.length} drum events.`);

  const renderDuration = Math.max(overallMaxTime + 3.0, MIN_EFFECTIVE_DURATION_SECONDS); 
  console.log(`${logPrefix} Calculated renderDuration: ${renderDuration.toFixed(2)}s.`);

  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log(`${logPrefix}_OFFLINE] Inside Tone.Offline. Offline Context SR: ${offlineContext.sampleRate}`);
      offlineContext.transport.bpm.value = Tone.Transport.bpm.value;
      if (Tone.Transport.swing > 0) {
          offlineContext.transport.swing = Tone.Transport.swing;
          offlineContext.transport.swingSubdivision = Tone.Transport.swingSubdivision;
      }

      const masterReverb = new Tone.Reverb(isKidsMode ? 0.6 : 1.5).toDestination(); 
      masterReverb.wet.value = isKidsMode ? 0.12 : 0.22;
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
      if (arpeggioNotesToSchedule.length > 0 && activeSynthConfigs.arpeggio) {
        const arpSynthSetup = createSynth(activeSynthConfigs.arpeggio, offlineContext);
        arpeggioSynth = arpSynthSetup.instrument;
        arpSynthSetup.outputNodeToConnect.connect(masterReverb);
      }
      console.log(`${logPrefix}_OFFLINE] Melodic/Harmonic Synths created and connected.`);

      melodyNotesToSchedule.forEach((ev) => (melodySynth as any).triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
      bassNotesToSchedule.forEach((ev) => (bassSynth as any).triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
      chordEventsToSchedule.forEach((ev) => (chordSynth as any).triggerAttackRelease(ev.notes, ev.duration, ev.time, ev.velocity));
      if (arpeggioSynth) {
        arpeggioNotesToSchedule.forEach((ev) => (arpeggioSynth as any).triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
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

