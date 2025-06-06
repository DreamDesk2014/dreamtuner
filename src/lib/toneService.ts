
'use client';
import * as Tone from 'tone';
import type { MusicParameters } from '@/types';
// No longer importing from midiService for WAV generation path
// import { mapInstrumentHintToGM as mapInstrumentHintToGMOriginal } from '@/lib/midiService';
import { audioBufferToWav } from "./audioBufferToWav";

const SAFE_OSC_TYPE = 'triangle' as const;
const MIN_EFFECTIVE_DURATION_SECONDS = 6.0; // Increased slightly for bass + melody

// Helper to convert Base64 to Uint8Array - kept for other potential uses, but not for direct WAV gen
function base64ToUint8Array(base64: string): Uint8Array {
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("[base64ToUint8Array_ERROR] Failed to decode Base64 string:", e);
    throw new Error("Invalid Base64 string for MIDI data.");
  }
}

interface EventTime { time: number; duration: number; velocity: number; name?: string; midi?: number; ticks?: number; }

// This function is good practice for any list of timed events.
export function ensureStrictlyIncreasingTimes<T extends EventTime>(events: T[], trackNameForDebug: string = "Track"): T[] {
    if (!events || events.length === 0) return [];
    const sortedEvents = [...events].sort((a, b) => a.time - b.time);
    const correctedEvents: T[] = [{ ...sortedEvents[0] }];
    const timeEpsilon = 0.000001; // Smallest discernible time difference for Tone.js scheduling
    for (let i = 1; i < sortedEvents.length; i++) {
        const currentEvent = { ...sortedEvents[i] };
        const prevEventTime = correctedEvents[correctedEvents.length - 1].time;
        if (currentEvent.time <= prevEventTime) {
            console.warn(`[ensureStrictlyIncreasingTimes - ${trackNameForDebug}] Adjusting time for event ${i}: original ${currentEvent.time.toFixed(6)}, prev ${prevEventTime.toFixed(6)}. New time: ${(prevEventTime + timeEpsilon).toFixed(6)}`);
            currentEvent.time = prevEventTime + timeEpsilon;
        }
        correctedEvents.push(currentEvent);
    }
    return correctedEvents;
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
    melody: { oscillator: { type: SAFE_OSC_TYPE }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.6 }, volume: 0 },
    bass: { oscillator: { type: 'fmsine' as const, harmonicity: 1.2, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, volume: -3 }, // Bass a bit quieter
    chords: { oscillator: { type: 'amtriangle' as const, harmonicity: 0.5, modulationType: "sine" as const }, volume: -9, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 } },
    arpeggio: { oscillator: { type: SAFE_OSC_TYPE, harmonicity: 1.5, modulationIndex: 8 }, envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.2 }, volume: -10 },
    kick: { pitchDecay: 0.05, octaves: 10, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" as const }, volume: 0 },
    snare: { noise: { type: 'pink' as const }, volume: -5, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } },
    hiHat: { frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3000, octaves: 1.5, volume: -12 },
    piano: { // Default Piano (FMSynth)
        harmonicity: 3.1, modulationIndex: 16,
        oscillator: { type: "fmsine" as const, partials: [1, 0.5, 0.2, 0.1, 0.05] }, // FMSynth example, can be simpler like 'sine'
        envelope: { attack: 0.01, decay: 0.7, sustain: 0.1, release: 0.9 },
        modulation: { type: "square" as const },
        modulationEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.01, release: 0.6 },
        volume: -6 // Default volume for piano synth
    }
  };
  // Safety check for oscillator types
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
        configs.melody = { ...configs.piano, volume: -3 }; // Kids piano melody less loud
        configs.chords = { ...configs.piano, volume: -10 };
    }
  } else {
     if (hintsLower.some(h => h.includes('piano'))) {
        configs.melody = { ...configs.piano, volume: -3 };
        configs.chords = { ...configs.piano, volume: -9 };
    } else if (genreLower.includes('electronic') || genreLower.includes('pop')) {
      configs.melody.oscillator.type = SAFE_OSC_TYPE; configs.melody.volume = 0;
      configs.bass.oscillator.type = 'fatsquare' as const; ((configs.bass.oscillator) as any).count = 3; ((configs.bass.oscillator) as any).spread = 15; configs.bass.volume = -3;
      configs.chords.oscillator.type = SAFE_OSC_TYPE; configs.chords.volume = -9;
      configs.arpeggio.oscillator.type = 'fatsawtooth' as const; ((configs.arpeggio.oscillator) as any).count = 3; ((configs.arpeggio.oscillator) as any).spread = 20; configs.arpeggio.volume = -10;
    } else if (genreLower.includes('rock') || genreLower.includes('metal')) {
      configs.melody.oscillator.type = 'fatsawtooth' as const; ((configs.melody.oscillator) as any).count = 2; ((configs.melody.oscillator) as any).spread = 20; configs.melody.envelope.attack = 0.01; configs.melody.volume = -3;
      configs.bass.oscillator.type = 'fatsquare' as const; ((configs.bass.oscillator) as any).count = 3; ((configs.bass.oscillator) as any).spread = 20; configs.bass.volume = -3;
      configs.chords.oscillator.type = 'fatsquare' as const; ((configs.chords.oscillator) as any).count = 3; ((configs.chords.oscillator) as any).spread = 25; configs.chords.volume = -9;
    } else if (genreLower.includes('jazz')) {
      configs.melody = { ...configs.piano, volume: -3 };
      configs.bass.oscillator.type = 'sine' as const; configs.bass.volume = -3;
      configs.chords = { ...configs.piano, volume: -9 };
    }
  }
  return configs;
};

