import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TouchableOpacity, Animated } from 'react-native';
import NfcPairModal from '../NfcPairModal';
import { readProviderKeyViaNfc, cancelNfc } from '../../core/nfc';
import { createReactHookMock } from './testHelper';

let currentUseState: any = null;
let currentUseEffect: any = null;
let currentUseRef: any = null;

// Mock react BEFORE importing the component
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (init: any) => currentUseState ? currentUseState(init) : actual.useState(init),
    useEffect: (eff: any, deps: any) => currentUseEffect ? currentUseEffect(eff, deps) : actual.useEffect(eff, deps),
    useRef: (init: any) => currentUseRef ? currentUseRef(init) : actual.useRef(init),
  };
});

vi.mock('react-native', () => {
  const ViewComponent = ({ children, style }: any) => ({ type: 'View', props: { style, children } });
  const TextComponent = ({ children, style }: any) => ({ type: 'Text', props: { style, children } });
  const TouchableOpacityComponent = ({ children, style, onPress }: any) => ({ type: 'TouchableOpacity', props: { style, onPress, children } });
  const ModalComponent = ({ children, visible, onRequestClose }: any) => ({ type: 'Modal', props: { visible, onRequestClose, children } });

  const AnimatedValue = class {
    interpolate = vi.fn().mockReturnValue('interpolated-style');
  };

  const StyleSheet = {
    create: (s: any) => s,
  };

  const Easing = {
    out: vi.fn(),
    ease: 'ease',
  };

  const mockStart = vi.fn();
  const mockStop = vi.fn();
  const mockLoop = vi.fn().mockReturnValue({ start: mockStart, stop: mockStop });
  const mockSequence = vi.fn();
  const mockDelay = vi.fn();
  const mockTiming = vi.fn();

  return {
    View: ViewComponent,
    Text: TextComponent,
    TouchableOpacity: TouchableOpacityComponent,
    Modal: ModalComponent,
    Animated: {
      Value: AnimatedValue,
      loop: mockLoop,
      sequence: mockSequence,
      delay: mockDelay,
      timing: mockTiming,
    },
    Easing,
    StyleSheet,
  };
});

// Mock core NFC functions
vi.mock('../../core/nfc', () => ({
  readProviderKeyViaNfc: vi.fn(),
  cancelNfc: vi.fn(),
}));

