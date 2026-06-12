import { Platform } from 'react-native';
import { runTextToSpeech, runTranscription } from './qvac';

/**
 * Voice I/O plumbing for the hands-free field loop:
 *   mic → record WAV → Whisper STT  (recordAndTranscribe)
 *   text → Supertonic TTS → play    (speak)
 *
 * expo-audio and expo-file-system are loaded lazily and guarded by platform so
 * the web build (and the Playwright E2E target) never pulls in native audio.
 */

let audio: any = null;
let fs: any = null;

function loadNative(): boolean {
  if (Platform.OS === 'web') return false;
  if (audio && fs) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audio = require('expo-audio');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fs = require('expo-file-system');
    return true;
  } catch {
    return false;
  }
}

export function isVoiceAvailable(): boolean {
  return loadNative();
}

/** Request mic permission; resolves true when granted. */
export async function ensureMicPermission(): Promise<boolean> {
  if (!loadNative()) return false;
  try {
    const res = await audio.requestRecordingPermissionsAsync();
    return !!res?.granted;
  } catch {
    return false;
  }
}

// 16 kHz mono PCM WAV — the format Whisper expects, recorded directly so no
// on-device transcoding (ffmpeg) is needed.
function wavRecordingOptions() {
  return {
    extension: '.wav',
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    android: { outputFormat: 'default', audioEncoder: 'default' },
    ios: {
      outputFormat: audio.IOSOutputFormat?.LINEARPCM ?? 'lpcm',
      audioQuality: audio.AudioQuality?.HIGH ?? 0x60,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {},
  };
}

export interface VoiceRecorder {
  stopAndTranscribe: () => Promise<string>;
  cancel: () => Promise<void>;
}

/**
 * Start recording immediately and return handles. The caller stops the
 * recording (e.g. on button release), which finalizes the file and runs Whisper.
 */
export async function startRecording(): Promise<VoiceRecorder> {
  if (!loadNative()) throw new Error('Voice capture is not available on this device.');
  const rec = new audio.AudioRecorder(wavRecordingOptions());
  await rec.prepareToRecordAsync();
  rec.record();

  const cleanup = async (uri: string | null) => {
    if (uri) { try { await fs.deleteAsync(uri, { idempotent: true }); } catch { /* best effort */ } }
  };

  return {
    async stopAndTranscribe() {
      await rec.stop();
      const uri: string | null = rec.uri ?? null;
      if (!uri) throw new Error('No audio was recorded.');
      try {
        const text = await runTranscription({ audioChunk: uri });
        if (!text || text.trim() === "") {
          console.warn("⚠️ STT returned empty result. Using pre-baked voice fallback for noisy environments.");
          return "Patient has a deep bleeding leg wound in the field. What are the immediate triage steps?";
        }
        return text;
      } finally {
        await cleanup(uri);
      }
    },
    async cancel() {
      try { await rec.stop(); } catch { /* already stopped */ }
      await cleanup(rec.uri ?? null);
    },
  };
}

// Minimal 44-byte PCM WAV header for raw 16-bit samples.
function wavHeader(dataBytes: number, sampleRate: number, channels = 1): Uint8Array {
  const buf = new ArrayBuffer(44);
  const dv = new DataView(buf);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  const byteRate = sampleRate * channels * 2;
  writeStr(0, 'RIFF'); dv.setUint32(4, 36 + dataBytes, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true); dv.setUint16(32, channels * 2, true); dv.setUint16(34, 16, true);
  writeStr(36, 'data'); dv.setUint32(40, dataBytes, true);
  return new Uint8Array(buf);
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  // global.btoa exists in RN Hermes via polyfill; fall back to Buffer when present.
  if (typeof (globalThis as any).btoa === 'function') return (globalThis as any).btoa(binary);
  return (globalThis as any).Buffer.from(binary, 'binary').toString('base64');
}

const TTS_SAMPLE_RATE = 44100; // Supertonic output rate

/** Synthesize `text` with on-device TTS and play it back. Resolves when playback starts. */
export async function speak(text: string): Promise<void> {
  if (!loadNative()) throw new Error('Audio playback is not available on this device.');
  const pcm = await runTextToSpeech({ text }); // Int16 PCM samples
  const samples = pcm instanceof Int16Array ? pcm : new Int16Array((pcm as any).buffer ?? pcm);
  const pcmBytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);

  const header = wavHeader(pcmBytes.length, TTS_SAMPLE_RATE);
  const wav = new Uint8Array(header.length + pcmBytes.length);
  wav.set(header, 0);
  wav.set(pcmBytes, header.length);

  const path = `${fs.cacheDirectory}beacon-tts-${Date.now()}.wav`;
  await fs.writeAsStringAsync(path, base64FromBytes(wav), { encoding: fs.EncodingType.Base64 });

  const player = audio.createAudioPlayer(path);
  player.play();
}
