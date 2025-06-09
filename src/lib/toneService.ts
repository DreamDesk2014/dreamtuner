
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
    createSynth as createSynthFromSoundDesign,
    type InstrumentOutput
} from './soundDesign';
import {
    TARGET_SONG_BODY_SECONDS,
    MIN_EFFECTIVE_DURATION_SECONDS,
    MAX_WAV_RENDER_DURATION_SECONDS,
    BEATS_PER_MEASURE,
    OUTRO_MEASURES,
    REVERB_TAIL_SECONDS
} from './constants';


// Constants
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

function applyHumanization(time: number, intensity: number = 0.008): number { // Slightly reduced default intensity
    return time + (Math.random() * 2 - 1) * intensity;
}


export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  const logPrefix = "[WAV_GEN_V0.9_ToneTimeFix]";
  console.log(`${logPrefix} Starting synthesis for: ${params.generatedIdea ? params.generatedIdea.substring(0, 30) : "Untitled"}...`);

  const genreLower = typeof params.selectedGenre === 'string' ? params.selectedGenre.toLowerCase() : "";
  const isKidsMode = params.originalInput.mode === 'kids';
  const { harmonicComplexity = 0.3, rhythmicDensity = 0.5, targetArousal = 0, targetValence = 0, instrumentHints = [] } = params;
  const { melodicContour, melodicPhrasing, melodicEmphasis } = params;

  const activeSynthConfigs = getSynthConfigurationsFromSoundDesign(instrumentHints, params.selectedGenre, isKidsMode, harmonicComplexity, rhythmicDensity);

  const startOffset = 0.1;
  const currentBpm = (params.tempoBpm && params.tempoBpm > 0) ? params.tempoBpm : 120;
  Tone.Transport.bpm.value = currentBpm;
  const secondsPerBeat = 60 / currentBpm;
  const measureDurationSeconds = BEATS_PER_MEASURE * secondsPerBeat;
  let overallMaxTime = startOffset;

  const progressionDegreesInput = params.originalInput.mode === 'kids' ? [1, 4, 5, 1] :
                                (genreLower.includes("blues") ? [1,1,4,1,5,4,1,1] :
                                (genreLower.includes("jazz") ? [2,5,1,6] :
                                 [1, 5, 6, 4]));

  const secondsPerBaseProgressionCycle = progressionDegreesInput.length * measureDurationSeconds;
  const numChordCycles = Math.max(1, Math.round(TARGET_SONG_BODY_SECONDS / secondsPerBaseProgressionCycle));
  const totalChordProgressionSeconds = numChordCycles * progressionDegreesInput.length * measureDurationSeconds;

  console.log(`${logPrefix} BPM: ${currentBpm}. Target song body: ${TARGET_SONG_BODY_SECONDS}s. Seconds per base prog: ${secondsPerBaseProgressionCycle.toFixed(2)}s. Num cycles: ${numChordCycles}. Total prog seconds: ${totalChordProgressionSeconds.toFixed(2)}s.`);


  const melodyNotesToSchedule: { time: number, note: string, duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const melodyOctave = isKidsMode ? 4 : (genreLower.includes("jazz") || genreLower.includes("classical") ? 5 : 4);
  const scaleNoteNames = getScaleNoteNamesFromTheory(params.keySignature, params.mode, melodyOctave, params.selectedGenre, harmonicComplexity);
  let melodyCurrentTime = startOffset;
  let lastMelodyEventTime = -TIME_EPSILON;
  let lastMelodyNoteMidi = scaleNoteNames.length > 0 ? robustNoteToMidi(scaleNoteNames[0]) : DEFAULT_MIDI_NOTE;
  let melodyNoteCounter = 0;
  let melodyRiffBuffer: { noteMidi: number, duration: string, velocityMod: number }[] = [];
  const RIFF_LENGTH = (melodicPhrasing === 'short_motifs') ? 2 : 3;
  let riffPlaybackCooldown = 0;

  if (scaleNoteNames.length > 0) {
      let currentMelodyScaleIndex = Math.floor(Math.random() * scaleNoteNames.length);
      if(scaleNoteNames[currentMelodyScaleIndex]) lastMelodyNoteMidi = robustNoteToMidi(scaleNoteNames[currentMelodyScaleIndex]);

      while (melodyCurrentTime < totalChordProgressionSeconds - TIME_EPSILON) {
          let noteDurationNotation: string = "4n"; // Initialize with a safe default
          const arousalFactor = (targetArousal + 1) / 2; // 0 to 1

          // Note Duration based on Melodic Phrasing and Rhythmic Density
          if (melodicPhrasing === 'short_motifs') {
            noteDurationNotation = weightedRandom(["8n", "16n", "4t"], [0.5, 0.35, 0.15]) as string;
          } else if (melodicPhrasing === 'long_flowing') {
            noteDurationNotation = weightedRandom(["2n", "1m", "4n."], [0.5, 0.3, 0.2]) as string;
          } else { // Default phrasing or others
            if (isKidsMode) {
              noteDurationNotation = rhythmicDensity > 0.4 ? weightedRandom(["4n", "8n"], [0.6, 0.4]) as string : weightedRandom(["2n", "4n"], [0.7, 0.3]) as string;
            } else if (rhythmicDensity < 0.33) { // Sparse
              noteDurationNotation = weightedRandom(["1m", "2n", "4n."], [0.2 + arousalFactor*0.1, 0.5, 0.3 - arousalFactor*0.1]) as string;
            } else if (rhythmicDensity < 0.66) { // Moderate
              noteDurationNotation = weightedRandom(["2n", "4n", "8n"], [0.15, 0.6, 0.25 + arousalFactor*0.05]) as string;
            } else { // Dense
              noteDurationNotation = weightedRandom(["4n", "8n", "16n"], [0.3, 0.55 + arousalFactor*0.1, 0.15 - arousalFactor*0.05]) as string;
            }
          }

          let noteDurationSec = Tone.Time(noteDurationNotation).toSeconds();


          if (melodyCurrentTime + noteDurationSec > totalChordProgressionSeconds + TIME_EPSILON) {
              noteDurationSec = totalChordProgressionSeconds - melodyCurrentTime;
              if (noteDurationSec <= TIME_EPSILON * 5) break; // Too short, end loop
              if (noteDurationSec >= Tone.Time("1m").toSeconds() - TIME_EPSILON) noteDurationNotation = "1m";
              else if (noteDurationSec >= Tone.Time("2n").toSeconds() - TIME_EPSILON) noteDurationNotation = "2n";
              else if (noteDurationSec >= Tone.Time("4n.").toSeconds() - TIME_EPSILON) noteDurationNotation = "4n.";
              else if (noteDurationSec >= Tone.Time("4n").toSeconds() - TIME_EPSILON) noteDurationNotation = "4n";
              else if (noteDurationSec >= Tone.Time("8n").toSeconds() - TIME_EPSILON) noteDurationNotation = "8n";
              else if (noteDurationSec >= Tone.Time("16n").toSeconds() - TIME_EPSILON) noteDurationNotation = "16n";
              else break;
              noteDurationSec = Tone.Time(noteDurationNotation).toSeconds();
          }
           if (melodyCurrentTime >= totalChordProgressionSeconds - TIME_EPSILON) break;


          melodyNoteCounter++;
          riffPlaybackCooldown = Math.max(0, riffPlaybackCooldown - 1);

          const restProbabilityBase = melodicPhrasing === 'long_flowing' ? 0.05 : (melodicPhrasing === 'short_motifs' ? 0.30 : (isKidsMode ? 0.20 : 0.15));
          const phraseEndRestProb = melodicPhrasing === 'long_flowing' ? 0.10 : (melodicPhrasing === 'short_motifs' ? 0.40 : (isKidsMode ? 0.30 : 0.25));
          let restProbability = (melodyNoteCounter % (isKidsMode ? 3 : (melodicPhrasing === 'short_motifs' ? 2 : 4)) === 0) ? phraseEndRestProb : (restProbabilityBase - (rhythmicDensity * 0.05) - arousalFactor * 0.02);
          if (isKidsMode && rhythmicDensity < 0.3 && melodyNoteCounter > 1) restProbability = 0.4;


          if (Math.random() < restProbability && melodyCurrentTime > startOffset + secondsPerBeat * 0.25 && melodyNotesToSchedule.length > 0) {
              let restDurNotation = rhythmicDensity < 0.5 ? "8n" : "16n";
              if (noteDurationNotation === "2n" || noteDurationNotation === "1m" || noteDurationNotation === "4n.") restDurNotation = "4n";
              if (melodicPhrasing === 'short_motifs') restDurNotation = (Math.random() < 0.6 ? "16n" : "8n");
              if (isKidsMode && restDurNotation === "16n") restDurNotation = "8n";
              const restDurSec = Tone.Time(restDurNotation).toSeconds();
              if (melodyCurrentTime + restDurSec <= totalChordProgressionSeconds + TIME_EPSILON) {
                  melodyCurrentTime += restDurSec;
                  melodyNoteCounter = 0;
                  if (melodyCurrentTime >= totalChordProgressionSeconds - TIME_EPSILON) break;
                  continue;
              }
          }

          if (melodicContour === 'riff-based' && melodyRiffBuffer.length >= RIFF_LENGTH && Math.random() < 0.4 && riffPlaybackCooldown === 0 && !isKidsMode) {
            let riffTime = melodyCurrentTime;
            let canPlayRiff = true;
            for (const riffNote of melodyRiffBuffer) {
              if (riffTime + Tone.Time(riffNote.duration).toSeconds() > totalChordProgressionSeconds + TIME_EPSILON) {
                canPlayRiff = false; break;
              }
              riffTime += Tone.Time(riffNote.duration).toSeconds();
            }
            if (canPlayRiff) {
              let tempRiffTime = melodyCurrentTime;
              for (const riffNote of melodyRiffBuffer) {
                let newTime = applyHumanization(tempRiffTime, 0.003);
                if (newTime <= lastMelodyEventTime) newTime = lastMelodyEventTime + TIME_EPSILON;
                const noteName = midiToNoteName(riffNote.noteMidi);
                const velocity = Math.min(0.9, Math.max(0.15, (0.60) + (targetArousal * 0.15) + (targetValence * 0.03) + riffNote.velocityMod));
                melodyNotesToSchedule.push({ time: newTime, note: noteName, duration: riffNote.duration, velocity, filterAttack: true });
                lastMelodyEventTime = newTime;
                const currentRiffNoteDurSec = Tone.Time(riffNote.duration).toSeconds();
                overallMaxTime = Math.max(overallMaxTime, newTime + currentRiffNoteDurSec);
                tempRiffTime = newTime + currentRiffNoteDurSec;
                lastMelodyNoteMidi = riffNote.noteMidi;
              }
              melodyCurrentTime = tempRiffTime;
              riffPlaybackCooldown = RIFF_LENGTH;
              melodyRiffBuffer = [];
              if (melodyCurrentTime >= totalChordProgressionSeconds - TIME_EPSILON) break;
              continue;
            }
          }


          const currentProgressionDegree = progressionDegreesInput[Math.floor(melodyCurrentTime / measureDurationSeconds) % progressionDegreesInput.length];
          const chordNotesForMelody = getChordNotesForKeyFromTheory(params.keySignature, params.mode, currentProgressionDegree, melodyOctave, harmonicComplexity > 0.5, params.selectedGenre, harmonicComplexity)
                                       .map(n => robustNoteToMidi(n));

          let nextNoteMidi;
          let preferChordToneProb = melodicEmphasis === 'foreground' ? 0.85 : (isKidsMode ? 0.70 : 0.75);
          if (melodicEmphasis === 'background') preferChordToneProb = 0.5;
          if (melodyNoteCounter === 1 && melodicPhrasing !== 'long_flowing') preferChordToneProb = 0.9;

          let preferStepwiseProb = melodicContour === 'stable' ? 0.9 : (isKidsMode ? 0.80 : 0.85);
          if (melodicContour === 'wavy' || melodicContour === 'riff-based') preferStepwiseProb = 0.6;


          if (Math.random() < preferChordToneProb && chordNotesForMelody.length > 0) {
              nextNoteMidi = chordNotesForMelody[Math.floor(Math.random() * chordNotesForMelody.length)];
          } else if (Math.random() < preferStepwiseProb && lastMelodyNoteMidi !== -1 && scaleNoteNames.length > 0) {
              let stepDirection = 0;
              if (melodicContour === 'ascending') stepDirection = 1;
              else if (melodicContour === 'descending') stepDirection = -1;
              else if (melodicContour === 'wavy') stepDirection = (melodyNoteCounter % (RIFF_LENGTH +1) < Math.floor(RIFF_LENGTH/2)) ? 1 : -1;
              const possibleSteps = stepDirection !== 0 ? [stepDirection * 1, stepDirection * 2] : [-2, -1, 1, 2];
              const nextStep = possibleSteps[Math.floor(Math.random() * possibleSteps.length)];
              let candidateNote = lastMelodyNoteMidi + nextStep;
              const scaleMidiNotes = scaleNoteNames.map(n => robustNoteToMidi(n));
              if (!scaleMidiNotes.includes(candidateNote)) {
                  nextNoteMidi = scaleMidiNotes.reduce((prev, curr) => (Math.abs(curr - candidateNote) < Math.abs(prev - candidateNote) ? curr : prev), scaleMidiNotes[0] || DEFAULT_MIDI_NOTE);
              } else {
                  nextNoteMidi = candidateNote;
              }
          } else {
              let intervalJump = (Math.random() < 0.7 ? (Math.random() < 0.5 ? 1 : -1) : (Math.random() < 0.5 ? 2 : -2));
              if (melodicContour === 'ascending') intervalJump = Math.abs(intervalJump) || 1;
              else if (melodicContour === 'descending') intervalJump = -Math.abs(intervalJump) || -1;
              currentMelodyScaleIndex = (currentMelodyScaleIndex + intervalJump + scaleNoteNames.length) % scaleNoteNames.length;
              if(scaleNoteNames[currentMelodyScaleIndex]) nextNoteMidi = robustNoteToMidi(scaleNoteNames[currentMelodyScaleIndex]);
              else nextNoteMidi = DEFAULT_MIDI_NOTE;
          }
          nextNoteMidi = Math.max(36, Math.min(96, nextNoteMidi || DEFAULT_MIDI_NOTE));


          const baseVelMelody = isKidsMode ? 0.60 : 0.65;
          let velocity = baseVelMelody + (targetArousal * 0.15) + (targetValence * 0.05) + (Math.random() * 0.10 - 0.05);
          if (melodicEmphasis === 'foreground') velocity += 0.12;
          else if (melodicEmphasis === 'background') velocity -= 0.12;
          if (melodyNoteCounter === 1 && melodicPhrasing !== 'long_flowing') velocity += 0.05;
          velocity = Math.min(0.95, Math.max(0.25, velocity));


           const velocityModForRiff = velocity - (baseVelMelody + (targetArousal * 0.15) + (targetValence * 0.05));
           if (melodicContour === 'riff-based' && !isKidsMode) {
                melodyRiffBuffer.push({ noteMidi: nextNoteMidi, duration: noteDurationNotation, velocityMod: velocityModForRiff });
                if (melodyRiffBuffer.length > RIFF_LENGTH) melodyRiffBuffer.shift();
           } else {
             melodyRiffBuffer = [];
           }

          lastMelodyNoteMidi = nextNoteMidi;
          const noteName = midiToNoteName(nextNoteMidi);
          let newTime = applyHumanization(melodyCurrentTime, 0.003);
          if (newTime <= lastMelodyEventTime) newTime = lastMelodyEventTime + TIME_EPSILON;
          if (newTime >= totalChordProgressionSeconds - TIME_EPSILON) break;

          melodyNotesToSchedule.push({ time: newTime, note: noteName, duration: noteDurationNotation, velocity, filterAttack: melodicPhrasing !== 'long_flowing' });
          lastMelodyEventTime = newTime;
          overallMaxTime = Math.max(overallMaxTime, newTime + noteDurationSec);
          melodyCurrentTime = newTime + noteDurationSec;
      }
  }
  console.log(`${logPrefix} Generated ${melodyNotesToSchedule.length} melody notes. Melody time: ${melodyCurrentTime.toFixed(2)}s`);

  const bassNotesToSchedule: { time: number, note: string, duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const bassOctave = isKidsMode ? 2 : (genreLower.includes("jazz") || genreLower.includes("funk") ? 2 : (genreLower.includes("rock") || genreLower.includes("metal") ? 1 : 2));
  let lastBassEventTime = -TIME_EPSILON;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegreesInput.length; i++) {
        const degree = progressionDegreesInput[i];
        const currentMeasureStartTimeForCycle = startOffset + (cycle * progressionDegreesInput.length * measureDurationSeconds) + (i * measureDurationSeconds);
        // if (currentMeasureStartTimeForCycle >= totalChordProgressionSeconds - TIME_EPSILON) break; // This break should be inside the inner loop for `beat` or `p` later

        const chordNotesForBass = getChordNotesForKeyFromTheory(params.keySignature, params.mode, degree, bassOctave, harmonicComplexity > 0.5, params.selectedGenre, harmonicComplexity);
        const rootNote = chordNotesForBass[0] || midiToNoteName(DEFAULT_MIDI_NOTE + (bassOctave -4)*12);
        const fifthNote = chordNotesForBass[2 % chordNotesForBass.length] || rootNote;
        const thirdNote = chordNotesForBass[1 % chordNotesForBass.length] || rootNote;

        const baseVelBass = (isKidsMode ? 0.55 : 0.60) + (targetArousal * 0.10);
        const humanizeBassIntensity = 0.004;

        if (isKidsMode) {
            let time = applyHumanization(currentMeasureStartTimeForCycle, humanizeBassIntensity);
            if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
            if (time >= totalChordProgressionSeconds - TIME_EPSILON) continue;
            const duration = (rhythmicDensity > 0.4 && Math.random() < 0.5) ? "2n" : "1m";
            bassNotesToSchedule.push({ time, note: rootNote, duration: duration, velocity: Math.min(0.75, baseVelBass + 0.1), filterAttack:true });
            lastBassEventTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(duration).toSeconds());
        } else if (genreLower.includes("jazz")) {
             const scaleForWalk = getScaleNoteNamesFromTheory(params.keySignature, params.mode, bassOctave, params.selectedGenre, harmonicComplexity);
            let currentWalkNoteMidi = robustNoteToMidi(rootNote);
            for (let beat = 0; beat < BEATS_PER_MEASURE; beat++) {
                if (currentMeasureStartTimeForCycle + beat * secondsPerBeat >= totalChordProgressionSeconds - TIME_EPSILON) break;
                let time = applyHumanization(currentMeasureStartTimeForCycle + beat * secondsPerBeat, 0.01);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                if (time >= totalChordProgressionSeconds - TIME_EPSILON) continue;
                bassNotesToSchedule.push({ time, note: midiToNoteName(currentWalkNoteMidi), duration: "4n", velocity: Math.min(0.70, baseVelBass + (beat === 0 ? 0.04 : -0.02) + Math.random()*0.02), filterAttack: beat % 2 === 0 });
                lastBassEventTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat);
                const targetNotesMidi = beat < 2 ? [robustNoteToMidi(thirdNote), robustNoteToMidi(fifthNote)] : [robustNoteToMidi(fifthNote), robustNoteToMidi(rootNote) + (Math.random() < 0.3 ? 7 : 0)];
                let closestDist = Infinity; let nextNoteMidi = currentWalkNoteMidi;
                [...targetNotesMidi, ...scaleForWalk.map(n => robustNoteToMidi(n))].forEach(tnMidi => {
                    if (tnMidi === currentWalkNoteMidi) return;
                    const dist = Math.abs(tnMidi - currentWalkNoteMidi);
                    if (dist < closestDist && dist <=5 && dist > 0 ) {
                        closestDist = dist; nextNoteMidi = tnMidi;
                    }
                });
                currentWalkNoteMidi = nextNoteMidi;
            }
        } else if (genreLower.includes("funk") || genreLower.includes("soul")) {
            const pattern = [
                { note: rootNote, offsetBeats: 0, duration: "8n", accent: true },
                { offsetBeats: 0.5, duration: "16n", rest: true },
                { note: rootNote, offsetBeats: 0.75, duration: "16n", accent: false },
                { note: fifthNote, offsetBeats: 1.5, duration: "8n", accent: rhythmicDensity > 0.6 },
                { offsetBeats: 2.0, duration: "16n", rest: Math.random() < 0.3 },
                { note: rootNote, offsetBeats: 2.25, duration: "16n", accent: true },
                { note: thirdNote, offsetBeats: 3.0, duration: (rhythmicDensity > 0.5 ? "8n." : "8n"), accent: false },
                { note: fifthNote, offsetBeats: 3.5 + (rhythmicDensity > 0.5 ? 0.25 : 0), duration: (rhythmicDensity > 0.5 ? "16n" : "8n"), accent: false},
            ];
            pattern.forEach(p => {
                if (currentMeasureStartTimeForCycle + p.offsetBeats * secondsPerBeat >= totalChordProgressionSeconds - TIME_EPSILON) return;
                if (p.rest) return;
                let time = applyHumanization(currentMeasureStartTimeForCycle + p.offsetBeats * secondsPerBeat, humanizeBassIntensity * 0.8);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                if (time >= totalChordProgressionSeconds - TIME_EPSILON) return;
                bassNotesToSchedule.push({ time, note: p.note as string, duration: p.duration, velocity: Math.min(0.80, baseVelBass + (p.accent ? 0.1 : 0) + Math.random()*0.03), filterAttack: p.accent });
                lastBassEventTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(p.duration).toSeconds());
            });
        } else if (genreLower.includes("electronic")) {
            const subdivisions = rhythmicDensity > 0.6 ? 4 : (rhythmicDensity > 0.3 ? 2 : 1);
            const noteDur = subdivisions === 4 ? "16n" : (subdivisions === 2 ? "8n" : "4n");
            for (let beat = 0; beat < BEATS_PER_MEASURE * subdivisions; beat++) {
                 if (currentMeasureStartTimeForCycle + beat * (secondsPerBeat / subdivisions) >= totalChordProgressionSeconds - TIME_EPSILON) break;
                 let time = applyHumanization(currentMeasureStartTimeForCycle + beat * (secondsPerBeat / subdivisions), humanizeBassIntensity * 0.5);
                 if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                 if (time >= totalChordProgressionSeconds - TIME_EPSILON) continue;
                 bassNotesToSchedule.push({ time, note: rootNote, duration: noteDur, velocity: Math.min(0.75, baseVelBass + (beat % subdivisions === 0 ? 0.05 : 0)), filterAttack: beat % subdivisions === 0 });
                 lastBassEventTime = time;
                 overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat/subdivisions);
            }
        }
        else { // Default Rock/Pop/Country etc.
            for (let beat = 0; beat < BEATS_PER_MEASURE; beat++) {
                if (currentMeasureStartTimeForCycle + beat * secondsPerBeat >= totalChordProgressionSeconds - TIME_EPSILON) break;
                let time = applyHumanization(currentMeasureStartTimeForCycle + beat * secondsPerBeat, humanizeBassIntensity);
                if (time <= lastBassEventTime) time = lastBassEventTime + TIME_EPSILON;
                if (time >= totalChordProgressionSeconds - TIME_EPSILON) continue;
                const noteToPlay = (beat === 1 && rhythmicDensity > 0.4 && Math.random() < 0.25 && !isKidsMode) ? fifthNote : rootNote;
                bassNotesToSchedule.push({ time, note: noteToPlay, duration: "4n", velocity: Math.min(0.80, baseVelBass + (beat === 0 || beat === 2 ? 0.1 : -0.05)), filterAttack: beat % 2 === 0 });
                lastBassEventTime = time;
                overallMaxTime = Math.max(overallMaxTime, time + secondsPerBeat);
            }
        }
    if (currentMeasureStartTimeForCycle + measureDurationSeconds >= totalChordProgressionSeconds - TIME_EPSILON && cycle === numChordCycles -1 && i === progressionDegreesInput.length -1) break;
    }
  }
  console.log(`${logPrefix} Generated ${bassNotesToSchedule.length} bass notes.`);

  const chordEventsToSchedule: { time: number, notes: string[], duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const chordOctave = isKidsMode ? 3 : (genreLower.includes("jazz") || genreLower.includes("classical") ? 4 : 3);
  let lastChordEventTime = -TIME_EPSILON;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (let i=0; i < progressionDegreesInput.length; i++) {
      const degree = progressionDegreesInput[i];
      const currentMeasureStartTimeForCycle = startOffset + (cycle * progressionDegreesInput.length * measureDurationSeconds) + (i * measureDurationSeconds);
      if (currentMeasureStartTimeForCycle >= totalChordProgressionSeconds - TIME_EPSILON) break;

      const addSeventhForChord = !isKidsMode && (harmonicComplexity > 0.55 || genreLower.includes("jazz") || genreLower.includes("blues"));
      const chordNoteNames = getChordNotesForKeyFromTheory(params.keySignature, params.mode, degree, chordOctave, addSeventhForChord, params.selectedGenre, harmonicComplexity);
      const baseVelChord = (isKidsMode ? 0.35 : 0.40) + (targetArousal * 0.08) + (targetValence * 0.03);
      const humanizeChordIntensity = 0.007;

      if (chordNoteNames.length > 0) {
          if (isKidsMode || genreLower.includes("ambient") || genreLower.includes("classical")) {
            let time = applyHumanization(currentMeasureStartTimeForCycle, humanizeChordIntensity);
            if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
            if (time >= totalChordProgressionSeconds - TIME_EPSILON) continue;
            chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: "1m", velocity: Math.min(0.60, baseVelChord), filterAttack:true });
            lastChordEventTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + measureDurationSeconds);
          } else if (genreLower.includes("funk") || genreLower.includes("reggae") || (genreLower.includes("electronic") && rhythmicDensity > 0.5)) {
              const numStabs = rhythmicDensity > 0.6 ? (genreLower.includes("reggae") ? 2 : 4) : (rhythmicDensity > 0.4 ? 2:1);
              const stabDuration = numStabs === 4 ? "16n" : (genreLower.includes("reggae") ? (rhythmicDensity > 0.4 ? "8n." : "4n") : "8n");
              for(let s=0; s < numStabs; s++) {
                  if (currentMeasureStartTimeForCycle + (s * (BEATS_PER_MEASURE / numStabs) * secondsPerBeat) >= totalChordProgressionSeconds - TIME_EPSILON) break;
                  let timeOffsetBeats = s * (BEATS_PER_MEASURE / numStabs);
                  if (genreLower.includes("reggae")) timeOffsetBeats = (s * 2 + 1);
                  let time = applyHumanization(currentMeasureStartTimeForCycle + timeOffsetBeats * secondsPerBeat, humanizeChordIntensity * 0.7);
                  if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
                  if (time >= totalChordProgressionSeconds - TIME_EPSILON) continue;
                  chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: stabDuration, velocity: Math.min(0.65, baseVelChord + 0.1 + Math.random()*0.04), filterAttack: s % 2 === 0 });
                  lastChordEventTime = time;
                  overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(stabDuration).toSeconds());
                  if (genreLower.includes("reggae") && s >=1 && numStabs === 2) break;
              }
          } else if (genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("country")){
              const numStrums = rhythmicDensity > 0.5 ? BEATS_PER_MEASURE * 2 : BEATS_PER_MEASURE;
              const strumDur = numStrums === BEATS_PER_MEASURE * 2 ? "8n" : "4n";
              for(let beat = 0; beat < numStrums; beat++) {
                  if (currentMeasureStartTimeForCycle + beat * (secondsPerBeat / (numStrums/BEATS_PER_MEASURE)) >= totalChordProgressionSeconds - TIME_EPSILON) break;
                  let time = applyHumanization(currentMeasureStartTimeForCycle + beat * (secondsPerBeat / (numStrums/BEATS_PER_MEASURE)), humanizeChordIntensity);
                  if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
                  if (time >= totalChordProgressionSeconds - TIME_EPSILON) continue;
                  chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: strumDur, velocity: Math.min(0.60, baseVelChord + (beat === 0 ? 0.05 : 0) + Math.random()*0.02), filterAttack: beat === 0 });
                  lastChordEventTime = time;
                  overallMaxTime = Math.max(overallMaxTime, time + Tone.Time(strumDur).toSeconds());
              }
          } else { // Default sustained chord
            let time = applyHumanization(currentMeasureStartTimeForCycle, humanizeChordIntensity);
            if (time <= lastChordEventTime) time = lastChordEventTime + TIME_EPSILON;
            if (time >= totalChordProgressionSeconds - TIME_EPSILON) continue;
            chordEventsToSchedule.push({ time, notes: chordNoteNames, duration: "1m", velocity: Math.min(0.60, baseVelChord), filterAttack:true });
            lastChordEventTime = time;
            overallMaxTime = Math.max(overallMaxTime, time + measureDurationSeconds);
          }
      }
       if (currentMeasureStartTimeForCycle + measureDurationSeconds >= totalChordProgressionSeconds - TIME_EPSILON && cycle === numChordCycles -1 && i === progressionDegreesInput.length -1) break;
    }
  }
  console.log(`${logPrefix} Generated ${chordEventsToSchedule.length} chord events.`);

  const arpeggioNotesToSchedule: { time: number, note: string, duration: string, velocity: number, filterAttack?:boolean }[] = [];
  const arpeggioOctave = isKidsMode ? 4 : (harmonicComplexity > 0.4 ? 4 : 3);
  let lastArpEventTime = -TIME_EPSILON;
  const isArpFriendlyInstrument = activeSynthConfigs.arpeggio && (activeSynthConfigs.arpeggio.instrumentHintName?.includes('Pluck') || activeSynthConfigs.arpeggio.instrumentHintName?.includes('Piano') || activeSynthConfigs.arpeggio.instrumentHintName?.includes('SynthArp') || activeSynthConfigs.arpeggio.instrumentHintName?.includes('Bell'));

  const playArp = (!isKidsMode && isArpFriendlyInstrument) ||
                  (isKidsMode && harmonicComplexity > 0.15 && rhythmicDensity > 0.1 && isArpFriendlyInstrument) ||
                  (!isKidsMode && (genreLower.includes("electronic") || genreLower.includes("pop") || genreLower.includes("ambient") || genreLower.includes("classical") || harmonicComplexity > 0.45));

  if (playArp) {
    chordEventsToSchedule.forEach(chordEvent => {
        if (chordEvent.time >= totalChordProgressionSeconds - TIME_EPSILON) return;
        const currentChordNotesForArp = chordEvent.notes.map(n => midiToNoteName(robustNoteToMidi(n.replace(/[0-9]+$/, String(arpeggioOctave)))));
        if (currentChordNotesForArp.length > 0) {
            const arpPatterns = [
                [0, 1, 2, 1], [0, 2, 1, 0],
                [0, 1, 2, 3 % currentChordNotesForArp.length],
                [currentChordNotesForArp.length-1, Math.max(0, currentChordNotesForArp.length-2), Math.max(0, currentChordNotesForArp.length-3), 0],
            ];
            let selectedArpPattern = arpPatterns[Math.floor(Math.random() * arpPatterns.length)];
            if (melodicContour === 'ascending' && currentChordNotesForArp.length >=3) selectedArpPattern = [0, 1, 2, 3 % currentChordNotesForArp.length];
            else if (melodicContour === 'descending' && currentChordNotesForArp.length >=3) selectedArpPattern = [currentChordNotesForArp.length-1, Math.max(0, currentChordNotesForArp.length-2), Math.max(0, currentChordNotesForArp.length-3), 0];

            const arpNoteDurationNotation = (rhythmicDensity > 0.45 || genreLower.includes("electronic") || isArpFriendlyInstrument) ? "16n" : "8n";
            const arpNoteDurationSeconds = Tone.Time(arpNoteDurationNotation).toSeconds();
            const notesPerBeatForArp = arpNoteDurationNotation === "16n" ? 4 : 2;
            let beatsToArpeggiate = isKidsMode ? (rhythmicDensity > 0.15 ? 1:0) : (rhythmicDensity > 0.25 && harmonicComplexity > 0.25 ? (genreLower.includes("ambient") ? BEATS_PER_MEASURE : (isArpFriendlyInstrument ? BEATS_PER_MEASURE : 2)) : (harmonicComplexity > 0.55 ? 1 : 0));
            if (isArpFriendlyInstrument && !isKidsMode && (genreLower.includes("pop") || genreLower.includes("electronic"))) beatsToArpeggiate = BEATS_PER_MEASURE;


            for (let beat = 0; beat < beatsToArpeggiate; beat++) {
                for (let i = 0; i < notesPerBeatForArp; i++) {
                    if (chordEvent.time + (beat * secondsPerBeat) + (i * arpNoteDurationSeconds) >= totalChordProgressionSeconds - TIME_EPSILON) break;
                    let time = applyHumanization(chordEvent.time + (beat * secondsPerBeat) + (i * arpNoteDurationSeconds), 0.002);
                     if (time < chordEvent.time + Tone.Time(chordEvent.duration).toSeconds() - TIME_EPSILON * 2 && time < totalChordProgressionSeconds - TIME_EPSILON) {
                        if (time <= lastArpEventTime) time = lastArpEventTime + TIME_EPSILON;
                        const noteIndexInChord = selectedArpPattern[i % selectedArpPattern.length] % currentChordNotesForArp.length;
                        arpeggioNotesToSchedule.push({ time, note: currentChordNotesForArp[noteIndexInChord], duration: arpNoteDurationNotation, velocity: Math.min(0.50, 0.20 + (targetArousal * 0.08) + Math.random() * 0.02), filterAttack: true });
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
  const numTotalMeasures = numChordCycles * progressionDegreesInput.length; // Total measures for the body
  const humanizeDrumsIntensity = 0.004;
  let lastDrumTimes = { kick: -TIME_EPSILON, snare: -TIME_EPSILON, hiHat: -TIME_EPSILON, tambourine: -TIME_EPSILON };

  for (let measure = 0; measure < numTotalMeasures; measure++) {
    const measureStartTimeForDrums = startOffset + measure * measureDurationSeconds;
    if (measureStartTimeForDrums >= totalChordProgressionSeconds - TIME_EPSILON) break;

    const baseVelDrum = (isKidsMode ? 0.55 : 0.65) + (targetArousal * 0.15);
    const isFillMeasure = !isKidsMode && (measure + 1) % 4 === 0 && measure < numTotalMeasures - OUTRO_MEASURES && rhythmicDensity > 0.65 && (genreLower.includes("rock") || genreLower.includes("pop") || genreLower.includes("funk"));

    for (let beat = 0; beat < BEATS_PER_MEASURE; beat++) {
      const beatStartTimeForDrums = measureStartTimeForDrums + beat * secondsPerBeat;
      if (beatStartTimeForDrums >= totalChordProgressionSeconds - TIME_EPSILON) continue;


      let addKick = false; let kickTime = beatStartTimeForDrums; let kickVelMod = 0.1;
      if (isKidsMode) { addKick = (beat === 0 || beat === 2);
      } else if (genreLower.includes("electronic") || genreLower.includes("house") || genreLower.includes("techno")) { addKick = true; kickVelMod = 0.15;
      } else if (genreLower.includes("funk") || genreLower.includes("soul")) {
          addKick = (beat === 0) || (beat === 2 && Math.random() < 0.7) || (Math.random() < rhythmicDensity * 0.4 && beat % 1 !== 0.75) ;
          if(addKick && beat % 1 !== 0) kickTime = beatStartTimeForDrums + (secondsPerBeat * (Math.random() < 0.5 ? 0.25 : 0.75) * (Math.random() < 0.4 ? -1 : 1));
          kickVelMod = 0.12;
      } else if (genreLower.includes("reggae")) {
          addKick = rhythmicDensity < 0.6 ? beat === 2 : true;
      } else { addKick = beat === 0 || beat === 2; }
      if (addKick && (!isFillMeasure || beat < 2)) {
        let time = applyHumanization(kickTime, humanizeDrumsIntensity);
        if (time <= lastDrumTimes.kick) time = lastDrumTimes.kick + TIME_EPSILON;
        if (time < totalChordProgressionSeconds - TIME_EPSILON) {
            drumEventsToSchedule.push({ synth: 'kick', time, duration: "8n", velocity: Math.min(0.95, baseVelDrum + kickVelMod), pitch: "C2" });
            lastDrumTimes.kick = time;
        }
      }

      let addSnare = false; let snareTime = beatStartTimeForDrums; let snareVelMod = 0.08;
      if (isKidsMode) { addSnare = activeSynthConfigs.tambourine ? false : (beat === 1 || beat === 3);
      } else if (genreLower.includes("reggae")) { addSnare = beat === 2;
      } else { addSnare = beat === 1 || beat === 3; }
      if (addSnare && !isFillMeasure) {
        let time = applyHumanization(snareTime, humanizeDrumsIntensity * 1.1);
        if (time <= lastDrumTimes.snare) time = lastDrumTimes.snare + TIME_EPSILON;
        if (time < totalChordProgressionSeconds - TIME_EPSILON) {
            drumEventsToSchedule.push({ synth: 'snare', time, duration: "16n", velocity: Math.min(0.90, baseVelDrum + snareVelMod), pitch: "D2" });
            lastDrumTimes.snare = time;
        }
      }

      if (isKidsMode && activeSynthConfigs.tambourine && (beat === 1 || beat === 3)) {
         let time = applyHumanization(beatStartTimeForDrums, humanizeDrumsIntensity);
         if (time <= lastDrumTimes.tambourine) time = lastDrumTimes.tambourine + TIME_EPSILON;
         if (time < totalChordProgressionSeconds - TIME_EPSILON) {
            drumEventsToSchedule.push({synth: 'tambourine', time, duration: "8n", velocity: Math.min(0.70, baseVelDrum - 0.05)});
            lastDrumTimes.tambourine = time;
         }
      }

      if (!isFillMeasure) {
          let hiHatSubdivisions = 0;
          if (isKidsMode) { hiHatSubdivisions = rhythmicDensity > 0.2 ? 1 : 0;
          } else if (genreLower.includes("jazz") || genreLower.includes("swing") || (genreLower.includes("blues") && rhythmicDensity > 0.35)) { hiHatSubdivisions = 3;
          } else if (genreLower.includes("funk") || genreLower.includes("soul") || (genreLower.includes("electronic") && rhythmicDensity > 0.5)) { hiHatSubdivisions = 4;
          } else if (rhythmicDensity > 0.2) { hiHatSubdivisions = 2;
          } else if (rhythmicDensity > 0.05) { hiHatSubdivisions = 1; }

          if (hiHatSubdivisions > 0) {
            const hiHatNoteDuration = hiHatSubdivisions === 1 ? "4n" : hiHatSubdivisions === 2 ? "8n" : hiHatSubdivisions === 3 ? "8t" : "16n";
            const useRide = activeSynthConfigs.hiHat?.instrumentHintName?.includes('Ride');
            for (let subBeat = 0; subBeat < hiHatSubdivisions; subBeat++) {
              if (beatStartTimeForDrums + (subBeat * (secondsPerBeat / hiHatSubdivisions)) >= totalChordProgressionSeconds - TIME_EPSILON) break;
              let time = applyHumanization(beatStartTimeForDrums + (subBeat * (secondsPerBeat / hiHatSubdivisions)), humanizeDrumsIntensity * 0.7);
               if (Tone.Transport.swing > 0 && hiHatSubdivisions === 2 && subBeat === 1) time += Tone.Transport.swing * (secondsPerBeat/2) * 0.5;
               if (Tone.Transport.swing > 0 && hiHatSubdivisions === 3 && subBeat > 0) time += Tone.Transport.swing * (secondsPerBeat/3) * (subBeat === 1 ? 0.33 : 0.66) * 0.5;
              if (time <= lastDrumTimes.hiHat) time = lastDrumTimes.hiHat + TIME_EPSILON;
              if (time >= totalChordProgressionSeconds - TIME_EPSILON) continue;


              const hiHatPitch = activeSynthConfigs.hiHat?.frequency || (useRide ? 300 : 400);
              let hiHatVelocity = Math.min(0.60, (baseVelDrum * 0.40) + (Math.random() * 0.05) - (subBeat % 2 === 1 && hiHatSubdivisions > 1 ? 0.03:0) );
              if (subBeat === 0 && (beat === 0 || beat === 2)) hiHatVelocity += 0.05;

              if (!isKidsMode && !useRide && hiHatSubdivisions >= 2 && subBeat === hiHatSubdivisions -1 && Math.random() < 0.1) {
                  drumEventsToSchedule.push({ synth: 'hiHat', time, duration: "8n", velocity: hiHatVelocity + 0.08, pitch: hiHatPitch + 150 });
              } else {
                  drumEventsToSchedule.push({ synth: 'hiHat', time, duration: hiHatNoteDuration, velocity: hiHatVelocity, pitch: hiHatPitch });
              }
              lastDrumTimes.hiHat = time;
            }
          }
      }
    }
    if (isFillMeasure) {
        const fillStartTime = measureStartTimeForDrums;
        for (let beat = 0; beat < BEATS_PER_MEASURE; beat++) {
            for (let sub = 0; sub < 4; sub++) {
                if (fillStartTime + (beat * secondsPerBeat) + (sub * secondsPerBeat / 4) >= totalChordProgressionSeconds - TIME_EPSILON) break;
                const time = applyHumanization(fillStartTime + (beat * secondsPerBeat) + (sub * secondsPerBeat / 4), humanizeDrumsIntensity * 0.6);
                if (time >= totalChordProgressionSeconds - TIME_EPSILON) continue;
                if (Math.random() < 0.65) {
                    const drumChoice = Math.random();
                    let synthToUse: 'snare' | 'kick' | 'hiHat' = 'snare';
                    let pitchForFill: string | number | undefined = "D2";
                    if (drumChoice < 0.6) { synthToUse = 'snare'; pitchForFill = "D2"; }
                    else if (drumChoice < 0.85) { synthToUse = 'kick'; pitchForFill = "C2"; }
                    else { synthToUse = 'hiHat'; pitchForFill = activeSynthConfigs.hiHat?.frequency || 400; }

                    drumEventsToSchedule.push({
                        synth: synthToUse, time, duration: "32n",
                        velocity: Math.min(0.9, baseVelDrum + 0.1 + Math.random() * 0.1),
                        pitch: pitchForFill
                    });
                    if (synthToUse === 'snare') lastDrumTimes.snare = time;
                    else if (synthToUse === 'kick') lastDrumTimes.kick = time;
                    else lastDrumTimes.hiHat = time;
                }
            }
        }
        const crashTime = applyHumanization(startOffset + (measure + 1) * measureDurationSeconds, humanizeDrumsIntensity);
        if (crashTime < totalChordProgressionSeconds - TIME_EPSILON) {
            drumEventsToSchedule.push({ synth: 'hiHat', time: crashTime, duration: "4n", velocity: Math.min(0.9, baseVelDrum + 0.2), pitch: activeSynthConfigs.hiHat?.frequency ? (activeSynthConfigs.hiHat.frequency*1.8) : 600});
            lastDrumTimes.hiHat = crashTime;
        }
    } else if (!isKidsMode && (measure + 1) % 8 === 0 && measure < numTotalMeasures - OUTRO_MEASURES && rhythmicDensity > 0.3) {
        const crashTime = applyHumanization(startOffset + (measure + 1) * measureDurationSeconds, humanizeDrumsIntensity);
        if (crashTime < totalChordProgressionSeconds - TIME_EPSILON) {
            drumEventsToSchedule.push({ synth: 'hiHat', time: crashTime, duration: "2n", velocity: Math.min(0.85, baseVelDrum + 0.15), pitch: activeSynthConfigs.hiHat?.frequency ? (activeSynthConfigs.hiHat.frequency*1.8) : 600});
            lastDrumTimes.hiHat = crashTime;
        }
    }
  }
  drumEventsToSchedule.forEach(ev => { overallMaxTime = Math.max(overallMaxTime, ev.time + Tone.Time(ev.duration).toSeconds()); });
  console.log(`${logPrefix} Generated ${drumEventsToSchedule.length} drum events.`);

  const finalOutroStartTime = totalChordProgressionSeconds;
  const outroDurationSeconds = OUTRO_MEASURES * measureDurationSeconds;

  // Add a final resolving chord/note for melodic instruments
  const finalTonicChordNotes = getChordNotesForKeyFromTheory(params.keySignature, params.mode, 1, chordOctave, false, params.selectedGenre, 0.1);
  if (finalTonicChordNotes.length > 0) {
    chordEventsToSchedule.push({ time: finalOutroStartTime, notes: finalTonicChordNotes, duration: `${OUTRO_MEASURES}m`, velocity: Math.min(0.50, (isKidsMode ? 0.35 : 0.40) * 0.8), filterAttack: true});
    overallMaxTime = Math.max(overallMaxTime, finalOutroStartTime + outroDurationSeconds);

    const finalMelodyNote = getScaleNoteNamesFromTheory(params.keySignature, params.mode, melodyOctave, params.selectedGenre, 0.1)[0];
    if (finalMelodyNote) {
        melodyNotesToSchedule.push({ time: finalOutroStartTime, note: finalMelodyNote, duration: `${OUTRO_MEASURES}m`, velocity: Math.min(0.55, (isKidsMode ? 0.60 : 0.65)*0.7), filterAttack:true});
    }
    const finalBassNote = getChordNotesForKeyFromTheory(params.keySignature, params.mode, 1, bassOctave, false, params.selectedGenre, 0.1)[0];
    if (finalBassNote) {
        bassNotesToSchedule.push({ time: finalOutroStartTime, note: finalBassNote, duration: `${OUTRO_MEASURES}m`, velocity: Math.min(0.60, (isKidsMode ? 0.55:0.60)*0.8), filterAttack:true});
    }
    if (playArp && arpeggioNotesToSchedule.length > 0 && activeSynthConfigs.arpeggio) {
        const finalArpNote = finalTonicChordNotes[0]?.replace(/[0-9]+$/, String(arpeggioOctave));
        if (finalArpNote) arpeggioNotesToSchedule.push({ time: finalOutroStartTime, note: finalArpNote, duration: `${OUTRO_MEASURES}m`, velocity: Math.min(0.40, (0.20)*0.7), filterAttack:true});
    }
  }
   // Final drum hit (cymbal crash)
  const finalDrumHitTime = finalOutroStartTime;
  if (drumEventsToSchedule.length > 0 || isKidsMode) { // Add if drums were used or it's kids mode
    drumEventsToSchedule.push({ synth: 'hiHat', time: finalDrumHitTime, duration: "1m", velocity: Math.min(0.7, (isKidsMode ? 0.55 : 0.65) * 0.9), pitch: activeSynthConfigs.hiHat?.frequency ? (activeSynthConfigs.hiHat.frequency * 1.8) : 600 });
    overallMaxTime = Math.max(overallMaxTime, finalDrumHitTime + measureDurationSeconds);
  }


  const effectiveRenderDuration = Math.max(MIN_EFFECTIVE_DURATION_SECONDS, overallMaxTime + REVERB_TAIL_SECONDS);
  const finalRenderDuration = Math.min(effectiveRenderDuration, MAX_WAV_RENDER_DURATION_SECONDS);
  console.log(`${logPrefix} Overall max event time (incl. outro): ${overallMaxTime.toFixed(2)}s. Effective Render Duration: ${effectiveRenderDuration.toFixed(2)}s. Final Capped Render Duration: ${finalRenderDuration.toFixed(2)}s.`);


  try {
    const audioBuffer = await Tone.Offline(async (offlineContext: Tone.OfflineContext) => {
      console.log(`${logPrefix}_OFFLINE] Inside Tone.Offline. SR: ${offlineContext.sampleRate}, Target BPM: ${currentBpm}`);
      offlineContext.transport.bpm.value = currentBpm;
      if (!isKidsMode && (genreLower.includes("jazz") || genreLower.includes("swing") || (genreLower.includes("blues") && rhythmicDensity > 0.4))) {
          offlineContext.transport.swing = 0.25;
          offlineContext.transport.swingSubdivision = "8n";
      } else {
          offlineContext.transport.swing = 0;
      }

      const masterReverb = new Tone.Reverb({decay: isKidsMode ? 0.6 : 1.2, context: offlineContext}).connect(offlineContext.destination);
      masterReverb.wet.value = isKidsMode ? 0.10 : 0.18;
      await masterReverb.ready;
      console.log(`${logPrefix}_OFFLINE] Master Reverb created. Wet: ${masterReverb.wet.value}`);

      console.log(`${logPrefix}_OFFLINE] Creating instruments in offline context...`);
      const melodyInstrumentSetup = await createSynthFromSoundDesign(activeSynthConfigs.melody, offlineContext, activeSynthConfigs.melody.instrumentHintName);
      const bassInstrumentSetup = await createSynthFromSoundDesign(activeSynthConfigs.bass, offlineContext, activeSynthConfigs.bass.instrumentHintName);
      const chordInstrumentSetup = await createSynthFromSoundDesign(activeSynthConfigs.chords, offlineContext, activeSynthConfigs.chords.instrumentHintName);
      let arpInstrumentSetupResult: InstrumentOutput | null = null;
      if (activeSynthConfigs.arpeggio && playArp && arpeggioNotesToSchedule.length > 0) {
          arpInstrumentSetupResult = await createSynthFromSoundDesign(activeSynthConfigs.arpeggio, offlineContext, activeSynthConfigs.arpeggio.instrumentHintName);
      }
      console.log(`${logPrefix}_OFFLINE] All melodic/harmonic instruments created in offline context.`);

      const { instrument: melodySynth, outputNodeToConnect: melodyOutput, filterEnv: melodyFilterEnv } = melodyInstrumentSetup;
      melodyOutput.connect(masterReverb);

      const { instrument: bassSynth, outputNodeToConnect: bassOutput, filterEnv: bassFilterEnv } = bassInstrumentSetup;
      bassOutput.connect(offlineContext.destination);

      const { instrument: chordSynth, outputNodeToConnect: chordOutput, filterEnv: chordFilterEnv } = chordInstrumentSetup;
      chordOutput.connect(masterReverb);

      let arpeggioSynth: Tone.Sampler | Tone.Instrument | undefined;
      let arpeggioFilterEnv: Tone.FrequencyEnvelope | undefined;
      if (arpInstrumentSetupResult) {
        arpeggioSynth = arpInstrumentSetupResult.instrument;
        arpeggioFilterEnv = arpInstrumentSetupResult.filterEnv;
        arpInstrumentSetupResult.outputNodeToConnect.connect(masterReverb);
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
      if (arpeggioSynth && arpInstrumentSetupResult) {
        arpeggioNotesToSchedule.forEach((ev) => {
            (arpeggioSynth as any).triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity);
             if (arpeggioFilterEnv && ev.filterAttack) arpeggioFilterEnv.triggerAttackRelease(ev.duration, ev.time);
        });
      }

      console.log(`${logPrefix}_OFFLINE] Setting up drum synths in offline context.`);
      const kickSynth = new Tone.MembraneSynth({...activeSynthConfigs.kick, context: offlineContext}).connect(offlineContext.destination);
      const snareSynth = new Tone.NoiseSynth({...activeSynthConfigs.snare, context: offlineContext}).connect(offlineContext.destination);
      const hiHatSynth = new Tone.MetalSynth({...activeSynthConfigs.hiHat, context: offlineContext}).connect(offlineContext.destination);
      let tambourineSynth;
      if (activeSynthConfigs.tambourine) {
        tambourineSynth = new Tone.NoiseSynth({...activeSynthConfigs.tambourine, context: offlineContext}).connect(offlineContext.destination);
      }
      console.log(`${logPrefix}_OFFLINE] Drum synths created and connected to offline destination.`);

      drumEventsToSchedule.forEach(ev => {
        const { synth, time, duration, velocity, pitch } = ev;
        try {
            if (synth === 'kick') kickSynth.triggerAttackRelease(pitch as string || "C2", duration, time, velocity);
            else if (synth === 'snare') snareSynth.triggerAttackRelease(duration, time, velocity);
            else if (synth === 'hiHat') hiHatSynth.triggerAttackRelease(pitch as string | number, duration, time, velocity);
            else if (synth === 'tambourine' && tambourineSynth) tambourineSynth.triggerAttackRelease(duration, time, velocity);
        } catch (e_synth) {
             console.warn(`${logPrefix}_OFFLINE_WARN] Error triggering drum synth ${synth} at time ${time}:`, e_synth)
        }
      });
      console.log(`${logPrefix}_OFFLINE] All events scheduled for offline rendering.`);
      offlineContext.transport.start(0);

    }, finalRenderDuration);

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

    
