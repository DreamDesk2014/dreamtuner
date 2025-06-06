
'use client';
import * as Tone from 'tone';
import { Midi as MidiFileParser } from '@tonejs/midi';
import type { MusicParameters } from '@/types';
import { generateMidiFile as generateMidiFileOriginal } from '@/lib/midiService';
import { mapInstrumentHintToGM as mapInstrumentHintToGMOriginal } from '@/lib/midiService'; // Keep original name for clarity

const SAFE_OSC_TYPE = 'triangle' as const;

// --- audiobuffer-to-wav START ---
function audioBufferToWav(buffer: AudioBuffer, opt: { float32?: boolean } = {}): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = opt.float32 ? 3 : 1;
  const bitDepth = format === 3 ? 32 : 16;
  let result;
  if (numChannels === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }
  return encodeWAV(result, format, sampleRate, numChannels, bitDepth);
}
function encodeWAV(samples: Float32Array, format: number, sampleRate: number, numChannels: number, bitDepth: number): ArrayBuffer {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);
  if (format === 1) { floatTo16BitPCM(view, 44, samples); }
  else { writeFloat32(view, 44, samples); }
  return buffer;
}
function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);
  let index = 0; let inputIndex = 0;
  while (index < length) { result[index++] = inputL[inputIndex]; result[index++] = inputR[inputIndex]; inputIndex++; }
  return result;
}
function writeFloat32(output: DataView, offset: number, input: Float32Array) { for (let i = 0; i < input.length; i++, offset += 4) { output.setFloat32(offset, input[i], true); } }
function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) { for (let i = 0; i < input.length; i++, offset += 2) { const s = Math.max(-1, Math.min(1, input[i])); output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true); } }
function writeString(view: DataView, offset: number, string: string) { for (let i = 0; i < string.length; i++) { view.setUint8(offset + i, string.charCodeAt(i)); } }
// --- audiobuffer-to-wav END ---

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
    console.error("[base64ToUint8Array_ERROR] Failed to decode Base64 string:", base64.substring(0, 50) + "...", e);
    throw new Error("Invalid Base64 string for MIDI data.");
  }
}

interface EventTime { time: number; duration: number; velocity: number; name?: string; midi?: number; ticks?: number; }

export function ensureStrictlyIncreasingTimes<T extends EventTime>(events: T[], trackNameForDebug: string = "Track"): T[] {
    if (!events || events.length === 0) return [];
    const sortedEvents = [...events].sort((a, b) => a.time - b.time);
    const correctedEvents: T[] = [{ ...sortedEvents[0] }]; 
    const timeEpsilon = 0.000001; 
    for (let i = 1; i < sortedEvents.length; i++) {
        const currentEvent = { ...sortedEvents[i] }; 
        const prevEventTime = correctedEvents[correctedEvents.length - 1].time;
        if (currentEvent.time <= prevEventTime) {
            console.warn(`[ensureStrictlyIncreasingTimes - ${trackNameForDebug}] Adjusting time for event ${i}: original ${currentEvent.time}, prev ${prevEventTime}. New time: ${prevEventTime + timeEpsilon}`);
            currentEvent.time = prevEventTime + timeEpsilon;
        }
        correctedEvents.push(currentEvent);
    }
    return correctedEvents;
}

const MIN_EFFECTIVE_DURATION_SECONDS = 4.0; // Increased to ensure hardcoded notes have space

