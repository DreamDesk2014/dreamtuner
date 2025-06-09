
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
} from './musicTheory';
import {
    getSynthConfigurations as getSynthConfigurationsFromSoundDesign,
    createSynth as createSynthFromSoundDesign, // This will now be async
    type InstrumentOutput
} from './soundDesign';
// Firebase imports are not needed in this step as we use hardcoded samples
// import { getAllFirebaseSampleInstruments, getFirebaseSampleInstrumentById } from './firestoreService';
// import type { FirebaseSampleInstrument } from '@/types';


// Constants
const MIN_EFFECTIVE_DURATION_SECONDS = 5.0;
const MAX_WAV_RENDER_DURATION_SECONDS = 15.0;
const TIME_EPSILON = 0.00001;

// --- Utility Functions ---
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
  const logPrefix = "[WAV_GEN_SAMPLER_V0.1]";
  console.log(`${logPrefix} Starting synthesis for: ${params.generatedIdea ? params.generatedIdea.substring(0, 30) : "Untitled"}...`);

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
  const { harmonicComplexity = 0.3, rhythmicDensity = 0.5, targetArousal = 0, targetValence = 0, instrumentHints = [] } = params;

  if (genreLower.includes("jazz") || genreLower.includes("swing") || (genreLower.includes("blues") && rhythmicDensity > 0.4)) {
    Tone.Transport.swing = 0.20;
    Tone.Transport.swingSubdivision = "8n";
  } else {
    Tone.Transport.swing = 0;
  }
  console.log(`${logPrefix} Transport BPM: ${Tone.Transport.bpm.value}, Swing: ${Tone.Transport.swing}`);

  const activeSynthConfigs = getSynthConfigurationsFromSoundDesign(instrumentHints, params.selectedGenre, isKidsMode, harmonicComplexity, rhythmicDensity);

  const startOffset = 0.1;
  const secondsPerBeat = 60 / (Tone.Transport.bpm.value);
  const beatsPerMeasure = 4;
  const measureDurationSeconds = beatsPerMeasure * secondsPerBeat;
  let overallMaxTime = startOffset;

  const progressionDegreesInput = params.originalInput.mode === 'kids' ? [1, 4, 5, 1] :
                                (genreLower.includes("blues") ? [1,1,4,1,5,4,1,1] :
                                (genreLower.includes("jazz") ? [2,5,1,6] :
                                 [1, 5, 6, 4]));
    const numChordCycles = isKidsMode ? 2 : (genreLower.includes("ambient") ? 3 : (genreLower.includes("blues") ? 1 : 4));
    const totalChordProgressionSeconds = numChordCycles * progressionDegreesInput.length * measureDurationSeconds;

  // --- Pre-load all instruments (synths and potential samplers) ---
  console.log(`${logPrefix} Pre-loading instruments...`);
  let melodyInstrumentSetup: InstrumentOutput;
  let bassInstrumentSetup: InstrumentOutput;
  let chordInstrumentSetup: InstrumentOutput;
  let arpInstrumentSetup: InstrumentOutput | null = null;

  // For melody, pass a specific hint if we want to try the sampler
  const melodySpecificHints = [...instrumentHints];
  if (instrumentHints.some(h => h.toLowerCase().includes("piano"))) { // Example condition to use sampled piano
      melodySpecificHints.push("use_sampled_piano"); // This will be caught by createSynth
  }

  try {
    melodyInstrumentSetup = await createSynthFromSoundDesign(activeSynthConfigs.melody, undefined, "use_sampled_piano"); // Pass hint for sampler
    bassInstrumentSetup = await createSynthFromSoundDesign(activeSynthConfigs.bass);
    chordInstrumentSetup = await createSynthFromSoundDesign(activeSynthConfigs.chords);
    if (activeSynthConfigs.arpeggio) {
        arpInstrumentSetup = await createSynthFromSoundDesign(activeSynthConfigs.arpeggio);
    }
  } catch (loadError) {
    console.error(`${logPrefix}_ERROR] Critical error pre-loading an instrument:`, loadError);
    return null; // Abort if essential instruments can't be prepared
  }
  console.log(`${logPrefix} All instruments pre-loaded/created.`);


  // Melody Generation (copied from previous state, ensure it's compatible)
  const melodyNotesToSchedule: { time: number, note: string, duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const melodyOctave = isKidsMode ? 4 : (genreLower.includes("jazz") || genreLower.includes("classical") ? 5 : 4);
  const scaleNoteNames = getScaleNoteNamesFromTheory(params.keySignature, params.mode, melodyOctave, params.selectedGenre, harmonicComplexity);
  let melodyCurrentTime = startOffset;
  let lastMelodyEventTime = -TIME_EPSILON;
  let lastMelodyNoteMidi = -1;
  let melodyNoteCounter = 0;

  if (scaleNoteNames.length > 0) {
      let currentMelodyScaleIndex = Math.floor(Math.random() * scaleNoteNames.length);
      if(scaleNoteNames[currentMelodyScaleIndex]) lastMelodyNoteMidi = robustNoteToMidi(scaleNoteNames[currentMelodyScaleIndex]);

      while (melodyCurrentTime < totalChordProgressionSeconds - TIME_EPSILON) {
          let noteDurationNotation: string;
          const arousalFactor = (targetArousal + 1) / 2;

          if (isKidsMode) {
            noteDurationNotation = weightedRandom(["4n", "2n", "8n"], [0.6, 0.3, 0.1]) as string;
          } else if (rhythmicDensity < 0.33) {
            noteDurationNotation = weightedRandom(["1m", "2n", "4n"], [0.1 + arousalFactor*0.1, 0.5, 0.4 - arousalFactor*0.1]) as string;
          } else if (rhythmicDensity < 0.66) {
            noteDurationNotation = weightedRandom(["2n", "4n", "8n"], [0.1, 0.6, 0.3 + arousalFactor*0.05]) as string;
          } else {
            noteDurationNotation = weightedRandom(["4n", "8n", "16n"], [0.4, 0.5 + arousalFactor*0.1, 0.1 - arousalFactor*0.05]) as string;
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

          melodyNoteCounter++;
          const restProbabilityBase = isKidsMode ? 0.20 : 0.15;
          const phraseEndRestProb = isKidsMode ? 0.30 : 0.25;
          const restProbability = (melodyNoteCounter % (isKidsMode ? 3 : 4) === 0) ? phraseEndRestProb : (restProbabilityBase - (rhythmicDensity * 0.10) - arousalFactor * 0.03);

          if (Math.random() < restProbability && melodyCurrentTime > startOffset + secondsPerBeat * 0.5 && melodyNotesToSchedule.length > 0) {
              let restDurNotation = rhythmicDensity < 0.5 ? "8n" : "16n";
              if (noteDurationNotation === "2n" || noteDurationNotation === "1m") restDurNotation = "4n";
              const restDurSec = Tone.Time(restDurNotation).toSeconds();
              if (melodyCurrentTime + restDurSec <= totalChordProgressionSeconds + TIME_EPSILON) {
                  melodyCurrentTime += restDurSec;
                  melodyNoteCounter = 0;
                  if (melodyCurrentTime >= totalChordProgressionSeconds - TIME_EPSILON) break;
                  continue;
              }
          }
          const currentChordDegree = progressionDegreesInput[Math.floor(melodyCurrentTime / measureDurationSeconds) % progressionDegreesInput.length];
          const chordNotesForMelody = getChordNotesForKeyFromTheory(params.keySignature, params.mode, currentChordDegree, melodyOctave, harmonicComplexity > 0.5, params.selectedGenre, harmonicComplexity)
                                       .map(n => robustNoteToMidi(n));

          let nextNoteMidi;
          const preferChordTone = Math.random() < (isKidsMode ? 0.60 : 0.70);
          const preferStepwise = Math.random() < (isKidsMode ? 0.70 : 0.80);

          if (preferChordTone && chordNotesForMelody.length > 0 && (melodyNoteCounter % 2 === 1 || isKidsMode)) {
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
              if(scaleNoteNames[currentMelodyScaleIndex]) nextNoteMidi = robustNoteToMidi(scaleNoteNames[currentMelodyScaleIndex]);
              else nextNoteMidi = DEFAULT_MIDI_NOTE;
          }
          nextNoteMidi = Math.max(21, Math.min(108, nextNoteMidi || DEFAULT_MIDI_NOTE));
          lastMelodyNoteMidi = nextNoteMidi;

          const noteName = midiToNoteName(nextNoteMidi);
          const baseVelMelody = isKidsMode ? 0.50 : 0.55;
          const velocity = Math.min(0.9, Math.max(0.15, baseVelMelody + (targetArousal * 0.18) + (targetValence * 0.04) + (Math.random() * 0.12 - 0.06) + (melodyNoteCounter === 1 ? 0.04 : 0) ));

          let newTime = applyHumanization(melodyCurrentTime, 0.008);
          if (newTime <= lastMelodyEventTime) newTime = lastMelodyEventTime + TIME_EPSILON;
          if (newTime >= totalChordProgressionSeconds - TIME_EPSILON) break;

          melodyNotesToSchedule.push({ time: newTime, note: noteName, duration: noteDurationNotation, velocity, filterAttack: true });
          lastMelodyEventTime = newTime;
          overallMaxTime = Math.max(overallMaxTime, newTime + noteDurationSec);
          melodyCurrentTime = newTime + noteDurationSec;
      }
  }
  console.log(`${logPrefix} Generated ${melodyNotesToSchedule.length} melody notes. Melody time: ${melodyCurrentTime.toFixed(2)}s`);

  // Bass Line Generation (copied from previous state)
  const bassNotesToSchedule: { time: number, note: string, duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const bassOctave = isKidsMode ? 2 : (genreLower.includes("jazz") || genreLower.includes("funk") ? 2 : (genreLower.includes("rock") || genreLower.includes("metal") ? 1 : 2));
  let lastBassEventTime = -TIME_EPSILON;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegreesInput.length; i++) {
        const degree = progressionDegreesInput[i];
        const currentMeasureStartTime = startOffset + (cycle * progressionDegreesInput.length * measureDurationSeconds) + (i * measureDurationSeconds);
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
        } else if (genreLower.includes("jazz")) {
            let currentWalkNoteMidi = robustNoteToMidi(rootNote);
            for (let beat = 0; beat < beatsPerMeasure; beat++) {
                let time = applyHumanization(currentMeasureStartTime + beat * secondsPerBeat, 0.02);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                bassNotesToSchedule.push({ time, note: midiToNoteName(currentWalkNoteMidi), duration: "4n", velocity: Math.min(0.70, baseVelBass + (beat === 0 ? 0.04 : -0.04) + Math.random()*0.03), filterAttack: beat % 2 === 0 });
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
        } else if (genreLower.includes("electronic") && rhythmicDensity > 0.3) {
            const subdivisions = rhythmicDensity > 0.65 ? 4 : 2;
            const noteDur = subdivisions === 4 ? "16n" : "8n";
            for (let beat = 0; beat < beatsPerMeasure * subdivisions; beat++) {
                 let time = applyHumanization(currentMeasureStartTime + beat * (secondsPerBeat / subdivisions), 0.005);
                 if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                 bassNotesToSchedule.push({ time, note: rootNote, duration: noteDur, velocity: Math.min(0.70, baseVelBass + (beat % subdivisions === 0 ? 0.04 : 0)), filterAttack: beat % subdivisions === 0 });
                 lastBassEventTime = time;
                 overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat/subdivisions);
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
  console.log(`${logPrefix} Generated ${bassNotesToSchedule.length} bass notes.`);

  // Chords / Pads (copied from previous state)
  const chordEventsToSchedule: { time: number, notes: string[], duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const chordOctave = isKidsMode ? 3 : (genreLower.includes("jazz") || genreLower.includes("classical") ? 4 : 3);
  let lastChordEventTime = -TIME_EPSILON;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegreesInput.length; i++) {
      const degree = progressionDegreesInput[i];
      const currentMeasureStartTime = startOffset + (cycle * progressionDegreesInput.length * measureDurationSeconds) + (i * measureDurationSeconds);
      const addSeventhForChord = !isKidsMode && (harmonicComplexity > 0.5 || genreLower.includes("jazz"));
      const chordNoteNames = getChordNotesForKeyFromTheory(params.keySignature, params.mode, degree, chordOctave, addSeventhForChord, params.selectedGenre, harmonicComplexity);
      const baseVelChord = (isKidsMode ? 0.25 : 0.35) + (targetArousal * 0.10) + (targetValence * 0.04);

      if (chordNoteNames.length > 0) {
          if (isKidsMode || genreLower.includes("ambient") || genreLower.includes("classical")) {
            let time = applyHumanization(currentMeasureStartTime, 0.01);
            if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
            chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: "1m", velocity: Math.min(0.55, baseVelChord), filterAttack:true });
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
                  chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: stabDuration, velocity: Math.min(0.60, baseVelChord + 0.08 + Math.random()*0.04), filterAttack: s % 2 === 0 });
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
                  chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: strumDur, velocity: Math.min(0.55, baseVelChord + (beatOffsetStr === "0" ? 0.04 : 0) + Math.random()*0.02), filterAttack: beatOffsetStr === "0" });
                  lastChordEventTime = time;
                  overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(strumDur).toSeconds());
              });
          } else {
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

  // Arpeggio (copied from previous state)
  const arpeggioNotesToSchedule: { time: number, note: string, duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const arpeggioOctave = isKidsMode ? 4 : (harmonicComplexity > 0.3 ? 4 : 3);
  let lastArpEventTime = -TIME_EPSILON;
  const hintsLower = instrumentHints.map(h => typeof h === 'string' ? h.toLowerCase() : "");
  const isArpFriendlyInstrument = hintsLower.some(hint =>
    /piano|synth lead|electric piano|pluck|bell|celesta|glockenspiel|music box|bright synth|warm lead|soft lead|arp/i.test(hint)
  );
  const playArp = (!isKidsMode && isArpFriendlyInstrument) ||
                  (isKidsMode && harmonicComplexity > 0.1 && rhythmicDensity > 0.05 && isArpFriendlyInstrument) ||
                  (!isKidsMode && (genreLower.includes("electronic") || genreLower.includes("pop") || genreLower.includes("ambient") || genreLower.includes("classical") || harmonicComplexity > 0.4));

  if (playArp && arpInstrumentSetup) { // Check if arpInstrumentSetup is defined
    chordEventsToSchedule.forEach(chordEvent => {
        const currentChordNotesForArp = chordEvent.notes.map(n => midiToNoteName(robustNoteToMidi(n.replace(/[0-9]+$/, String(arpeggioOctave)))));
        if (currentChordNotesForArp.length > 0) {
            const arpPatterns = [ [0, 1, 2, 1], [0, 2, 1, 3 % currentChordNotesForArp.length], [0, 1, 2, 3 % currentChordNotesForArp.length], [3 % currentChordNotesForArp.length, 2, 1, 0], ];
            const selectedArpPattern = arpPatterns[Math.floor(Math.random() * arpPatterns.length)];
            const arpNoteDurationNotation = (rhythmicDensity > 0.4 || genreLower.includes("electronic") || isArpFriendlyInstrument) ? "16n" : "8n";
            const arpNoteDurationSeconds = Tone.Time(arpNoteDurationNotation).toSeconds();
            const notesPerBeatForArp = arpNoteDurationNotation === "16n" ? 4 : 2;
            let beatsToArpeggiate = isKidsMode ? (rhythmicDensity > 0.1 ? 1:0) : (rhythmicDensity > 0.2 && harmonicComplexity > 0.2 ? (genreLower.includes("ambient") ? beatsPerMeasure : (isArpFriendlyInstrument ? beatsPerMeasure : 2)) : (harmonicComplexity > 0.5 ? 1 : 0));
            if (isArpFriendlyInstrument && !isKidsMode) beatsToArpeggiate = beatsPerMeasure;

            for (let beat = 0; beat < beatsToArpeggiate; beat++) {
                for (let i = 0; i < notesPerBeatForArp; i++) {
                    let time = applyHumanization(chordEvent.time + (beat * secondsPerBeat) + (i * arpNoteDurationSeconds), 0.003);
                     if (time < chordEvent.time + Tone.Time(chordEvent.duration).toSeconds() - TIME_EPSILON * 2) {
                        if (time <= lastArpEventTime) time = lastArpEventTime + TIME_EPSILON;
                        const noteIndexInChord = selectedArpPattern[i % selectedArpPattern.length] % currentChordNotesForArp.length;
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

  // Drums (copied from previous state)
  const drumEventsToSchedule: { synth: 'kick' | 'snare' | 'hiHat' | 'tambourine', time: number, duration: string, velocity: number, pitch?: string | number }[] = [];
  const numDrumMeasures = numChordCycles * progressionDegreesInput.length;
  const humanizeAmountDrums = 0.008;
  let lastDrumTimes = { kick: -TIME_EPSILON, snare: -TIME_EPSILON, hiHat: -TIME_EPSILON, tambourine: -TIME_EPSILON };

  for (let measure = 0; measure < numDrumMeasures; measure++) {
    const baseVelDrum = (isKidsMode ? 0.50 : 0.60) + (targetArousal * 0.18);
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
        let time = applyHumanization(kickTime, humanizeAmountDrums);
        if (time <= lastDrumTimes.kick) time = lastDrumTimes.kick + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'kick', time, duration: "8n", velocity: Math.min(0.90, baseVelDrum + 0.18), pitch: "C2" });
        lastDrumTimes.kick = time;
      }
      let addSnare = false; let snareTime = beatStartTime;
      if (isKidsMode) { addSnare = activeSynthConfigs.tambourine ? false : beat === 2;
      } else if (genreLower.includes("electronic") || genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("funk") || genreLower.includes("soul") || genreLower.includes("country")) { addSnare = beat === 1 || beat === 3;
      } else if (genreLower.includes("jazz")) { addSnare = (beat === 1 || beat === 3) && Math.random() < 0.25;
      } else if (genreLower.includes("reggae")) { addSnare = beat === 2; }
      if (addSnare) {
        let time = applyHumanization(snareTime, humanizeAmountDrums * 1.2);
        if (time <= lastDrumTimes.snare) time = lastDrumTimes.snare + TIME_EPSILON;
        drumEventsToSchedule.push({ synth: 'snare', time, duration: "16n", velocity: Math.min(0.85, baseVelDrum + 0.08), pitch: "D2" });
        lastDrumTimes.snare = time;
      }
      if (isKidsMode && activeSynthConfigs.tambourine && (beat === 1 || beat === 3)) {
         let time = applyHumanization(beatStartTime, humanizeAmountDrums);
         if (time <= lastDrumTimes.tambourine) time = lastDrumTimes.tambourine + TIME_EPSILON;
         drumEventsToSchedule.push({synth: 'tambourine', time, duration: "8n", velocity: Math.min(0.65, baseVelDrum - 0.06)});
         lastDrumTimes.tambourine = time;
      }
      let hiHatSubdivisions = 0;
      if (isKidsMode) { hiHatSubdivisions = rhythmicDensity > 0.3 ? 1 : 0;
      } else if (genreLower.includes("jazz") || genreLower.includes("swing") || (genreLower.includes("blues") && rhythmicDensity > 0.3)) { hiHatSubdivisions = 3;
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
          const hiHatPitchForToneJS = activeSynthConfigs.hiHat.frequency || 400;
          const hiHatVelocity = Math.min(0.55, (baseVelDrum * 0.45) + (Math.random() * 0.08) - (subBeat % 2 === 1 && hiHatSubdivisions > 1 ? 0.04:0) );
          if (!isKidsMode && !genreLower.includes("jazz") && !genreLower.includes("classical") && hiHatSubdivisions >= 2 && subBeat === hiHatSubdivisions -1 && Math.random() < 0.15) {
              drumEventsToSchedule.push({ synth: 'hiHat', time, duration: "8n", velocity: hiHatVelocity + 0.08, pitch: hiHatPitchForToneJS + 100 });
          } else {
              drumEventsToSchedule.push({ synth: 'hiHat', time, duration: hiHatNoteDuration, velocity: hiHatVelocity, pitch: hiHatPitchForToneJS });
          }
          lastDrumTimes.hiHat = time;
        }
      }
    }
    const humanizeAmount = 0.01;
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

  const calculatedRenderDuration = Math.max(MIN_EFFECTIVE_DURATION_SECONDS, overallMaxTime + 3.0);
  const renderDuration = Math.min(calculatedRenderDuration, MAX_WAV_RENDER_DURATION_SECONDS);
  console.log(`${logPrefix} Overall max event time: ${overallMaxTime.toFixed(2)}s. Final render duration: ${renderDuration.toFixed(2)}s.`);


  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log(`${logPrefix}_OFFLINE] Inside Tone.Offline. SR: ${offlineContext.sampleRate}`);
      offlineContext.transport.bpm.value = Tone.Transport.bpm.value;
      if (Tone.Transport.swing > 0) {
          offlineContext.transport.swing = Tone.Transport.swing;
          offlineContext.transport.swingSubdivision = Tone.Transport.swingSubdivision;
      }

      const masterReverb = new Tone.Reverb(isKidsMode ? 0.7 : 1.5).toDestination();
      masterReverb.wet.value = isKidsMode ? 0.12 : 0.22;
      await masterReverb.ready;
      console.log(`${logPrefix}_OFFLINE] Master Reverb created. Wet: ${masterReverb.wet.value}`);

      // Use the pre-loaded/created instruments
      const { instrument: melodySynth, outputNodeToConnect: melodyOutput, filterEnv: melodyFilterEnv } = melodyInstrumentSetup;
      melodyOutput.connect(masterReverb);

      const { instrument: bassSynth, outputNodeToConnect: bassOutput, filterEnv: bassFilterEnv } = bassInstrumentSetup;
      bassOutput.toDestination();

      const { instrument: chordSynth, outputNodeToConnect: chordOutput, filterEnv: chordFilterEnv } = chordInstrumentSetup;
      chordOutput.connect(masterReverb);

      let arpeggioSynth: Tone.Sampler | Tone.Instrument | undefined;
      let arpeggioFilterEnv: Tone.FrequencyEnvelope | undefined;
      if (arpInstrumentSetup) {
        arpeggioSynth = arpInstrumentSetup.instrument;
        arpeggioFilterEnv = arpInstrumentSetup.filterEnv;
        arpInstrumentSetup.outputNodeToConnect.connect(masterReverb);
      }
      console.log(`${logPrefix}_OFFLINE] Melodic/Harmonic Synths/Samplers connected.`);


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
      if (arpeggioSynth && arpInstrumentSetup) {
        arpeggioNotesToSchedule.forEach((ev) => {
            (arpeggioSynth as any).triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity);
             if (arpeggioFilterEnv && ev.filterAttack) arpeggioFilterEnv.triggerAttackRelease(ev.duration, ev.time);
        });
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
        if (synth === 'kick') kickSynth.triggerAttackRelease(pitch as string || "C2", duration, time, velocity);
        else if (synth === 'snare') snareSynth.triggerAttackRelease(duration, time, velocity);
        else if (synth === 'hiHat') hiHatSynth.triggerAttackRelease(pitch as string | number, duration, time, velocity);
        else if (synth === 'tambourine' && tambourineSynth) tambourineSynth.triggerAttackRelease(duration, time, velocity);
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
    if (isSilent) console.warn(`${logPrefix}_WARN] Rendered AudioBuffer appears to be silent. Max sample value: ${maxVal.toExponential(3)}`);
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
