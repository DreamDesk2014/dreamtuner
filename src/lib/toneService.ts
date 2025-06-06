
'use client';
import * as Tone from 'tone';
import type { MusicParameters } from '@/types';
// Removed MIDI related imports as we are doing direct synthesis for WAV
import { audioBufferToWav } from "./audioBufferToWav"; 

const SAFE_OSC_TYPE = 'triangle' as const;
const MIN_EFFECTIVE_DURATION_SECONDS = 6.0; 

// Helper functions for direct synthesis (can be expanded from midiService.ts logic)
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
    const scaleNoteNames = getScaleNoteNames(rootNoteName, mode, octave); // Get scale notes in the target octave for root
    if (scaleNoteNames.length < 7) return [midiToNoteName(DEFAULT_MIDI_NOTE)];

    const rootOfChord = scaleNoteNames[(degree - 1 + 7) % 7]; // Degree 1 is index 0
    const rootMidi = robustNoteToMidi(rootOfChord);

    // Determine quality based on degree in major/minor key (simplified)
    let thirdInterval = 4; // Major third
    let fifthInterval = 7; // Perfect fifth

    const isMinorKey = mode.toLowerCase().includes('minor');

    if (isMinorKey) {
        // Diatonic chords in natural minor: i, ii°, III, iv, v, VI, VII
        if (degree === 1 || degree === 4 || degree === 5) { thirdInterval = 3; } // i, iv, v are minor
        if (degree === 2) { thirdInterval = 3; fifthInterval = 6; } // ii° is diminished
        // III, VI, VII are major relative to their roots
    } else {
        // Diatonic chords in major: I, ii, iii, IV, V, vi, vii°
        if (degree === 2 || degree === 3 || degree === 6) { thirdInterval = 3; } // ii, iii, vi are minor
        if (degree === 7) { thirdInterval = 3; fifthInterval = 6; } // vii° is diminished
    }
     // For V chord, often make it major (dominant) even in minor key for resolution
    if (degree === 5) thirdInterval = 4;


    const thirdMidi = rootMidi + thirdInterval;
    const fifthMidi = rootMidi + fifthInterval;

    return [
        midiToNoteName(rootMidi),
        midiToNoteName(thirdMidi),
        midiToNoteName(fifthMidi)
    ].filter(name => name !== undefined && name !== null) as string[];
}


