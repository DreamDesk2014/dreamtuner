'use client';
import * as Tone from 'tone';
import { Midi as MidiFileParser } from '@tonejs/midi';
import type { MusicParameters } from '@/types';
import { generateMidiFile } from '@/lib/midiService'; 
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

const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genre: string = '',
  isKidsMode: boolean = false
): SynthConfigurations => {
  const hintsLower = instrumentHints.map(h => h.toLowerCase());
  const genreLower = genre.toLowerCase();

  // More audible default volumes
  let configs: SynthConfigurations = {
    melody: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.4 }, volume: -3 }, // Was -6
    bass: { oscillator: { type: 'fatsine', count: 2, spread: 10 }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.5 }, volume: -1 }, // Was -3
    chords: { oscillator: { type: 'amtriangle', harmonicity: 0.5 }, volume: -8, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 } }, // Was -10
    arpeggio: { oscillator: { type: 'fmsawtooth', harmonicity: 1.5, modulationIndex: 8 }, envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.2 }, volume: -6 }, // Was -9
    kick: { pitchDecay: 0.05, octaves: 10, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: 'exponential' }, volume: 0 }, // Was -3
    snare: { noise: { type: 'pink' }, volume: -5, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } }, // Was -8
    hiHat: { frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3000, octaves: 1.5, volume: -10 }, // Was -15
  };

  if (isKidsMode) {
    configs.melody = { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3 }, volume: -3 }; // was -6
    configs.bass = { oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.4 }, volume: -1 }; // was -3
    configs.chords = { oscillator: { type: 'triangle' }, volume: -9, envelope: { attack: 0.1, decay: 0.4, sustain: 0.5, release: 0.8 } }; // was -12
    configs.arpeggio = { oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.2 }, volume: -7 }; // was -10
    configs.kick.pitchDecay = 0.1; configs.kick.volume = 0; // was default, now 0
    configs.snare.noise.type = 'white'; configs.snare.envelope.decay = 0.1; configs.snare.volume = -4; // Was -7
    configs.hiHat.frequency = 300; configs.hiHat.envelope.decay = 0.03; configs.hiHat.volume = -9; // Was -14
  } else {
    if (genreLower.includes('electronic') || genreLower.includes('pop')) {
      configs.melody.oscillator.type = 'pwm'; 
      configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = 0; // Maintained 0
      configs.chords.oscillator.type = 'pwm'; configs.chords.oscillator.modulationFrequency = 0.5; configs.chords.volume = -9; // Was -10
      configs.arpeggio.oscillator.type = 'sawtooth'; configs.arpeggio.volume = -5; // Was -8
    } else if (genreLower.includes('ambient')) {
      configs.melody.envelope = { attack: 0.5, decay: 0.2, sustain: 0.8, release: 2.0 }; configs.melody.volume = -5; // Was -8
      configs.bass.envelope = { attack: 0.6, decay: 0.3, sustain: 0.9, release: 2.5 }; configs.bass.volume = -2; // Was -5
      configs.chords.oscillator.type = 'fatsine'; configs.chords.volume = -9; // Was -12
      configs.chords.envelope = { attack: 1.0, decay: 0.5, sustain: 0.9, release: 3.0 };
      configs.arpeggio.envelope = { attack: 0.8, decay: 0.3, sustain: 0.9, release: 2.2 }; configs.arpeggio.volume = -7; // Was -10
    } else if (genreLower.includes('rock') || genreLower.includes('metal')) {
      configs.melody.oscillator.type = 'fatsawtooth'; configs.melody.volume = 0; // Was -3
      configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = 0; // Maintained 0
      configs.chords.oscillator.type = 'fatsawtooth'; configs.chords.volume = -7; // Was -10
      configs.arpeggio.oscillator.type = 'sawtooth'; configs.arpeggio.volume = -5; // Was -8
      configs.kick.octaves = 8; configs.kick.envelope.decay = 0.3; configs.kick.volume = 0; // was default, now 0
      configs.snare.envelope.decay = 0.1; configs.snare.volume = -4; // Was -7
    } else if (genreLower.includes('jazz')) {
      configs.melody = { oscillator: { type: 'fmsine', harmonicity: 1.5, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.2 }, volume: -3 }; // was -6
      configs.bass = { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.3 }, volume: -1 }; // was -3
      configs.chords = { oscillator: { type: 'fmtriangle', harmonicity: 2, modulationIndex: 3 }, volume: -12, envelope: { attack: 0.02, decay: 0.6, sustain: 0.3, release: 0.5 } }; // was -15
      configs.arpeggio = { oscillator: { type: 'sine' }, volume: -7 }; // Was -10
    }

    hintsLower.forEach(hint => {
      if (hint.includes('piano') && !isKidsMode) {
        // Sampler will be used for piano, specific config in generateWav
      } else if (hint.includes('strings') || (hint.includes('pad') && !hint.includes('synth pad'))) {
        configs.melody = { oscillator: { type: 'fatsawtooth', count: 5, spread: 30 }, envelope: { attack: 0.3, decay: 0.1, sustain: 0.9, release: 1.2 }, volume: -5 }; // Was -8
        configs.chords = { oscillator: { type: 'fatsawtooth', count: 7, spread: 50 }, volume: -7, envelope: { attack: 0.5, decay: 0.2, sustain: 0.9, release: 1.5 } }; // Was -10
      } else if (hint.includes('synth lead') && !isKidsMode) {
        configs.melody = { oscillator: { type: 'pwm', modulationFrequency: 0.3 }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.6 }, volume: 0 }; // Was -3
      } else if (hint.includes('acoustic guitar') && !isKidsMode) {
         configs.melody = { oscillator: { type: 'fmtriangle', harmonicity: 1.2, modulationIndex: 12 }, envelope: { attack: 0.01, decay: 0.25, sustain: 0.01, release: 0.15}, volume: -4 }; // was -7
         configs.chords = { oscillator: { type: 'fmtriangle', harmonicity: 1.5, modulationIndex: 10 }, volume: -9, envelope: { attack: 0.02, decay: 0.4, sustain: 0.05, release: 0.25} }; // Was -12
      } else if (hint.includes('flute')) {
        configs.melody = { oscillator: { type: 'triangle8' }, envelope: { attack: 0.06, decay: 0.15, sustain: 0.6, release: 0.35 }, volume: -5 }; // was -8
      } else if (hint.includes('bell') || hint.includes('xylophone')) {
        configs.melody = { oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.5, sustain: 0.01, release: 0.3, attackCurve: 'exponential' }, volume: -3 }; // was -6
        configs.arpeggio = { oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.1 }, volume: -5 }; // Was -8
      }
      if (hint.includes('synth bass')) configs.bass = { oscillator: {type: 'fatsquare', count: 3, spread: 15}, envelope: {attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3}, volume: 0}; // Maintained 0
      else if (hint.includes('acoustic bass') && !genreLower.includes('jazz')) configs.bass = { oscillator: {type: 'sine'}, envelope: {attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.3}, volume: -1}; // was -3
      if (hint.includes('synth pad')) configs.chords = {oscillator: {type: 'fatsawtooth', count: 4, spread: 60}, volume: -9, envelope: {attack: 0.4, decay: 0.1, sustain: 0.9, release: 1.2}}; // Was -12
      if (hint.includes('arp') || hint.includes('arpeggio') || hint.includes('pluck') || hint.includes('sequence')) {
        configs.arpeggio.oscillator.type = 'pwm'; 
        configs.arpeggio.volume = -5; // Was -8
      }
    });
  }
  return configs;
};

