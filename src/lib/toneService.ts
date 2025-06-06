
'use client';
import * as Tone from 'tone';
import type { MusicParameters } from '@/types';
import { audioBufferToWav } from "./audioBufferToWav"; // Ensure this is correctly imported

const SAFE_OSC_TYPE = 'triangle' as const;
const MIN_EFFECTIVE_DURATION_SECONDS = 6.0; 
const TIME_EPSILON = 0.00001; 

// Helper functions (can be expanded from midiService.ts logic or kept simple)
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
        console.warn(`[robustNoteToMidi_WARN] Invalid note format: '${noteNameWithOctave}', defaulting to C4.`);
        return DEFAULT_MIDI_NOTE;
    }
    let pitchClassName = match[1].toUpperCase();
    const accidentals = match[2]?.toUpperCase() || '';
    const octave = parseInt(match[3], 10);
    if (isNaN(octave)) {
        console.warn(`[robustNoteToMidi_WARN] Invalid octave in note: '${noteNameWithOctave}', defaulting to C4.`);
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
            console.warn(`[robustNoteToMidi_WARN] Unknown base pitch class: '${pitchClassName}' from '${noteNameWithOctave}', defaulting to C4.`);
            return DEFAULT_MIDI_NOTE;
        }
    }
    const finalMidiNumber = midiNumberBase + (effectiveOctave + 1) * 12;
    return (finalMidiNumber >= 0 && finalMidiNumber <= 127) ? finalMidiNumber : DEFAULT_MIDI_NOTE;
}

function midiToNoteName(midiNumber: number): string {
    if (typeof midiNumber !== 'number' || isNaN(midiNumber) || midiNumber < 0 || midiNumber > 127) {
        console.warn(`[midiToNoteName_WARN] Invalid MIDI number ${midiNumber}, defaulting to C4.`);
        midiNumber = DEFAULT_MIDI_NOTE;
    }
    const octave = Math.floor(midiNumber / 12) - 1;
    const noteIndex = midiNumber % 12;
    if (noteIndex < 0 || noteIndex >= NOTES_ARRAY.length) {
      console.warn(`[midiToNoteName_WARN] Invalid note index ${noteIndex} from MIDI ${midiNumber}, defaulting to C4.`);
      return 'C4';
    }
    return NOTES_ARRAY[noteIndex] + octave;
}

function getScaleNoteNames(keySignature: string, mode: string, startOctave: number = 4): string[] {
    const baseKeyForScale = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const rootMidiBase = robustNoteToMidi(baseKeyForScale + '0') % 12; 
    
    let intervals: number[];
    if (mode.toLowerCase().includes('minor')) {
        intervals = [0, 2, 3, 5, 7, 8, 10]; // Natural Minor
    } else {
        intervals = [0, 2, 4, 5, 7, 9, 11]; // Major
    }
    
    return intervals.map(interval => {
        const currentMidiValue = rootMidiBase + interval;
        const octaveOffset = Math.floor(currentMidiValue / 12); 
        const noteMidiNumber = (currentMidiValue % 12) + (startOctave + octaveOffset + 1) * 12;
        return midiToNoteName(noteMidiNumber);
    });
}

function getChordNotesForKey(keySignature: string, mode: string, degree: number, octave: number = 3): string[] {
    const rootNoteName = keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || keySignature.toUpperCase();
    const scaleNoteNames = getScaleNoteNames(rootNoteName, mode, octave);
    if (scaleNoteNames.length < 7) return [midiToNoteName(DEFAULT_MIDI_NOTE)];

    const rootOfChord = scaleNoteNames[(degree - 1 + 7) % 7];
    const rootMidi = robustNoteToMidi(rootOfChord);

    let thirdInterval = 4; 
    let fifthInterval = 7; 
    const isMinorKey = mode.toLowerCase().includes('minor');

    if (isMinorKey) {
        if (degree === 1 || degree === 4 || degree === 5) { thirdInterval = 3; } 
        if (degree === 2) { thirdInterval = 3; fifthInterval = 6; } 
    } else {
        if (degree === 2 || degree === 3 || degree === 6) { thirdInterval = 3; } 
        if (degree === 7) { thirdInterval = 3; fifthInterval = 6; } 
    }
    if (degree === 5) thirdInterval = 4; // Dominant V

    return [
        midiToNoteName(rootMidi),
        midiToNoteName(rootMidi + thirdInterval),
        midiToNoteName(rootMidi + fifthInterval)
    ].filter(name => name !== undefined && name !== null) as string[];
}

