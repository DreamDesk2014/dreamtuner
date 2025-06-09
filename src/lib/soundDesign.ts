
'use client';
import * as Tone from 'tone';
import type { FirebaseSampleInstrument, InstrumentOutput } from '@/types';
import { getFirebaseSampleInstrumentById } from './firestoreService';

// Constants
const SAFE_OSC_TYPE = 'triangle' as const;
const DEFAULT_FALLBACK_SYNTH_VOLUME = -12;
const DEFAULT_SAMPLER_ID_FOR_PIANO = "default_piano";
const DEFAULT_SAMPLER_ID_FOR_CASIO = "tonejs_casio_piano"; // Added for Casio

// --- Synth Configurations ---
export const getSynthConfigurations = (
  instrumentHints: string[] = [],
  genreInput?: string,
  isKidsMode: boolean = false,
  harmonicComplexity: number = 0.3,
  rhythmicDensity: number = 0.5,
): any => {
  const genreLower = typeof genreInput === 'string' ? genreInput.toLowerCase() : "";
  const hintsLower = instrumentHints.map(h => typeof h === 'string' ? h.toLowerCase() : "");

  const baseConfigs = {
    pianoMelody: {
        synthType: Tone.PolySynth, subType: Tone.FMSynth,
        options: { harmonicity: 2.8, modulationIndex: 10, detune: 0, oscillator: { type: "sine" as const, partials: [1, 0.25, 0.12] }, envelope: { attack: 0.015, decay: 0.8, sustain: 0.4, release: 1.2 }, modulation: { type: "triangle" as const }, modulationEnvelope: { attack: 0.025, decay: 0.2, sustain: 0.01, release: 0.4 } },
        volume: -9,
        effects: [{type: Tone.Chorus, options: {frequency: 0.9, delayTime: 3.5, depth: 0.06, feedback: 0.03, wet: 0.1}}],
        filterType: 'lowpass' as const, filterFrequency: 5000, filterRolloff: -12 as const,
        filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.01, release: 1.2, baseFrequency: 300, octaves: 3},
        instrumentHintName: "basePianoMelody"
    },
    synthLeadElectronic: {
        synthType: Tone.Synth,
        options: { oscillator: { type: "fatsawtooth" as const, count: 3, spread: 25 }, envelope: { attack: 0.04, decay: 1.5, sustain: 0.6, release: 1.0 } }, volume: -10,
        effects: [
            {type: Tone.FeedbackDelay, options: {delayTime: "8n.", feedback: 0.25, wet:0.2}},
            {type: Tone.Filter, options: {frequency: 3500, type: 'lowpass' as const, rolloff: -12 as const, Q: 0.8}},
            {type: Tone.LFO, options: {frequency: 5, min: -5, max: 5, amplitude:0.3}, targetParam: "detune", autostart: true}
        ],
        instrumentHintName: "baseSynthLeadElectronic"
    },
    rockGuitarLead: { synthType: Tone.Synth, options: { oscillator: { type: "fatsquare" as const, count: 2, spread: 15 }, envelope: { attack: 0.01, decay: 0.7, sustain: 0.4, release: 0.5 } }, volume: -11, effects: [{type: Tone.Distortion, options: {distortion: 0.4}}], instrumentHintName: "baseRockGuitarLead" },
    acousticGuitarLead: { synthType: Tone.PluckSynth, options: { attackNoise: 0.6, dampening: 3500, resonance: 0.68 }, volume: -15, effects: [{type: Tone.Chorus, options: {frequency: 0.6, delayTime: 4.2, depth: 0.04, wet: 0.15}}], instrumentHintName: "baseAcousticGuitarLead" },
    customPluckySynth: {
        synthType: Tone.Synth,
        options: {
            oscillator: { type: "triangle" as const },
            envelope: { attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.5 }
        },
        volume: -15,
        instrumentHintName: "customPlucky"
    },
    customFluteSynth: {
        synthType: Tone.AMSynth,
        options: {
            harmonicity: 1.5,
            oscillator: { type: "sine" as const },
            envelope: { attack: 0.05, decay: 0.5, sustain: 0.8, release: 1 },
            modulation: { type: "square" as const },
            modulationEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.0, release: 0.5 }
        },
        volume: -12,
        instrumentHintName: "customFlute"
    },
    electricPianoChords: {
        synthType: Tone.PolySynth, subType: Tone.FMSynth,
        options: { harmonicity: 2.2, modulationIndex: 7, envelope: { attack: 0.015, decay: 1.2, sustain: 0.4, release: 1.8 }, oscillator: {type: "sine" as const, partials: [1, 0.4, 0.08]} },
        volume: -18,
        effects: [{type: Tone.Chorus, options: {frequency: 1.1, delayTime: 3.0, depth: 0.25, wet: 0.15}}],
        filterType: 'lowpass' as const, filterFrequency: 4500, filterRolloff: -12 as const,
        filterEnvelope: { attack: 0.01, decay: 0.4, sustain: 0.01, release: 1.8, baseFrequency: 250, octaves: 3},
        instrumentHintName: "baseElectricPianoChords"
    },
    warmPadChords: {
        synthType: Tone.PolySynth, subType: Tone.AMSynth,
        options: { harmonicity: 0.7, modulationType: "sawtooth" as const, envelope: { attack: 1.5, decay: 2.0, sustain: 0.8, release: 3.5 } }, volume: -22,
        effects: [
            {type: Tone.LFO, options: {frequency: 0.2, min: 400, max: 1200}, targetParam:"filterFrequency", autostart:true },
            {type: Tone.Filter, options: {type: "lowpass" as const, frequency: 800, rolloff: -12 as const, Q: 0.7 }}
        ],
        instrumentHintName: "baseWarmPadChords"
    },
    stringEnsembleChords: {
        synthType: Tone.PolySynth, subType: Tone.Synth,
        options: { oscillator: {type: "fatsawtooth" as const, count: 5, spread: 40}, envelope: {attack: 0.8, decay: 2.0, sustain:0.8, release: 2.5}}, volume: -20,
        effects: [
             {type: Tone.LFO, options: {frequency: 0.25, min: 500, max: 1500}, targetParam:"filterFrequency", autostart:true },
             {type: Tone.Filter, options: {type: "lowpass" as const, frequency: 1000, rolloff: -12 as const, Q: 0.8 }}
        ],
        instrumentHintName: "baseStringEnsembleChords"
    },
    pluckArp: { synthType: Tone.PluckSynth, options: { attackNoise: 0.3, dampening: 4000, resonance: 0.75 }, volume: -20, instrumentHintName: "basePluckArp" },
    synthArpElectronic: { synthType: Tone.Synth, options: { oscillator: {type: "triangle" as const}, envelope: { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.25}}, volume: -22, instrumentHintName: "baseSynthArpElectronic" },
    defaultBass: { synthType: Tone.FMSynth, options: { harmonicity: 1.0, modulationIndex: 2.5, envelope: { attack: 0.015, decay: 0.2, sustain: 0.8, release: 0.6 }, oscillator: { type: "triangle" as const } }, volume: -9, instrumentHintName: "baseDefaultBass" },
    subBassElectronic: { synthType: Tone.Synth, options: { oscillator: { type: "sine" as const }, envelope: { attack: 0.02, decay: 0.5, sustain: 1, release: 0.8 } }, volume: -7, instrumentHintName: "baseSubBassElectronic" },
    rockBassPicked: { synthType: Tone.Synth, options: { oscillator: {type: "fatsquare" as const, count:2, spread:10}, envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5 }}, volume: -8, effects: [{type: Tone.Distortion, options: {distortion: 0.1}}], instrumentHintName: "baseRockBassPicked"},
    jazzUprightBass: { synthType: Tone.FMSynth, options: { harmonicity: 0.8, modulationIndex: 1.5, envelope: { attack: 0.03, decay: 0.7, sustain: 0.1, release: 0.9 }, oscillator:{type:"sine" as const, partials: [1, 0.1, 0.02]}}, volume: -10, instrumentHintName: "baseJazzUprightBass"},
    funkSlapBass: { synthType: Tone.Synth, options: { oscillator: {type: "sawtooth" as const}, envelope: {attack: 0.005, decay: 0.15, sustain: 0.01, release: 0.2}, filter: {type: "lowpass" as const, Q: 3, rolloff: -24 as const, frequency: 800}, filterEnvelope: {attack:0.005, decay:0.05, sustain:0, release:0.1, baseFrequency:200, octaves:2.5} }, volume: -8, instrumentHintName: "baseFunkSlapBass" },
    kidsToyPiano: { synthType: Tone.FMSynth, options: { harmonicity: 4.0, modulationIndex: 7, oscillator: {type: "triangle" as const}, envelope: {attack: 0.008, decay: 0.25, sustain: 0.4, release: 0.4}}, volume: -10, instrumentHintName: "kidsToyPiano"},
    kidsXylophone: { synthType: Tone.MetalSynth, options: { harmonicity: 2.0, modulationIndex: 1.0, octaves: 0.2, envelope: {attack:0.002, decay:0.3, release:0.5}}, volume: -13, instrumentHintName: "kidsXylophone"},
    kidsUkuleleBass: { synthType: Tone.PluckSynth, options: {attackNoise: 0.5, dampening: 1800, resonance: 0.55}, volume: -12, instrumentHintName: "kidsUkuleleBass"},
    kidsSimplePad: {
        synthType: Tone.PolySynth, subType: Tone.Synth,
        options: {oscillator: {type: "triangle" as const}, envelope: {attack: 0.3, decay:0.6, sustain:0.7, release:1.2}}, volume: -20,
        effects: [
             {type: Tone.LFO, options: {frequency: 0.15, min: 300, max: 900}, targetParam:"filterFrequency", autostart:true },
             {type: Tone.Filter, options: {type: "lowpass" as const, frequency: 600, rolloff: -12 as const, Q: 0.6 }}
        ],
        instrumentHintName: "kidsSimplePad"
    },
    kidsSimpleArp: { synthType: Tone.Synth, options: {oscillator: {type: "square" as const }, envelope: {attack:0.015, decay:0.12, sustain:0.15, release:0.22}}, volume: -22, instrumentHintName: "kidsSimpleArp"},
    kick: { pitchDecay: 0.035, octaves: 4.5, oscillator: { type: "sine" as const }, envelope: { attack: 0.0015, decay: 0.25, sustain: 0.002, release: 0.9, attackCurve: "exponential" as const }, volume: -5, instrumentHintName: "baseKick" },
    kickElectronic: { pitchDecay: 0.045, octaves: 5.5, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.35, sustain: 0.005, release: 1.1 }, volume: -3, instrumentHintName: "baseKickElectronic" },
    kickRock: { pitchDecay: 0.02, octaves: 4, envelope: { attack: 0.0025, decay: 0.18, sustain: 0.001, release: 0.7 }, volume: -4, instrumentHintName: "baseKickRock" },
    snare: { noise: { type: 'pink' as const, playbackRate: 0.7 }, volume: -12, envelope: { attack: 0.0015, decay: 0.07, sustain: 0, release: 0.1 }, instrumentHintName: "baseSnare" },
    snareElectronic: { noise: { type: 'white' as const, playbackRate: 0.9 }, volume: -10, envelope: { attack: 0.0025, decay: 0.09, sustain: 0.005, release: 0.13 }, instrumentHintName: "baseSnareElectronic" },
    hiHat: { frequency: 400, envelope: { attack: 0.001, decay: 0.04, release: 0.04 }, harmonicity: 2.8, modulationIndex: 9, resonance: 2500, octaves: 1.1, volume: -18, instrumentHintName: "baseHiHat" },
    hiHatElectronic: { frequency: 480, envelope: { attack: 0.001, decay: 0.02, release: 0.025 }, harmonicity: 2.2, modulationIndex: 7, resonance: 2800, octaves: 0.9, volume: -16, instrumentHintName: "baseHiHatElectronic" },
    rideCymbal: { frequency: 300, envelope: { attack: 0.01, decay: 1.5, sustain: 0, release: 2.0 }, harmonicity: 4, modulationIndex:15, resonance: 5000, octaves: 2.5, volume: -20, instrumentHintName: "baseRideCymbal"},
    kidsKick: { pitchDecay: 0.03, octaves: 3.5, envelope: { attack: 0.0025, decay: 0.12, sustain: 0.005, release: 0.4 }, volume: -7, instrumentHintName: "kidsKick" },
    kidsSnare: { noise: { type: 'white' as const }, volume: -15, envelope: { attack: 0.0015, decay: 0.04, sustain: 0, release: 0.07 }, instrumentHintName: "kidsSnare" },
    kidsHiHat: { frequency: 420, envelope: { attack: 0.001, decay: 0.015, release: 0.015 }, harmonicity: 2.2, octaves: 0.8, volume: -22, instrumentHintName: "kidsHiHat" },
    tambourine: { noise: {type: 'white' as const, playbackRate: 1.6}, envelope: {attack:0.006, decay:0.06, sustain:0, release:0.07}, volume: -17, instrumentHintName: "baseTambourine"},
  };

  let melodyConf: any = { ...baseConfigs.pianoMelody, instrumentHintName: "defaultMelodyPiano" };
  let bassConf: any = { ...baseConfigs.defaultBass, instrumentHintName: "defaultBass" };
  let chordsConf: any = { ...baseConfigs.warmPadChords, instrumentHintName: "defaultChordsPad" };
  let arpConf: any = { ...baseConfigs.pluckArp, instrumentHintName: "defaultArpPluck" };
  let kickConf: any = { ...baseConfigs.kick, instrumentHintName: "defaultKick" };
  let snareConf: any = { ...baseConfigs.snare, instrumentHintName: "defaultSnare" };
  let hiHatConf: any = { ...baseConfigs.hiHat, instrumentHintName: "defaultHiHat" };
  let useTambourine = false;
  let useRideCymbal = false;


  // --- START OF MODIFIED/NEW LOGIC FOR SAMPLER HINTING ---
  const explicitSamplerHint = hintsLower.find(h => h.startsWith("use_sampled_"));

  if (explicitSamplerHint) {
    const samplerId = explicitSamplerHint.substring("use_sampled_".length);
    // If an explicit sampler is hinted, assume it's for the melody primarily,
    // but allow it to be used for chords/arp if they aren't strongly hinted otherwise.
    melodyConf = { isSampler: true, samplerName: samplerId, volume: -8, instrumentHintName: `sampler_melody_${samplerId}` };
    if (!chordsConf.isSampler && !hintsLower.some(h => /pad|string ensemble|synth lead|electric piano|organ/i.test(h))) {
        chordsConf = { isSampler: true, samplerName: samplerId, volume: -14, instrumentHintName: `sampler_chords_${samplerId}` };
    }
    if (!arpConf.isSampler && !hintsLower.some(h => /pluck|synth arp|bell|celesta|flute/i.test(h))) {
        arpConf = { isSampler: true, samplerName: samplerId, volume: -16, instrumentHintName: `sampler_arp_${samplerId}` };
    }
  } else if (hintsLower.some(h => h.includes('piano')) && !isKidsMode && !hintsLower.some(h => /electric piano|toy piano/i.test(h))) {
      // If "piano" (and not other piano types), and no explicit sampler was set, use default piano sampler.
      melodyConf = { isSampler: true, samplerName: DEFAULT_SAMPLER_ID_FOR_PIANO, volume: -8, instrumentHintName: `sampler_piano_melody_${DEFAULT_SAMPLER_ID_FOR_PIANO}` };
      if (!chordsConf.isSampler && !hintsLower.some(h => /pad|string ensemble|synth lead|organ/i.test(h))) {
          chordsConf = { isSampler: true, samplerName: DEFAULT_SAMPLER_ID_FOR_PIANO, volume: -14, instrumentHintName: `sampler_piano_chords_${DEFAULT_SAMPLER_ID_FOR_PIANO}` };
      }
      if (!arpConf.isSampler && !hintsLower.some(h => /pluck|synth arp|bell|celesta|flute/i.test(h))) {
          arpConf = { isSampler: true, samplerName: DEFAULT_SAMPLER_ID_FOR_PIANO, volume: -16, instrumentHintName: `sampler_piano_arp_${DEFAULT_SAMPLER_ID_FOR_PIANO}` };
      }
  } else if (hintsLower.some(h => h.includes('casio') || (h.includes('keyboard') && !hintsLower.some(h => /synth lead|synth pad|organ|piano|electric piano/i.test(h)))) && !isKidsMode) {
      // If "casio" or a generic "keyboard" (and not other specific keyboard types or already a sampler), use casio sampler.
      melodyConf = { isSampler: true, samplerName: DEFAULT_SAMPLER_ID_FOR_CASIO, volume: -9, instrumentHintName: `sampler_casio_melody_${DEFAULT_SAMPLER_ID_FOR_CASIO}` };
      if (!chordsConf.isSampler && !hintsLower.some(h => /pad|string ensemble|synth lead|organ/i.test(h))) {
        chordsConf = { isSampler: true, samplerName: DEFAULT_SAMPLER_ID_FOR_CASIO, volume: -15, instrumentHintName: `sampler_casio_chords_${DEFAULT_SAMPLER_ID_FOR_CASIO}` };
      }
      if (!arpConf.isSampler && !hintsLower.some(h => /pluck|synth arp|bell|celesta|flute/i.test(h))) {
        arpConf = { isSampler: true, samplerName: DEFAULT_SAMPLER_ID_FOR_CASIO, volume: -17, instrumentHintName: `sampler_casio_arp_${DEFAULT_SAMPLER_ID_FOR_CASIO}` };
      }
  }
  // --- END OF MODIFIED/NEW LOGIC FOR SAMPLER HINTING ---


  if (isKidsMode) {
    if (!melodyConf.isSampler) { // Only apply kids synth if no sampler was set for melody
        const kidMelodyRandom = Math.random();
        if (kidMelodyRandom < 0.4) melodyConf = {...baseConfigs.kidsToyPiano};
        else if (kidMelodyRandom < 0.8) melodyConf = {...baseConfigs.kidsXylophone};
        else melodyConf = {...baseConfigs.customPluckySynth, volume: -12, instrumentHintName: "kidsCustomPlucky"};
    }
    bassConf = {...baseConfigs.kidsUkuleleBass};
    if (!chordsConf.isSampler) chordsConf = {...baseConfigs.kidsSimplePad}; // Only apply kids synth if no sampler
    if (!arpConf.isSampler) arpConf = {...baseConfigs.kidsSimpleArp}; // Only apply kids synth if no sampler
    kickConf = {...baseConfigs.kidsKick};
    snareConf = {...baseConfigs.kidsSnare};
    hiHatConf = {...baseConfigs.kidsHiHat};
    if (hintsLower.some(h => h.includes("tambourine") || h.includes("shaker"))) useTambourine = true;

  } else if (!melodyConf.isSampler) { // Apply genre/hint based synth changes ONLY if melody is NOT already a sampler by explicit or generic hint
    if (genreLower.includes("electronic") || genreLower.includes("synthwave") || genreLower.includes("techno") || genreLower.includes("house")) {
      melodyConf = { ...baseConfigs.synthLeadElectronic };
      bassConf = { ...baseConfigs.subBassElectronic };
      if (!chordsConf.isSampler) chordsConf = { ...baseConfigs.warmPadChords, volume: -20, instrumentHintName: "electronicWarmPadChords" };
      if (!arpConf.isSampler) arpConf = { ...baseConfigs.synthArpElectronic };
      kickConf = { ...baseConfigs.kickElectronic };
      snareConf = { ...baseConfigs.snareElectronic };
      hiHatConf = { ...baseConfigs.hiHatElectronic };
    } else if (genreLower.includes("rock") || genreLower.includes("metal") || genreLower.includes("punk")) {
      melodyConf = { ...baseConfigs.rockGuitarLead };
      bassConf = { ...baseConfigs.rockBassPicked };
      if (!chordsConf.isSampler) chordsConf = { ...baseConfigs.rockGuitarLead, synthType: Tone.PolySynth, subType: Tone.Synth, options: {...baseConfigs.rockGuitarLead.options, envelope: {...baseConfigs.rockGuitarLead.options.envelope, attack:0.005, decay:0.5, sustain:0.01, release:0.3}}, volume: -16, instrumentHintName: "rockGuitarChords" };
      if (!arpConf.isSampler) arpConf = { ...baseConfigs.defaultBass, volume: -28, instrumentHintName: "rockArpBass" };
      kickConf = { ...baseConfigs.kickRock, volume: -5 };
    } else if (genreLower.includes("jazz") || genreLower.includes("swing") || (genreLower.includes("blues") && rhythmicDensity > 0.3)) {
      // If melody isn't a sampler (like default_piano), use a synth piano for jazz
      if(!melodyConf.isSampler) melodyConf = { ...baseConfigs.pianoMelody, volume: -10, instrumentHintName: "jazzPianoMelodyIfNotSampler" };
      bassConf = { ...baseConfigs.jazzUprightBass };
      if (!chordsConf.isSampler) chordsConf = { ...baseConfigs.electricPianoChords, volume: -16, instrumentHintName: "jazzElectricPianoChords" };
      if (!arpConf.isSampler) arpConf = { ...baseConfigs.customPluckySynth, volume: -24, instrumentHintName: "jazzPluckArp" };
      kickConf = { ...baseConfigs.kick, volume: -10, envelope: {...baseConfigs.kick.envelope, decay:0.15, sustain:0.001}, instrumentHintName: "jazzKick" };
      snareConf = { ...baseConfigs.snare, volume: -16, noise: {type: 'pink' as const, playbackRate: 0.5}, instrumentHintName: "jazzSnare" };
      hiHatConf = { ...baseConfigs.rideCymbal, volume: -20, instrumentHintName: "jazzRideCymbal" };
      useRideCymbal = true;
    } else if (genreLower.includes("ambient") || genreLower.includes("new age")) {
        melodyConf = { ...baseConfigs.warmPadChords, synthType: Tone.PolySynth, subType: Tone.AMSynth, volume: -16, instrumentHintName: "ambientMelodyPad" };
        bassConf = { ...baseConfigs.subBassElectronic, volume: -14, options: {...baseConfigs.subBassElectronic.options, envelope: {...baseConfigs.subBassElectronic.options.envelope, attack:0.5, release:1.5}}, instrumentHintName: "ambientSubBass" };
        if (!chordsConf.isSampler) chordsConf = { ...baseConfigs.warmPadChords, volume: -18, instrumentHintName: "ambientChordsPad" };
        if (!arpConf.isSampler) arpConf = { ...baseConfigs.customPluckySynth, volume: -22, options: {...baseConfigs.customPluckySynth.options, envelope: {...baseConfigs.customPluckySynth.options.envelope, release: 1.0 } }, instrumentHintName: "ambientPluckArp"};
        kickConf = { ...baseConfigs.kick, volume: -15, envelope: {...baseConfigs.kick.envelope, decay: 0.5, sustain:0.05}, instrumentHintName: "ambientKick" };
        snareConf = { ...baseConfigs.snare, volume: -25, instrumentHintName: "ambientSnare" };
        hiHatConf = { ...baseConfigs.hiHat, volume: -28, instrumentHintName: "ambientHiHat" };
    } else if (genreLower.includes("folk") || genreLower.includes("country") || genreLower.includes("acoustic")) {
        melodyConf = { ...baseConfigs.acousticGuitarLead, instrumentHintName: "acousticGuitarMelody" };
        bassConf = { ...baseConfigs.jazzUprightBass, volume: -12, instrumentHintName: "acousticBass"};
        if (!chordsConf.isSampler) chordsConf = { synthType: Tone.PolySynth, subType: Tone.PluckSynth, options: {...baseConfigs.acousticGuitarLead.options}, volume: -16, instrumentHintName: "acousticGuitarChords" };
        if (!arpConf.isSampler) arpConf = {...baseConfigs.acousticGuitarLead, volume: -18, instrumentHintName: "acousticGuitarArp"};
        if (hintsLower.some(h => h.includes("tambourine"))) useTambourine = true;
    } else if (genreLower.includes("funk") || genreLower.includes("soul") || genreLower.includes("disco")) {
        melodyConf = { ...baseConfigs.electricPianoChords, synthType: Tone.PolySynth, subType: Tone.FMSynth, volume: -11, instrumentHintName: "funkElectricPianoMelody"};
        bassConf = { ...baseConfigs.funkSlapBass};
        if (!chordsConf.isSampler) chordsConf = { ...baseConfigs.electricPianoChords, volume: -15, instrumentHintName: "funkElectricPianoChords"};
        if (!arpConf.isSampler) arpConf = { ...baseConfigs.customPluckySynth, volume: -20, instrumentHintName: "funkPluckArp"};
        kickConf = { ...baseConfigs.kick, volume: -4, instrumentHintName: "funkKick" };
        snareConf = { ...baseConfigs.snare, volume: -10, instrumentHintName: "funkSnare" };
        hiHatConf = { ...baseConfigs.hiHat, volume: -17, instrumentHintName: "funkHiHat" };
    } else if (genreLower.includes("classical") || genreLower.includes("cinematic") || genreLower.includes("orchestral")) {
        if(!melodyConf.isSampler) melodyConf = { ...baseConfigs.pianoMelody, volume: -8, instrumentHintName: "classicalPianoMelodyIfNotSampler" };
        bassConf = { ...baseConfigs.defaultBass, options: {...baseConfigs.defaultBass.options, oscillator:{type:"sine" as const}}, volume: -14, instrumentHintName: "classicalBass" };
        if (!chordsConf.isSampler) chordsConf = { ...baseConfigs.stringEnsembleChords, instrumentHintName: "classicalStringChords" };
        if (!arpConf.isSampler) arpConf = { ...baseConfigs.customPluckySynth, volume: -20, instrumentHintName: "classicalPluckArp" };
        hiHatConf = {...baseConfigs.hiHat, volume: -25, instrumentHintName: "classicalHiHat"};
    }
  }

  // Apply specific instrument hints AFTER genre defaults and sampler priority
  hintsLower.forEach(hint => {
    // Melody hints (only if not already a sampler)
    if (!melodyConf.isSampler) {
      if (hint.includes('electric piano') || hint.includes('rhodes')) {
        melodyConf = { ...baseConfigs.electricPianoChords, synthType: Tone.PolySynth, subType: Tone.FMSynth, options: {...baseConfigs.electricPianoChords.options}, volume: -11, instrumentHintName: "hintElectricPianoMelody"};
      } else if (hint.includes('flute') || hint.includes('recorder')) {
        melodyConf = {...baseConfigs.customFluteSynth, instrumentHintName: "hintFluteSound"};
      } else if ((hint.includes('pluck') || hint.includes('bell-like') || hint.includes('kalimba')) && !(hint.includes('piano') || hint.includes('bell') || hint.includes('celesta') || hint.includes('glockenspiel') || hint.includes('music box'))) {
        melodyConf = { ...baseConfigs.customPluckySynth, instrumentHintName: "hintPluckyMelody" };
      } else if (hint.includes('synth lead') || hint.includes('bright synth') || hint.includes('lead synth')) {
        melodyConf = { ...baseConfigs.synthLeadElectronic, instrumentHintName: "hintSynthLeadElectronic" };
      } else if (hint.includes('guitar') && (hint.includes('acoustic') || hint.includes('folk'))) {
        melodyConf = {...baseConfigs.acousticGuitarLead, instrumentHintName: "hintAcousticGuitarLead"};
      } else if (hint.includes('guitar') && (hint.includes('rock') || hint.includes('electric') || hint.includes('distort'))) {
        melodyConf = {...baseConfigs.rockGuitarLead, instrumentHintName: "hintRockGuitarLead"};
      }
    }

    // Chord hints (only if not already a sampler)
    if (!chordsConf.isSampler) {
      if (hint.includes('pad') || hint.includes('warm pad') || hint.includes('synth pad')) {
        chordsConf = { ...baseConfigs.warmPadChords, instrumentHintName: "hintWarmPadChords" };
      } else if (hint.includes('strings') || hint.includes('orchestra') || hint.includes('ensemble')) {
        chordsConf = {...baseConfigs.stringEnsembleChords, instrumentHintName: "hintStringChords"};
      } else if (hint.includes('electric piano') || hint.includes('rhodes')) {
         chordsConf = { ...baseConfigs.electricPianoChords, volume: -18, instrumentHintName: "hintElectricPianoChords" };
      } else if (hint.includes('guitar') && (hint.includes('acoustic') || hint.includes('folk'))) {
        chordsConf = {synthType: Tone.PolySynth, subType: Tone.PluckSynth, options: {...baseConfigs.acousticGuitarLead.options}, volume: -16, instrumentHintName: "hintAcousticGuitarChords"};
      } else if (hint.includes('guitar') && (hint.includes('rock') || hint.includes('electric') || hint.includes('distort'))) {
        chordsConf = {...baseConfigs.rockGuitarLead, synthType: Tone.PolySynth, subType: Tone.Synth, options: {...baseConfigs.rockGuitarLead.options, envelope: {...baseConfigs.rockGuitarLead.options.envelope, attack:0.005, decay:0.5, sustain:0.01, release:0.3}}, volume: -16, instrumentHintName: "hintRockGuitarChords"};
      }
    }

    // Arpeggio hints (only if not already a sampler)
    if (!arpConf.isSampler) {
      if (hint.includes('arp') || hint.includes('sequence') || hint.includes('arpeggio')) {
        if (hint.includes('pluck') || hint.includes('bell-like')) {
          arpConf = { ...baseConfigs.customPluckySynth, volume: (baseConfigs.customPluckySynth.volume || -15) -3, instrumentHintName: "hintPluckyArpFromArpHint" };
        } else if (!melodyConf.isSampler && (melodyConf.instrumentHintName?.includes('SynthLead') || melodyConf.instrumentHintName?.includes('Electronic'))) {
          arpConf = { ...baseConfigs.synthArpElectronic, instrumentHintName: "hintSynthArpFromArpHint" };
        } else {
          arpConf = { ...baseConfigs.synthArpElectronic, instrumentHintName: "defaultSynthArpFromArpHint" };
        }
      } else if (hint.includes('flute') || hint.includes('recorder')){
         arpConf = {...baseConfigs.customFluteSynth, volume: (baseConfigs.customFluteSynth.volume || -12) - 4, instrumentHintName: "hintFluteArp"};
      } else if (hint.includes('guitar') && (hint.includes('acoustic') || hint.includes('folk'))) {
         arpConf = {...baseConfigs.acousticGuitarLead, volume: -18, instrumentHintName: "hintAcousticGuitarArp"};
      }
    }

    // Bass hints (always synth for now)
    if (hint.includes('sub bass') || (hint.includes("bass") && genreLower.includes("electronic"))) {
      bassConf = {...baseConfigs.subBassElectronic, instrumentHintName: "hintSubBassElectronic"};
    } else if (hint.includes('upright bass') || (hint.includes("bass") && genreLower.includes("jazz"))) {
      bassConf = {...baseConfigs.jazzUprightBass, instrumentHintName: "hintJazzUprightBass"};
    } else if (hint.includes('picked bass') || (hint.includes("bass") && (genreLower.includes("rock") || genreLower.includes("metal")))) {
      bassConf = {...baseConfigs.rockBassPicked, instrumentHintName: "hintRockBassPicked"};
    } else if (hint.includes('slap bass') || (hint.includes("bass") && (genreLower.includes("funk") || genreLower.includes("soul")))) {
      bassConf = {...baseConfigs.funkSlapBass, instrumentHintName: "hintFunkSlapBass"};
    }
  });


  return {
    melody: melodyConf, bass: bassConf, chords: chordsConf, arpeggio: arpConf,
    kick: kickConf, snare: snareConf, hiHat: useRideCymbal ? {...baseConfigs.rideCymbal, instrumentHintName: "rideCymbalFinal"} : hiHatConf,
    tambourine: useTambourine ? {...baseConfigs.tambourine, instrumentHintName: "tambourineFinal"} : null,
  };
};


