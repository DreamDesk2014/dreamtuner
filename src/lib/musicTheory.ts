
// src/lib/musicTheory.ts

// Constants
export const PITCH_CLASSES: { [key: string]: number } = {
    'C': 0, 'B#': 0, 'BS': 0, 'C#': 1, 'DB': 1, 'CS': 1, 'D': 2, 'D#': 3, 'EB': 3, 'DS': 3,
    'E': 4, 'FB': 4, 'F': 5, 'E#': 5, 'ES': 5, 'F#': 6, 'GB': 6, 'FS': 6, 'G': 7,
    'G#': 8, 'AB': 8, 'GS': 8, 'A': 9, 'A#': 10, 'BB': 10, 'AS': 10, 'B': 11, 'CB': 11,
};

export const NOTES_ARRAY = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10]; // Natural Minor
export const HARMONIC_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 11];
export const MELODIC_MINOR_INTERVALS_ASC = [0, 2, 3, 5, 7, 9, 11]; // Melodic Minor (ascending)
export const BLUES_SCALE_INTERVALS = [0, 3, 5, 6, 7, 10];
export const MAJOR_PENTATONIC_INTERVALS = [0, 2, 4, 7, 9];
export const MINOR_PENTATONIC_INTERVALS = [0, 3, 5, 7, 10];
export const CHROMATIC_SCALE_INTERVALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// Modal Scales
export const DORIAN_SCALE_INTERVALS = [0, 2, 3, 5, 7, 9, 10];
export const PHRYGIAN_SCALE_INTERVALS = [0, 1, 3, 5, 7, 8, 10];
export const LYDIAN_SCALE_INTERVALS = [0, 2, 4, 6, 7, 9, 11];
export const MIXOLYDIAN_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 10];
export const LOCRIAN_SCALE_INTERVALS = [0, 1, 3, 5, 6, 8, 10];


export const MAJOR_CHORD_INTERVALS = [0, 4, 7]; // Root, Major Third, Perfect Fifth
export const MINOR_CHORD_INTERVALS = [0, 3, 7]; // Root, Minor Third, Perfect Fifth
export const DOMINANT_7_CHORD_INTERVALS = [0, 4, 7, 10]; // Root, Major Third, Perfect Fifth, Minor Seventh
export const MINOR_7_CHORD_INTERVALS = [0, 3, 7, 10]; // Root, Minor Third, Perfect Fifth, Minor Seventh
export const MAJOR_7_CHORD_INTERVALS = [0, 4, 7, 11]; // Root, Major Third, Perfect Fifth, Major Seventh
export const DIMINISHED_CHORD_INTERVALS = [0, 3, 6]; // Root, Minor Third, Diminished Fifth
export const AUGMENTED_CHORD_INTERVALS = [0, 4, 8]; // Root, Major Third, Augmented Fifth
export const MINOR_MAJOR_7_CHORD_INTERVALS = [0, 3, 7, 11]; // Root, Minor Third, Perfect Fifth, Major Seventh
export const DIMINISHED_7_CHORD_INTERVALS = [0, 3, 6, 9]; // Root, Minor Third, Diminished Fifth, Diminished Seventh (double flat 7th)
export const HALF_DIMINISHED_7_CHORD_INTERVALS = [0, 3, 6, 10]; // m7b5: Root, Minor Third, Diminished Fifth, Minor Seventh


// Default MIDI note for fallback
export const DEFAULT_MIDI_NOTE = 60; // C4