const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genre: string = '',
  isKidsMode: boolean = false,
): any => {
  const genreLower = genre.toLowerCase();
  const hintsLower = instrumentHints.map(h => h.toLowerCase());

  let configs: any = {
    melody: { oscillator: { type: 'fmsine' as const, harmonicity: 2.2, modulationIndex: 8, modulationType: "triangle" as const }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.8 }, volume: -6 },
    bass: { oscillator: { type: 'fmsine' as const, harmonicity: 1.0, modulationIndex: 2.5 }, envelope: { attack: 0.015, decay: 0.2, sustain: 0.8, release: 0.6 }, volume: -9 }, // Reduced harmonicity, modIndex, volume for bass
    chords: { oscillator: { type: 'amtriangle' as const, harmonicity: 0.6, modulationType: "sine" as const }, volume: -15, envelope: { attack: 0.15, decay: 0.6, sustain: 0.4, release: 1.3 } }, // slightly lower volume
    arpeggio: { oscillator: { type: SAFE_OSC_TYPE, harmonicity: 1.5, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.15 }, volume: -18 }, // slightly lower volume
    kick: { pitchDecay: 0.045, octaves: 7, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.35, sustain: 0.005, release: 1.0, attackCurve: "exponential" as const }, volume: -3 }, // Slightly reduced kick volume
    snare: { noise: { type: 'pink' as const }, volume: -8, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.15 } }, // slightly lower volume
    hiHat: { frequency: 380, envelope: { attack: 0.001, decay: 0.035, release: 0.035 }, harmonicity: 4.0, modulationIndex: 20, resonance: 3000, octaves: 1.1, volume: -12 },
    piano: { 
        harmonicity: 2.8, modulationIndex: 12,
        oscillator: { type: "fmsine" as const, partials: [1, 0.35, 0.12, 0.07, 0.025] }, 
        envelope: { attack: 0.01, decay: 0.55, sustain: 0.04, release: 0.75 },
        modulation: { type: "square" as const },
        modulationEnvelope: { attack: 0.012, decay: 0.25, sustain: 0.004, release: 0.45 },
        volume: -9 // Adjusted default piano volume
    }
  };
  
  if (isKidsMode) {
    configs.melody = { oscillator: { type: 'triangle' as const }, envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.4 }, volume: -3 }; // Kids melody slightly louder
    configs.bass = { oscillator: { type: 'sine' as const }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.3 }, volume: -6 };
    configs.chords = { oscillator: { type: 'square' as const }, envelope: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 }, volume: -12 };
    configs.arpeggio = { oscillator: { type: 'sawtooth' as const }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.2 }, volume: -15 };
    configs.kick.volume = -3;
    configs.snare.volume = -9;
    configs.hiHat.volume = -15;
    if (hintsLower.some(h => h.includes('piano') || h.includes('toy piano'))) {
        configs.melody = { ...configs.piano, volume: -6 }; 
        configs.chords = { ...configs.piano, volume: -14 };
    }
  } else {
     if (hintsLower.some(h => h.includes('piano'))) {
        configs.melody = { ...configs.piano, volume: -6 }; 
        configs.chords = { ...configs.piano, volume: -12 };
    } else if (genreLower.includes('electronic') || genreLower.includes('pop')) {
      configs.melody.oscillator.type = 'fatsawtooth' as const; ((configs.melody.oscillator) as any).count = 3; ((configs.melody.oscillator) as any).spread = 15; configs.melody.volume = -6;
      configs.bass.oscillator.type = 'fatsquare' as const; ((configs.bass.oscillator) as any).count = 2; ((configs.bass.oscillator) as any).spread = 18; configs.bass.volume = -9; // Adjusted fat square bass
      configs.chords.oscillator.type = 'fatsawtooth' as const; ((configs.chords.oscillator) as any).count = 4; ((configs.chords.oscillator) as any).spread = 35; configs.chords.volume = -18;
      configs.arpeggio.oscillator.type = SAFE_OSC_TYPE; configs.arpeggio.volume = -20;
    } else if (genreLower.includes('rock') || genreLower.includes('metal')) {
      configs.melody.oscillator.type = 'fatsawtooth' as const; ((configs.melody.oscillator) as any).count = 2; ((configs.melody.oscillator) as any).spread = 18; configs.melody.envelope.attack = 0.01; configs.melody.volume = -6;
      configs.bass.oscillator.type = 'fatsquare' as const; ((configs.bass.oscillator) as any).count = 2; ((configs.bass.oscillator) as any).spread = 18; configs.bass.volume = -9; // Adjusted fat square bass
      configs.chords.oscillator.type = 'fatsquare' as const; ((configs.chords.oscillator) as any).count = 3; ((configs.chords.oscillator) as any).spread = 22; configs.chords.volume = -18;
      configs.kick.volume = 0; // Rock/Metal kick can be louder
      configs.snare.volume = -6;
    } else if (genreLower.includes('jazz')) {
      configs.melody = { ...configs.piano, volume: -6 };
      configs.bass.oscillator.type = 'sine' as const; configs.bass.envelope = { attack: 0.005, decay: 0.1, sustain: 0.9, release: 0.4 }; configs.bass.volume = -9; // Jazz bass
      configs.chords = { ...configs.piano, volume: -16 };
      configs.kick.volume = -9; // Softer kick for jazz
      configs.snare.volume = -12;
      configs.hiHat.volume = -18;
    }
  }
  return configs;
};