export const createSynth = async (
    config: any,
    audioContext?: Tone.BaseContext,
    instrumentHintName?: string
): Promise<InstrumentOutput> => {
    const currentContext = audioContext || Tone.getContext();
    const logPrefix = currentContext.name === "Offline" ? "[soundDesign_Offline]" : "[soundDesign_Global]";
    let urlsForSampler: { [note: string]: string } | undefined;


    if (config && config.isSampler && config.samplerName) {
        const samplerId = config.samplerName;
        console.log(`${logPrefix} Attempting to load Sampler ID: ${samplerId} for ${instrumentHintName || 'track'} in context: ${currentContext.name}`);
        try {
            const sampleInstrumentData: FirebaseSampleInstrument | null = await getFirebaseSampleInstrumentById(samplerId);

            if (!sampleInstrumentData) {
                console.warn(`${logPrefix} Firestore document for Sampler ID: "${samplerId}" not found or isEnabled is false. Falling back to default synth for ${instrumentHintName}.`);
                throw new Error(`Sampler document not found or not enabled for ${samplerId}`);
            }

            if (typeof sampleInstrumentData.samples === 'string' && sampleInstrumentData.samples.trim() !== '') {
                urlsForSampler = { [sampleInstrumentData.pitch || "C4"]: sampleInstrumentData.samples };
            } else if (typeof sampleInstrumentData.samples === 'object' && Object.keys(sampleInstrumentData.samples).length > 0) {
                urlsForSampler = sampleInstrumentData.samples as { [note: string]: string };
            }

            if (!urlsForSampler) {
                console.warn(`${logPrefix} 'samples' field is missing, empty, or invalid in Firestore document for Sampler ID: "${samplerId}". Falling back to default synth for ${instrumentHintName}. Samples data:`, sampleInstrumentData.samples);
                throw new Error(`'samples' field invalid for sampler ${samplerId}`);
            }

            const samplerOptions: Partial<Tone.SamplerOptions> = {
                urls: urlsForSampler,
                baseUrl: sampleInstrumentData.baseUrl || "",
                attack: sampleInstrumentData.attack !== undefined ? sampleInstrumentData.attack : config.options?.envelope?.attack,
                release: sampleInstrumentData.release !== undefined ? sampleInstrumentData.release : config.options?.envelope?.release,
                context: currentContext,
            };

            const sampler = new Tone.Sampler(samplerOptions);
            sampler.volume.value = sampleInstrumentData.volume !== undefined ? sampleInstrumentData.volume : (config.volume !== undefined ? config.volume : DEFAULT_FALLBACK_SYNTH_VOLUME);

            await sampler.loaded;
            console.log(`${logPrefix} Sampler ${samplerId} loaded successfully for ${instrumentHintName}. Available notes: ${Object.keys(urlsForSampler || {}).join(', ')}`);
            return {
                instrument: sampler,
                outputNodeToConnect: sampler,
                availableNotes: Object.keys(urlsForSampler)
            };

        } catch (error) {
            console.error(`${logPrefix} Error loading or creating sampler ${samplerId} for ${instrumentHintName}:`, error);
            console.warn(`${logPrefix} Falling back to default FMSynth for ${instrumentHintName || 'sampler track'}.`);
            const fallbackOptions = { oscillator: { type: SAFE_OSC_TYPE as any }, context: currentContext };
            const fallbackInstrument = new Tone.FMSynth(fallbackOptions);
            fallbackInstrument.volume.value = config.volume !== undefined ? config.volume : DEFAULT_FALLBACK_SYNTH_VOLUME;
            return { instrument: fallbackInstrument, outputNodeToConnect: fallbackInstrument, availableNotes: undefined };
        }
    }

    if (!config || !config.synthType) {
        console.warn(`${logPrefix} Invalid or missing synth config for ${instrumentHintName}. Using default FMSynth.`);
        const defaultOptions = { oscillator: { type: SAFE_OSC_TYPE as any }, context: currentContext };
        const instrument = new Tone.FMSynth(defaultOptions);
        instrument.volume.value = DEFAULT_FALLBACK_SYNTH_VOLUME;
        return { instrument, outputNodeToConnect: instrument, availableNotes: undefined };
    }

    let instrument: Tone.Instrument;
    const synthOptionsWithContext = { ...(config.options || {}), context: currentContext };

    if (config.synthType === Tone.PolySynth) {
        const polyOptions: Partial<Tone.PolySynthOptions<Tone.Synth<Tone.SynthOptions>>> = {
            ...(synthOptionsWithContext as Partial<Tone.PolySynthOptions<Tone.Synth<Tone.SynthOptions>>>),
        };
        const subSynthConstructor = config.subType && typeof config.subType === 'function' && Tone[config.subType.name as keyof typeof Tone]
            ? config.subType as typeof Tone.Synth
            : Tone.Synth;
        instrument = new Tone.PolySynth({ synth: subSynthConstructor, options: polyOptions.options, context: currentContext });
        // Apply top-level options like envelope directly if not part of polyOptions.options
        if(polyOptions.envelope) instrument.set({envelope: polyOptions.envelope});

    } else if (typeof config.synthType === 'function' && Tone[config.synthType.name as keyof typeof Tone]) {
         const SynthConstructor = config.synthType as any;
         instrument = new SynthConstructor(synthOptionsWithContext);
    } else {
        console.warn(`${logPrefix} Invalid synthType constructor for ${instrumentHintName}: ${config.synthType?.name}. Using default FMSynth.`);
        instrument = new Tone.FMSynth({ oscillator: { type: SAFE_OSC_TYPE as any }, context: currentContext });
    }

    instrument.volume.value = config.volume !== undefined ? config.volume : DEFAULT_FALLBACK_SYNTH_VOLUME;

    let currentOutputNode: Tone.ToneAudioNode = instrument;
    let filterEnv: Tone.FrequencyEnvelope | undefined;
    let mainFilterForLFO: Tone.Filter | undefined;


    if (config.filterType || (config.effects && config.effects.some((eff: any) => eff.targetParam === "filterFrequency" || eff.type === Tone.Filter))) {
        mainFilterForLFO = new Tone.Filter({
            frequency: config.filterFrequency || 5000,
            type: config.filterType || 'lowpass',
            rolloff: config.filterRolloff || -12,
            Q: config.filterQ || 1,
            context: currentContext,
        });
        if (config.filterEnvelope) {
            filterEnv = new Tone.FrequencyEnvelope({...config.filterEnvelope, context: currentContext});
            filterEnv.connect(mainFilterForLFO.frequency);
        }
        currentOutputNode.connect(mainFilterForLFO);
        currentOutputNode = mainFilterForLFO;
    }


    if (config.effects && Array.isArray(config.effects) && config.effects.length > 0) {
        for (const effectConf of config.effects) {
            let effectNodeInstance: Tone.ToneAudioNode | undefined;
            const effectOptionsWithContext = { ...(effectConf.options || {}), context: currentContext };

            if (effectConf.type && typeof effectConf.type === 'function' && Tone[effectConf.type.name as keyof typeof Tone]) {
                 const EffectConstructor = effectConf.type as any;
                 if (EffectConstructor === Tone.LFO) {
                    const lfo = new Tone.LFO(effectOptionsWithContext);
                    const targetableNode = mainFilterForLFO || instrument;

                    if (effectConf.targetParam && typeof effectConf.targetParam === 'string' && effectConf.targetParam in targetableNode) {
                        const paramToModulate = (targetableNode as any)[effectConf.targetParam];
                        if (paramToModulate instanceof Tone.Signal || paramToModulate instanceof Tone.Param ) {
                           lfo.connect(paramToModulate as Tone.Signal<any>);
                        } else {
                            console.warn(`${logPrefix} LFO targetParam '${effectConf.targetParam}' on ${instrumentHintName} is not a Signal or Param. Actual type: ${typeof paramToModulate}`);
                        }
                    } else if (effectConf.targetParam === "filterFrequency" && mainFilterForLFO && mainFilterForLFO.frequency instanceof Tone.Signal){
                         lfo.connect(mainFilterForLFO.frequency);
                    } else {
                        console.warn(`${logPrefix} LFO targetParam '${effectConf.targetParam}' not found or not suitable on ${instrumentHintName}. Target node:`, targetableNode);
                    }
                    if(effectConf.autostart) lfo.start();
                } else {
                    try {
                        effectNodeInstance = new EffectConstructor(effectOptionsWithContext);
                        if (effectNodeInstance && 'ready' in effectNodeInstance && typeof (effectNodeInstance as any).ready?.then === 'function') {
                           await (effectNodeInstance as any).ready;
                        }
                        if (effectNodeInstance) {
                            currentOutputNode.connect(effectNodeInstance);
                            currentOutputNode = effectNodeInstance;
                        }
                    } catch (e) {
                        console.error(`${logPrefix} Error instantiating effect ${EffectConstructor.name} for ${instrumentHintName}:`, e);
                    }
                }
            } else {
                 console.warn(`${logPrefix} Unknown or invalid effect type constructor: ${effectConf.type?.name || effectConf.type } for ${instrumentHintName}`);
            }
        }
    }
    return { instrument, outputNodeToConnect: currentOutputNode, filterEnv, availableNotes: undefined };
};