// --- Helper functions for direct synthesis (can be expanded from midiService.ts logic) ---
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
        // Attempt to parse if octave is missing, assume 4
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
        midiNumberBase = PITCH_CLASSES[pitchClassName]; // Try without accidental if full name failed
        if (midiNumberBase !== undefined) {
            for (const char of accidentals) {
                if (char === '#' || char === 'S') midiNumberBase = (midiNumberBase + 1);
                else if (char === 'B' || char === 'F') midiNumberBase = (midiNumberBase - 1); // Corrected to subtract for flats
            }
            midiNumberBase = (midiNumberBase % 12 + 12) % 12; // Ensure positive modulo
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
    const rootMidiBase = robustNoteToMidi(baseKeyForScale + '0') % 12; // Get the pitch class (0-11)
    
    let intervals: number[];
    if (mode.toLowerCase().includes('minor')) {
        intervals = [0, 2, 3, 5, 7, 8, 10]; // Natural Minor
    } else {
        intervals = [0, 2, 4, 5, 7, 9, 11]; // Major
    }
    
    return intervals.map(interval => {
        const currentMidiValue = rootMidiBase + interval;
        const octaveOffset = Math.floor(currentMidiValue / 12); // How many octaves up from rootMidiBase this interval lands
        const noteMidiNumber = (currentMidiValue % 12) + (startOctave + octaveOffset + 1) * 12;
        return midiToNoteName(noteMidiNumber);
    });
}
// --- End Helper functions ---