const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genre: string = '',
  isKidsMode: boolean = false,
  aiGeneratedIdea: string = '',
  rhythmicDensity: number = 0.5,
  harmonicComplexity: number = 0.5
): any => {
  const genreLower = genre.toLowerCase();
  const hintsLower = instrumentHints.map(h => h.toLowerCase());

  let configs: any = {
    melody: { oscillator: { type: SAFE_OSC_TYPE }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.6 }, volume: -3 },
    bass: { oscillator: { type: 'fmsine' as const, harmonicity: 1.2, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, volume: -6 },
    chords: { oscillator: { type: 'amtriangle' as const, harmonicity: 0.5, modulationType: "sine" as const }, volume: -12, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 } },
    arpeggio: { oscillator: { type: SAFE_OSC_TYPE, harmonicity: 1.5, modulationIndex: 8 }, envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.2 }, volume: -15 },
    kick: { pitchDecay: 0.05, octaves: 10, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" as const }, volume: 0 },
    snare: { noise: { type: 'pink' as const }, volume: -5, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } },
    hiHat: { frequency: 300, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5, volume: -8 }, // Increased volume
    piano: { 
        harmonicity: 3.1, modulationIndex: 16,
        oscillator: { type: "fmsine" as const, partials: [1, 0.5, 0.2, 0.1, 0.05] }, 
        envelope: { attack: 0.01, decay: 0.7, sustain: 0.1, release: 0.9 },
        modulation: { type: "square" as const },
        modulationEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.01, release: 0.6 },
        volume: -6 
    }
  };
  
  for (const key in configs) {
    const synthConfig = configs[key as keyof typeof configs];
    if (synthConfig.oscillator && (synthConfig.oscillator.type === 'pwm' || synthConfig.oscillator.type === 'pulse')) {
      console.log(`[getSynthConfigurations_Sanitize] For ${key}, replacing unsafe oscillator type '${synthConfig.oscillator.type}' with '${SAFE_OSC_TYPE}'.`);
      synthConfig.oscillator.type = SAFE_OSC_TYPE;
      if ('modulationFrequency' in synthConfig.oscillator) delete synthConfig.oscillator.modulationFrequency;
      if ('width' in synthConfig.oscillator) delete synthConfig.oscillator.width;
    }
  }
  
  if (isKidsMode) {
    configs.melody = { oscillator: { type: 'triangle' as const }, envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.4 }, volume: 0 };
    configs.bass = { oscillator: { type: 'sine' as const }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.3 }, volume: -3 };
    configs.chords = { oscillator: { type: 'square' as const }, envelope: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 }, volume: -9 };
    configs.arpeggio = { oscillator: { type: 'sawtooth' as const }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.2 }, volume: -12 };
    if (hintsLower.some(h => h.includes('piano') || h.includes('toy piano'))) {
        configs.melody = { ...configs.piano, volume: -3 }; 
        configs.chords = { ...configs.piano, volume: -10 };
    }
  } else {
     if (hintsLower.some(h => h.includes('piano'))) {
        configs.melody = { ...configs.piano, volume: -3 };
        configs.chords = { ...configs.piano, volume: -9 };
    } else if (genreLower.includes('electronic') || genreLower.includes('pop')) {
      configs.melody.oscillator.type = SAFE_OSC_TYPE; configs.melody.volume = -3;
      configs.bass.oscillator.type = 'fatsquare' as const; ((configs.bass.oscillator) as any).count = 3; ((configs.bass.oscillator) as any).spread = 15; configs.bass.volume = -6;
      configs.chords.oscillator.type = SAFE_OSC_TYPE; configs.chords.volume = -12;
      configs.arpeggio.oscillator.type = 'fatsawtooth' as const; ((configs.arpeggio.oscillator) as any).count = 3; ((configs.arpeggio.oscillator) as any).spread = 20; configs.arpeggio.volume = -15;
    } else if (genreLower.includes('rock') || genreLower.includes('metal')) {
      configs.melody.oscillator.type = 'fatsawtooth' as const; ((configs.melody.oscillator) as any).count = 2; ((configs.melody.oscillator) as any).spread = 20; configs.melody.envelope.attack = 0.01; configs.melody.volume = -3;
      configs.bass.oscillator.type = 'fatsquare' as const; ((configs.bass.oscillator) as any).count = 3; ((configs.bass.oscillator) as any).spread = 20; configs.bass.volume = -6;
      configs.chords.oscillator.type = 'fatsquare' as const; ((configs.chords.oscillator) as any).count = 3; ((configs.chords.oscillator) as any).spread = 25; configs.chords.volume = -12;
    } else if (genreLower.includes('jazz')) {
      configs.melody = { ...configs.piano, volume: -3 };
      configs.bass.oscillator.type = 'sine' as const; configs.bass.volume = -6;
      configs.chords = { ...configs.piano, volume: -12 };
    }
  }
  return configs;
};

