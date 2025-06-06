
'use client';
import * as Tone from 'tone';
import { Midi as MidiFileParser, type MidiJSON } from '@tonejs/midi';
import type { MusicParameters } from '@/types';
import { generateMidiFile as generateMidiFileOriginal } from '@/lib/midiService';
import { mapInstrumentHintToGM as mapInstrumentHintToGMOriginal } from '@/lib/midiService';
import { audioBufferToWav } from "./audioBufferToWav"; // Ensure this is correctly imported

const SAFE_OSC_TYPE = 'triangle' as const;
const MIN_EFFECTIVE_DURATION_SECONDS = 4.0; // Minimum duration for rendering

// Helper to convert Base64 to Uint8Array
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

export function ensureStrictlyIncreasingTimes<T extends EventTime>(events: T[], trackNameForDebug: string = "Track"): T[] {
    if (!events || events.length === 0) return [];
    const sortedEvents = [...events].sort((a, b) => a.time - b.time);
    const correctedEvents: T[] = [{ ...sortedEvents[0] }]; // Ensure we're copying the event object
    const timeEpsilon = 0.000001; // A very small offset
    for (let i = 1; i < sortedEvents.length; i++) {
        const currentEvent = { ...sortedEvents[i] }; // Ensure we're copying the event object
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
    bass: { oscillator: { type: 'fmsine' as const, harmonicity: 1.2, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, volume: 0 },
    chords: { oscillator: { type: 'amtriangle' as const, harmonicity: 0.5, modulationType: "sine" as const }, volume: -6, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 } },
    arpeggio: { oscillator: { type: SAFE_OSC_TYPE, harmonicity: 1.5, modulationIndex: 8 }, envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.2 }, volume: -7 },
    kick: { pitchDecay: 0.05, octaves: 10, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" as const }, volume: 0 },
    snare: { noise: { type: 'pink' as const }, volume: -2, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } },
    hiHat: { frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3000, octaves: 1.5, volume: -6 },
    piano: { // FMSynth based piano
        harmonicity: 3.1, modulationIndex: 16,
        oscillator: { type: "sine" as const },
        envelope: { attack: 0.01, decay: 0.7, sustain: 0.1, release: 0.9 },
        modulation: { type: "square" as const },
        modulationEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.01, release: 0.6 },
        volume: -3
    }
  };

  // Sanitize oscillator types
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
    configs.chords = { oscillator: { type: 'square' as const }, envelope: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 }, volume: -6 };
    configs.arpeggio = { oscillator: { type: 'sawtooth' as const }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.2 }, volume: -9 };
    if (hintsLower.some(h => h.includes('piano') || h.includes('toy piano'))) {
        configs.melody = { ...configs.piano, volume: 0 };
        configs.chords = { ...configs.piano, volume: -6 };
    }
  } else {
     if (hintsLower.some(h => h.includes('piano'))) {
        configs.melody = { ...configs.piano, volume: -3 };
        configs.chords = { ...configs.piano, volume: -9 };
    } else if (genreLower.includes('electronic') || genreLower.includes('pop')) {
      configs.melody.oscillator.type = SAFE_OSC_TYPE; configs.melody.volume = 0;
      configs.bass.oscillator.type = 'fatsquare' as const; ((configs.bass.oscillator) as any).count = 3; ((configs.bass.oscillator) as any).spread = 15; configs.bass.volume = 0;
      configs.chords.oscillator.type = SAFE_OSC_TYPE; configs.chords.volume = -9;
      configs.arpeggio.oscillator.type = 'fatsawtooth' as const; ((configs.arpeggio.oscillator) as any).count = 3; ((configs.arpeggio.oscillator) as any).spread = 20; configs.arpeggio.volume = -7;
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

const GM = { DRUM_CHANNEL: 9 }; // Standard MIDI drum channel is 10 (0-indexed 9)
type InstrumentRole = 'melody' | 'bass' | 'chords' | 'arpeggio' | 'piano' | 'drums' | 'unknown';

const getInstrumentRole = (
    gmInstrument: number,
    channel: number,
    mapping: ReturnType<typeof mapInstrumentHintToGMOriginal>,
    trackName: string = ''
): InstrumentRole => {
    if (channel === GM.DRUM_CHANNEL) return 'drums';
    const nameLower = trackName.toLowerCase();

    if (nameLower.includes('melody') || nameLower.includes('lead')) return 'melody';
    if (nameLower.includes('bass')) return 'bass';
    if (nameLower.includes('chord') || nameLower.includes('pad') || nameLower.includes('harmony')) return 'chords';
    if (nameLower.includes('arp') || nameLower.includes('sequence')) return 'arpeggio';
    if (nameLower.includes('piano')) return 'piano';

    if (gmInstrument === mapping.melody) return 'melody';
    if (gmInstrument === mapping.bass) return 'bass';
    if (gmInstrument === mapping.chordsPad) return 'chords';
    if (gmInstrument === mapping.arpeggioSynth) return 'arpeggio';
    
    // Fallback based on common GM instrument ranges for broader compatibility
    if (gmInstrument >= 0 && gmInstrument <= 7) return 'piano'; // Acoustic Pianos, Chromatic Percussion (Celesta, etc.)
    if (gmInstrument >= 8 && gmInstrument <= 15 && gmInstrument !== GM.DRUM_CHANNEL) return 'arpeggio'; // Chromatic Percussion like Glockenspiel, Music Box
    if (gmInstrument >= 16 && gmInstrument <= 23) return (nameLower.includes('pad') ? 'chords' : 'arpeggio'); // Organs, Accordion
    if (gmInstrument >= 24 && gmInstrument <= 31) return (nameLower.includes('lead') || nameLower.includes('solo') ? 'melody' : 'chords'); // Guitars
    if (gmInstrument >= 32 && gmInstrument <= 39) return 'bass'; // Basses
    if (gmInstrument >= 40 && gmInstrument <= 55) return (nameLower.includes('pad') || nameLower.includes('ensemble') ? 'chords' : 'melody'); // Strings, Choir, Voice
    if (gmInstrument >= 56 && gmInstrument <= 79) return 'melody'; // Brass, Reed, Pipe
    if (gmInstrument >= 80 && gmInstrument <= 87) return 'melody'; // Synth Lead
    if (gmInstrument >= 88 && gmInstrument <= 95) return 'chords'; // Synth Pad
    if (gmInstrument >= 96 && gmInstrument <= 103) return 'arpeggio'; // Synth Effects (often used for arpeggiated textures)

    console.log(`[getInstrumentRole] Unknown role for GM: ${gmInstrument}, Channel: ${channel}, Name: '${trackName}'. Defaulting to 'melody'.`);
    return 'melody';
};


export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  console.log(`[WAV_GEN_STEP1_MELODY] Starting WAV generation for idea: ${params.generatedIdea.substring(0, 30)}...`);

  if (Tone.context.state !== 'running') {
    console.error("[WAV_GEN_STEP1_MELODY_ERROR] Global Tone.context is NOT 'running'. Aborting WAV generation. User gesture might be required.");
    return null;
  }
  console.log("[WAV_GEN_STEP1_MELODY] Global Tone.context state is 'running'.");

  Tone.Transport.stop(true);
  Tone.Transport.cancel(0);
  console.log("[WAV_GEN_STEP1_MELODY] Global Tone.Transport cleared and stopped.");
  Tone.Destination.volume.value = 0;
  console.log("[WAV_GEN_STEP1_MELODY] Global Tone.Destination volume set to 0dB.");

  const midiDataUri = generateMidiFileOriginal(params);
  console.log("[WAV_GEN_STEP1_MELODY] MIDI data URI generated. First 100 chars:", midiDataUri ? midiDataUri.substring(0, 100) + "..." : "null/undefined");

  if (!midiDataUri || typeof midiDataUri !== 'string' || !midiDataUri.startsWith('data:audio/midi;base64,')) {
    console.error("[WAV_GEN_STEP1_MELODY_ERROR] Invalid or missing MIDI data URI. Cannot parse MIDI. URI:", midiDataUri);
    throw new Error("Failed to generate valid MIDI data for WAV conversion.");
  }
  
  const base64Midi = midiDataUri.split(',')[1];
  if (!base64Midi) {
    console.error("[WAV_GEN_STEP1_MELODY_ERROR] Failed to extract Base64 part from MIDI URI.");
    throw new Error("Failed to extract Base64 from MIDI Data URI.");
  }

  let parsedMidi: MidiJSON;
  try {
    const midiUint8Array = base64ToUint8Array(base64Midi);
    console.log(`[WAV_GEN_STEP1_MELODY] MIDI Uint8Array created. Length: ${midiUint8Array.length}`);
    parsedMidi = new MidiFileParser(midiUint8Array).toJSON();
    
    if (!parsedMidi || typeof parsedMidi.duration !== 'number' || isNaN(parsedMidi.duration)) {
      console.error("[WAV_GEN_STEP1_MELODY_ERROR] Parsed MIDI data is invalid or duration is missing/NaN. Parsed MIDI object:", parsedMidi);
      throw new Error("Parsed MIDI data is invalid or duration is missing/NaN. Cannot proceed with WAV generation.");
    }
    console.log(`[WAV_GEN_STEP1_MELODY] MIDI parsed. Duration: ${parsedMidi.duration.toFixed(2)}s. Tracks: ${parsedMidi.tracks.length}`);
  } catch (parseError) {
    console.error("[WAV_GEN_STEP1_MELODY_ERROR] Error parsing MIDI data with MidiFileParser:", parseError);
    console.error("[WAV_GEN_STEP1_MELODY_ERROR] Failing MIDI URI was:", midiDataUri.substring(0, 200) + "...");
    throw new Error("Failed to parse MIDI data for WAV conversion.");
  }

  const effectiveMidiDuration = Math.max(parsedMidi.duration, MIN_EFFECTIVE_DURATION_SECONDS);
  let renderDuration = effectiveMidiDuration + 2.0; 
  console.log(`[WAV_GEN_STEP1_MELODY] Calculated renderDuration: ${renderDuration.toFixed(2)}s`);

  const transportBpm = parsedMidi.header.tempos[0]?.bpm || params.tempoBpm || 120;
  Tone.Transport.bpm.value = transportBpm;
  console.log(`[WAV_GEN_STEP1_MELODY] Global Tone.Transport BPM set to: ${Tone.Transport.bpm.value}`);

  const synthConfigs = getSynthConfigurations(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids', params.generatedIdea, params.rhythmicDensity, params.harmonicComplexity);
  const instrumentMapping = mapInstrumentHintToGMOriginal(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids', params.generatedIdea);

  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log(`[WAV_GEN_STEP1_MELODY_OFFLINE] Inside Tone.Offline callback. Offline Context SR: ${offlineContext.sampleRate}`);
      offlineContext.transport.bpm.value = transportBpm;
      
      // --- MELODY SYNTH ---
      // Forcing FMSynth for piano-like sounds to avoid Salamander issues
      const melodySynthConfig = synthConfigs.piano; 
      const melodySynth = new Tone.PolySynth(Tone.FMSynth, melodySynthConfig).connect(offlineContext.destination);
      melodySynth.volume.value = melodySynthConfig.volume !== undefined ? melodySynthConfig.volume : -3;
      console.log(`[WAV_GEN_STEP1_MELODY_OFFLINE] MelodySynth (FMSynth for piano test) created & connected. Volume: ${melodySynth.volume.value}`);

      let melodyNotesFoundAndScheduled = false;
      parsedMidi.tracks.forEach((track, trackIndex) => {
        if (track.notes && track.notes.length > 0) {
          const gmInstrument = track.instrument.number;
          const role = getInstrumentRole(gmInstrument, track.channel, instrumentMapping, track.name);

          if (role === 'melody' || role === 'piano') {
            console.log(`[WAV_GEN_STEP1_MELODY_OFFLINE_TRACK ${trackIndex}] Processing track as MELODY/PIANO. Instrument: ${track.instrument.name} (GM ${gmInstrument}), Notes: ${track.notes.length}`);
            
            const trackNotesInput = track.notes.map(note => ({
              name: note.name,
              time: note.time, 
              duration: note.duration, 
              velocity: note.velocity 
            }));

            const scheduledNotes = ensureStrictlyIncreasingTimes(trackNotesInput, `Track ${trackIndex} (Melody/Piano)`);

            scheduledNotes.forEach((note, noteIdx) => {
              if (note.name && typeof note.time === 'number' && typeof note.duration === 'number' && note.duration > 0.001 && typeof note.velocity === 'number' && note.velocity > 0) {
                console.log(`[WAV_GEN_STEP1_MELODY_OFFLINE_SCHED] Scheduling Note: Time=${note.time.toFixed(3)}, Note=${note.name}, Dur=${note.duration.toFixed(3)}, Vel=${note.velocity.toFixed(2)}`);
                melodySynth.triggerAttackRelease(note.name, note.duration, note.time, note.velocity);
                melodyNotesFoundAndScheduled = true;
              } else {
                console.warn(`[WAV_GEN_STEP1_MELODY_OFFLINE_SCHED] Skipping invalid/silent melody note ${noteIdx}:`, note);
              }
            });
          }
        }
      });

      if (!melodyNotesFoundAndScheduled) {
        console.warn("[WAV_GEN_STEP1_MELODY_OFFLINE] No melody or piano notes were actually scheduled.");
      }

    }, renderDuration);

    console.log(`[WAV_GEN_STEP1_MELODY] Tone.Offline rendering complete. AudioBuffer channels: ${audioBuffer.numberOfChannels}, length: ${audioBuffer.length}, sampleRate: ${audioBuffer.sampleRate}, duration: ${audioBuffer.duration.toFixed(3)}s`);

    let isSilent = true;
    let maxVal = 0;
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      const channelData = audioBuffer.getChannelData(i);
      for (let j = 0; j < channelData.length; j++) {
        if (Math.abs(channelData[j]) > 1e-5) { isSilent = false; }
        if (Math.abs(channelData[j]) > maxVal) { maxVal = Math.abs(channelData[j]); }
      }
      console.log(`[WAV_GEN_STEP1_MELODY] Channel ${i} max absolute value: ${maxVal.toExponential(3)}`);
      if (!isSilent) break;
    }

    if (isSilent) {
      console.warn("[WAV_GEN_STEP1_MELODY_WARN] Rendered AudioBuffer (dynamic melody) appears to be silent or very quiet.");
    } else {
      console.log("[WAV_GEN_STEP1_MELODY] Rendered AudioBuffer (dynamic melody) contains non-zero samples.");
    }

    const wavDataBuffer = audioBufferToWav(audioBuffer);
    console.log(`[WAV_GEN_STEP1_MELODY] WAV data buffer (dynamic melody) created. Size: ${wavDataBuffer.byteLength} bytes.`);
    return new Blob([wavDataBuffer], { type: 'audio/wav' });

  } catch (error) {
    console.error("[WAV_GEN_STEP1_MELODY_ERROR] Error during WAV generation process:", error);
    if (error instanceof Error) {
        console.error(`[WAV_GEN_STEP1_MELODY_ERROR_DETAILS] Name: ${error.name}, Message: ${error.message}, Stack: ${error.stack}`);
    }
    return null;
  }
};

// audioBufferToWav function (if not already imported or present)
// Ensure this function is available in scope
// export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer { ... }
// For now, assuming it's imported or defined elsewhere as it's not the direct cause of this specific error.

