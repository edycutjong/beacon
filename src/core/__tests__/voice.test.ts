import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Platform } from 'react-native';
import Module from 'module';

// Setup mock state
let mockAudioRecorderInstance: any = null;

class MockAudioRecorder {
  uri: string | null = 'file:///tmp/mock-voice.wav';
  constructor(public options: any) {
    mockAudioRecorderInstance = this;
  }
  prepareToRecordAsync = vi.fn().mockResolvedValue(undefined);
  record = vi.fn();
  stop = vi.fn().mockResolvedValue(undefined);
}

const mockAudio = {
  AudioRecorder: MockAudioRecorder,
  requestRecordingPermissionsAsync: vi.fn(),
  IOSOutputFormat: { LINEARPCM: 'lpcm' },
  AudioQuality: { HIGH: 0x60 },
  createAudioPlayer: vi.fn(),
};

const mockFileSystem = {
  deleteAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  cacheDirectory: 'file:///tmp/cache/',
  EncodingType: { Base64: 'base64' },
};

const mockQvac = {
  runTranscription: vi.fn(),
  runTextToSpeech: vi.fn(),
};

let shouldThrowOnRequire = false;

// Intercept CommonJS require for Expo native modules
const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (shouldThrowOnRequire) {
    if (request === 'expo-audio' || request === 'expo-file-system') {
      throw new Error('Expo module load failed');
    }
  }
  if (request === 'expo-audio') {
    return mockAudio;
  }
  if (request === 'expo-file-system') {
    return mockFileSystem;
  }
  return originalLoad.apply(this, arguments);
};

vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

vi.mock('../qvac', () => ({
  runTranscription: (...args: any[]) => mockQvac.runTranscription(...args),
  runTextToSpeech: (...args: any[]) => mockQvac.runTextToSpeech(...args),
}));