export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  console.log(`[WAV_GEN_HARDCODED_MELODY_TEST] Starting WAV generation for idea: ${params.generatedIdea.substring(0, 30)}...`);

  if (Tone.context.state !== 'running') {
    console.error("[WAV_GEN_HARDCODED_MELODY_TEST_ERROR] Tone.js context is NOT 'running'. Aborting WAV generation.");
    return null;
  }
  console.log("[WAV_GEN_HARDCODED_MELODY_TEST] Global Tone.context state is 'running'.");

  Tone.Transport.stop(true);
  Tone.Transport.cancel(0);
  console.log("[WAV_GEN_HARDCODED_MELODY_TEST] Global Tone.Transport cleared and stopped.");
  Tone.Destination.volume.value = 0; 
  console.log("[WAV_GEN_HARDCODED_MELODY_TEST] Global Tone.Destination volume set to 0dB.");

  // MIDI parsing is still needed for BPM and overall structure if we were to use it, but notes are hardcoded for melody.
  // We'll still parse it to set BPM correctly for the offline transport.
  const midiDataUri = generateMidiFileOriginal(params);
  let parsedMidiDuration = MIN_EFFECTIVE_DURATION_SECONDS; // Default if MIDI fails
  let transportBpm = params.tempoBpm || 120;

  if (midiDataUri && typeof midiDataUri === 'string' && midiDataUri.startsWith('data:audio/midi;base64,')) {
    try {
      const base64String = midiDataUri.split(',')[1];
      if (!base64String) throw new Error("Base64 part of MIDI URI is missing for BPM setup.");
      const midiUint8Array = base64ToUint8Array(base64String);
      const tempParsedMidi = new MidiFileParser(midiUint8Array);
      parsedMidiDuration = Math.max(tempParsedMidi.duration, MIN_EFFECTIVE_DURATION_SECONDS);
      if (tempParsedMidi.header.tempos[0]?.bpm) {
        transportBpm = tempParsedMidi.header.tempos[0].bpm;
      }
      console.log(`[WAV_GEN_HARDCODED_MELODY_TEST] MIDI parsed for BPM/Duration. Duration: ${parsedMidiDuration.toFixed(2)}s. BPM: ${transportBpm}`);
    } catch (parseError) {
      console.error("[WAV_GEN_HARDCODED_MELODY_TEST_ERROR] Error parsing MIDI for BPM/Duration setup:", parseError);
    }
  } else {
     console.warn("[WAV_GEN_HARDCODED_MELODY_TEST] Invalid or missing MIDI data URI for BPM/Duration setup. Using defaults.");
  }
  
  const renderDuration = parsedMidiDuration + 2.0; // Add 2 seconds buffer
  console.log(`[WAV_GEN_HARDCODED_MELODY_TEST] Calculated renderDuration: ${renderDuration.toFixed(2)}s`);

  Tone.Transport.bpm.value = transportBpm;
  console.log(`[WAV_GEN_HARDCODED_MELODY_TEST] Global Tone.Transport BPM set to: ${Tone.Transport.bpm.value}`);

  try {
    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log("[WAV_GEN_HARDCODED_MELODY_TEST_OFFLINE] Inside Tone.Offline callback. Context sample rate:", offlineContext.sampleRate);
      
      const melodySynth = new Tone.Synth({
        oscillator: { type: 'triangle' as const },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.8, release: 0.4 },
        volume: 0 
      }).connect(offlineContext.destination);
      console.log("[WAV_GEN_HARDCODED_MELODY_TEST_OFFLINE] MelodySynth (basic triangle) created and connected. Volume:", melodySynth.volume.value);

      const hardcodedMelodyNotes: EventTime[] = [
        { name: "C4", time: 0.1, duration: 0.4, velocity: 0.9 }, // duration as seconds
        { name: "E4", time: 0.6, duration: 0.4, velocity: 0.9 },
        { name: "G4", time: 1.1, duration: 0.4, velocity: 0.9 },
        { name: "C5", time: 1.6, duration: 0.8, velocity: 0.8 }
      ];
      console.log("[WAV_GEN_HARDCODED_MELODY_TEST_OFFLINE] Using hardcoded melody notes:", hardcodedMelodyNotes);

      hardcodedMelodyNotes.forEach(note => {
        if (note.name && typeof note.time === 'number' && typeof note.duration === 'number' && typeof note.velocity === 'number') {
          console.log(`[WAV_GEN_HARDCODED_MELODY_TEST_OFFLINE_NOTE] Scheduling Hardcoded Note: Time=${note.time.toFixed(3)}, Note=${note.name}, Dur=${note.duration.toFixed(3)}, Vel=${note.velocity.toFixed(2)}`);
          // The 'time' for triggerAttackRelease is absolute within the offline context
          melodySynth.triggerAttackRelease(note.name, note.duration, note.time, note.velocity);
        } else {
          console.warn(`[WAV_GEN_HARDCODED_MELODY_TEST_OFFLINE_NOTE] Skipping invalid hardcoded note:`, note);
        }
      });
      
      console.log("[WAV_GEN_HARDCODED_MELODY_TEST_OFFLINE] Note scheduling complete. Rendering should commence.");
    }, renderDuration);

    console.log(`[WAV_GEN_HARDCODED_MELODY_TEST] Tone.Offline rendering complete. AudioBuffer info: Channels: ${audioBuffer.numberOfChannels}, Length: ${audioBuffer.length}, SampleRate: ${audioBuffer.sampleRate}, Duration: ${audioBuffer.duration.toFixed(3)}s`);

    let isSilent = true;
    let maxVal = 0;
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      const channelData = audioBuffer.getChannelData(i);
      for (let j = 0; j < channelData.length; j++) {
        if (Math.abs(channelData[j]) > 1e-5) { 
          isSilent = false;
        }
        if (Math.abs(channelData[j]) > maxVal) {
          maxVal = Math.abs(channelData[j]);
        }
      }
      console.log(`[WAV_GEN_HARDCODED_MELODY_TEST] Channel ${i} max absolute value: ${maxVal.toExponential(3)}`);
      if (!isSilent) break;
    }

    if (isSilent) {
      console.warn("[WAV_GEN_HARDCODED_MELODY_TEST_WARN] Rendered AudioBuffer (hardcoded melody) appears to be silent or extremely quiet.");
    } else {
      console.log("[WAV_GEN_HARDCODED_MELODY_TEST] Rendered AudioBuffer (hardcoded melody) contains non-zero samples.");
    }

    const wavDataBuffer = audioBufferToWav(audioBuffer);
    console.log(`[WAV_GEN_HARDCODED_MELODY_TEST] WAV data buffer (hardcoded melody) created. Size: ${wavDataBuffer.byteLength} bytes.`);
    return new Blob([wavDataBuffer], { type: 'audio/wav' });

  } catch (error) {
    console.error("[WAV_GEN_HARDCODED_MELODY_TEST_ERROR] Error during WAV generation process:", error);
    if (error instanceof Error) {
        console.error(`[WAV_GEN_HARDCODED_MELODY_TEST_ERROR_DETAILS] Name: ${error.name}, Message: ${error.message}, Stack: ${error.stack}`);
    }
    return null;
  }
};

