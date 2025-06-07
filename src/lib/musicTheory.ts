// src/lib/musicTheory.ts

// Constants
export const PITCH_CLASSES: { [key: string]: number } = {
    'C': 0, 'B#': 0, 'BS': 0, 'C#': 1, 'DB': 1, 'CS': 1, 'D': 2, 'D#': 3, 'EB': 3, 'DS': 3,
    'E': 4, 'FB': 4, 'F': 5, 'E#': 5, 'ES': 5, 'F#': 6, 'GB': 6, 'FS': 6, 'G': 7,
    'G#': 8, 'AB': 8, 'GS': 8, 'A': 9, 'A#': 10, 'BB': 10, 'AS': 10, 'B': 11, 'CB': 11,
};

export const NOTES_ARRAY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
export const BLUES_SCALE_INTERVALS = [0, 3, 5, 6, 7, 10];
export const CHROMATIC_SCALE_INTERVALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
export const DORIAN_SCALE_INTERVALS = [0, 2, 3, 5, 7, 9, 10];
export const PHRYGIAN_SCALE_INTERVALS = [0, 1, 3, 5, 7, 8, 10];
export const LYDIAN_SCALE_INTERVALS = [0, 2, 4, 6, 7, 9, 11];
export const MIXOLYDIAN_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 10];
export const LOCRIAN_SCALE_INTERVALS = [0, 1, 3, 5, 6, 8, 10];

export const MAJOR_CHORD_INTERVALS = [0, 4, 7];
export const MINOR_CHORD_INTERVALS = [0, 3, 7];
export const DOMINANT_7_CHORD_INTERVALS = [0, 4, 7, 10];
export const MINOR_7_CHORD_INTERVALS = [0, 3, 7, 10];
export const MAJOR_7_CHORD_INTERVALS = [0, 4, 7, 11];
export const DIMINISHED_CHORD_INTERVALS = [0, 3, 6];
export const AUGMENTED_CHORD_INTERVALS = [0, 4, 8];

// Default MIDI note for fallback
export const DEFAULT_MIDI_NOTE = 60; // C4

// --- Note and Scale Utilities ---
export function robustNoteToMidi(noteNameWithOctave: string): number {
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

export function midiToNoteName(midiNumber: number): string {
    if (typeof midiNumber !== 'number' || isNaN(midiNumber) || midiNumber < 0 || midiNumber > 127) {
        midiNumber = DEFAULT_MIDI_NOTE;
    }
    const octave = Math.floor(midiNumber / 12) - 1;
    const noteIndex = midiNumber % 12;
    if (noteIndex < 0 || noteIndex >= NOTES_ARRAY.length) return 'C4';
    return NOTES_ARRAY[noteIndex] + octave;
}

export function getScaleNoteNames(keyNote: string, scaleIntervals: number[], startOctave: number = 4): string[] {
    const baseKeyForScale = keyNote.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keyNote.toUpperCase();
    const rootMidiBase = robustNoteToMidi(baseKeyForScale + '0') % 12;

    return scaleIntervals.map(interval => {
        const currentMidiValue = rootMidiBase + interval;
        const octaveOffset = Math.floor(currentMidiValue / 12);
        const noteMidiNumber = (currentMidiValue % 12) + (startOctave + octaveOffset + 1) * 12;
        return midiToNoteName(noteMidiNumber);
    });
}

export function getChordNotesForKey(keyNote: string, chordIntervals: number[], octave: number = 3): string[] {
    const rootNoteName = keyNote.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keyNote.toUpperCase();
    const rootMidi = robustNoteToMidi(rootNoteName + octave);

    if (rootMidi === DEFAULT_MIDI_NOTE && robustNoteToMidi(rootNoteName + '0') === DEFAULT_MIDI_NOTE) {
         // Fallback if keyNote is completely unparseable
         return chordIntervals.map(interval => midiToNoteName(DEFAULT_MIDI_NOTE + (octave - 4) * 12 + interval));
    }


    return chordIntervals.map(interval => {
         // Calculate note relative to the octave's root MIDI
        const midiNumber = rootMidi + interval;
        return midiToNoteName(midiNumber);
    }).filter(name => name && typeof name === 'string'); // Ensure valid note names are returned
}

export function getNoteFromScale(scale: string[], degree: number): string | undefined {
    if (!Array.isArray(scale) || scale.length === 0) return undefined;
    const index = (degree - 1 + scale.length) % scale.length;
    return scale[index];
}

export function getMidiNoteFromScale(scale: string[], degree: number, octave: number): number | undefined {
    const noteName = getNoteFromScale(scale, degree);
    if (!noteName) return undefined;

    // Need to adjust the octave based on the scale's structure and the desired degree
    // A simpler approach for now is to find the note in the scale in the desired octave
    const baseNoteName = noteName.replace(/[0-9]+$/, ''); // Remove existing octave

    // Find the midi note for this base note name in the target octave
    let midi = robustNoteToMidi(baseNoteName + octave);

    // Ensure the midi note is part of the scale intervals relative to the root of that octave
    const scaleIntervals = scale.map(robustNoteToMidi).map(midi => (midi % 12 + 12) % 12);
    const rootMidiOfOctave = robustNoteToMidi(scale[0].replace(/[0-9]+$/, '') + octave);
    const intervalRelativeToOctaveRoot = (midi - rootMidiOfOctave % 12 + 12) % 12;


     // If the calculated midi note's interval isn't in the scale intervals,
     // try to find the closest one within the scale in the target octave range.
    if (!scaleIntervals.includes(intervalRelativeToOctaveRoot)) {
        const targetPitchClass = (robustNoteToMidi(noteName) % 12 + 12) % 12;
        let closestMidi = -1;
        let minDiff = Infinity;

        for (let i = -1; i <= 1; i++) { // Check the target octave and adjacent ones
            const potentialMidi = robustNoteToMidi(baseNoteName + (octave + i));
             if (potentialMidi === DEFAULT_MIDI_NOTE && robustNoteToMidi(baseNoteName + '0') !== DEFAULT_MIDI_NOTE) {
                 // If robustNoteToMidi failed for this octave, but the base name is valid, skip
                 continue;
             }
             if (potentialMidi === DEFAULT_MIDI_NOTE) continue; // Completely invalid note name

            if ((potentialMidi % 12 + 12) % 12 === targetPitchClass) {
                 const diff = Math.abs(potentialMidi - midi);
                 if (diff < minDiff) {
                     minDiff = diff;
                     closestMidi = potentialMidi;
                 }
            }
        }
         if (closestMidi !== -1) {
            midi = closestMidi;
         } else {
             // Fallback to the original calculated midi if no matching pitch class found in nearby octaves
             // or if robustNoteToMidi failed entirely.
              return midi === DEFAULT_MIDI_NOTE ? undefined : midi;
         }
    }


    return (midi >= 0 && midi <= 127) ? midi : undefined;
}