// Now import the functions to test
describe('voice.ts tests', () => {
  let isVoiceAvailable: any;
  let ensureMicPermission: any;
  let startRecording: any;
  let speak: any;
  const originalBtoa = (globalThis as any).btoa;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    shouldThrowOnRequire = false;
    mockAudioRecorderInstance = null;

    mockAudio.requestRecordingPermissionsAsync.mockReset();
    mockAudio.createAudioPlayer.mockReset();
    mockFileSystem.deleteAsync.mockReset();
    mockFileSystem.writeAsStringAsync.mockReset();
    mockQvac.runTranscription.mockReset();
    mockQvac.runTextToSpeech.mockReset();

    mockAudio.requestRecordingPermissionsAsync.mockResolvedValue({ granted: true });
    mockFileSystem.deleteAsync.mockResolvedValue(undefined);
    mockFileSystem.writeAsStringAsync.mockResolvedValue(undefined);
    mockAudio.createAudioPlayer.mockReturnValue({ play: vi.fn() });

    Platform.OS = 'ios';

    // Set original btoa back by default
    if (originalBtoa) {
      (globalThis as any).btoa = originalBtoa;
    } else {
      delete (globalThis as any).btoa;
    }

    // Dynamically import the module under test
    const voiceModule = await import('../voice');
    isVoiceAvailable = voiceModule.isVoiceAvailable;
    ensureMicPermission = voiceModule.ensureMicPermission;
    startRecording = voiceModule.startRecording;
    speak = voiceModule.speak;
  });

  afterAll(() => {
    (Module as any)._load = originalLoad;
    if (originalBtoa) {
      (globalThis as any).btoa = originalBtoa;
    } else {
      delete (globalThis as any).btoa;
    }
  });

  describe('isVoiceAvailable', () => {
    it('returns false on web platform', async () => {
      Platform.OS = 'web';
      expect(isVoiceAvailable()).toBe(false);
    });

    it('returns true on native platform when packages load successfully', async () => {
      expect(isVoiceAvailable()).toBe(true);
    });

    it('returns false if dynamic require throws', async () => {
      shouldThrowOnRequire = true;
      expect(isVoiceAvailable()).toBe(false);
    });

    it('returns true on subsequent calls when already loaded (cache hit)', () => {
      expect(isVoiceAvailable()).toBe(true);
      expect(isVoiceAvailable()).toBe(true);
    });
  });

  describe('ensureMicPermission', () => {
    it('returns false on web platform', async () => {
      Platform.OS = 'web';
      const granted = await ensureMicPermission();
      expect(granted).toBe(false);
    });

    it('returns true when mic permission is granted on native', async () => {
      const granted = await ensureMicPermission();
      expect(granted).toBe(true);
      expect(mockAudio.requestRecordingPermissionsAsync).toHaveBeenCalled();
    });

    it('returns false when mic permission is denied on native', async () => {
      mockAudio.requestRecordingPermissionsAsync.mockResolvedValue({ granted: false });
      const granted = await ensureMicPermission();
      expect(granted).toBe(false);
    });

    it('returns false when request throws an error', async () => {
      mockAudio.requestRecordingPermissionsAsync.mockRejectedValue(new Error('Permission check crashed'));
      const granted = await ensureMicPermission();
      expect(granted).toBe(false);
    });
  });

  describe('startRecording', () => {
    it('throws error on web platform', async () => {
      Platform.OS = 'web';
      await expect(startRecording()).rejects.toThrow('Voice capture is not available on this device.');
    });

    it('successfully starts a recording and returns controls on native', async () => {
      const recorder = await startRecording();
      expect(mockAudioRecorderInstance).not.toBeNull();
      expect(mockAudioRecorderInstance.prepareToRecordAsync).toHaveBeenCalled();
      expect(mockAudioRecorderInstance.record).toHaveBeenCalled();

      // stopAndTranscribe success path
      mockQvac.runTranscription.mockResolvedValue('transcribed text');
      const text = await recorder.stopAndTranscribe();
      expect(text).toBe('transcribed text');
      expect(mockAudioRecorderInstance.stop).toHaveBeenCalled();
      expect(mockQvac.runTranscription).toHaveBeenCalledWith({ audioChunk: 'file:///tmp/mock-voice.wav' });
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith('file:///tmp/mock-voice.wav', { idempotent: true });
    });

    it('stopAndTranscribe throws if uri is null (no audio recorded)', async () => {
      const recorder = await startRecording();
      mockAudioRecorderInstance.uri = null;

      await expect(recorder.stopAndTranscribe()).rejects.toThrow('No audio was recorded.');
      expect(mockAudioRecorderInstance.stop).toHaveBeenCalled();
      // file delete should not be called if uri is null
      expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
    });

    it('stopAndTranscribe deletes file even if transcription throws', async () => {
      const recorder = await startRecording();
      mockQvac.runTranscription.mockRejectedValue(new Error('Whisper failed'));

      await expect(recorder.stopAndTranscribe()).rejects.toThrow('Whisper failed');
      expect(mockAudioRecorderInstance.stop).toHaveBeenCalled();
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith('file:///tmp/mock-voice.wav', { idempotent: true });
    });

    it('stopAndTranscribe ignores cleanup/delete file errors', async () => {
      const recorder = await startRecording();
      mockFileSystem.deleteAsync.mockRejectedValue(new Error('Delete file failed'));

      await expect(recorder.stopAndTranscribe()).resolves.not.toThrow();
      expect(mockAudioRecorderInstance.stop).toHaveBeenCalled();
      expect(mockFileSystem.deleteAsync).toHaveBeenCalled();
    });

    it('cancel stops the recording and cleans up the file', async () => {
      const recorder = await startRecording();
      await recorder.cancel();
      expect(mockAudioRecorderInstance.stop).toHaveBeenCalled();
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith('file:///tmp/mock-voice.wav', { idempotent: true });
    });

    it('cancel handles stop errors gracefully and still deletes the file', async () => {
      const recorder = await startRecording();
      mockAudioRecorderInstance.stop.mockRejectedValue(new Error('Already stopped'));

      await expect(recorder.cancel()).resolves.not.toThrow();
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith('file:///tmp/mock-voice.wav', { idempotent: true });
    });

    it('cancel handles null uri in cleanup', async () => {
      const recorder = await startRecording();
      mockAudioRecorderInstance.uri = null;
      await recorder.cancel();
      expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
    });

    it('uses fallback values when IOSOutputFormat or AudioQuality is missing', async () => {
      // Temporarily remove properties from the mock module
      const originalFormat = mockAudio.IOSOutputFormat;
      const originalQuality = mockAudio.AudioQuality;
      mockAudio.IOSOutputFormat = undefined as any;
      mockAudio.AudioQuality = undefined as any;

      try {
        const recorder = await startRecording();
        expect(recorder).toBeDefined();
      } finally {
        mockAudio.IOSOutputFormat = originalFormat;
        mockAudio.AudioQuality = originalQuality;
      }
    });
  });

  describe('speak', () => {
    it('throws error on web platform', async () => {
      Platform.OS = 'web';
      await expect(speak('hello')).rejects.toThrow('Audio playback is not available on this device.');
    });

    it('synthesizes text, writes WAV file, and plays it back on native (using global.btoa)', async () => {
      // Setup global.btoa mock
      (globalThis as any).btoa = vi.fn().mockReturnValue('mock-base64-string');

      // Mock runTextToSpeech returning a Buffer/Int16Array
      const mockSamples = new Int16Array([10, 20, 30]);
      mockQvac.runTextToSpeech.mockResolvedValue(mockSamples);

      const playSpy = vi.fn();
      mockAudio.createAudioPlayer.mockReturnValue({ play: playSpy });

      await speak('hello test');

      expect(mockQvac.runTextToSpeech).toHaveBeenCalledWith({ text: 'hello test' });
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        expect.stringContaining('beacon-tts-'),
        'mock-base64-string',
        { encoding: 'base64' }
      );
      expect(mockAudio.createAudioPlayer).toHaveBeenCalledWith(expect.stringContaining('beacon-tts-'));
      expect(playSpy).toHaveBeenCalled();
    });

    it('synthesizes text, writes WAV file, and plays it back on native (using Buffer fallback when btoa absent)', async () => {
      // Delete global.btoa
      delete (globalThis as any).btoa;

      // Mock runTextToSpeech returning raw ArrayBuffer inside an object
      const mockSamples = new Int16Array([100, 200]);
      mockQvac.runTextToSpeech.mockResolvedValue({ buffer: mockSamples.buffer, byteOffset: 0, byteLength: mockSamples.byteLength });

      const playSpy = vi.fn();
      mockAudio.createAudioPlayer.mockReturnValue({ play: playSpy });

      await speak('hello fallback');

      expect(mockQvac.runTextToSpeech).toHaveBeenCalledWith({ text: 'hello fallback' });
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      expect(mockAudio.createAudioPlayer).toHaveBeenCalled();
      expect(playSpy).toHaveBeenCalled();
    });

    it('synthesizes text, writes WAV file, and plays it back on native (using raw ArrayBuffer directly)', async () => {
      delete (globalThis as any).btoa;

      // Mock runTextToSpeech returning raw ArrayBuffer directly (no wrap object)
      const mockSamples = new Int16Array([5, 6]);
      mockQvac.runTextToSpeech.mockResolvedValue(mockSamples.buffer);

      const playSpy = vi.fn();
      mockAudio.createAudioPlayer.mockReturnValue({ play: playSpy });

      await speak('raw buffer test');

      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      expect(playSpy).toHaveBeenCalled();
    });
  });
});
