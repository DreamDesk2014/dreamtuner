
'use client';
import * as Tone from 'tone';
import { Midi as MidiFileParser } from '@tonejs/midi';
import type { MusicParameters } from '@/types';
import { generateMidiFile as generateMidiFileOriginal } from '@/lib/midiService';
import { mapInstrumentHintToGM as mapInstrumentHintToGMOriginal, ensureStrictlyIncreasingTimes } from '@/lib/midiService';
import { SOUNDFONT_URL } from '@/lib/constants'; // SOUNDFONT_URL might not be needed if not using Sampler with custom base

// --- audiobuffer-to-wav START ---
// (Utility functions: audioBufferToWav, encodeWAV, interleave, writeFloat32, floatTo16BitPCM, writeString - remain unchanged)
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


interface EventTime { time: number; duration: number; velocity: number; note?: string; name?: string; midi?: number; ticks?: number; }
interface SynthCollection { melody?: any; bass?: any; chords?: any; arpeggio?: any; kick?: any; snare?: any; hiHat?: any; piano?: Tone.PolySynth; [key: string]: any; } // Changed piano to PolySynth
interface SynthConfigurations { melody: any; bass: any; chords: any; arpeggio: any; kick: any; snare: any; hiHat: any; piano: any; }

const MIN_EFFECTIVE_DURATION = 2.0; // Minimum render duration if MIDI is very short