export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  const logPrefix = "[WAV_GEN_DIRECT_REVERB_M_B_C_A_DRUMS]";
  console.log(`${logPrefix} Starting direct synthesis for: ${params.generatedIdea.substring(0, 30)}...`);

  if (Tone.context.state !== 'running') {
    console.error(`${logPrefix}_ERROR] Global Tone.context is NOT 'running'. Aborting WAV generation.`);
    return null;
  }
  console.log(`${logPrefix} Global Tone.context state is 'running'.`);

  Tone.Transport.stop(true);
  Tone.Transport.cancel(0);
  console.log(`${logPrefix} Global Tone.Transport cleared and stopped.`);
  Tone.Destination.volume.value = 0; 
  console.log(`${logPrefix} Global Tone.Destination volume set to ${Tone.Destination.volume.value}dB.`);
  Tone.Transport.bpm.value = params.tempoBpm || 120;
  console.log(`${logPrefix} Transport BPM set to: ${Tone.Transport.bpm.value}`);

  const synthConfigs = getSynthConfigurations(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids');

  const startOffset = 0.2; 
  const secondsPerBeat = 60 / (params.tempoBpm || 120);
  const beatsPerMeasure = 4;
  const measureDurationSeconds = beatsPerMeasure * secondsPerBeat;
  let overallMaxTime = startOffset;

  // --- Melody ---
  const melodyNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const melodyOctave = params.originalInput.mode === 'kids' ? 5 : 4;
  const scaleNoteNames = getScaleNoteNames(params.keySignature, params.mode, melodyOctave);
  let melodyCurrentTime = startOffset;
  const numMelodyNotes = 8; 
  const melodyNoteDurationNotation = params.rhythmicDensity > 0.5 ? "8n" : "4n";
  const melodyNoteDurationSeconds = Tone.Time(melodyNoteDurationNotation).toSeconds();

  for (let i = 0; i < numMelodyNotes; i++) {
    if (scaleNoteNames.length > 0) {
      const noteName = scaleNoteNames[i % scaleNoteNames.length];
      melodyNotesToSchedule.push({ time: melodyCurrentTime, note: noteName, duration: melodyNoteDurationNotation, velocity: 0.7 });
      overallMaxTime = Math.max(overallMaxTime, melodyCurrentTime + melodyNoteDurationSeconds);
      melodyCurrentTime += melodyNoteDurationSeconds * (params.rhythmicDensity > 0.6 ? 1.1 : 1.3); 
    }
  }

  // --- Bass Line ---
  const bassNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const bassOctave = params.originalInput.mode === 'kids' ? 3 : 2;
  const rootNoteNameForBass = (params.keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || params.keySignature.toUpperCase()) + bassOctave;
  const bassNoteMidi = robustNoteToMidi(rootNoteNameForBass);
  const bassNoteName = midiToNoteName(bassNoteMidi);
  const numBassMeasures = 2;
  const bassNoteDurationNotation = "2n";
  const bassNoteDurationSeconds = Tone.Time(bassNoteDurationNotation).toSeconds();

  for (let i = 0; i < numBassMeasures; i++) {
      const bassTime = startOffset + (i * measureDurationSeconds);
      bassNotesToSchedule.push({ time: bassTime, note: bassNoteName, duration: bassNoteDurationNotation, velocity: 0.6 });
      overallMaxTime = Math.max(overallMaxTime, bassTime + bassNoteDurationSeconds);
  }

  // --- Chords ---
  const chordEventsToSchedule: { time: number, notes: string[], duration: string, velocity: number }[] = [];
  const chordOctave = params.originalInput.mode === 'kids' ? 4 : 3;
  const progressionDegrees = [1, 5, 6, 4]; 
  const numChordCycles = 2; 
  const chordDurationNotation = "1m"; // Each chord lasts one measure
  const chordDurationSeconds = Tone.Time(chordDurationNotation).toSeconds();
  let chordCurrentTime = startOffset;

  for (let cycle = 0; cycle < numChordCycles; cycle++) {
    for (const degree of progressionDegrees) {
      const chordNoteNames = getChordNotesForKey(params.keySignature, params.mode, degree, chordOctave);
      if (chordNoteNames.length > 0) {
          chordEventsToSchedule.push({ time: chordCurrentTime, notes: chordNoteNames, duration: chordDurationNotation, velocity: 0.5 });
          overallMaxTime = Math.max(overallMaxTime, chordCurrentTime + chordDurationSeconds);
      }
      chordCurrentTime += measureDurationSeconds;
    }
  }
  
  // --- Arpeggio ---
  const arpeggioNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const arpeggioOctave = params.originalInput.mode === 'kids' ? 5 : 4;
  const arpNoteDurationNotation = "16n";
  const arpNoteDurationSeconds = Tone.Time(arpNoteDurationNotation).toSeconds();

  for (const chordEvent of chordEventsToSchedule) {
      const chordRootMidi = robustNoteToMidi(chordEvent.notes[0]);
      const arpBaseNotes = [
          midiToNoteName(chordRootMidi), // Root
          midiToNoteName(chordRootMidi + (getChordNotesForKey(params.keySignature, params.mode, 1, 0).includes(midiToNoteName(chordRootMidi + 3)) ? 3 : 4)), // Third
          midiToNoteName(chordRootMidi + 7), // Fifth
          midiToNoteName(chordRootMidi + 12) // Root Octave Up
      ].map(n => midiToNoteName(robustNoteToMidi(n.replace(/[0-9]+$/, String(arpeggioOctave)))));

      // Play arpeggio for first two beats of each measure
      for (let beat = 0; beat < 2; beat++) { 
          for (let i = 0; i < 4; i++) { // 4 sixteenth notes per beat
              const noteTime = chordEvent.time + (beat * secondsPerBeat) + (i * arpNoteDurationSeconds);
              if (arpBaseNotes.length > 0) {
                arpeggioNotesToSchedule.push({ time: noteTime, note: arpBaseNotes[i % arpBaseNotes.length], duration: arpNoteDurationNotation, velocity: 0.4 });
                overallMaxTime = Math.max(overallMaxTime, noteTime + arpNoteDurationSeconds);
              }
          }
      }
  }
  
  // --- Drums ---
  const drumEventsToSchedule: { synth: 'kick' | 'snare' | 'hiHat', time: number, duration: string, velocity: number, pitch?: string | number}[] = [];
  const numDrumMeasures = Math.ceil(chordCurrentTime / measureDurationSeconds);

  for (let measure = 0; measure < numDrumMeasures; measure++) {
    for (let beat = 0; beat < beatsPerMeasure; beat++) {
      const currentTimeForDrumsThisBeat = startOffset + (measure * measureDurationSeconds) + (beat * secondsPerBeat);

      if (beat === 0 || beat === 2) { 
        drumEventsToSchedule.push({ synth: 'kick', time: currentTimeForDrumsThisBeat, duration: "8n", velocity: 0.8, pitch: "C2" });
      }
      if (beat === 1 || beat === 3) { 
        drumEventsToSchedule.push({ synth: 'snare', time: currentTimeForDrumsThisBeat, duration: "16n", velocity: 0.7 });
      }
      
      const hiHatSubdivisions = params.rhythmicDensity < 0.4 ? 1 : (params.rhythmicDensity < 0.7 ? 2 : 4); 
      const hiHatDurationNotation = hiHatSubdivisions === 1 ? "4n" : (hiHatSubdivisions === 2 ? "8n" : "16n");
      for (let subBeat = 0; subBeat < hiHatSubdivisions; subBeat++) {
        const hiHatTime = currentTimeForDrumsThisBeat + (subBeat * (secondsPerBeat / hiHatSubdivisions));
        drumEventsToSchedule.push({ synth: 'hiHat', time: hiHatTime, duration: hiHatDurationNotation, velocity: 0.5, pitch: synthConfigs.hiHat.frequency || 300 });
      }
    }
  }
  drumEventsToSchedule.forEach(ev => {
      overallMaxTime = Math.max(overallMaxTime, ev.time + Tone.Time(ev.duration).toSeconds());
  });

  const renderDuration = Math.max(overallMaxTime + 2.5, MIN_EFFECTIVE_DURATION_SECONDS); // Increased overallMaxTime buffer for reverb tail
  console.log(`${logPrefix} Calculated renderDuration: ${renderDuration.toFixed(2)}s.`);

  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log(`${logPrefix}_OFFLINE] Inside Tone.Offline. Offline Context SR: ${offlineContext.sampleRate}`);
      offlineContext.transport.bpm.value = Tone.Transport.bpm.value;

      const reverb = new Tone.Reverb(1.5).connect(offlineContext.destination); 
      await reverb.ready;
      console.log(`${logPrefix}_OFFLINE] Reverb created and ready. Decay: ${reverb.decay}`);

      const melodySynth = new Tone.PolySynth(Tone.FMSynth, synthConfigs.piano).connect(reverb); // Using piano config for melody as example
      melodySynth.volume.value = synthConfigs.piano.volume !== undefined ? synthConfigs.piano.volume : -6; // Match config
      console.log(`${logPrefix}_OFFLINE] MelodySynth (FMSynth) created. Volume: ${melodySynth.volume.value}`);
      if (melodyNotesToSchedule.length === 0) console.warn(`${logPrefix}_OFFLINE] No melody notes to schedule.`);
      else console.log(`${logPrefix}_OFFLINE] Scheduling ${melodyNotesToSchedule.length} melody notes.`);
      melodyNotesToSchedule.forEach((ev) => melodySynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));

      const bassSynth = new Tone.Synth(synthConfigs.bass).connect(offlineContext.destination); // Bass usually dry
      console.log(`${logPrefix}_OFFLINE] BassSynth created. Volume: ${bassSynth.volume.value}`);
      if (bassNotesToSchedule.length === 0) console.warn(`${logPrefix}_OFFLINE] No bass notes to schedule.`);
      else console.log(`${logPrefix}_OFFLINE] Scheduling ${bassNotesToSchedule.length} bass notes.`);
      bassNotesToSchedule.forEach((ev) => bassSynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
      
      const chordSynth = new Tone.PolySynth(Tone.FMSynth, synthConfigs.chords).connect(reverb);
      chordSynth.volume.value = synthConfigs.chords.volume !== undefined ? synthConfigs.chords.volume : -12;
      console.log(`${logPrefix}_OFFLINE] ChordSynth (FMSynth) created. Volume: ${chordSynth.volume.value}`);
      if (chordEventsToSchedule.length === 0) console.warn(`${logPrefix}_OFFLINE] No chord events to schedule.`);
      else console.log(`${logPrefix}_OFFLINE] Scheduling ${chordEventsToSchedule.length} chord events.`);
      chordEventsToSchedule.forEach((ev) => chordSynth.triggerAttackRelease(ev.notes, ev.duration, ev.time, ev.velocity));

      const arpeggioSynth = new Tone.PolySynth(Tone.FMSynth, synthConfigs.arpeggio).connect(reverb);
      arpeggioSynth.set(synthConfigs.arpeggio); 
      arpeggioSynth.volume.value = synthConfigs.arpeggio.volume !== undefined ? synthConfigs.arpeggio.volume : -15;
      console.log(`${logPrefix}_OFFLINE] ArpeggioSynth (FMSynth) created. Volume: ${arpeggioSynth.volume.value}`);
      if (arpeggioNotesToSchedule.length === 0) console.warn(`${logPrefix}_OFFLINE] No arpeggio notes to schedule.`);
      else console.log(`${logPrefix}_OFFLINE] Scheduling ${arpeggioNotesToSchedule.length} arpeggio notes.`);
      arpeggioNotesToSchedule.forEach((ev) => arpeggioSynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));

      console.log(`${logPrefix}_OFFLINE] Setting up drum synths.`);
      const kickSynth = new Tone.MembraneSynth(synthConfigs.kick).connect(offlineContext.destination);
      const snareSynth = new Tone.NoiseSynth(synthConfigs.snare).connect(offlineContext.destination);
      const hiHatSynth = new Tone.MetalSynth(synthConfigs.hiHat).connect(offlineContext.destination);
      console.log(`${logPrefix}_OFFLINE] Drum synths created and connected to offlineContext.destination.`);

      if (drumEventsToSchedule.length === 0) console.warn(`${logPrefix}_OFFLINE] No drum events to schedule.`);
      else console.log(`${logPrefix}_OFFLINE] Scheduling ${drumEventsToSchedule.length} drum events.`);
      
      let lastKickTime = -1, lastSnareTime = -1, lastHiHatTime = -1;

      drumEventsToSchedule.forEach(ev => {
        let correctedTime = ev.time;
        if (ev.synth === 'kick') {
          if (correctedTime <= lastKickTime) correctedTime = lastKickTime + TIME_EPSILON;
          if (ev.pitch) kickSynth.triggerAttackRelease(ev.pitch as string, ev.duration, correctedTime, ev.velocity);
          lastKickTime = correctedTime;
          // console.log(`${logPrefix}_OFFLINE_SCHED_KICK] Time=${correctedTime.toFixed(3)}, Pitch=${ev.pitch}, Vel=${ev.velocity.toFixed(2)}`);
        } else if (ev.synth === 'snare') {
          if (correctedTime <= lastSnareTime) correctedTime = lastSnareTime + TIME_EPSILON;
          snareSynth.triggerAttackRelease(ev.duration, correctedTime, ev.velocity);
          lastSnareTime = correctedTime;
          // console.log(`${logPrefix}_OFFLINE_SCHED_SNARE] Time=${correctedTime.toFixed(3)}, Vel=${ev.velocity.toFixed(2)}`);
        } else if (ev.synth === 'hiHat') {
          if (correctedTime <= lastHiHatTime) correctedTime = lastHiHatTime + TIME_EPSILON;
          hiHatSynth.triggerAttackRelease(
            typeof ev.pitch === 'number' ? ev.pitch : (synthConfigs.hiHat.frequency || 300), 
            ev.duration, 
            correctedTime, 
            ev.velocity
          );
          lastHiHatTime = correctedTime;
          // console.log(`${logPrefix}_OFFLINE_SCHED_HIHAT] Time=${correctedTime.toFixed(3)}, Pitch=${ev.pitch}, Vel=${ev.velocity.toFixed(2)}`);
        }
      });

    }, renderDuration);

    console.log(`${logPrefix} Tone.Offline rendering complete. AudioBuffer duration: ${audioBuffer.duration.toFixed(3)}s`);
    
    let isSilent = true; let maxVal = 0;
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      const channelData = audioBuffer.getChannelData(i);
      for (let j = 0; j < channelData.length; j++) {
        if (Math.abs(channelData[j]) > 1e-5) { isSilent = false; }
        if (Math.abs(channelData[j]) > maxVal) { maxVal = Math.abs(channelData[j]); }
      }
      if (!isSilent) console.log(`${logPrefix}_OFFLINE] Channel ${i} max absolute value: ${maxVal.toExponential(3)}`);
      if (!isSilent) break;
    }

    if (isSilent) console.warn(`${logPrefix}_WARN] Rendered AudioBuffer appears to be silent or very quiet.`);
    else console.log(`${logPrefix} Rendered AudioBuffer contains non-zero samples.`);

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
