
'use client';
import * as Tone from 'tone';
import { Midi as MidiFileParser } from '@tonejs/midi';
import type { MusicParameters } from '@/types';
import { generateMidiFile as generateMidiFileOriginal } from '@/lib/midiService';
import { mapInstrumentHintToGM as mapInstrumentHintToGMOriginal, ensureStrictlyIncreasingTimes } from '@/lib/midiService';

const SAFE_OSC_TYPE = 'triangle' as const; // Changed from 'pwm' to a universally safe type

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

// Helper function to convert Base64 to Uint8Array
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
  piano?: Tone.PolySynth<Tone.FMSynth>; // Changed from Sampler
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
  piano: any; // Configuration for FMSynth based piano
}

const MIN_EFFECTIVE_DURATION = 5.0; // Minimum duration for rendering to ensure sounds can play out

export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  console.log(`[WAV_GEN] Starting WAV generation for idea: ${params.generatedIdea.substring(0,30)}...`);
  
  // Tone.start() should be called by the UI component due to user gesture.
  // We assume it's already running or will be handled by the caller.
  if (Tone.context.state !== 'running') {
    console.warn("[WAV_GEN_WARN] Tone.js context is not 'running'. WAV generation might fail if not started by user gesture prior to this call.");
    // Consider throwing an error or returning null if context isn't running,
    // as OfflineAudioContext might also face restrictions.
    // For now, we'll proceed but log this warning.
  }

  try {
    console.log("[WAV_GEN] Clearing global Tone.Transport state...");
    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    console.log("[WAV_GEN] Global Tone.Transport cleared and stopped.");

    console.log("[WAV_GEN] Setting global Tone.Destination volume to 0dB.");
    Tone.Destination.volume.value = 0;

    const midiDataUri = generateMidiFileOriginal(params);
    console.log("[WAV_GEN] MIDI data URI generated. First 100 chars:", midiDataUri ? midiDataUri.substring(0,100) : "null/undefined");

    if (!midiDataUri || typeof midiDataUri !== 'string' || !midiDataUri.startsWith('data:audio/midi;base64,')) {
      console.error("[WAV_GEN_ERROR] Invalid or missing MIDI data URI. Cannot parse MIDI. URI:", midiDataUri);
      throw new Error("Failed to generate valid MIDI data for WAV conversion.");
    }
    
    let parsedMidi;
    try {
      const base64String = midiDataUri.split(',')[1];
      if (!base64String) {
        console.error("[WAV_GEN_ERROR] Could not extract Base64 string from MIDI data URI.");
        throw new Error("Invalid MIDI data URI format (missing Base64 content).");
      }
      const midiUint8Array = base64ToUint8Array(base64String);
      console.log(`[WAV_GEN] MIDI Uint8Array created. Length: ${midiUint8Array.length}`);
      parsedMidi = new MidiFileParser(midiUint8Array);
    } catch (parseError) {
      console.error("[WAV_GEN_ERROR] Error parsing MIDI data (from Uint8Array) with MidiFileParser:", parseError);
      console.error("[WAV_GEN_ERROR] Failing MIDI URI was (first 100 chars):", midiDataUri ? midiDataUri.substring(0,100) + "..." : "undefined/null");
      if (parseError instanceof Error) {
        throw new Error(`MidiFileParser failed: ${parseError.message}`);
      }
      throw new Error("MidiFileParser failed with an unknown error.");
    }

    console.log(`[WAV_GEN] MIDI parsed. Duration: ${parsedMidi.duration.toFixed(2)}s. Tracks: ${parsedMidi.tracks.length}`);
    
    const effectiveMidiDuration = Math.max(parsedMidi.duration, 0.1);
    const renderDuration = Math.max(effectiveMidiDuration + 2.0, MIN_EFFECTIVE_DURATION); 
    console.log(`[WAV_GEN] Calculated renderDuration: ${renderDuration.toFixed(2)}s`);

    const tempoToSet = params.tempoBpm || 120;
    Tone.Transport.bpm.value = tempoToSet;
    console.log(`[WAV_GEN] Global Tone.Transport BPM set to: ${Tone.Transport.bpm.value}`);

    const audioBuffer = await Tone.Offline(async (offlineContext) => { 
      console.log("[WAV_GEN_OFFLINE] Inside Tone.Offline callback. Context sample rate:", offlineContext.sampleRate);
      
      // The offlineContext itself is the transport for this scope.
      // Its BPM is inherited from the global Tone.Transport at the time Tone.Offline is called.
      // No need to set offlineContext.bpm.value here.

      const synthConfigs = getSynthConfigurations(
        params.instrumentHints,
        params.selectedGenre,
        params.originalInput.mode === 'kids',
        params.generatedIdea,
        params.rhythmicDensity,
        params.harmonicComplexity
      );
      console.log("[WAV_GEN_OFFLINE] Synth configurations obtained (first level):", Object.keys(synthConfigs));

      const synths: SynthCollection = {};
      
      // Ensure synths are connected to the offlineContext.destination
      synths.piano = new Tone.PolySynth(Tone.FMSynth, synthConfigs.piano).connect(offlineContext.destination);
      synths.melody = new Tone.PolySynth(Tone.Synth, synthConfigs.melody).connect(offlineContext.destination);
      synths.bass = new Tone.PolySynth(Tone.Synth, synthConfigs.bass).connect(offlineContext.destination);
      synths.chords = new Tone.PolySynth(Tone.Synth, synthConfigs.chords).connect(offlineContext.destination);
      synths.arpeggio = new Tone.PolySynth(Tone.Synth, synthConfigs.arpeggio).connect(offlineContext.destination);
      synths.kick = new Tone.MembraneSynth(synthConfigs.kick).connect(offlineContext.destination);
      synths.snare = new Tone.NoiseSynth(synthConfigs.snare).connect(offlineContext.destination);
      synths.hiHat = new Tone.MetalSynth(synthConfigs.hiHat).connect(offlineContext.destination);
      
      console.log("[WAV_GEN_OFFLINE] All Synths instantiated and connected to offline destination.");
      Object.entries(synths).forEach(([key, synth]) => {
        if (synth && synth.volume) console.log(`[WAV_GEN_OFFLINE] Synth '${key}' final volume: ${synth.volume.value}`);
      });
      
      const instrumentMapping = mapInstrumentHintToGMOriginal(
        params.instrumentHints,
        params.selectedGenre,
        params.originalInput.mode === 'kids',
        params.generatedIdea
      );
      console.log("[WAV_GEN_OFFLINE] Instrument mapping:", JSON.stringify(instrumentMapping));

      const allParts: Tone.Part[] = [];

      parsedMidi.tracks.forEach((track, trackIndex) => {
        if (!track.notes || track.notes.length === 0) {
          console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Skipping empty track: ${track.name || 'Unnamed'}.`);
          return;
        }
        console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Processing track: ${track.name || 'Unnamed'}, Channel: ${track.channel}, Instrument: ${track.instrument.name} (${track.instrument.number}), Notes: ${track.notes.length}`);

        let activeSynthForPart: any;
        let partRole: string = 'unknown';

        if (track.channel === 9) { 
          partRole = 'drums';
          activeSynthForPart = null; 
          console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Identified as drum track.`);
        } else {
          const instrumentNumber = track.instrument.number;
          if (instrumentNumber === instrumentMapping.melody) { partRole = 'melody'; activeSynthForPart = synths.melody; }
          else if (instrumentNumber === instrumentMapping.bass) { partRole = 'bass'; activeSynthForPart = synths.bass; }
          else if (instrumentNumber === instrumentMapping.chordsPad) { partRole = 'chords'; activeSynthForPart = synths.chords; }
          else if (instrumentNumber === instrumentMapping.arpeggioSynth) { partRole = 'arpeggio'; activeSynthForPart = synths.arpeggio; }
          else if (instrumentNumber === 0 || instrumentNumber === 1 || instrumentNumber === KID_INSTRUMENTS.BRIGHT_ACOUSTIC_PIANO || track.instrument.family === "piano") {
            partRole = 'piano'; activeSynthForPart = synths.piano;
             console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Assigned role 'piano', using FMSynth-based piano.`);
          } else {
            partRole = `melody_fallback_instr_${instrumentNumber}`; activeSynthForPart = synths.melody; 
            console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Instrument number ${instrumentNumber} did not match primary roles, falling back to melody synth.`);
          }
          console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Assigned role: ${partRole}, Synth: ${activeSynthForPart?.name || 'Drum Synths'}`);
        }
        
        if (partRole === 'drums') {
            const drumEvents = ensureStrictlyIncreasingTimes(track.notes.map(n => ({
                time: n.time, midi: n.midi, duration: n.duration, velocity: n.velocity,
            })), `Drum Track ${trackIndex}`);

            if (drumEvents.length === 0) {
                console.log(`[WAV_GEN_OFFLINE_DRUM_PART] No valid drum events after processing for track ${trackIndex}.`);
                return;
            }

            const drumPart = new Tone.Part(((time: Tone.Unit.Seconds, value: any) => {
                let drumSynth: any;
                let pitchToPlay: string | number | undefined = undefined; // Initialize to undefined
                let effectiveDuration = Math.max(0.01, value.duration * 0.9);
                // console.log(`[WAV_GEN_OFFLINE_DRUM_PART_EVENT] Time: ${time.toFixed(3)}, MIDI: ${value.midi}, Dur: ${value.duration.toFixed(3)}, Vel: ${value.velocity.toFixed(2)}`);

                if (value.midi === KID_INSTRUMENTS.KICK_DRUM_1 || value.midi === KID_INSTRUMENTS.KICK_DRUM_2 || value.midi === 36) { 
                    drumSynth = synths.kick; pitchToPlay = "C1"; 
                } else if (value.midi === KID_INSTRUMENTS.SNARE_ACOUSTIC || value.midi === KID_INSTRUMENTS.SNARE_ELECTRIC || value.midi === 38) { 
                    drumSynth = synths.snare; 
                } else if (value.midi === KID_INSTRUMENTS.HIHAT_CLOSED || value.midi === KID_INSTRUMENTS.HIHAT_PEDAL || value.midi === 42 || value.midi === 44) { 
                    drumSynth = synths.hiHat; pitchToPlay = 300; 
                } else if (value.midi === KID_INSTRUMENTS.HIHAT_OPEN || value.midi === 46) { 
                    drumSynth = synths.hiHat; pitchToPlay = 500; 
                } else if (value.midi === KID_INSTRUMENTS.CRASH_CYMBAL_1 || value.midi === KID_INSTRUMENTS.CRASH_CYMBAL_2 || value.midi === 49 || value.midi === 57) { 
                    drumSynth = synths.hiHat; pitchToPlay = 800; effectiveDuration = Math.max(0.2, value.duration * 0.9); 
                } else if (value.midi === KID_INSTRUMENTS.RIDE_CYMBAL_1 || value.midi === KID_INSTRUMENTS.RIDE_CYMBAL_2 || value.midi === 51 || value.midi === 59) { 
                    drumSynth = synths.hiHat; pitchToPlay = 600; 
                } else if (value.midi === KID_INSTRUMENTS.SHAKER || value.midi === 70) { 
                    drumSynth = synths.snare; effectiveDuration = 0.05; 
                } else if (value.midi === KID_INSTRUMENTS.TAMBOURINE || value.midi === 54) { 
                    drumSynth = synths.hiHat; pitchToPlay = 1200; effectiveDuration = 0.08; 
                } else {
                    // console.log(`[WAV_GEN_OFFLINE_DRUM_PART_EVENT] Unmapped drum MIDI note: ${value.midi}`);
                    return; // Skip unmapped notes
                }

                if (drumSynth) {
                    if (drumSynth instanceof Tone.MembraneSynth) {
                        if (typeof pitchToPlay === 'string') {
                            drumSynth.triggerAttackRelease(pitchToPlay, effectiveDuration, time, value.velocity);
                        } else {
                             drumSynth.triggerAttackRelease("C1", effectiveDuration, time, value.velocity); // Default for MembraneSynth if pitchToPlay isn't a string
                        }
                    } else if (drumSynth instanceof Tone.NoiseSynth) {
                        drumSynth.triggerAttackRelease(effectiveDuration, time, value.velocity);
                    } else if (drumSynth instanceof Tone.MetalSynth) {
                         if (drumSynth.frequency && typeof pitchToPlay === 'number') { // Check frequency exists and pitchToPlay is a number
                            drumSynth.frequency.setValueAtTime(pitchToPlay, time);
                        } else if (drumSynth.frequency && typeof pitchToPlay !== 'number'){
                            // console.warn(`[WAV_GEN_OFFLINE_DRUM_PART_EVENT] MetalSynth 'pitchToPlay' is not a number for MIDI ${value.midi}:`, pitchToPlay);
                        }
                        drumSynth.triggerAttackRelease(effectiveDuration, time, value.velocity);
                    }
                } else {
                    // console.log(`[WAV_GEN_OFFLINE_DRUM_PART_EVENT] No drum synth assigned for MIDI ${value.midi}`);
                }
            }) as Tone.ToneEventCallback<any>, drumEvents); // Type assertion for callback
            allParts.push(drumPart);
        } else if (activeSynthForPart) {
            const pitchedTrackEvents: EventTime[] = ensureStrictlyIncreasingTimes(track.notes.map(n => ({
                time: n.time, note: n.name, duration: n.duration, velocity: n.velocity,
            })), `Pitched Track ${trackIndex} (${partRole})`);

            if (pitchedTrackEvents.length === 0) {
                console.log(`[WAV_GEN_OFFLINE_PART (${partRole})] No valid pitched events after processing for track ${trackIndex}.`);
                return;
            }

            const part = new Tone.Part(((time: Tone.Unit.Seconds, value: any) => {
                if (value.note && typeof value.note === 'string') { 
                  // console.log(`[WAV_GEN_OFFLINE_PART (${partRole})] Triggering: Time=${time.toFixed(3)}, Note=${value.note}, Dur=${value.duration.toFixed(3)}, Vel=${value.velocity.toFixed(2)}`);
                  const effectiveDuration = Math.max(0.01, value.duration * 0.95); // Ensure duration is positive
                  activeSynthForPart.triggerAttackRelease(value.note, effectiveDuration, time, value.velocity);
                }
            }) as Tone.ToneEventCallback<any>, pitchedTrackEvents); // Type assertion for callback
            allParts.push(part);
        }
      });

      console.log(`[WAV_GEN_OFFLINE] Total parts created: ${allParts.length}`);
      allParts.forEach((p, i) => {
        if (p && typeof p.start === 'function') {
            p.start(0); 
            console.log(`[WAV_GEN_OFFLINE] Part ${i} (Name: ${p.name || 'Unnamed'}) started at time 0.`);
        } else {
            console.warn(`[WAV_GEN_OFFLINE] Part ${i} is invalid or cannot be started.`);
        }
      });
      console.log("[WAV_GEN_OFFLINE] All parts started. Rendering should commence based on Tone.Offline duration.");
      // No manual offlineContext.transport.start() needed. Tone.Offline handles this.

    }, renderDuration);

    console.log("[WAV_GEN] Tone.Offline rendering complete. AudioBuffer channels:", audioBuffer.numberOfChannels, "length:", audioBuffer.length, "sampleRate:", audioBuffer.sampleRate, "duration:", audioBuffer.duration.toFixed(3) + "s");

    let isSilent = true;
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        const channelData = audioBuffer.getChannelData(i);
        let maxAbs = 0;
        for (let j = 0; j < channelData.length; j++) {
            if (Math.abs(channelData[j]) > 1e-6) { // Using a small threshold
                isSilent = false;
                maxAbs = Math.max(maxAbs, Math.abs(channelData[j]));
            }
        }
        console.log(`[WAV_GEN] Channel ${i} max absolute value: ${maxAbs.toExponential(3)}`);
        if (!isSilent) break;
    }
    if (isSilent) {
        console.warn("[WAV_GEN_WARN] Rendered AudioBuffer appears to be silent or very close to silent. Check synth volumes, envelopes, and event scheduling logs.");
    } else {
        console.log("[WAV_GEN] Rendered AudioBuffer contains non-zero samples.");
    }

    const wavDataBuffer = audioBufferToWav(audioBuffer);
    console.log(`[WAV_GEN] WAV data buffer created. Size: ${wavDataBuffer.byteLength} bytes.`);
    return new Blob([wavDataBuffer], { type: 'audio/wav' });

  } catch (error) {
    console.error("[WAV_GEN_ERROR] Error generating WAV with Tone.js:", error);
    if (error instanceof Error) {
        console.error(`[WAV_GEN_ERROR_DETAILS] Name: ${error.name}, Message: ${error.message}, Stack: ${error.stack}`);
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
    melody: { oscillator: { type: 'triangle' as const }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.6 }, volume: 0 },
    bass: { oscillator: { type: 'fmsine' as const, harmonicity: 1.2, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, volume: 0 },
    chords: { oscillator: { type: 'amtriangle' as const, harmonicity: 0.5, modulationType: "sine" as const }, volume: -6, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 } },
    arpeggio: { oscillator: { type: 'triangle' as const, harmonicity: 1.5, modulationIndex: 8 }, envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.2 }, volume: -7 },
    kick: { pitchDecay: 0.05, octaves: 10, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" as const }, volume: 0 },
    snare: { noise: { type: 'pink' as const }, volume: -2, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } },
    hiHat: { frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3000, octaves: 1.5, volume: -6 },
    piano: { // FMSynth configuration for piano
      harmonicity: 3.01, 
      modulationIndex: 14, // Adjusted for a more piano-like timbre
      detune: 0,
      oscillator: { type: "sine" as const, partials: [1, 0.2, 0.05] }, // Simplified partials
      envelope: { attack: 0.01, decay: 0.6, sustain: 0.1, release: 0.8 },
      modulation: {type: "square" as const}, // Changed from triangle
      modulationEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.01, release: 0.5 }, // Adjusted release
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
      configs.arpeggio.oscillator.type = 'fatsawtooth' as const; configs.arpeggio.volume = -7;
      configs.kick.volume = 0; configs.snare.volume = -2; configs.hiHat.volume = -6;
    } else if (genreLower.includes('rock') || genreLower.includes('metal')) {
      configs.melody.oscillator.type = 'fatsawtooth' as const; configs.melody.envelope.attack = 0.01; configs.melody.volume = -3;
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
      if (hint.includes('piano')) { // This will now use the FMSynth piano config
          configs.melody = JSON.parse(JSON.stringify(configs.piano)); configs.melody.volume = -3;
          configs.chords = JSON.parse(JSON.stringify(configs.piano)); configs.chords.volume = -9;
      }
      if (hint.includes('strings')) {
        configs.melody.oscillator.type = 'fatsawtooth' as const; configs.melody.volume = -6;
        configs.chords.oscillator.type = 'fatsawtooth' as const; configs.chords.volume = -10; ((configs.chords.envelope) as any).attack = 0.4;
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
        configs.arpeggio.oscillator.type = 'fmsawtooth' as const; configs.arpeggio.volume = -7; 
      }
      if (hint.includes('acoustic bass') || hint.includes('double bass')) {
        configs.bass.oscillator.type = 'sine' as const; configs.bass.volume = -3;
      }
      if (hint.includes('electric bass')) {
        configs.bass.oscillator.type = 'fatsquare' as const; configs.bass.volume = -3;
      }
       if (hint.includes('flute')) {
        configs.melody.oscillator.type = SAFE_OSC_TYPE; configs.melody.volume = -6;
      }
    });
  }
  return configs;
};

