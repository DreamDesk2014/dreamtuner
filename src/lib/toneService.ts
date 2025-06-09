
'use client';
import * as Tone from 'tone';
import type { MusicParameters } from '@/types';
import { audioBufferToWav } from "./audioBufferToWav";
import {
    robustNoteToMidi,
    midiToNoteName,
    getScaleNoteNames as getScaleNoteNamesFromTheory,
    getChordNotesForKey as getChordNotesForKeyFromTheory,
    DEFAULT_MIDI_NOTE
} from './musicTheory'; // Import from the single source of truth
import {
    getSynthConfigurations as getSynthConfigurationsFromSoundDesign,
    createSynth as createSynthFromSoundDesign
} from './soundDesign'; // Import from the single source of truth

// Constants
const MIN_EFFECTIVE_DURATION_SECONDS = 5.0;
const MAX_WAV_RENDER_DURATION_SECONDS = 15.0; // Max 15 seconds for WAV
const TIME_EPSILON = 0.00001;

// --- Utility Functions (specific to toneService or helpers if not in musicTheory) ---
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
  const logPrefix = "[WAV_GEN_REFINED_V3.1]"; // Updated version for clarity
  console.log(`${logPrefix} Starting synthesis for: ${params.generatedIdea ? params.generatedIdea.substring(0, 30) : "Untitled"}...`);

  if (typeof Tone === 'undefined' || !Tone.context) {
    console.error(`${logPrefix}_ERROR] Tone.js or Tone.context is not available. Aborting.`);
    return null;
  }
   if (Tone.context.state !== 'running') {
    console.warn(`${logPrefix}_WARN] Global Tone.context is NOT 'running' (state: ${Tone.context.state}). This function expects Tone.start() to have been called via user gesture.`);
    // Forcing Tone.start() here is risky as it might not be a direct user gesture.
    // The calling component (MusicOutputDisplay) should handle Tone.start().
    return null;
  }

  Tone.Transport.stop(true); Tone.Transport.cancel(0);
  Tone.Destination.volume.value = 0; // Render offline, volume controlled by synth settings
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

  // Use consolidated synth configurations
  const activeSynthConfigs = getSynthConfigurationsFromSoundDesign(params.instrumentHints, params.selectedGenre, isKidsMode, harmonicComplexity, rhythmicDensity);

  const startOffset = 0.1; // Small delay before music starts
  const secondsPerBeat = 60 / (Tone.Transport.bpm.value);
  const beatsPerMeasure = 4; // Assuming 4/4
  const measureDurationSeconds = beatsPerMeasure * secondsPerBeat;
  let overallMaxTime = startOffset;

  // --- Simplified Music Generation Logic (consistent with midiService) ---
  // This section mirrors the structure from midiService for note/chord/rhythm generation
  // but uses Tone.js scheduling instead of MIDI events.

    const progressionDegreesInput = params.originalInput.mode === 'kids' ? [1, 4, 5, 1] :
                                (genreLower.includes("blues") ? [1,1,4,1,5,4,1,1] : // Common 12-bar blues (simplified to 8 bars here)
                                (genreLower.includes("jazz") ? [2,5,1,6] : // ii-V-I-vi turnaround
                                 [1, 5, 6, 4])); // Common pop/rock: I-V-vi-IV
    const numChordCycles = isKidsMode ? 2 : (genreLower.includes("ambient") ? 3 : (genreLower.includes("blues") ? 1 : 4)); // Blues typically has a fixed form
    const totalChordProgressionSeconds = numChordCycles * progressionDegreesInput.length * measureDurationSeconds;


  // Melody Generation
  const melodyNotesToSchedule: { time: number, note: string, duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const melodyOctave = isKidsMode ? 4 : (genreLower.includes("jazz") || genreLower.includes("classical") ? 5 : 4);
  // Use consolidated music theory functions
  const scaleNoteNames = getScaleNoteNamesFromTheory(params.keySignature, params.mode, melodyOctave, params.selectedGenre, harmonicComplexity);
  let melodyCurrentTime = startOffset;
  let lastMelodyEventTime = -TIME_EPSILON;
  let lastMelodyNoteMidi = -1; // Store MIDI for step logic
  let melodyNoteCounter = 0;

  if (scaleNoteNames.length > 0) {
      let currentMelodyScaleIndex = Math.floor(Math.random() * scaleNoteNames.length);
      if(scaleNoteNames[currentMelodyScaleIndex]) lastMelodyNoteMidi = robustNoteToMidi(scaleNoteNames[currentMelodyScaleIndex]);

      while (melodyCurrentTime < totalChordProgressionSeconds - TIME_EPSILON) {
          let noteDurationNotation: string;
          const arousalFactor = (targetArousal + 1) / 2; // Normalize arousal to 0-1 range

          // Determine note duration based on mode, density, and arousal
          if (isKidsMode) {
            noteDurationNotation = weightedRandom(["4n", "2n", "8n"], [0.6, 0.3, 0.1]) as string;
          } else if (rhythmicDensity < 0.33) { // Low density
            noteDurationNotation = weightedRandom(["1m", "2n", "4n"], [0.1 + arousalFactor*0.1, 0.5, 0.4 - arousalFactor*0.1]) as string;
          } else if (rhythmicDensity < 0.66) { // Medium density
            noteDurationNotation = weightedRandom(["2n", "4n", "8n"], [0.1, 0.6, 0.3 + arousalFactor*0.05]) as string;
          } else { // High density
            noteDurationNotation = weightedRandom(["4n", "8n", "16n"], [0.4, 0.5 + arousalFactor*0.1, 0.1 - arousalFactor*0.05]) as string;
          }

          let noteDurationSec = Tone.Time(noteDurationNotation).toSeconds();

          // Ensure note doesn't exceed total duration
          if (melodyCurrentTime + noteDurationSec > totalChordProgressionSeconds + TIME_EPSILON) {
              noteDurationSec = totalChordProgressionSeconds - melodyCurrentTime;
              if (noteDurationSec <= TIME_EPSILON * 5) break; // Too short to play
              // Find closest valid Tone.js duration string
              if (noteDurationSec >= Tone.Time("1m").toSeconds() - TIME_EPSILON) noteDurationNotation = "1m";
              else if (noteDurationSec >= Tone.Time("2n").toSeconds() - TIME_EPSILON) noteDurationNotation = "2n";
              else if (noteDurationSec >= Tone.Time("4n").toSeconds() - TIME_EPSILON) noteDurationNotation = "4n";
              else if (noteDurationSec >= Tone.Time("8n").toSeconds() - TIME_EPSILON) noteDurationNotation = "8n";
              else if (noteDurationSec >= Tone.Time("16n").toSeconds() - TIME_EPSILON) noteDurationNotation = "16n";
              else break; // Fallback if too short for any standard notation
              noteDurationSec = Tone.Time(noteDurationNotation).toSeconds(); // Recalculate duration in seconds
          }
           if (melodyCurrentTime >= totalChordProgressionSeconds - TIME_EPSILON) break;


          melodyNoteCounter++;
          // Determine rest probability
          const restProbabilityBase = isKidsMode ? 0.20 : 0.15;
          const phraseEndRestProb = isKidsMode ? 0.30 : 0.25; // Higher chance of rest at phrase end
          const restProbability = (melodyNoteCounter % (isKidsMode ? 3 : 4) === 0) ? phraseEndRestProb : (restProbabilityBase - (rhythmicDensity * 0.10) - arousalFactor * 0.03);


          // Add rests
          if (Math.random() < restProbability && melodyCurrentTime > startOffset + secondsPerBeat * 0.5 && melodyNotesToSchedule.length > 0) { // Don't start with a rest, ensure some notes played
              let restDurNotation = rhythmicDensity < 0.5 ? "8n" : "16n";
              if (noteDurationNotation === "2n" || noteDurationNotation === "1m") restDurNotation = "4n"; // Longer rest for longer preceding notes
              const restDurSec = Tone.Time(restDurNotation).toSeconds();
              if (melodyCurrentTime + restDurSec <= totalChordProgressionSeconds + TIME_EPSILON) {
                  melodyCurrentTime += restDurSec;
                  melodyNoteCounter = 0; // Reset phrase counter after rest
                  if (melodyCurrentTime >= totalChordProgressionSeconds - TIME_EPSILON) break;
                  continue;
              }
          }

          // Select next note
          const currentChordDegree = progressionDegreesInput[Math.floor(melodyCurrentTime / measureDurationSeconds) % progressionDegreesInput.length];
          const chordNotesForMelody = getChordNotesForKeyFromTheory(params.keySignature, params.mode, currentChordDegree, melodyOctave, harmonicComplexity > 0.5, params.selectedGenre, harmonicComplexity)
                                       .map(n => robustNoteToMidi(n)); // Convert to MIDI for easier comparison

          let nextNoteMidi;
          const preferChordTone = Math.random() < (isKidsMode ? 0.60 : 0.70); // Higher chance of chord tones
          const preferStepwise = Math.random() < (isKidsMode ? 0.70 : 0.80); // Higher chance of stepwise motion

          if (preferChordTone && chordNotesForMelody.length > 0 && (melodyNoteCounter % 2 === 1 || isKidsMode)) { // Emphasize chord tones on strong beats
              nextNoteMidi = chordNotesForMelody[Math.floor(Math.random() * chordNotesForMelody.length)];
          } else if (preferStepwise && lastMelodyNoteMidi !== -1) { // Try stepwise motion
              const possibleSteps = [-2, -1, 1, 2]; // Semitones for steps
              const nextStep = possibleSteps[Math.floor(Math.random() * possibleSteps.length)];
              let candidateNote = lastMelodyNoteMidi + nextStep;
              // Ensure candidate is within scale if possible
              const scaleMidiNotes = scaleNoteNames.map(n => robustNoteToMidi(n));
              if (!scaleMidiNotes.includes(candidateNote) && scaleMidiNotes.length > 0) { // Snap to closest scale tone if off-scale
                  nextNoteMidi = scaleMidiNotes.reduce((prev, curr) => (Math.abs(curr - candidateNote) < Math.abs(prev - candidateNote) ? curr : prev));
              } else {
                  nextNoteMidi = candidateNote;
              }
          } else { // Otherwise, jump within the scale
              currentMelodyScaleIndex = (currentMelodyScaleIndex + (Math.random() < 0.6 ? (Math.random() < 0.5 ? 1 : -1) : (Math.random() < 0.5 ? 2 : -2)) + scaleNoteNames.length) % scaleNoteNames.length;
              if(scaleNoteNames[currentMelodyScaleIndex]) nextNoteMidi = robustNoteToMidi(scaleNoteNames[currentMelodyScaleIndex]);
              else nextNoteMidi = DEFAULT_MIDI_NOTE; // Fallback
          }
          nextNoteMidi = Math.max(21, Math.min(108, nextNoteMidi || DEFAULT_MIDI_NOTE)); // Clamp to MIDI range
          lastMelodyNoteMidi = nextNoteMidi;

          const noteName = midiToNoteName(nextNoteMidi);
          // Calculate velocity
          const baseVelMelody = isKidsMode ? 0.50 : 0.55;
          const velocity = Math.min(0.9, Math.max(0.15, baseVelMelody + (targetArousal * 0.18) + (targetValence * 0.04) + (Math.random() * 0.12 - 0.06) + (melodyNoteCounter === 1 ? 0.04 : 0) ));


          let newTime = applyHumanization(melodyCurrentTime, 0.008); // Add humanization
          if (newTime <= lastMelodyEventTime) newTime = lastMelodyEventTime + TIME_EPSILON; // Ensure time increases
          if (newTime >= totalChordProgressionSeconds - TIME_EPSILON) break;


          melodyNotesToSchedule.push({ time: newTime, note: noteName, duration: noteDurationNotation, velocity, filterAttack: true });
          lastMelodyEventTime = newTime;
          overallMaxTime = Math.max(overallMaxTime, newTime + noteDurationSec);
          melodyCurrentTime = newTime + noteDurationSec;
      }
  }
  console.log(`${logPrefix} Generated ${melodyNotesToSchedule.length} melody notes. Melody time: ${melodyCurrentTime.toFixed(2)}s`);

  // Bass Line Generation
  const bassNotesToSchedule: { time: number, note: string, duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const bassOctave = isKidsMode ? 2 : (genreLower.includes("jazz") || genreLower.includes("funk") ? 2 : (genreLower.includes("rock") || genreLower.includes("metal") ? 1 : 2));
  let lastBassEventTime = -TIME_EPSILON;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegreesInput.length; i++) {
        const degree = progressionDegreesInput[i];
        const currentMeasureStartTime = startOffset + (cycle * progressionDegreesInput.length * measureDurationSeconds) + (i * measureDurationSeconds);
        // Use consolidated music theory functions
        const chordNotesForBass = getChordNotesForKeyFromTheory(params.keySignature, params.mode, degree, bassOctave, harmonicComplexity > 0.5, params.selectedGenre, harmonicComplexity);
        const rootNote = chordNotesForBass[0] || midiToNoteName(DEFAULT_MIDI_NOTE + (bassOctave -4)*12);
        const fifthNote = chordNotesForBass[2 % chordNotesForBass.length] || rootNote;
        const thirdNote = chordNotesForBass[1 % chordNotesForBass.length] || rootNote;
        const scaleForWalk = getScaleNoteNamesFromTheory(params.keySignature, params.mode, bassOctave, params.selectedGenre, harmonicComplexity);

        const baseVelBass = (isKidsMode ? 0.45 : 0.55) + (targetArousal * 0.12);

        if (isKidsMode) {
            let time = applyHumanization(currentMeasureStartTime, 0.01);
            if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
            bassNotesToSchedule.push({ time, note: rootNote, duration: "2n", velocity: Math.min(0.70, baseVelBass + 0.1), filterAttack:true });
            lastBassEventTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + Tone.Time("2n").toSeconds());
        } else if (genreLower.includes("jazz")) { // Walking bass
            let currentWalkNoteMidi = robustNoteToMidi(rootNote);
            for (let beat = 0; beat < beatsPerMeasure; beat++) {
                let time = applyHumanization(currentMeasureStartTime + beat * secondsPerBeat, 0.02);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: midiToNoteName(currentWalkNoteMidi), duration: "4n", velocity: Math.min(0.70, baseVelBass + (beat === 0 ? 0.04 : -0.04) + Math.random()*0.03), filterAttack: beat % 2 === 0 });
                lastBassEventTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat);
                // Simple walking logic: aim for next chord tone or scale tone
                const targetNotesMidi = beat < 2 ? [robustNoteToMidi(thirdNote), robustNoteToMidi(fifthNote)] : [robustNoteToMidi(fifthNote), robustNoteToMidi(rootNote) + (Math.random() < 0.3 ? 7 : 0)]; // Aim for root of next (or same) chord
                let closestDist = Infinity;
                let nextNoteMidi = currentWalkNoteMidi;
                [...targetNotesMidi, ...scaleForWalk.map(n => robustNoteToMidi(n))].forEach(tnMidi => {
                    if (tnMidi === currentWalkNoteMidi) return; // Don't stay on same note if options exist
                    const dist = Math.abs(tnMidi - currentWalkNoteMidi);
                    if (dist < closestDist && dist <=4 ) { // Prefer smaller steps (up to a major third)
                        closestDist = dist;
                        nextNoteMidi = tnMidi;
                    }
                });
                currentWalkNoteMidi = nextNoteMidi;
            }
        } else if (genreLower.includes("funk") || genreLower.includes("soul")) { // Funk/Soul syncopated bass
            const pattern = [ // timeOffset is in beats from measure start
                { note: rootNote, timeOffset: 0, duration: "8n", accent: true }, { rest: true, timeOffset: 0.5, duration: "16n" },
                { note: rootNote, timeOffset: 0.75, duration: "16n", accent: false }, { note: fifthNote, timeOffset: 1.5, duration: "8n", accent: false },
                { rest: true, timeOffset: 2.0, duration: "16n"}, { note: rootNote, timeOffset: 2.25, duration: "16n", accent: true },
                { note: thirdNote, timeOffset: 3.0, duration: "8n", accent: false }, { note: fifthNote, timeOffset: 3.5, duration: "8n", accent: false},
            ];
            pattern.forEach(p => {
                if (p.rest) return;
                let time = applyHumanization(currentMeasureStartTime + p.timeOffset * secondsPerBeat, 0.015);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: p.note as string, duration: p.duration, velocity: Math.min(0.75, baseVelBass + (p.accent ? 0.08 : 0) + Math.random()*0.04), filterAttack: p.accent });
                lastBassEventTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(p.duration).toSeconds());
            });
        } else if (genreLower.includes("electronic") && rhythmicDensity > 0.3) { // Straight 8ths or 16ths for electronic
            const subdivisions = rhythmicDensity > 0.65 ? 4 : 2; // 16ths or 8ths
            const noteDur = subdivisions === 4 ? "16n" : "8n";
            for (let beat = 0; beat < beatsPerMeasure * subdivisions; beat++) {
                 let time = applyHumanization(currentMeasureStartTime + beat * (secondsPerBeat / subdivisions), 0.005);
                 if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                 bassNotesToSchedule.push({ time, note: rootNote, duration: noteDur, velocity: Math.min(0.70, baseVelBass + (beat % subdivisions === 0 ? 0.04 : 0)), filterAttack: beat % subdivisions === 0 });
                 lastBassEventTime = time;
                 overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat/subdivisions);
            }
        }
        else { // Default: on-beat quarter notes
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

  // Chords / Pads
  const chordEventsToSchedule: { time: number, notes: string[], duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const chordOctave = isKidsMode ? 3 : (genreLower.includes("jazz") || genreLower.includes("classical") ? 4 : 3);
  let lastChordEventTime = -TIME_EPSILON;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegreesInput.length; i++) {
      const degree = progressionDegreesInput[i];
      const currentMeasureStartTime = startOffset + (cycle * progressionDegreesInput.length * measureDurationSeconds) + (i * measureDurationSeconds);
      const addSeventhForChord = !isKidsMode && (harmonicComplexity > 0.5 || genreLower.includes("jazz"));
      // Use consolidated music theory functions
      const chordNoteNames = getChordNotesForKeyFromTheory(params.keySignature, params.mode, degree, chordOctave, addSeventhForChord, params.selectedGenre, harmonicComplexity);

      const baseVelChord = (isKidsMode ? 0.25 : 0.35) + (targetArousal * 0.10) + (targetValence * 0.04);

      if (chordNoteNames.length > 0) {
          if (isKidsMode || genreLower.includes("ambient") || genreLower.includes("classical")) { // Sustained chords
            let time = applyHumanization(currentMeasureStartTime, 0.01);
            if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
            chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: "1m", velocity: Math.min(0.55, baseVelChord), filterAttack:true });
            lastChordEventTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + measureDurationSeconds);
          } else if (genreLower.includes("funk") || genreLower.includes("reggae") || (genreLower.includes("electronic") && rhythmicDensity > 0.6)) { // Stabs
              const numStabs = rhythmicDensity > 0.6 ? (genreLower.includes("reggae") ? 2 : 4) : 2; // Reggae often on 2 & 4
              const stabDuration = numStabs === 4 ? "16n" : (genreLower.includes("reggae") ? "4n" : "8n");
              for(let s=0; s < numStabs; s++) {
                  let timeOffset = s * (measureDurationSeconds / numStabs);
                  if (genreLower.includes("reggae")) timeOffset = (s * 2 + 1) * (secondsPerBeat); // Offbeats for reggae
                  let time = applyHumanization(currentMeasureStartTime + timeOffset, 0.015);
                  if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;

                  chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: stabDuration, velocity: Math.min(0.60, baseVelChord + 0.08 + Math.random()*0.04), filterAttack: s % 2 === 0 });
                  lastChordEventTime = time;
                  overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(stabDuration).toSeconds());
                  if (genreLower.includes("reggae") && s >=1) break; // Only two stabs for reggae example
              }
          } else if (genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("country")){ // Strumming
              const strumPattern = rhythmicDensity > 0.55 ? ["0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5"] : ["0", "1", "2", "3"]; // 8ths or Quarters
              const strumDur = rhythmicDensity > 0.55 ? "8n" : "4n";
              strumPattern.forEach(beatOffsetStr => {
                  let time = applyHumanization(currentMeasureStartTime + parseFloat(beatOffsetStr) * secondsPerBeat, 0.01);
                  if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
                  chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: strumDur, velocity: Math.min(0.55, baseVelChord + (beatOffsetStr === "0" ? 0.04 : 0) + Math.random()*0.02), filterAttack: beatOffsetStr === "0" });
                  lastChordEventTime = time;
                  overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(strumDur).toSeconds());
              });
          } else { // Default: sustained chord for the measure
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

  // Arpeggio
  const arpeggioNotesToSchedule: { time: number, note: string, duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const arpeggioOctave = isKidsMode ? 4 : (harmonicComplexity > 0.3 ? 4 : 3);
  let lastArpEventTime = -TIME_EPSILON;

  const playArp = !isKidsMode || (isKidsMode && harmonicComplexity > 0.1 && rhythmicDensity > 0.05);
  if (playArp && (genreLower.includes("electronic") || genreLower.includes("pop") || genreLower.includes("ambient") || genreLower.includes("classical") || isKidsMode || harmonicComplexity > 0.4)) {
    chordEventsToSchedule.forEach(chordEvent => {
        // Use consolidated music theory functions
        const currentChordNotesForArp = chordEvent.notes.map(n => midiToNoteName(robustNoteToMidi(n.replace(/[0-9]+$/, String(arpeggioOctave)))));
        if (currentChordNotesForArp.length > 0) {
            const arpPattern = [0, 1, 2, 1]; // Simple arp: Root, 3rd, 5th, 3rd
            if (genreLower.includes("classical")) arpPattern.push(0, 2, 1, 2); // Longer for classical

            const arpNoteDurationNotation = (rhythmicDensity > 0.4 || genreLower.includes("electronic")) ? "16n" : "8n";
            const arpNoteDurationSeconds = Tone.Time(arpNoteDurationNotation).toSeconds();
            const notesPerBeatForArp = arpNoteDurationNotation === "16n" ? 4 : 2;
            const beatsToArpeggiate = isKidsMode ? (rhythmicDensity > 0.1 ? 1:0) : (rhythmicDensity > 0.2 && harmonicComplexity > 0.2 ? (genreLower.includes("ambient") ? beatsPerMeasure : 2) : (harmonicComplexity > 0.5 ? 1 : 0));


            for (let beat = 0; beat < beatsToArpeggiate; beat++) {
                for (let i = 0; i < notesPerBeatForArp; i++) {
                    let time = applyHumanization(chordEvent.time + (beat * secondsPerBeat) + (i * arpNoteDurationSeconds), 0.003);
                     // Ensure arp note doesn't extend beyond chord duration significantly
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

  // Drums
  const drumEventsToSchedule: { synth: 'kick' | 'snare' | 'hiHat' | 'tambourine', time: number, duration: string, velocity: number, pitch?: string | number }[] = [];
  const numDrumMeasures = numChordCycles * progressionDegreesInput.length;
  const humanizeAmountDrums = 0.008;
  let lastDrumTimes = { kick: -TIME_EPSILON, snare: -TIME_EPSILON, hiHat: -TIME_EPSILON, tambourine: -TIME_EPSILON }; // For avoiding simultaneous drum hits


  for (let measure = 0; measure < numDrumMeasures; measure++) {
    const baseVelDrum = (isKidsMode ? 0.50 : 0.60) + (targetArousal * 0.18);
    for (let beat = 0; beat < beatsPerMeasure; beat++) {
      const beatStartTime = startOffset + (measure * measureDurationSeconds) + (beat * secondsPerBeat);

      // Kick drum
      let addKick = false; let kickTime = beatStartTime;
      if (isKidsMode) { addKick = beat === 0; // Simple kick on 1 for kids
      } else if (genreLower.includes("electronic") || genreLower.includes("house") || genreLower.includes("techno")) { addKick = true; // Four on the floor
      } else if (genreLower.includes("funk") || genreLower.includes("soul")) { addKick = (beat === 0) || (beat === 2 && Math.random() < 0.6) || (Math.random() < rhythmicDensity * 0.35); // Syncopated
          if(addKick && beat > 0) kickTime = beatStartTime + (Math.random() < 0.5 ? -secondsPerBeat*0.25 : secondsPerBeat*0.25) * (Math.random()*0.5); // Slight push/pull
      } else { addKick = beat === 0 || beat === 2; // Standard rock/pop
      }
      if (addKick) {
        let time = applyHumanization(kickTime, humanizeAmountDrums);
        if (time <= lastDrumTimes.kick) time = lastDrumTimes.kick + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'kick', time, duration: "8n", velocity: Math.min(0.90, baseVelDrum + 0.18), pitch: "C2" });
        lastDrumTimes.kick = time;
      }

      // Snare drum
      let addSnare = false; let snareTime = beatStartTime;
      if (isKidsMode) { addSnare = activeSynthConfigs.tambourine ? false : beat === 2; // Snare on 3 if no tambourine
      } else if (genreLower.includes("electronic") || genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("funk") || genreLower.includes("soul") || genreLower.includes("country")) { addSnare = beat === 1 || beat === 3; // Standard backbeat
      } else if (genreLower.includes("jazz")) { addSnare = (beat === 1 || beat === 3) && Math.random() < 0.25; // Occasional snare, light
      } else if (genreLower.includes("reggae")) { addSnare = beat === 2; } // One drop
      if (addSnare) {
        let time = applyHumanization(snareTime, humanizeAmountDrums * 1.2); // Slightly more humanization for snare
        if (time <= lastDrumTimes.snare) time = lastDrumTimes.snare + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'snare', time, duration: "16n", velocity: Math.min(0.85, baseVelDrum + 0.08), pitch: "D2" });
        lastDrumTimes.snare = time;
      }

      // Tambourine for kids mode if applicable
      if (isKidsMode && activeSynthConfigs.tambourine && (beat === 1 || beat === 3)) {
         let time = applyHumanization(beatStartTime, humanizeAmountDrums);
         if (time <= lastDrumTimes.tambourine) time = lastDrumTimes.tambourine + TIME_EPSILON;
         drumEventsToSchedule.push({synth: 'tambourine', time, duration: "8n", velocity: Math.min(0.65, baseVelDrum - 0.06)});
         lastDrumTimes.tambourine = time;
      }

      // Hi-hat / Ride
      let hiHatSubdivisions = 0;
      if (isKidsMode) { hiHatSubdivisions = rhythmicDensity > 0.3 ? 1 : 0; // Simple hi-hat for kids if somewhat dense
      } else if (genreLower.includes("jazz") || genreLower.includes("swing") || (genreLower.includes("blues") && rhythmicDensity > 0.3)) { hiHatSubdivisions = 3; // Triplets for swing feel
      } else if (genreLower.includes("funk") || genreLower.includes("soul") || (genreLower.includes("electronic") && rhythmicDensity > 0.55)) { hiHatSubdivisions = 4; // 16ths
      } else if (rhythmicDensity > 0.15) { hiHatSubdivisions = 2; // 8ths
      }

      if (hiHatSubdivisions > 0) {
        const hiHatNoteDuration = hiHatSubdivisions === 1 ? "4n" : hiHatSubdivisions === 2 ? "8n" : hiHatSubdivisions === 3 ? "8t" : "16n";
        for (let subBeat = 0; subBeat < hiHatSubdivisions; subBeat++) {
          let time = applyHumanization(beatStartTime + (subBeat * (secondsPerBeat / hiHatSubdivisions)), humanizeAmountDrums * 0.5);
           // Apply swing manually for triplets if Tone.Transport.swing isn't directly used in Offline scheduling
           if (Tone.Transport.swing > 0 && hiHatSubdivisions === 2 && subBeat === 1) time += Tone.Transport.swing * (secondsPerBeat/2) * 0.5; // Approximate swing for 8ths
           if (Tone.Transport.swing > 0 && hiHatSubdivisions === 3 && subBeat > 0) time += Tone.Transport.swing * (secondsPerBeat/3) * (subBeat === 1 ? 0.33 : 0.66) * 0.5; // Approximate swing for triplets


          if (time <= lastDrumTimes.hiHat) time = lastDrumTimes.hiHat + TIME_EPSILON;

          const hiHatPitchForToneJS = activeSynthConfigs.hiHat.frequency || 400; // Use configured freq or default
          const hiHatVelocity = Math.min(0.55, (baseVelDrum * 0.45) + (Math.random() * 0.08) - (subBeat % 2 === 1 && hiHatSubdivisions > 1 ? 0.04:0) ); // Accent downbeats/stronger parts


          // Occasional open hi-hat for variation in non-kids/jazz/classical
          if (!isKidsMode && !genreLower.includes("jazz") && !genreLower.includes("classical") && hiHatSubdivisions >= 2 && subBeat === hiHatSubdivisions -1 && Math.random() < 0.15) { // Last sub-beat, chance for open
              drumEventsToSchedule.push({ synth: 'hiHat', time, duration: "8n", velocity: hiHatVelocity + 0.08, pitch: hiHatPitchForToneJS + 100 }); // Slightly different pitch for "open"
          } else {
              drumEventsToSchedule.push({ synth: 'hiHat', time, duration: hiHatNoteDuration, velocity: hiHatVelocity, pitch: hiHatPitchForToneJS });
          }
          lastDrumTimes.hiHat = time;
        }
      }
    }
    // Simple drum fill logic (example)
    const humanizeAmount = 0.01;
    if (!isKidsMode && (measure + 1) % 4 === 0 && measure < numDrumMeasures -1 && rhythmicDensity > 0.5 && (genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("funk"))){
        const fillStartTime = startOffset + ((measure + 1) * measureDurationSeconds) - secondsPerBeat; // Last beat of the measure
        for(let f=0; f<4; f++){ // 4 16th notes snare fill
            let time = applyHumanization(fillStartTime + f * (secondsPerBeat/4), humanizeAmount*0.8);
            if (time <= lastDrumTimes.snare) time = lastDrumTimes.snare + TIME_EPSILON;
            drumEventsToSchedule.push({synth: 'snare', time, duration: "16n", velocity: Math.min(0.85, baseVelDrum + 0.15 + Math.random()*0.05), pitch: "D2"});
            lastDrumTimes.snare = time;
        }
    }
  }
  drumEventsToSchedule.forEach(ev => { overallMaxTime = Math.max(overallMaxTime, ev.time + Tone.Time(ev.duration).toSeconds()); });
  console.log(`${logPrefix} Generated ${drumEventsToSchedule.length} drum events.`);


  // Determine render duration, capped at MAX_WAV_RENDER_DURATION_SECONDS
  const calculatedRenderDuration = Math.max(MIN_EFFECTIVE_DURATION_SECONDS, overallMaxTime + 3.0); // Add ~3s tail
  const renderDuration = Math.min(calculatedRenderDuration, MAX_WAV_RENDER_DURATION_SECONDS);
  console.log(`${logPrefix} Overall max event time: ${overallMaxTime.toFixed(2)}s. Calculated render duration: ${calculatedRenderDuration.toFixed(2)}s. Final render duration (capped): ${renderDuration.toFixed(2)}s.`);


  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log(`${logPrefix}_OFFLINE] Inside Tone.Offline. Offline Context SR: ${offlineContext.sampleRate}`);
      // Apply transport settings to offline context
      offlineContext.transport.bpm.value = Tone.Transport.bpm.value;
      if (Tone.Transport.swing > 0) {
          offlineContext.transport.swing = Tone.Transport.swing;
          offlineContext.transport.swingSubdivision = Tone.Transport.swingSubdivision;
      }

      // Master effects
      const masterReverb = new Tone.Reverb(isKidsMode ? 0.7 : 1.5).toDestination(); // slightly reduced reverb
      masterReverb.wet.value = isKidsMode ? 0.12 : 0.22; // slightly reduced wetness
      await masterReverb.ready; // Ensure reverb is ready before connecting
      console.log(`${logPrefix}_OFFLINE] Master Reverb created. Wet: ${masterReverb.wet.value}`);

      // Create synths using consolidated sound design functions
      const { instrument: melodySynth, outputNodeToConnect: melodyOutput, filterEnv: melodyFilterEnv } = createSynthFromSoundDesign(activeSynthConfigs.melody, offlineContext);
      melodyOutput.connect(masterReverb);

      const { instrument: bassSynth, outputNodeToConnect: bassOutput, filterEnv: bassFilterEnv } = createSynthFromSoundDesign(activeSynthConfigs.bass, offlineContext);
      bassOutput.toDestination(); // Bass usually dry or with specific effects

      const { instrument: chordSynth, outputNodeToConnect: chordOutput, filterEnv: chordFilterEnv } = createSynthFromSoundDesign(activeSynthConfigs.chords, offlineContext);
      chordOutput.connect(masterReverb);

      let arpeggioSynth: Tone.Instrument | undefined;
      let arpeggioFilterEnv: Tone.FrequencyEnvelope | undefined; // For filter envelopes on arps

      if (arpeggioNotesToSchedule.length > 0 && activeSynthConfigs.arpeggio) {
        const arpSynthSetup = createSynthFromSoundDesign(activeSynthConfigs.arpeggio, offlineContext);
        arpeggioSynth = arpSynthSetup.instrument;
        arpeggioFilterEnv = arpSynthSetup.filterEnv;
        arpSynthSetup.outputNodeToConnect.connect(masterReverb);
      }
      console.log(`${logPrefix}_OFFLINE] Melodic/Harmonic Synths created and connected.`);

      // Schedule melodic and harmonic parts
      melodyNotesToSchedule.forEach((ev) => {
        (melodySynth as any).triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity);
        if (melodyFilterEnv && ev.filterAttack) melodyFilterEnv.triggerAttackRelease(ev.duration, ev.time);
      });
      bassNotesToSchedule.forEach((ev) => {
        (bassSynth as any).triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity);
        if (bassFilterEnv && ev.filterAttack) bassFilterEnv.triggerAttackRelease(ev.duration, ev.time);
      });
      chordEventsToSchedule.forEach((ev) => {
        (chordSynth as any).triggerAttackRelease(ev.notes, ev.duration, ev.time, ev.velocity);
        if (chordFilterEnv && ev.filterAttack) chordFilterEnv.triggerAttackRelease(ev.duration, ev.time);
      });
      if (arpeggioSynth) {
        arpeggioNotesToSchedule.forEach((ev) => {
            (arpeggioSynth as any).triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity);
             if (arpeggioFilterEnv && ev.filterAttack) arpeggioFilterEnv.triggerAttackRelease(ev.duration, ev.time);
        });
      }

      // Drum Synths (Directly using Tone.js drum synths for simplicity)
      console.log(`${logPrefix}_OFFLINE] Setting up drum synths.`);
      const kickSynth = new Tone.MembraneSynth(activeSynthConfigs.kick).toDestination();
      const snareSynth = new Tone.NoiseSynth(activeSynthConfigs.snare).toDestination();
      const hiHatSynth = new Tone.MetalSynth(activeSynthConfigs.hiHat).toDestination();
      let tambourineSynth;
      if (activeSynthConfigs.tambourine) {
        tambourineSynth = new Tone.NoiseSynth(activeSynthConfigs.tambourine).toDestination();
      }
      console.log(`${logPrefix}_OFFLINE] Drum synths created.`);

      // Schedule drum events
      drumEventsToSchedule.forEach(ev => {
        const { synth, time, duration, velocity, pitch } = ev;
        if (synth === 'kick') {
          kickSynth.triggerAttackRelease(pitch as string || "C2", duration, time, velocity);
        } else if (synth === 'snare') {
          snareSynth.triggerAttackRelease(duration, time, velocity);
        } else if (synth === 'hiHat') {
          // MetalSynth uses frequency for pitch
          hiHatSynth.triggerAttackRelease(pitch as string | number, duration, time, velocity);
        } else if (synth === 'tambourine' && tambourineSynth) {
            tambourineSynth.triggerAttackRelease(duration, time, velocity);
        }
      });
      console.log(`${logPrefix}_OFFLINE] All events scheduled for offline rendering.`);

    }, renderDuration);

    console.log(`${logPrefix} Tone.Offline rendering complete. AudioBuffer duration: ${audioBuffer.duration.toFixed(3)}s`);
    // Basic check if audio is silent
    let isSilent = true; let maxVal = 0;
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      const channelData = audioBuffer.getChannelData(i);
      for (let j = 0; j < channelData.length; j++) {
        if (Math.abs(channelData[j]) > 1e-5) { isSilent = false; } // Threshold for silence
        if (Math.abs(channelData[j]) > maxVal) { maxVal = Math.abs(channelData[j]); }
      }
    }
    if (isSilent) console.warn(`${logPrefix}_WARN] Rendered AudioBuffer appears to be silent or very quiet. Max sample value: ${maxVal.toExponential(3)}`);
    else console.log(`${logPrefix} Rendered AudioBuffer contains non-zero samples. Max sample value: ${maxVal.toExponential(3)}`);

    const wavDataBuffer = audioBufferToWav(audioBuffer); // Convert AudioBuffer to WAV ArrayBuffer
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
