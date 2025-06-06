
'use client';
import * as Tone from 'tone';
import { Midi as MidiFileParser } from '@tonejs/midi';
import type { MusicParameters } from '@/types';
import { generateMidiFile as generateMidiFileOriginal } from '@/lib/midiService';
import { mapInstrumentHintToGM as mapInstrumentHintToGMOriginal, ensureStrictlyIncreasingTimes } from '@/lib/midiService';

const SAFE_OSC_TYPE = 'triangle' as const;

// --- audiobuffer-to-wav START ---
// Standard audioBufferToWav, encodeWAV, interleave, writeFloat32, floatTo16BitPCM, writeString functions
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
    console.error("[base64ToUint8Array_ERROR] Failed to decode Base64 string:", e);
    throw new Error("Invalid Base64 string for MIDI data.");
  }
}

interface EventTime { time: number; duration: number; velocity: number; note?: string; name?: string; midi?: number; ticks?: number; }
interface SynthCollection {
  melody?: Tone.PolySynth;
  bass?: Tone.PolySynth;
  chords?: Tone.PolySynth;
  arpeggio?: Tone.PolySynth;
  kick?: Tone.MembraneSynth;
  snare?: Tone.NoiseSynth;
  hiHat?: Tone.MetalSynth;
  piano?: Tone.PolySynth<Tone.FMSynth>;
  [key: string]: any;
}

interface SynthConfigurations {
  melody: any;
  bass: any;
  chords: any;
  arpeggio: any;
  kick: any;
  snare: any;
  hiHat: any;
  piano: any;
}

const MIN_EFFECTIVE_DURATION = 5.0;


export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  console.log(`[WAV_GEN_DEBUG] Starting REVISED MINIMAL HARDCODED TEST (v2) for WAV generation.`);

  // Tone.start() is now handled by the UI component. We assume context is running.
  // If not, the UI component should prevent this function from being called.
  if (Tone.context.state !== 'running') {
    console.error("[WAV_GEN_DEBUG_ERROR] Tone.js context is NOT 'running' when generateWavFromMusicParameters (minimal v2) is called. Aborting.");
    return null;
  }
  console.log("[WAV_GEN_DEBUG] Global Tone.context state is already 'running'.");


  try {
    Tone.Transport.stop(0);
    Tone.Transport.cancel(0);
    console.log("[WAV_GEN_DEBUG] Global Tone.Transport cleared and stopped.");

    Tone.Destination.volume.value = 0; // Set to a reasonable volume for testing, e.g. 0dB
    console.log("[WAV_GEN_DEBUG] Global Tone.Destination volume set to 0dB.");

    Tone.Transport.bpm.value = 100; // A moderate tempo for the test
    console.log(`[WAV_GEN_DEBUG] Global Tone.Transport BPM set to: ${Tone.Transport.bpm.value}`);

    const renderDuration = 4.0; // Fixed duration for this minimal test
    console.log(`[WAV_GEN_DEBUG] Minimal test renderDuration: ${renderDuration}s`);

    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log("[WAV_GEN_DEBUG_OFFLINE] Inside REVISED minimal Tone.Offline callback (v2). Offline Context Sample Rate:", offlineContext.sampleRate);

      const testSynth = new Tone.Synth({ // Using Tone.Synth for simplicity
        oscillator: { type: 'triangle' as const },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.8, release: 0.4 },
        volume: 0 // Max volume for testing
      }).connect(offlineContext.destination);
      console.log("[WAV_GEN_DEBUG_OFFLINE] TestSynth created and connected to offline destination. Volume:", testSynth.volume.value);

      // Direct scheduling without Tone.Part, using offlineContext.currentTime for relative timing
      testSynth.triggerAttackRelease("C4", "8n", offlineContext.currentTime + 0.5, 0.9);
      testSynth.triggerAttackRelease("E4", "8n", offlineContext.currentTime + 1.0, 0.9);
      testSynth.triggerAttackRelease("G4", "4n", offlineContext.currentTime + 1.5, 0.9); // Longer note
      // Add one more note to make it distinct if the previous 3-note version was cached or similar
      testSynth.triggerAttackRelease("C5", "8n", offlineContext.currentTime + 2.5, 0.8);


      console.log("[WAV_GEN_DEBUG_OFFLINE] TestSynth notes scheduled directly.");
      // No explicit transport start inside Tone.Offline callback is needed.
      // The rendering starts automatically after this async callback resolves.
    }, renderDuration);

    console.log(`[WAV_GEN_DEBUG] Minimal Tone.Offline rendering complete. AudioBuffer info: Channels: ${audioBuffer.numberOfChannels} Length: ${audioBuffer.length} SampleRate: ${audioBuffer.sampleRate} Duration: ${audioBuffer.duration.toFixed(3)}s`);

    let isSilent = true;
    let maxVal = 0;
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      const channelData = audioBuffer.getChannelData(i);
      for (let j = 0; j < channelData.length; j++) {
        if (Math.abs(channelData[j]) > 1e-5) { // Slightly higher threshold
          isSilent = false;
        }
        if (Math.abs(channelData[j]) > maxVal) {
          maxVal = Math.abs(channelData[j]);
        }
      }
      console.log(`[WAV_GEN_DEBUG] Channel ${i} max absolute value: ${maxVal.toExponential(3)}`);
      if (!isSilent) break;
    }

    if (isSilent) {
      console.warn("[WAV_GEN_DEBUG_WARN] Minimal Rendered AudioBuffer (v2) appears to be silent or extremely quiet.");
    } else {
      console.log("[WAV_GEN_DEBUG] Minimal Rendered AudioBuffer (v2) contains non-zero samples.");
    }

    const wavDataBuffer = audioBufferToWav(audioBuffer);
    console.log(`[WAV_GEN_DEBUG] Minimal WAV data buffer (v2) created. Size: ${wavDataBuffer.byteLength} bytes.`);
    return new Blob([wavDataBuffer], { type: 'audio/wav' });

  } catch (error) {
    console.error("[WAV_GEN_DEBUG_ERROR] Error in minimal WAV generation (v2):", error);
    if (error instanceof Error) {
        console.error(`[WAV_GEN_DEBUG_ERROR_DETAILS] Name: ${error.name}, Message: ${error.message}, Stack: ${error.stack}`);
    }
    return null;
  }
};


