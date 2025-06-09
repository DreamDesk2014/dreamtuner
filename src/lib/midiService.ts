
// @ts-nocheck - Disabling TypeScript checks for this file due to midi-writer-js typings
import MidiWriter, { Constants as MidiWriterConstants } from 'midi-writer-js';
import type { MusicParameters, AppInput } from '@/types';
import { 
    TARGET_SONG_BODY_SECONDS, 
    MIN_SONG_BODY_SECONDS_FOR_CALC, // This constant name was from an old plan, let's use TARGET_SONG_BODY_SECONDS consistently
    BEATS_PER_MEASURE, 
    OUTRO_MEASURES 
} from '@/lib/constants';
import {
    robustNoteToMidi,
    midiToNoteName,
    getScaleNoteNames as getScaleNoteNamesFromTheory,
    getChordNotesForKey as getChordNotesForKeyFromTheory,
    MAJOR_PENTATONIC_INTERVALS,
    MINOR_PENTATONIC_INTERVALS,
    BLUES_SCALE_INTERVALS,
    DORIAN_SCALE_INTERVALS,
    MIXOLYDIAN_SCALE_INTERVALS,
    HARMONIC_MINOR_INTERVALS,
    STANDARD_MAJOR_INTERVALS,
    STANDARD_MINOR_INTERVALS,
    DEFAULT_MIDI_NOTE
} from './musicTheory';


// const DEFAULT_MIDI_NOTE = 60; // C4 (already in musicTheory, but useful here as fallback ref)

function isValidMidiNumber(num: number): boolean {
    return typeof num === 'number' && !isNaN(num) && num >= 0 && num <= 127;
}

