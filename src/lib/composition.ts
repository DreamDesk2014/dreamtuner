import * as Tone from 'tone';
import type { MusicParameters } from '@/types';
import {
    robustNoteToMidi,
    midiToNoteName,
    getScaleNoteNames,
    getChordNotesForKey,
} from './musicTheory';
import { applyHumanization, weightedRandom } from './utils'; // Assuming you create a utils file for helper functions

// Constants (can be moved to a config file later)
const TIME_EPSILON = 0.00001;
const DEFAULT_MIDI_NOTE = 60; // C4

interface ScheduledNote {
    time: number;
    note: string | number;
    duration: string | number;
    velocity: number;
    filterAttack?: boolean;
    pitch?: string | number; // For drums
}

interface ScheduledChordEvent {
    time: number;
    notes: string[];
    duration: string | number;
    velocity: number;
    filterAttack?: boolean;
}

interface CompositionResult {
    melodyNotes: ScheduledNote[];
    bassNotes: ScheduledNote[];
    chordEvents: ScheduledChordEvent[];
    arpeggioNotes: ScheduledNote[];
    drumEvents: ScheduledNote[]; // Using ScheduledNote for drums for simplicity
    overallMaxTime: number;
}


function getProgressionForGenre(mode: string, genre: string): number[] {
    if (mode === 'kids') return [1, 4, 5, 1];
    const genreLower = genre.toLowerCase();
    if (genreLower.includes("blues")) return [1, 1, 4, 1, 5, 4, 1, 1];
    if (genreLower.includes("jazz")) return [2, 5, 1, 6];
    return [1, 5, 6, 4]; // Default pop/rock progression
}

