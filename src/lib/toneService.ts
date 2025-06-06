
'use client';
import * as Tone from 'tone';
import { Midi as MidiFileParser } from '@tonejs/midi';
import type { MusicParameters } from '@/types';
import { generateMidiFile as generateMidiFileOriginal } from '@/lib/midiService'; // Renamed to avoid conflict
import { mapInstrumentHintToGM as mapInstrumentHintToGMOriginal, ensureStrictlyIncreasingTimes } from '@/lib/midiService';

// --- audiobuffer-to-wav START ---
// This is a direct adaptation of the audiobuffer-to-wav library
// https://github.com/Jam3/audiobuffer-to-wav
// Copyright (C) 2015-2018 Jam3. MIT License.
function audioBufferToWav(buffer: AudioBuffer, opt: { float32?: boolean } = {}): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = opt.float32 ? 3 : 1; // 3 = 32-bit float, 1 = 16-bit PCM
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

  if (format === 1) { // 16-bit PCM
    floatTo16BitPCM(view, 44, samples);
  } else { // 32-bit float
    writeFloat32(view, 44, samples);
  }

  return buffer;
}

function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);
  let index = 0;
  let inputIndex = 0;
  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function writeFloat32(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 4) {
    output.setFloat32(offset, input[i], true);
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
// --- audiobuffer-to-wav END ---


interface EventTime { time: number; duration: number; velocity: number; note?: string; name?: string; midi?: number; [key: string]: any; }


interface SynthConfigurations {
  melody: any;
  bass: any;
  chords: any;
  arpeggio: any;
  kick: any;
  snare: any;
  hiHat: any;
}

// Original getSynthConfigurations (commented out for minimal test)
/*
const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genre: string = '',
  isKidsMode: boolean = false
): SynthConfigurations => {
  // ... (original complex logic) ...
};
*/

const MIN_EFFECTIVE_DURATION = 5.0; // Minimum duration for rendering if MIDI is too short

// MINIMAL HARDCODED TEST
export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
    console.log("[WAV_GEN_DEBUG] Starting MINIMAL HARDCODED TEST for WAV generation.");
    try {
        await Tone.start(); // Ensure AudioContext is started/resumed
        console.log("[WAV_GEN_DEBUG] Tone.start() completed.");

        // Clean global transport state
        Tone.Transport.stop();
        Tone.Transport.cancel(0);
        console.log("[WAV_GEN_DEBUG] Global Tone.Transport cleared and stopped.");

        Tone.Destination.volume.value = 0; // Set global destination volume to 0dB as a safeguard
        console.log("[WAV_GEN_DEBUG] Global Tone.Destination volume set to 0dB.");

        Tone.Transport.bpm.value = 120; // Set a fixed BPM for the test
        console.log(`[WAV_GEN_DEBUG] Global Tone.Transport BPM set to: ${Tone.Transport.bpm.value}`);

        const renderDuration = 4.0; // Render for 4 seconds
        console.log(`[WAV_GEN_DEBUG] Minimal test renderDuration: ${renderDuration}s`);

        const audioBuffer = await Tone.Offline(async (offlineContextTransport) => {
            console.log("[WAV_GEN_DEBUG_OFFLINE] Inside minimal Tone.Offline callback. Context sample rate:", Tone.getContext().sampleRate);
            // Note: offlineContextTransport.bpm is not directly settable here; it inherits from global Tone.Transport

            // Simple synth with very audible settings
            const testSynth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.5 },
                volume: 0 // Loud (0dB)
            });
            testSynth.toDestination(); // Connect synth to offline context's destination
            console.log("[WAV_GEN_DEBUG_OFFLINE] TestSynth created and connected. Volume:", testSynth.volume.value);

            // Simple part with a few notes
            const testEvents = [
                { time: 0, note: "C4", duration: "4n", velocity: 0.9 },
                { time: "4n", note: "E4", duration: "4n", velocity: 0.9 },
                { time: "2n", note: "G4", duration: "2n", velocity: 0.9 },
                // { time: "1m" , note: "C5", duration: "1m", velocity: 0.9} // This might be cut if renderDuration is too short
            ];
            
            const testPart = new Tone.Part(((time, value) => {
                console.log(`[WAV_GEN_DEBUG_OFFLINE_PART] Triggering: Time=${typeof time === 'number' ? time.toFixed(3) : time}, Note=${value.note}, Dur=${value.duration}, Vel=${value.velocity}`);
                testSynth.triggerAttackRelease(value.note, value.duration, time, value.velocity);
            }), testEvents);
            
            testPart.loop = false; // Ensure it doesn't loop beyond renderDuration
            testPart.start(0); // Start the part at the beginning of the offline transport
            console.log("[WAV_GEN_DEBUG_OFFLINE] TestPart created, events added, and started at time 0.");

            // No need to call offlineContextTransport.start() - Tone.Offline handles this.

        }, renderDuration);

        console.log("[WAV_GEN_DEBUG] Minimal Tone.Offline rendering complete. AudioBuffer info: Channels:", audioBuffer.numberOfChannels, "Length:", audioBuffer.length, "SampleRate:", audioBuffer.sampleRate, "Duration:", audioBuffer.duration.toFixed(3) + "s");

        let isSilent = true;
        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            const channelData = audioBuffer.getChannelData(i);
            let maxAbs = 0;
            for (let j = 0; j < channelData.length; j++) {
                if (Math.abs(channelData[j]) > 1e-6) { // Using a very small threshold
                    isSilent = false;
                    maxAbs = Math.max(maxAbs, Math.abs(channelData[j]));
                }
            }
            console.log(`[WAV_GEN_DEBUG] Channel ${i} max absolute value: ${maxAbs.toExponential(3)}`);
            if (!isSilent) break;
        }

        if (isSilent) {
            console.warn("[WAV_GEN_DEBUG_WARN] Minimal Rendered AudioBuffer appears to be silent or extremely quiet.");
        } else {
            console.log("[WAV_GEN_DEBUG] Minimal Rendered AudioBuffer contains non-zero samples.");
        }

        const wavDataBuffer = audioBufferToWav(audioBuffer);
        console.log(`[WAV_GEN_DEBUG] Minimal WAV data buffer created. Size: ${wavDataBuffer.byteLength} bytes.`);
        return new Blob([wavDataBuffer], { type: 'audio/wav' });

    } catch (error) {
        console.error("[WAV_GEN_DEBUG_ERROR] Error in minimal hardcoded WAV generation:", error);
        return null;
    }
};