// This local getScaleNotesForKey is more specific for MIDI generation context than the general musicTheory one
// It incorporates genre and other parameters directly for MIDI track logic.
// However, for robust note-to-MIDI and MIDI-to-note, we use musicTheory.ts
function getScaleNotesForMidiContext(
    keySignature: string,
    mode: 'major' | 'minor' | string,
    startOctave: number = 4,
    genre?: string,
    rhythmicDensityForPentatonicHint?: number, // Kept for specific logic if any
    harmonicComplexity?: number,
    isKidsMode: boolean = false,
    targetValenceForKids?: number
): number[] {
    const modeForTheory = isKidsMode ? 'majorpentatonic' : // Simplify kids mode to major pentatonic primarily
                          (mode.toLowerCase().includes('minor') ? 'minor' : 'major');

    const scaleNames = getScaleNoteNamesFromTheory(
        keySignature,
        modeForTheory, // Pass simplified or direct mode
        startOctave,
        genre,
        harmonicComplexity
    );
    return scaleNames.map(noteName => robustNoteToMidi(noteName)).filter(isValidMidiNumber);
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
    const genreLower = genre?.toLowerCase();

    const buildChordFromDegree = (degree: number, qualityHint: string, octave: number, isDominantOverride:boolean = false): { notes: number[], quality: ChordDefinition['quality'], rootNoteMidi: number } => {
        // Use getScaleNoteNamesFromTheory to find the root note of the chord based on degree
        const scaleForRoots = getScaleNoteNamesFromTheory(baseKeyForChords, mode, octave);
        const rootNoteNameFromScale = scaleForRoots[(degree - 1 + scaleForRoots.length) % scaleForRoots.length] || baseKeyForChords + octave;

        // Determine chord quality based on degree and key mode (simplified for MIDI generation)
        let targetChordQuality = qualityHint;
        if (isKidsMode) {
            targetChordQuality = (degree === 1 || degree === 4 || degree === 5) ? 'major' : 'major'; // Kids primarily major
        } else if (genreLower?.includes('blues') && (degree === 1 || degree === 4 || degree === 5)) {
            targetChordQuality = 'dominant7th';
        } else if (isDominantOverride) {
            targetChordQuality = 'dominant7th';
        }
        // Further quality logic could be here if needed based on key mode vs degree for non-blues/jazz standard progressions

        const chordNotesMidi = getChordNotesForKeyFromTheory(
            rootNoteNameFromScale.replace(/[0-9]+$/, ''), // Root note without octave
            targetChordQuality,
            octave, // Octave for the root of this specific chord
            isDominantOverride || (targetChordQuality === 'dominant7th'), // addSeventhOverride
            genre,
            harmonicComplexity
        ).map(n => robustNoteToMidi(n));

        return {
            notes: chordNotesMidi.filter(isValidMidiNumber),
            quality: targetChordQuality,
            rootNoteMidi: robustNoteToMidi(rootNoteNameFromScale)
        };
    };


    let baseProgressionDegrees: {degree: number, qualityHint: string, dominantOverride?: boolean}[] = [];
    const defaultDuration = '1'; // Default duration for a chord in the base progression (1 measure)

    if (isKidsMode) {
        baseProgressionDegrees = [ {degree: 1, qualityHint: 'major'}, {degree: 4, qualityHint: 'major'}, {degree: 5, qualityHint: 'major'}, {degree: 1, qualityHint: 'major'} ];
    } else if (genreLower?.includes('blues')) {
        baseProgressionDegrees = [ 
            {degree: 1, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'},
            {degree: 4, qualityHint: 'dominant7th'}, {degree: 4, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'},
            {degree: 5, qualityHint: 'dominant7th'}, {degree: 4, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'} // Or 5 for turnaround
        ]; // Classic 12-bar blues
    } else if (genreLower?.includes('jazz')) {
        if (mode.toLowerCase().includes('minor')) {
             baseProgressionDegrees = [ {degree: 2, qualityHint: 'm7b5'}, {degree: 5, qualityHint: 'dominant7th', dominantOverride: true}, {degree: 1, qualityHint: 'minor'}, {degree: 1, qualityHint: 'minor'} ];
        } else { // Major jazz
            baseProgressionDegrees = [ {degree: 2, qualityHint: 'minor'}, {degree: 5, qualityHint: 'dominant7th', dominantOverride: true}, {degree: 1, qualityHint: 'major'}, {degree: 1, qualityHint: 'major'} ];
        }
    } else if (genreLower?.includes('pop') || genreLower?.includes('rock')) {
        if (mode.toLowerCase().includes('minor')) {
             baseProgressionDegrees = [ {degree: 1, qualityHint: 'minor'}, {degree: 6, qualityHint: 'major'}, {degree: 3, qualityHint: 'major'}, {degree: 7, qualityHint: 'major'} ]; 
        } else { 
            baseProgressionDegrees = [ {degree: 1, qualityHint: 'major'}, {degree: 5, qualityHint: 'major'}, {degree: 6, qualityHint: 'minor'}, {degree: 4, qualityHint: 'major'} ]; 
        }
    }
     else { // Default progression if no specific genre match
        if (mode.toLowerCase().includes('minor')) {
            baseProgressionDegrees = [ {degree: 1, qualityHint: 'minor'}, {degree: 4, qualityHint: 'minor'}, {degree: 5, qualityHint: 'major', dominantOverride: true}, {degree: 1, qualityHint: 'minor'} ]; 
        } else { 
            baseProgressionDegrees = [ {degree: 1, qualityHint: 'major'}, {degree: 4, qualityHint: 'major'}, {degree: 5, qualityHint: 'major'}, {degree: 1, qualityHint: 'major'} ]; 
        }
    }

    const baseProgression: ChordDefinition[] = baseProgressionDegrees.map(pd => ({
        ...buildChordFromDegree(pd.degree, pd.qualityHint, baseOctave, pd.dominantOverride),
        duration: defaultDuration, // This 'duration' is for a single chord event.
        measureDuration: '1' // Explicitly state it's one measure per chord in the base progression
    }));


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
    XYLOPHONE: 13, TOY_PIANO: 8,
    UKULELE: 24, RECORDER: 74,
    SIMPLE_SYNTH_LEAD: 80,
    SIMPLE_SYNTH_PAD: 89,
    ACOUSTIC_GUITAR_NYLON: 24,
    BRIGHT_ACOUSTIC_PIANO: 0,

    SHAKER_NOTE: 70, 
    TAMBOURINE_NOTE: 54, 
    KIDS_KICK: 36, 
    KIDS_SNARE: 38, 
    LIGHT_CYMBAL: 49, 
    CLOSED_HIHAT_KID: 42, 
};


export const mapInstrumentHintToGM = (hints: string[], genre?: string, isKidsMode: boolean = false, aiGeneratedIdea?: string): InstrumentMapping => {
    let mapping: InstrumentMapping = { melody: 80, bass: 33, chordsPad: 89, arpeggioSynth: 81, drums: 0 }; 
    const genreLower = genre?.toLowerCase();
    const ideaLower = aiGeneratedIdea?.toLowerCase() || "";

    if (isKidsMode) {
        mapping = {
            melody: KID_INSTRUMENTS.XYLOPHONE,
            bass: KID_INSTRUMENTS.UKULELE,
            chordsPad: KID_INSTRUMENTS.SIMPLE_SYNTH_PAD,
            arpeggioSynth: KID_INSTRUMENTS.TOY_PIANO,
            drums: 0 
        };

        if (genreLower) {
            if (genreLower.includes("electronic")) {
                mapping.melody = KID_INSTRUMENTS.SIMPLE_SYNTH_LEAD;
                mapping.arpeggioSynth = KID_INSTRUMENTS.SIMPLE_SYNTH_LEAD; 
                mapping.bass = KID_INSTRUMENTS.SIMPLE_SYNTH_LEAD; 
                mapping.chordsPad = KID_INSTRUMENTS.SIMPLE_SYNTH_PAD;
            } else if (genreLower.includes("rock")) {
                mapping.melody = KID_INSTRUMENTS.RECORDER; 
                mapping.bass = KID_INSTRUMENTS.UKULELE; 
                mapping.chordsPad = KID_INSTRUMENTS.TOY_PIANO; 
            } else if (genreLower.includes("pop")) {
                 mapping.melody = KID_INSTRUMENTS.TOY_PIANO;
                 mapping.bass = KID_INSTRUMENTS.UKULELE;
                 mapping.chordsPad = KID_INSTRUMENTS.SIMPLE_SYNTH_PAD;
                 mapping.arpeggioSynth = KID_INSTRUMENTS.XYLOPHONE;
            } else if (genreLower.includes("jazz")) {
                mapping.melody = KID_INSTRUMENTS.TOY_PIANO;
                mapping.bass = KID_INSTRUMENTS.UKULELE; 
                mapping.chordsPad = KID_INSTRUMENTS.BRIGHT_ACOUSTIC_PIANO;
            } else if (genreLower.includes("folk")) {
                mapping.melody = KID_INSTRUMENTS.RECORDER;
                mapping.bass = KID_INSTRUMENTS.ACOUSTIC_GUITAR_NYLON;
                mapping.chordsPad = KID_INSTRUMENTS.ACOUSTIC_GUITAR_NYLON;
            } else if (genreLower.includes("classical") || genreLower.includes("cinematic")){
                mapping.melody = KID_INSTRUMENTS.RECORDER;
                mapping.chordsPad = KID_INSTRUMENTS.SIMPLE_SYNTH_PAD;
                mapping.bass = KID_INSTRUMENTS.UKULELE; 
            } else if (genreLower.includes("blues")) {
                mapping.melody = KID_INSTRUMENTS.RECORDER; 
                mapping.bass = KID_INSTRUMENTS.UKULELE;
                mapping.chordsPad = KID_INSTRUMENTS.TOY_PIANO;
            }
        }

        
        (hints || []).forEach(hint => {
            const hLower = hint.toLowerCase();
            if (/xylophone/i.test(hLower)) mapping.melody = KID_INSTRUMENTS.XYLOPHONE;
            else if (/toy piano|celesta|music box/i.test(hLower)) { mapping.melody = KID_INSTRUMENTS.TOY_PIANO; mapping.arpeggioSynth = KID_INSTRUMENTS.TOY_PIANO; }
            else if (/ukulele|guitar/i.test(hLower)) { mapping.melody = KID_INSTRUMENTS.UKULELE; mapping.bass = KID_INSTRUMENTS.UKULELE;}
            else if (/recorder|flute/i.test(hLower)) mapping.melody = KID_INSTRUMENTS.RECORDER;
            else if (/simple synth|synth lead|square lead|sine wave pad/i.test(hLower)) mapping.melody = KID_INSTRUMENTS.SIMPLE_SYNTH_LEAD;
            else if (/synth pad/i.test(hLower)) mapping.chordsPad = KID_INSTRUMENTS.SIMPLE_SYNTH_PAD;
            else if (/piano/i.test(hLower)) { mapping.melody = KID_INSTRUMENTS.BRIGHT_ACOUSTIC_PIANO; mapping.chordsPad = KID_INSTRUMENTS.BRIGHT_ACOUSTIC_PIANO;}
        });
        return mapping;
    }

    // Standard mode instrument mapping (existing logic)
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

    // Override with specific hints (existing logic)
    (hints || []).forEach(hint => {
        const hLower = hint.toLowerCase();
        if (/piano/i.test(hLower)) {
            mapping.melody = 0; 
            if (genreLower?.includes("jazz") || !genreLower || genreLower?.includes("pop") || genreLower?.includes("classical") || genreLower?.includes("cinematic")) {
                mapping.chordsPad = 0;
                mapping.arpeggioSynth = 0; 
            }
        }
        else if (/flute/i.test(hLower)) mapping.melody = 73;
        else if (/violin/i.test(hLower) && !/ensemble|pad/i.test(hLower)) mapping.melody = 40; 
        else if (/strings/i.test(hLower) && (ideaLower.includes("lush") || ideaLower.includes("sweeping") || genreLower?.includes("cinematic") || genreLower?.includes("classical"))) {
            mapping.melody = 48; 
            mapping.chordsPad = 48; 
        } else if (/strings/i.test(hLower)) { 
            mapping.melody = 40; 
        }
        else if (/guitar/i.test(hLower) && !/bass/i.test(hLower)) {
            if (/acoustic/i.test(hLower)) mapping.melody = /nylon/i.test(hLower) ? 24 : 25; 
            else if (/clean/i.test(hLower)) mapping.melody = 28; 
            else if (/distort|overdrive/i.test(hLower)) mapping.melody = 30; 
            else mapping.melody = 27; 
        }
        else if (/steel guitar/i.test(hLower)) mapping.melody = 25; 
        else if (/trumpet|brass/i.test(hLower) && !/section/i.test(hLower)) mapping.melody = 56;
        else if (/sax|saxophone/i.test(hLower)) mapping.melody = 65; 
        else if (/bell|celesta|glockenspiel|music box/i.test(hLower)) { mapping.melody = 9; mapping.arpeggioSynth = 14; } 
        else if (/bright synth|synth lead/i.test(hLower)) { mapping.melody = 80; mapping.arpeggioSynth = 80; } 
        else if (/warm lead|soft lead/i.test(hLower)) { mapping.melody = 81; mapping.arpeggioSynth = 81; } 
        else if (/organ/i.test(hLower) && !genreLower?.includes("blues") && !genreLower?.includes("funk")) mapping.melody = 19; 

        // Bass hints
        if (/synth bass|bass synth/i.test(hLower)) mapping.bass = 38; 
        else if (/acoustic bass|double bass|upright bass/i.test(hLower)) mapping.bass = 32;
        else if (/picked bass/i.test(hLower)) mapping.bass = 34;
        else if (/slap bass/i.test(hLower)) mapping.bass = 36;
        else if (/fretless bass/i.test(hLower)) mapping.bass = 35;
        else if (/cello/i.test(hLower) && (genreLower?.includes("classical") || genreLower?.includes("cinematic"))) mapping.bass = 42;

        // Chords/Pad hints
        if (/string ensemble|strings pad/i.test(hLower)) mapping.chordsPad = 48; 
        else if (/synth pad|ambient pad|warm pad/i.test(hLower)) mapping.chordsPad = 89; 
        else if (/dark pad|sweep pad/i.test(hLower)) mapping.chordsPad = 96; 
        else if (/organ/i.test(hLower) && (genreLower?.includes("blues") || genreLower?.includes("funk") || genreLower?.includes("reggae"))) mapping.chordsPad = 19; 
        else if (/electric piano/i.test(hLower) && (genreLower?.includes("jazz") || genreLower?.includes("soul") || genreLower?.includes("funk"))) {
            mapping.chordsPad = 4; 
            mapping.arpeggioSynth = 4; 
        }
        else if (/choir|voice|aahs/i.test(hLower)) mapping.chordsPad = 52;
        else if (/brass section/i.test(hLower)) mapping.chordsPad = 61;

        // Arpeggio hints
        if (/arp|arpeggio|sequence/i.test(hLower) && !/bell|celesta|glockenspiel|music box|pluck/i.test(hLower)) { 
             mapping.arpeggioSynth = 81; 
        }
        else if (/pluck/i.test(hLower) && !/bell|celesta|glockenspiel|music box/i.test(hLower)) {
            mapping.arpeggioSynth = 7; 
            if (mapping.melody === 24 || mapping.melody === 25) mapping.arpeggioSynth = mapping.melody;
        }
        else if (/fx|sound effect/i.test(hLower)) mapping.arpeggioSynth = 102; 
    });
    return mapping;
};

const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

type InstrumentRole = 'melody' | 'bass' | 'chord' | 'arpeggio' | 'drum-kick' | 'drum-snare' | 'drum-hihat' | 'drum-cymbal' | 'drum-other';

const calculateDynamicVelocity = (
    role: InstrumentRole,
    targetValence: number,
    targetArousal: number,
    isKidsMode: boolean,
    isAccent: boolean = false,
    melodicEmphasis?: string
): number => {
    let baseVel: number, minVel: number, maxVel: number, randomRange: number;

    switch (role) {
        case 'melody':
            baseVel = isKidsMode ? 75 : 85; minVel = isKidsMode ? 50 : 40; maxVel = isKidsMode ? 105 : 125; randomRange = isKidsMode ? 10 : 15;
            if (melodicEmphasis === 'foreground') baseVel += 10;
            else if (melodicEmphasis === 'background') baseVel -= 10;
            break;
        case 'bass':
            baseVel = isKidsMode ? 70 : 80; minVel = isKidsMode ? 45 : 50; maxVel = isKidsMode ? 95 : 115; randomRange = isKidsMode ? 8 : 12;
            break;
        case 'chord':
            baseVel = isKidsMode ? 55 : 60; minVel = isKidsMode ? 30 : 35; maxVel = isKidsMode ? 80 : 95; randomRange = isKidsMode ? 5 : 8;
            break;
        case 'arpeggio':
            baseVel = isKidsMode ? 60 : 70; minVel = isKidsMode ? 35 : 40; maxVel = isKidsMode ? 85 : 105; randomRange = isKidsMode ? 7 : 10;
            break;
        case 'drum-kick':
            baseVel = isKidsMode ? 80 : 100; minVel = isKidsMode ? 60 : 70; maxVel = isKidsMode ? 110 : 127; randomRange = isKidsMode ? 5 : 10;
            break;
        case 'drum-snare':
            baseVel = isKidsMode ? 75 : 95; minVel = isKidsMode ? 55 : 65; maxVel = isKidsMode ? 105 : 125; randomRange = isKidsMode ? 6 : 12;
            break;
        case 'drum-hihat':
            baseVel = isKidsMode ? 60 : 70; minVel = isKidsMode ? 30 : 40; maxVel = isKidsMode ? 85 : 100; randomRange = isKidsMode ? 10 : 15;
            break;
        case 'drum-cymbal':
            baseVel = isKidsMode ? 70 : 90; minVel = isKidsMode ? 50 : 60; maxVel = isKidsMode ? 100 : 120; randomRange = isKidsMode ? 8 : 15;
            break;
        case 'drum-other': 
            baseVel = isKidsMode ? 55 : 65; minVel = isKidsMode ? 30 : 35; maxVel = isKidsMode ? 75 : 90; randomRange = isKidsMode ? 10 : 15;
            break;
        default: 
            baseVel = 70; minVel = 40; maxVel = 100; randomRange = 10;
    }
    if (isAccent) baseVel = Math.min(maxVel, baseVel + (isKidsMode ? 10 : 15));


    const valenceMod = targetValence * (isKidsMode ? 5 : 10);
    const arousalMod = targetArousal * (isKidsMode ? 10 : 20);
    let dynamicBase = clamp(baseVel + valenceMod + arousalMod, minVel - 5, maxVel + 5);

    return clamp(
        Math.round(dynamicBase - (randomRange / 2) + Math.random() * randomRange),
        minVel,
        maxVel
    );
};


const getTPQN = () => {
    if (MidiWriterConstants && typeof MidiWriterConstants.TPQN === 'number') {
        return MidiWriterConstants.TPQN;
    }
    console.warn(
        `midi-writer-js: MidiWriterConstants.TPQN not found or not a number. Using default value 128. MidiWriterConstants: ${typeof MidiWriterConstants}`
    );
    return 128;
};

interface EventTime { time: number; [key: string]: any; }

export function ensureStrictlyIncreasingTimes<T extends EventTime>(events: T[], trackNameForDebug: string = "Track"): T[] {
    if (!events || events.length === 0) return [];

    const sortedEvents = [...events].sort((a, b) => a.time - b.time);
    const correctedEvents: T[] = [sortedEvents[0]];
    const timeEpsilon = 0.000001; 

    for (let i = 1; i < sortedEvents.length; i++) {
        const currentEvent = { ...sortedEvents[i] };
        const prevEventTime = correctedEvents[correctedEvents.length - 1].time;

        if (currentEvent.time <= prevEventTime) {
            currentEvent.time = prevEventTime + timeEpsilon;
        }
        correctedEvents.push(currentEvent);
    }
    return correctedEvents;
}


export const generateMidiFile = (params: MusicParameters): string => {
    const isKidsMode = params.originalInput.mode === 'kids';
    const { targetValence, targetArousal, harmonicComplexity, rhythmicDensity, instrumentHints = [] } = params;
    const { melodicContour, melodicPhrasing, melodicEmphasis } = params; 
    const genreLower = params.selectedGenre?.toLowerCase();
    const currentBpm = params.tempoBpm || 120;
    const secondsPerBeat = 60 / currentBpm;
    const measureDurationSeconds = BEATS_PER_MEASURE * secondsPerBeat;

    const melodyTrack = new MidiWriter.Track();
    const bassTrack = new MidiWriter.Track();
    const chordsPadTrack = new MidiWriter.Track();
    const arpeggioTrack = new MidiWriter.Track();
    const drumTrack = new MidiWriter.Track();

    melodyTrack.setTempo(currentBpm);
    bassTrack.setTempo(currentBpm);
    chordsPadTrack.setTempo(currentBpm);
    arpeggioTrack.setTempo(currentBpm);
    drumTrack.setTempo(currentBpm);

    const instruments = mapInstrumentHintToGM(instrumentHints, params.selectedGenre, isKidsMode, params.generatedIdea);
    melodyTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.melody }));
    bassTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.bass }));
    chordsPadTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.chordsPad }));
    arpeggioTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.arpeggioSynth }));
    drumTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.drums, channel: 10 }));


    const melodyOctave = isKidsMode ? 5 : (genreLower?.includes('jazz') && harmonicComplexity > 0.5 ? 5 : 4);
    const bassOctave = isKidsMode ? 3 : (genreLower?.includes('rock') || genreLower?.includes('metal') ? 2 : 2);
    const chordOctave = isKidsMode ? 4 : (genreLower?.includes('jazz') ? 4 : 3);
    const arpeggioOctave = isKidsMode ? 5 : (harmonicComplexity > 0.6 ? 5 : 4);

    const baseProgressionDegreesRaw = isKidsMode ? [ {degree: 1, qualityHint: 'major'}, {degree: 4, qualityHint: 'major'}, {degree: 5, qualityHint: 'major'}, {degree: 1, qualityHint: 'major'} ] :
                                (genreLower?.includes('blues') ? [ 
                                    {degree: 1, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'},
                                    {degree: 4, qualityHint: 'dominant7th'}, {degree: 4, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'},
                                    {degree: 5, qualityHint: 'dominant7th'}, {degree: 4, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'}, {degree: 1, qualityHint: 'dominant7th'}
                                ] :
                                (genreLower?.includes('jazz') ? (params.mode.toLowerCase().includes('minor') ? 
                                    [ {degree: 2, qualityHint: 'm7b5'}, {degree: 5, qualityHint: 'dominant7th', dominantOverride: true}, {degree: 1, qualityHint: 'minor'}, {degree: 1, qualityHint: 'minor'} ] :
                                    [ {degree: 2, qualityHint: 'minor'}, {degree: 5, qualityHint: 'dominant7th', dominantOverride: true}, {degree: 1, qualityHint: 'major'}, {degree: 1, qualityHint: 'major'} ]) :
                                (genreLower?.includes('pop') || genreLower?.includes('rock') ? (params.mode.toLowerCase().includes('minor') ?
                                    [ {degree: 1, qualityHint: 'minor'}, {degree: 6, qualityHint: 'major'}, {degree: 3, qualityHint: 'major'}, {degree: 7, qualityHint: 'major'} ] :
                                    [ {degree: 1, qualityHint: 'major'}, {degree: 5, qualityHint: 'major'}, {degree: 6, qualityHint: 'minor'}, {degree: 4, qualityHint: 'major'} ]
                                ): (params.mode.toLowerCase().includes('minor') ?
                                    [ {degree: 1, qualityHint: 'minor'}, {degree: 4, qualityHint: 'minor'}, {degree: 5, qualityHint: 'major', dominantOverride: true}, {degree: 1, qualityHint: 'minor'} ] :
                                    [ {degree: 1, qualityHint: 'major'}, {degree: 4, qualityHint: 'major'}, {degree: 5, qualityHint: 'major'}, {degree: 1, qualityHint: 'major'} ]
                                ))));

    const secondsPerBaseProgression = baseProgressionDegreesRaw.length * measureDurationSeconds;
    const numProgressionCycles = Math.max(1, Math.round(TARGET_SONG_BODY_SECONDS / secondsPerBaseProgression));
    
    const progression = getChordProgressionWithDetails(params.keySignature, params.mode, numProgressionCycles, chordOctave, harmonicComplexity, params.selectedGenre, isKidsMode);
    const totalMeasuresInBody = numProgressionCycles * baseProgressionDegreesRaw.length;


    progression.forEach((chordDef, measureIndex) => {
        if (!chordDef) { console.warn(`Undefined chordDef at measureIndex ${measureIndex} in chordsPadTrack. Skipping.`); return; }
        if (!Array.isArray(chordDef.notes)) { console.warn(`chordDef.notes is not an array at measureIndex ${measureIndex} in chordsPadTrack. Defaulting. ChordDef:`, chordDef); chordDef.notes = []; }

        const chordVelocity = calculateDynamicVelocity('chord', targetValence, targetArousal, isKidsMode, false, melodicEmphasis);
        if (chordDef.notes && chordDef.notes.length > 0) {
            const notesToPlay = isKidsMode && chordDef.notes.length > 0 && isValidMidiNumber(chordDef.notes[0]) ? [chordDef.notes[0]] : chordDef.notes;
            if (notesToPlay && notesToPlay.length > 0 && isValidMidiNumber(notesToPlay[0])) {
                 chordsPadTrack.addEvent(new MidiWriter.NoteEvent({
                     pitch: notesToPlay,
                     duration: chordDef.measureDuration || '1', // Duration '1' means 1 measure
                     velocity: chordVelocity
                }));
            }
        }
    });

    progression.forEach((chordDef, measureIndex) => {
        if (!chordDef) { console.warn(`Undefined chordDef at measureIndex ${measureIndex} in bassTrack. Skipping.`); return; }
        if (!Array.isArray(chordDef.notes)) { console.warn(`chordDef.notes is not an array at measureIndex ${measureIndex} in bassTrack. Defaulting. ChordDef:`, chordDef); chordDef.notes = []; }

        const bassNoteMidi = robustNoteToMidi(midiToNoteName(chordDef.rootNoteMidi).replace(/[0-9]+$/, String(bassOctave)));

        if (!isValidMidiNumber(bassNoteMidi)) return;
        const insertRest = Math.random() < 0.1 && !isKidsMode;

        if (isKidsMode) {
            if (insertRest && rhythmicDensity < 0.4) bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [], duration: '8', wait: '8'}));
            bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: '1', velocity: calculateDynamicVelocity('bass', targetValence, targetArousal, isKidsMode, false, melodicEmphasis)}));
        } else if (genreLower && (genreLower.includes('rock') || genreLower.includes('pop') || genreLower.includes('metal') || genreLower.includes('country'))) {
            for (let i = 0; i < BEATS_PER_MEASURE; i++) {
                 if (insertRest && i === 0 && rhythmicDensity < 0.5) bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [], duration: '16', wait: '16'}));
                 bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: '4', velocity: calculateDynamicVelocity('bass', targetValence, targetArousal, isKidsMode, i === 0, melodicEmphasis)}));
            }
        } else if (genreLower && genreLower.includes('electronic')) {
             if (rhythmicDensity > 0.6) {
                for (let i = 0; i < BEATS_PER_MEASURE * 2; i++) {
                    if (insertRest && i === 0 && rhythmicDensity < 0.7) bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [], duration: '32', wait: '32'}));
                    bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: '8', velocity: calculateDynamicVelocity('bass', targetValence, targetArousal, isKidsMode, i % 2 === 0, melodicEmphasis)}));
                }
            } else {
                 for (let i = 0; i < BEATS_PER_MEASURE; i++) {
                    if (insertRest && i === 0 && rhythmicDensity < 0.5) bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [], duration: '16', wait: '16'}));
                    bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: '4', velocity: calculateDynamicVelocity('bass', targetValence, targetArousal, isKidsMode, i === 0, melodicEmphasis)}));
                }
            }
        } else if (genreLower && genreLower.includes('jazz')) {
            const rawScaleForWalking = getScaleNotesForMidiContext(midiToNoteName(chordDef.rootNoteMidi), chordDef.quality, bassOctave, params.selectedGenre, rhythmicDensity, harmonicComplexity, isKidsMode);
            const scaleForWalking = Array.isArray(rawScaleForWalking) ? rawScaleForWalking : [];

            for (let i = 0; i < BEATS_PER_MEASURE; i++) {
                let noteChoice = bassNoteMidi;
                 if (i > 0 && scaleForWalking.length > 0 && bassTrack.notes && bassTrack.notes.length > 0) {
                    const prevNoteEvent = bassTrack.notes[bassTrack.notes.length - 1];
                    let pitchToSearchVal: number | undefined;

                    if (prevNoteEvent && prevNoteEvent.pitch) {
                        if (Array.isArray(prevNoteEvent.pitch) && prevNoteEvent.pitch.length > 0 && isValidMidiNumber(prevNoteEvent.pitch[0])) {
                            pitchToSearchVal = prevNoteEvent.pitch[0];
                        } else if (typeof prevNoteEvent.pitch === 'string' && isValidMidiNumber(robustNoteToMidi(prevNoteEvent.pitch))) {
                            pitchToSearchVal = robustNoteToMidi(prevNoteEvent.pitch);
                        } else if (typeof prevNoteEvent.pitch === 'number' && isValidMidiNumber(prevNoteEvent.pitch)) {
                            pitchToSearchVal = prevNoteEvent.pitch;
                        }
                    }

                    const prevNoteIndexInScale = typeof pitchToSearchVal === 'number' ? scaleForWalking.indexOf(pitchToSearchVal) : -1;

                    if (prevNoteIndexInScale !== -1) {
                         noteChoice = scaleForWalking[(prevNoteIndexInScale + (Math.random() < 0.5 ? 1 : -1) + scaleForWalking.length) % scaleForWalking.length];
                    } else {
                        noteChoice = scaleForWalking[i % scaleForWalking.length] || bassNoteMidi;
                    }
                } else if (i > 0 && scaleForWalking.length > 0) {
                     noteChoice = scaleForWalking[i % scaleForWalking.length] || bassNoteMidi;
                }
                 if (!isValidMidiNumber(noteChoice)) noteChoice = bassNoteMidi;
                 if (insertRest && i === 0 && rhythmicDensity < 0.5) bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [], duration: '16', wait: '16'}));
                 bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [noteChoice], duration: '4', velocity: calculateDynamicVelocity('bass', targetValence, targetArousal, isKidsMode, i === 0, melodicEmphasis)}));
            }
        } else if (genreLower && (genreLower.includes('funk') || genreLower.includes('soul'))) {
            const durations = ['8', '8d', '16', '8', '8', '8'];
            const pitches = [bassNoteMidi, bassNoteMidi, bassNoteMidi + (Math.random() < 0.3 ? 7:0), bassNoteMidi, bassNoteMidi, bassNoteMidi];
            for(let i=0; i < durations.length; i++) {
                if (insertRest && i === 0 && rhythmicDensity < 0.6) bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [], duration: '32', wait: '32'}));
                if (Math.random() > 0.2 || i === 0) {
                    bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [pitches[i % pitches.length]], duration: durations[i % durations.length], velocity: calculateDynamicVelocity('bass', targetValence, targetArousal, isKidsMode, i % 2 === 0, melodicEmphasis)}));
                } else {
                     bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [], duration: durations[i % durations.length], wait: durations[i % durations.length]}));
                }
            }
        }
        else {
            if (insertRest && rhythmicDensity < 0.4) bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [], duration: '8', wait: '8'}));
            bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: chordDef.measureDuration || '1', velocity: calculateDynamicVelocity('bass', targetValence, targetArousal, isKidsMode, false, melodicEmphasis)}));
        }
    });

    const rawMainScaleNotesMidi = getScaleNotesForMidiContext(params.keySignature, params.mode, melodyOctave, params.selectedGenre, rhythmicDensity, harmonicComplexity, isKidsMode, isKidsMode ? targetValence : undefined);
    const mainScaleNotesMidi = Array.isArray(rawMainScaleNotesMidi) ? rawMainScaleNotesMidi : [];
    let lastMelodyNoteMidiForContour = mainScaleNotesMidi[0] || DEFAULT_MIDI_NOTE;
    let melodyRiffBufferMidi: { pitch: number, duration: string, velocity: number }[] = [];
    const RIFF_LENGTH_MIDI = (melodicPhrasing === 'short_motifs') ? 2 : 3;
    let riffCooldownMidi = 0;
    let melodyNoteCountInMeasure = 0;

    progression.forEach((chordDef, measureIndex) => {
        if (!chordDef) { console.warn(`Undefined chordDef at measureIndex ${measureIndex} in melodyTrack. Skipping.`); return; }
        if (!Array.isArray(chordDef.notes)) { console.warn(`chordDef.notes is not an array at measureIndex ${measureIndex} in melodyTrack. Defaulting. ChordDef:`, chordDef); chordDef.notes = []; }
        melodyNoteCountInMeasure = 0; 

        const rawCurrentChordScaleMidi = getScaleNotesForMidiContext(midiToNoteName(chordDef.rootNoteMidi).replace(/[0-9]+$/, String(melodyOctave)), chordDef.quality, melodyOctave, params.selectedGenre, rhythmicDensity, harmonicComplexity, isKidsMode, isKidsMode ? targetValence : undefined);
        const currentChordScaleMidi = Array.isArray(rawCurrentChordScaleMidi) ? rawCurrentChordScaleMidi : [];

        const rawPreferredChordTonesMidi = [...(chordDef.notes || [])].map(n => (n % 12) + (melodyOctave + 1) * 12).filter(isValidMidiNumber);
        const preferredChordTonesMidi = Array.isArray(rawPreferredChordTonesMidi) ? rawPreferredChordTonesMidi : [];

        let notesInMeasure = isKidsMode ? (rhythmicDensity > 0.2 ? 2 : 1) : (rhythmicDensity > 0.7 ? 4 : (rhythmicDensity > 0.3 ? 2 : 1));
        if (isKidsMode) {
            notesInMeasure = (rhythmicDensity > 0.3 ? 2 : 1); // Kids mode: more notes if denser
            if(genreLower?.includes("pop") && rhythmicDensity > 0.2) notesInMeasure = 2;
        } else {
            if (genreLower?.includes('jazz') && rhythmicDensity > 0.5) notesInMeasure = 4;
            else if (genreLower?.includes('electronic') && rhythmicDensity > 0.6) notesInMeasure = 4;
        }
        if (melodicPhrasing === 'short_motifs') notesInMeasure = Math.max(isKidsMode ? 2 : 4, notesInMeasure * 2); 
        else if (melodicPhrasing === 'long_flowing') notesInMeasure = Math.max(1, Math.floor(notesInMeasure / (isKidsMode ? 1 : 2)));


        let baseDuration = notesInMeasure === 4 ? '4' : (notesInMeasure === 2 ? '2' : '1');
        if (isKidsMode && notesInMeasure === 1) baseDuration = '1';
        else if (isKidsMode && notesInMeasure === 2) baseDuration = '2';

        if (melodicPhrasing === 'short_motifs') {
            if (baseDuration === '1') baseDuration = '2';
            if (baseDuration === '2') baseDuration = '4';
            if (baseDuration === '4') baseDuration = '8';
        } else if (melodicPhrasing === 'long_flowing') {
             if (baseDuration === '8') baseDuration = '4';
             if (baseDuration === '4') baseDuration = '2';
        }


        let effectivePreferredChordTonesMidi = [...preferredChordTonesMidi];
        if (!isKidsMode && (genreLower?.includes('jazz') || genreLower?.includes('blues'))) {
            if (chordDef.notes && chordDef.notes.length > 3 && harmonicComplexity > 0.6) {
                const seventhNoteMidi = (chordDef.notes[3] % 12) + (melodyOctave + 1) * 12;
                if(isValidMidiNumber(seventhNoteMidi)) effectivePreferredChordTonesMidi.push(seventhNoteMidi, seventhNoteMidi);
            }
        }
        riffCooldownMidi = Math.max(0, riffCooldownMidi -1);

        for (let i = 0; i < notesInMeasure; i++) {
            melodyNoteCountInMeasure++;
            let restProbability = (isKidsMode && rhythmicDensity < 0.3) ? 0.3 : 0.15; // More rests for sparse kids
            if (melodicPhrasing === 'short_motifs' && i % 2 === 1) restProbability = 0.4; 
            if (melodicPhrasing === 'long_flowing') restProbability = 0.05;

            if (Math.random() < restProbability && i > 0 && rhythmicDensity < 0.6) {
                 const restDuration = baseDuration === '4' ? '8' : (baseDuration === '2' ? '4' : '2');
                 melodyTrack.addEvent(new MidiWriter.NoteEvent({pitch: [], duration: restDuration, wait: restDuration}));
                 if (baseDuration === '4' && notesInMeasure === 4) { i++; }
                 else if (baseDuration === '2' && notesInMeasure === 2) { i++;}
                 continue;
            }

            
            if (melodicContour === 'riff-based' && melodyRiffBufferMidi.length >= RIFF_LENGTH_MIDI && Math.random() < 0.3 && riffCooldownMidi === 0 && !isKidsMode) {
                let canPlayRiff = true;
                
                if (canPlayRiff) {
                    for (const riffNote of melodyRiffBufferMidi) {
                        melodyTrack.addEvent(new MidiWriter.NoteEvent({
                            pitch: [riffNote.pitch],
                            duration: riffNote.duration,
                            velocity: riffNote.velocity
                        }));
                        lastMelodyNoteMidiForContour = riffNote.pitch;
                    }
                    riffCooldownMidi = RIFF_LENGTH_MIDI * 2;
                    melodyRiffBufferMidi = []; 
                    i += melodyRiffBufferMidi.length -1; 
                    if (i >= notesInMeasure) break;
                    continue;
                }
            }


            let pitchMidi: number;
            let preferChordToneMidi = Math.random() < (isKidsMode ? 0.70 : 0.70); // Kids mode slightly higher chord tone
            if (melodicEmphasis === 'foreground') preferChordToneMidi = Math.random() < 0.85;
            else if (melodicEmphasis === 'background') preferChordToneMidi = Math.random() < 0.5;


            if (preferChordToneMidi && effectivePreferredChordTonesMidi.length > 0 ) {
                 pitchMidi = effectivePreferredChordTonesMidi[Math.floor(Math.random() * effectivePreferredChordTonesMidi.length)];
            } else if (Math.random() < (isKidsMode ? 0.95 : 0.8) && currentChordScaleMidi.length > 0) {
                
                let targetNoteIndex = Math.floor(Math.random() * currentChordScaleMidi.length);
                if (melodicContour === 'ascending' && lastMelodyNoteMidiForContour !== DEFAULT_MIDI_NOTE) {
                    targetNoteIndex = currentChordScaleMidi.findIndex(n => n > lastMelodyNoteMidiForContour);
                    if (targetNoteIndex === -1) targetNoteIndex = currentChordScaleMidi.length - 1;
                } else if (melodicContour === 'descending' && lastMelodyNoteMidiForContour !== DEFAULT_MIDI_NOTE) {
                     targetNoteIndex = currentChordScaleMidi.slice().reverse().findIndex(n => n < lastMelodyNoteMidiForContour);
                     if (targetNoteIndex !== -1) targetNoteIndex = currentChordScaleMidi.length - 1 - targetNoteIndex;
                     else targetNoteIndex = 0;
                } else if (melodicContour === 'stable' && lastMelodyNoteMidiForContour !== DEFAULT_MIDI_NOTE) {
                    const closest = currentChordScaleMidi.reduce((prev, curr) =>
                        Math.abs(curr - lastMelodyNoteMidiForContour) < Math.abs(prev - lastMelodyNoteMidiForContour) ? curr : prev
                    );
                    targetNoteIndex = currentChordScaleMidi.indexOf(closest);
                }
                 targetNoteIndex = (targetNoteIndex + currentChordScaleMidi.length) % currentChordScaleMidi.length; 
                 pitchMidi = currentChordScaleMidi[targetNoteIndex];

            } else if (mainScaleNotesMidi.length > 0) {
                pitchMidi = mainScaleNotesMidi[Math.floor(Math.random() * mainScaleNotesMidi.length)];
            } else {
                pitchMidi = DEFAULT_MIDI_NOTE + (i % 7);
            }

            if (!isValidMidiNumber(pitchMidi)) continue;
            lastMelodyNoteMidiForContour = pitchMidi;

            let currentDuration = baseDuration;
            if (isKidsMode || (rhythmicDensity > 0.7 && notesInMeasure >=4 && Math.random() < 0.3) ) {
                if (currentDuration === '4') currentDuration = '8';
                else if (currentDuration === '2') currentDuration = '4';
            }
            if (melodicPhrasing === 'short_motifs' && currentDuration === '1') currentDuration = '2';


            let currentVelocity = calculateDynamicVelocity('melody', targetValence, targetArousal, isKidsMode, i === 0, melodicEmphasis);

            
            if (melodicContour === 'riff-based' && !isKidsMode) {
                melodyRiffBufferMidi.push({ pitch: pitchMidi, duration: currentDuration, velocity: currentVelocity });
                if (melodyRiffBufferMidi.length > RIFF_LENGTH_MIDI) {
                    melodyRiffBufferMidi.shift();
                }
            } else {
                melodyRiffBufferMidi = [];
            }


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

                melodyTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [nextPitchMidi], duration: '8', velocity: calculateDynamicVelocity('melody', targetValence, targetArousal, isKidsMode, false, melodicEmphasis) }));
                lastMelodyNoteMidiForContour = nextPitchMidi;
            } else {
                melodyTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [pitchMidi], duration: currentDuration, velocity: currentVelocity }));
            }
        }
    });

    let arpeggioTrackHasEvents = false;
    const hintsLower = instrumentHints.map(h => typeof h === 'string' ? h.toLowerCase() : "");
    const isArpFriendlyInstrumentMidi = hintsLower.some(hint =>
      /piano|synth lead|electric piano|pluck|bell|celesta|glockenspiel|music box|bright synth|warm lead|soft lead|arp/i.test(hint)
    );

    progression.forEach((chordDef, measureIndex) => {
        if (!chordDef) { console.warn(`Undefined chordDef at measureIndex ${measureIndex} in arpeggioTrack. Skipping.`); return; }
        if (!Array.isArray(chordDef.notes)) { console.warn(`chordDef.notes is not an array at measureIndex ${measureIndex} in arpeggioTrack. Defaulting. ChordDef:`, chordDef); chordDef.notes = []; }

        const rawArpNotesMidi = (chordDef.notes || []).map(n => (n % 12) + (arpeggioOctave + 1) * 12).filter(isValidMidiNumber);
        const arpNotesMidi = Array.isArray(rawArpNotesMidi) ? rawArpNotesMidi : [];

        if(arpNotesMidi.length === 0) return;

        let numArpNotesPerBeat = 0;
        if (isArpFriendlyInstrumentMidi || genreLower?.includes('pop') || genreLower?.includes('electronic') || genreLower?.includes('ambient')) {
            numArpNotesPerBeat = isKidsMode ? (harmonicComplexity > 0.2 ? 1: 0) : (harmonicComplexity > 0.6 ? 2 : (harmonicComplexity > 0.3 ? 1 : 0));
             if (isArpFriendlyInstrumentMidi && !isKidsMode) numArpNotesPerBeat = rhythmicDensity > 0.5 ? 2 : 1;
        }


        if (numArpNotesPerBeat > 0) {
            arpeggioTrackHasEvents = true;
            const arpPatterns = [
                [0, 1, 2, 1], 
                [0, 2, 1, 3 % arpNotesMidi.length], 
                [0, 1, 2, 3 % arpNotesMidi.length], 
                [3 % arpNotesMidi.length, 2, 1, 0], 
            ];
            const selectedArpPattern = arpPatterns[Math.floor(Math.random() * arpPatterns.length)];
            const arpDuration = numArpNotesPerBeat === 2 ? '16' : '8';

            for (let beat = 0; beat < BEATS_PER_MEASURE; beat++) {
                for (let subBeat = 0; subBeat < numArpNotesPerBeat; subBeat++) {
                    const pitchMidi = arpNotesMidi[selectedArpPattern[(beat * numArpNotesPerBeat + subBeat) % selectedArpPattern.length] % arpNotesMidi.length];
                     if (!isValidMidiNumber(pitchMidi)) continue;
                    const arpVelocity = calculateDynamicVelocity('arpeggio', targetValence, targetArousal, isKidsMode, false, melodicEmphasis);
                    arpeggioTrack.addEvent(new MidiWriter.NoteEvent({
                        pitch: [pitchMidi],
                        duration: arpDuration,
                        velocity: arpVelocity,
                        tick: (measureIndex * BEATS_PER_MEASURE + beat) * getTPQN() + subBeat * (getTPQN() / numArpNotesPerBeat)
                    }));
                }
            }
        } else if (harmonicComplexity > 0.1 && !isKidsMode && (genreLower?.includes('classical') || genreLower?.includes('cinematic') || genreLower?.includes('ambient'))) {
             const pitchMidi = arpNotesMidi[0];
             if (!isValidMidiNumber(pitchMidi)) return;
             arpeggioTrackHasEvents = true;
             const arpVelocity = calculateDynamicVelocity('arpeggio', targetValence, targetArousal, isKidsMode, false, melodicEmphasis);
             arpeggioTrack.addEvent(new MidiWriter.NoteEvent({
                pitch: [pitchMidi],
                duration: chordDef.measureDuration || '1',
                velocity: arpVelocity,
                tick: measureIndex * BEATS_PER_MEASURE * getTPQN()
            }));
        }
    });


    const kick = isKidsMode ? KID_INSTRUMENTS.KIDS_KICK : 36;
    const snare = isKidsMode ? KID_INSTRUMENTS.KIDS_SNARE : 38;
    const hiHatClosed = isKidsMode ? KID_INSTRUMENTS.CLOSED_HIHAT_KID : 42;
    const hiHatOpen = 46;
    const crashCymbal = isKidsMode ? KID_INSTRUMENTS.LIGHT_CYMBAL : 49;
    const rideCymbal = 51;
    const shaker = KID_INSTRUMENTS.SHAKER_NOTE;
    const tambourine = KID_INSTRUMENTS.TAMBOURINE_NOTE;
    const TPQN = getTPQN();
    let drumTrackHasEvents = false;

    progression.forEach((chordDef, measureIndex) => {
        if (!chordDef) { console.warn(`Undefined chordDef at measureIndex ${measureIndex} in drumTrack. Skipping.`); return; }
        if (!Array.isArray(chordDef.notes)) { console.warn(`chordDef.notes is not an array at measureIndex ${measureIndex} in drumTrack. Defaulting. ChordDef:`, chordDef); chordDef.notes = []; }

        const measureStartTick = measureIndex * BEATS_PER_MEASURE * TPQN;
        const isFillMeasure = (measureIndex + 1) % 4 === 0 && measureIndex !== progression.length -1 && rhythmicDensity > 0.6 && !isKidsMode;

        let useShakerForKids = false; let useTambourineForKids = false;
        if(isKidsMode){
            (instrumentHints || []).forEach(hint => {
                if(hint.toLowerCase().includes("shaker")) useShakerForKids = true;
                if(hint.toLowerCase().includes("tambourine")) useTambourineForKids = true;
            });
        }


        if (isKidsMode) {
            drumTrackHasEvents = true;
            for (let beat = 0; beat < BEATS_PER_MEASURE; beat++) {
                const beatStartTick = measureStartTick + beat * TPQN;
                const isKickBeat = (beat === 0 || beat === 2);
                const isSnareBeat = (beat === 1 || beat === 3);

                if (genreLower?.includes("rock") || genreLower?.includes("pop") || genreLower?.includes("country")) {
                    if (isKickBeat) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: calculateDynamicVelocity('drum-kick', targetValence, targetArousal, isKidsMode, true), channel: 10, tick: beatStartTick }));
                    if (isSnareBeat) {
                         drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: calculateDynamicVelocity('drum-snare', targetValence, targetArousal, isKidsMode, true), channel: 10, tick: beatStartTick }));
                         if (useTambourineForKids && rhythmicDensity > 0.1) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [tambourine], duration: '4', velocity: calculateDynamicVelocity('drum-other', targetValence, targetArousal, isKidsMode), channel: 10, tick: beatStartTick }));
                    }
                } else if (genreLower?.includes("electronic")) {
                     if (beat % 2 === 0) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: calculateDynamicVelocity('drum-kick', targetValence, targetArousal, isKidsMode, true), channel: 10, tick: beatStartTick }));
                     if (useShakerForKids) {
                        for(let sub = 0; sub < 2; sub++) {
                            drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [shaker], duration: '8', velocity: calculateDynamicVelocity('drum-other', targetValence, targetArousal, isKidsMode), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/2)}));
                        }
                     } else if (rhythmicDensity > 0.3) {
                        for(let sub = 0; sub < 2; sub++) {
                            drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '8', velocity: calculateDynamicVelocity('drum-hihat', targetValence, targetArousal, isKidsMode), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/2)}));
                        }
                     }
                } else if (genreLower?.includes("jazz") || genreLower?.includes("blues")) {
                    if (isKickBeat) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: calculateDynamicVelocity('drum-kick', targetValence, targetArousal, isKidsMode, true), channel: 10, tick: beatStartTick }));
                    if (useShakerForKids) {
                        for(let sub = 0; sub < (rhythmicDensity > 0.2 ? 2:1); sub++) {
                            drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [shaker], duration: (rhythmicDensity > 0.2 ? '8':'4'), velocity: calculateDynamicVelocity('drum-other', targetValence, targetArousal, isKidsMode), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/(rhythmicDensity > 0.2 ? 2:1))}));
                        }
                    }
                } else if (genreLower?.includes("folk")) {
                    if (isKickBeat) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: calculateDynamicVelocity('drum-kick', targetValence, targetArousal, isKidsMode, true), channel: 10, tick: beatStartTick }));
                    if (useTambourineForKids && isSnareBeat) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [tambourine], duration: '4', velocity: calculateDynamicVelocity('drum-other', targetValence, targetArousal, isKidsMode), channel: 10, tick: beatStartTick }));
                }
                 else { 
                    if (isKickBeat) {
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: calculateDynamicVelocity('drum-kick', targetValence, targetArousal, isKidsMode, true), channel: 10, tick: beatStartTick }));
                    }
                    if (useShakerForKids && rhythmicDensity > 0.1) {
                        for(let sub = 0; sub < 2; sub++) {
                            drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [shaker], duration: '8', velocity: calculateDynamicVelocity('drum-other', targetValence, targetArousal, isKidsMode), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/2)}));
                        }
                    } else if (useTambourineForKids && rhythmicDensity > 0.1) {
                         if (isSnareBeat) {
                            drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [tambourine], duration: '4', velocity: calculateDynamicVelocity('drum-other', targetValence, targetArousal, isKidsMode), channel: 10, tick: beatStartTick }));
                        }
                    }
                }
            }
            if (measureIndex === 0 || (measureIndex > 0 && measureIndex % 4 === 0 && measureIndex !== progression.length -1 )) {
                drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [crashCymbal], duration: '2', velocity: calculateDynamicVelocity('drum-cymbal', targetValence, targetArousal, isKidsMode, true), channel: 10, tick: measureStartTick }));
            }

        } else if (genreLower && (genreLower.includes('ambient') || genreLower.includes('classical') || (genreLower.includes('folk') && rhythmicDensity < 0.3))) {
            if (rhythmicDensity > 0.2 && genreLower.includes('folk')) {
                drumTrackHasEvents = true;
                if (measureIndex % 2 === 0) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '1', velocity: calculateDynamicVelocity('drum-kick', targetValence, targetArousal, isKidsMode, true), channel: 10, tick: measureStartTick }));
            } else if (rhythmicDensity > 0.1 && genreLower.includes('ambient')) {
                 drumTrackHasEvents = true;
                 if (measureIndex % 4 === 0) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [crashCymbal], duration: '1', velocity: calculateDynamicVelocity('drum-cymbal', targetValence, targetArousal, isKidsMode, true), channel: 10, tick: measureStartTick, channel: 10 }));
            }
        }
        else { 
            drumTrackHasEvents = true;
            if (measureIndex === 0 || (measureIndex > 0 && measureIndex % 8 === 0 && !isFillMeasure)) {
                drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [crashCymbal], duration: '2', velocity: calculateDynamicVelocity('drum-cymbal', targetValence, targetArousal, isKidsMode, true), channel: 10, tick: measureStartTick }));
            }

            for (let beat = 0; beat < BEATS_PER_MEASURE; beat++) {
                const beatStartTick = measureStartTick + beat * TPQN;
                let kickVel = calculateDynamicVelocity('drum-kick', targetValence, targetArousal, isKidsMode, beat === 0 || beat === 2);
                let snareVel = calculateDynamicVelocity('drum-snare', targetValence, targetArousal, isKidsMode, beat === 1 || beat === 3);
                let hiHatVel = calculateDynamicVelocity('drum-hihat', targetValence, targetArousal, isKidsMode);
                let rideVel = calculateDynamicVelocity('drum-hihat', targetValence, targetArousal, isKidsMode); 

                if (isFillMeasure && beat === BEATS_PER_MEASURE - 1 && measureIndex !== progression.length - 1) {
                    for(let f=0; f<4; f++) {
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '16', velocity: calculateDynamicVelocity('drum-snare', targetValence, targetArousal, isKidsMode, true), channel: 10, tick: beatStartTick + f * Math.floor(TPQN/4) }));
                    }
                    continue;
                }

                if (genreLower?.includes("electronic") || genreLower?.includes("pop")) {
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                    if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick }));
                    const numHiHats = rhythmicDensity > 0.7 ? 4 : (rhythmicDensity > 0.4 ? 2 : 1);
                    const hiHatDuration = numHiHats === 4 ? '16' : (numHiHats === 2 ? '8' : '4');
                    for(let sub = 0; sub < numHiHats; sub++) {
                        const currentHiHat = (sub % 4 === 3 && rhythmicDensity > 0.8 && Math.random() < 0.3) ? hiHatOpen : hiHatClosed; 
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [currentHiHat], duration: hiHatDuration, velocity: calculateDynamicVelocity('drum-hihat', targetValence, targetArousal, isKidsMode, false), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/numHiHats)}));
                    }
                } else if (genreLower?.includes("rock") || genreLower?.includes("metal") || genreLower?.includes("country")) {
                    if (beat === 0 || beat === 2) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                    if (rhythmicDensity > 0.6 && Math.random() < 0.3 && beat === 1) {
                         drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '8', velocity: calculateDynamicVelocity('drum-kick', targetValence, targetArousal, isKidsMode, false), channel: 10, tick: beatStartTick + Math.floor(TPQN/2) }));
                    }
                    if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick }));
                    const useRide = harmonicComplexity > 0.6 && (genreLower.includes("rock") && !genreLower.includes("metal"));
                    for(let sub = 0; sub < 2; sub++) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [useRide ? rideCymbal : hiHatClosed], duration: '8', velocity: calculateDynamicVelocity(useRide ? 'drum-cymbal':'drum-hihat', targetValence, targetArousal, isKidsMode, false), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/2)}));
                } else if (genreLower?.includes("blues")) {
                    if (beat === 0 || beat === 2) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                    if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick }));
                    
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [rideCymbal], duration: '8d', velocity: rideVel, channel: 10, tick: beatStartTick }));
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [rideCymbal], duration: '16', velocity: calculateDynamicVelocity('drum-hihat', targetValence, targetArousal, isKidsMode, false), channel: 10, tick: beatStartTick + Math.floor(TPQN * 0.75) }));
                } else if (genreLower?.includes("reggae")) {
                    const isOneDrop = rhythmicDensity < 0.6;
                    if (isOneDrop) {
                        if (beat === 2) {
                            drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                            drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick }));
                        }
                    } else { 
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                        if (beat === 2) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick }));
                    }
                    if (rhythmicDensity > 0.3) {
                        for(let sub = 0; sub < 2; sub++) { 
                             const currentHiHat = (sub === 1 && Math.random() < 0.4) ? hiHatOpen : hiHatClosed;
                             drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [currentHiHat], duration: '8', velocity: calculateDynamicVelocity('drum-hihat', targetValence, targetArousal, isKidsMode, false), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/2)}));
                        }
                    }
                } else if (genreLower?.includes("jazz")) {
                     if (beat === 0 || (beat === 2 && Math.random() < 0.4)) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: calculateDynamicVelocity('drum-kick', targetValence, targetArousal, isKidsMode, false), channel: 10, tick: beatStartTick }));
                    if ((beat === 1 || beat === 3) && Math.random() < 0.5) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '8', velocity: calculateDynamicVelocity('drum-snare', targetValence, targetArousal, isKidsMode, false), channel: 10, tick: beatStartTick + (Math.random() < 0.5 ? 0 : Math.floor(TPQN/2)) }));
                    
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [rideCymbal], duration: '4d', velocity: rideVel, channel: 10, tick: beatStartTick })); 
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [rideCymbal], duration: '8', velocity: calculateDynamicVelocity('drum-hihat', targetValence, targetArousal, isKidsMode, false), channel: 10, tick: beatStartTick + Math.floor(TPQN * 0.66) })); 
                    if (Math.random() < 0.3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '4', velocity: calculateDynamicVelocity('drum-hihat', targetValence, targetArousal, isKidsMode, false), channel: 10, tick: beatStartTick + Math.floor(TPQN/2) })); 
                } else if (genreLower?.includes("funk") || genreLower?.includes("soul")) {
                    if (beat === 0 || (beat === 2 && Math.random() < 0.6)) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                    else if (Math.random() < rhythmicDensity * 0.5) { 
                         drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '8', velocity: calculateDynamicVelocity('drum-kick', targetValence, targetArousal, isKidsMode, false), channel: 10, tick: beatStartTick + (Math.random() < 0.5 ? Math.floor(TPQN/4) : Math.floor(TPQN/2)) }));
                    }
                    if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick }));
                    for(let sub = 0; sub < 4; sub++) { 
                        const currentHiHat = (sub === 1 || sub === 3) && Math.random() < 0.25 ? hiHatOpen : hiHatClosed;
                        const dynamicHiHatVel = calculateDynamicVelocity('drum-hihat', targetValence, targetArousal, isKidsMode, false);
                        if (Math.random() < 0.85 || sub === 0 || sub === 2) { 
                            drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [currentHiHat], duration: '16', velocity: dynamicHiHatVel, channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/4)}));
                        }
                    }
                }
                else { // Default beat
                    if (beat === 0 || (beat === 2 && rhythmicDensity > 0.4)) {
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                    }
                    if (beat === 1 || beat === 3) {
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick }));
                    }
                    if (rhythmicDensity > 0.6) { 
                        for(let sub = 0; sub < 2; sub++) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '8', velocity: calculateDynamicVelocity('drum-hihat', targetValence, targetArousal, isKidsMode, false), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/2)}));
                    } else if (rhythmicDensity > 0.2) { 
                        drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '4', velocity: hiHatVel, channel: 10, tick: beatStartTick }));
                    }
                }
            }
        }
    });

    // Outro
    const tonicKeyName = params.keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || params.keySignature.toUpperCase();
    const finalModeIsMinor = params.mode.toLowerCase().includes('minor');
    const finalNoteDuration = OUTRO_MEASURES.toString(); // Duration in measures for MIDI ticks
    const finalTick = totalMeasuresInBody * BEATS_PER_MEASURE * TPQN;


    const finalPadOctave = isKidsMode ? 3 : (genreLower?.includes('jazz') ? 3 : 2);
    const finalTonicChordForPadDef = getChordProgressionWithDetails(tonicKeyName, finalModeIsMinor ? 'minor' : 'major', 1, finalPadOctave, 0.1, params.selectedGenre, isKidsMode)[0];

    if (finalTonicChordForPadDef && finalTonicChordForPadDef.notes && finalTonicChordForPadDef.notes.length > 0) {
        const finalPadVelocity = calculateDynamicVelocity('chord', targetValence, targetArousal, isKidsMode, true, melodicEmphasis);
        chordsPadTrack.addEvent(new MidiWriter.NoteEvent({
            pitch: finalTonicChordForPadDef.notes,
            duration: finalNoteDuration,
            velocity: finalPadVelocity,
            tick: finalTick
        }));
    }

    const finalMelodyOctave = isKidsMode ? 4 : (genreLower?.includes('jazz') ? 4 : 3);
    const finalMelodyNoteMidi = robustNoteToMidi(tonicKeyName + finalMelodyOctave);
    if (isValidMidiNumber(finalMelodyNoteMidi)) {
        const finalMelodyVelocity = calculateDynamicVelocity('melody', targetValence, targetArousal, isKidsMode, true, melodicEmphasis);
        melodyTrack.addEvent(new MidiWriter.NoteEvent({
            pitch: [finalMelodyNoteMidi],
            duration: finalNoteDuration,
            velocity: finalMelodyVelocity,
            tick: finalTick
        }));
    }

    const finalBassOctave = isKidsMode ? 2 : 1;
    const finalBassNoteMidi = robustNoteToMidi(tonicKeyName + finalBassOctave);
    if (isValidMidiNumber(finalBassNoteMidi)) {
        const finalBassVelocity = calculateDynamicVelocity('bass', targetValence, targetArousal, isKidsMode, true, melodicEmphasis);
        bassTrack.addEvent(new MidiWriter.NoteEvent({
            pitch: [finalBassNoteMidi],
            duration: finalNoteDuration,
            velocity: finalBassVelocity,
            tick: finalTick
        }));
    }

    if (drumTrackHasEvents || isKidsMode) {
        const finalDrumVelocity = calculateDynamicVelocity('drum-cymbal', targetValence, targetArousal, isKidsMode, true);
        drumTrack.addEvent(new MidiWriter.NoteEvent({
            pitch: [crashCymbal],
            duration: finalNoteDuration,
            velocity: finalDrumVelocity,
            channel: 10,
            tick: finalTick
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