describe('NfcPairModal.tsx tests', () => {
  let reactMock: ReturnType<typeof createReactHookMock>;
  const mockOnClose = vi.fn();
  const mockOnScan = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    reactMock = createReactHookMock();
    currentUseState = reactMock.useState;
    currentUseEffect = reactMock.useEffect;
    currentUseRef = reactMock.useRef;
    vi.useFakeTimers();
  });

  it('does not render/activate NFC when visible is false', async () => {
    reactMock.init(NfcPairModal, { visible: false, onClose: mockOnClose, onScan: mockOnScan });
    reactMock.runEffects();

    expect(readProviderKeyViaNfc).not.toHaveBeenCalled();
    expect(Animated.loop).not.toHaveBeenCalled();
  });

  it('starts animations and reads NFC when visible is true', async () => {
    vi.mocked(readProviderKeyViaNfc).mockResolvedValue('a'.repeat(64));

    reactMock.init(NfcPairModal, { visible: true, onClose: mockOnClose, onScan: mockOnScan });
    reactMock.runEffects();

    // Verify animations started
    expect(Animated.loop).toHaveBeenCalledTimes(2);
    const loopResult = vi.mocked(Animated.loop).mock.results[0].value;
    expect(loopResult.start).toHaveBeenCalled();

    // Verify NFC scanner starts
    expect(readProviderKeyViaNfc).toHaveBeenCalled();

    // Fast-forward promises
    await vi.runAllTimersAsync();

    // Verify state transition to 'found' and scan success called
    expect(reactMock.stateValues[0]).toBe('found'); // state is 'found'
    expect(mockOnScan).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('handles empty NFC key scanned (falsy key returns null)', async () => {
    vi.mocked(readProviderKeyViaNfc).mockResolvedValue(null);

    reactMock.init(NfcPairModal, { visible: true, onClose: mockOnClose, onScan: mockOnScan });
    reactMock.runEffects();

    await vi.runAllTimersAsync();

    expect(reactMock.stateValues[0]).toBe('error'); // state is 'error'
    expect(reactMock.stateValues[1]).toBe('That tag had no valid uplink key.'); // message
  });

  it('handles NFC read error exception', async () => {
    vi.mocked(readProviderKeyViaNfc).mockRejectedValue(new Error('Device error occurred'));

    reactMock.init(NfcPairModal, { visible: true, onClose: mockOnClose, onScan: mockOnScan });
    reactMock.runEffects();

    await vi.runAllTimersAsync();

    expect(reactMock.stateValues[0]).toBe('error');
    expect(reactMock.stateValues[1]).toBe('Device error occurred');
  });

  it('handles NFC read error string exception', async () => {
    vi.mocked(readProviderKeyViaNfc).mockRejectedValue('Read timeout');

    reactMock.init(NfcPairModal, { visible: true, onClose: mockOnClose, onScan: mockOnScan });
    reactMock.runEffects();

    await vi.runAllTimersAsync();

    expect(reactMock.stateValues[0]).toBe('error');
    expect(reactMock.stateValues[1]).toBe('NFC read failed.');
  });

  it('allows retrying after tap failure', async () => {
    vi.mocked(readProviderKeyViaNfc).mockRejectedValue(new Error('NFC Failed'));

    reactMock.init(NfcPairModal, { visible: true, onClose: mockOnClose, onScan: mockOnScan });
    reactMock.runEffects();
    await vi.runAllTimersAsync();

    expect(reactMock.stateValues[0]).toBe('error');

    // Retrieve retry button and trigger onPress
    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const retryBtn = sheet.props.children[4]; // inside the sheet, after headerRow, stage, status, sub
    expect(retryBtn.type).toBe(TouchableOpacity);

    // Call retry
    retryBtn.props.onPress();
    expect(reactMock.stateValues[0]).toBe('waiting');
  });

  it('triggers onClose when close button is pressed', () => {
    reactMock.init(NfcPairModal, { visible: true, onClose: mockOnClose, onScan: mockOnScan });
    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const headerRow = sheet.props.children[0];
    const closeBtn = headerRow.props.children[1];
    
    closeBtn.props.onPress();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('cancels NFC and stops animations when unmounted', () => {
    reactMock.init(NfcPairModal, { visible: true, onClose: mockOnClose, onScan: mockOnScan });
    reactMock.runEffects();

    reactMock.unmount();
    const loopResult = vi.mocked(Animated.loop).mock.results[0].value;
    expect(loopResult.stop).toHaveBeenCalled();
    expect(cancelNfc).toHaveBeenCalled();
  });

  it('resets state when visibility changes from false to true, and handles toggling to false', () => {
    reactMock.init(NfcPairModal, { visible: false, onClose: mockOnClose, onScan: mockOnScan });
    
    // Toggle visible to true
    reactMock.rerender({ visible: true, onClose: mockOnClose, onScan: mockOnScan });
    expect(reactMock.stateValues[0]).toBe('waiting');
    expect(reactMock.stateValues[1]).toBe('');

    // Toggle visible to false
    reactMock.rerender({ visible: false, onClose: mockOnClose, onScan: mockOnScan });
  });

  it('does not call onScan if unmounted before timeout', async () => {
    vi.mocked(readProviderKeyViaNfc).mockResolvedValue('key123');
    reactMock.init(NfcPairModal, { visible: true, onClose: mockOnClose, onScan: mockOnScan });
    reactMock.runEffects();

    // Run the readProviderKeyViaNfc promise resolution
    await vi.advanceTimersByTimeAsync(1);

    // Unmount before the 500ms timeout
    reactMock.unmount();

    // Advance 500ms
    await vi.advanceTimersByTimeAsync(500);

    expect(mockOnScan).not.toHaveBeenCalled();
  });

  it('returns early if unmounted before readProviderKeyViaNfc resolves', async () => {
    let resolveNfc: any;
    const nfcPromise = new Promise<string | null>((resolve) => { resolveNfc = resolve; });
    vi.mocked(readProviderKeyViaNfc).mockReturnValueOnce(nfcPromise);

    reactMock.init(NfcPairModal, { visible: true, onClose: mockOnClose, onScan: mockOnScan });
    reactMock.runEffects();

    // Now unmount before resolving
    reactMock.unmount();

    // Resolve the promise
    resolveNfc('some-key');
    await vi.runAllTimersAsync();

    // Verify no state changes to 'found'
    expect(reactMock.stateValues[0]).toBe('waiting');
  });
});