// --- Original generateWavFromMusicParameters function (now commented out for minimal test) ---
/*
export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  // ... (all the original complex logic) ...
};
*/


// --- Helper KID_INSTRUMENTS (moved to bottom to avoid any theoretical hoisting issues if it were used above its definition in a complex scenario)
const KID_INSTRUMENTS = {
    XYLOPHONE: 13, TOY_PIANO: 8,
    UKULELE: 24, RECORDER: 74,
    SIMPLE_SYNTH_LEAD: 80,
    SIMPLE_SYNTH_PAD: 89,
    ACOUSTIC_GUITAR_NYLON: 24,
    BRIGHT_ACOUSTIC_PIANO: 0,

    KIDS_KICK: 36,        
    ACOUSTIC_BASS_DRUM: 35, 
    KIDS_SNARE: 38,       
    HAND_CLAP: 39,        
    ELECTRIC_SNARE: 40,   
    LOW_FLOOR_TOM: 41,    
    CLOSED_HIHAT_KID: 42, 
    HIGH_FLOOR_TOM: 43,   
    PEDAL_HIHAT: 44,      
    LOW_TOM: 45,          
    OPEN_HIHAT: 46,       
    LOW_MID_TOM: 47,      
    HIGH_MID_TOM: 48,     
    LIGHT_CYMBAL: 49,     
    CRASH_CYMBAL_1: 49, 
    HIGH_TOM: 50,         
    RIDE_CYMBAL_1: 51,    
    CHINESE_CYMBAL: 52,   
    RIDE_BELL: 53,        
    TAMBOURINE_NOTE: 54,  
    SPLASH_CYMBAL: 55,    
    COWBELL: 56,          
    CRASH_CYMBAL_2: 57,   
    VIBRA_SLAP: 58,       
    RIDE_CYMBAL_2: 59,    
    HI_BONGO: 60,         
    LOW_BONGO: 61,        
    MUTE_HI_CONGA: 62,    
    OPEN_HI_CONGA: 63,    
    LOW_CONGA: 64,        
    HIGH_TIMBALE: 65,     
    LOW_TIMBALE: 66,      
    HIGH_AGOGO: 67,       
    LOW_AGOGO: 68,        
    CABASA: 69,           
    SHAKER_NOTE: 70,      
    SHORT_WHISTLE: 71,    
    LONG_WHISTLE: 72,     
    SHORT_GUIRO: 73,      
    LONG_GUIRO: 74,       
    CLAVES: 75,           
    HI_WOOD_BLOCK: 76,    
    LOW_WOOD_BLOCK: 77,   
    MUTE_CUICA: 78,       
    OPEN_CUICA: 79,       
    MUTE_TRIANGLE: 80,    
    OPEN_TRIANGLE: 81,    
};

    