// REFINED MINIMAL HARDCODED TEST for generateWavFromMusicParameters
export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
    console.log("[WAV_GEN_DEBUG] Starting REVISED MINIMAL HARDCODED TEST (v2) for WAV generation.");
    try {
        if (Tone.context.state !== 'running') {
            console.log("[WAV_GEN_DEBUG] Global Tone.context state is not 'running', attempting Tone.start(). Current state:", Tone.context.state);
            await Tone.start();
            console.log("[WAV_GEN_DEBUG] Tone.start() completed. New state:", Tone.context.state);
        } else {
            console.log("[WAV_GEN_DEBUG] Global Tone.context state is already 'running'.");
        }

        Tone.Transport.stop();
        Tone.Transport.cancel(0);
        console.log("[WAV_GEN_DEBUG] Global Tone.Transport cleared and stopped.");

        Tone.Destination.volume.value = 0; // 0dB
        console.log("[WAV_GEN_DEBUG] Global Tone.Destination volume set to 0dB.");

        const tempoToSet = params.tempoBpm || 120;
        Tone.Transport.bpm.value = tempoToSet;
        console.log(`[WAV_GEN_DEBUG] Global Tone.Transport BPM set to: ${Tone.Transport.bpm.value}`);

        const renderDuration = 4.0; // Fixed render duration for this test
        console.log(`[WAV_GEN_DEBUG] Minimal test renderDuration: ${renderDuration}s`);

        const audioBuffer = await Tone.Offline(async (offlineContext) => { // offlineContext is the OfflineAudioContext
            console.log("[WAV_GEN_DEBUG_OFFLINE] Inside REVISED minimal Tone.Offline callback (v2). Offline Context Sample Rate:", offlineContext.sampleRate);
            
            // The offlineContext IS the OfflineAudioContext. Synths connect to its destination.
            // No separate transport object with .bpm or .start() is manipulated here.

            const testSynth = new Tone.Synth({
                oscillator: { type: 'triangle' }, // Basic, reliable oscillator
                envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 }, // Audible envelope
                volume: 0 // Loud volume
            }).connect(offlineContext.destination); // Connect directly to the offline context's destination

            console.log("[WAV_GEN_DEBUG_OFFLINE] TestSynth created and connected to offline destination. Volume:", testSynth.volume.value);

            // Schedule directly using the synth's methods, time is relative to Offline context start
            // The time parameter for triggerAttackRelease is absolute within the offline context's timeline
            testSynth.triggerAttackRelease("C4", "8n", 0.1, 0.9); // note, duration, time, velocity
            testSynth.triggerAttackRelease("E4", "8n", 0.5, 0.9);
            testSynth.triggerAttackRelease("G4", "8n", 1.0, 0.9);
            console.log("[WAV_GEN_DEBUG_OFFLINE] TestSynth notes scheduled directly.");

            // IMPORTANT: The Tone.Offline promise resolves when the duration is met.
            // No need to manually start/stop transport within this callback.

        }, renderDuration);

        console.log("[WAV_GEN_DEBUG] Minimal Tone.Offline rendering complete. AudioBuffer info: Channels:", audioBuffer.numberOfChannels, "Length:", audioBuffer.length, "SampleRate:", audioBuffer.sampleRate, "Duration:", audioBuffer.duration.toFixed(3) + "s");

        let isSilent = true;
        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
            const channelData = audioBuffer.getChannelData(i);
            let maxAbs = 0;
            for (let j = 0; j < channelData.length; j++) {
                if (Math.abs(channelData[j]) > 1e-6) { // Small threshold to detect sound
                    isSilent = false;
                    maxAbs = Math.max(maxAbs, Math.abs(channelData[j]));
                }
            }
            console.log(`[WAV_GEN_DEBUG] Channel ${i} max absolute value: ${maxAbs.toExponential(3)}`);
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
        console.error("[WAV_GEN_DEBUG_ERROR] Error in REVISED minimal hardcoded WAV generation (v2):", error);
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

  // Default configurations, trying to make them more audible by default
  let configs: SynthConfigurations = {
    melody: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.6 }, volume: -3 },
    bass: { oscillator: { type: 'fmsine', harmonicity: 1.2, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, volume: 0 },
    chords: { oscillator: { type: 'amtriangle', harmonicity: 0.5, modulationType: "sine" }, volume: -9, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 } },
    arpeggio: { oscillator: { type: 'fmsawtooth', harmonicity: 1.5, modulationIndex: 8 }, envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.2 }, volume: -7 },
    kick: { pitchDecay: 0.05, octaves: 10, oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" }, volume: 0 },
    snare: { noise: { type: 'pink' }, volume: -2, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } },
    hiHat: { frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3000, octaves: 1.5, volume: -6 },
    // Piano now uses FMSynth - no external samples needed
    piano: { harmonicity: 3.1, modulationIndex: 10, detune: 0, oscillator: { type: "fmsine" }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.8 }, volume: -6, modulationEnvelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.5 } }
  };

  if (isKidsMode) {
    configs.melody = { oscillator: { type: 'triangle' }, envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.4 }, volume: 0 };
    configs.bass = { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.3 }, volume: -3 };
    configs.chords = { oscillator: { type: 'square' }, envelope: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 }, volume: -6 };
    configs.arpeggio = { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.2 }, volume: -9 };
    configs.kick.volume = 0;
    configs.snare.volume = -3;
    configs.hiHat.volume = -9;

    if (genreLower.includes("electronic")) {
      configs.melody.oscillator.type = 'pwm'; configs.melody.oscillator.modulationFrequency = 0.5;
      configs.arpeggio.oscillator.type = 'pwm';
    } else if (genreLower.includes("pop")) {
      configs.melody.oscillator.type = 'triangle';
    }
    // If piano is hinted in kids mode, use the FMSynth based piano config
    if (hintsLower.some(h => h.includes('piano') || h.includes('toy piano'))) {
        configs.melody = JSON.parse(JSON.stringify(configs.piano));
        configs.melody.volume = 0;
        configs.chords = JSON.parse(JSON.stringify(configs.piano));
        configs.chords.volume = -6;
    }

  } else { // Standard Mode
    if (genreLower.includes('electronic') || genreLower.includes('pop')) {
      configs.melody.oscillator.type = 'pwm'; configs.melody.oscillator.modulationFrequency = 0.3; configs.melody.volume = 0;
      configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = 0;
      configs.chords.oscillator.type = 'pwm'; configs.chords.oscillator.modulationFrequency = 0.5; configs.chords.volume = -9;
      configs.arpeggio.oscillator.type = 'sawtooth'; configs.arpeggio.volume = -7;
      configs.kick.volume = 0; configs.snare.volume = -2; configs.hiHat.volume = -6;
    } else if (genreLower.includes('rock') || genreLower.includes('metal')) {
      configs.melody.oscillator.type = 'fatsawtooth'; configs.melody.envelope.attack = 0.01; configs.melody.volume = -3;
      configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = -3;
      configs.chords.oscillator.type = 'fatsquare'; configs.chords.volume = -9;
      configs.arpeggio.oscillator.type = 'fatsquare'; configs.arpeggio.volume = -12;
      configs.kick.volume = -1; configs.snare.volume = -3; configs.hiHat.volume = -9;
    } else if (genreLower.includes('jazz')) {
      // Use the FMSynth piano as default for melody/chords in jazz
      configs.melody = JSON.parse(JSON.stringify(configs.piano)); configs.melody.volume = -3;
      configs.bass.oscillator.type = 'sine'; configs.bass.volume = -3; // Acoustic bass sim
      configs.chords = JSON.parse(JSON.stringify(configs.piano)); configs.chords.volume = -9;
      configs.arpeggio.oscillator.type = 'sine'; configs.arpeggio.volume = -15;
      configs.kick.volume = -6; configs.snare.volume = -9; configs.hiHat.volume = -18;
      configs.hiHat.frequency = 400; configs.hiHat.envelope.decay = 0.1;
    } else if (genreLower.includes('ambient') || genreLower.includes('cinematic')) {
      configs.melody.oscillator.type = 'fatsine'; configs.melody.envelope.attack = 0.5; configs.melody.envelope.release = 2.0; configs.melody.volume = -6;
      configs.bass.oscillator.type = 'fmsine'; configs.bass.envelope.attack = 0.2; configs.bass.envelope.release = 1.5; configs.bass.volume = -3;
      configs.chords.oscillator.type = 'amtriangle'; configs.chords.volume = -9; configs.chords.envelope.attack = 1.0; configs.chords.envelope.release = 2.5;
      configs.arpeggio.oscillator.type = 'sine'; configs.arpeggio.volume = -12; configs.arpeggio.envelope.attack = 0.3; configs.arpeggio.envelope.release = 1.0;
    }

    hintsLower.forEach(hint => {
      if (hint.includes('piano')) {
          configs.melody = JSON.parse(JSON.stringify(configs.piano)); 
          configs.melody.volume = -3;
          configs.chords = JSON.parse(JSON.stringify(configs.piano));
          configs.chords.volume = -9;
      }
      if (hint.includes('strings')) {
        configs.melody.oscillator.type = 'fatsawtooth'; configs.melody.volume = -6;
        configs.chords.oscillator.type = 'fatsawtooth'; configs.chords.volume = -10; configs.chords.envelope.attack = 0.4;
      }
      if (hint.includes('synth lead') || hint.includes('bright synth')) {
        configs.melody.oscillator.type = 'pwm'; configs.melody.volume = -3;
      }
      if (hint.includes('synth pad') || hint.includes('warm pad')) {
        configs.chords.oscillator.type = 'amtriangle'; configs.chords.volume = -9; configs.chords.envelope.attack = 0.8;
      }
      if (hint.includes('pluck') || hint.includes('sequence')) { 
        configs.arpeggio.oscillator.type = 'triangle'; configs.arpeggio.volume = -9;
        configs.arpeggio.envelope = { attack: 0.005, decay: 0.05, sustain: 0.1, release: 0.1 };
      }
       if (hint.includes('arp') || hint.includes('arpeggio')) { 
        configs.arpeggio.oscillator.type = 'fmsawtooth'; configs.arpeggio.volume = -7; 
      }
      if (hint.includes('acoustic bass') || hint.includes('double bass')) {
        configs.bass.oscillator.type = 'sine'; configs.bass.volume = -3;
      }
      if (hint.includes('electric bass')) {
        configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = -3;
      }
       if (hint.includes('flute')) {
        configs.melody.oscillator.type = 'triangle'; configs.melody.volume = -6;
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
    BRIGHT_ACOUSTIC_PIANO: 0, 

    SHAKER_NOTE: 70, // GM Standard Shaker
    TAMBOURINE_NOTE: 54, // GM Standard Tambourine
    KIDS_KICK: 36, // GM Standard Acoustic Bass Drum
    KIDS_SNARE: 38, // GM Standard Acoustic Snare
    LIGHT_CYMBAL: 49, // GM Standard Crash Cymbal 1
    CLOSED_HIHAT_KID: 42, // GM Standard Closed Hi-Hat
};
// Full generateWavFromMusicParameters function (currently commented out, but contains the piano sampler fix for future)
/*
export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  console.log(`[WAV_GEN] Starting WAV generation for idea: ${params.generatedIdea.substring(0,30)}`);

  try {
    if (Tone.context.state !== 'running') {
      console.log("[WAV_GEN] Attempting Tone.start()...");
      await Tone.start();
      console.log("[WAV_GEN] Tone.js context started successfully.");
    } else {
      console.log("[WAV_GEN] Tone.js context already running.");
    }
    
    console.log("[WAV_GEN] Clearing global Tone.Transport state...");
    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    console.log("[WAV_GEN] Global Tone.Transport cleared and stopped.");

    console.log("[WAV_GEN] Setting global Tone.Destination volume to 0dB.");
    Tone.Destination.volume.value = 0; // Ensure master volume is audible

    const midiDataUri = generateMidiFileOriginal(params);
    console.log("[WAV_GEN] MIDI data URI generated.");
    const parsedMidi = new MidiFileParser(midiDataUri);
    console.log(`[WAV_GEN] MIDI parsed. Duration: ${parsedMidi.duration.toFixed(2)}s. Tracks: ${parsedMidi.tracks.length}`);

    const effectiveMidiDuration = Math.max(parsedMidi.duration, 0.1);
    const renderDuration = Math.max(effectiveMidiDuration + 2.0, MIN_EFFECTIVE_DURATION); // Add 2s tail, ensure min duration
    console.log(`[WAV_GEN] Calculated renderDuration: ${renderDuration.toFixed(2)}s`);

    const tempoToSet = params.tempoBpm || 120;
    Tone.Transport.bpm.value = tempoToSet;
    console.log(`[WAV_GEN] Global Tone.Transport BPM set to: ${Tone.Transport.bpm.value}`);

    const audioBuffer = await Tone.Offline(async (offlineContext) => {
      console.log("[WAV_GEN_OFFLINE] Inside Tone.Offline callback. Context sample rate:", offlineContext.sampleRate);
      // BPM is inherited from global Tone.Transport for Tone.Offline

      const synthConfigs = getSynthConfigurations(
        params.instrumentHints,
        params.selectedGenre,
        params.originalInput.mode === 'kids',
        params.generatedIdea,
        params.rhythmicDensity,
        params.harmonicComplexity
      );
      console.log("[WAV_GEN_OFFLINE] Synth configurations obtained:", synthConfigs);

      const synths: SynthCollection = {};
      let pianoSamplerLoaded = Promise.resolve(); // Default to resolved if not using sampler

      // Use FMSynth for piano to avoid external sample loading issues
      synthConfigs.piano.urls = {}; // Ensure no URLs are passed if we were to use Sampler
      synths.piano = new Tone.PolySynth(Tone.FMSynth, synthConfigs.piano);
      console.log("[WAV_GEN_OFFLINE] Piano using PolySynth(FMSynth). Volume:", synths.piano.volume.value);


      synths.melody = new Tone.PolySynth(Tone.Synth, synthConfigs.melody);
      synths.bass = new Tone.PolySynth(Tone.Synth, synthConfigs.bass);
      synths.chords = new Tone.PolySynth(Tone.Synth, synthConfigs.chords);
      synths.arpeggio = new Tone.PolySynth(Tone.Synth, synthConfigs.arpeggio);
      synths.kick = new Tone.MembraneSynth(synthConfigs.kick);
      synths.snare = new Tone.NoiseSynth(synthConfigs.snare);
      synths.hiHat = new Tone.MetalSynth(synthConfigs.hiHat);
      console.log("[WAV_GEN_OFFLINE] Synths instantiated.");

      await pianoSamplerLoaded; // If piano was sampler, this would await its loading
      if (synths.piano && synths.piano instanceof Tone.Sampler && !synths.piano.loaded) {
          console.warn("[WAV_GEN_OFFLINE_WARN] Piano sampler did not fully load, sound might be affected.");
      } else if (synths.piano && synths.piano instanceof Tone.Sampler) {
          console.log("[WAV_GEN_OFFLINE] Piano sampler loaded.");
      }


      Object.entries(synths).forEach(([key, synth]) => {
        if (synth && typeof synth.connect === 'function') {
          synth.connect(offlineContext.destination); // Connect to the offline context's destination
          console.log(`[WAV_GEN_OFFLINE] Synth '${key}' connected to offline destination. Volume: ${synth.volume?.value ?? 'N/A'}`);
        }
      });
      
      const instrumentMapping = mapInstrumentHintToGMOriginal(
        params.instrumentHints,
        params.selectedGenre,
        params.originalInput.mode === 'kids',
        params.generatedIdea
      );
      console.log("[WAV_GEN_OFFLINE] Instrument mapping:", instrumentMapping);

      const allParts: Tone.Part[] = [];

      parsedMidi.tracks.forEach((track, trackIndex) => {
        if (!track.notes || track.notes.length === 0) {
          console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Skipping empty track.`);
          return;
        }
        console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Processing track: ${track.name}, Channel: ${track.channel}, Instrument: ${track.instrument.name} (${track.instrument.number}), Notes: ${track.notes.length}`);

        let activeSynthForPart: any;
        let partRole: string = 'unknown';

        if (track.channel === 9) { // Drum track
          partRole = 'drums';
          activeSynthForPart = null; // Drums are handled per-note
          console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Identified as drum track.`);
        } else {
          const instrumentNumber = track.instrument.number;
          if (instrumentNumber === instrumentMapping.melody || trackIndex === 0) { partRole = 'melody'; activeSynthForPart = synths.melody; }
          else if (instrumentNumber === instrumentMapping.bass || (track.name.toLowerCase().includes('bass') && !activeSynthForPart)) { partRole = 'bass'; activeSynthForPart = synths.bass; }
          else if (instrumentNumber === instrumentMapping.chordsPad || (track.name.toLowerCase().includes('pad') && !activeSynthForPart)) { partRole = 'chords'; activeSynthForPart = synths.chords; }
          else if (instrumentNumber === instrumentMapping.arpeggioSynth || (track.name.toLowerCase().includes('arp') && !activeSynthForPart)) { partRole = 'arpeggio'; activeSynthForPart = synths.arpeggio; }
          else if (instrumentNumber === 0 || instrumentNumber === 1 || instrumentNumber === KID_INSTRUMENTS.BRIGHT_ACOUSTIC_PIANO) { // Piano
            partRole = 'piano'; activeSynthForPart = synths.piano;
          }
           else { // Fallback if no specific role matched
            partRole = 'melody_fallback'; activeSynthForPart = synths.melody; 
            console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Instrument number ${instrumentNumber} did not match primary roles, falling back to melody synth.`);
          }
          console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Assigned role: ${partRole}, Synth: ${activeSynthForPart?.name || 'Drum Synths'}`);
        }
        
        if (partRole === 'drums') {
            const drumEvents = ensureStrictlyIncreasingTimes(track.notes.map(n => ({
                time: n.time, midi: n.midi, duration: n.duration, velocity: n.velocity,
            })), `Drum Track ${trackIndex}`);

            const drumPart = new Tone.Part((time, value) => {
                console.log(`[WAV_GEN_OFFLINE_DRUM_PART] Triggering: Time=${time.toFixed(3)}, MIDI=${value.midi}, Vel=${value.velocity.toFixed(2)}`);
                let drumSynth: any;
                let pitchToPlay: string | number | undefined;
                let effectiveDuration = Math.max(0.01, value.duration * 0.9); // Ensure some duration, slight shorten

                // Basic GM Drum Mapping
                if (value.midi === 35 || value.midi === 36) { drumSynth = synths.kick; pitchToPlay = "C1"; } // Kick
                else if (value.midi === 38 || value.midi === 40) { drumSynth = synths.snare; } // Snare
                else if (value.midi === 42 || value.midi === 44 || value.midi === 46) { // Hi-Hats
                    drumSynth = synths.hiHat; pitchToPlay = value.midi === 46 ? 500 : 300; // Open vs Closed-ish
                }
                else if (value.midi === 49 || value.midi === 57) { drumSynth = synths.hiHat; pitchToPlay = 800; } // Crash Cymbals (using hiHat MetalSynth)
                else if (value.midi === 51 || value.midi === 59) { drumSynth = synths.hiHat; pitchToPlay = 600; } // Ride Cymbals
                else if (value.midi === KID_INSTRUMENTS.SHAKER_NOTE) { drumSynth = synths.snare; effectiveDuration = 0.05; } // Shaker via short NoiseSynth
                else if (value.midi === KID_INSTRUMENTS.TAMBOURINE_NOTE) { drumSynth = synths.hiHat; pitchToPlay = 1200; effectiveDuration = 0.08; } // Tambourine via bright MetalSynth
                else {
                    console.log(`[WAV_GEN_OFFLINE_DRUM_PART] Unmapped drum MIDI note: ${value.midi}`);
                    return; // Skip unmapped notes
                }

                if (drumSynth) {
                    if (drumSynth instanceof Tone.MembraneSynth) {
                        drumSynth.triggerAttackRelease(pitchToPlay as string, effectiveDuration, time, value.velocity);
                    } else if (drumSynth instanceof Tone.NoiseSynth) {
                        drumSynth.triggerAttackRelease(effectiveDuration, time, value.velocity);
                    } else if (drumSynth instanceof Tone.MetalSynth) {
                         if (drumSynth.frequency && typeof pitchToPlay === 'number') {
                            drumSynth.frequency.setValueAtTime(pitchToPlay, time);
                        }
                        drumSynth.triggerAttackRelease(effectiveDuration, time, value.velocity);
                    }
                }
            }, drumEvents);
            allParts.push(drumPart);
        } else if (activeSynthForPart) {
            const pitchedTrackEvents: EventTime[] = ensureStrictlyIncreasingTimes(track.notes.map(n => ({
                time: n.time, note: n.name, duration: n.duration, velocity: n.velocity,
            })), `Pitched Track ${trackIndex} (${partRole})`);

            const part = new Tone.Part((time, value) => {
                console.log(`[WAV_GEN_OFFLINE_PART (${partRole})] Triggering: Time=${time.toFixed(3)}, Note=${value.note}, Dur=${value.duration.toFixed(3)}, Vel=${value.velocity.toFixed(2)}`);
                const effectiveDuration = Math.max(0.01, value.duration * 0.95); // Ensure minimum duration and slight separation
                if (activeSynthForPart.loaded === false && activeSynthForPart instanceof Tone.Sampler) {
                     console.warn(`[WAV_GEN_OFFLINE_PART (${partRole})] Sampler not loaded, skipping note ${value.note}`);
                     return;
                }
                activeSynthForPart.triggerAttackRelease(value.note, effectiveDuration, time, value.velocity);
            }, pitchedTrackEvents);
            allParts.push(part);
        }
      });

      console.log(`[WAV_GEN_OFFLINE] Total parts created: ${allParts.length}`);
      allParts.forEach((p, i) => {
        p.start(0); // Start all parts at the beginning of the offline transport timeline
        console.log(`[WAV_GEN_OFFLINE] Part ${i} (Name: ${p.name}) started at time 0.`);
      });
      console.log("[WAV_GEN_OFFLINE] All parts started. Rendering should commence based on Tone.Offline duration.");

      // No explicit offlineContext.transport.start() needed here. Tone.Offline handles it.
    }, renderDuration);

    console.log("[WAV_GEN] Tone.Offline rendering complete. AudioBuffer channels:", audioBuffer.numberOfChannels, "length:", audioBuffer.length, "sampleRate:", audioBuffer.sampleRate);

    let isSilent = true;
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        const channelData = audioBuffer.getChannelData(i);
        let maxAbs = 0;
        for (let j = 0; j < channelData.length; j++) {
            if (Math.abs(channelData[j]) > 1e-6) { // Check for non-negligible audio
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
    if (error instanceof Error && error.message.includes("Failed to fetch")) {
        console.error("[WAV_GEN_ERROR_DETAIL] This might be due to failing to load audio samples (e.g., for Tone.Sampler). Ensure all sample URLs are correct and accessible.");
    }
    return null;
  }
};
*/
