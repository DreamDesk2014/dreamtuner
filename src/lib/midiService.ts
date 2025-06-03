
// @ts-nocheck - Disabling TypeScript checks for this file due to midi-writer-js typings
import MidiWriter from 'midi-writer-js';
import type { MusicParameters } from '@/types';

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

function getScaleNotesForKey(
    keySignature: string, 
    mode: 'major' | 'minor' | string, 
    startOctave: number = 4,
    genre?: string,
    rhythmicDensityForPentatonicHint?: number 
): number[] { 
    const baseKeyForScale = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const rootMidiBase = robustNoteToMidi(baseKeyForScale + '0') % 12; 

    let intervals: number[];
    const genreLower = genre?.toLowerCase();

    if (genreLower?.includes('blues')) {
        intervals = BLUES_SCALE_INTERVALS;
    } else if (
        (genreLower?.includes('rock') || genreLower?.includes('pop')) && 
        typeof rhythmicDensityForPentatonicHint === 'number' && 
        rhythmicDensityForPentatonicHint < 0.5 
    ) {
        intervals = mode.toLowerCase().includes('minor') ? MINOR_PENTATONIC_INTERVALS : MAJOR_PENTATONIC_INTERVALS;
    } else {
        intervals = (mode.toLowerCase().includes('minor')) ? STANDARD_MINOR_INTERVALS : STANDARD_MAJOR_INTERVALS;
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
    quality: 'major' | 'minor' | 'diminished' | 'augmented' | string;
    duration: string; 
    rootNoteMidi: number; 
    measureDuration?: string; 
}

function getChordProgressionWithDetails(
    keySignature: string,
    mode: 'major' | 'minor' | string,
    numCycles: number, 
    baseOctave: number = 3,
    harmonicComplexity: number = 0.5
): ChordDefinition[] {
    const baseKeyForChords = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const keyRootMidiBase = robustNoteToMidi(baseKeyForChords + '0') % 12;

    const buildChord = (rootOffset: number, quality: ChordDefinition['quality'], octave: number): { notes: number[], quality: ChordDefinition['quality'], rootNoteMidi: number } => {
        const currentRootMidiValue = keyRootMidiBase + rootOffset;
        const octaveForRoot = octave + Math.floor(currentRootMidiValue / 12);
        const normalizedRootMidiPitch = (currentRootMidiValue % 12) + (octaveForRoot + 1) * 12;

        let thirdInterval = 4; 
        if (quality === 'minor' || quality === 'diminished') thirdInterval = 3; 
        
        let fifthInterval = 7; 
        if (quality === 'diminished') fifthInterval = 6; 
        else if (quality === 'augmented') fifthInterval = 8;

        const chordMidiNumbers = [
            normalizedRootMidiPitch,
            normalizedRootMidiPitch + thirdInterval,
            normalizedRootMidiPitch + fifthInterval
        ];

        if (harmonicComplexity > 0.6) {
            let seventhInterval: number | null = null;
            if (quality === 'major') seventhInterval = 10; 
            else if (quality === 'minor') seventhInterval = 10; 
            if (seventhInterval !== null) {
                chordMidiNumbers.push(normalizedRootMidiPitch + seventhInterval);
            }
        }
        const validatedNotes = chordMidiNumbers.filter(isValidMidiNumber);
        if (validatedNotes.length < 2 && chordMidiNumbers.length >=2) { 
            return { notes: [normalizedRootMidiPitch].filter(isValidMidiNumber), quality, rootNoteMidi: normalizedRootMidiPitch };
        }
        return { notes: validatedNotes, quality, rootNoteMidi: normalizedRootMidiPitch };
    };

    let baseProgression: ChordDefinition[] = [];
    const defaultDuration = '1'; 

    if (mode.toLowerCase().includes('minor')) {
        baseProgression = [ 
            { ...buildChord(0, 'minor', baseOctave), duration: defaultDuration, measureDuration: '1' }, 
            { ...buildChord(8, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }, 
            { ...buildChord(3, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }, 
            { ...buildChord(10, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' } 
        ];
    } else { 
        baseProgression = [ 
            { ...buildChord(0, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' }, 
            { ...buildChord(7, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' },  
            { ...buildChord(9, 'minor', baseOctave), duration: defaultDuration, measureDuration: '1' },  
            { ...buildChord(5, 'major', baseOctave), duration: defaultDuration, measureDuration: '1' } 
        ];
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

const mapInstrumentHintToGM = (hints: string[], genre?: string): InstrumentMapping => {
    let mapping: InstrumentMapping = { melody: 80, bass: 33, chordsPad: 89, arpeggioSynth: 81, drums: 0  }; 
    if (genre) {
        const g = genre.toLowerCase();
        if (g.includes("rock")) { mapping = { melody: 27, bass: 34, chordsPad: 27, arpeggioSynth: 27, drums: 0 }; } 
        else if (g.includes("pop")) { mapping = { melody: 80, bass: 38, chordsPad: 90, arpeggioSynth: 81, drums: 0 }; } 
        else if (g.includes("jazz")) { mapping = { melody: 1, bass: 32, chordsPad: 1, arpeggioSynth: 52, drums: 0 }; }
        else if (g.includes("electronic")) { mapping = { melody: 80, bass: 38, chordsPad: 90, arpeggioSynth: 81, drums: 25 }; } 
        else if (g.includes("ambient")) { mapping = { melody: 90, bass: 90, chordsPad: 89, arpeggioSynth: 99, drums: 0 }; }
        else if (g.includes("classical") || g.includes("cinematic")) { mapping = { melody: 40, bass: 42, chordsPad: 48, arpeggioSynth: 49, drums: 0 }; }
        else if (g.includes("folk")) { mapping = { melody: 24, bass: 32, chordsPad: 24, arpeggioSynth: 73, drums: 0 }; }
        else if (g.includes("blues")) { mapping = { melody: 27, bass: 33, chordsPad: 19, arpeggioSynth: 25, drums: 0 }; }
    }

    (hints || []).forEach(hint => {
        const hLower = hint.toLowerCase();
        if (/piano/i.test(hLower)) { mapping.melody = 0; if (genre?.toLowerCase().includes("jazz") || !genre) mapping.chordsPad = 0; }
        else if (/flute/i.test(hLower)) mapping.melody = 73;
        else if (/violin|strings/i.test(hLower) && !/ensemble|pad/i.test(hLower)) mapping.melody = 40;
        else if (/guitar/i.test(hLower) && !/bass|acoustic/i.test(hLower)) mapping.melody = 27; 
        else if (/acoustic guitar/i.test(hLower)) mapping.melody = 24;
        else if (/trumpet|brass/i.test(hLower)) mapping.melody = 56;
        else if (/sax|saxophone/i.test(hLower)) mapping.melody = 65;
        else if (/bell|celesta|glockenspiel/i.test(hLower)) { mapping.melody = 9; mapping.arpeggioSynth = 14; } 
        else if (/bright synth/i.test(hLower)) mapping.melody = 80;
        else if (/warm lead|soft lead/i.test(hLower)) mapping.melody = 81;

        if (/synth bass|bass synth/i.test(hLower)) mapping.bass = 38;
        else if (/acoustic bass|double bass/i.test(hLower)) mapping.bass = 32;
        else if (/cello/i.test(hLower) && (genre?.toLowerCase().includes("classical") || genre?.toLowerCase().includes("cinematic"))) mapping.bass = 42;
        else if (/picked bass/i.test(hLower)) mapping.bass = 34;

        if (/string ensemble|strings pad/i.test(hLower)) mapping.chordsPad = 48;
        else if (/synth pad|ambient pad|warm pad/i.test(hLower)) mapping.chordsPad = 89;
        else if (/dark pad|sweep pad/i.test(hLower)) mapping.chordsPad = 96;
        else if (/organ/i.test(hLower)) mapping.chordsPad = 19;
        else if (/choir|voice|aahs/i.test(hLower)) mapping.chordsPad = 52;

        if (/arp|arpeggio|pluck|sequence/i.test(hLower)) mapping.arpeggioSynth = 99;
        else if (/fx|sound effect/i.test(hLower)) mapping.arpeggioSynth = 102;
    });
    return mapping;
};

const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

// Safely get TPQN (Ticks Per Quarter Note)
const getTPQN = () => {
    if (MidiWriter && MidiWriter.constants && typeof MidiWriter.constants.TPQN === 'number') {
        return MidiWriter.constants.TPQN;
    }
    console.warn(
        `midi-writer-js: MidiWriter.constants.TPQN not found or not a number. Using default value 128. MidiWriter: ${typeof MidiWriter}, MidiWriter.constants: ${typeof MidiWriter?.constants}`
    );
    return 128; // Default TPQN for midi-writer-js
};


export const generateMidiFile = (params: MusicParameters): string => {
    const melodyTrack = new MidiWriter.Track();
    const bassTrack = new MidiWriter.Track();
    const chordsPadTrack = new MidiWriter.Track();
    const arpeggioTrack = new MidiWriter.Track();
    const drumTrack = new MidiWriter.Track();

    melodyTrack.setTempo(params.tempoBpm); 

    const instruments = mapInstrumentHintToGM(params.instrumentHints, params.selectedGenre);
    melodyTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.melody }));
    bassTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.bass }));
    chordsPadTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.chordsPad }));
    arpeggioTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.arpeggioSynth }));
    drumTrack.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: instruments.drums, channel: 10 }));

    const melodyOctave = 4;
    const bassOctave = 2;
    const chordOctave = 3;
    const arpeggioOctave = params.harmonicComplexity > 0.6 ? 5 : 4; 

    const beatsPerMeasure = 4;
    const secondsPerBeat = 60 / params.tempoBpm;
    const secondsPerMeasure = beatsPerMeasure * secondsPerBeat;
    const measuresInBaseProgression = 4; 
    const secondsPerBaseProgression = measuresInBaseProgression * secondsPerMeasure;
    
    const MAX_MIDI_SECONDS = 30;
    let numProgressionCycles = Math.max(1, Math.floor(MAX_MIDI_SECONDS / secondsPerBaseProgression));
    if (numProgressionCycles * secondsPerBaseProgression < 5 && MAX_MIDI_SECONDS > 5) {
      numProgressionCycles = Math.max(numProgressionCycles, Math.ceil(5 / secondsPerBaseProgression));
    }
    if (numProgressionCycles === 0) numProgressionCycles = 1;
    
    const progression = getChordProgressionWithDetails(params.keySignature, params.mode, numProgressionCycles, chordOctave, params.harmonicComplexity);
    
    progression.forEach(chordDef => {
        const baseChordVelocity = clamp(50 + Math.floor(params.targetArousal * 20), 30, 80);
        if (chordDef.notes.length > 0) {
            chordsPadTrack.addEvent(new MidiWriter.NoteEvent({ pitch: chordDef.notes, duration: chordDef.measureDuration || '1', velocity: baseChordVelocity }));
        }
    });

    progression.forEach(chordDef => {
        const bassNoteMidi = robustNoteToMidi(midiToNoteName(chordDef.rootNoteMidi).replace(/[0-9]+$/, String(bassOctave)));
        const baseBassVelocity = clamp(70 + Math.floor(params.targetArousal * 25), 40, 100);
        const genre = params.selectedGenre?.toLowerCase();
        
        if (!isValidMidiNumber(bassNoteMidi)) return;

        if (genre && (genre.includes('rock') || genre.includes('pop'))) {
            for (let i = 0; i < beatsPerMeasure; i++) { 
                 bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: '4', velocity: baseBassVelocity + Math.floor(Math.random()*5)}));
            }
        } else if (genre && genre.includes('electronic')) {
            if (params.rhythmicDensity > 0.6) { 
                for (let i = 0; i < beatsPerMeasure * 2; i++) {
                    bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: '8', velocity: baseBassVelocity - 5 + Math.floor(Math.random()*5)}));
                }
            } else { 
                 for (let i = 0; i < beatsPerMeasure; i++) {
                    bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: '4', velocity: baseBassVelocity + Math.floor(Math.random()*5)}));
                }
            }
        } else if (genre && genre.includes('jazz')) { 
            for (let i = 0; i < beatsPerMeasure; i++) {
                 bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: '4', velocity: baseBassVelocity + Math.floor(Math.random()*10)}));
            }
        }
        else { 
            bassTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [bassNoteMidi], duration: chordDef.measureDuration || '1', velocity: baseBassVelocity}));
        }
    });

    const mainScaleNotesMidi = getScaleNotesForKey(params.keySignature, params.mode, melodyOctave, params.selectedGenre, params.rhythmicDensity);
    
    progression.forEach((chordDef) => {
        const currentChordScaleMidi = getScaleNotesForKey(midiToNoteName(chordDef.rootNoteMidi).replace(/[0-9]+$/, ''), chordDef.quality, melodyOctave, params.selectedGenre, params.rhythmicDensity);
        const baseMelodyVelocity = clamp(70 + Math.floor(params.targetArousal * 25), 40, 100);

        let notesInMeasure = params.rhythmicDensity > 0.7 ? 4 : (params.rhythmicDensity > 0.3 ? 2 : 1); 
        let baseDuration = notesInMeasure === 4 ? '4' : (notesInMeasure === 2 ? '2' : '1');

        let preferredChordTonesMidi = [...chordDef.notes].map(n => (n % 12) + (melodyOctave + 1) * 12).filter(isValidMidiNumber);
         if (params.selectedGenre?.toLowerCase().includes('jazz') || params.selectedGenre?.toLowerCase().includes('blues')) {
            if (chordDef.notes.length > 3 && params.harmonicComplexity > 0.6) { 
                const seventhNoteMidi = (chordDef.notes[3] % 12) + (melodyOctave + 1) * 12;
                if(isValidMidiNumber(seventhNoteMidi)) preferredChordTonesMidi.push(seventhNoteMidi, seventhNoteMidi); 
            }
        }

        for (let i = 0; i < notesInMeasure; i++) {
            let pitchMidi: number;
            if (Math.random() < 0.7 && preferredChordTonesMidi.length > 0) { 
                 pitchMidi = preferredChordTonesMidi[Math.floor(Math.random() * preferredChordTonesMidi.length)];
            } else if (Math.random() < 0.8 && currentChordScaleMidi.length > 0) {
                pitchMidi = currentChordScaleMidi[Math.floor(Math.random() * currentChordScaleMidi.length)];
            } else if (mainScaleNotesMidi.length > 0) {
                pitchMidi = mainScaleNotesMidi[Math.floor(Math.random() * mainScaleNotesMidi.length)];
            } else {
                pitchMidi = DEFAULT_MIDI_NOTE + (i % 7);
            }
            
            if (!isValidMidiNumber(pitchMidi)) continue;

            let currentDuration = baseDuration;
            let currentVelocity = clamp(baseMelodyVelocity - 10 + Math.floor(Math.random() * 20), 30, 110);

            if (baseDuration === '4' && params.rhythmicDensity > 0.8 && Math.random() < 0.25 && i < notesInMeasure -1) { 
                melodyTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [pitchMidi], duration: '8', velocity: currentVelocity }));
                
                let nextPitchMidi = currentChordScaleMidi.length > 0 ? currentChordScaleMidi[Math.floor(Math.random() * currentChordScaleMidi.length)] : mainScaleNotesMidi[Math.floor(Math.random() * mainScaleNotesMidi.length)];
                if(!isValidMidiNumber(nextPitchMidi) && mainScaleNotesMidi.length > 0) nextPitchMidi = mainScaleNotesMidi[0];
                else if (!isValidMidiNumber(nextPitchMidi)) nextPitchMidi = DEFAULT_MIDI_NOTE;

                melodyTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [nextPitchMidi], duration: '8', velocity: currentVelocity - 5 }));
                i++; 
            } else {
                melodyTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [pitchMidi], duration: currentDuration, velocity: currentVelocity }));
            }
        }
    });

    progression.forEach(chordDef => {
        const arpNotesMidi = chordDef.notes.map(n => (n % 12) + (arpeggioOctave + 1) * 12).filter(isValidMidiNumber);
        if(arpNotesMidi.length === 0) return;

        const numArpNotesPerBeat = params.harmonicComplexity > 0.7 ? 2 : (params.harmonicComplexity > 0.4 ? 1 : 0); 
        const baseArpVelocity = clamp(60 + Math.floor(params.targetArousal * 15), 30, 80);

        if (numArpNotesPerBeat > 0) {
            for (let beat = 0; beat < beatsPerMeasure; beat++) {
                for (let subBeat = 0; subBeat < numArpNotesPerBeat; subBeat++) {
                    const pitchMidi = arpNotesMidi[(beat * numArpNotesPerBeat + subBeat) % arpNotesMidi.length];
                     if (!isValidMidiNumber(pitchMidi)) continue;
                    arpeggioTrack.addEvent(new MidiWriter.NoteEvent({
                        pitch: [pitchMidi],
                        duration: numArpNotesPerBeat === 2 ? '16' : '8',
                        velocity: clamp(baseArpVelocity - 5 + Math.floor(Math.random() * 10), 30, 90)
                    }));
                }
            }
        } else if (params.harmonicComplexity > 0.1) { 
             const pitchMidi = arpNotesMidi[0];
             if (!isValidMidiNumber(pitchMidi)) return;
             arpeggioTrack.addEvent(new MidiWriter.NoteEvent({
                pitch: [pitchMidi], 
                duration: chordDef.measureDuration || '1',
                velocity: baseArpVelocity - 10
            }));
        }
    });

    const kick = 36; const snare = 38; const hiHatClosed = 42; const crashCymbal = 49; const rideCymbal = 51; const hiTom = 50; const midTom = 47; const lowTom = 45;
    const TPQN = getTPQN();

    progression.forEach((chordDef, measureIndex) => {
        const measureStartTick = measureIndex * beatsPerMeasure * TPQN;
        const genre = params.selectedGenre?.toLowerCase();
        const isFillMeasure = (measureIndex + 1) % 4 === 0; 

        if (measureIndex === 0 || (measureIndex > 0 && measureIndex % 8 === 0 && !isFillMeasure)) { 
            drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [crashCymbal], duration: '2', velocity: 100, channel: 10, tick: measureStartTick }));
        }

        for (let beat = 0; beat < beatsPerMeasure; beat++) {
            const beatStartTick = measureStartTick + beat * TPQN;
            let kickVel = clamp(95 + Math.floor(params.targetArousal * 15), 70, 120);
            let snareVel = clamp(85 + Math.floor(params.targetArousal * 15), 60, 110);
            let hiHatVel = clamp(60 + Math.floor(params.targetArousal * 10), 40, 80);

            if (isFillMeasure && beat === beatsPerMeasure - 1 && params.rhythmicDensity > 0.3) {
                if (genre && (genre.includes("rock") || genre.includes("pop") || genre.includes("electronic"))) {
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '16', velocity: snareVel -15, channel: 10, tick: beatStartTick }));
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '16', velocity: snareVel -10, channel: 10, tick: beatStartTick + Math.floor(TPQN/4) }));
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '16', velocity: snareVel -5, channel: 10, tick: beatStartTick + Math.floor(TPQN/2) }));
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '16', velocity: kickVel, channel: 10, tick: beatStartTick + Math.floor(TPQN * 0.75) }));
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [crashCymbal], duration: '4', velocity: 110, channel: 10, tick: beatStartTick + Math.floor(TPQN * 0.75) }));
                } else if (genre && (genre.includes("jazz") || genre.includes("blues"))) {
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '8t', velocity: snareVel - 10, channel: 10, tick: beatStartTick }));
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [midTom], duration: '8t', velocity: snareVel - 15, channel: 10, tick: beatStartTick + Math.floor(TPQN/3) }));
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [lowTom], duration: '8t', velocity: snareVel - 5, channel: 10, tick: beatStartTick + Math.floor((TPQN/3)*2) }));
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [crashCymbal], duration: '4', velocity: 100, channel: 10, tick: beatStartTick + Math.floor((TPQN/3)*2) }));
                } 
                continue; 
            }

            if (genre && genre.includes("rock")) {
                if (beat === 0 || beat === 2) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick }));
                for(let sub = 0; sub < 2; sub++) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '8', velocity: hiHatVel - (sub*10), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/2)}));
            } else if (genre && genre.includes("pop")) {
                if (beat === 0 || (beat === 2 && Math.random() < 0.7)) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick }));
                const numHiHats = params.rhythmicDensity > 0.7 ? 4 : 2; 
                for(let sub = 0; sub < numHiHats; sub++) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: numHiHats === 4 ? '16' : '8', velocity: hiHatVel - (sub % 2 === 1 ? 10:0), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/numHiHats)}));
            } else if (genre && genre.includes("electronic")) { 
                drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel + 5, channel: 10, tick: beatStartTick }));
                if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick })); 
                for(let sub = 0; sub < 2; sub++) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '8', velocity: hiHatVel -5, channel: 10, tick: beatStartTick + Math.floor(TPQN/2) * sub + Math.floor(TPQN/4)}));
            } else if (genre && genre.includes("jazz")) { 
                if (beat === 0 || beat === 2) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel - 20, channel: 10, tick: beatStartTick }));
                if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel - 20, channel: 10, tick: beatStartTick }));
                drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [rideCymbal], duration: '4d', velocity: hiHatVel-10, channel: 10, tick: beatStartTick })); 
                drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [rideCymbal], duration: '8', velocity: hiHatVel-15, channel: 10, tick: beatStartTick + Math.floor(TPQN * 0.75) })); 
            } else if (genre && genre.includes("blues")) {
                 if (beat === 0 || beat === 2) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel -10 , channel: 10, tick: beatStartTick }));
                if (beat === 1 || beat === 3) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel -10, channel: 10, tick: beatStartTick }));
                drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '8t', velocity: hiHatVel, channel: 10, tick: beatStartTick })); 
                drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '8t', velocity: hiHatVel -15, channel: 10, tick: beatStartTick + Math.floor((TPQN / 3 * 2)) })); 
            } else if (genre && genre.includes("ambient")) { 
                if (beat === 0 && Math.random() < params.rhythmicDensity * 0.7) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '1', velocity: kickVel - 30, channel: 10, tick: beatStartTick }));
                if (beat === 2 && Math.random() < params.rhythmicDensity * 0.5) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [crashCymbal], duration: '1', velocity: snareVel - 30, channel: 10, tick: beatStartTick })); 
            } else { 
                if (beat === 0 || (beat === 2 && params.rhythmicDensity > 0.4)) {
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [kick], duration: '4', velocity: kickVel, channel: 10, tick: beatStartTick }));
                }
                if (beat === 1 || beat === 3) {
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [snare], duration: '4', velocity: snareVel, channel: 10, tick: beatStartTick }));
                }
                if (params.rhythmicDensity > 0.6) { 
                    for(let sub = 0; sub < 2; sub++) drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '8', velocity: hiHatVel - (sub*10), channel: 10, tick: beatStartTick + sub * Math.floor(TPQN/2)}));
                } else if (params.rhythmicDensity > 0.2) { 
                    drumTrack.addEvent(new MidiWriter.NoteEvent({ pitch: [hiHatClosed], duration: '4', velocity: hiHatVel, channel: 10, tick: beatStartTick }));
                }
            }
        }
    });

    const writer = new MidiWriter.Writer([melodyTrack, bassTrack, chordsPadTrack, arpeggioTrack, drumTrack]);
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