const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genre: string = '',
  isKidsMode: boolean = false,
  aiGeneratedIdea: string = '',
  rhythmicDensity: number = 0.5,
  harmonicComplexity: number = 0.5
): SynthConfigurations => {
  const genreLower = genre.toLowerCase();
  const hintsLower = instrumentHints.map(h => h.toLowerCase());
  const ideaLower = aiGeneratedIdea.toLowerCase();

  let configs: SynthConfigurations = {
    melody: { oscillator: { type: SAFE_OSC_TYPE }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.6 }, volume: 0 },
    bass: { oscillator: { type: 'fmsine' as const, harmonicity: 1.2, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, volume: 0 },
    chords: { oscillator: { type: 'amtriangle' as const, harmonicity: 0.5, modulationType: "sine" as const }, volume: -6, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 } },
    arpeggio: { oscillator: { type: SAFE_OSC_TYPE, harmonicity: 1.5, modulationIndex: 8 }, envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.2 }, volume: -7 },
    kick: { pitchDecay: 0.05, octaves: 10, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" as const }, volume: 0 },
    snare: { noise: { type: 'pink' as const }, volume: -2, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } },
    hiHat: { frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3000, octaves: 1.5, volume: -6 },
    piano: { // Defaulting to FMSynth for piano to avoid sample loading issues
        harmonicity: 3.1,
        modulationIndex: 16,
        oscillator: { type: "sine" as const }, // FMSynth uses a main oscillator
        envelope: { attack: 0.01, decay: 0.7, sustain: 0.1, release: 0.9 },
        modulation: { type: "square" as const }, // Modulation oscillator for FMSynth
        modulationEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.01, release: 0.6 },
        volume: -3
    }
  };

  // Sanitize oscillator types
  for (const key in configs) {
    const synthConfig = configs[key as keyof SynthConfigurations] as any;
    if (synthConfig.oscillator && (synthConfig.oscillator.type === 'pwm' || synthConfig.oscillator.type === 'pulse')) {
      console.log(`[WAV_GEN_SYNTH_CONFIG_SANITIZE] For ${key}, replacing unsafe oscillator type '${synthConfig.oscillator.type}' with '${SAFE_OSC_TYPE}'.`);
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
      configs.kick.volume = 0; configs.snare.volume = -2; configs.hiHat.volume = -6;
    } else if (genreLower.includes('rock') || genreLower.includes('metal')) {
      configs.melody.oscillator.type = 'fatsawtooth' as const; ((configs.melody.oscillator) as any).count = 2; ((configs.melody.oscillator) as any).spread = 20; configs.melody.envelope.attack = 0.01; configs.melody.volume = -3;
      configs.bass.oscillator.type = 'fatsquare' as const; ((configs.bass.oscillator) as any).count = 3; ((configs.bass.oscillator) as any).spread = 20; configs.bass.volume = -3;
      configs.chords.oscillator.type = 'fatsquare' as const; ((configs.chords.oscillator) as any).count = 3; ((configs.chords.oscillator) as any).spread = 25; configs.chords.volume = -9;
      configs.arpeggio.oscillator.type = 'fatsquare' as const; ((configs.arpeggio.oscillator) as any).count = 2; ((configs.arpeggio.oscillator) as any).spread = 10; configs.arpeggio.volume = -12;
      configs.kick.volume = -1; configs.snare.volume = -3; configs.hiHat.volume = -9;
    } else if (genreLower.includes('jazz')) {
      configs.melody = JSON.parse(JSON.stringify(configs.piano)); configs.melody.volume = -3;
      configs.bass.oscillator.type = 'sine' as const; configs.bass.volume = -3;
      configs.chords = JSON.parse(JSON.stringify(configs.piano)); configs.chords.volume = -9;
      configs.arpeggio.oscillator.type = 'sine' as const; configs.arpeggio.volume = -15;
      configs.kick.volume = -6; configs.snare.volume = -9; configs.hiHat.volume = -18;
      configs.hiHat.frequency = 400; configs.hiHat.envelope.decay = 0.1;
    } else if (genreLower.includes('ambient') || genreLower.includes('cinematic')) {
      configs.melody.oscillator.type = 'fatsine' as const; ((configs.melody.oscillator) as any).count = 4; ((configs.melody.oscillator) as any).spread = 40; configs.melody.envelope.attack = 0.5; configs.melody.envelope.release = 2.0; configs.melody.volume = -6;
      configs.bass.oscillator.type = 'fmsine' as const; configs.bass.envelope.attack = 0.2; configs.bass.envelope.release = 1.5; configs.bass.volume = -3;
      configs.chords.oscillator.type = 'amtriangle' as const; configs.chords.volume = -9; configs.chords.envelope.attack = 1.0; configs.chords.envelope.release = 2.5;
      configs.arpeggio.oscillator.type = 'sine' as const; configs.arpeggio.volume = -12; configs.arpeggio.envelope.attack = 0.3; configs.arpeggio.envelope.release = 1.0;
    }

    hintsLower.forEach(hint => {
      if (hint.includes('piano')) {
          configs.melody = JSON.parse(JSON.stringify(configs.piano)); configs.melody.volume = -3;
          configs.chords = JSON.parse(JSON.stringify(configs.piano)); configs.chords.volume = -9;
      }
      if (hint.includes('strings')) {
        configs.melody.oscillator.type = 'fatsawtooth' as const; ((configs.melody.oscillator) as any).count = 4; ((configs.melody.oscillator) as any).spread = 30; configs.melody.volume = -6;
        configs.chords.oscillator.type = 'fatsawtooth' as const; ((configs.chords.oscillator) as any).count = 5; ((configs.chords.oscillator) as any).spread = 40; configs.chords.volume = -10; ((configs.chords.envelope) as any).attack = 0.4;
      }
      if (hint.includes('synth lead') || hint.includes('bright synth')) {
        configs.melody.oscillator.type = SAFE_OSC_TYPE; configs.melody.volume = -3;
      }
      if (hint.includes('synth pad') || hint.includes('warm pad')) {
        configs.chords.oscillator.type = 'amtriangle' as const; configs.chords.volume = -9; ((configs.chords.envelope) as any).attack = 0.8;
      }
      if (hint.includes('pluck') || hint.includes('sequence')) {
        configs.arpeggio.oscillator.type = SAFE_OSC_TYPE; configs.arpeggio.volume = -9;
        configs.arpeggio.envelope = { attack: 0.005, decay: 0.05, sustain: 0.1, release: 0.1 };
      }
       if (hint.includes('arp') || hint.includes('arpeggio')) {
        configs.arpeggio.oscillator.type = 'fmsawtooth' as const; ((configs.arpeggio.oscillator) as any).count=3; ((configs.arpeggio.oscillator) as any).spread=20; configs.arpeggio.volume = -7;
      }
      if (hint.includes('acoustic bass') || hint.includes('double bass')) {
        configs.bass.oscillator.type = 'sine' as const; configs.bass.volume = -3;
      }
      if (hint.includes('electric bass')) {
        configs.bass.oscillator.type = 'fatsquare' as const; ((configs.bass.oscillator) as any).count = 2; ((configs.bass.oscillator) as any).spread = 10; configs.bass.volume = -3;
      }
       if (hint.includes('flute')) {
        configs.melody.oscillator.type = SAFE_OSC_TYPE; configs.melody.volume = -6;
      }
    });
  }
  return configs;
};
