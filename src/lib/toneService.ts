
'use client';
import * as Tone from 'tone';
import { Midi as MidiFileParser } from '@tonejs/midi';
import type { MusicParameters } from '@/types';
import { generateMidiFile } from '@/lib/midiService'; // Assuming this generates a data URI
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


interface EventTime { time: number; duration: number; velocity: number; [key: string]: any; }


interface SynthConfigurations {
  melody: any;
  bass: any;
  chords: any;
  kick: any;
  snare: any;
  hiHat: any;
}

// Adapted from MusicOutputDisplay
const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genre: string = '',
  isKidsMode: boolean = false
): SynthConfigurations => {
  const hintsLower = instrumentHints.map(h => h.toLowerCase());
  const genreLower = genre.toLowerCase();

  let configs: SynthConfigurations = {
    melody: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.4 }, volume: -6 },
    bass: { oscillator: { type: 'fatsine', count: 2, spread: 10 }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.5 }, volume: -3 },
    chords: { oscillator: { type: 'amtriangle', harmonicity: 0.5 }, volume: -15, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 } },
    kick: { pitchDecay: 0.05, octaves: 10, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: 'exponential' }, volume: -3 },
    snare: { noise: { type: 'pink' }, volume: -10, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } },
    hiHat: { frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3000, octaves: 1.5, volume: -22 },
  };

  if (isKidsMode) {
    configs.melody = { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3 }, volume: -6 };
    configs.bass = { oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.4 }, volume: -3 };
    configs.chords = { oscillator: { type: 'triangle' }, volume: -18, envelope: { attack: 0.1, decay: 0.4, sustain: 0.5, release: 0.8 } };
    configs.kick.pitchDecay = 0.1;
    configs.snare.noise.type = 'white'; configs.snare.envelope.decay = 0.1;
    configs.hiHat.frequency = 300; configs.hiHat.envelope.decay = 0.03;
  } else {
    if (genreLower.includes('electronic') || genreLower.includes('pop')) {
      configs.melody.oscillator.type = 'pulse';
      configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = 0;
      configs.chords.oscillator.type = 'pwm'; configs.chords.oscillator.modulationFrequency = 0.5; configs.chords.volume = -12;
    } else if (genreLower.includes('ambient')) {
      configs.melody.envelope = { attack: 0.5, decay: 0.2, sustain: 0.8, release: 2.0 }; configs.melody.volume = -9;
      configs.bass.envelope = { attack: 0.6, decay: 0.3, sustain: 0.9, release: 2.5 }; configs.bass.volume = -6;
      configs.chords.oscillator.type = 'fatsine'; configs.chords.volume = -15;
      configs.chords.envelope = { attack: 1.0, decay: 0.5, sustain: 0.9, release: 3.0 };
    } else if (genreLower.includes('rock') || genreLower.includes('metal')) {
      configs.melody.oscillator.type = 'fatsawtooth'; configs.melody.volume = -3;
      configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = 0;
      configs.chords.oscillator.type = 'fatsawtooth'; configs.chords.volume = -12;
      configs.kick.octaves = 8; configs.kick.envelope.decay = 0.3;
      configs.snare.envelope.decay = 0.1; configs.snare.volume = -8;
    } else if (genreLower.includes('jazz')) {
      configs.melody = { oscillator: { type: 'fmsine', harmonicity: 1.5, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.2 }, volume: -6 };
      configs.bass = { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.3 }, volume: -3 };
      configs.chords = { oscillator: { type: 'fmtriangle', harmonicity: 2, modulationIndex: 3 }, volume: -18, envelope: { attack: 0.02, decay: 0.6, sustain: 0.3, release: 0.5 } };
    }

    hintsLower.forEach(hint => {
      if (hint.includes('piano') && !isKidsMode) {
        // Sampler will be used for piano, specific config in generateWav
      } else if (hint.includes('strings') || (hint.includes('pad') && !hint.includes('synth pad'))) {
        configs.melody = { oscillator: { type: 'fatsawtooth', count: 5, spread: 30 }, envelope: { attack: 0.3, decay: 0.1, sustain: 0.9, release: 1.2 }, volume: -9 };
        configs.chords = { oscillator: { type: 'fatsawtooth', count: 7, spread: 50 }, volume: -12, envelope: { attack: 0.5, decay: 0.2, sustain: 0.9, release: 1.5 } };
      } else if (hint.includes('synth lead') && !isKidsMode) {
        configs.melody = { oscillator: { type: 'pwm', modulationFrequency: 0.3 }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.6 }, volume: -3 };
      } else if (hint.includes('acoustic guitar') && !isKidsMode) {
         configs.melody = { oscillator: { type: 'fmtriangle', harmonicity: 1.2, modulationIndex: 12 }, envelope: { attack: 0.01, decay: 0.25, sustain: 0.01, release: 0.15}, volume: -7 };
         configs.chords = { oscillator: { type: 'fmtriangle', harmonicity: 1.5, modulationIndex: 10 }, volume: -13, envelope: { attack: 0.02, decay: 0.4, sustain: 0.05, release: 0.25} };
      } else if (hint.includes('flute')) {
        configs.melody = { oscillator: { type: 'triangle8' }, envelope: { attack: 0.06, decay: 0.15, sustain: 0.6, release: 0.35 }, volume: -8 };
      } else if (hint.includes('bell') || hint.includes('xylophone')) {
        configs.melody = { oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.5, sustain: 0.01, release: 0.3, attackCurve: 'exponential' }, volume: -6 };
      }
      if (hint.includes('synth bass')) configs.bass = { oscillator: {type: 'fatsquare', count: 3, spread: 15}, envelope: {attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3}, volume: 0};
      else if (hint.includes('acoustic bass') && !genreLower.includes('jazz')) configs.bass = { oscillator: {type: 'sine'}, envelope: {attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.3}, volume: -3};
      if (hint.includes('synth pad')) configs.chords = {oscillator: {type: 'fatsawtooth', count: 4, spread: 60}, volume: -15, envelope: {attack: 0.4, decay: 0.1, sustain: 0.9, release: 1.2}};
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
  try {
    await Tone.start();

    const midiDataUri = generateMidiFile(params);
    if (!midiDataUri || !midiDataUri.startsWith('data:audio/midi;base64,')) {
      console.error("Failed to generate valid MIDI data for Tone.js rendering.");
      return null;
    }

    const parsedMidi = await MidiFileParser.fromUrl(midiDataUri);
    const durationSeconds = parsedMidi.duration;

    if (durationSeconds <= 0) {
        console.warn("MIDI duration is zero or negative, cannot render meaningfully. Returning null.");
        return null;
    }

    const renderDuration = durationSeconds + 2.0; // Add 2 seconds for release tails

    const tempoToSet = (typeof params.tempoBpm === 'number' && params.tempoBpm > 30 && params.tempoBpm < 300)
                       ? params.tempoBpm
                       : 120;
    if (params.tempoBpm !== tempoToSet) {
      console.warn(`Original tempoBpm '${params.tempoBpm}' was invalid or out of range. Using ${tempoToSet} BPM for Tone.js rendering.`);
    }

    if (Tone && Tone.Transport && Tone.Transport.bpm) {
        Tone.Transport.bpm.value = tempoToSet;
    } else {
        console.warn("Global Tone.Transport.bpm is not available to set. Offline rendering might use default tempo.");
    }


    const audioBuffer = await Tone.Offline(async (offlineTransport) => {
      // 'offlineTransport' is the offline context's transport.
      // All Tone.js objects (synths, parts, etc.) must be created and scheduled within this callback,
      // or created outside and explicitly connected to the offline context's destination if needed.

      const synthConfigs = getSynthConfigurations(
        params.instrumentHints,
        params.selectedGenre,
        params.originalInput.mode === 'kids'
      );

      const synths: {
        melody?: Tone.PolySynth | Tone.Sampler,
        bass?: Tone.PolySynth,
        chords?: Tone.PolySynth,
        kick?: Tone.MembraneSynth,
        snare?: Tone.NoiseSynth,
        hiHat?: Tone.MetalSynth,
      } = {};

      const usePianoSampler = params.instrumentHints.some(h => h.toLowerCase().includes('piano')) && params.originalInput.mode !== 'kids';

      if (usePianoSampler) {
        synths.melody = new Tone.Sampler({
            urls: generatePianoSampleUrls(),
            baseUrl: "https://tonejs.github.io/audio/salamander/",
            release: 1,
        }).toDestination(); // Connects to the offline context's destination
        synths.melody.volume.value = -6;
        await synths.melody.loaded; // Ensure samples are loaded before proceeding
      } else {
        synths.melody = new Tone.PolySynth(Tone.Synth, synthConfigs.melody).toDestination();
      }

      synths.bass = new Tone.PolySynth(Tone.Synth, synthConfigs.bass).toDestination();
      synths.chords = new Tone.PolySynth(Tone.Synth, synthConfigs.chords).toDestination();
      synths.kick = new Tone.MembraneSynth(synthConfigs.kick).toDestination();
      synths.snare = new Tone.NoiseSynth(synthConfigs.snare).toDestination();
      synths.hiHat = new Tone.MetalSynth(synthConfigs.hiHat).toDestination();

      const allParts: (Tone.Part | Tone.Sequence)[] = [];

      parsedMidi.tracks.forEach((track, trackIndex) => {
        const instrumentMapping = mapInstrumentHintToGMOriginal(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids');

        if (track.channel === 9) { // Drum track
          const drumEvents: EventTime[] = track.notes.map(n => ({
            time: n.time,
            duration: n.duration,
            velocity: n.velocity,
            midi: n.midi
          }));

          const correctedDrumEvents = ensureStrictlyIncreasingTimes(drumEvents, `Drums-Track-${trackIndex}`);

          correctedDrumEvents.forEach(event => {
            let drumSynth: Tone.MembraneSynth | Tone.NoiseSynth | Tone.MetalSynth | undefined;
            let pitchToPlay: string | number | undefined = undefined;
            let effectiveDuration = Math.max(event.duration > 0 ? event.duration : 0.05, 0.05);

            if (event.midi === 35 || event.midi === 36) { drumSynth = synths.kick; pitchToPlay = "C1"; }
            else if (event.midi === 38 || event.midi === 40) { drumSynth = synths.snare; }
            else if (event.midi === 42 || event.midi === 44 || event.midi === 46) {
              drumSynth = synths.hiHat;
              pitchToPlay = event.midi === 46 ? 400 : 250;
            } else if (event.midi === 49 || event.midi === 57) { // Crash/Ride cymbals
                drumSynth = synths.hiHat;
                pitchToPlay = 600;
                effectiveDuration = 0.5 + Math.random() * 0.5;
                if(drumSynth instanceof Tone.MetalSynth) drumSynth.set({envelope: {decay: effectiveDuration, release: effectiveDuration}});
            }

            if (drumSynth) {
              // Schedule directly onto the offlineTransport
              offlineTransport.schedule((time) => {
                if (drumSynth instanceof Tone.MembraneSynth) {
                  drumSynth.triggerAttackRelease(pitchToPlay as string, effectiveDuration, time, event.velocity);
                } else if (drumSynth instanceof Tone.NoiseSynth) {
                  drumSynth.triggerAttackRelease(effectiveDuration, time, event.velocity);
                } else if (drumSynth instanceof Tone.MetalSynth) {
                   if (pitchToPlay && typeof pitchToPlay === 'number') drumSynth.frequency.setValueAtTime(pitchToPlay, time);
                   drumSynth.triggerAttackRelease(effectiveDuration, time, event.velocity);
                }
              }, event.time);
            }
          });

        } else { // Pitched tracks
          let activeSynth: Tone.PolySynth | Tone.Sampler | undefined;
          if (trackIndex === 0 || track.instrument.number === instrumentMapping.melody) activeSynth = synths.melody;
          else if (track.instrument.number === instrumentMapping.bass) activeSynth = synths.bass;
          else if (track.instrument.number === instrumentMapping.chordsPad) activeSynth = synths.chords;
          else activeSynth = synths.melody;

          if (activeSynth) {
            const trackEvents: EventTime[] = track.notes.map(n => ({
              time: n.time,
              name: n.name,
              duration: n.duration,
              velocity: n.velocity
            }));
            const correctedTrackEvents = ensureStrictlyIncreasingTimes(trackEvents, `Pitched-Track-${track.name || trackIndex}`);
            
            correctedTrackEvents.forEach(event => {
                if (event.name && typeof event.name === 'string' && activeSynth) {
                    const effectiveDuration = Math.max(event.duration, 0.05);
                    // Schedule directly onto the offlineTransport
                    offlineTransport.schedule((time) => {
                        activeSynth.triggerAttackRelease(event.name, effectiveDuration, time, event.velocity);
                    }, event.time);
                }
            });
          }
        }
      });
      // Parts are scheduled using offlineTransport.schedule, so no explicit part.start needed here.
      // The offline context handles starting its own transport.
    }, renderDuration);

    const wavDataBuffer = audioBufferToWav(audioBuffer);
    return new Blob([wavDataBuffer], { type: 'audio/wav' });

  } catch (error) {
    console.error("Error generating WAV with Tone.js:", error);
    return null;
  }
};
