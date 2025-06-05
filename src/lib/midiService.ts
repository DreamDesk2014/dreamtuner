
// @ts-nocheck - Disabling TypeScript checks for this file due to midi-writer-js typings
import MidiWriter, { Constants as MidiWriterConstants } from 'midi-writer-js';
import type { MusicParameters, AppInput } from '@/types';
import { TARGET_TOTAL_MIDI_SECONDS, MIN_SONG_BODY_SECONDS_FOR_CALC } from '@/lib/constants';


const PITCH_CLASSES: { [key: string]: number } = {
    'C': 0, 'B#': 0, 'BS': 0,
    'C#': 1, 'DB': 1, 'CS': 1,
    'D': 2,
    'D#': 3, 'EB': 3, 'DS': 3,
    'E': 4, 'FB': 4,
    'F': 5, 'E#': 5, 'ES': 5,
    'F#': 6, 'GB': 6, 'FS': 6,
    'G': 7,
    'G#': 8, 'AB': 8, 'GS': 8,
    'A': 9,
    'A#': 10, 'BB': 10, 'AS': 10,
    'B': 11, 'CB': 11,
};

const NOTES_ARRAY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DEFAULT_MIDI_NOTE = 60; // C4

function isValidMidiNumber(num: number): boolean {
    return typeof num === 'number' && !isNaN(num) && num >= 0 && num <= 127;
}