// getSynthConfigurations remains the same (with FMSynth for piano and oscillator sanitization)
const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genre: string = '',
  isKidsMode: boolean = false,
  aiGeneratedIdea: string = '',
  rhythmicDensity: number = 0.5,
  harmonicComplexity: number = 0.5
): any /*SynthConfigurations*/ => {
  const genreLower = genre.toLowerCase();
  const hintsLower = instrumentHints.map(h => h.toLowerCase());
  const ideaLower = aiGeneratedIdea.toLowerCase();

  let configs: any /*SynthConfigurations*/ = {
    melody: { oscillator: { type: SAFE_OSC_TYPE }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.6 }, volume: 0 },
    bass: { oscillator: { type: 'fmsine' as const, harmonicity: 1.2, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, volume: 0 },
    chords: { oscillator: { type: 'amtriangle' as const, harmonicity: 0.5, modulationType: "sine" as const }, volume: -6, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 } },
    arpeggio: { oscillator: { type: SAFE_OSC_TYPE, harmonicity: 1.5, modulationIndex: 8 }, envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.2 }, volume: -7 },
    kick: { pitchDecay: 0.05, octaves: 10, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" as const }, volume: 0 },
    snare: { noise: { type: 'pink' as const }, volume: -2, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } },
    hiHat: { frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3000, octaves: 1.5, volume: -6 },
    piano: { 
        harmonicity: 3.1,
        modulationIndex: 16,
        oscillator: { type: "sine" as const }, 
        envelope: { attack: 0.01, decay: 0.7, sustain: 0.1, release: 0.9 },
        modulation: { type: "square" as const }, 
        modulationEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.01, release: 0.6 },
        volume: -3
    }
  };
  
  for (const key in configs) {
    const synthConfig = configs[key as keyof any] as any;
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
    configs.kick.volume = 0;
    configs.snare.volume = -3;
    configs.hiHat.volume = -9;
    configs.hiHat.frequency = 400;

    if (genreLower.includes("electronic")) {
      configs.melody.oscillator.type = SAFE_OSC_TYPE;
      configs.arpeggio.oscillator.type = SAFE_OSC_TYPE;
    } else if (genreLower.includes("pop")) {
      configs.melody.oscillator.type = SAFE_OSC_TYPE;
    }
    if (hintsLower.some(h => h.includes('piano') || h.includes('toy piano'))) {
        configs.melody = JSON.parse(JSON.stringify(configs.piano)); configs.melody.volume = 0;
        configs.chords = JSON.parse(JSON.stringify(configs.piano)); configs.chords.volume = -6;
    }
  } else {
    if (genreLower.includes('electronic') || genreLower.includes('pop')) {
      configs.melody.oscillator.type = SAFE_OSC_TYPE; configs.melody.volume = 0;
      configs.bass.oscillator.type = 'fatsquare' as const; ((configs.bass.oscillator) as any).count = 3; ((configs.bass.oscillator) as any).spread = 15; configs.bass.volume = 0;
      configs.chords.oscillator.type = SAFE_OSC_TYPE; configs.chords.volume = -9;
      configs.arpeggio.oscillator.type = 'fatsawtooth' as const; ((configs.arpeggio.oscillator) as any).count = 3; ((configs.arpeggio.oscillator) as any).spread = 20; configs.arpeggio.volume = -7;
    } else if (genreLower.includes('rock') || genreLower.includes('metal')) {
      configs.melody.oscillator.type = 'fatsawtooth' as const; ((configs.melody.oscillator) as any).count = 2; ((configs.melody.oscillator) as any).spread = 20; configs.melody.envelope.attack = 0.01; configs.melody.volume = -3;
      configs.bass.oscillator.type = 'fatsquare' as const; ((configs.bass.oscillator) as any).count = 3; ((configs.bass.oscillator) as any).spread = 20; configs.bass.volume = -3;
      configs.chords.oscillator.type = 'fatsquare' as const; ((configs.chords.oscillator) as any).count = 3; ((configs.chords.oscillator) as any).spread = 25; configs.chords.volume = -9;
    } else if (genreLower.includes('jazz')) {
      configs.melody = JSON.parse(JSON.stringify(configs.piano)); configs.melody.volume = -3;
      configs.bass.oscillator.type = 'sine' as const; configs.bass.volume = -3;
      configs.chords = JSON.parse(JSON.stringify(configs.piano)); configs.chords.volume = -9;
    }
    hintsLower.forEach(hint => {
      if (hint.includes('piano')) {
          configs.melody = JSON.parse(JSON.stringify(configs.piano)); configs.melody.volume = -3;
          configs.chords = JSON.parse(JSON.stringify(configs.piano)); configs.chords.volume = -9;
      }
    });
  }
  return configs;
};
    