// --- Note and Scale Utilities ---
export function robustNoteToMidi(noteNameWithOctave: string): number {
    if (typeof noteNameWithOctave !== 'string') {
        console.warn(`Invalid input type for robustNoteToMidi: ${typeof noteNameWithOctave}, defaulting to ${DEFAULT_MIDI_NOTE}`);
        return DEFAULT_MIDI_NOTE;
    }
    const match = noteNameWithOctave.match(/([A-G])([#bSsxBF]*)(-?[0-9]+)/i);

    if (!match) {
        const simpleMatch = noteNameWithOctave.match(/([A-G])([#bSsxBF]*)/i);
        if (simpleMatch) {
             return robustNoteToMidi(noteNameWithOctave + '4'); // Assume octave 4 if not specified
        }
        console.warn(`Invalid note format for MIDI conversion: '${noteNameWithOctave}', defaulting to ${DEFAULT_MIDI_NOTE}`);
        return DEFAULT_MIDI_NOTE;
    }

    let pitchClassName = match[1].toUpperCase();
    const accidentals = match[2]?.toUpperCase() || '';
    const octave = parseInt(match[3], 10);

    if (isNaN(octave)) {
        console.warn(`Invalid octave in note: '${noteNameWithOctave}', defaulting to ${DEFAULT_MIDI_NOTE}`);
        return DEFAULT_MIDI_NOTE;
    }

    let fullPitchName = pitchClassName;
    if (accidentals.includes('#') || accidentals.includes('S')) fullPitchName += '#';
    else if (accidentals.includes('B') || (accidentals.includes('F') && pitchClassName !== 'F' && pitchClassName !== 'B')) fullPitchName += 'B';

    // Handle enharmonic equivalents like E#, B#, Cb, Fb
    let effectiveOctave = octave;
    if (fullPitchName === 'E#') { fullPitchName = 'F'; }
    else if (fullPitchName === 'B#') { fullPitchName = 'C'; effectiveOctave = octave + 1; }
    else if (fullPitchName === 'CB') { fullPitchName = 'B'; effectiveOctave = octave - 1; }
    else if (fullPitchName === 'FB') { fullPitchName = 'E'; }


    let midiNumberBase = PITCH_CLASSES[fullPitchName];

    if (midiNumberBase === undefined) { // Fallback if fullPitchName (with simplified accidental) isn't in PITCH_CLASSES
        midiNumberBase = PITCH_CLASSES[pitchClassName]; // Try base pitch class
        if (midiNumberBase !== undefined) {
            for (const char of accidentals) { // Apply all accidentals
                if (char === '#' || char === 'S') midiNumberBase = (midiNumberBase + 1);
                else if (char === 'B' || char === 'F') midiNumberBase = (midiNumberBase - 1);
                // Double sharp/flat not explicitly handled by this simple addition/subtraction,
                // but PITCH_CLASSES should cover common cases.
            }
            midiNumberBase = (midiNumberBase % 12 + 12) % 12; // Normalize to 0-11 range
        } else {
             console.warn(`Unknown base pitch class: '${pitchClassName}' from '${noteNameWithOctave}', defaulting to ${DEFAULT_MIDI_NOTE}`);
             return DEFAULT_MIDI_NOTE;
        }
    }

    const finalMidiNumber = midiNumberBase + (effectiveOctave + 1) * 12;

    if (finalMidiNumber >= 0 && finalMidiNumber <= 127) {
        return finalMidiNumber;
    } else {
        console.warn(`Calculated MIDI number ${finalMidiNumber} for '${noteNameWithOctave}' is out of range (0-127), defaulting to ${DEFAULT_MIDI_NOTE}.`);
        return DEFAULT_MIDI_NOTE;
    }
}

export function midiToNoteName(midiNumber: number): string {
    if (typeof midiNumber !== 'number' || isNaN(midiNumber) || midiNumber < 0 || midiNumber > 127) {
        console.warn(`Invalid MIDI number ${midiNumber} for note name conversion, defaulting to C4.`);
        midiNumber = DEFAULT_MIDI_NOTE;
    }
    const octave = Math.floor(midiNumber / 12) - 1;
    const noteIndex = midiNumber % 12;
    if (noteIndex < 0 || noteIndex >= NOTES_ARRAY.length) {
      console.warn(`Invalid note index ${noteIndex} from MIDI ${midiNumber}`);
      return 'C4'; // Fallback for safety
    }
    return NOTES_ARRAY[noteIndex] + octave;
}

/**
 * Generates an array of note names for a given scale.
 * @param keyNote The root note of the key (e.g., "C", "F#").
 * @param mode The mode of the scale (e.g., 'major', 'minor', 'dorian').
 * @param startOctave The starting octave for the scale notes.
 * @param genre Optional genre to influence scale choice (e.g., 'blues', 'jazz').
 * @param harmonicComplexity Optional complexity factor (0-1).
 * @returns An array of note names (e.g., ["C4", "D4", "E4", ...]).
 */
export function getScaleNoteNames(
    keyNote: string,
    mode: string,
    startOctave: number = 4,
    genre?: string,
    harmonicComplexity: number = 0.3
): string[] {
    const baseKeyForScale = keyNote.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keyNote.toUpperCase();
    const rootMidiBase = robustNoteToMidi(baseKeyForScale + '0') % 12; // Get the pitch class (0-11)
    const genreLower = typeof genre === 'string' ? genre.toLowerCase() : "";
    const modeLower = typeof mode === 'string' ? mode.toLowerCase() : "major";

    let intervals: number[];

    if (modeLower.includes("kids")) { // Specific handling for kids mode
        intervals = MAJOR_PENTATONIC_INTERVALS;
    } else if (genreLower.includes('blues')) {
        intervals = BLUES_SCALE_INTERVALS;
    } else if (genreLower.includes('jazz')) {
        if (modeLower.includes('minor')) intervals = DORIAN_SCALE_INTERVALS;
        else if (harmonicComplexity > 0.7 && modeLower.includes('major')) intervals = LYDIAN_SCALE_INTERVALS;
        else if (harmonicComplexity > 0.5) intervals = MIXOLYDIAN_SCALE_INTERVALS; // Good for dominant feel
        else intervals = MAJOR_SCALE_INTERVALS;
    } else if (modeLower === 'major') {
        intervals = MAJOR_SCALE_INTERVALS;
    } else if (modeLower === 'minor') { // Natural minor default
        intervals = MINOR_SCALE_INTERVALS;
        if (harmonicComplexity > 0.7 && (genreLower.includes('classical') || genreLower.includes('cinematic'))) {
            intervals = HARMONIC_MINOR_INTERVALS;
        } else if (harmonicComplexity > 0.5 && (genreLower.includes('jazz') || genreLower.includes('pop'))) {
            intervals = DORIAN_SCALE_INTERVALS;
        }
    } else if (modeLower === 'dorian') {
        intervals = DORIAN_SCALE_INTERVALS;
    } else if (modeLower === 'phrygian') {
        intervals = PHRYGIAN_SCALE_INTERVALS;
    } else if (modeLower === 'lydian') {
        intervals = LYDIAN_SCALE_INTERVALS;
    } else if (modeLower === 'mixolydian') {
        intervals = MIXOLYDIAN_SCALE_INTERVALS;
    } else if (modeLower === 'locrian') {
        intervals = LOCRIAN_SCALE_INTERVALS;
    } else if (modeLower === 'majorpentatonic') {
        intervals = MAJOR_PENTATONIC_INTERVALS;
    } else if (modeLower === 'minorpentatonic') {
        intervals = MINOR_PENTATONIC_INTERVALS;
    } else if (modeLower === 'harmonicminor') {
        intervals = HARMONIC_MINOR_INTERVALS;
    } else if (modeLower === 'chromatic') {
        intervals = CHROMATIC_SCALE_INTERVALS;
    }
     else { // Fallback to major or minor based on name
        intervals = modeLower.includes('minor') ? MINOR_SCALE_INTERVALS : MAJOR_SCALE_INTERVALS;
    }


    return intervals.map(interval => {
        const currentMidiValue = rootMidiBase + interval;
        // Adjust octave if interval wraps around (e.g. root is B, interval is +2 (C#), C# is in next octave)
        const octaveOffset = Math.floor(currentMidiValue / 12);
        const noteMidiNumber = (currentMidiValue % 12) + (startOctave + octaveOffset + 1) * 12;
        return midiToNoteName(noteMidiNumber);
    });
}


/**
 * Generates an array of note names for a chord based on a root note and chord type.
 * @param rootNote The root note of the chord (e.g., "C", "F#").
 * @param mode The quality of the chord (e.g., 'major', 'minor', 'dominant7th').
 * @param octave The octave for the root note of the chord.
 * @param addSeventh If true, adds the 7th to major/minor chords if not already specified by mode.
 * @param genre Optional genre to influence chord voicings/extensions.
 * @param harmonicComplexity Optional complexity factor (0-1).
 * @returns An array of note names (e.g., ["C4", "E4", "G4"]).
 */
export function getChordNotesForKey(
    rootNote: string,
    mode: string, // Chord quality like 'major', 'minor', 'm7', 'Maj7', 'Dom7'
    octave: number = 3,
    addSeventhOverride: boolean = false, // If true, forces a 7th if basic major/minor
    genre?: string,
    harmonicComplexity?: number
): string[] {
    const rootNoteNameOnly = rootNote.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || rootNote.toUpperCase();
    const rootMidi = robustNoteToMidi(rootNoteNameOnly + octave);
    const modeLower = mode.toLowerCase();
    const genreLower = typeof genre === 'string' ? genre.toLowerCase() : "";
    const hc = typeof harmonicComplexity === 'number' ? harmonicComplexity : 0.3;


    let intervals: number[];

    if (modeLower.includes("maj7") || (modeLower === "major" && addSeventhOverride && hc > 0.5)) {
        intervals = MAJOR_7_CHORD_INTERVALS;
    } else if (modeLower.includes("dom7") || modeLower.includes("dominant7") || (modeLower === "major" && addSeventhOverride && genreLower.includes("blues"))) {
        intervals = DOMINANT_7_CHORD_INTERVALS;
    } else if (modeLower.includes("m7b5") || modeLower.includes("halfdim")) {
        intervals = HALF_DIMINISHED_7_CHORD_INTERVALS;
    } else if (modeLower.includes("minmaj7")) {
        intervals = MINOR_MAJOR_7_CHORD_INTERVALS;
    } else if (modeLower.includes("m7") || (modeLower === "minor" && addSeventhOverride && hc > 0.5)) {
        intervals = MINOR_7_CHORD_INTERVALS;
    } else if (modeLower.includes("dim7")) {
        intervals = DIMINISHED_7_CHORD_INTERVALS;
    } else if (modeLower.includes("dim")) {
        intervals = DIMINISHED_CHORD_INTERVALS;
    } else if (modeLower.includes("aug")) {
        intervals = AUGMENTED_CHORD_INTERVALS;
    } else if (modeLower.includes("minor")) {
        intervals = MINOR_CHORD_INTERVALS;
    } else if (modeLower.includes("major")) {
        intervals = MAJOR_CHORD_INTERVALS;
    } else { // Default to major triad if mode is unclear
        intervals = MAJOR_CHORD_INTERVALS;
    }

    // Kids mode simplification: always triads, and mostly major unless explicitly minor hinted
    if (modeLower.includes("kids")) {
        if (modeLower.includes("minor")) intervals = MINOR_CHORD_INTERVALS.slice(0,3);
        else intervals = MAJOR_CHORD_INTERVALS.slice(0,3);
    }


    let chordNotes = intervals.map(interval => {
        const midiNumber = rootMidi + interval;
        return midiToNoteName(midiNumber);
    }).filter(name => name && typeof name === 'string');


    // Genre/Complexity based voicing adjustments (simplified)
    if (genreLower.includes('rock') && hc < 0.4 && intervals.length >= 2) { // Power Chords
        chordNotes = [midiToNoteName(rootMidi), midiToNoteName(rootMidi + intervals[2])]; // Root and Fifth
        const rootOctaveDown = rootMidi - 12;
        if (Math.random() < 0.5 && rootOctaveDown >=0) {
           chordNotes.unshift(midiToNoteName(rootOctaveDown));
        }
    } else if (genreLower.includes('jazz') && hc > 0.6 && chordNotes.length >= 3) {
        // Add 9ths or 13ths for jazz if complex
        if (Math.random() < 0.4) { // Add 9th
            const ninthInterval = intervals.includes(MAJOR_CHORD_INTERVALS[1]) ? 14 : 13; // Major 9th or minor 9th
            chordNotes.push(midiToNoteName(rootMidi + ninthInterval));
        }
        if (Math.random() < 0.2 && hc > 0.8) { // Add 13th
             const thirteenthInterval = 21; // Major 13th
             chordNotes.push(midiToNoteName(rootMidi + thirteenthInterval));
        }
    }


    return chordNotes.filter(note => note !== undefined && robustNoteToMidi(note) >=0 && robustNoteToMidi(note) <= 127);
}


export function getNoteFromScale(scale: string[], degree: number): string | undefined {
    if (!Array.isArray(scale) || scale.length === 0) return undefined;
    // Degree is 1-indexed
    const index = (degree - 1 + scale.length * 100) % scale.length; // Ensure positive index
    return scale[index];
}

export function getMidiNoteFromScale(scale: string[], degree: number, targetOctave: number): number | undefined {
    const noteNameInScaleOctave = getNoteFromScale(scale, degree);
    if (!noteNameInScaleOctave) return undefined;

    // Extract the pitch class (C, C#, D etc.) from the note name which includes its original octave
    const pitchClassMatch = noteNameInScaleOctave.match(/([A-G][#bSsxBF]*)/i);
    if (!pitchClassMatch) return undefined;
    const pitchClassName = pitchClassMatch[0];

    // Construct the note name with the target octave
    const noteNameInTargetOctave = pitchClassName + targetOctave;
    const midi = robustNoteToMidi(noteNameInTargetOctave);

    return (midi >= 0 && midi <= 127) ? midi : undefined;
}