export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  console.log(`[WAV_GEN_DIRECT_MELODY_BASS] Starting direct synthesis for: ${params.generatedIdea.substring(0, 30)}...`);

  if (Tone.context.state !== 'running') {
    console.error("[WAV_GEN_DIRECT_MELODY_BASS_ERROR] Global Tone.context is NOT 'running'. Aborting WAV generation.");
    return null;
  }
  console.log("[WAV_GEN_DIRECT_MELODY_BASS] Global Tone.context state is 'running'.");

  Tone.Transport.stop(true);
  Tone.Transport.cancel(0);
  Tone.Destination.volume.value = -6; // Master volume for rendering (slightly reduced for more headroom)
  Tone.Transport.bpm.value = params.tempoBpm || 120;
  console.log(`[WAV_GEN_DIRECT_MELODY_BASS] Transport BPM set to: ${Tone.Transport.bpm.value}`);

  const synthConfigs = getSynthConfigurations(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids', params.generatedIdea, params.rhythmicDensity, params.harmonicComplexity);

  // --- Melody Generation Logic (from previous working step) ---
  const melodyNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const melodyOctave = params.originalInput.mode === 'kids' ? 5 : 4;
  const scaleNoteNames = getScaleNoteNames(params.keySignature, params.mode, melodyOctave);
  const secondsPerBeat = 60 / (params.tempoBpm || 120);
  let melodyCurrentTime = 0.2; // Start after a small delay

  const numMelodyNotes = 8;
  const melodyNoteDurationSeconds = params.rhythmicDensity > 0.6 ? secondsPerBeat / 2 : secondsPerBeat;
  const melodyNoteDurationNotation = params.rhythmicDensity > 0.6 ? "8n" : "4n";
  let maxMelodyTime = melodyCurrentTime;

  for (let i = 0; i < numMelodyNotes; i++) {
    if (scaleNoteNames.length > 0) {
      const noteName = scaleNoteNames[i % scaleNoteNames.length];
      melodyNotesToSchedule.push({
        time: melodyCurrentTime,
        note: noteName,
        duration: melodyNoteDurationNotation,
        velocity: 0.7
      });
      maxMelodyTime = Math.max(maxMelodyTime, melodyCurrentTime + Tone.Time(melodyNoteDurationNotation).toSeconds());
      melodyCurrentTime += Tone.Time(melodyNoteDurationNotation).toSeconds() * (params.rhythmicDensity > 0.6 ? 1.5 : 1.2);
    }
  }
  // --- End Melody Generation Logic ---

  // --- Bass Line Generation Logic ---
  const bassNotesToSchedule: { time: number, note: string, duration: string, velocity: number }[] = [];
  const bassOctave = params.originalInput.mode === 'kids' ? 3 : 2;
  const rootNoteName = (params.keySignature.match(/([A-G][#bSsxBF]*)/i)?.[0]?.toUpperCase() || params.keySignature.toUpperCase()) + bassOctave;
  const bassNoteMidi = robustNoteToMidi(rootNoteName);
  const bassNoteName = midiToNoteName(bassNoteMidi);

  const numBassMeasures = 2; // Let's do 2 "measures" of bass
  const beatsPerMeasure = 4;
  const measureDurationSeconds = beatsPerMeasure * secondsPerBeat;
  let bassCurrentTime = 0.2; // Align with melody start
  let maxBassTime = bassCurrentTime;

  for (let i = 0; i < numBassMeasures * beatsPerMeasure; i++) {
      // Play root note on each beat for simplicity in this step
      if (i % beatsPerMeasure === 0) { // Play on the downbeat of each measure
        const bassNoteDurationNotation = "2n"; // Half note
        bassNotesToSchedule.push({
            time: bassCurrentTime,
            note: bassNoteName,
            duration: bassNoteDurationNotation,
            velocity: 0.6
        });
        maxBassTime = Math.max(maxBassTime, bassCurrentTime + Tone.Time(bassNoteDurationNotation).toSeconds());
      }
      bassCurrentTime += secondsPerBeat; // Advance by one beat
  }
  // --- End Bass Line Generation Logic ---

  const overallMaxTime = Math.max(maxMelodyTime, maxBassTime);
  const renderDuration = Math.max(overallMaxTime + 2.0, MIN_EFFECTIVE_DURATION_SECONDS); // Add buffer
  console.log(`[WAV_GEN_DIRECT_MELODY_BASS] Calculated renderDuration: ${renderDuration.toFixed(2)}s.`);

  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log(`[WAV_GEN_DIRECT_MELODY_BASS_OFFLINE] Inside Tone.Offline. Offline Context SR: ${offlineContext.sampleRate}`);
      offlineContext.transport.bpm.value = Tone.Transport.bpm.value;

      // Melody Synth (using FMSynth for piano-like sound)
      const melodySynth = new Tone.PolySynth(Tone.FMSynth, synthConfigs.piano).connect(offlineContext.destination);
      melodySynth.volume.value = synthConfigs.piano.volume !== undefined ? synthConfigs.piano.volume : -6;
      console.log(`[WAV_GEN_DIRECT_MELODY_BASS_OFFLINE] MelodySynth (FMSynth) created. Volume: ${melodySynth.volume.value}`);

      if (melodyNotesToSchedule.length === 0) {
        console.warn("[WAV_GEN_DIRECT_MELODY_BASS_OFFLINE] No melody notes to schedule.");
      } else {
         console.log(`[WAV_GEN_DIRECT_MELODY_BASS_OFFLINE] Scheduling ${melodyNotesToSchedule.length} melody notes.`);
      }
      melodyNotesToSchedule.forEach((noteEvent) => {
        console.log(`[WAV_GEN_DIRECT_MELODY_BASS_OFFLINE_SCHED_MELODY] Time=${noteEvent.time.toFixed(3)}, Note=${noteEvent.note}, Dur=${noteEvent.duration}, Vel=${noteEvent.velocity.toFixed(2)}`);
        melodySynth.triggerAttackRelease(noteEvent.note, noteEvent.duration, noteEvent.time, noteEvent.velocity);
      });

      // Bass Synth
      const bassSynth = new Tone.Synth(synthConfigs.bass).connect(offlineContext.destination); // Using Tone.Synth for mono bass
      // bassSynth.volume.value = synthConfigs.bass.volume !== undefined ? synthConfigs.bass.volume : -3; // Already set in getSynthConfigurations
      console.log(`[WAV_GEN_DIRECT_MELODY_BASS_OFFLINE] BassSynth created. Volume: ${bassSynth.volume.value}`);
      
      if (bassNotesToSchedule.length === 0) {
        console.warn("[WAV_GEN_DIRECT_MELODY_BASS_OFFLINE] No bass notes to schedule.");
      } else {
         console.log(`[WAV_GEN_DIRECT_MELODY_BASS_OFFLINE] Scheduling ${bassNotesToSchedule.length} bass notes.`);
      }
      bassNotesToSchedule.forEach((noteEvent) => {
        console.log(`[WAV_GEN_DIRECT_MELODY_BASS_OFFLINE_SCHED_BASS] Time=${noteEvent.time.toFixed(3)}, Note=${noteEvent.note}, Dur=${noteEvent.duration}, Vel=${noteEvent.velocity.toFixed(2)}`);
        bassSynth.triggerAttackRelease(noteEvent.note, noteEvent.duration, noteEvent.time, noteEvent.velocity);
      });


    }, renderDuration);

    console.log(`[WAV_GEN_DIRECT_MELODY_BASS] Tone.Offline rendering complete. AudioBuffer duration: ${audioBuffer.duration.toFixed(3)}s`);
    
    let isSilent = true;
    let maxVal = 0;
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      const channelData = audioBuffer.getChannelData(i);
      for (let j = 0; j < channelData.length; j++) {
        if (Math.abs(channelData[j]) > 1e-5) { isSilent = false; }
        if (Math.abs(channelData[j]) > maxVal) { maxVal = Math.abs(channelData[j]); }
      }
      console.log(`[WAV_GEN_DIRECT_MELODY_BASS_OFFLINE] Channel ${i} max absolute value: ${maxVal.toExponential(3)}`);
      if (!isSilent) break;
    }

    if (isSilent) {
      console.warn("[WAV_GEN_DIRECT_MELODY_BASS_WARN] Rendered AudioBuffer (melody + bass) appears to be silent or very quiet.");
    } else {
      console.log("[WAV_GEN_DIRECT_MELODY_BASS] Rendered AudioBuffer (melody + bass) contains non-zero samples.");
    }

    const wavDataBuffer = audioBufferToWav(audioBuffer);
    console.log(`[WAV_GEN_DIRECT_MELODY_BASS] WAV data buffer (melody + bass) created. Size: ${wavDataBuffer.byteLength} bytes.`);
    return new Blob([wavDataBuffer], { type: 'audio/wav' });

  } catch (error) {
    console.error("[WAV_GEN_DIRECT_MELODY_BASS_ERROR] Error during WAV generation process:", error);
    if (error instanceof Error) {
        console.error(`[WAV_GEN_DIRECT_MELODY_BASS_ERROR_DETAILS] Name: ${error.name}, Message: ${error.message}, Stack: ${error.stack}`);
    }
    return null;
  }
};