export function generateComposition(params: MusicParameters): CompositionResult {
    const {
        tempoBpm = 120,
        keySignature = 'C',
        mode = 'major',
        selectedGenre,
        originalInput,
        harmonicComplexity = 0.3,
        rhythmicDensity = 0.5,
        targetArousal = 0,
        targetValence = 0,
        instrumentHints = [],
    } = params;

    const genreLower = typeof selectedGenre === 'string' ? selectedGenre.toLowerCase() : "";
    const isKidsMode = originalInput.mode === 'kids';

    const secondsPerBeat = 60 / tempoBpm;
    const beatsPerMeasure = 4; // Assuming 4/4 time signature
    const measureDurationSeconds = beatsPerBeat * beatsPerMeasure;
    const startOffset = 0.1;
    let overallMaxTime = startOffset;

    const progressionDegreesInput = getProgressionForGenre(originalInput.mode, genreLower);

    const numChordCycles = isKidsMode ? 2 : (genreLower.includes("ambient") ? 3 : (genreLower.includes("blues") ? 1 : 4));
    const totalDurationSeconds = numChordCycles * progressionDegreesInput.length * measureDurationSeconds;


    const melodyNotesToSchedule: ScheduledNote[] = [];
    const bassNotesToSchedule: ScheduledNote[] = [];
    const chordEventsToSchedule: ScheduledChordEvent[] = [];
    const arpeggioNotesToSchedule: ScheduledNote[] = [];
    const drumEventsToSchedule: ScheduledNote[] = [];

    // --- Melody Generation ---
    const melodyOctave = isKidsMode ? 4 : (genreLower.includes("jazz") || genreLower.includes("classical") ? 5 : 4);
    const scaleNoteNames = getScaleNoteNames(keySignature, mode, melodyOctave, selectedGenre, harmonicComplexity);
    let melodyCurrentTime = startOffset;
    let lastMelodyEventTime = -TIME_EPSILON;
    let lastMelodyNoteMidi = -1;
    let melodyNoteCounter = 0;

    if (scaleNoteNames.length > 0) {
        let currentMelodyScaleIndex = Math.floor(Math.random() * scaleNoteNames.length);
        if (scaleNoteNames[currentMelodyScaleIndex]) lastMelodyNoteMidi = robustNoteToMidi(scaleNoteNames[currentMelodyScaleIndex]);

        while (melodyCurrentTime < totalDurationSeconds - TIME_EPSILON) {
            let noteDurationNotation: string;
            const arousalFactor = (targetArousal + 1) / 2;

            if (isKidsMode) {
                noteDurationNotation = weightedRandom(["4n", "2n", "8n"], [0.6, 0.3, 0.1]) as string;
            } else if (rhythmicDensity < 0.33) {
                noteDurationNotation = weightedRandom(["2n", "4n", "1m"], [0.5, 0.4 - arousalFactor * 0.1, 0.1 + arousalFactor * 0.1]) as string;
            } else if (rhythmicDensity < 0.66) {
                noteDurationNotation = weightedRandom(["4n", "8n", "2n"], [0.6, 0.3 + arousalFactor * 0.05, 0.1]) as string;
            } else {
                noteDurationNotation = weightedRandom(["8n", "16n", "4n"], [0.5 + arousalFactor * 0.1, 0.3 - arousalFactor * 0.05, 0.2]) as string;
            }

            let noteDurationSec = Tone.Time(noteDurationNotation).toSeconds();

            if (melodyCurrentTime + noteDurationSec > totalDurationSeconds + TIME_EPSILON) {
                noteDurationSec = totalDurationSeconds - melodyCurrentTime;
                if (noteDurationSec <= TIME_EPSILON * 5) break;
                if (noteDurationSec >= Tone.Time("1m").toSeconds() - TIME_EPSILON) noteDurationNotation = "1m";
                else if (noteDurationSec >= Tone.Time("2n").toSeconds() - TIME_EPSILON) noteDurationNotation = "2n";
                else if (noteDurationSec >= Tone.Time("4n").toSeconds() - TIME_EPSILON) noteDurationNotation = "4n";
                else if (noteDurationSec >= Tone.Time("8n").toSeconds() - TIME_EPSILON) noteDurationNotation = "8n";
                else if (noteDurationSec >= Tone.Time("16n").toSeconds() - TIME_EPSILON) noteDurationNotation = "16n";
                else break;
                noteDurationSec = Tone.Time(noteDurationNotation).toSeconds();
            }
            if (melodyCurrentTime >= totalDurationSeconds - TIME_EPSILON) break;


            melodyNoteCounter++;
            const restProbabilityBase = isKidsMode ? 0.20 : 0.15;
            const phraseEndRestProb = isKidsMode ? 0.30 : 0.25;
            const restProbability = (melodyNoteCounter % (isKidsMode ? 3 : (rhythmicDensity > 0.6 ? 5 : 4)) === 0) ? phraseEndRestProb : (restProbabilityBase - (rhythmicDensity * 0.10) - arousalFactor * 0.03);


            if (Math.random() < restProbability && melodyCurrentTime > startOffset + secondsPerBeat * 0.5 && melodyNotesToSchedule.length > 0) {
                let restDurNotation = rhythmicDensity < 0.5 ? "8n" : "16n";
                if (noteDurationNotation === "2n" || noteDurationNotation === "1m") restDurNotation = "4n";
                const restDurSec = Tone.Time(restDurNotation).toSeconds();
                if (melodyCurrentTime + restDurSec <= totalDurationSeconds + TIME_EPSILON) {
                    melodyCurrentTime += restDurSec;
                    melodyNoteCounter = 0;
                    if (melodyCurrentTime >= totalDurationSeconds - TIME_EPSILON) break;
                    continue;
                }
            }

            const currentChordDegree = progressionDegreesInput[Math.floor(melodyCurrentTime / measureDurationSeconds) % progressionDegreesInput.length];
            const chordNotesForMelody = getChordNotesForKey(keySignature, mode, currentChordDegree, melodyOctave, harmonicComplexity > 0.5, selectedGenre, harmonicComplexity)
                .map(n => robustNoteToMidi(n));

            let nextNoteMidi;
            const preferChordTone = Math.random() < (isKidsMode ? 0.60 : (harmonicComplexity > 0.4 ? 0.75 : 0.65));
            const preferStepwise = Math.random() < (isKidsMode ? 0.70 : (rhythmicDensity < 0.7 ? 0.85 : 0.70));

            if (preferChordTone && chordNotesForMelody.length > 0 && (melodyNoteCounter % (isKidsMode ? 1 : 2) === 1 || isKidsMode)) {
                nextNoteMidi = chordNotesForMelody[Math.floor(Math.random() * chordNotesForMelody.length)];
            } else if (preferStepwise && lastMelodyNoteMidi !== -1) {
                const possibleSteps = [-2, -1, 1, 2];
                const nextStep = possibleSteps[Math.floor(Math.random() * possibleSteps.length)];
                let candidateNote = lastMelodyNoteMidi + nextStep;
                const scaleMidiNotes = scaleNoteNames.map(n => robustNoteToMidi(n));
                if (!scaleMidiNotes.includes(candidateNote) && scaleMidiNotes.length > 0) {
                    nextNoteMidi = scaleMidiNotes.reduce((prev, curr) => (Math.abs(curr - candidateNote) < Math.abs(prev - candidateNote) ? curr : prev));
                } else {
                    nextNoteMidi = candidateNote;
                }
            } else {
                currentMelodyScaleIndex = (currentMelodyScaleIndex + (Math.random() < 0.6 ? (Math.random() < 0.5 ? 1 : -1) : (Math.random() < 0.5 ? 2 : -2)) + scaleNoteNames.length) % scaleNoteNames.length;
                if (scaleNoteNames[currentMelodyScaleIndex]) nextNoteMidi = robustNoteToMidi(scaleNoteNames[currentMelodyScaleIndex]);
                else nextNoteMidi = DEFAULT_MIDI_NOTE;
            }
            nextNoteMidi = Math.max(21, Math.min(108, nextNoteMidi || DEFAULT_MIDI_NOTE));
            lastMelodyNoteMidi = nextNoteMidi;

            const noteName = midiToNoteName(nextNoteMidi);
            const baseVelMelody = isKidsMode ? 0.50 : 0.55;
            const velocity = Math.min(0.9, Math.max(0.15, baseVelMelody + (targetArousal * 0.18) + (targetValence * 0.04) + (Math.random() * 0.12 - 0.06) + (melodyNoteCounter === 1 ? 0.04 : 0)));

            let newTime = applyHumanization(melodyCurrentTime, 0.005 * (1 + rhythmicDensity) * (Tone.Time(noteDurationNotation).toSeconds() / secondsPerBeat));
            if (newTime <= lastMelodyEventTime) newTime = lastMelodyEventTime + TIME_EPSILON;
            if (newTime >= totalDurationSeconds - TIME_EPSILON) break;


            melodyNotesToSchedule.push({ time: newTime, note: noteName, duration: noteDurationNotation, velocity, filterAttack: true });
            lastMelodyEventTime = newTime;
            overallMaxTime = Math.max(overallMaxTime, newTime + noteDurationSec);
            melodyCurrentTime = newTime + noteDurationSec;
        }
    }


    // --- Bass Generation ---
    const bassOctave = isKidsMode ? 2 : (genreLower.includes("jazz") || genreLower.includes("funk") ? 2 : (genreLower.includes("rock") || genreLower.includes("metal") ? 1 : 2));
    let lastBassEventTime = -TIME_EPSILON;

    for (let cycle = 0; cycle < numChordCycles; cycle++) {
        for (let i = 0; i < progressionDegreesInput.length; i++) {
            const degree = progressionDegreesInput[i];
            const currentMeasureStartTime = startOffset + (cycle * progressionDegreesInput.length * measureDurationSeconds) + (i * measureDurationSeconds);
            const chordNotesForBass = getChordNotesForKey(keySignature, mode, degree, bassOctave, harmonicComplexity > 0.5, selectedGenre, harmonicComplexity);
            const rootNote = chordNotesForBass[0] || midiToNoteName(DEFAULT_MIDI_NOTE + (bassOctave - 4) * 12);
            const fifthNote = chordNotesForBass[2 % chordNotesForBass.length] || rootNote;
            const thirdNote = chordNotesForBass[1 % chordNotesForBass.length] || rootNote;
            const scaleForWalk = getScaleNoteNames(keySignature, mode, bassOctave, selectedGenre, harmonicComplexity);


            const baseVelBass = (isKidsMode ? 0.45 : 0.55) + (targetArousal * 0.12);

            if (isKidsMode) {
                let time = applyHumanization(currentMeasureStartTime, 0.01);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: rootNote, duration: "2n", velocity: Math.min(0.70, baseVelBass + 0.1), filterAttack: true });
                lastBassEventTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + Tone.Time("2n").toSeconds());
            } else if (genreLower.includes("jazz")) {
                let currentWalkNoteMidi = robustNoteToMidi(rootNote);
                for (let beat = 0; beat < beatsPerMeasure; beat++) {
                    let time = applyHumanization(currentMeasureStartTime + beat * secondsPerBeat, 0.02);
                    if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                    bassNotesToSchedule.push({ time, note: midiToNoteName(currentWalkNoteMidi), duration: "4n", velocity: Math.min(0.70, baseVelBass + (beat === 0 ? 0.04 : -0.04) + Math.random() * 0.03), filterAttack: beat % 2 === 0 });
                    lastBassEventTime = time;
                    overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat);
                    const targetNotesMidi = beat < 2 ? [robustNoteToMidi(thirdNote), robustNoteToMidi(fifthNote)] : [robustNoteToMidi(fifthNote), robustNoteToMidi(rootNote) + (Math.random() < 0.3 ? 7 : 0)];
                    let closestDist = Infinity;
                    let nextNoteMidi = currentWalkNoteMidi;
                    [...targetNotesMidi, ...scaleForWalk.map(n => robustNoteToMidi(n))].forEach(tnMidi => {
                        if (tnMidi === currentWalkNoteMidi) return;
                        const dist = Math.abs(tnMidi - currentWalkNoteMidi);
                        if (dist < closestDist && dist <= 4) {
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
                    { rest: true, timeOffset: secondsPerBeat * 2.0, duration: "16n" }, { note: rootNote, timeOffset: secondsPerBeat * 2.25, duration: "16n", accent: true },
                    { note: thirdNote, timeOffset: secondsPerBeat * 3.0, duration: "8n", accent: false }, { note: fifthNote, timeOffset: secondsPerBeat * 3.5, duration: "8n", accent: false },
                ];
                pattern.forEach(p => {
                    if (p.rest) return;
                    let time = applyHumanization(currentMeasureStartTime + p.timeOffset, 0.015);
                    if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                    bassNotesToSchedule.push({ time, note: p.note as string, duration: p.duration, velocity: Math.min(0.75, baseVelBass + (p.accent ? 0.08 : 0) + Math.random() * 0.04), filterAttack: p.accent });
                    lastBassEventTime = time;
                    overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(p.duration).toSeconds());
                });
            } else if (genreLower.includes("electronic") && rhythmicDensity > 0.3) {
                const subdivisions = rhythmicDensity > 0.65 ? 4 : 2;
                const noteDur = subdivisions === 4 ? "16n" : "8n";
                for (let beat = 0; beat < beatsPerMeasure * subdivisions; beat++) {
                    let time = applyHumanization(currentMeasureStartTime + beat * (secondsPerBeat / subdivisions), 0.005);
                    if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                    bassNotesToSchedule.push({ time, note: rootNote, duration: noteDur, velocity: Math.min(0.70, baseVelBass + (beat % subdivisions === 0 ? 0.04 : 0)), filterAttack: beat % subdivisions === 0 });
                    lastBassEventTime = time;
                    overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat / subdivisions);
                }
            }
            else {
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

    // --- Chord Generation ---
    const chordOctave = isKidsMode ? 3 : (genreLower.includes("jazz") || genreLower.includes("classical") ? 4 : 3);
    let lastChordEventTime = -TIME_EPSILON;

    for (let cycle = 0; cycle < numChordCycles; cycle++) {
        for (let i = 0; i < progressionDegreesInput.length; i++) {
            const degree = progressionDegreesInput[i];
            const currentMeasureStartTime = startOffset + (cycle * progressionDegreesInput.length * measureDurationSeconds) + (i * measureDurationSeconds);
            const addSeventhForChord = !isKidsMode && (harmonicComplexity > 0.5 || genreLower.includes("jazz"));
            const chordNoteNames = getChordNotesForKey(keySignature, mode, degree, chordOctave, addSeventhForChord, selectedGenre, harmonicComplexity);

            const baseVelChord = (isKidsMode ? 0.25 : 0.35) + (targetArousal * 0.10) + (targetValence * 0.04);

            if (chordNoteNames.length > 0) {
                if (isKidsMode || genreLower.includes("ambient") || genreLower.includes("classical")) {
                    let time = applyHumanization(currentMeasureStartTime, 0.01);
                    if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
                    chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: "1m", velocity: Math.min(0.55, baseVelChord), filterAttack: true });
                    lastChordEventTime = time;
                    overallMaxTime = Math.max(overallMaxTime, time + measureDurationSeconds);
                } else if (genreLower.includes("funk") || genreLower.includes("reggae") || (genreLower.includes("electronic") && rhythmicDensity > 0.6)) {
                    const numStabs = rhythmicDensity > 0.6 ? (genreLower.includes("reggae") ? 2 : 4) : 2;
                    const stabDuration = numStabs === 4 ? "16n" : (genreLower.includes("reggae") ? "4n" : "8n");
                    for (let s = 0; s < numStabs; s++) {
                        let timeOffset = s * (measureDurationSeconds / numStabs);
                        if (genreLower.includes("reggae")) timeOffset = (s * 2 + 1) * (secondsPerBeat);
                        let time = applyHumanization(currentMeasureStartTime + timeOffset, 0.015);
                        if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;

                        chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: stabDuration, velocity: Math.min(0.60, baseVelChord + 0.08 + Math.random() * 0.04), filterAttack: s % 2 === 0 });
                        lastChordEventTime = time;
                        overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(stabDuration).toSeconds());
                        if (genreLower.includes("reggae") && s >= 1) break;
                    }
                } else if (genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("country")) {
                    const strumPattern = rhythmicDensity > 0.55 ? ["0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5"] : ["0", "1", "2", "3"];
                    const strumDur = rhythmicDensity > 0.55 ? "8n" : "4n";
                    strumPattern.forEach(beatOffsetStr => {
                        let time = applyHumanization(currentMeasureStartTime + parseFloat(beatOffsetStr) * secondsPerBeat, 0.01);
                        if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
                        chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: strumDur, velocity: Math.min(0.55, baseVelChord + (beatOffsetStr === "0" ? 0.04 : 0) + Math.random() * 0.02), filterAttack: beatOffsetStr === "0" });
                        lastChordEventTime = time;
                        overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(strumDur).toSeconds());
                    });
                } else {
                    let time = applyHumanization(currentMeasureStartTime, 0.01);
                    if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
                    chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: "1m", velocity: Math.min(0.55, baseVelChord), filterAttack: true });
                    lastChordEventTime = time;
                    overallMaxTime = Math.max(overallMaxTime, time + measureDurationSeconds);
                }
            }
        }
    }


    // --- Arpeggio Generation ---
    const arpeggioOctave = isKidsMode ? 4 : (harmonicComplexity > 0.3 ? 4 : 3);
    let lastArpEventTime = -TIME_EPSILON;

    const playArp = !isKidsMode || (isKidsMode && harmonicComplexity > 0.1 && rhythmicDensity > 0.05);
    if (playArp && (genreLower.includes("electronic") || genreLower.includes("pop") || genreLower.includes("ambient") || genreLower.includes("classical") || isKidsMode || harmonicComplexity > 0.4)) {
        chordEventsToSchedule.forEach(chordEvent => {
            const currentChordNotesForArp = chordEvent.notes.map(n => midiToNoteName(robustNoteToMidi(n.replace(/[0-9]+$/, String(arpeggioOctave)))));
            if (currentChordNotesForArp.length > 0) {
                const arpPattern = [0, 1, 2, 1];
                if (genreLower.includes("classical")) arpPattern.push(0, 2, 1, 2);


                const arpNoteDurationNotation = (rhythmicDensity > 0.4 || genreLower.includes("electronic")) ? "16n" : "8n";
                const arpNoteDurationSeconds = Tone.Time(arpNoteDurationNotation).toSeconds();
                const notesPerBeatForArp = arpNoteDurationNotation === "16n" ? 4 : 2;
                const beatsToArpeggiate = isKidsMode ? (rhythmicDensity > 0.1 ? 1 : 0) : (rhythmicDensity > 0.2 && harmonicComplexity > 0.2 ? (genreLower.includes("ambient") ? beatsPerMeasure : 2) : (harmonicComplexity > 0.5 ? 1 : 0));


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


    // --- Drum Generation ---
    const numDrumMeasures = numChordCycles * progressionDegreesInput.length;
    const humanizeAmountDrums = 0.008;
    let lastDrumTimes = { kick: -TIME_EPSILON, snare: -TIME_EPSILON, hiHat: -TIME_EPSILON, tambourine: -TIME_EPSILON };

    // Need to know if tambourine is used from synth configs - this dependency highlights the need for a shared config or parameter passing
    // For now, we'll assume the drum generation knows about potential instruments or base patterns
     const useTambourine = instrumentHints.map(h => typeof h === 'string' ? h.toLowerCase() : "").some(h => h.includes("tambourine") || h.includes("shaker"));
     const useRideCymbal = genreLower.includes("jazz") || genreLower.includes("swing") || (genreLower.includes("blues") && rhythmicDensity > 0.3);


    for (let measure = 0; measure < numDrumMeasures; measure++) {
        const baseVelDrum = (isKidsMode ? 0.50 : 0.60) + (targetArousal * 0.18);
        for (let beat = 0; beat < beatsPerMeasure; beat++) {
            const beatStartTime = startOffset + (measure * measureDurationSeconds) + (beat * secondsPerBeat);
            let addKick = false; let kickTime = beatStartTime;

            if (isKidsMode) {
                addKick = beat === 0;
            } else if (genreLower.includes("electronic") || genreLower.includes("house") || genreLower.includes("techno")) {
                addKick = true;
            } else if (genreLower.includes("funk") || genreLower.includes("soul")) {
                addKick = (beat === 0) || (beat === 2 && Math.random() < 0.6) || (Math.random() < rhythmicDensity * 0.35);
                if (addKick && beat > 0) kickTime = beatStartTime + (Math.random() < 0.5 ? -secondsPerBeat * 0.25 : secondsPerBeat * 0.25) * (Math.random() * 0.5);
            } else {
                addKick = beat === 0 || beat === 2;
            }
            if (addKick) {
                let time = applyHumanization(kickTime, humanizeAmountDrums);
                if (time <= lastDrumTimes.kick) time = lastDrumTimes.kick + TIME_EPSILON;
                drumEventsToSchedule.push({ synth: 'kick', time, duration: "8n", velocity: Math.min(0.90, baseVelDrum + 0.18), pitch: "C2" });
                lastDrumTimes.kick = time;
            }

            let addSnare = false; let snareTime = beatStartTime;
            if (isKidsMode) {
                addSnare = useTambourine ? false : beat === 2;
            } else if (genreLower.includes("electronic") || genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("funk") || genreLower.includes("soul") || genreLower.includes("country")) {
                addSnare = beat === 1 || beat === 3;
            } else if (genreLower.includes("jazz")) {
                addSnare = (beat === 1 || beat === 3) && Math.random() < 0.25;
            } else if (genreLower.includes("reggae")) {
                addSnare = beat === 2;
            }
            if (addSnare) {
                let time = applyHumanization(snareTime, humanizeAmountDrums * 1.2);
                if (time <= lastDrumTimes.snare) time = lastDrumTimes.snare + TIME_EPSILON;
                drumEventsToSchedule.push({ synth: 'snare', time, duration: "16n", velocity: Math.min(0.85, baseVelDrum + 0.08), pitch: "D2" });
                lastDrumTimes.snare = time;
            }

            if (isKidsMode && useTambourine && (beat === 1 || beat === 3)) {
                let time = applyHumanization(beatStartTime, humanizeAmountDrums);
                if (time <= lastDrumTimes.tambourine) time = lastDrumTimes.tambourine + TIME_EPSILON;
                drumEventsToSchedule.push({ synth: 'tambourine', time, duration: "8n", velocity: Math.min(0.65, baseVelDrum - 0.06) });
                lastDrumTimes.tambourine = time;
            }

            let hiHatSubdivisions = 0;
            if (isKidsMode) { hiHatSubdivisions = rhythmicDensity > 0.3 ? 1 : 0;
            } else if (useRideCymbal) { hiHatSubdivisions = 3;
            } else if (genreLower.includes("funk") || genreLower.includes("soul") || (genreLower.includes("electronic") && rhythmicDensity > 0.55)) { hiHatSubdivisions = 4;
            } else if (rhythmicDensity > 0.15) { hiHatSubdivisions = 2;
            }

            if (hiHatSubdivisions > 0) {
                const hiHatNoteDuration = hiHatSubdivisions === 1 ? "4n" : hiHatSubdivisions === 2 ? "8n" : hiHatSubdivisions === 3 ? "8t" : "16n";
                for (let subBeat = 0; subBeat < hiHatSubdivisions; subBeat++) {
                    let time = applyHumanization(beatStartTime + (subBeat * (secondsPerBeat / hiHatSubdivisions)), humanizeAmountDrums * 0.5);
                     if (Tone.Transport.swing > 0 && hiHatSubdivisions === 2 && subBeat === 1) time += Tone.Transport.swing * (secondsPerBeat/2) * 0.5;
                     if (Tone.Transport.swing > 0 && hiHatSubdivisions === 3 && subBeat > 0) time += Tone.Transport.swing * (secondsPerBeat/3) * (subBeat === 1 ? 0.33 : 0.66) * 0.5;

                    if (time <= lastDrumTimes.hiHat) time = lastDrumTimes.hiHat + TIME_EPSILON;

                    // This pitch mapping should ideally be in soundDesign or passed in
                    const hiHatPitchForToneJS = useRideCymbal ? 300 : (genreLower.includes("electronic") ? 480 : 400);

                    const hiHatVelocity = Math.min(0.55, (baseVelDrum * 0.45) + (Math.random() * 0.08) - (subBeat % 2 === 1 && hiHatSubdivisions > 1 ? 0.04 : 0));


                    if (!isKidsMode && !genreLower.includes("jazz") && !genreLower.includes("classical") && hiHatSub