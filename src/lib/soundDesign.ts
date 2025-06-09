
'use client';
import * as Tone from 'tone';

// Constants
const SAFE_OSC_TYPE = 'triangle' as const;

// Placeholder for sample URLs - in a real scenario, these would come from Firebase or a config
const HARDCODED_SAMPLES = {
  sampled_piano: {
    baseUrl: "/samples/", // Assuming samples will be in /public/samples/
    urls: {
      "C4": "piano_c4.wav", // Replace with actual or valid placeholder URLs
      "D#4": "piano_ds4.wav",
      "F#4": "piano_fs4.wav",
      "A4": "piano_a4.wav",
    },
    // Placeholder for a truly generic, loadable (but likely silent or tiny) WAV file
    // This helps test the loading mechanism if local samples are not yet available.
    // In a real app, you'd point to actual samples or ensure /public/samples/placeholder.wav exists.
    fallbackUrls: {
        "C4": "https://cdn.jsdelivr.net/gh/Tonejs/Tone.js/examples/audio/casio/C4.mp3",
        "D#4": "https://cdn.jsdelivr.net/gh/Tonejs/Tone.js/examples/audio/casio/Ds4.mp3",
        "F#4": "https://cdn.jsdelivr.net/gh/Tonejs/Tone.js/examples/audio/casio/Fs4.mp3",
        "A4": "https://cdn.jsdelivr.net/gh/Tonejs/Tone.js/examples/audio/casio/A4.mp3",
    },
    attack: 0.01,
    release: 1.2,
    volume: -8, // Example volume for sampler
  }
};

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
        effects: [{type: Tone.Chorus, frequency: 0.9, delayTime: 3.5, depth: 0.06, feedback: 0.03, wet: 0.1}],
        filterType: 'lowpass' as const, filterFrequency: 5000, filterRolloff: -12 as const,
        filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.01, release: 1.2, baseFrequency: 300, octaves: 3}
    },
    synthLeadElectronic: {
        synthType: Tone.Synth,
        options: { oscillator: { type: "fatsawtooth" as const, count: 3, spread: 25 }, envelope: { attack: 0.04, decay: 1.5, sustain: 0.6, release: 1.0 } }, volume: -10,
        effects: [
            {type: Tone.FeedbackDelay, delayTime: "8n.", feedback: 0.25, wet:0.2},
            {type: Tone.Filter, frequency: 3500, type: 'lowpass' as const, rolloff: -12 as const, Q: 0.8},
            {type: Tone.LFO, frequency: 5, min: -5, max: 5, amplitude:0.3, targetParam: "detune", autostart: true}
        ]
    },
    rockGuitarLead: { synthType: Tone.Synth, options: { oscillator: { type: "fatsquare" as const, count: 2, spread: 15 }, envelope: { attack: 0.01, decay: 0.7, sustain: 0.4, release: 0.5 } }, volume: -11, effects: [{type: Tone.Distortion, amount: 0.4}] },
    acousticGuitarLead: { synthType: Tone.PluckSynth, options: { attackNoise: 0.6, dampening: 3500, resonance: 0.68 }, volume: -15, effects: [{type: Tone.Chorus, frequency: 0.6, delayTime: 4.2, depth: 0.04, wet: 0.15}] },
    fluteLead: { synthType: Tone.Synth, options: { oscillator: {type: "triangle8" as const }, envelope: {attack: 0.05, decay: 0.4, sustain: 0.6, release: 0.3}}, volume: -12},

    electricPianoChords: {
        synthType: Tone.PolySynth, subType: Tone.FMSynth,
        options: { harmonicity: 2.2, modulationIndex: 7, envelope: { attack: 0.015, decay: 1.2, sustain: 0.4, release: 1.8 }, oscillator: {type: "sine" as const, partials: [1, 0.4, 0.08]} },
        volume: -18,
        effects: [{type: Tone.Chorus, frequency: 1.1, delayTime: 3.0, depth: 0.25, wet: 0.15}],
        filterType: 'lowpass' as const, filterFrequency: 4500, filterRolloff: -12 as const,
        filterEnvelope: { attack: 0.01, decay: 0.4, sustain: 0.01, release: 1.8, baseFrequency: 250, octaves: 3}
    },
    warmPadChords: {
        synthType: Tone.PolySynth, subType: Tone.AMSynth,
        options: { harmonicity: 0.7, modulationType: "sawtooth" as const, envelope: { attack: 1.5, decay: 2.0, sustain: 0.8, release: 3.5 } }, volume: -22,
        effects: [
            {type: Tone.LFO, frequency: 0.2, min: 400, max: 1200, targetParam:"filterFrequency", autostart:true },
            {type: Tone.Filter, type: "lowpass" as const, frequency: 800, rolloff: -12 as const, Q: 0.7 }
        ]
    },
    stringEnsembleChords: {
        synthType: Tone.PolySynth, subType: Tone.Synth,
        options: { oscillator: {type: "fatsawtooth" as const, count: 5, spread: 40}, envelope: {attack: 0.8, decay: 2.0, sustain:0.8, release: 2.5}}, volume: -20,
        effects: [
             {type: Tone.LFO, frequency: 0.25, min: 500, max: 1500, targetParam:"filterFrequency", autostart:true },
             {type: Tone.Filter, type: "lowpass" as const, frequency: 1000, rolloff: -12 as const, Q: 0.8 }
        ]
    },

    pluckArp: { synthType: Tone.PluckSynth, options: { attackNoise: 0.3, dampening: 4000, resonance: 0.75 }, volume: -20 },
    synthArpElectronic: { synthType: Tone.Synth, options: { oscillator: {type: "triangle" as const}, envelope: { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.25}}, volume: -22 },

    defaultBass: { synthType: Tone.FMSynth, options: { harmonicity: 1.0, modulationIndex: 2.5, envelope: { attack: 0.015, decay: 0.2, sustain: 0.8, release: 0.6 }, oscillator: { type: "triangle" as const } }, volume: -9 },
    subBassElectronic: { synthType: Tone.Synth, options: { oscillator: { type: "sine" as const }, envelope: { attack: 0.02, decay: 0.5, sustain: 1, release: 0.8 } }, volume: -7 },
    rockBassPicked: { synthType: Tone.Synth, options: { oscillator: {type: "fatsquare" as const, count:2, spread:10}, envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5 }}, volume: -8, effects: [{type: Tone.Distortion, amount: 0.1}]},
    jazzUprightBass: { synthType: Tone.FMSynth, options: { harmonicity: 0.8, modulationIndex: 1.5, envelope: { attack: 0.03, decay: 0.7, sustain: 0.1, release: 0.9 }, oscillator:{type:"sine" as const, partials: [1, 0.1, 0.02]}}, volume: -10},
    funkSlapBass: { synthType: Tone.Synth, options: { oscillator: {type: "sawtooth" as const}, envelope: {attack: 0.005, decay: 0.15, sustain: 0.01, release: 0.2}, filter: {type: "lowpass" as const, Q: 3, rolloff: -24 as const, frequency: 800}, filterEnvelope: {attack:0.005, decay:0.05, sustain:0, release:0.1, baseFrequency:200, octaves:2.5} }, volume: -8 },

    kidsToyPiano: { synthType: Tone.FMSynth, options: { harmonicity: 4.0, modulationIndex: 7, oscillator: {type: "triangle" as const}, envelope: {attack: 0.008, decay: 0.25, sustain: 0.4, release: 0.4}}, volume: -10},
    kidsXylophone: { synthType: Tone.MetalSynth, options: { harmonicity: 2.0, modulationIndex: 1.0, octaves: 0.2, envelope: {attack:0.002, decay:0.3, release:0.5}}, volume: -13},
    kidsUkuleleBass: { synthType: Tone.PluckSynth, options: {attackNoise: 0.5, dampening: 1800, resonance: 0.55}, volume: -12},
    kidsSimplePad: {
        synthType: Tone.PolySynth, subType: Tone.Synth,
        options: {oscillator: {type: "triangle" as const}, envelope: {attack: 0.3, decay:0.6, sustain:0.7, release:1.2}}, volume: -20,
        effects: [
             {type: Tone.LFO, frequency: 0.15, min: 300, max: 900, targetParam:"filterFrequency", autostart:true },
             {type: Tone.Filter, type: "lowpass" as const, frequency: 600, rolloff: -12 as const, Q: 0.6 }
        ]
    },
    kidsSimpleArp: { synthType: Tone.Synth, options: {oscillator: {type: "square" as const }, envelope: {attack:0.015, decay:0.12, sustain:0.15, release:0.22}}, volume: -22},

    kick: { pitchDecay: 0.035, octaves: 4.5, oscillator: { type: "sine" as const }, envelope: { attack: 0.0015, decay: 0.25, sustain: 0.002, release: 0.9, attackCurve: "exponential" as const }, volume: -5 },
    kickElectronic: { pitchDecay: 0.045, octaves: 5.5, oscillator: { type: "sine" as const }, envelope: { attack: 0.001, decay: 0.35, sustain: 0.005, release: 1.1 }, volume: -3 },
    kickRock: { pitchDecay: 0.02, octaves: 4, envelope: { attack: 0.0025, decay: 0.18, sustain: 0.001, release: 0.7 }, volume: -4 },
    snare: { noise: { type: 'pink' as const, playbackRate: 0.7 }, volume: -12, envelope: { attack: 0.0015, decay: 0.07, sustain: 0, release: 0.1 } },
    snareElectronic: { noise: { type: 'white' as const, playbackRate: 0.9 }, volume: -10, envelope: { attack: 0.0025, decay: 0.09, sustain: 0.005, release: 0.13 } },
    hiHat: { frequency: 400, envelope: { attack: 0.001, decay: 0.04, release: 0.04 }, harmonicity: 2.8, modulationIndex: 9, resonance: 2500, octaves: 1.1, volume: -18 },
    hiHatElectronic: { frequency: 480, envelope: { attack: 0.001, decay: 0.02, release: 0.025 }, harmonicity: 2.2, modulationIndex: 7, resonance: 2800, octaves: 0.9, volume: -16 },
    rideCymbal: { frequency: 300, envelope: { attack: 0.01, decay: 1.5, sustain: 0, release: 2.0 }, harmonicity: 4, modulationIndex:15, resonance: 5000, octaves: 2.5, volume: -20},

    kidsKick: { pitchDecay: 0.03, octaves: 3.5, envelope: { attack: 0.0025, decay: 0.12, sustain: 0.005, release: 0.4 }, volume: -7 },
    kidsSnare: { noise: { type: 'white' as const }, volume: -15, envelope: { attack: 0.0015, decay: 0.04, sustain: 0, release: 0.07 } },
    kidsHiHat: { frequency: 420, envelope: { attack: 0.001, decay: 0.015, release: 0.015 }, harmonicity: 2.2, octaves: 0.8, volume: -22 },
    tambourine: { noise: {type: 'white' as const, playbackRate: 1.6}, envelope: {attack:0.006, decay:0.06, sustain:0, release:0.07}, volume: -17},
  };

  let melodyConf = { ...baseConfigs.pianoMelody, instrumentHintName: "pianoMelody" };
  let bassConf = { ...baseConfigs.defaultBass, instrumentHintName: "defaultBass" };
  let chordsConf = { ...baseConfigs.warmPadChords, instrumentHintName: "warmPadChords" };
  let arpConf = { ...baseConfigs.pluckArp, instrumentHintName: "pluckArp" };
  let kickConf = { ...baseConfigs.kick, instrumentHintName: "kick" };
  let snareConf = { ...baseConfigs.snare, instrumentHintName: "snare" };
  let hiHatConf = { ...baseConfigs.hiHat, instrumentHintName: "hiHat" };
  let useTambourine = false;
  let useRideCymbal = false;

  const processHintForSampler = (hint: string) => {
    if (hint === "use_sampled_piano") {
      return "sampled_piano";
    }
    // Add other direct sampler hints here if needed
    return null;
  };
  
  const samplerHint = hintsLower.map(processHintForSampler).find(Boolean);
  if (samplerHint && HARDCODED_SAMPLES[samplerHint as keyof typeof HARDCODED_SAMPLES]) {
    melodyConf = { synthType: Tone.Sampler, isSampler: true, samplerName: samplerHint, volume: HARDCODED_SAMPLES[samplerHint as keyof typeof HARDCODED_SAMPLES].volume, instrumentHintName: samplerHint } as any;
    // Potentially apply to other tracks if hints suggest samplers for them
  }


  if (isKidsMode) {
    melodyConf = Math.random() < 0.5 ? {...baseConfigs.kidsToyPiano, instrumentHintName: "kidsToyPiano"} : {...baseConfigs.kidsXylophone, instrumentHintName: "kidsXylophone"};
    bassConf = {...baseConfigs.kidsUkuleleBass, instrumentHintName: "kidsUkuleleBass"};
    chordsConf = {...baseConfigs.kidsSimplePad, instrumentHintName: "kidsSimplePad"};
    arpConf = {...baseConfigs.kidsSimpleArp, instrumentHintName: "kidsSimpleArp"};
    kickConf = {...baseConfigs.kidsKick, instrumentHintName: "kidsKick"};
    snareConf = {...baseConfigs.kidsSnare, instrumentHintName: "kidsSnare"};
    hiHatConf = {...baseConfigs.kidsHiHat, instrumentHintName: "kidsHiHat"};
    if (hintsLower.some(h => h.includes("tambourine") || h.includes("shaker"))) useTambourine = true;
  } else if (!samplerHint || melodyConf.instrumentHintName !== samplerHint) { // Only apply synth logic if sampler not chosen for melody
    if (genreLower.includes("electronic") || genreLower.includes("synthwave") || genreLower.includes("techno") || genreLower.includes("house")) {
      melodyConf = { ...baseConfigs.synthLeadElectronic, instrumentHintName: "synthLeadElectronic" };
      bassConf = { ...baseConfigs.subBassElectronic, instrumentHintName: "subBassElectronic" };
      chordsConf = { ...baseConfigs.warmPadChords, volume: -20, instrumentHintName: "warmPadChordsElectronic" };
      arpConf = { ...baseConfigs.synthArpElectronic, instrumentHintName: "synthArpElectronic" };
      kickConf = { ...baseConfigs.kickElectronic, instrumentHintName: "kickElectronic" };
      snareConf = { ...baseConfigs.snareElectronic, instrumentHintName: "snareElectronic" };
      hiHatConf = { ...baseConfigs.hiHatElectronic, instrumentHintName: "hiHatElectronic" };
    } else if (genreLower.includes("rock") || genreLower.includes("metal") || genreLower.includes("punk")) {
      melodyConf = { ...baseConfigs.rockGuitarLead, instrumentHintName: "rockGuitarLead" };
      bassConf = { ...baseConfigs.rockBassPicked, instrumentHintName: "rockBassPicked" };
      chordsConf = { ...baseConfigs.rockGuitarLead, synthType: Tone.PolySynth, subType: Tone.Synth, options: {...baseConfigs.rockGuitarLead.options, envelope: {...baseConfigs.rockGuitarLead.options.envelope, attack:0.005, decay:0.5, sustain:0.01, release:0.3}}, volume: -16, instrumentHintName: "rockGuitarChords" };
      arpConf = { ...baseConfigs.defaultBass, volume: -28, instrumentHintName: "rockArpBass" }; // Arp uses bass synth for grungy feel
      kickConf = { ...baseConfigs.kickRock, volume: -5, instrumentHintName: "kickRock" };
    } else if (genreLower.includes("jazz") || genreLower.includes("swing") || (genreLower.includes("blues") && rhythmicDensity > 0.3)) {
      melodyConf = { ...baseConfigs.pianoMelody, volume: -10, instrumentHintName: "jazzPianoMelody" };
      bassConf = { ...baseConfigs.jazzUprightBass, instrumentHintName: "jazzUprightBass" };
      chordsConf = { ...baseConfigs.electricPianoChords, volume: -16, instrumentHintName: "jazzElectricPianoChords" };
      arpConf = { ...baseConfigs.pluckArp, volume: -24, instrumentHintName: "jazzPluckArp" };
      kickConf = { ...baseConfigs.kick, volume: -10, envelope: {...baseConfigs.kick.envelope, decay:0.15, sustain:0.001}, instrumentHintName: "jazzKick" };
      snareConf = { ...baseConfigs.snare, volume: -16, noise: {type: 'pink', playbackRate: 0.5}, instrumentHintName: "jazzSnare" };
      hiHatConf = { ...baseConfigs.rideCymbal, volume: -20, instrumentHintName: "jazzRideCymbal" };
      useRideCymbal = true;
    } else if (genreLower.includes("ambient") || genreLower.includes("new age")) {
        melodyConf = { ...baseConfigs.warmPadChords, synthType: Tone.PolySynth, subType: Tone.AMSynth, volume: -16, instrumentHintName: "ambientMelodyPad" };
        bassConf = { ...baseConfigs.subBassElectronic, volume: -14, options: {...baseConfigs.subBassElectronic.options, envelope: {...baseConfigs.subBassElectronic.options.envelope, attack:0.5, release:1.5}}, instrumentHintName: "ambientSubBass" };
        chordsConf = { ...baseConfigs.warmPadChords, volume: -18, instrumentHintName: "ambientChordsPad" };
        arpConf = { ...baseConfigs.pluckArp, volume: -22, options: {...baseConfigs.pluckArp.options, dampening: 4800, attackNoise: 0.3}, instrumentHintName: "ambientPluckArp"};
        kickConf = { ...baseConfigs.kick, volume: -15, envelope: {...baseConfigs.kick.envelope, decay: 0.5, sustain:0.05}, instrumentHintName: "ambientKick" };
        snareConf = { ...baseConfigs.snare, volume: -25, instrumentHintName: "ambientSnare" };
        hiHatConf = { ...baseConfigs.hiHat, volume: -28, instrumentHintName: "ambientHiHat" };
    } else if (genreLower.includes("folk") || genreLower.includes("country") || genreLower.includes("acoustic")) {
        melodyConf = { ...baseConfigs.acousticGuitarLead, instrumentHintName: "acousticGuitarMelody" };
        bassConf = { ...baseConfigs.jazzUprightBass, volume: -12, instrumentHintName: "acousticBass"};
        chordsConf = { synthType: Tone.PolySynth, subType: Tone.PluckSynth, options: {...baseConfigs.acousticGuitarLead.options}, volume: -16, instrumentHintName: "acousticGuitarChords" };
        arpConf = {...baseConfigs.acousticGuitarLead, volume: -18, instrumentHintName: "acousticGuitarArp"};
        if (hintsLower.some(h => h.includes("tambourine"))) useTambourine = true;
    } else if (genreLower.includes("funk") || genreLower.includes("soul") || genreLower.includes("disco")) {
        melodyConf = { ...baseConfigs.electricPianoChords, synthType: Tone.PolySynth, subType: Tone.FMSynth, volume: -11, instrumentHintName: "funkElectricPianoMelody"};
        bassConf = { ...baseConfigs.funkSlapBass, instrumentHintName: "funkSlapBass"};
        chordsConf = { ...baseConfigs.electricPianoChords, volume: -15, instrumentHintName: "funkElectricPianoChords"};
        arpConf = { ...baseConfigs.pluckArp, volume: -20, instrumentHintName: "funkPluckArp"};
        kickConf = { ...baseConfigs.kick, volume: -4, instrumentHintName: "funkKick" };
        snareConf = { ...baseConfigs.snare, volume: -10, instrumentHintName: "funkSnare" };
        hiHatConf = { ...baseConfigs.hiHat, volume: -17, instrumentHintName: "funkHiHat" };
    } else if (genreLower.includes("classical") || genreLower.includes("cinematic") || genreLower.includes("orchestral")) {
        melodyConf = { ...baseConfigs.pianoMelody, volume: -8, instrumentHintName: "classicalPianoMelody" };
        bassConf = { ...baseConfigs.defaultBass, options: {...baseConfigs.defaultBass.options, oscillator:{type:"sine" as const}}, volume: -14, instrumentHintName: "classicalBass" };
        chordsConf = { ...baseConfigs.stringEnsembleChords, instrumentHintName: "classicalStringChords" };
        arpConf = { ...baseConfigs.pluckArp, volume: -20, instrumentHintName: "classicalPluckArp" };
        hiHatConf = {...baseConfigs.hiHat, volume: -25, instrumentHintName: "classicalHiHat"}
    }
    // Apply specific instrument hints if not already using a sampler for melody
    if (!melodyConf.isSampler) {
      hintsLower.forEach(hint => {
        if (hint.includes('piano')) {
          melodyConf = { ...baseConfigs.pianoMelody, instrumentHintName: "hintPianoMelody" };
          if (!hintsLower.some(h => /pad|string/i.test(h) || genreLower.includes("jazz"))) {
              chordsConf = { ...baseConfigs.pianoMelody, synthType: Tone.PolySynth, subType: Tone.FMSynth, options: {...baseConfigs.pianoMelody.options}, volume: -16, instrumentHintName: "hintPianoChords" };
          }
        } else if (hint.includes('electric piano') || hint.includes('rhodes')) {
          melodyConf = { ...baseConfigs.electricPianoChords, synthType: Tone.PolySynth, subType: Tone.FMSynth, options: {...baseConfigs.electricPianoChords.options}, volume: -11, instrumentHintName: "hintElectricPianoMelody"};
          chordsConf = { ...baseConfigs.electricPianoChords, volume: -18, instrumentHintName: "hintElectricPianoChords" };
        } else if (hint.includes('pad') || hint.includes('warm pad') || hint.includes('synth pad')) {
          chordsConf = { ...baseConfigs.warmPadChords, instrumentHintName: "hintWarmPadChords" };
          if (!hintsLower.some(h => /piano|lead|guitar|pluck/i.test(h))) melodyConf = {...baseConfigs.warmPadChords, synthType: Tone.PolySynth, subType: Tone.AMSynth, volume: -14, instrumentHintName: "hintWarmPadMelody"};
        } else if (hint.includes('strings') || hint.includes('orchestra') || hint.includes('ensemble')) {
          chordsConf = {...baseConfigs.stringEnsembleChords, instrumentHintName: "hintStringChords"};
          if (!hintsLower.some(h => /piano|lead|guitar|pluck/i.test(h))) melodyConf = {...baseConfigs.stringEnsembleChords, synthType: Tone.PolySynth, subType: Tone.Synth, volume: -14, instrumentHintName: "hintStringMelody"};
        } else if (hint.includes('pluck') || hint.includes('bell') || hint.includes('xylophone') || hint.includes('celesta')) {
          melodyConf = { ...baseConfigs.pluckArp, synthType: Tone.PluckSynth, options: {...baseConfigs.pluckArp.options}, volume: -14, instrumentHintName: "hintPluckMelody" };
          arpConf = { ...baseConfigs.pluckArp, instrumentHintName: "hintPluckArp" };
        } else if (hint.includes('synth lead') || hint.includes('bright synth') || hint.includes('lead synth')) {
          melodyConf = { ...baseConfigs.synthLeadElectronic, instrumentHintName: "hintSynthLeadElectronic" };
        } else if (hint.includes('guitar') && (hint.includes('acoustic') || hint.includes('folk'))) {
            melodyConf = {...baseConfigs.acousticGuitarLead, instrumentHintName: "hintAcousticGuitarLead"};
            if (!hintsLower.some(h => /pad|string|piano/i.test(h))) chordsConf = {synthType: Tone.PolySynth, subType: Tone.PluckSynth, options: {...baseConfigs.acousticGuitarLead.options}, volume: -16, instrumentHintName: "hintAcousticGuitarChords"};
            arpConf = {...baseConfigs.acousticGuitarLead, volume: -18, instrumentHintName: "hintAcousticGuitarArp"};
        } else if (hint.includes('guitar') && (hint.includes('rock') || hint.includes('electric') || hint.includes('distort'))) {
            melodyConf = {...baseConfigs.rockGuitarLead, instrumentHintName: "hintRockGuitarLead"};
            if (!hintsLower.some(h => /pad|string|piano/i.test(h))) chordsConf = {...baseConfigs.rockGuitarLead, synthType: Tone.PolySynth, subType: Tone.Synth, options: {...baseConfigs.rockGuitarLead.options, envelope: {...baseConfigs.rockGuitarLead.options.envelope, attack:0.005, decay:0.5, sustain:0.01, release:0.3}}, volume: -16, instrumentHintName: "hintRockGuitarChords"};
        } else if (hint.includes('flute') || hint.includes('recorder')) {
            melodyConf = {...baseConfigs.fluteLead, instrumentHintName: "hintFluteLead"};
        }
        // Bass hints override regardless of sampler for melody
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
    }
  }


  return {
    melody: melodyConf, bass: bassConf, chords: chordsConf, arpeggio: arpConf,
    kick: kickConf, snare: snareConf, hiHat: useRideCymbal ? {...baseConfigs.rideCymbal, instrumentHintName: "rideCymbalFinal"} : hiHatConf,
    tambourine: useTambourine ? {...baseConfigs.tambourine, instrumentHintName: "tambourineFinal"} : null,
  };
};

export type InstrumentOutput = {
    instrument: Tone.Instrument | Tone.Sampler;
    outputNodeToConnect: Tone.ToneAudioNode;
    filterEnv?: Tone.FrequencyEnvelope;
};

export const createSynth = async (
    config: any,
    offlineContext?: Tone.OfflineContext, // Keep for potential future use with offline synths
    instrumentHintName?: string // Added to identify sampler usage
): Promise<InstrumentOutput> => {
    if (config && config.isSampler && config.samplerName && HARDCODED_SAMPLES[config.samplerName as keyof typeof HARDCODED_SAMPLES]) {
        const sampleDef = HARDCODED_SAMPLES[config.samplerName as keyof typeof HARDCODED_SAMPLES];
        try {
            console.log(`[soundDesign] Attempting to load Sampler: ${config.samplerName}`);
            const sampler = new Tone.Sampler({
                urls: sampleDef.urls, // Use actual sample relative paths
                baseUrl: sampleDef.baseUrl,
                attack: sampleDef.attack,
                release: sampleDef.release,
                volume: sampleDef.volume !== undefined ? sampleDef.volume : -12,
            });

            // Check if Tone.Destination (or offlineContext destination) is available before connecting
            if (Tone.Destination && Tone.Destination.numberOfInputs > 0) {
                 // No need to connect to destination here if it will be connected later by toneService
            } else {
                console.warn(`[soundDesign] Tone.Destination not ready for Sampler, or in offline mode without context. Sampler will be returned unconnected.`);
            }
            await sampler.loaded; // Wait for samples to load
            console.log(`[soundDesign] Sampler ${config.samplerName} loaded successfully.`);
            return { instrument: sampler, outputNodeToConnect: sampler };
        } catch (error) {
            console.error(`[soundDesign] Error loading sampler ${config.samplerName}:`, error);
            console.warn(`[soundDesign] Falling back to default synth for ${instrumentHintName || 'sampler track'}.`);
            // Fallback to a default synth if sampler loading fails
            const fallbackConfig = { synthType: Tone.FMSynth, options: { oscillator: { type: SAFE_OSC_TYPE } }, volume: -12 };
            const fallbackInstrument = new fallbackConfig.synthType(fallbackConfig.options);
            fallbackInstrument.volume.value = fallbackConfig.volume;
            return { instrument: fallbackInstrument, outputNodeToConnect: fallbackInstrument };
        }
    }


    // Existing synth creation logic
    if (!config || !config.synthType) {
        const defaultConfig = { synthType: Tone.FMSynth, options: { oscillator: { type: SAFE_OSC_TYPE } }, volume: -12 };
        const instrument = new defaultConfig.synthType(defaultConfig.options);
        instrument.volume.value = defaultConfig.volume;
        return { instrument, outputNodeToConnect: instrument };
    }

    let instrument: Tone.Instrument;
    if (config.synthType === Tone.PolySynth) {
        const subSynthType = config.subType || Tone.Synth;
        instrument = new Tone.PolySynth({synth: subSynthType});
        if (config.options) (instrument as Tone.PolySynth).set(config.options);
    } else {
        instrument = new config.synthType(config.options);
    }
    instrument.volume.value = config.volume !== undefined ? config.volume : -12;

    let currentOutputNode: Tone.ToneAudioNode = instrument;
    let filterEnv: Tone.FrequencyEnvelope | undefined;
    let mainFilterForLFO: Tone.Filter | undefined;


    if (config.filterType || (config.effects && config.effects.some((eff: any) => eff.targetParam === "filterFrequency"))) {
        mainFilterForLFO = new Tone.Filter(config.filterFrequency || 5000, config.filterType || 'lowpass', config.filterRolloff || -12);
        if (config.filterEnvelope) {
            filterEnv = new Tone.FrequencyEnvelope(config.filterEnvelope);
            filterEnv.connect(mainFilterForLFO.frequency);
        }
        instrument.connect(mainFilterForLFO);
        currentOutputNode = mainFilterForLFO;
    }


    if (config.effects && Array.isArray(config.effects) && config.effects.length > 0) {
        const effectInstances: Tone.ToneAudioNode[] = [];
        config.effects.forEach((effectConf: any) => {
            let effectNodeInstance: Tone.ToneAudioNode | undefined;
            if (effectConf.type === Tone.Distortion) {
                effectNodeInstance = new Tone.Distortion(effectConf.amount || 0.4);
            } else if (effectConf.type === Tone.Chorus) {
                effectNodeInstance = new Tone.Chorus(effectConf.frequency || 1.5, effectConf.delayTime || 3.5, effectConf.depth || 0.7);
                if (effectConf.feedback !== undefined) (effectNodeInstance as Tone.Chorus).feedback.value = effectConf.feedback;
                if (effectConf.wet !== undefined) (effectNodeInstance as Tone.Chorus).wet.value = effectConf.wet;
            } else if (effectConf.type === Tone.FeedbackDelay){
                 effectNodeInstance = new Tone.FeedbackDelay(effectConf.delayTime || "8n", effectConf.feedback || 0.5);
                 if (effectConf.wet !== undefined) (effectNodeInstance as Tone.FeedbackDelay).wet.value = effectConf.wet;
            } else if (effectConf.type === Tone.Filter && effectConf.targetParam !== "filterFrequency" && !mainFilterForLFO ) {
                 effectNodeInstance = new Tone.Filter(effectConf.frequency || 1000, effectConf.type || 'lowpass', effectConf.rolloff || -12);
                 if (effectConf.Q !== undefined) (effectNodeInstance as Tone.Filter).Q.value = effectConf.Q;
            } else if (effectConf.type === Tone.LFO) {
                const lfo = new Tone.LFO(effectConf.frequency, effectConf.min, effectConf.max);
                if (effectConf.amplitude !== undefined) lfo.amplitude.value = effectConf.amplitude;
                if (effectConf.targetParam === "detune" && 'detune' in instrument) {
                    lfo.connect(instrument.detune);
                } else if (effectConf.targetParam === "filterFrequency" && mainFilterForLFO) {
                    lfo.connect(mainFilterForLFO.frequency);
                }
                if(effectConf.autostart) lfo.start();
            }
            else if (effectConf.type === Tone.PingPongDelay) {
                 effectNodeInstance = new Tone.PingPongDelay(effectConf.delayTime || "8n", effectConf.feedback || 0.2);
                 if (effectConf.wet !== undefined) (effectNodeInstance as Tone.PingPongDelay).wet.value = effectConf.wet;
            } else if (effectConf.type === Tone.BitCrusher) {
                effectNodeInstance = new Tone.BitCrusher(effectConf.bits || 4);
                if (effectConf.wet !== undefined) (effectNodeInstance as Tone.BitCrusher).wet.value = effectConf.wet;
            } else if (effectConf.type === Tone.Reverb && !(currentOutputNode instanceof Tone.Reverb)) {
                effectNodeInstance = new Tone.Reverb(effectConf.decay || 1.5);
                if (effectConf.wet !== undefined) (effectNodeInstance as Tone.Reverb).wet.value = effectConf.wet;
                if (effectNodeInstance && 'ready' in effectNodeInstance && typeof (effectNodeInstance as any).ready.then === 'function') {
                    // It's a promise, so we'd need to await it, but createSynth is now async, so this is fine.
                    // This will be handled by the async nature of createSynth.
                }
            }

            if (effectNodeInstance) {
                 effectInstances.push(effectNodeInstance);
            }
        });

        if (effectInstances.length > 0) {
            currentOutputNode.chain(...effectInstances);
            currentOutputNode = effectInstances[effectInstances.length - 1];
        }
    }
    return { instrument, outputNodeToConnect: currentOutputNode, filterEnv };
};

