
export const VALENCE_AROUSAL_DESCRIPTIONS: Record<string, string> = {
  high_arousal_positive_valence: "Energetic & Joyful (e.g., excited, elated)",
  mid_arousal_positive_valence: "Pleasant & Engaged (e.g., happy, cheerful)",
  low_arousal_positive_valence: "Calm & Content (e.g., serene, relaxed)",
  high_arousal_neutral_valence: "Alert & Focused (e.g., surprised, concentrated)",
  mid_arousal_neutral_valence: "Neutral (e.g., thoughtful, contemplative)",
  low_arousal_neutral_valence: "Subdued & Peaceful (e.g., tranquil, quiet)",
  high_arousal_negative_valence: "Tense & Agitated (e.g., angry, fearful)",
  mid_arousal_negative_valence: "Unpleasant & Distressed (e.g., sad, gloomy)",
  low_arousal_negative_valence: "Lethargic & Depressed (e.g., bored, tired)",
};

export function getValenceArousalDescription(valence: number, arousal: number): string {
  if (valence > 0.3) { 
    if (arousal > 0.3) return VALENCE_AROUSAL_DESCRIPTIONS.high_arousal_positive_valence;
    if (arousal < -0.3) return VALENCE_AROUSAL_DESCRIPTIONS.low_arousal_positive_valence;
    return VALENCE_AROUSAL_DESCRIPTIONS.mid_arousal_positive_valence;
  } else if (valence < -0.3) { 
    if (arousal > 0.3) return VALENCE_AROUSAL_DESCRIPTIONS.high_arousal_negative_valence;
    if (arousal < -0.3) return VALENCE_AROUSAL_DESCRIPTIONS.low_arousal_negative_valence;
    return VALENCE_AROUSAL_DESCRIPTIONS.mid_arousal_negative_valence;
  } else { 
    if (arousal > 0.3) return VALENCE_AROUSAL_DESCRIPTIONS.high_arousal_neutral_valence;
    if (arousal < -0.3) return VALENCE_AROUSAL_DESCRIPTIONS.low_arousal_neutral_valence;
    return VALENCE_AROUSAL_DESCRIPTIONS.mid_arousal_neutral_valence;
  }
}

export const MAX_IMAGE_FILE_SIZE_BYTES = 4 * 1024 * 1024; 
export const MAX_IMAGE_FILE_SIZE_MB = MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024);

export const MUSIC_GENRES = [
  "AI", 
  "Pop", "Rock", "Jazz", "Electronic", "Ambient",
  "Classical", "Folk", "Cinematic", "Hip Hop", "Blues",
  "Reggae", "Country", "Metal", "Funk", "Soul"
].sort((a, b) => {
  if (a === "AI") return -1; 
  if (b === "AI") return 1;
  return a.localeCompare(b);
});


export const SOUND_LOADING_TIMEOUT_MS = 40000;
export const SOUNDFONT_URL = 'https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus/';

export const DEFAULT_BPM = 120;
export const BEATS_PER_MEASURE = 4;
export const TARGET_SONG_BODY_SECONDS = 28; 
export const OUTRO_MEASURES = 2; 
export const REVERB_TAIL_SECONDS = 2.5; 
export const MIN_EFFECTIVE_DURATION_SECONDS = 15.0; 

const typicalMeasureSeconds = BEATS_PER_MEASURE * (60 / DEFAULT_BPM);
const typicalOutroSeconds = OUTRO_MEASURES * typicalMeasureSeconds;
export const MAX_WAV_RENDER_DURATION_SECONDS = TARGET_SONG_BODY_SECONDS + typicalOutroSeconds + REVERB_TAIL_SECONDS;