const generatePianoSampleUrls = (): Record<string, string> => {
    const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const salamanderFileNotes = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
    const urls: Record<string, string> = {};
    for (let octave = 1; octave <= 7; octave++) {
      notes.forEach((note, index) => {
        urls[`${note}${octave}`] = `${salamanderFileNotes[index]}${octave}.mp3`;
      });
    }
    return urls;
};


export const generateWavFromMusicParameters = async (params: MusicParameters): Promise<Blob | null> => {
  console.log("[WAV_GEN] Starting WAV generation for idea:", params.generatedIdea.substring(0,30));
  try {
    await Tone.start();
    console.log("[WAV_GEN] Tone.js started.");

    // Clear previous transport events and stop transport
    if (Tone.Transport.state === "started") {
        Tone.Transport.stop();
    }
    Tone.Transport.cancel(0); 
    console.log("[WAV_GEN] Global Tone.Transport cleared and stopped.");

    // Set global destination volume as a safeguard
    Tone.Destination.volume.value = 0; // 0dB
    console.log("[WAV_GEN] Global Tone.Destination volume set to 0dB.");


    const midiDataUri = generateMidiFile(params);
    if (!midiDataUri || !midiDataUri.startsWith('data:audio/midi;base64,')) {
      console.error("[WAV_GEN_ERROR] Failed to generate valid MIDI data for Tone.js rendering.");
      return null;
    }
    console.log("[WAV_GEN] MIDI data URI generated.");

    const parsedMidi = await MidiFileParser.fromUrl(midiDataUri);
    console.log(`[WAV_GEN] MIDI parsed. Duration: ${parsedMidi.duration.toFixed(2)}s. Tracks: ${parsedMidi.tracks.length}`);

    if (parsedMidi.duration <= 0 && parsedMidi.tracks.every(t => t.notes.length === 0)) {
        console.warn("[WAV_GEN_WARN] MIDI duration is zero or negative, and no notes found. Cannot render meaningfully. Returning null.");
        return null;
    }
    
    const MIN_EFFECTIVE_DURATION = 5.0; // Minimum duration for rendering if MIDI is too short
    const effectiveMidiDuration = Math.max(parsedMidi.duration, 0.1); // Ensure at least a small positive duration
    const renderDuration = Math.max(effectiveMidiDuration + 2.0, MIN_EFFECTIVE_DURATION); // Add tail time, ensure minimum
    console.log(`[WAV_GEN] Calculated renderDuration: ${renderDuration.toFixed(2)}s`);


    const tempoToSet = (typeof params.tempoBpm === 'number' && params.tempoBpm > 30 && params.tempoBpm < 300)
                       ? params.tempoBpm
                       : 120;
    
    // Set BPM on the global transport *before* calling Tone.Offline
    Tone.Transport.bpm.value = tempoToSet;
    console.log(`[WAV_GEN] Global Tone.Transport BPM set to: ${tempoToSet}`);


    const audioBuffer = await Tone.Offline(async (offlineContextTransport) => {
      console.log("[WAV_GEN_OFFLINE] Inside Tone.Offline callback. Context sample rate:", Tone.getContext().sampleRate);
      offlineContextTransport.bpm.value = tempoToSet; // Also set on offline context's transport
      console.log(`[WAV_GEN_OFFLINE] Offline transport BPM set to: ${offlineContextTransport.bpm.value}`);


      const synthConfigs = getSynthConfigurations(
        params.instrumentHints,
        params.selectedGenre,
        params.originalInput.mode === 'kids'
      );
      console.log("[WAV_GEN_OFFLINE] Synth configurations obtained:", synthConfigs);

      const synths: {
        melody?: Tone.PolySynth | Tone.Sampler,
        bass?: Tone.PolySynth,
        chords?: Tone.PolySynth,
        arpeggio?: Tone.PolySynth, 
        kick?: Tone.MembraneSynth,
        snare?: Tone.NoiseSynth,
        hiHat?: Tone.MetalSynth,
      } = {};

      const usePianoSampler = params.instrumentHints.some(h => h.toLowerCase().includes('piano')) && params.originalInput.mode !== 'kids';
      console.log(`[WAV_GEN_OFFLINE] Using piano sampler: ${usePianoSampler}`);

      if (usePianoSampler) {
        synths.melody = new Tone.Sampler({
            urls: generatePianoSampleUrls(),
            baseUrl: "https://tonejs.github.io/audio/salamander/",
            release: 1,
        });
      } else {
        synths.melody = new Tone.PolySynth(Tone.Synth, synthConfigs.melody);
      }

      synths.bass = new Tone.PolySynth(Tone.Synth, synthConfigs.bass);
      synths.chords = new Tone.PolySynth(Tone.Synth, synthConfigs.chords);
      synths.arpeggio = new Tone.PolySynth(Tone.Synth, synthConfigs.arpeggio);
      synths.kick = new Tone.MembraneSynth(synthConfigs.kick);
      synths.snare = new Tone.NoiseSynth(synthConfigs.snare);
      synths.hiHat = new Tone.MetalSynth(synthConfigs.hiHat);
      
      console.log("[WAV_GEN_OFFLINE] Synths instantiated.");

      Object.entries(synths).forEach(([name, synth]) => {
        if (synth && typeof synth.toDestination === 'function') {
          synth.toDestination(); 
          console.log(`[WAV_GEN_OFFLINE] Synth '${name}' connected to destination. Volume: ${synth.volume?.value ?? 'N/A'}`);
        }
      });
      
      if (synths.melody && usePianoSampler && typeof (synths.melody as Tone.Sampler).loaded === 'boolean') {
        console.log("[WAV_GEN_OFFLINE] Waiting for piano sampler to load...");
        await (synths.melody as Tone.Sampler).loaded;
        console.log("[WAV_GEN_OFFLINE] Piano sampler loaded.");
      } else if (synths.melody && usePianoSampler) {
         console.warn("[WAV_GEN_OFFLINE_WARN] Piano sampler 'loaded' property not available or not a boolean, proceeding without explicit await.");
      }


      const instrumentMapping = mapInstrumentHintToGMOriginal(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids', params.generatedIdea);
      console.log("[WAV_GEN_OFFLINE] Instrument mapping:", instrumentMapping);
      
      const allParts: Tone.Part[] = [];

      parsedMidi.tracks.forEach((track, trackIndex) => {
        console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Processing track: ${track.name || 'Unnamed'}, Channel: ${track.channel}, Instrument: ${track.instrument.name} (${track.instrument.number}), Notes: ${track.notes.length}`);
        if (track.notes.length === 0) {
            console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Skipping empty track.`);
            return;
        }

        let activeSynthForPart: Tone.PolySynth | Tone.Sampler | Tone.MembraneSynth | Tone.NoiseSynth | Tone.MetalSynth | undefined;
        let isDrumTrack = false;
        let partRole = 'unknown';

        if (track.channel === 9) { 
          isDrumTrack = true;
          partRole = 'drums';
          console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Identified as drum track.`);
        } else {
          if (track.instrument.number === instrumentMapping.melody || (trackIndex === 0 && !Object.values(instrumentMapping).includes(track.instrument.number))) { activeSynthForPart = synths.melody; partRole = 'melody';}
          else if (track.instrument.number === instrumentMapping.bass) { activeSynthForPart = synths.bass; partRole = 'bass'; }
          else if (track.instrument.number === instrumentMapping.chordsPad) { activeSynthForPart = synths.chords; partRole = 'chords'; }
          else if (track.instrument.number === instrumentMapping.arpeggioSynth) { activeSynthForPart = synths.arpeggio; partRole = 'arpeggio';}
          else { 
            console.warn(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] No specific synth mapping for instrument ${track.instrument.number}, defaulting to melody synth.`);
            activeSynthForPart = synths.melody; partRole = 'melody_default';
          }
          console.log(`[WAV_GEN_OFFLINE_TRACK ${trackIndex}] Assigned role: ${partRole}, Synth: ${activeSynthForPart?.name || 'N/A'}`);
        }

        if (!isDrumTrack && activeSynthForPart) {
            const part = new Tone.Part(((time, value) => {
                if (activeSynthForPart && typeof activeSynthForPart.triggerAttackRelease === 'function') {
                    const effectiveDuration = Math.max(value.duration, 0.01);
                    console.log(`[WAV_GEN_OFFLINE_PART ${partRole}] Time: ${time.toFixed(3)}, Note: ${value.note}, Dur: ${effectiveDuration.toFixed(3)}, Vel: ${value.velocity.toFixed(3)}, Synth: ${activeSynthForPart.name}`);
                    (activeSynthForPart as Tone.PolySynth | Tone.Sampler).triggerAttackRelease(value.note, effectiveDuration, time, value.velocity);
                } else {
                    console.warn(`[WAV_GEN_OFFLINE_PART ${partRole}] No active synth or trigger method for event:`, value);
                }
            }));
            
            const pitchedTrackEvents: EventTime[] = track.notes.map(n => ({
                time: n.time, note: n.name, duration: n.duration, velocity: n.velocity,
            }));
            const correctedPitchedEvents = ensureStrictlyIncreasingTimes(pitchedTrackEvents, `Pitched-Track-${track.name || trackIndex}`);
            correctedPitchedEvents.forEach(event => {
                if (event.note && typeof event.note === 'string') {
                    part.add(event.time, event);
                }
            });
            allParts.push(part);
        } else if (isDrumTrack) {
            const drumPart = new Tone.Part(((time, value) => {
                let drumSynth: Tone.MembraneSynth | Tone.NoiseSynth | Tone.MetalSynth | undefined;
                let pitchToPlay: string | number | undefined = undefined; // For MembraneSynth frequency or MetalSynth
                let effectiveDuration = Math.max(value.duration > 0 ? value.duration : 0.05, 0.05);
                let drumType = 'unknown_drum';

                if (value.midi === 35 || value.midi === 36) { drumSynth = synths.kick; pitchToPlay = "C1"; drumType = 'kick'; }
                else if (value.midi === 38 || value.midi === 40) { drumSynth = synths.snare; drumType = 'snare'; }
                else if (value.midi === 42 || value.midi === 44 || value.midi === 46) { // Hi-hats
                    drumSynth = synths.hiHat; 
                    pitchToPlay = value.midi === 46 ? 400 : 250; // Open vs closed-ish
                    drumType = value.midi === 46 ? 'open_hihat' : 'closed_hihat';
                } else if (value.midi === 49 || value.midi === 57) { // Crash/Ride cymbals
                    drumSynth = synths.hiHat; // Using MetalSynth for cymbals
                    pitchToPlay = 600; 
                    effectiveDuration = 0.5 + Math.random() * 0.5;
                    drumType = 'cymbal';
                } else if (value.midi === KID_INSTRUMENTS.SHAKER_NOTE && params.originalInput.mode === 'kids') { // Shaker for kids
                    drumSynth = synths.snare; // Using NoiseSynth for shaker approximation
                    if(drumSynth instanceof Tone.NoiseSynth) drumSynth.set({noise: {type: "white"}, envelope: {attack: 0.005, decay: 0.05, sustain:0, release: 0.05}});
                    effectiveDuration = 0.05;
                    drumType = 'shaker';
                } else if (value.midi === KID_INSTRUMENTS.TAMBOURINE_NOTE && params.originalInput.mode === 'kids') { // Tambourine for kids
                     drumSynth = synths.hiHat; // Using MetalSynth for tambourine
                     if(drumSynth instanceof Tone.MetalSynth) drumSynth.set({frequency: 800, harmonicity: 3.1, modulationIndex: 16, envelope: {attack:0.002, decay:0.1, release:0.1}});
                     effectiveDuration = 0.1;
                     drumType = 'tambourine';
                }
                
                if (drumSynth) {
                    console.log(`[WAV_GEN_OFFLINE_DRUM_PART] Time: ${time.toFixed(3)}, MIDI: ${value.midi} (${drumType}), Dur: ${effectiveDuration.toFixed(3)}, Vel: ${value.velocity.toFixed(3)}`);
                    if (drumSynth instanceof Tone.MembraneSynth) {
                        drumSynth.triggerAttackRelease(pitchToPlay as string, effectiveDuration, time, value.velocity);
                    } else if (drumSynth instanceof Tone.NoiseSynth) {
                        drumSynth.triggerAttackRelease(effectiveDuration, time, value.velocity);
                    } else if (drumSynth instanceof Tone.MetalSynth) {
                         if (pitchToPlay && typeof pitchToPlay === 'number' && drumSynth.frequency) {
                            drumSynth.frequency.setValueAtTime(pitchToPlay, time);
                         }
                         drumSynth.triggerAttackRelease(effectiveDuration, time, value.velocity);
                    }
                } else {
                    console.log(`[WAV_GEN_OFFLINE_DRUM_PART] No synth mapped for MIDI note ${value.midi} at time ${time.toFixed(3)}`);
                }
            }));
            
            const drumEvents: EventTime[] = track.notes.map(n => ({
                time: n.time, midi: n.midi, duration: n.duration, velocity: n.velocity,
            }));
            const correctedDrumEvents = ensureStrictlyIncreasingTimes(drumEvents, `Drum-Track-${trackIndex}`);
            
            correctedDrumEvents.forEach(event => {
                drumPart.add(event.time, event);
            });
            allParts.push(drumPart);
        }
      });
      
      console.log(`[WAV_GEN_OFFLINE] Total parts created: ${allParts.length}`);
      allParts.forEach((part, idx) => {
          part.start(0);
          console.log(`[WAV_GEN_OFFLINE] Part ${idx} started at time 0.`);
      });
      
      // Start the offline context's transport.
      // This is crucial for Tone.Part events to be processed.
      offlineContextTransport.start();
      console.log("[WAV_GEN_OFFLINE] Offline transport started. Rendering...");

    }, renderDuration);
    console.log("[WAV_GEN] Tone.Offline rendering complete. AudioBuffer channels:", audioBuffer.numberOfChannels, "length:", audioBuffer.length, "sampleRate:", audioBuffer.sampleRate);

    // Check if buffer is silent
    let isSilent = true;
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        const channelData = audioBuffer.getChannelData(i);
        for (let j = 0; j < channelData.length; j++) {
            if (channelData[j] !== 0) {
                isSilent = false;
                break;
            }
        }
        if (!isSilent) break;
    }
    if (isSilent) {
        console.warn("[WAV_GEN_WARN] Rendered AudioBuffer is silent. Check synth volumes, envelopes, and event scheduling.");
    } else {
        console.log("[WAV_GEN] Rendered AudioBuffer contains non-zero samples.");
    }


    const wavDataBuffer = audioBufferToWav(audioBuffer);
    console.log(`[WAV_GEN] WAV data buffer created. Size: ${wavDataBuffer.byteLength} bytes.`);
    return new Blob([wavDataBuffer], { type: 'audio/wav' });

  } catch (error) {
    console.error("[WAV_GEN_ERROR] Error generating WAV with Tone.js:", error);
    return null;
  }
};

const KID_INSTRUMENTS = { 
    XYLOPHONE: 13, TOY_PIANO: 8, 
    UKULELE: 24, RECORDER: 74,
    SIMPLE_SYNTH_LEAD: 80, 
    SIMPLE_SYNTH_PAD: 89,  
    ACOUSTIC_GUITAR_NYLON: 24, 
    BRIGHT_ACOUSTIC_PIANO: 0, 
    SHAKER_NOTE: 70, // GM Standard Percussion Shaker (MIDI Note for Channel 10)
    TAMBOURINE_NOTE: 54, // GM Standard Percussion Tambourine
    KIDS_KICK: 36, // GM Standard Bass Drum 1
    KIDS_SNARE: 38, // GM Standard Acoustic Snare
    LIGHT_CYMBAL: 49, // GM Standard Crash Cymbal 1
    CLOSED_HIHAT_KID: 42, // GM Standard Closed Hi-Hat
};