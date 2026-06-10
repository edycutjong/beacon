import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { startBeaconHost } from '../../core/p2p.ts';
import { buildPairingLink } from '../../core/pairingLink.ts';
import qrcode from 'qrcode-terminal';

// Mock the core dependencies before loading provider.ts
vi.mock('../../core/p2p.ts', () => ({
  startBeaconHost: vi.fn(),
}));

vi.mock('../../core/pairingLink.ts', () => ({
  buildPairingLink: vi.fn(),
}));

vi.mock('qrcode-terminal', () => ({
  default: {
    generate: vi.fn(),
  },
}));

describe('provider.ts CLI daemon tests', () => {
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.BEACON_TOPIC;
  });

  afterAll(() => {
    mockExit.mockRestore();
    mockLog.mockRestore();
    mockError.mockRestore();
  });

  it('boots successfully with default topic and prints QR code', async () => {
    vi.mocked(startBeaconHost).mockResolvedValue('mock-publicKey-success-123');
    vi.mocked(buildPairingLink).mockReturnValue('beacon://pair?key=mock-publicKey-success-123');

    // Import dynamically to run the top-level main() function
    await import('../provider.ts');

    // Yield to let the async main() run its microtask queue
    await new Promise((resolve) => process.nextTick(resolve));

    expect(startBeaconHost).toHaveBeenCalledWith('beacon-field-compute');
    expect(buildPairingLink).toHaveBeenCalledWith('mock-publicKey-success-123');
    expect(qrcode.generate).toHaveBeenCalledWith(
      'beacon://pair?key=mock-publicKey-success-123',
      { small: true }
    );
    expect(mockExit).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('P2P Provider successfully started'));
  });

  it('boots successfully with custom BEACON_TOPIC env variable', async () => {
    process.env.BEACON_TOPIC = 'custom-field-topic';
    vi.mocked(startBeaconHost).mockResolvedValue('mock-publicKey-custom-456');
    vi.mocked(buildPairingLink).mockReturnValue('beacon://pair?key=mock-publicKey-custom-456');

    await import('../provider.ts');
    await new Promise((resolve) => process.nextTick(resolve));

    expect(startBeaconHost).toHaveBeenCalledWith('custom-field-topic');
    expect(qrcode.generate).toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('exits with code 1 and logs error when starting fails', async () => {
    const errorMsg = 'DHT bootstrap failure';
    vi.mocked(startBeaconHost).mockRejectedValue(new Error(errorMsg));

    await import('../provider.ts');
    await new Promise((resolve) => process.nextTick(resolve));

    expect(startBeaconHost).toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledWith(
      '🔴 Failed to start Beacon P2P Provider:',
      expect.any(Error)
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