export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  const logPrefix = "[WAV_GEN_DIRECT_M_B_C_A_DRUMS]"; // Melody, Bass, Chords, Arp, Drums
  console.log(`${logPrefix} Starting direct synthesis for: ${params.generatedIdea.substring(0, 30)}...`);

  if (Tone.context.state !== 'running') {
    console.error(`${logPrefix}_ERROR] Global Tone.context is NOT 'running'. Aborting WAV generation.`);
    return null;
  }
  console.log(`${logPrefix} Global Tone.context state is 'running'.`);

  Tone.Transport.stop(true);
  Tone.Transport.cancel(0);
  Tone.Destination.volume.value = -6; 
  Tone.Transport.bpm.value = params.tempoBpm || 120;
  console.log(`${logPrefix} Transport BPM set to: ${Tone.Transport.bpm.value}`);

  const synthConfigs = getSynthConfigurations(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids', params.generatedIdea, params.rhythmicDensity, params.harmonicComplexity);

  const startOffset = 0.2; // Small delay at the beginning
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
  const melodyNoteDurationNotation = params.rhythmicDensity > 0.6 ? "8n" : "4n";
  const melodyNoteDurationSeconds = Tone.Time(melodyNoteDurationNotation).toSeconds();

  for (let i = 0; i < numMelodyNotes; i++) {
    if (scaleNoteNames.length > 0) {
      const noteName = scaleNoteNames[i % scaleNoteNames.length];
      melodyNotesToSchedule.push({
        time: melodyCurrentTime,
        note: noteName,
        duration: melodyNoteDurationNotation,
        velocity: 0.7 
      });
      overallMaxTime = Math.max(overallMaxTime, melodyCurrentTime + melodyNoteDurationSeconds);
      melodyCurrentTime += melodyNoteDurationSeconds * (params.rhythmicDensity > 0.6 ? 1.0 : 1.2); // Adjusted spacing
    }
  }

  // --- Bass Line ---
  const bassNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const bassOctave = params.originalInput.mode === 'kids' ? 3 : 2;
  const rootNoteNameForBass = (params.keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || params.keySignature.toUpperCase()) + bassOctave;
  const bassNoteMidi = robustNoteToMidi(rootNoteNameForBass);
  const bassNoteName = midiToNoteName(bassNoteMidi);
  const numBassMeasures = 2; 
  let bassCurrentTime = startOffset;

  for (let i = 0; i < numBassMeasures; i++) {
      const bassNoteDurationNotation = "2n"; 
      bassNotesToSchedule.push({
          time: bassCurrentTime + (i * measureDurationSeconds),
          note: bassNoteName,
          duration: bassNoteDurationNotation,
          velocity: 0.6
      });
      overallMaxTime = Math.max(overallMaxTime, bassCurrentTime + (i * measureDurationSeconds) + Tone.Time(bassNoteDurationNotation).toSeconds());
  }

  // --- Chords ---
  const chordNotesToSchedule: { time: number, notes: string[], duration: string, velocity: number }[] = [];
  const chordOctave = params.originalInput.mode === 'kids' ? 4 : 3;
  const progressionDegrees = [1, 5, 6, 4]; // I-V-vi-IV
  const numChordMeasures = 2; // Play progression twice for total of 8 measures if each chord is 1 measure
  let chordCurrentTime = startOffset;

  for (let i = 0; i < numChordMeasures * progressionDegrees.length; i++) {
      const degree = progressionDegrees[i % progressionDegrees.length];
      const chordNoteNames = getChordNotesForKey(params.keySignature, params.mode, degree, chordOctave);
      const chordDurationNotation = "1m"; // Whole measure for each chord

      if (chordNoteNames.length > 0) {
          chordNotesToSchedule.push({
              time: chordCurrentTime,
              notes: chordNoteNames,
              duration: chordDurationNotation,
              velocity: 0.5
          });
          overallMaxTime = Math.max(overallMaxTime, chordCurrentTime + Tone.Time(chordDurationNotation).toSeconds());
      }
      chordCurrentTime += measureDurationSeconds;
  }
  
  // --- Arpeggio ---
  const arpeggioNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const arpeggioOctave = params.originalInput.mode === 'kids' ? 5 : 4;
  let arpeggioCurrentTime = startOffset;

  for (const chordEvent of chordNotesToSchedule) { // Arpeggiate over each scheduled chord
      const chordRootMidi = robustNoteToMidi(chordEvent.notes[0]);
      const arpNotes = [
          midiToNoteName(chordRootMidi),
          midiToNoteName(chordRootMidi + (getChordNotesForKey(params.keySignature, params.mode, 1, 0).includes(midiToNoteName(chordRootMidi + 3)) ? 3 : 4)), // crude third
          midiToNoteName(chordRootMidi + 7), // fifth
          midiToNoteName(chordRootMidi + 12) // octave
      ].map(n => midiToNoteName(robustNoteToMidi(n.replace(/[0-9]+$/, String(arpeggioOctave)))));


      const arpNoteDurationNotation = "16n";
      const arpNoteDurationSeconds = Tone.Time(arpNoteDurationNotation).toSeconds();
      
      // Play arpeggio for first two beats of the measure
      for (let beat = 0; beat < 2; beat++) { 
          for (let i = 0; i < 4; i++) { // 4 notes per beat (16ths)
              const noteTime = chordEvent.time + (beat * secondsPerBeat) + (i * arpNoteDurationSeconds);
              if (arpNotes.length > 0) {
                arpeggioNotesToSchedule.push({
                    time: noteTime,
                    note: arpNotes[i % arpNotes.length],
                    duration: arpNoteDurationNotation,
                    velocity: 0.4
                });
                overallMaxTime = Math.max(overallMaxTime, noteTime + arpNoteDurationSeconds);
              }
          }
      }
  }
  
  // --- Drums ---
  const drumEventsToSchedule: {synth: 'kick' | 'snare' | 'hiHat', time: number, duration: string, velocity: number, pitch?: string | number}[] = [];
  const numDrumMeasures = Math.ceil(overallMaxTime / measureDurationSeconds);

  for (let measure = 0; measure < numDrumMeasures; measure++) {
    for (let beat = 0; beat < beatsPerMeasure; beat++) {
      const currentTimeForDrums = startOffset + (measure * measureDurationSeconds) + (beat * secondsPerBeat);

      if (beat === 0 || beat === 2) { // Kick on 1 and 3
        drumEventsToSchedule.push({ synth: 'kick', time: currentTimeForDrums, duration: "8n", velocity: 0.8, pitch: "C2" });
      }
      if (beat === 1 || beat === 3) { // Snare on 2 and 4
        drumEventsToSchedule.push({ synth: 'snare', time: currentTimeForDrums, duration: "16n", velocity: 0.7 });
      }
      
      const hiHatSubdivisions = params.rhythmicDensity < 0.4 ? 1 : 2; // 1 for 4ths, 2 for 8ths
      for (let subBeat = 0; subBeat < hiHatSubdivisions; subBeat++) {
        const hiHatTime = currentTimeForDrums + (subBeat * (secondsPerBeat / hiHatSubdivisions));
        drumEventsToSchedule.push({ synth: 'hiHat', time: hiHatTime, duration: "16n", velocity: 0.5, pitch: synthConfigs.hiHat.frequency || 300 });
      }
    }
  }


  const renderDuration = Math.max(overallMaxTime + 2.0, MIN_EFFECTIVE_DURATION_SECONDS); 
  console.log(`${logPrefix} Calculated renderDuration: ${renderDuration.toFixed(2)}s.`);

  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log(`${logPrefix}_OFFLINE] Inside Tone.Offline. Offline Context SR: ${offlineContext.sampleRate}`);
      offlineContext.transport.bpm.value = Tone.Transport.bpm.value; // Ensure offline transport uses correct BPM

      const reverb = new Tone.Reverb(1.5).connect(offlineContext.destination); // 1.5s decay
      await reverb.ready; // Ensure reverb is ready before connecting anything to it.
      console.log(`${logPrefix}_OFFLINE] Reverb created and ready.`);


      // Melody Synth
      const melodySynth = new Tone.PolySynth(Tone.FMSynth, synthConfigs.piano).connect(reverb);
      melodySynth.volume.value = synthConfigs.piano.volume !== undefined ? synthConfigs.piano.volume : -6;
      console.log(`${logPrefix}_OFFLINE] MelodySynth (FMSynth) created. Volume: ${melodySynth.volume.value}`);
      if (melodyNotesToSchedule.length === 0) console.warn(`${logPrefix}_OFFLINE] No melody notes to schedule.`);
      else console.log(`${logPrefix}_OFFLINE] Scheduling ${melodyNotesToSchedule.length} melody notes.`);
      melodyNotesToSchedule.forEach((ev) => melodySynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));

      // Bass Synth
      const bassSynth = new Tone.Synth(synthConfigs.bass).connect(offlineContext.destination); // Bass usually dry
      console.log(`${logPrefix}_OFFLINE] BassSynth created. Volume: ${bassSynth.volume.value}`);
      if (bassNotesToSchedule.length === 0) console.warn(`${logPrefix}_OFFLINE] No bass notes to schedule.`);
      else console.log(`${logPrefix}_OFFLINE] Scheduling ${bassNotesToSchedule.length} bass notes.`);
      bassNotesToSchedule.forEach((ev) => bassSynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));
      
      // Chord Synth
      const chordSynth = new Tone.PolySynth(Tone.FMSynth, synthConfigs.chords).connect(reverb);
      chordSynth.volume.value = synthConfigs.chords.volume !== undefined ? synthConfigs.chords.volume : -12;
      console.log(`${logPrefix}_OFFLINE] ChordSynth (FMSynth) created. Volume: ${chordSynth.volume.value}`);
      if (chordNotesToSchedule.length === 0) console.warn(`${logPrefix}_OFFLINE] No chord notes to schedule.`);
      else console.log(`${logPrefix}_OFFLINE] Scheduling ${chordNotesToSchedule.length} chord events.`);
      chordNotesToSchedule.forEach((ev) => chordSynth.triggerAttackRelease(ev.notes, ev.duration, ev.time, ev.velocity));

      // Arpeggio Synth
      const arpeggioSynth = new Tone.PolySynth(Tone.FMSynth, synthConfigs.arpeggio).connect(reverb);
      arpeggioSynth.set(synthConfigs.arpeggio); // Ensure all params applied
      arpeggioSynth.volume.value = synthConfigs.arpeggio.volume !== undefined ? synthConfigs.arpeggio.volume : -15;
      console.log(`${logPrefix}_OFFLINE] ArpeggioSynth (FMSynth) created. Volume: ${arpeggioSynth.volume.value}`);
      if (arpeggioNotesToSchedule.length === 0) console.warn(`${logPrefix}_OFFLINE] No arpeggio notes to schedule.`);
      else console.log(`${logPrefix}_OFFLINE] Scheduling ${arpeggioNotesToSchedule.length} arpeggio notes.`);
      arpeggioNotesToSchedule.forEach((ev) => arpeggioSynth.triggerAttackRelease(ev.note, ev.duration, ev.time, ev.velocity));

      // Drum Synths
      console.log(`${logPrefix}_OFFLINE] Setting up drum synths.`);
      const kickSynth = new Tone.MembraneSynth(synthConfigs.kick).connect(offlineContext.destination);
      const snareSynth = new Tone.NoiseSynth(synthConfigs.snare).connect(offlineContext.destination);
      const hiHatSynth = new Tone.MetalSynth(synthConfigs.hiHat).connect(offlineContext.destination);
      console.log(`${logPrefix}_OFFLINE] Drum synths created and connected to offlineContext.destination.`);


      if (drumEventsToSchedule.length === 0) console.warn(`${logPrefix}_OFFLINE] No drum events to schedule.`);
      else console.log(`${logPrefix}_OFFLINE] Scheduling ${drumEventsToSchedule.length} drum events.`);
      
      drumEventsToSchedule.forEach(ev => {
        if (ev.synth === 'kick' && ev.pitch) {
          kickSynth.triggerAttackRelease(ev.pitch as string, ev.duration, ev.time, ev.velocity);
          console.log(`${logPrefix}_OFFLINE_SCHED_KICK] Time=${ev.time.toFixed(3)}, Pitch=${ev.pitch}, Vel=${ev.velocity.toFixed(2)}`);
        } else if (ev.synth === 'snare') {
          snareSynth.triggerAttackRelease(ev.duration, ev.time, ev.velocity);
          console.log(`${logPrefix}_OFFLINE_SCHED_SNARE] Time=${ev.time.toFixed(3)}, Vel=${ev.velocity.toFixed(2)}`);
        } else if (ev.synth === 'hiHat') {
          // MetalSynth is triggered with duration, time, velocity. Frequency is part of its config.
          hiHatSynth.triggerAttackRelease(ev.duration, ev.time, ev.velocity);
          console.log(`${logPrefix}_OFFLINE_SCHED_HIHAT] Time=${ev.time.toFixed(3)}, Vel=${ev.velocity.toFixed(2)}`);
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
      console.log(`${logPrefix}_OFFLINE] Channel ${i} max absolute value: ${maxVal.toExponential(3)}`);
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

    