
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

  // Increased default volumes
  let configs: SynthConfigurations = {
    melody: { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.4 }, volume: -6 },
    bass: { oscillator: { type: 'fatsine', count: 2, spread: 10 }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.5 }, volume: -3 },
    chords: { oscillator: { type: 'amtriangle', harmonicity: 0.5 }, volume: -10, envelope: { attack: 0.05, decay: 0.3, sustain: 0.7, release: 1.0 } }, // Was -15
    arpeggio: { oscillator: { type: 'fmsawtooth', harmonicity: 1.5, modulationIndex: 8 }, envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.2 }, volume: -9 }, // Was -10
    kick: { pitchDecay: 0.05, octaves: 10, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: 'exponential' }, volume: -3 },
    snare: { noise: { type: 'pink' }, volume: -8, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 } }, // Was -10
    hiHat: { frequency: 250, envelope: { attack: 0.001, decay: 0.05, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 3000, octaves: 1.5, volume: -15 }, // Was -22
  };

  if (isKidsMode) {
    configs.melody = { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3 }, volume: -6 };
    configs.bass = { oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.4 }, volume: -3 };
    configs.chords = { oscillator: { type: 'triangle' }, volume: -12, envelope: { attack: 0.1, decay: 0.4, sustain: 0.5, release: 0.8 } }; // Was -18
    configs.arpeggio = { oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.2 }, volume: -10 }; // Was -12
    configs.kick.pitchDecay = 0.1;
    configs.snare.noise.type = 'white'; configs.snare.envelope.decay = 0.1; configs.snare.volume = -7; // Ensuring kids snare is audible
    configs.hiHat.frequency = 300; configs.hiHat.envelope.decay = 0.03; configs.hiHat.volume = -14; // Ensuring kids hihat is audible
  } else {
    if (genreLower.includes('electronic') || genreLower.includes('pop')) {
      configs.melody.oscillator.type = 'pwm'; 
      configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = 0;
      configs.chords.oscillator.type = 'pwm'; configs.chords.oscillator.modulationFrequency = 0.5; configs.chords.volume = -10; // Was -12
      configs.arpeggio.oscillator.type = 'sawtooth'; configs.arpeggio.volume = -8; // Was -9
    } else if (genreLower.includes('ambient')) {
      configs.melody.envelope = { attack: 0.5, decay: 0.2, sustain: 0.8, release: 2.0 }; configs.melody.volume = -8; // Was -9
      configs.bass.envelope = { attack: 0.6, decay: 0.3, sustain: 0.9, release: 2.5 }; configs.bass.volume = -5; // Was -6
      configs.chords.oscillator.type = 'fatsine'; configs.chords.volume = -12; // Was -15
      configs.chords.envelope = { attack: 1.0, decay: 0.5, sustain: 0.9, release: 3.0 };
      configs.arpeggio.envelope = { attack: 0.8, decay: 0.3, sustain: 0.9, release: 2.2 }; configs.arpeggio.volume = -10; // Was -12
    } else if (genreLower.includes('rock') || genreLower.includes('metal')) {
      configs.melody.oscillator.type = 'fatsawtooth'; configs.melody.volume = -3;
      configs.bass.oscillator.type = 'fatsquare'; configs.bass.volume = 0;
      configs.chords.oscillator.type = 'fatsawtooth'; configs.chords.volume = -10; // Was -12
      configs.arpeggio.oscillator.type = 'sawtooth'; configs.arpeggio.volume = -8; // Was -9
      configs.kick.octaves = 8; configs.kick.envelope.decay = 0.3;
      configs.snare.envelope.decay = 0.1; configs.snare.volume = -7; // Was -8
    } else if (genreLower.includes('jazz')) {
      configs.melody = { oscillator: { type: 'fmsine', harmonicity: 1.5, modulationIndex: 5 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.2 }, volume: -6 };
      configs.bass = { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.3 }, volume: -3 };
      configs.chords = { oscillator: { type: 'fmtriangle', harmonicity: 2, modulationIndex: 3 }, volume: -15, envelope: { attack: 0.02, decay: 0.6, sustain: 0.3, release: 0.5 } }; // Was -18
      configs.arpeggio = { oscillator: { type: 'sine' }, volume: -10 }; // Was -11
    }

    hintsLower.forEach(hint => {
      if (hint.includes('piano') && !isKidsMode) {
        // Sampler will be used for piano, specific config in generateWav
      } else if (hint.includes('strings') || (hint.includes('pad') && !hint.includes('synth pad'))) {
        configs.melody = { oscillator: { type: 'fatsawtooth', count: 5, spread: 30 }, envelope: { attack: 0.3, decay: 0.1, sustain: 0.9, release: 1.2 }, volume: -8 }; // Was -9
        configs.chords = { oscillator: { type: 'fatsawtooth', count: 7, spread: 50 }, volume: -10, envelope: { attack: 0.5, decay: 0.2, sustain: 0.9, release: 1.5 } }; // Was -12
      } else if (hint.includes('synth lead') && !isKidsMode) {
        configs.melody = { oscillator: { type: 'pwm', modulationFrequency: 0.3 }, envelope: { attack: 0.03, decay: 0.2, sustain: 0.7, release: 0.6 }, volume: -3 };
      } else if (hint.includes('acoustic guitar') && !isKidsMode) {
         configs.melody = { oscillator: { type: 'fmtriangle', harmonicity: 1.2, modulationIndex: 12 }, envelope: { attack: 0.01, decay: 0.25, sustain: 0.01, release: 0.15}, volume: -7 };
         configs.chords = { oscillator: { type: 'fmtriangle', harmonicity: 1.5, modulationIndex: 10 }, volume: -12, envelope: { attack: 0.02, decay: 0.4, sustain: 0.05, release: 0.25} }; // Was -13
      } else if (hint.includes('flute')) {
        configs.melody = { oscillator: { type: 'triangle8' }, envelope: { attack: 0.06, decay: 0.15, sustain: 0.6, release: 0.35 }, volume: -8 };
      } else if (hint.includes('bell') || hint.includes('xylophone')) {
        configs.melody = { oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.5, sustain: 0.01, release: 0.3, attackCurve: 'exponential' }, volume: -6 };
        configs.arpeggio = { oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.1 }, volume: -8 }; // Was -9
      }
      if (hint.includes('synth bass')) configs.bass = { oscillator: {type: 'fatsquare', count: 3, spread: 15}, envelope: {attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3}, volume: 0};
      else if (hint.includes('acoustic bass') && !genreLower.includes('jazz')) configs.bass = { oscillator: {type: 'sine'}, envelope: {attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.3}, volume: -3};
      if (hint.includes('synth pad')) configs.chords = {oscillator: {type: 'fatsawtooth', count: 4, spread: 60}, volume: -12, envelope: {attack: 0.4, decay: 0.1, sustain: 0.9, release: 1.2}}; // Was -15
      if (hint.includes('arp') || hint.includes('arpeggio') || hint.includes('pluck') || hint.includes('sequence')) {
        configs.arpeggio.oscillator.type = 'pwm'; 
        configs.arpeggio.volume = -8; // Was -9
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

    const renderDuration = durationSeconds + 2.0; // Add some tail time

    const tempoToSet = (typeof params.tempoBpm === 'number' && params.tempoBpm > 30 && params.tempoBpm < 300)
                       ? params.tempoBpm
                       : 120;
    
    if (Tone && Tone.Transport && Tone.Transport.bpm) {
      Tone.Transport.bpm.value = tempoToSet;
    } else {
      console.warn("Global Tone.Transport.bpm is not available to set for WAV rendering. Using default tempo.");
    }


    const audioBuffer = await Tone.Offline(async (offlineTransportInternalDONTUSE) => {

      const synthConfigs = getSynthConfigurations(
        params.instrumentHints,
        params.selectedGenre,
        params.originalInput.mode === 'kids'
      );

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
      
      Object.values(synths).forEach(synth => {
        if (synth && typeof synth.toDestination === 'function') {
          synth.toDestination(); 
        }
      });
      if (synths.melody && usePianoSampler && typeof (synths.melody as Tone.Sampler).loaded === 'boolean') {
        await (synths.melody as Tone.Sampler).loaded;
      }

      const instrumentMapping = mapInstrumentHintToGMOriginal(params.instrumentHints, params.selectedGenre, params.originalInput.mode === 'kids', params.generatedIdea);

      parsedMidi.tracks.forEach((track, trackIndex) => {
        let activeSynthForPart: Tone.PolySynth | Tone.Sampler | undefined;
        let isDrumTrack = false;

        if (track.channel === 9) { 
          isDrumTrack = true;
        } else {
          if (track.instrument.number === instrumentMapping.melody || (trackIndex === 0 && !Object.values(instrumentMapping).includes(track.instrument.number))) activeSynthForPart = synths.melody;
          else if (track.instrument.number === instrumentMapping.bass) activeSynthForPart = synths.bass;
          else if (track.instrument.number === instrumentMapping.chordsPad) activeSynthForPart = synths.chords;
          else if (track.instrument.number === instrumentMapping.arpeggioSynth) activeSynthForPart = synths.arpeggio;
          else { 
            activeSynthForPart = synths.melody;
          }
        }

        if (!isDrumTrack && activeSynthForPart) {
            const part = new Tone.Part(((time, value) => {
                if (activeSynthForPart && typeof activeSynthForPart.triggerAttackRelease === 'function') {
                    const effectiveDuration = Math.max(value.duration, 0.01);
                    (activeSynthForPart as Tone.PolySynth | Tone.Sampler).triggerAttackRelease(value.note, effectiveDuration, time, value.velocity);
                }
            }));
            // part.toDestination(); // This was an error, synths are already connected

            const pitchedTrackEvents: EventTime[] = track.notes.map(n => ({
                time: n.time, note: n.name, duration: n.duration, velocity: n.velocity,
            }));
            const correctedPitchedEvents = ensureStrictlyIncreasingTimes(pitchedTrackEvents, `Pitched-Track-${track.name || trackIndex}`);
            correctedPitchedEvents.forEach(event => {
                if (event.note && typeof event.note === 'string') {
                    part.add(event.time, event);
                }
            });
            part.start(0);
        } else if (isDrumTrack) {
            const drumPart = new Tone.Part(((time, value) => {
                let drumSynth: Tone.MembraneSynth | Tone.NoiseSynth | Tone.MetalSynth | undefined;
                let pitchToPlay: string | number | undefined = undefined;
                let effectiveDuration = Math.max(value.duration > 0 ? value.duration : 0.05, 0.05);

                if (value.midi === 35 || value.midi === 36) { drumSynth = synths.kick; pitchToPlay = "C1"; }
                else if (value.midi === 38 || value.midi === 40) { drumSynth = synths.snare; }
                else if (value.midi === 42 || value.midi === 44 || value.midi === 46) {
                    drumSynth = synths.hiHat;
                    pitchToPlay = value.midi === 46 ? 400 : 250;
                } else if (value.midi === 49 || value.midi === 57) { 
                    drumSynth = synths.hiHat; pitchToPlay = 600; effectiveDuration = 0.5 + Math.random() * 0.5;
                    if(drumSynth instanceof Tone.MetalSynth) drumSynth.set({envelope: {decay: effectiveDuration, release: effectiveDuration}});
                }
                
                if (drumSynth) {
                    if (drumSynth instanceof Tone.MembraneSynth && pitchToPlay) {
                        drumSynth.triggerAttackRelease(pitchToPlay as string, effectiveDuration, time, value.velocity);
                    } else if (drumSynth instanceof Tone.NoiseSynth) {
                        drumSynth.triggerAttackRelease(effectiveDuration, time, value.velocity);
                    } else if (drumSynth instanceof Tone.MetalSynth) {
                        if (pitchToPlay && typeof pitchToPlay === 'number' && drumSynth.frequency) drumSynth.frequency.setValueAtTime(pitchToPlay, time);
                        drumSynth.triggerAttackRelease(effectiveDuration, time, value.velocity);
                    }
                }
            }));
            // drumPart.toDestination(); // This was an error, synths are already connected
            
            const drumEvents: EventTime[] = track.notes.map(n => ({
                time: n.time, midi: n.midi, duration: n.duration, velocity: n.velocity,
            }));
            const correctedDrumEvents = ensureStrictlyIncreasingTimes(drumEvents, `Drum-Track-${trackIndex}`);
            
            correctedDrumEvents.forEach(event => {
                drumPart.add(event.time, event);
            });
            drumPart.start(0);
        }
      });
    }, renderDuration);

    const wavDataBuffer = audioBufferToWav(audioBuffer);
    return new Blob([wavDataBuffer], { type: 'audio/wav' });

  } catch (error) {
    console.error("Error generating WAV with Tone.js:", error);
    return null;
  }
};