function robustNoteToMidi(noteNameWithOctave: string): number {
    if (typeof noteNameWithOctave !== 'string') {
        console.error(`Invalid input type for robustNoteToMidi: ${typeof noteNameWithOctave}, defaulting to ${DEFAULT_MIDI_NOTE}`);
        return DEFAULT_MIDI_NOTE;
    }
    const match = noteNameWithOctave.match(/([A-G])([#bSsxBF]*)(-?[0-9]+)/i);
    
    if (!match) {
        const simpleMatch = noteNameWithOctave.match(/([A-G])([#bSsxBF]*)/i);
        if (simpleMatch) {
             const base = simpleMatch[1].toUpperCase();
             const acc = simpleMatch[2]?.toUpperCase() || '';
             const assumedOctave4Note = base + acc + '4';
             return robustNoteToMidi(assumedOctave4Note);
        }
        console.error(`Invalid note format for MIDI conversion: '${noteNameWithOctave}', defaulting to ${DEFAULT_MIDI_NOTE}`);
        return DEFAULT_MIDI_NOTE;
    }

    let pitchClassName = match[1].toUpperCase();
    const accidentals = match[2]?.toUpperCase() || '';
    const octave = parseInt(match[3], 10);

    if (isNaN(octave)) {
        console.error(`Invalid octave in note: '${noteNameWithOctave}', defaulting to ${DEFAULT_MIDI_NOTE}`);
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
             console.error(`Unknown base pitch class: '${pitchClassName}' from '${noteNameWithOctave}', defaulting to ${DEFAULT_MIDI_NOTE}`);
             return DEFAULT_MIDI_NOTE;
        }
    }
    
    const finalMidiNumber = midiNumberBase + (effectiveOctave + 1) * 12;

    if (!isValidMidiNumber(finalMidiNumber)) {
        console.error(`Calculated MIDI number ${finalMidiNumber} for '${noteNameWithOctave}' is out of range (0-127), defaulting to ${DEFAULT_MIDI_NOTE}.`);
        return DEFAULT_MIDI_NOTE;
    }
    return finalMidiNumber;
}

function midiToNoteName(midiNumber: number): string {
    if (!isValidMidiNumber(midiNumber)) {
        console.error(`Invalid MIDI number ${midiNumber} for note name conversion, defaulting to C4.`);
        midiNumber = DEFAULT_MIDI_NOTE;
    }
    const octave = Math.floor(midiNumber / 12) - 1;
    const noteIndex = midiNumber % 12;
    if (noteIndex < 0 || noteIndex >= NOTES_ARRAY.length) {
      console.error(`Invalid note index ${noteIndex} from MIDI ${midiNumber}`);
      return 'C4'; 
    }
    return NOTES_ARRAY[noteIndex] + octave;
}

const STANDARD_MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const STANDARD_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
const BLUES_SCALE_INTERVALS = [0, 3, 5, 6, 7, 10]; 
const MAJOR_PENTATONIC_INTERVALS = [0, 2, 4, 7, 9];
const MINOR_PENTATONIC_INTERVALS = [0, 3, 5, 7, 10];
const DORIAN_INTERVALS = [0, 2, 3, 5, 7, 9, 10];
const MIXOLYDIAN_INTERVALS = [0, 2, 4, 5, 7, 9, 10];


function getScaleNotesForKey(
    keySignature: string, 
    mode: 'major' | 'minor' | string, 
    startOctave: number = 4,
    genre?: string,
    rhythmicDensityForPentatonicHint?: number,
    harmonicComplexity?: number,
    isKidsMode: boolean = false
): number[] { 
    const baseKeyForScale = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const rootMidiBase = robustNoteToMidi(baseKeyForScale + '0') % 12; 

    let intervals: number[];
    const genreLower = genre?.toLowerCase();

    if (isKidsMode) {
        intervals = MAJOR_PENTATONIC_INTERVALS; 
    } else if (genreLower?.includes('blues')) {
        intervals = BLUES_SCALE_INTERVALS;
    } else if (genreLower?.includes('jazz')) {
        if (mode.toLowerCase().includes('minor')) intervals = DORIAN_INTERVALS;
        else if (harmonicComplexity && harmonicComplexity > 0.6) intervals = MIXOLYDIAN_INTERVALS; // For dominant feel
        else intervals = STANDARD_MAJOR_INTERVALS;
    } else if (
        (genreLower?.includes('rock') || genreLower?.includes('pop') || genreLower?.includes('folk')) && 
        typeof rhythmicDensityForPentatonicHint === 'number' && 
        rhythmicDensityForPentatonicHint < 0.5 
    ) {
        intervals = mode.toLowerCase().includes('minor') ? MINOR_PENTATONIC_INTERVALS : MAJOR_PENTATONIC_INTERVALS;
    } else {
        intervals = (mode.toLowerCase().includes('minor')) ? STANDARD_MINOR_INTERVALS : STANDARD_MAJOR_INTERVALS;
    }
     if (!intervals) { 
        console.warn("Intervals not assigned in getScaleNotesForKey, defaulting to Major intervals. Inputs:", {keySignature, mode, genre, isKidsMode});
        intervals = STANDARD_MAJOR_INTERVALS;
    }


    return intervals.map(interval => {
        const currentMidiValue = rootMidiBase + interval;
        const octaveOffset = Math.floor(currentMidiValue / 12); 
        const noteMidiNumber = (currentMidiValue % 12) + (startOctave + octaveOffset + 1) * 12;
        return isValidMidiNumber(noteMidiNumber) ? noteMidiNumber : robustNoteToMidi(midiToNoteName(DEFAULT_MIDI_NOTE) + startOctave);
    });
}

interface ChordDefinition {
    notes: number[]; 
    quality: 'major' | 'minor' | 'diminished' | 'augmented' | 'dominant7th' | string;
    duration: string; 
    rootNoteMidi: number; 
    measureDuration?: string; 
}

function getChordProgressionWithDetails(
    keySignature: string,
    mode: 'major' | 'minor' | string,
    numCycles: number, 
    baseOctave: number = 3,
    harmonicComplexity: number = 0.5,
    genre?: string,
    isKidsMode: boolean = false
): ChordDefinition[] {
    const baseKeyForChords = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const keyRootMidiBase = robustNoteToMidi(baseKeyForChords + '0') % 12;
    const genreLower = genre?.toLowerCase();

    const buildChord = (rootOffset: number, quality: ChordDefinition['quality'], octave: number, isDominant7thOverride: boolean = false): { notes: number[], quality: ChordDefinition['quality'], rootNoteMidi: number } => {
        const currentRootMidiValue = keyRootMidiBase + rootOffset;
        const octaveForRoot = octave + Math.floor(currentRootMidiValue / 12);
        const normalizedRootMidiPitch = (currentRootMidiValue % 12) + (octaveForRoot + 1) * 12;

        let thirdInterval = 4; 
        let fifthInterval = 7; 
        let seventhInterval: number | null = null;

        if (quality === 'minor') { thirdInterval = 3; }
        else if (quality === 'diminished') { thirdInterval = 3; fifthInterval = 6; } 
        else if (quality === 'augmented') { fifthInterval = 8; }
        else if (quality === 'dominant7th' || isDominant7thOverride) { thirdInterval = 4; fifthInterval = 7; seventhInterval = 10; }

        let chordMidiNumbers = [
            normalizedRootMidiPitch,
            normalizedRootMidiPitch + thirdInterval,
            normalizedRootMidiPitch + fifthInterval
        ];
        
        const useSeventh = harmonicComplexity > 0.6 || isDominant7thOverride || (genreLower?.includes('jazz') && harmonicComplexity > 0.3);

        if (useSeventh && !isKidsMode) {
            if (seventhInterval === null) { // Calculate default seventh if not dominant7th
                 seventhInterval = (quality === 'major' || quality === 'minor') ? 10 : (quality === 'diminished' ? 9 : 11); // Minor 7th for major/minor, diminished 7th for dim, major 7th for aug
            }
             chordMidiNumbers.push(normalizedRootMidiPitch + seventhInterval);
        }
        
        if (genreLower?.includes('rock') && harmonicComplexity < 0.4) { // Power chords
             chordMidiNumbers = [normalizedRootMidiPitch, normalizedRootMidiPitch + fifthInterval];
        }


        if (isKidsMode) { 
             chordMidiNumbers = [normalizedRootMidiPitch, normalizedRootMidiPitch + thirdInterval, normalizedRootMidiPitch + fifthInterval];
        }
        
        const validatedNotes = chordMidiNumbers.filter(isValidMidiNumber);
        if (validatedNotes.length < (genreLower?.includes('rock') && harmonicComplexity < 0.4 ? 2:1) && chordMidiNumbers.length >=1 ) { 
             return { notes: [normalizedRootMidiPitch].filter(isValidMidiNumber), quality, rootNoteMidi: normalizedRootMidiPitch };
        }
        return { notes: validatedNotes, quality, rootNoteMidi: normalizedRootMidiPitch };
    };

    let baseProgression: ChordDefinition[] = [];
    const defaultDuration = '1'; 

    if (isKidsMode) {
         baseProgression = [
            { ...buildChord(0, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }, // I
            { ...buildChord(5, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }, // IV
            { ...buildChord(7, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }, // V
            { ...buildChord(0, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }  // I
        ];
    } else if (genreLower?.includes('blues')) {
        baseProgression = [
            { ...buildChord(0, 'dominant7th', baseOctave, true), duration: defaultDuration, measureDuration: '1' }, // I7
            { ...buildChord(5, 'dominant7th', baseOctave, true), duration: defaultDuration, measureDuration: '1' }, // IV7
            { ...buildChord(7, 'dominant7th', baseOctave, true), duration: defaultDuration, measureDuration: '1' }, // V7
            { ...buildChord(0, 'dominant7th', baseOctave, true), duration: defaultDuration, measureDuration: '1' }  // I7
        ];
    } else if (genreLower?.includes('jazz')) {
        if (mode.toLowerCase().includes('minor')) {
             baseProgression = [
                { ...buildChord(2, 'diminished', baseOctave), duration: defaultDuration, measureDuration: '1' }, // ii° (half-diminished often)
                { ...buildChord(7, 'dominant7th', baseOctave, true), duration: defaultDuration, measureDuration: '1' }, // V7
                { ...buildChord(0, 'minor', baseOctave), duration: defaultDuration, measureDuration: '1' }, // i
                { ...buildChord(0, 'minor', baseOctave), duration: defaultDuration, measureDuration: '1' }  // i (extra measure for feel)
            ];
        } else {
            baseProgression = [
                { ...buildChord(2, 'minor', baseOctave), duration: defaultDuration, measureDuration: '1' },  // ii
                { ...buildChord(7, 'dominant7th', baseOctave, true), duration: defaultDuration, measureDuration: '1' }, // V7
                { ...buildChord(0, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' },  // I
                { ...buildChord(0, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }   // I
            ];
        }
    } else if (genreLower?.includes('pop') || genreLower?.includes('rock')) {
        if (mode.toLowerCase().includes('minor')) {
             baseProgression = [ // Common minor pop/rock: i - VI - III - VII
                { ...buildChord(0, 'minor', baseOctave), duration: defaultDuration, measureDuration: '1' }, // i
                { ...buildChord(8, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }, // VI
                { ...buildChord(3, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }, // III
                { ...buildChord(10, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }  // VII
            ];
        } else { // Common major pop/rock: I - V - vi - IV
            baseProgression = [ 
                { ...buildChord(0, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' },  // I
                { ...buildChord(7, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' },  // V
                { ...buildChord(9, 'minor', baseOctave), duration: defaultDuration, measureDuration: '1' },  // vi
                { ...buildChord(5, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }   // IV
            ];
        }
    }
     else { 
        if (mode.toLowerCase().includes('minor')) {
            baseProgression = [ 
                { ...buildChord(0, 'minor', baseOctave), duration: defaultDuration, measureDuration: '1' }, // i
                { ...buildChord(5, 'minor', baseOctave), duration: defaultDuration, measureDuration: '1' }, // iv
                { ...buildChord(7, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }, // V (often major dominant in minor)
                { ...buildChord(0, 'minor', baseOctave), duration: defaultDuration, measureDuration: '1' }  // i
            ];
        } else { 
            baseProgression = [ 
                { ...buildChord(0, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' },  // I
                { ...buildChord(5, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' },  // IV
                { ...buildChord(7, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' },  // V
                { ...buildChord(0, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }   // I
            ];
        }
    }


    const fullProgression: ChordDefinition[] = [];
    for (let i = 0; i < numCycles; i++) {
        fullProgression.push(...baseProgression);
    }
    return fullProgression;
}

interface InstrumentMapping {
    melody: number; bass: number; chordsPad: number; arpeggioSynth: number; drums: number; 
}

const KID_INSTRUMENTS = {
    XYLOPHONE: 13, TOY_PIANO: 8, UKULELE: 24, RECORDER: 74,
    SIMPLE_SYNTH_LEAD: 80, SIMPLE_SYNTH_PAD: 89, 
    SHAKER_NOTE: 70, TAMBOURINE_NOTE: 54, 
};


const mapInstrumentHintToGM = (hints: string[], genre?: string, isKidsMode: boolean = false): InstrumentMapping => {
    let mapping: InstrumentMapping = { melody: 80, bass: 33, chordsPad: 89, arpeggioSynth: 81, drums: 0 }; 
    const genreLower = genre?.toLowerCase();

    if (isKidsMode) {
        mapping = { 
            melody: KID_INSTRUMENTS.XYLOPHONE, bass: KID_INSTRUMENTS.UKULELE, 
            chordsPad: KID_INSTRUMENTS.SIMPLE_SYNTH_PAD, arpeggioSynth: KID_INSTRUMENTS.TOY_PIANO, drums: 0 
        };
        (hints || []).forEach(hint => {
            const hLower = hint.toLowerCase();
            if (/xylophone/i.test(hLower)) mapping.melody = KID_INSTRUMENTS.XYLOPHONE;
            else if (/toy piano|celesta|music box/i.test(hLower)) { mapping.melody = KID_INSTRUMENTS.TOY_PIANO; mapping.arpeggioSynth = KID_INSTRUMENTS.TOY_PIANO; }
            else if (/ukulele/i.test(hLower)) { mapping.melody = KID_INSTRUMENTS.UKULELE; mapping.bass = KID_INSTRUMENTS.UKULELE;}
            else if (/recorder/i.test(hLower)) mapping.melody = KID_INSTRUMENTS.RECORDER;
            else if (/simple synth|synth lead/i.test(hLower)) mapping.melody = KID_INSTRUMENTS.SIMPLE_SYNTH_LEAD;
            else if (/synth pad/i.test(hLower)) mapping.chordsPad = KID_INSTRUMENTS.SIMPLE_SYNTH_PAD;
        });
        return mapping;
    }

    if (genreLower) {
        if (genreLower.includes("rock")) { mapping = { melody: 27, bass: 34, chordsPad: 27, arpeggioSynth: 27, drums: 0 }; } 
        else if (genreLower.includes("pop")) { mapping = { melody: 80, bass: 38, chordsPad: 90, arpeggioSynth: 81, drums: 0 }; } 
        else if (genreLower.includes("jazz")) { mapping = { melody: 1, bass: 32, chordsPad: 1, arpeggioSynth: 52, drums: 0 }; } 
        else if (genreLower.includes("electronic")) { mapping = { melody: 80, bass: 38, chordsPad: 90, arpeggioSynth: 81, drums: 25 }; } 
        else if (genreLower.includes("ambient")) { mapping = { melody: 90, bass: 90, chordsPad: 89, arpeggioSynth: 99, drums: 0 }; } 
        else if (genreLower.includes("classical") || genreLower.includes("cinematic")) { mapping = { melody: 40, bass: 42, chordsPad: 48, arpeggioSynth: 49, drums: 0 }; } 
        else if (genreLower.includes("folk")) { mapping = { melody: 24, bass: 32, chordsPad: 24, arpeggioSynth: 73, drums: 0 }; } 
        else if (genreLower.includes("blues")) { mapping = { melody: 27, bass: 33, chordsPad: 19, arpeggioSynth: 25, drums: 0 }; } 
        else if (genreLower.includes("reggae")) { mapping = { melody: 19, bass: 34, chordsPad: 25, arpeggioSynth: 27, drums: 0 }; } 
        else if (genreLower.includes("country")) { mapping = { melody: 25, bass: 33, chordsPad: 24, arpeggioSynth: 27, drums: 0 }; } 
        else if (genreLower.includes("metal")) { mapping = { melody: 30, bass: 35, chordsPad: 30, arpeggioSynth: 81, drums: 0 }; } 
        else if (genreLower.includes("funk") || genreLower.includes("soul")) { mapping = { melody: 57, bass: 36, chordsPad: 17, arpeggioSynth: 62, drums: 0 }; } 
    }

    (hints || []).forEach(hint => {
        const hLower = hint.toLowerCase();
        if (/piano/i.test(hLower)) { mapping.melody = 0; if (genreLower?.includes("jazz") || !genreLower) mapping.chordsPad = 0; }
        else if (/flute/i.test(hLower)) mapping.melody = 73;
        else if (/violin|strings/i.test(hLower) && !/ensemble|pad/i.test(hLower)) mapping.melody = 40;
        else if (/guitar/i.test(hLower) && !/bass|acoustic|steel/i.test(hLower)) mapping.melody = 27; 
        else if (/acoustic guitar/i.test(hLower)) mapping.melody = 24;
        else if (/steel guitar/i.test(hLower)) mapping.melody = 25;
        else if (/trumpet|brass/i.test(hLower) && !/section/i.test(hLower)) mapping.melody = 56;
        else if (/sax|saxophone/i.test(hLower)) mapping.melody = 65;
        else if (/bell|celesta|glockenspiel|music box/i.test(hLower)) { mapping.melody = 9; mapping.arpeggioSynth = 14; } 
        else if (/bright synth|synth lead/i.test(hLower)) mapping.melody = 80;
        else if (/warm lead|soft lead/i.test(hLower)) mapping.melody = 81;
        else if (/organ/i.test(hLower) && !genreLower?.includes("blues") && !genreLower?.includes("funk")) mapping.melody = 19; 

        if (/synth bass|bass synth/i.test(hLower)) mapping.bass = 38;
        else if (/acoustic bass|double bass|upright bass/i.test(hLower)) mapping.bass = 32;
        else if (/picked bass/i.test(hLower)) mapping.bass = 34;
        else if (/slap bass/i.test(hLower)) mapping.bass = 36;
        else if (/fretless bass/i.test(hLower)) mapping.bass = 35;
        else if (/cello/i.test(hLower) && (genreLower?.includes("classical") || genreLower?.includes("cinematic"))) mapping.bass = 42;


        if (/string ensemble|strings pad/i.test(hLower)) mapping.chordsPad = 48;
        else if (/synth pad|ambient pad|warm pad/i.test(hLower)) mapping.chordsPad = 89;
        else if (/dark pad|sweep pad/i.test(hLower)) mapping.chordsPad = 96;
        else if (/organ/i.test(hLower) && (genreLower?.includes("blues") || genreLower?.includes("funk") || genreLower?.includes("reggae"))) mapping.chordsPad = 19;
        else if (/electric piano/i.test(hLower) && (genreLower?.includes("jazz") || genreLower?.includes("soul") || genreLower?.includes("funk"))) mapping.chordsPad = 4;
        else if (/choir|voice|aahs/i.test(hLower)) mapping.chordsPad = 52;
        else if (/brass section/i.test(hLower)) mapping.chordsPad = 61;

        if (/arp|arpeggio|pluck|sequence/i.test(hLower)) mapping.arpeggioSynth = 99;
        else if (/fx|sound effect/i.test(hLower)) mapping.arpeggioSynth = 102;
    });
    return mapping;
};

const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

const getTPQN = () => {
    if (MidiWriterConstants && typeof MidiWriterConstants.TPQN === 'number') {
        return MidiWriterConstants.TPQN;
    }
    console.warn(
        `midi-writer-js: MidiWriterConstants.TPQN not found or not a number. Using default value 128. MidiWriterConstants: ${typeof MidiWriterConstants}`
    );
    return 128; 
};


export const generateMidiFile = (params: MusicParameters): string => {
    const isKidsMode = params.originalInput.mode === 'kids';
    const { targetValence, targetArousal, harmonicComplexity, rhythmicDensity } = params;
    const genreLower = params.selectedGenre?.toLowerCase();

    const melodyTrack = new MidiWriter.Track();
    const bassTrack = new MidiWriter.Track();
    const chordsPadTrack = new MidiWriter.Track();
    const arpeggioTrack = new MidiWriter.Track();
    const drumTrack = new MidiWriter.Track();
    
    melodyTrack.setTempo(params.tempoBpm); 
    bassTrack.setTempo(params.tempoBpm);
    chordsPadTrack.setTempo(params.tempoBpm);
    arpeggioTrack.setTempo(params.tempoBpm);
    drumTrack.setTempo(params.tempoBpm);

    const instruments = mapInstrumentHintToGM(params.instrumentHints, params.selectedGenre, isKidsMode);
    melodyTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.melody }));
    bassTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.bass }));
    chordsPadTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.chordsPad }));
    arpeggioTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.arpeggioSynth })); 
    drumTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.drums, channel: 10 }));


    const melodyOctave = isKidsMode ? 5 : (genreLower?.includes('jazz') && harmonicComplexity > 0.5 ? 5 : 4);
    const bassOctave = isKidsMode ? 3 : (genreLower?.includes('rock') || genreLower?.includes('metal') ? 2 : 2);
    const chordOctave = isKidsMode ? 4 : (genreLower?.includes('jazz') ? 4 : 3);
    const arpeggioOctave = isKidsMode ? 5 : (harmonicComplexity > 0.6 ? 5 : 4); 

    const beatsPerMeasure = 4;
    const secondsPerBeat = 60 / params.tempoBpm;
    const secondsPerMeasure = beatsPerMeasure * secondsPerBeat;
    const measuresInBaseProgression = 4; 
    const secondsPerBaseProgression = measuresInBaseProgression * secondsPerMeasure;
    
    const outroDurationMeasures = 2; 
    const outroDurationSeconds = outroDurationMeasures * secondsPerMeasure;

    let targetSongBodySeconds = TARGET_TOTAL_MIDI_SECONDS - outroDurationSeconds;
    targetSongBodySeconds = Math.max(targetSongBodySeconds, Math.max(MIN_SONG_BODY_SECONDS_FOR_CALC, secondsPerBaseProgression));


    let numProgressionCycles = Math.max(1, Math.round(targetSongBodySeconds / secondsPerBaseProgression));
    
    const progression = getChordProgressionWithDetails(params.keySignature, params.mode, numProgressionCycles, chordOctave, harmonicComplexity, params.selectedGenre, isKidsMode);
    
    const calculateDynamicVelocity = (base: number, minVel: number, maxVel: number, randomRangeBase: number) => {
        const valenceMod = targetValence * 10 * (isKidsMode ? 0.5 : 1); 
        const arousalMod = targetArousal * 25 * (isKidsMode ? 0.7 : 1.2); 
        let dynamicBase = clamp(base + valenceMod + arousalMod, minVel - 10, maxVel + 10); 
        
        const randomRange = randomRangeBase + Math.abs(targetArousal * (randomRangeBase * (isKidsMode ? 0.75 : 1.5))); 
        return clamp(
            Math.round(dynamicBase - (randomRange / 2) + Math.random() * randomRange), 
            minVel,
            maxVel
        );
    };

    progression.forEach((chordDef, measureIndex) => {
        if (!chordDef) {
            console.warn(`Undefined chordDef at measureIndex ${measureIndex} in chordsPadTrack. Skipping this measure.`);
            return; 
        }
        if (!Array.isArray(chordDef.notes)) {
            console.warn(`chordDef.notes is not an array at measureIndex ${measureIndex} in chordsPadTrack. Defaulting to empty. ChordDef:`, chordDef);
            chordDef.notes = [];
        }

        const chordVelocity = calculateDynamicVelocity(isKidsMode ? 40 : 50, isKidsMode ? 25 : 30, isKidsMode ? 70 : 85, isKidsMode ? 8 : 12); 
        if (chordDef.notes && chordDef.notes.length > 0) {
            const notesToPlay = isKidsMode ? [chordDef.notes[0]] : chordDef.notes; 
            if (notesToPlay && notesToPlay.length > 0 && isValidMidiNumber(notesToPlay[0])) {
                 chordsPadTrack.addEvent(new MidiWriter.NoteEvent({ 
                     pitch: notesToPlay, 
                     duration: chordDef.measureDuration || '1', 
                     velocity: chordVelocity 
                }));
            }
        }
    });
    
    progression.forEach((chordDef, measureIndex) => {
        if (!chordDef) {
            console.warn(`Undefined chordDef at measureIndex ${measureIndex} in bassTrack. Skipping this measure.`);
            return; 
        }
        if (!Array.isArray(chordDef.notes)) {
            console.warn(`chordDef.notes is not an array at measureIndex ${measureIndex} in bassTrack. Defaulting to empty. ChordDef:`, chordDef);
            chordDef.notes = [];
        }

        const bassNoteMidi = robustNoteToMidi(midiToNoteName(chordDef.rootNoteMidi).replace(/[0-9]+$/, String(bassOctave)));
        const bassVelocity = calculateDynamicVelocity(isKidsMode ? 60 : 70, isKidsMode ? 35 : 40, isKidsMode ? 85 : 105, isKidsMode ? 12 : 18); 
        
        if (!isValidMidiNumber(bassNoteMidi)) return;

        if (isKidsMode) {
            bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: '1', velocity: bassVelocity}));
        } else if (genreLower && (genreLower.includes('rock') || genreLower.includes('pop') || genreLower.includes('metal') || genreLower.includes('country'))) {
            for (let i = 0; i < beatsPerMeasure; i++) { 
                 bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: '4', velocity: calculateDynamicVelocity(75, 55, 110, 8)})); 
            }
        } else if (genreLower && genreLower.includes('electronic')) {
             if (rhythmicDensity > 0.6) { 
                for (let i = 0; i < beatsPerMeasure * 2; i++) { 
                    bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: '8', velocity: calculateDynamicVelocity(70, 50, 105, 12)}));
                }
            } else { 
                 for (let i = 0; i < beatsPerMeasure; i++) {
                    bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: '4', velocity: calculateDynamicVelocity(70, 50, 100, 8)}));
                }
            }
        } else if (genreLower && genreLower.includes('jazz')) { 
            const rawScaleForWalking = getScaleNotesForKey(midiToNoteName(chordDef.rootNoteMidi), chordDef.quality, bassOctave, params.selectedGenre, rhythmicDensity, harmonicComplexity, isKidsMode);
            const scaleForWalking = Array.isArray(rawScaleForWalking) ? rawScaleForWalking : [];

            for (let i = 0; i < beatsPerMeasure; i++) {
                let noteChoice = bassNoteMidi;
                if (i > 0 && scaleForWalking.length > 0 && bassTrack.notes && bassTrack.notes.length > 0) {
                    const prevNoteEvent = bassTrack.notes[bassTrack.notes.length - 1];
                    let pitchToSearch: number | string = bassNoteMidi; 

                    if (prevNoteEvent && prevNoteEvent.pitch) {
                        if (Array.isArray(prevNoteEvent.pitch) && prevNoteEvent.pitch.length > 0 && prevNoteEvent.pitch[0] !== undefined) {
                           pitchToSearch = prevNoteEvent.pitch[0];
                        } else if (typeof prevNoteEvent.pitch === 'string' || typeof prevNoteEvent.pitch === 'number') {
                           pitchToSearch = prevNoteEvent.pitch;
                        }
                    }
                    
                    if (typeof pitchToSearch === 'string' && scaleForWalking.every(n => typeof n === 'number')) {
                        pitchToSearch = robustNoteToMidi(pitchToSearch);
                    }

                    const prevNoteIndexInScale = scaleForWalking.indexOf(pitchToSearch as any);

                    if (prevNoteIndexInScale !== -1) {
                         noteChoice = scaleForWalking[(prevNoteIndexInScale + (Math.random() < 0.5 ? 1 : -1) + scaleForWalking.length) % scaleForWalking.length];
                    } else if (scaleForWalking.length > 0) { 
                        noteChoice = scaleForWalking[i % scaleForWalking.length];
                    }
                } else if (i > 0 && scaleForWalking.length > 0) { 
                     noteChoice = scaleForWalking[i % scaleForWalking.length];
                }
                 if (!isValidMidiNumber(noteChoice)) noteChoice = bassNoteMidi;
                 bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [noteChoice], duration: '4', velocity: calculateDynamicVelocity(65, 40, 95, 18)})); 
            }
        } else if (genreLower && (genreLower.includes('funk') || genreLower.includes('soul'))) { 
            const durations = ['8', '8d', '16', '8', '8', '8']; 
            const pitches = [bassNoteMidi, bassNoteMidi, bassNoteMidi + (Math.random() < 0.3 ? 7:0), bassNoteMidi, bassNoteMidi, bassNoteMidi];
            for(let i=0; i < durations.length; i++) {
                if (Math.random() > 0.2 || i === 0) { 
                    bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [pitches[i % pitches.length]], duration: durations[i % durations.length], velocity: calculateDynamicVelocity(80, 60, 115, 12)}));
                } else {
                     bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [pitches[i % pitches.length]], duration: durations[i % durations.length], wait: durations[i % durations.length]})); 
                }
            }
        }
        else { 
            bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: chordDef.measureDuration || '1', velocity: bassVelocity}));
        }
    });
    
    const rawMainScaleNotesMidi = getScaleNotesForKey(params.keySignature, params.mode, melodyOctave, params.selectedGenre, rhythmicDensity, harmonicComplexity, isKidsMode);
    const mainScaleNotesMidi = Array.isArray(rawMainScaleNotesMidi) ? rawMainScaleNotesMidi : [];

    progression.forEach((chordDef, measureIndex) => {
        if (!chordDef) {
            console.warn(`Undefined chordDef at measureIndex ${measureIndex} in melodyTrack. Skipping this measure.`);
            return; 
        }
        if (!Array.isArray(chordDef.notes)) {
            console.warn(`chordDef.notes is not an array at measureIndex ${measureIndex} in melodyTrack. Defaulting to empty. ChordDef:`, chordDef);
            chordDef.notes = [];
        }

        const rawCurrentChordScaleMidi = getScaleNotesForKey(midiToNoteName(chordDef.rootNoteMidi).replace(/[0-9]+$/, String(melodyOctave)), chordDef.quality, melodyOctave, params.selectedGenre, rhythmicDensity, harmonicComplexity, isKidsMode);
        const currentChordScaleMidi = Array.isArray(rawCurrentChordScaleMidi) ? rawCurrentChordScaleMidi : [];
        
        const rawPreferredChordTonesMidi = [...(chordDef.notes || [])].map(n => (n % 12) + (melodyOctave + 1) * 12).filter(isValidMidiNumber);
        const preferredChordTonesMidi = Array.isArray(rawPreferredChordTonesMidi) ? rawPreferredChordTonesMidi : [];


        let notesInMeasure = isKidsMode ? (rhythmicDensity > 0.2 ? 2 : 1) : (rhythmicDensity > 0.7 ? 4 : (rhythmicDensity > 0.3 ? 2 : 1)); 
        if (genreLower?.includes('jazz') && rhythmicDensity > 0.5) notesInMeasure = 4;
        else if (genreLower?.includes('electronic') && rhythmicDensity > 0.6) notesInMeasure = 4;


        let baseDuration = notesInMeasure === 4 ? '4' : (notesInMeasure === 2 ? '2' : '1');
        if (isKidsMode && notesInMeasure === 1) baseDuration = '1';
        else if (isKidsMode && notesInMeasure === 2) baseDuration = '2';

        let effectivePreferredChordTonesMidi = [...preferredChordTonesMidi];
        if (!isKidsMode && (genreLower?.includes('jazz') || genreLower?.includes('blues'))) {
            if (chordDef.notes && chordDef.notes.length > 3 && harmonicComplexity > 0.6) { 
                const seventhNoteMidi = (chordDef.notes[3] % 12) + (melodyOctave + 1) * 12;
                if(isValidMidiNumber(seventhNoteMidi)) effectivePreferredChordTonesMidi.push(seventhNoteMidi, seventhNoteMidi); 
            }
        }

        for (let i = 0; i < notesInMeasure; i++) {
            let pitchMidi: number;
            if (Math.random() < (isKidsMode ? 0.9 : 0.7) && effectivePreferredChordTonesMidi.length > 0) { 
                 pitchMidi = effectivePreferredChordTonesMidi[Math.floor(Math.random() * effectivePreferredChordTonesMidi.length)];
            } else if (Math.random() < (isKidsMode ? 0.95 : 0.8) && currentChordScaleMidi.length > 0) {
                pitchMidi = currentChordScaleMidi[Math.floor(Math.random() * currentChordScaleMidi.length)];
            } else if (mainScaleNotesMidi.length > 0) {
                pitchMidi = mainScaleNotesMidi[Math.floor(Math.random() * mainScaleNotesMidi.length)];
            } else {
                pitchMidi = DEFAULT_MIDI_NOTE + (i % 7);
            }
            
            if (!isValidMidiNumber(pitchMidi)) continue;

            let currentDuration = baseDuration;
            let currentVelocity = calculateDynamicVelocity(isKidsMode ? 70 : 80, isKidsMode ? 45 : 35, isKidsMode ? 100 : 120, isKidsMode ? 18 : 25); 


            if (!isKidsMode && baseDuration === '4' && rhythmicDensity > 0.8 && Math.random() < 0.3 && i < notesInMeasure -1) { 
                 melodyTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [pitchMidi], duration: '8', velocity: currentVelocity }));
                
                let nextPitchMidi = DEFAULT_MIDI_NOTE;
                if (currentChordScaleMidi.length > 0) {
                    nextPitchMidi = currentChordScaleMidi[Math.floor(Math.random() * currentChordScaleMidi.length)];
                } else if (mainScaleNotesMidi.length > 0) {
                    nextPitchMidi = mainScaleNotesMidi[Math.floor(Math.random() * mainScaleNotesMidi.length)];
                }
                
                if(!isValidMidiNumber(nextPitchMidi) && mainScaleNotesMidi.length > 0) {
                    nextPitchMidi = mainScaleNotesMidi[0];
                } else if (!isValidMidiNumber(nextPitchMidi)) {
                    nextPitchMidi = DEFAULT_MIDI_NOTE;
                }

                melodyTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [nextPitchMidi], duration: '8', velocity: calculateDynamicVelocity(isKidsMode ? 65 : 75, isKidsMode ? 40 : 30, isKidsMode ? 95 : 115, isKidsMode ? 12 : 18) }));
            } else {
                melodyTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [pitchMidi], duration: currentDuration, velocity: currentVelocity }));
            }
        }
    });

    let arpeggioTrackHasEvents = false;
    progression.forEach((chordDef, measureIndex) => {
        if (!chordDef) {
            console.warn(`Undefined chordDef at measureIndex ${measureIndex} in arpeggioTrack. Skipping this measure.`);
            return; 
        }
        if (!Array.isArray(chordDef.notes)) {
            console.warn(`chordDef.notes is not an array at measureIndex ${measureIndex} in arpeggioTrack. Defaulting to empty. ChordDef:`, chordDef);
            chordDef.notes = [];
        }
        
        const rawArpNotesMidi = (chordDef.notes || []).map(n => (n % 12) + (arpeggioOctave + 1) * 12).filter(isValidMidiNumber);
        const arpNotesMidi = Array.isArray(rawArpNotesMidi) ? rawArpNotesMidi : [];

        if(arpNotesMidi.length === 0) return;

        const numArpNotesPerBeat = isKidsMode ? (harmonicComplexity > 0.2 ? 1: 0) : (harmonicComplexity > 0.7 ? 2 : (harmonicComplexity > 0.4 ? 1 : 0)); 
        
        if (numArpNotesPerBeat > 0 && (genreLower?.includes('pop') || genreLower?.includes('electronic') || genreLower?.includes('ambient') || isKidsMode)) {
            arpeggioTrackHasEvents = true;
            for (let beat = 0; beat < beatsPerMeasure; beat++) {
                for (let subBeat = 0; subBeat < numArpNotesPerBeat; subBeat++) {
                    const pitchMidi = arpNotesMidi[(beat * numArpNotesPerBeat + subBeat) % arpNotesMidi.length];
                     if (!isValidMidiNumber(pitchMidi)) continue;
                    const arpVelocity = calculateDynamicVelocity(isKidsMode ? 50 : 65, isKidsMode ? 25 : 30, isKidsMode ? 75 : 95, isKidsMode ? 10 : 15);
                    arpeggioTrack.addEvent(new MidiWriter.NoteEvent({
                        pitch: [pitchMidi],
                        duration: numArpNotesPerBeat === 2 ? '16' : (isKidsMode && numArpNotesPerBeat === 1 ? '4' : '8'),
                        velocity: arpVelocity
                    }));
                }
            }
        } else if (harmonicComplexity > 0.1 && !isKidsMode && (genreLower?.includes('classical') || genreLower?.includes('cinematic') || genreLower?.includes('ambient'))) { 
             const pitchMidi = arpNotesMidi[0];
             if (!isValidMidiNumber(pitchMidi)) return;
             arpeggioTrackHasEvents = true;
             const arpVelocity = calculateDynamicVelocity(isKidsMode ? 45 : 60, isKidsMode ? 20 : 25, isKidsMode ? 70 : 85, 8);
             arpeggioTrack.addEvent(new MidiWriter.NoteEvent({
                pitch: [pitchMidi], 
                duration: chordDef.measureDuration || '1',
                velocity: arpVelocity
            }));
        }
    });
    
    
    const kick = 36; const snare = 38; const hiHatClosed = 42; const hiHatOpen = 46; const crashCymbal = 49; const rideCymbal = 51;
    const TPQN = getTPQN();
    let drumTrackHasEvents = false;

    progression.forEach((chordDef, measureIndex) => {
        if (!chordDef) {
            console.warn(`Undefined chordDef at measureIndex ${measureIndex} in drumTrack. Skipping this measure.`);
            return; 
        }
        if (!Array.isArray(chordDef.notes)) {
            // This check is less critical for drums but good for consistency
            console.warn(`chordDef.notes is not an array at measureIndex ${measureIndex} in drumTrack. Defaulting to empty. ChordDef:`, chordDef);
            chordDef.notes = [];
        }

        const measureStartTick = measureIndex * beatsPerMeasure * TPQN;
        const isFillMeasure = (measureIndex + 1) % 4 === 0 && measureIndex !== progression.length -1 && rhythmicDensity > 0.5; 

        if (isKidsMode) {
            drumTrackHasEvents = true;
            let hasShaker = false; let hasTambourine = false;
            (params.instrumentHints || []).forEach(hint => {
                if(hint.toLowerCase().includes("shaker")) hasShaker = true;
                if(hint.toLowerCase().includes("tambourine")) hasTambourine = true;
            });

            for (let beat = 0; beat < beatsPerMeasure; beat++) {
                const beatStartTick = measureStartTick + beat * TPQN;
                if (beat === 0 || beat === 2) { 
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: calculateDynamicVelocity(70, 50, 90, 8), channel: 10, tick: beatStartTick }));
                }
                if (hasShaker) { 
                    for(let sub = 0; sub < 2; sub++) {
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [KID_INSTRUMENTS.SHAKER_NOTE], duration: '8', velocity: calculateDynamicVelocity(55, 35, 75, 12), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/2)}));
                    }
                } else if (hasTambourine) { 
                     if (beat === 1 || beat === 3) {
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [KID_INSTRUMENTS.TAMBOURINE_NOTE], duration: '4', velocity: calculateDynamicVelocity(60, 40, 80, 8), channel: 10, tick: beatStartTick }));
                    }
                }
            }
            if (measureIndex === 0 || (measureIndex > 0 && measureIndex % 4 === 0 && measureIndex !== progression.length -1 )) {
                drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [crashCymbal], duration: '2', velocity: calculateDynamicVelocity(80, 60, 100, 10), channel: 10, tick: measureStartTick }));
            }

        } else if (genreLower && (genreLower.includes('ambient') || genreLower.includes('classical') || (genreLower.includes('folk') && rhythmicDensity < 0.3))) {
            if (rhythmicDensity > 0.2 && genreLower.includes('folk')) { 
                drumTrackHasEvents = true;
                if (measureIndex % 2 === 0) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '1', velocity: calculateDynamicVelocity(55, 35, 75, 8), channel: 10, tick: measureStartTick }));
            } else if (rhythmicDensity > 0.1 && genreLower.includes('ambient')) {
                 drumTrackHasEvents = true;
                 if (measureIndex % 4 === 0) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [crashCymbal], duration: '1', velocity: calculateDynamicVelocity(45, 25, 65, 12), channel: 10, tick: measureStartTick, channel: 10 }));
            }
        }
        else { 
            drumTrackHasEvents = true;
            if (measureIndex === 0 || (measureIndex > 0 && measureIndex % 8 === 0 && !isFillMeasure)) { 
                drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [crashCymbal], duration: '2', velocity: calculateDynamicVelocity(105, 85, 125, 12), channel: 10, tick: measureStartTick }));
            }
             for (let beat = 0; beat < beatsPerMeasure; beat++) {
                const beatStartTick = measureStartTick + beat * TPQN;
                let kickVel = calculateDynamicVelocity(100, 75, 125, 18);
                let snareVel = calculateDynamicVelocity(90, 65, 115, 18);
                let hiHatBaseVel = 65 + targetArousal * 25; 
                let hiHatVel = calculateDynamicVelocity(hiHatBaseVel, 30, 95, 15);

                if (isFillMeasure && beat === beatsPerMeasure - 1 && measureIndex !== progression.length - 1) { 
                    for(let f=0; f<4; f++) {
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '16', velocity: calculateDynamicVelocity(75 + f*7, 55, 105, 8), channel: 10, tick: beatStartTick + f * Math.floor(TPQN/4) }));
                    }
                    continue; 
                }
                
                if (genreLower?.includes("rock") || genreLower?.includes("metal") || genreLower?.includes("country")) {
                    if (beat === 0 || beat === 2) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                    if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick }));
                    for(let sub = 0; sub < 2; sub++) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '8', velocity: clamp(hiHatVel - (sub*12) + Math.floor(Math.random()*20-10), 30, 95), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/2)}));
                } else if (genreLower?.includes("pop") || genreLower?.includes("funk") || genreLower?.includes("soul")) {
                    if (beat === 0 || (beat === 2 && Math.random() < 0.7)) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                    if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick })); 
                    const numHiHats = rhythmicDensity > 0.7 ? 4 : 2; 
                    for(let sub = 0; sub < numHiHats; sub++) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: numHiHats === 4 ? '16' : '8', velocity: clamp(hiHatVel - (sub % 2 === 1 ? 18:0) + Math.floor(Math.random()*15-7), 30, 95), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/numHiHats)}));
                } else if (genreLower?.includes("electronic") || genreLower?.includes("reggae")) { 
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel + (genreLower.includes("electronic") ? 5: -5), channel: 10, tick: beatStartTick })); 
                    if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick })); 
                    if (genreLower.includes("reggae") && beat === 2) { 
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '8d', velocity: snareVel -15, channel: 10, tick: beatStartTick + Math.floor(TPQN/2)}));
                    }
                    const hiHatPattern = rhythmicDensity > 0.6 ? (genreLower.includes("electronic") ? 4 : 2) : 2; 
                    const hiHatDuration = hiHatPattern === 4 ? '16' : '8';
                    for(let sub = 0; sub < hiHatPattern; sub++) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: hiHatDuration, velocity: clamp(hiHatVel - 12 + Math.floor(Math.random()*10-5), 30, 90), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/hiHatPattern)}));
                } else if (genreLower?.includes("jazz")) { 
                     if (beat === 0 || beat === 2) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel - 25, channel: 10, tick: beatStartTick }));
                    if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel - 25, channel: 10, tick: beatStartTick }));
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [rideCymbal], duration: '4d', velocity: clamp(hiHatVel-18 + Math.floor(Math.random()*12-6), 30, 85), channel: 10, tick: beatStartTick })); 
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [rideCymbal], duration: '8', velocity: clamp(hiHatVel-25 + Math.floor(Math.random()*10-5), 25, 80), channel: 10, tick: beatStartTick + Math.floor(TPQN * 0.66) })); 
                } else if (genreLower?.includes("blues")) { 
                    if (beat === 0 || beat === 2) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel -15 , channel: 10, tick: beatStartTick }));
                    if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel -15, channel: 10, tick: beatStartTick }));
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '8t', velocity: clamp(hiHatVel + Math.floor(Math.random()*15-7), 30, 95), channel: 10, tick: beatStartTick })); 
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '8t', velocity: clamp(hiHatVel -18 + Math.floor(Math.random()*15-7), 25, 90), channel: 10, tick: beatStartTick + Math.floor((TPQN / 3 * 2)) })); 
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '8t', velocity: clamp(hiHatVel -12 + Math.floor(Math.random()*15-7), 25, 90), channel: 10, tick: beatStartTick + Math.floor((TPQN / 3 * 1)) })); 
                } else { 
                    if (beat === 0 || (beat === 2 && rhythmicDensity > 0.4)) {
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                    }
                    if (beat === 1 || beat === 3) {
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick }));
                    }
                    if (rhythmicDensity > 0.6) { 
                        for(let sub = 0; sub < 2; sub++) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '8', velocity: clamp(hiHatVel - (sub*12) + Math.floor(Math.random()*20-10), 30, 95), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/2)}));
                    } else if (rhythmicDensity > 0.2) { 
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '4', velocity: clamp(hiHatVel + Math.floor(Math.random()*15-7), 30, 95), channel: 10, tick: beatStartTick }));
                    }
                }
            }
        }
    });
    
    const tonicKeyName = params.keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || params.keySignature.toUpperCase();
    const finalModeIsMinor = params.mode.toLowerCase().includes('minor');
    const finalNoteDuration = '1'; 

    const finalPadOctave = isKidsMode ? 3 : (genreLower?.includes('jazz') ? 3 : 2);
    const finalTonicChordForPadDef = getChordProgressionWithDetails(tonicKeyName, finalModeIsMinor ? 'minor' : 'major', 1, finalPadOctave, 0.1, params.selectedGenre, isKidsMode)[0];
    
    if (finalTonicChordForPadDef && finalTonicChordForPadDef.notes && finalTonicChordForPadDef.notes.length > 0) {
        const finalPadVelocity = calculateDynamicVelocity(isKidsMode ? 30 : 35, 15, isKidsMode ? 55 : 60, 5); 
        chordsPadTrack.addEvent(new MidiWriter.NoteEvent({
            pitch: finalTonicChordForPadDef.notes,
            duration: finalNoteDuration, 
            velocity: finalPadVelocity
        }));
    }

    const finalMelodyOctave = isKidsMode ? 4 : (genreLower?.includes('jazz') ? 4 : 3);
    const finalMelodyNoteMidi = robustNoteToMidi(tonicKeyName + finalMelodyOctave);
    if (isValidMidiNumber(finalMelodyNoteMidi)) {
        const finalMelodyVelocity = calculateDynamicVelocity(isKidsMode ? 35 : 40, 20, isKidsMode ? 60 : 65, 5); 
        melodyTrack.addEvent(new MidiWriter.NoteEvent({
            pitch: [finalMelodyNoteMidi],
            duration: finalNoteDuration, 
            velocity: finalMelodyVelocity
        }));
    }

    const finalBassOctave = isKidsMode ? 2 : 1;
    const finalBassNoteMidi = robustNoteToMidi(tonicKeyName + finalBassOctave);
    if (isValidMidiNumber(finalBassNoteMidi)) {
        const finalBassVelocity = calculateDynamicVelocity(isKidsMode ? 45 : 50, 30, isKidsMode ? 65 : 70, 5); 
        bassTrack.addEvent(new MidiWriter.NoteEvent({
            pitch: [finalBassNoteMidi],
            duration: finalNoteDuration, 
            velocity: finalBassVelocity
        }));
    }
    
    if (drumTrackHasEvents || isKidsMode) { 
        const finalDrumVelocity = calculateDynamicVelocity(isKidsMode ? 70 : 85, 45, isKidsMode ? 90 : 105, 10); 
        drumTrack.addEvent(new MidiWriter.NoteEvent({
            pitch: [crashCymbal], 
            duration: finalNoteDuration, 
            velocity: finalDrumVelocity,
            channel: 10
        }));
    }


    const tracksToInclude = [melodyTrack, bassTrack, chordsPadTrack];
    if (arpeggioTrackHasEvents) { 
        tracksToInclude.push(arpeggioTrack);
    }
    if (drumTrackHasEvents || isKidsMode) {
        tracksToInclude.push(drumTrack);
    }


    const writer = new MidiWriter.Writer(tracksToInclude);
    try {
        return writer.dataUri();
    } catch (error) {
        console.error("Error generating MIDI data URI with midi-writer-js:", error);
        const fallbackTrack = new MidiWriter.Track();
        fallbackTrack.addEvent(new MidiWriter.NoteEvent({pitch: [60], duration: '1'}));
        const fallbackWriter = new MidiWriter.Writer([fallbackTrack]);
        return fallbackWriter.dataUri();
    }
};

