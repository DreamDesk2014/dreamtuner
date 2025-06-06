
// Function to convert an AudioBuffer to a WAV ArrayBuffer
// Adapted from various sources, e.g., https://stackoverflow.com/a/32436981, https://github.com/mattdiamond/Recorderjs

export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bitsPerSample = 16; // Standard for WAV

  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferLength = 44 + dataSize; // 44 bytes for WAV header

  const wavBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(wavBuffer);

  let offset = 0;

  // Helper function to write string to DataView
  function writeString(str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
    offset += str.length;
  }

  // Helper function to write 16-bit int
  function writeUint16(val: number) {
    view.setUint16(offset, val, true); // true for little-endian
    offset += 2;
  }

  // Helper function to write 32-bit int
  function writeUint32(val: number) {
    view.setUint32(offset, val, true); // true for little-endian
    offset += 4;
  }

  // RIFF chunk descriptor
  writeString('RIFF');
  writeUint32(36 + dataSize); // ChunkSize
  writeString('WAVE');

  // "fmt " sub-chunk
  writeString('fmt ');
  writeUint32(16); // Subchunk1Size (16 for PCM)
  writeUint16(1); // AudioFormat (1 for PCM)
  writeUint16(numChannels);
  writeUint32(sampleRate);
  writeUint32(byteRate);
  writeUint16(blockAlign);
  writeUint16(bitsPerSample);

  // "data" sub-chunk
  writeString('data');
  writeUint32(dataSize);

  // Write the PCM audio data
  // Interleave channels and convert float samples to 16-bit PCM
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  for (let i = 0; i < numSamples; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = channels[channel][i];
      // Clamp sample to [-1, 1]
      const s = Math.max(-1, Math.min(1, sample));
      // Convert to 16-bit signed int
      const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, val, true);
      offset += 2;
    }
  }

  return wavBuffer;
}
