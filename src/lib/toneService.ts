
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
const BLUES_SCALE_INTERVALS = [0, 3, 5, 6, 7, 10]; // Minor pentatonic + b5
const MAJOR_PENTATONIC_INTERVALS = [0, 2, 4, 7, 9];
const MINOR_PENTATONIC_INTERVALS = [0, 3, 5, 7, 10];
const DORIAN_INTERVALS = [0, 2, 3, 5, 7, 9, 10];
const MIXOLYDIAN_INTERVALS = [0, 2, 4, 5, 7, 9, 10];


function getScaleNoteNames(keySignature: string, mode: string, startOctave: number = 4, genre?: string): string[] {
    const baseKeyForScale = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const rootMidiBase = robustNoteToMidi(baseKeyForScale + '0') % 12;
    const genreLower = genre?.toLowerCase();

    let intervals: number[];
    if (genreLower?.includes('blues')) {
        intervals = BLUES_SCALE_INTERVALS;
    } else if (genreLower?.includes('jazz') && mode.toLowerCase().includes('minor')) {
        intervals = DORIAN_INTERVALS;
    } else if (genreLower?.includes('jazz')) {
        intervals = MIXOLYDIAN_INTERVALS; // Good for dominant sounds often in jazz
    } else if ((genreLower?.includes('folk') || genreLower?.includes('country') || mode.toLowerCase().includes('kids')) && mode.toLowerCase().includes('minor')) {
        intervals = MINOR_PENTATONIC_INTERVALS;
    } else if (genreLower?.includes('folk') || genreLower?.includes('country') || mode.toLowerCase().includes('kids')) {
        intervals = MAJOR_PENTATONIC_INTERVALS;
    }
     else if (mode.toLowerCase().includes('minor')) {
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

function getChordNotesForKey(keySignature: string, mode: string, degree: number, octave: number = 3, addSeventh: boolean = false): string[] {
    const rootNoteName = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const scaleNoteNames = getScaleNoteNames(rootNoteName, mode, octave); // Use genre-aware scale for root finding
    if (scaleNoteNames.length < 7 && !(mode.toLowerCase().includes('kids') || rootNoteName.toLowerCase().includes('folk'))) { // Pentatonic scales are fine
        return [midiToNoteName(DEFAULT_MIDI_NOTE + (octave - 4) * 12)];
    }

    // Determine the actual root of the chord based on the scale degree
    // For a 7-note scale, degree maps directly. For pentatonic, it's trickier, so we use the full scale for chord roots.
    const fullScaleForChordRoots = getScaleNoteNames(rootNoteName, mode.replace('kids', '').replace('folk',''), octave); // Use standard scale for chord root finding
    const chordRootInScaleOctave = fullScaleForChordRoots[(degree - 1 + fullScaleForChordRoots.length) % fullScaleForChordRoots.length];

    const desiredChordRootName = midiToNoteName((robustNoteToMidi(chordRootInScaleOctave + '0') % 12) + (octave + 1) * 12);
    const finalChordRootMidi = robustNoteToMidi(desiredChordRootName);

    let thirdInterval = 4; let fifthInterval = 7; let seventhInterval = 10; // Major 7th by default for major, minor 7th for minor
    const isMinorKeyOverall = mode.toLowerCase().includes('minor');

    // Basic diatonic triad/seventh quality for the given degree in MAJOR key
    if (!isMinorKeyOverall) {
        switch (degree) {
            case 1: thirdInterval = 4; fifthInterval = 7; seventhInterval = 11; break; // Major (Maj7)
            case 2: thirdInterval = 3; fifthInterval = 7; seventhInterval = 10; break; // Minor (m7)
            case 3: thirdInterval = 3; fifthInterval = 7; seventhInterval = 10; break; // Minor (m7)
            case 4: thirdInterval = 4; fifthInterval = 7; seventhInterval = 11; break; // Major (Maj7)
            case 5: thirdInterval = 4; fifthInterval = 7; seventhInterval = 10; break; // Major (Dom7)
            case 6: thirdInterval = 3; fifthInterval = 7; seventhInterval = 10; break; // Minor (m7)
            case 7: thirdInterval = 3; fifthInterval = 6; seventhInterval = 10; break; // Diminished (m7b5)
        }
    } else { // Basic diatonic triad/seventh quality for the given degree in MINOR key (natural minor)
         switch (degree) {
            case 1: thirdInterval = 3; fifthInterval = 7; seventhInterval = 10; break; // Minor (m7)
            case 2: thirdInterval = 3; fifthInterval = 6; seventhInterval = 10; break; // Diminished (m7b5)
            case 3: thirdInterval = 4; fifthInterval = 7; seventhInterval = 11; break; // Major (Maj7 relative to minor's III)
            case 4: thirdInterval = 3; fifthInterval = 7; seventhInterval = 10; break; // Minor (m7)
            case 5: thirdInterval = 3; fifthInterval = 7; seventhInterval = 10; break; // Minor (m7) - natural minor V is minor. Often altered to Major/Dom7 in practice.
            case 6: thirdInterval = 4; fifthInterval = 7; seventhInterval = 11; break; // Major (Maj7)
            case 7: thirdInterval = 4; fifthInterval = 7; seventhInterval = 10; break; // Major (Dom7 relative to minor's VII)
        }
    }

    const notes = [
        midiToNoteName(finalChordRootMidi),
        midiToNoteName(finalChordRootMidi + thirdInterval),
        midiToNoteName(finalChordRootMidi + fifthInterval)
    ];
    if (addSeventh) {
        notes.push(midiToNoteName(finalChordRootMidi + seventhInterval));
    }
    return notes.filter(name => name !== undefined && name !== null) as string[];
}


const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genre: string = '',
  isKidsMode: boolean = false,
): any => {
  const genreLower = genre.toLowerCase();
  const hintsLower = instrumentHints.map(h => h.toLowerCase());

  const baseConfigs = {
    // Melodic Synths
    defaultMelody: { synthType: Tone.FMSynth, options: { harmonicity: 1.5, modulationIndex: 5, envelope: { attack: 0.03, decay: 0.4, sustain: 0.6, release: 0.8 } }, volume: -7 },
    pianoMelody: { synthType: Tone.FMSynth, options: { harmonicity: 3.1, modulationIndex: 14, oscillator: { type: "sine" as const, partials: [1, 0.2, 0.05] }, envelope: { attack: 0.008, decay: 0.7, sustain: 0.05, release: 0.9 }, modulation: { type: "triangle" as const }, modulationEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.01, release: 0.5 } }, volume: -7, effects: [{type: Tone.Chorus, frequency: 0.5, delayTime: 2, depth: 0.15, feedback: 0.05}] },
    synthLeadElectronic: { synthType: Tone.Synth, options: { oscillator: { type: "fatsawtooth" as const, count: 3, spread: 25 }, envelope: { attack: 0.02, decay: 1.0, sustain: 0.3, release: 0.7 } }, volume: -8, effects: [{type: Tone.FeedbackDelay, delayTime: "8n", feedback: 0.35, wet:0.2}] },
    rockGuitarLead: { synthType: Tone.Synth, options: { oscillator: { type: "fatsquare" as const, count: 2, spread: 18 }, envelope: { attack: 0.008, decay: 0.6, sustain: 0.15, release: 0.4 } }, volume: -8, effects: [{type: Tone.Distortion, amount: 0.35}] },
    acousticGuitarPluck: { synthType: Tone.PluckSynth, options: { attackNoise: 0.9, dampening: 3500, resonance: 0.75 }, volume: -9, effects: [{type: Tone.Chorus, frequency: 0.8, delayTime: 3, depth: 0.1, feedback: 0.02}] },
    kidsToyPiano: { synthType: Tone.FMSynth, options: { harmonicity: 4.5, modulationIndex: 8, oscillator: {type: "triangle" as const}, envelope: {attack: 0.005, decay: 0.2, sustain: 0.01, release: 0.15}}, volume: -8},
    kidsXylophone: { synthType: Tone.MetalSynth, options: { harmonicity: 6, modulationIndex: 5, octaves:1.5, envelope: {attack:0.001, decay:0.3, release:0.3}}, volume: -7},

    // Bass Synths
    defaultBass: { synthType: Tone.FMSynth, options: { harmonicity: 1.0, modulationIndex: 2.5, envelope: { attack: 0.015, decay: 0.2, sustain: 0.8, release: 0.6 } }, volume: -9 },
    subBassElectronic: { synthType: Tone.Synth, options: { oscillator: { type: "sine" as const }, envelope: { attack: 0.01, decay: 0.3, sustain: 1, release: 0.5 } }, volume: -7 },
    rockBassPicked: { synthType: Tone.Synth, options: { oscillator: {type: "fatsquare" as const, count: 2, spread: 10}, envelope: { attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.5 }}, volume: -8},
    jazzUprightBass: { synthType: Tone.FMSynth, options: { harmonicity: 0.8, modulationIndex: 1.5, envelope: { attack: 0.02, decay: 0.5, sustain: 0.2, release: 0.7 }, oscillator:{type:"sine" as const}}, volume: -9},
    kidsUkuleleBass: { synthType: Tone.PluckSynth, options: {attackNoise: 0.6, dampening: 2000, resonance: 0.6}, volume: -10},


    // Chord/Pad Synths
    defaultChords: { synthType: Tone.PolySynth, subType: Tone.AMSynth, options: { harmonicity: 0.6, modulationType: "sine" as const, envelope: { attack: 0.2, decay: 0.7, sustain: 0.3, release: 1.4 } }, volume: -20 },
    electricPianoChords: { synthType: Tone.PolySynth, subType: Tone.FMSynth, options: { harmonicity: 3.5, modulationIndex: 10, envelope: { attack: 0.02, decay: 0.8, sustain: 0.1, release: 0.9 }, oscillator: {type: "sine" as const, partials: [1,0.1,0.05]} }, volume: -18, effects: [{type: Tone.Chorus, frequency: 1, delayTime: 2.5, depth: 0.25}] },
    warmPadChords: { synthType: Tone.PolySynth, subType: Tone.AMSynth, options: { harmonicity: 0.7, modulationType: "sawtooth" as const, envelope: { attack: 0.8, decay: 1.5, sustain: 0.6, release: 2.5 } }, volume: -22 },
    rockGuitarChords: { synthType: Tone.PolySynth, subType: Tone.Synth, options: { oscillator: {type: "fatsquare" as const, count:3, spread: 20}, envelope: {attack: 0.01, decay:0.8, sustain: 0.1, release: 0.5}}, volume: -18, effects: [{type: Tone.Distortion, amount: 0.25}]},
    kidsSimplePad: { synthType: Tone.PolySynth, subType: Tone.Synth, options: {oscillator: {type: "triangle" as const}, envelope: {attack: 0.2, decay:0.5, sustain:0.5, release:0.8}}, volume: -20},

    // Arpeggio Synths
    defaultArpeggio: { synthType: Tone.FMSynth, options: { oscillator: { type: SAFE_OSC_TYPE, partials: [1, 0.18, 0.04] }, envelope: { attack: 0.012, decay: 0.12, sustain: 0.08, release: 0.18 } }, volume: -24 },
    pluckArp: { synthType: Tone.PluckSynth, options: { attackNoise: 0.8, dampening: 3000, resonance: 0.85 }, volume: -18 },
    kidsSimpleArp: { synthType: Tone.Synth, options: {oscillator: {type: "square" as const }, envelope: {attack:0.01, decay:0.1, sustain:0.2, release:0.2}}, volume: -22},
    
    // Drums
    kick: { pitchDecay: 0.035, octaves: 5.5, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.28, sustain: 0.005, release: 0.9, attackCurve: "exponential" as const }, volume: -3 },
    snare: { noise: { type: 'pink' as const, playbackRate: 0.75 }, volume: -10, envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.1 } },
    hiHat: { frequency: 380, envelope: { attack: 0.001, decay: 0.035, release: 0.035 }, harmonicity: 3.2, modulationIndex: 12, resonance: 2300, octaves: 1.0, volume: -15 },
    kidsKick: { pitchDecay: 0.04, octaves: 4, envelope: { attack: 0.002, decay: 0.15, sustain: 0.01, release: 0.5 }, volume: -4 },
    kidsSnare: { noise: { type: 'white' as const }, volume: -12, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.08 } },
    kidsHiHat: { frequency: 450, envelope: { attack: 0.001, decay: 0.02, release: 0.02 }, harmonicity: 2.5, octaves: 1, volume: -18 },
    tambourine: { noise: {type: 'white' as const, playbackRate: 1.5}, envelope: {attack:0.005, decay:0.05, sustain:0, release:0.06}, volume: -16},
  };

  let melodyConf = { ...baseConfigs.defaultMelody };
  let bassConf = { ...baseConfigs.defaultBass };
  let chordsConf = { ...baseConfigs.defaultChords };
  let arpConf = { ...baseConfigs.defaultArpeggio };
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
    if (genreLower.includes("electronic") || genreLower.includes("pop")) {
      melodyConf = { ...baseConfigs.synthLeadElectronic };
      bassConf = { ...baseConfigs.subBassElectronic };
      chordsConf = { ...baseConfigs.warmPadChords, volume: -20 };
      arpConf = { ...baseConfigs.pluckArp, volume: -22 };
      kickConf.volume = -2; snareConf.volume = -8;
    } else if (genreLower.includes("rock") || genreLower.includes("metal")) {
      melodyConf = { ...baseConfigs.rockGuitarLead };
      bassConf = { ...baseConfigs.rockBassPicked };
      chordsConf = { ...baseConfigs.rockGuitarChords };
      arpConf = { ...baseConfigs.defaultArpeggio, volume: -26 }; // Arps less common or more subtle
      kickConf.volume = -1; snareConf.volume = -7;
    } else if (genreLower.includes("jazz")) {
      melodyConf = { ...baseConfigs.pianoMelody, volume: -8 };
      bassConf = { ...baseConfigs.jazzUprightBass };
      chordsConf = { ...baseConfigs.electricPianoChords, volume: -16 };
      arpConf = { ...baseConfigs.defaultArpeggio, volume: -28 };
      kickConf.volume = -10; snareConf.volume = -15; hiHatConf.volume = -20;
    } else if (genreLower.includes("ambient")) {
        melodyConf = { ...baseConfigs.warmPadChords, synthType: Tone.PolySynth, subType: Tone.AMSynth, volume: -15 };
        bassConf = { ...baseConfigs.subBassElectronic, volume: -12 };
        chordsConf = { ...baseConfigs.warmPadChords, volume: -18 };
        arpConf = { ...baseConfigs.defaultArpeggio, volume: -26, options: {...baseConfigs.defaultArpeggio.options, envelope: { attack: 0.1, decay: 0.5, sustain: 0.1, release: 1.0}}};
    } else if (genreLower.includes("folk") || genreLower.includes("country")) {
        melodyConf = { ...baseConfigs.acousticGuitarPluck, volume: -9 };
        bassConf = { ...baseConfigs.jazzUprightBass, volume: -10}; // Acoustic bass often fits folk/country
        chordsConf = { synthType: Tone.PolySynth, subType: Tone.PluckSynth, options: {...baseConfigs.acousticGuitarPluck.options}, volume: -16 };
        arpConf = { ...baseConfigs.acousticGuitarPluck, volume: -18 };
        hiHatConf.volume = -22; // Softer hi-hats
    } else if (genreLower.includes("funk") || genreLower.includes("soul")) {
        melodyConf = { ...baseConfigs.electricPianoChords, synthType: Tone.PolySynth, subType: Tone.FMSynth, volume: -9}; // EP often carries melody
        bassConf = { ...baseConfigs.defaultBass, options: {...baseConfigs.defaultBass.options, harmonicity: 1.2, modulationIndex: 3.5}, volume: -7}; // Punchier FM bass
        chordsConf = { ...baseConfigs.electricPianoChords, volume: -15};
        arpConf = { ...baseConfigs.pluckArp, volume: -20};
        kickConf.volume = -2; snareConf.volume = -7; hiHatConf.volume = -16;
    } else if (genreLower.includes("classical") || genreLower.includes("cinematic")) {
        melodyConf = { ...baseConfigs.pianoMelody, volume: -8 }; // Piano or strings
        bassConf = { ...baseConfigs.defaultBass, volume: -12 }; // Softer bass
        chordsConf = { ...baseConfigs.warmPadChords, volume: -18 }; // String-like pads
        arpConf = { ...baseConfigs.pluckArp, volume: -22 }; // Harp-like arps
    }


    // Override with specific instrument hints (higher priority)
    hintsLower.forEach(hint => {
      if (hint.includes('piano')) {
        melodyConf = { ...baseConfigs.pianoMelody, volume: -7 };
        chordsConf = { ...baseConfigs.pianoMelody, synthType: Tone.PolySynth, subType: Tone.FMSynth, options: {...baseConfigs.pianoMelody.options}, volume: -15 };
      } else if (hint.includes('electric piano')) {
        melodyConf = { ...baseConfigs.electricPianoChords, synthType: Tone.PolySynth, subType: Tone.FMSynth, options: {...baseConfigs.electricPianoChords.options}, volume: -9};
        chordsConf = { ...baseConfigs.electricPianoChords, volume: -16 };
      } else if (hint.includes('synth pad') || hint.includes('warm pad')) {
        chordsConf = { ...baseConfigs.warmPadChords, volume: -20 };
        if (!hintsLower.some(h => /piano|lead|guitar|pluck/i.test(h))) melodyConf = {...baseConfigs.warmPadChords, volume: -12}; // Pad can be melody too
      } else if (hint.includes('pluck') || hint.includes('bell') || hint.includes('xylophone')) {
        melodyConf = { ...baseConfigs.pluckArp, synthType: Tone.PluckSynth, options: {...baseConfigs.pluckArp.options}, volume: -10 };
        arpConf = { ...baseConfigs.pluckArp, volume: -16 };
      } else if (hint.includes('synth lead') || hint.includes('bright synth')) {
        melodyConf = { ...baseConfigs.synthLeadElectronic, volume: -8 };
      } else if (hint.includes('guitar') && hint.includes('acoustic')) {
          melodyConf = {...baseConfigs.acousticGuitarPluck, volume: -9};
          chordsConf = {synthType: Tone.PolySynth, subType: Tone.PluckSynth, options: {...baseConfigs.acousticGuitarPluck.options}, volume: -15};
          arpConf = {...baseConfigs.acousticGuitarPluck, volume: -17};
      } else if (hint.includes('guitar') && (hint.includes('rock') || hint.includes('electric') || hint.includes('distort'))) {
          melodyConf = {...baseConfigs.rockGuitarLead, volume: -8};
          chordsConf = {...baseConfigs.rockGuitarChords, volume: -16};
      } else if (hint.includes('sub bass')) {
          bassConf = {...baseConfigs.subBassElectronic, volume: -7};
      } else if (hint.includes('upright bass') || hint.includes('jazz bass')) {
          bassConf = {...baseConfigs.jazzUprightBass, volume: -9};
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
        console.warn("Invalid synth config, using default FMSynth", config);
        return new Tone.FMSynth().connect(offlineContext.destination);
    }
    let synthInstance;
    if (config.synthType === Tone.PolySynth) {
        synthInstance = new Tone.PolySynth(config.subType || Tone.Synth, config.options);
    } else {
        synthInstance = new config.synthType(config.options);
    }
    synthInstance.volume.value = config.volume !== undefined ? config.volume : -12;

    let effectChain = synthInstance;
    if (config.effects && Array.isArray(config.effects)) {
        config.effects.forEach((effectConf: any) => {
            if (effectConf.type === Tone.Distortion) {
                const dist = new Tone.Distortion(effectConf.amount || 0.4).connect(offlineContext.destination); // Effects also connect to dest
                effectChain = effectChain.connect(dist); // Synth to effect
            } else if (effectConf.type === Tone.Chorus) {
                const chorus = new Tone.Chorus(effectConf.frequency || 1.5, effectConf.delayTime || 3.5, effectConf.depth || 0.7).connect(offlineContext.destination);
                chorus.feedback.value = effectConf.feedback || 0.1;
                effectChain = effectChain.connect(chorus);
            } else if (effectConf.type === Tone.FeedbackDelay){
                 const delay = new Tone.FeedbackDelay(effectConf.delayTime || "8n", effectConf.feedback || 0.5).connect(offlineContext.destination);
                 delay.wet.value = effectConf.wet || 0.3;
                 effectChain = effectChain.connect(delay);
            }
        });
    }
    // The main synthInstance (or the end of its effect chain) should be returned to be connected to reverb or destination later.
    // For now, individual effects are connected to destination directly. This might need refinement for a proper chain.
    // The code below assumes synthInstance itself is what gets connected to reverb/destination.
    return synthInstance;
};


export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  const logPrefix = "[WAV_GEN_DYNAMIC_V2]";
  console.log(`${logPrefix} Starting dynamic synthesis for: ${params.generatedIdea.substring(0, 30)}...`);

  if (Tone.context.state !== 'running') {
    console.error(`${logPrefix}_ERROR] Global Tone.context is NOT 'running'. Aborting WAV generation.`);
    return null;
  }
  Tone.Transport.stop(true); Tone.Transport.cancel(0);
  Tone.Destination.volume.value = -3; // Overall mix level
  Tone.Transport.bpm.value = params.tempoBpm || 120;
  if (params.selectedGenre?.toLowerCase().includes("jazz")) {
    Tone.Transport.swing = 0.3; // Add a bit of swing for jazz
    Tone.Transport.swingSubdivision = "8n";
  } else {
    Tone.Transport.swing = 0;
  }
  console.log(`${logPrefix} Transport BPM: ${Tone.Transport.bpm.value}, Swing: ${Tone.Transport.swing}`);

  const isKidsMode = params.originalInput.mode === 'kids';
  const activeSynthConfigs = getSynthConfigurations(params.instrumentHints, params.selectedGenre, isKidsMode);

  const startOffset = 0.1; // Reduced start offset
  const secondsPerBeat = 60 / (Tone.Transport.bpm.value);
  const beatsPerMeasure = 4;
  const measureDurationSeconds = beatsPerMeasure * secondsPerBeat;
  let overallMaxTime = startOffset;

  // Define a simple chord progression (can be made more dynamic later)
  // I-V-vi-IV for major, i-VI-III-VII for minor (relative major's I-V-vi-IV)
  const progressionDegrees = params.mode.toLowerCase().includes('minor') ? [1, 6, 3, 7] : [1, 5, 6, 4];
  const numChordCycles = isKidsMode ? 2 : 4;
  const chordDurationNotation = "1m";
  const chordDurationSeconds = measureDurationSeconds; // Each chord lasts one measure

  // --- Melody Generation ---
  const melodyNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const melodyOctave = isKidsMode ? 5 : 4;
  const scaleNoteNames = getScaleNoteNames(params.keySignature, params.mode, melodyOctave, params.selectedGenre);
  let melodyCurrentTime = startOffset;
  let currentMelodyScaleIndex = Math.floor(Math.random() * scaleNoteNames.length);
  const totalMelodyDurationSeconds = numChordCycles * progressionDegrees.length * measureDurationSeconds;

  if (scaleNoteNames.length > 0) {
      while (melodyCurrentTime < totalMelodyDurationSeconds - TIME_EPSILON) {
          let noteDurationNotation: string;
          const density = params.rhythmicDensity || 0.5;
          if (isKidsMode) {
            noteDurationNotation = weightedRandom(["4n", "8n", "2n"], [0.7, 0.2, 0.1]) as string;
          } else if (params.selectedGenre?.toLowerCase().includes("jazz") && density > 0.4) {
            noteDurationNotation = weightedRandom(["8n", "16n", "8t"], [0.5, 0.3, 0.2]) as string;
          } else if (density < 0.33) {
            noteDurationNotation = weightedRandom(["2n", "4n", "1m"], [0.5, 0.4, 0.1]) as string;
          } else if (density < 0.66) {
            noteDurationNotation = weightedRandom(["4n", "8n", "2n"], [0.5, 0.3, 0.2]) as string;
          } else {
            noteDurationNotation = weightedRandom(["8n", "16n", "4n"], [0.6, 0.3, 0.1]) as string;
          }
          let noteDurationSec = Tone.Time(noteDurationNotation).toSeconds();

          if (melodyCurrentTime + noteDurationSec > totalMelodyDurationSeconds + TIME_EPSILON) {
              noteDurationSec = totalMelodyDurationSeconds - melodyCurrentTime;
              if (noteDurationSec <= TIME_EPSILON * 2) break;
              if (noteDurationSec >= Tone.Time("1m").toSeconds() - TIME_EPSILON) noteDurationNotation = "1m";
              else if (noteDurationSec >= Tone.Time("2n").toSeconds() - TIME_EPSILON) noteDurationNotation = "2n";
              else if (noteDurationSec >= Tone.Time("4n").toSeconds() - TIME_EPSILON) noteDurationNotation = "4n";
              else if (noteDurationSec >= Tone.Time("8n").toSeconds() - TIME_EPSILON) noteDurationNotation = "8n";
              else if (noteDurationSec >= Tone.Time("16n").toSeconds() - TIME_EPSILON) noteDurationNotation = "16n";
              else break;
              noteDurationSec = Tone.Time(noteDurationNotation).toSeconds();
          }
           if (melodyCurrentTime >= totalMelodyDurationSeconds - TIME_EPSILON) break;

          const restProbability = isKidsMode ? 0.15 : (0.25 - (density * 0.2));
          if (Math.random() < restProbability && melodyCurrentTime > startOffset + secondsPerBeat * 0.5 && melodyNotesToSchedule.length > 0) {
              let restDurNotation = density < 0.5 ? "8n" : "16n";
              if (noteDurationNotation === "2n" || noteDurationNotation === "1m") restDurNotation = "4n";
              const restDurSec = Tone.Time(restDurNotation).toSeconds();
              if (melodyCurrentTime + restDurSec <= totalMelodyDurationSeconds + TIME_EPSILON) {
                  melodyCurrentTime += restDurSec;
                   if (melodyCurrentTime >= totalMelodyDurationSeconds - TIME_EPSILON) break;
                  continue;
              }
          }

          const stepRoll = Math.random();
          let step: number;
          if (stepRoll < 0.6) step = Math.random() < 0.5 ? 1 : -1; // Small step
          else if (stepRoll < 0.85) step = Math.random() < 0.5 ? 2 : -2; // Medium step
          else step = Math.random() < 0.5 ? 3 : -3; // Larger step
          currentMelodyScaleIndex = (currentMelodyScaleIndex + step + scaleNoteNames.length * 7) % scaleNoteNames.length;
          const noteName = scaleNoteNames[currentMelodyScaleIndex];
          const velocity = 0.6 + Math.random() * 0.2 + (params.targetArousal || 0) * 0.1; // Velocity influenced by arousal

          let newTime = melodyCurrentTime;
          if (melodyNotesToSchedule.length > 0) {
            const lastEvent = melodyNotesToSchedule[melodyNotesToSchedule.length - 1];
            const lastEventEndTime = lastEvent.time + Tone.Time(lastEvent.duration).toSeconds();
            if (newTime < lastEventEndTime - TIME_EPSILON) newTime = lastEventEndTime + TIME_EPSILON; // Ensure no overlap
          }
          if (newTime >= totalMelodyDurationSeconds - TIME_EPSILON) break;

          melodyNotesToSchedule.push({ time: newTime, note: noteName, duration: noteDurationNotation, velocity: Math.min(0.95, Math.max(0.2, velocity)) });
          overallMaxTime = Math.max(overallMaxTime, newTime + noteDurationSec);
          melodyCurrentTime = newTime + noteDurationSec;
      }
  }
  console.log(`${logPrefix} Generated ${melodyNotesToSchedule.length} melody notes.`);

  // --- Bass Line Generation ---
  const bassNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const bassOctave = isKidsMode ? 2 : (genreLower.includes("jazz") || genreLower.includes("funk") ? 2 : 1);
  let bassCurrentTime = startOffset;
  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegrees.length; i++) {
        const degree = progressionDegrees[i];
        const chordNotesForBass = getChordNotesForKey(params.keySignature, params.mode, degree, bassOctave, params.harmonicComplexity > 0.6);
        const measureStartTime = startOffset + (cycle * progressionDegrees.length * measureDurationSeconds) + (i * measureDurationSeconds);

        if (genreLower.includes("jazz") && chordNotesForBass.length > 0) {
            const scaleForWalk = getScaleNoteNames(params.keySignature, params.mode, bassOctave, params.selectedGenre);
            let currentWalkNote = chordNotesForBass[0];
            for (let beat = 0; beat < beatsPerMeasure; beat++) {
                let noteTime = measureStartTime + beat * secondsPerBeat;
                if (bassNotesToSchedule.length > 0 && noteTime < bassNotesToSchedule[bassNotesToSchedule.length-1].time + TIME_EPSILON) noteTime = bassNotesToSchedule[bassNotesToSchedule.length-1].time + TIME_EPSILON;

                bassNotesToSchedule.push({ time: noteTime, note: currentWalkNote, duration: "4n", velocity: 0.55 + Math.random()*0.1 });
                overallMaxTime = Math.max(overallMaxTime, noteTime + secondsPerBeat);
                // Simple walk: move to next scale tone, prioritizing chord tones
                const currentRootMidi = robustNoteToMidi(currentWalkNote);
                const nextNoteOptions = scaleForWalk.filter(n => Math.abs(robustNoteToMidi(n) - currentRootMidi) <=2 && n !== currentWalkNote );
                currentWalkNote = nextNoteOptions.length > 0 ? nextNoteOptions[Math.floor(Math.random()*nextNoteOptions.length)] : scaleForWalk[(scaleForWalk.indexOf(currentWalkNote)+1)%scaleForWalk.length];
            }
        } else if (genreLower.includes("funk") || genreLower.includes("soul")) {
            // Syncopated pattern for Funk/Soul
            const baseNote = chordNotesForBass[0];
            const octaveNote = midiToNoteName(robustNoteToMidi(baseNote) + 12);
            const pattern = [
                { note: baseNote, timeOffset: 0, duration: "8n" },
                { timeOffset: secondsPerBeat * 0.75, duration: "16n", note: chordNotesForBass[1 % chordNotesForBass.length] }, // Syncopated
                { note: baseNote, timeOffset: secondsPerBeat * 1.5, duration: "8n" },
                { note: octaveNote, timeOffset: secondsPerBeat * 2.5, duration: "8n" },
                { note: chordNotesForBass[0], timeOffset: secondsPerBeat * 3.25, duration: "16n"},
            ];
            pattern.forEach(p => {
                let noteTime = measureStartTime + p.timeOffset;
                 if (bassNotesToSchedule.length > 0 && noteTime < bassNotesToSchedule[bassNotesToSchedule.length-1].time + TIME_EPSILON) noteTime = bassNotesToSchedule[bassNotesToSchedule.length-1].time + TIME_EPSILON;
                bassNotesToSchedule.push({ time: noteTime, note: p.note, duration: p.duration, velocity: 0.65 + Math.random()*0.1});
                overallMaxTime = Math.max(overallMaxTime, noteTime + Tone.Time(p.duration).toSeconds());
            });
        } else if (genreLower.includes("electronic") && params.rhythmicDensity > 0.5) {
            for (let beat = 0; beat < beatsPerMeasure * 2; beat++) { // 8th notes
                 let noteTime = measureStartTime + beat * (secondsPerBeat / 2);
                 if (bassNotesToSchedule.length > 0 && noteTime < bassNotesToSchedule[bassNotesToSchedule.length-1].time + TIME_EPSILON) noteTime = bassNotesToSchedule[bassNotesToSchedule.length-1].time + TIME_EPSILON;
                 bassNotesToSchedule.push({ time: noteTime, note: chordNotesForBass[0], duration: "8n", velocity: 0.6 });
                 overallMaxTime = Math.max(overallMaxTime, noteTime + secondsPerBeat/2);
            }
        }
        else { // Default: root note on downbeats or half notes
            const duration = isKidsMode || params.rhythmicDensity < 0.4 ? "2n" : "4n";
            const numNotes = duration === "2n" ? 2 : 4;
            for (let beat = 0; beat < numNotes; beat++) {
                 let noteTime = measureStartTime + beat * Tone.Time(duration).toSeconds();
                  if (bassNotesToSchedule.length > 0 && noteTime < bassNotesToSchedule[bassNotesToSchedule.length-1].time + TIME_EPSILON) noteTime = bassNotesToSchedule[bassNotesToSchedule.length-1].time + TIME_EPSILON;
                bassNotesToSchedule.push({ time: noteTime, note: chordNotesForBass[0], duration: duration, velocity: 0.6 });
                overallMaxTime = Math.max(overallMaxTime, noteTime + Tone.Time(duration).toSeconds());
            }
        }
        bassCurrentTime += measureDurationSeconds;
    }
  }
  console.log(`${logPrefix} Generated ${bassNotesToSchedule.length} bass notes.`);


  // --- Chord Generation ---
  const chordEventsToSchedule: { time: number, notes: string[], duration: string, velocity: number }[] = [];
  const chordOctave = isKidsMode ? 3 : (genreLower.includes("jazz") ? 4 : 3);
  let chordCurrentTimeForSched = startOffset;
  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (const degree of progressionDegrees) {
      const addSeventhForChord = !isKidsMode && (params.harmonicComplexity > 0.5 || genreLower.includes("jazz"));
      const chordNoteNames = getChordNotesForKey(params.keySignature, params.mode, degree, chordOctave, addSeventhForChord);
      
      if (chordNoteNames.length > 0) {
          let chordTime = chordCurrentTimeForSched;
          if (chordEventsToSchedule.length > 0 && chordTime < chordEventsToSchedule[chordEventsToSchedule.length-1].time + TIME_EPSILON) chordTime = chordEventsToSchedule[chordEventsToSchedule.length-1].time + TIME_EPSILON;

          let currentChordDuration = chordDurationNotation;
          let velocity = 0.40 + Math.random() * 0.1;

          if (!isKidsMode && (genreLower.includes("funk") || genreLower.includes("reggae"))) {
              // Staccato chords
              const numStabs = params.rhythmicDensity > 0.6 ? 4 : 2;
              const stabDuration = numStabs === 4 ? "16n" : "8n";
              for(let s=0; s < numStabs; s++) {
                  let stabTime = chordTime + s * (measureDurationSeconds / numStabs);
                   if (chordEventsToSchedule.length > 0 && s > 0 && stabTime < chordEventsToSchedule[chordEventsToSchedule.length-1].time + TIME_EPSILON) stabTime = chordEventsToSchedule[chordEventsToSchedule.length-1].time + TIME_EPSILON;

                  chordEventsToSchedule.push({ time: stabTime, notes: chordNoteNames, duration: stabDuration, velocity: velocity + 0.1 });
                  overallMaxTime = Math.max(overallMaxTime, stabTime + Tone.Time(stabDuration).toSeconds());
              }
          } else if (!isKidsMode && genreLower.includes("rock") && params.rhythmicDensity > 0.5){
              // Simulating strumming
              for(let s=0; s < 2; s++) { // two "strums" per measure
                 let strumTime = chordTime + s * (measureDurationSeconds / 2);
                 if (chordEventsToSchedule.length > 0 && s > 0 && strumTime < chordEventsToSchedule[chordEventsToSchedule.length-1].time + TIME_EPSILON) strumTime = chordEventsToSchedule[chordEventsToSchedule.length-1].time + TIME_EPSILON;
                 chordEventsToSchedule.push({ time: strumTime, notes: chordNoteNames, duration: "2n", velocity: velocity });
                 overallMaxTime = Math.max(overallMaxTime, strumTime + measureDurationSeconds/2);
              }
          } else {
            chordEventsToSchedule.push({ time: chordTime, notes: chordNoteNames, duration: currentChordDuration, velocity: velocity });
            overallMaxTime = Math.max(overallMaxTime, chordTime + Tone.Time(currentChordDuration).toSeconds());
          }
      }
      chordCurrentTimeForSched += measureDurationSeconds;
    }
  }
  console.log(`${logPrefix} Generated ${chordEventsToSchedule.length} chord events.`);

  // --- Arpeggio Generation ---
  const arpeggioNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const arpeggioOctave = isKidsMode ? 4 : (params.harmonicComplexity > 0.5 ? 5 : 4);
  const arpNoteDurationNotation = !isKidsMode && (params.rhythmicDensity > 0.6 || genreLower.includes("electronic")) ? "16n" : "8n";
  const arpNoteDurationSeconds = Tone.Time(arpNoteDurationNotation).toSeconds();
  
  if (!isKidsMode || (isKidsMode && params.harmonicComplexity > 0.1)) { // Only add arps in kids mode if complexity hint
    chordEventsToSchedule.forEach(chordEvent => {
        // Use the original chord event notes for arpeggiation, but transpose to arpeggioOctave
        const currentChordNotesForArp = chordEvent.notes.map(n => midiToNoteName(robustNoteToMidi(n.replace(/[0-9]+$/, String(arpeggioOctave)))));
        if (currentChordNotesForArp.length > 0) {
            const arpPattern = [
                currentChordNotesForArp[0],
                currentChordNotesForArp[1 % currentChordNotesForArp.length],
                currentChordNotesForArp[2 % currentChordNotesForArp.length],
                midiToNoteName(robustNoteToMidi(currentChordNotesForArp[0]) + (Math.random() < 0.5 ? 12 : 0)), 
            ];
            const notesPerBeatForArp = arpNoteDurationNotation === "16n" ? 4 : 2;
            const beatsToArpeggiate = isKidsMode ? 1 : (params.rhythmicDensity > 0.3 && params.harmonicComplexity > 0.3 ? 2 : 1);

            for (let beat = 0; beat < beatsToArpeggiate; beat++) {
                for (let i = 0; i < notesPerBeatForArp; i++) {
                    let noteTime = chordEvent.time + (beat * secondsPerBeat) + (i * arpNoteDurationSeconds);
                    if (noteTime < chordEvent.time + Tone.Time(chordEvent.duration).toSeconds() - TIME_EPSILON) {
                        if (arpeggioNotesToSchedule.length > 0 && noteTime < arpeggioNotesToSchedule[arpeggioNotesToSchedule.length-1].time + TIME_EPSILON) noteTime = arpeggioNotesToSchedule[arpeggioNotesToSchedule.length-1].time + TIME_EPSILON;

                        arpeggioNotesToSchedule.push({ time: noteTime, note: arpPattern[i % arpPattern.length], duration: arpNoteDurationNotation, velocity: 0.30 + Math.random() * 0.1 });
                        overallMaxTime = Math.max(overallMaxTime, noteTime + arpNoteDurationSeconds);
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
  let lastKickTime = -TIME_EPSILON, lastSnareTime = -TIME_EPSILON, lastHiHatTime = -TIME_EPSILON, lastTambourineTime = -TIME_EPSILON;

  for (let measure = 0; measure < numDrumMeasures; measure++) {
    for (let beat = 0; beat < beatsPerMeasure; beat++) {
      const currentTimeForDrumsThisBeat = startOffset + (measure * measureDurationSeconds) + (beat * secondsPerBeat);
      const isDownbeat = beat === 0;
      const isUpbeat = beat === 1 || beat === 3; // Snare beats

      // Kick
      let kickTime = currentTimeForDrumsThisBeat;
      let kickVelocity = 0.7 + Math.random() * 0.15;
      if (isKidsMode) {
        if (isDownbeat) {
          if (kickTime <= lastKickTime) kickTime = lastKickTime + TIME_EPSILON;
          drumEventsToSchedule.push({ synth: 'kick', time: kickTime, duration: "4n", velocity: kickVelocity, pitch: "C2" });
          lastKickTime = kickTime;
        }
      } else if (genreLower.includes("electronic")) {
          if (kickTime <= lastKickTime) kickTime = lastKickTime + TIME_EPSILON;
          drumEventsToSchedule.push({ synth: 'kick', time: kickTime, duration: "4n", velocity: kickVelocity + 0.1, pitch: "C2" }); // Four-on-the-floor
          lastKickTime = kickTime;
      } else if (genreLower.includes("funk") || genreLower.includes("soul")) {
          if (isDownbeat || (beat === 2 && Math.random() < 0.6) || (Math.random() < params.rhythmicDensity * 0.3)) {
              if (kickTime <= lastKickTime) kickTime = lastKickTime + TIME_EPSILON;
              drumEventsToSchedule.push({ synth: 'kick', time: kickTime, duration: "8n", velocity: kickVelocity, pitch: "C2" });
              lastKickTime = kickTime;
          }
      }
      else { // Rock, Pop, Jazz, etc.
        if (isDownbeat || (beat === 2 && params.rhythmicDensity > 0.3)) {
           if (kickTime <= lastKickTime) kickTime = lastKickTime + TIME_EPSILON;
           drumEventsToSchedule.push({ synth: 'kick', time: kickTime, duration: "4n", velocity: kickVelocity, pitch: "C2" });
           lastKickTime = kickTime;
        }
      }

      // Snare
      let snareTime = currentTimeForDrumsThisBeat;
      let snareVelocity = 0.65 + Math.random() * 0.1;
      if (isKidsMode) {
        if (beat === 2 && activeSynthConfigs.tambourine) { // Tambourine on 3 for kids
            if (snareTime <= lastTambourineTime) snareTime = lastTambourineTime + TIME_EPSILON;
            drumEventsToSchedule.push({ synth: 'tambourine', time: snareTime, duration: "8n", velocity: snareVelocity });
            lastTambourineTime = snareTime;
        } else if (isUpbeat && !activeSynthConfigs.tambourine) {
             if (snareTime <= lastSnareTime) snareTime = lastSnareTime + TIME_EPSILON;
            drumEventsToSchedule.push({ synth: 'snare', time: snareTime, duration: "8n", velocity: snareVelocity });
            lastSnareTime = snareTime;
        }
      } else if (isUpbeat) {
         if (snareTime <= lastSnareTime) snareTime = lastSnareTime + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'snare', time: snareTime, duration: "8n", velocity: snareVelocity + (genreLower.includes("electronic") || genreLower.includes("funk") ? 0.1 : 0), pitch: "D2" });
        lastSnareTime = snareTime;
      }
       // Ghost notes for funk/soul/jazz
      if (!isKidsMode && (genreLower.includes("funk") || genreLower.includes("soul") || genreLower.includes("jazz")) && params.rhythmicDensity > 0.5) {
          if (Math.random() < 0.3) {
            let ghostSnareTime = currentTimeForDrumsThisBeat + (secondsPerBeat * (Math.random() < 0.5 ? 0.25: 0.75) );
            if (ghostSnareTime <= lastSnareTime) ghostSnareTime = lastSnareTime + TIME_EPSILON;
            drumEventsToSchedule.push({synth: 'snare', time: ghostSnareTime, duration: "32n", velocity: 0.25 + Math.random()*0.1});
            lastSnareTime = ghostSnareTime;
          }
      }


      // Hi-Hat
      const hiHatSubdivisions = isKidsMode ? (params.rhythmicDensity > 0.2 ? 1 : 0) :
                                genreLower.includes("jazz") ? 3 : // For swing feel (approx)
                                params.rhythmicDensity < 0.3 ? 1 : // Quarter notes
                                params.rhythmicDensity < 0.6 ? 2 : // 8th notes
                                4; // 16th notes
      if (hiHatSubdivisions > 0) {
        const hiHatNoteDuration = hiHatSubdivisions === 1 ? "4n" : hiHatSubdivisions === 2 ? "8n" : hiHatSubdivisions === 3 ? "8t" : "16n";
        for (let subBeat = 0; subBeat < hiHatSubdivisions; subBeat++) {
          let hiHatTime = currentTimeForDrumsThisBeat + (subBeat * (secondsPerBeat / hiHatSubdivisions));
          if (hiHatTime <= lastHiHatTime) hiHatTime = lastHiHatTime + TIME_EPSILON;
          // Slight humanization offset for non-electronic genres
          if (!isKidsMode && !genreLower.includes("electronic")) hiHatTime += (Math.random() - 0.5) * 0.015 * secondsPerBeat;
          
          let hiHatPitch = activeSynthConfigs.hiHat.frequency || 300;
          if (genreLower.includes("jazz")) hiHatPitch = 500; // Ride cymbal-like for jazz

          drumEventsToSchedule.push({ synth: 'hiHat', time: hiHatTime, duration: hiHatNoteDuration, velocity: 0.35 + Math.random() * 0.1, pitch: hiHatPitch });
          lastHiHatTime = hiHatTime;
        }
      }
    }
  }
  drumEventsToSchedule.forEach(ev => { overallMaxTime = Math.max(overallMaxTime, ev.time + Tone.Time(ev.duration).toSeconds()); });
  console.log(`${logPrefix} Generated ${drumEventsToSchedule.length} drum events.`);

  // Ensure renderDuration is sufficient
  const renderDuration = Math.max(overallMaxTime + 2.0, MIN_EFFECTIVE_DURATION_SECONDS); // Add 2s tail
  console.log(`${logPrefix} Calculated renderDuration: ${renderDuration.toFixed(2)}s.`);

  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log(`${logPrefix}_OFFLINE] Inside Tone.Offline. Offline Context SR: ${offlineContext.sampleRate}`);
      offlineContext.transport.bpm.value = Tone.Transport.bpm.value;
      if (Tone.Transport.swing > 0) {
          offlineContext.transport.swing = Tone.Transport.swing;
          offlineContext.transport.swingSubdivision = Tone.Transport.swingSubdivision;
      }

      const reverb = new Tone.Reverb(isKidsMode ? 0.6 : 1.2).toDestination(); // Shorter reverb for kids
      if (activeSynthConfigs.melody.effects || activeSynthConfigs.chords.effects || activeSynthConfigs.arpeggio.effects) {
           // If synths have their own effects that go to destination, reverb might need to be an insert or a send.
           // For simplicity, assume effects are light and reverb can be parallel.
      } else {
          reverb.connect(offlineContext.destination);
      }
      await reverb.ready;
      console.log(`${logPrefix}_OFFLINE] Reverb created and ready.`);

      const melodySynth = createSynth(activeSynthConfigs.melody, offlineContext).connect(reverb);
      const bassSynth = createSynth(activeSynthConfigs.bass, offlineContext).connect(offlineContext.destination); // Bass usually dry
      const chordSynth = createSynth(activeSynthConfigs.chords, offlineContext).connect(reverb);
      let arpeggioSynth;
      if (arpeggioNotesToSchedule.length > 0) {
        arpeggioSynth = createSynth(activeSynthConfigs.arpeggio, offlineContext).connect(reverb);
      }

      console.log(`${logPrefix}_OFFLINE] Melody, Bass, Chord, Arp Synths created.`);

      melodyNotesToSchedule.forEach((ev) => melodySynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
      bassNotesToSchedule.forEach((ev) => bassSynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
      chordEventsToSchedule.forEach((ev) => chordSynth.triggerAttackRelease(ev.notes, ev.duration, ev.time, ev.velocity));
      if (arpeggioSynth) {
        arpeggioNotesToSchedule.forEach((ev) => arpeggioSynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
      }
      
      console.log(`${logPrefix}_OFFLINE] Setting up drum synths.`);
      const kickSynth = new Tone.MembraneSynth(activeSynthConfigs.kick).connect(offlineContext.destination);
      const snareSynth = new Tone.NoiseSynth(activeSynthConfigs.snare).connect(offlineContext.destination);
      const hiHatSynth = new Tone.MetalSynth(activeSynthConfigs.hiHat).connect(offlineContext.destination);
      let tambourineSynth;
      if (activeSynthConfigs.tambourine) {
        tambourineSynth = new Tone.NoiseSynth(activeSynthConfigs.tambourine).connect(offlineContext.destination);
      }
      console.log(`${logPrefix}_OFFLINE] Drum synths created.`);

      lastKickTime = -TIME_EPSILON; lastSnareTime = -TIME_EPSILON; lastHiHatTime = -TIME_EPSILON; lastTambourineTime = -TIME_EPSILON;
      drumEventsToSchedule.forEach(ev => {
        const { synth, time, duration, velocity, pitch } = ev;
        let correctedTime = time;
         // Add small random offset for humanization, except for electronic strict genres
        if (!isKidsMode && !genreLower.includes("electronic")) {
            correctedTime += (Math.random() - 0.5) * 0.02; // up to 20ms deviation
            if (correctedTime < 0) correctedTime = 0;
        }

        if (synth === 'kick') {
          if (correctedTime <= lastKickTime) correctedTime = lastKickTime + TIME_EPSILON;
          kickSynth.triggerAttackRelease(pitch as string || "C2", duration, correctedTime, velocity);
          lastKickTime = correctedTime;
        } else if (synth === 'snare') {
          if (correctedTime <= lastSnareTime) correctedTime = lastSnareTime + TIME_EPSILON;
          snareSynth.triggerAttackRelease(duration, correctedTime, velocity);
          lastSnareTime = correctedTime;
        } else if (synth === 'hiHat') {
          if (correctedTime <= lastHiHatTime) correctedTime = lastHiHatTime + TIME_EPSILON;
          hiHatSynth.triggerAttackRelease(typeof pitch === 'number' ? pitch : (activeSynthConfigs.hiHat.frequency || 300), duration, correctedTime, velocity);
          lastHiHatTime = correctedTime;
        } else if (synth === 'tambourine' && tambourineSynth) {
            if (correctedTime <= lastTambourineTime) correctedTime = lastTambourineTime + TIME_EPSILON;
            tambourineSynth.triggerAttackRelease(duration, correctedTime, velocity);
            lastTambourineTime = correctedTime;
        }
      });
      console.log(`${logPrefix}_OFFLINE] All events scheduled.`);

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