const KID_INSTRUMENTS = { 
    XYLOPHONE: 13, TOY_PIANO: 8, 
    UKULELE: 24, RECORDER: 74,
    SIMPLE_SYNTH_LEAD: 80, 
    SIMPLE_SYNTH_PAD: 89,  
    ACOUSTIC_GUITAR_NYLON: 24, 
    BRIGHT_ACOUSTIC_PIANO: 0, // Often GM #1 (Acoustic Grand) or #2 (Bright Acoustic)

    // Standard GM Drum Map Notes (Channel 10)
    KICK_DRUM_2: 35,      // Acoustic Bass Drum
    KICK_DRUM_1: 36,      // Bass Drum 1
    SNARE_ACOUSTIC: 38,   // Acoustic Snare
    SNARE_ELECTRIC: 40,   // Electric Snare
    HIHAT_CLOSED: 42,     // Closed Hi-Hat
    HIHAT_PEDAL: 44,      // Pedal Hi-Hat
    HIHAT_OPEN: 46,       // Open Hi-Hat
    CRASH_CYMBAL_1: 49,   // Crash Cymbal 1
    RIDE_CYMBAL_1: 51,    // Ride Cymbal 1
    TAMBOURINE: 54,       // Tambourine
    CRASH_CYMBAL_2: 57,   // Crash Cymbal 2 (often an alternative crash)
    RIDE_CYMBAL_2: 59,    // Ride Cymbal 2 (often ride bell)
    SHAKER: 70,           // Maracas (often used for Shaker sound)
};

    
