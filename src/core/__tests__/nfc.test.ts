import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Platform } from 'react-native';
import Module from 'module';

const mockNfcManager = {
  start: vi.fn(),
  isSupported: vi.fn(),
  requestTechnology: vi.fn(),
  getTag: vi.fn(),
  cancelTechnologyRequest: vi.fn(),
};

const mockNdef = {
  uri: {
    decodePayload: vi.fn(),
  },
  text: {
    decodePayload: vi.fn(),
  },
};

let shouldThrowOnRequire = false;

// Intercept CommonJS require at the Node.js level to bypass native module parsing entirely
const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === 'react-native-nfc-manager') {
    if (shouldThrowOnRequire) {
      throw new Error('NFC Manager module loading failed');
    }
    return {
      default: mockNfcManager,
      Ndef: mockNdef,
      NfcTech: {
        Ndef: 'Ndef',
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

describe('nfc.ts tests', () => {
  let isNfcAvailable: any;
  let readProviderKeyViaNfc: any;
  let cancelNfc: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    shouldThrowOnRequire = false;

    mockNfcManager.start.mockReset();
    mockNfcManager.isSupported.mockReset();
    mockNfcManager.requestTechnology.mockReset();
    mockNfcManager.getTag.mockReset();
    mockNfcManager.cancelTechnologyRequest.mockReset();
    
    mockNdef.uri.decodePayload.mockReset();
    mockNdef.text.decodePayload.mockReset();

    // Setup default mock values
    mockNfcManager.start.mockResolvedValue(undefined);
    mockNfcManager.isSupported.mockResolvedValue(true);
    mockNfcManager.requestTechnology.mockResolvedValue(undefined);
    mockNfcManager.cancelTechnologyRequest.mockResolvedValue(undefined);

    Platform.OS = 'ios';

    // Dynamically import the module to get fresh module-level state (mod = null)
    const nfcModule = await import('../nfc');
    isNfcAvailable = nfcModule.isNfcAvailable;
    readProviderKeyViaNfc = nfcModule.readProviderKeyViaNfc;
    cancelNfc = nfcModule.cancelNfc;
  });

  afterAll(() => {
    // Restore original loader
    (Module as any)._load = originalLoad;
  });

  describe('isNfcAvailable', () => {
    it('returns false on web platform', async () => {
      Platform.OS = 'web';
      const available = await isNfcAvailable();
      expect(available).toBe(false);
      expect(mockNfcManager.start).not.toHaveBeenCalled();
    });

    it('returns true when NFC is supported on native', async () => {
      mockNfcManager.isSupported.mockResolvedValue(true);
      const available = await isNfcAvailable();
      expect(available).toBe(true);
      expect(mockNfcManager.start).toHaveBeenCalled();
      expect(mockNfcManager.isSupported).toHaveBeenCalled();
    });

    it('returns false when NFC is not supported on native', async () => {
      mockNfcManager.isSupported.mockResolvedValue(false);
      const available = await isNfcAvailable();
      expect(available).toBe(false);
    });

    it('returns false when starting or supporting check throws', async () => {
      mockNfcManager.start.mockRejectedValue(new Error('NFC failed to start'));
      const available = await isNfcAvailable();
      expect(available).toBe(false);
    });

    it('returns false when require throws an error (load fails)', async () => {
      shouldThrowOnRequire = true;
      const available = await isNfcAvailable();
      expect(available).toBe(false);
    });
  });

  describe('readProviderKeyViaNfc', () => {
    it('throws error on web platform', async () => {
      Platform.OS = 'web';
      await expect(readProviderKeyViaNfc()).rejects.toThrow('NFC is not available on this device.');
    });

    it('returns hex key when valid tag with URI payload is scanned', async () => {
      const validKey = 'a'.repeat(64);
      mockNfcManager.getTag.mockResolvedValue({
        ndefMessage: [
          { payload: [1, 2, 3] },
        ],
      });
      mockNdef.uri.decodePayload.mockReturnValue(`beacon://pair?key=${validKey}`);

      const key = await readProviderKeyViaNfc();
      expect(key).toBe(validKey);
      expect(mockNfcManager.start).toHaveBeenCalled();
      expect(mockNfcManager.requestTechnology).toHaveBeenCalledWith('Ndef');
      expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalled();
    });

    it('returns hex key when valid tag with URI payload is scanned (non-array payload)', async () => {
      const validKey = 'a'.repeat(64);
      mockNfcManager.getTag.mockResolvedValue({
        ndefMessage: [
          { payload: new Uint8Array([1, 2, 3]) },
        ],
      });
      mockNdef.uri.decodePayload.mockReturnValue(`beacon://pair?key=${validKey}`);

      const key = await readProviderKeyViaNfc();
      expect(key).toBe(validKey);
    });

    it('returns hex key when valid tag with Text payload is scanned', async () => {
      const validKey = 'b'.repeat(64);
      mockNfcManager.getTag.mockResolvedValue({
        ndefMessage: [
          { payload: [4, 5, 6] },
        ],
      });
      // URI decode throws/fails first, text decode succeeds
      mockNdef.uri.decodePayload.mockImplementation(() => { throw new Error('Not URI'); });
      mockNdef.text.decodePayload.mockReturnValue(`beacon://pair?key=${validKey}`);

      const key = await readProviderKeyViaNfc();
      expect(key).toBe(validKey);
      expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalled();
    });

    it('returns null when scanned tag has empty payload or empty NDEF message', async () => {
      mockNfcManager.getTag.mockResolvedValue({ ndefMessage: [] });
      const key1 = await readProviderKeyViaNfc();
      expect(key1).toBeNull();

      mockNfcManager.getTag.mockResolvedValue({
        ndefMessage: [
          { payload: [] }
        ]
      });
      const key2 = await readProviderKeyViaNfc();
      expect(key2).toBeNull();

      // tag is null
      mockNfcManager.getTag.mockResolvedValue(null);
      const key3 = await readProviderKeyViaNfc();
      expect(key3).toBeNull();

      // ndefMessage is undefined
      mockNfcManager.getTag.mockResolvedValue({ ndefMessage: undefined });
      const key4 = await readProviderKeyViaNfc();
      expect(key4).toBeNull();

      // payload is undefined
      mockNfcManager.getTag.mockResolvedValue({
        ndefMessage: [
          { payload: undefined }
        ]
      });
      const key5 = await readProviderKeyViaNfc();
      expect(key5).toBeNull();
    });

    it('returns null when decoded payloads are not valid keys', async () => {
      mockNfcManager.getTag.mockResolvedValue({
        ndefMessage: [
          { payload: [1] }
        ]
      });
      mockNdef.uri.decodePayload.mockReturnValue('invalid-payload');
      mockNdef.text.decodePayload.mockReturnValue('invalid-text');

      const key = await readProviderKeyViaNfc();
      expect(key).toBeNull();
    });

    it('returns null when both URI and text decoding return null or throw', async () => {
      mockNfcManager.getTag.mockResolvedValue({
        ndefMessage: [
          { payload: [1, 2, 3] },
        ],
      });
      // Both return null
      mockNdef.uri.decodePayload.mockReturnValue(null);
      mockNdef.text.decodePayload.mockReturnValue(null);

      const key = await readProviderKeyViaNfc();
      expect(key).toBeNull();

      // Both throw
      mockNdef.uri.decodePayload.mockImplementation(() => { throw new Error('uri error'); });
      mockNdef.text.decodePayload.mockImplementation(() => { throw new Error('text error'); });

      const key2 = await readProviderKeyViaNfc();
      expect(key2).toBeNull();
    });

    it('propagates error and cancels technology request if tag fetch throws', async () => {
      mockNfcManager.getTag.mockRejectedValue(new Error('Tag scan timeout'));
      await expect(readProviderKeyViaNfc()).rejects.toThrow('Tag scan timeout');
      expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalled();
    });

    it('ignores errors during cancelTechnologyRequest in finally block', async () => {
      mockNfcManager.getTag.mockRejectedValue(new Error('Tag scan timeout'));
      mockNfcManager.cancelTechnologyRequest.mockRejectedValue(new Error('Cancel failed'));
      await expect(readProviderKeyViaNfc()).rejects.toThrow('Tag scan timeout');
    });
  });

  describe('cancelNfc', () => {
    it('does nothing on web platform', async () => {
      Platform.OS = 'web';
      await cancelNfc();
      expect(mockNfcManager.cancelTechnologyRequest).not.toHaveBeenCalled();
    });

    it('calls cancelTechnologyRequest on native platform', async () => {
      await cancelNfc();
      expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalled();
    });

    it('ignores errors in cancelTechnologyRequest', async () => {
      mockNfcManager.cancelTechnologyRequest.mockRejectedValue(new Error('Cancel failed'));
      await expect(cancelNfc()).resolves.not.toThrow();
    });
  });
});
