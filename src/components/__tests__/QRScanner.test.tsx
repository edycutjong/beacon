import { describe, it, expect, beforeEach, vi } from 'vitest';
import { View, Animated, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRScanner from '../QRScanner';
import { extractProviderKey } from '../../core/pairingLink';
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
  const TextComponent = ({ children, style, onPress }: any) => ({ type: 'Text', props: { style, onPress, children } });
  const TouchableOpacityComponent = ({ children, style, onPress }: any) => ({ type: 'TouchableOpacity', props: { style, onPress, children } });
  const ModalComponent = ({ children, visible, onRequestClose }: any) => ({ type: 'Modal', props: { visible, onRequestClose, children } });

  const AnimatedValue = class {
    interpolate = vi.fn().mockReturnValue('interpolated-style');
  };

  const StyleSheet = {
    create: (s: any) => s,
    absoluteFill: 'absoluteFill',
  };

  const Easing = {
    inOut: vi.fn(),
    ease: 'ease',
  };

  const mockStart = vi.fn();
  const mockStop = vi.fn();
  const mockLoop = vi.fn().mockReturnValue({ start: mockStart, stop: mockStop });
  const mockSequence = vi.fn();
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
      timing: mockTiming,
    },
    Easing,
    StyleSheet,
    Platform: {
      OS: 'ios',
    },
  };
});

// Mock expo-camera
vi.mock('expo-camera', () => {
  const CameraViewComponent = ({ children, style, onBarcodeScanned }: any) => ({ type: 'CameraView', props: { style, onBarcodeScanned, children } });
  const mockRequestPermission = vi.fn();
  const useCameraPermissionsMock = vi.fn().mockReturnValue([{ granted: true }, mockRequestPermission]);
  return {
    CameraView: CameraViewComponent,
    useCameraPermissions: useCameraPermissionsMock,
  };
});

// Mock pairingLink
vi.mock('../../core/pairingLink', () => ({
  extractProviderKey: vi.fn(),
}));

describe('QRScanner.tsx tests', () => {
  let reactMock: ReturnType<typeof createReactHookMock>;
  const mockOnClose = vi.fn();
  const mockOnScan = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    reactMock = createReactHookMock();
    currentUseState = reactMock.useState;
    currentUseEffect = reactMock.useEffect;
    currentUseRef = reactMock.useRef;
    Platform.OS = 'ios';
    vi.mocked(useCameraPermissions).mockReturnValue([{ granted: true } as any, vi.fn()]);
  });

  it('renders correctly and requests camera permission if not granted', () => {
    const mockRequest = vi.fn();
    vi.mocked(useCameraPermissions).mockReturnValue([{ granted: false } as any, mockRequest]);

    reactMock.init(QRScanner, { visible: true, onClose: mockOnClose, onScan: mockOnScan });
    reactMock.runEffects();

    expect(mockRequest).toHaveBeenCalled();
    expect(Animated.loop).toHaveBeenCalled();
  });

  it('stops animation loop on unmount', () => {
    reactMock.init(QRScanner, { visible: true, onClose: mockOnClose, onScan: mockOnScan });
    reactMock.runEffects();

    reactMock.unmount();
    const loopResult = vi.mocked(Animated.loop).mock.results[0].value;
    expect(loopResult.stop).toHaveBeenCalled();
  });

  it('does not request permission or start animation loop if not visible', () => {
    const mockRequest = vi.fn();
    vi.mocked(useCameraPermissions).mockReturnValue([{ granted: false } as any, mockRequest]);

    reactMock.init(QRScanner, { visible: false, onClose: mockOnClose, onScan: mockOnScan });
    reactMock.runEffects();

    expect(mockRequest).not.toHaveBeenCalled();
    expect(Animated.loop).not.toHaveBeenCalled();
  });

  it('handles scan callback with valid key', () => {
    vi.mocked(extractProviderKey).mockReturnValue('valid-key-123');
    reactMock.init(QRScanner, { visible: true, onClose: mockOnClose, onScan: mockOnScan });

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const cameraWrap = sheet.props.children[2];
    const cameraView = cameraWrap.props.children[0];

    // Trigger onBarcodeScanned
    cameraView.props.onBarcodeScanned({ data: 'http://beacon/pair?key=valid-key-123' });

    expect(extractProviderKey).toHaveBeenCalledWith('http://beacon/pair?key=valid-key-123');
    expect(reactMock.stateValues[0]).toBe(true); // scanned state
    expect(mockOnScan).toHaveBeenCalledWith('valid-key-123');
  });

  it('handles scan callback with invalid key', () => {
    vi.mocked(extractProviderKey).mockReturnValue(null);
    reactMock.init(QRScanner, { visible: true, onClose: mockOnClose, onScan: mockOnScan });

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const cameraWrap = sheet.props.children[2];
    const cameraView = cameraWrap.props.children[0];

    // Trigger onBarcodeScanned
    cameraView.props.onBarcodeScanned({ data: 'invalid-data' });

    expect(extractProviderKey).toHaveBeenCalledWith('invalid-data');
    expect(reactMock.stateValues[0]).toBe(false); // scanned state is false
    expect(reactMock.stateValues[1]).toBe('No valid 64-char uplink key found in this code.'); // error message
  });

  it('does not scan again if already scanned', () => {
    vi.mocked(extractProviderKey).mockReturnValue('key-123');
    reactMock.init(QRScanner, { visible: true, onClose: mockOnClose, onScan: mockOnScan });

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const cameraWrap = sheet.props.children[2];
    const cameraView = cameraWrap.props.children[0];

    // First scan (succeeds)
    cameraView.props.onBarcodeScanned({ data: 'valid-data' });
    expect(mockOnScan).toHaveBeenCalledTimes(1);

    // Verify that onBarcodeScanned is now undefined on the newly rendered CameraView
    const freshContent = reactMock.element;
    const freshBackdrop = freshContent.props.children;
    const freshSheet = freshBackdrop.props.children;
    const freshCameraWrap = freshSheet.props.children[2];
    const freshCameraView = freshCameraWrap.props.children[0];
    expect(freshCameraView.props.onBarcodeScanned).toBeUndefined();
  });

  it('shows fallback UI if platform is web and mediaDevices is unsupported', () => {
    Platform.OS = 'web';
    // Mock navigator.mediaDevices as undefined
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    reactMock.init(QRScanner, { visible: true, onClose: mockOnClose, onScan: mockOnScan });

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const cameraWrap = sheet.props.children[2];
    const fallbackView = cameraWrap.props.children[0];

    expect(fallbackView.type).toBe(View);
    expect(fallbackView.props.children[1].props.children).toBe('Camera scanning is unavailable here — paste the key manually instead.');

    // Restore original navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('shows scanner UI on web if mediaDevices is supported', () => {
    Platform.OS = 'web';
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: {} },
      writable: true,
      configurable: true,
    });

    reactMock.init(QRScanner, { visible: true, onClose: mockOnClose, onScan: mockOnScan });

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const cameraWrap = sheet.props.children[2];
    const cameraView = cameraWrap.props.children[0];

    expect(cameraView.type).toBe(CameraView);

    // Restore original navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('shows normal fallback UI if permissions not granted on native', () => {
    vi.mocked(useCameraPermissions).mockReturnValue([{ granted: false } as any, vi.fn()]);

    reactMock.init(QRScanner, { visible: true, onClose: mockOnClose, onScan: mockOnScan });

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const cameraWrap = sheet.props.children[2];
    const fallbackView = cameraWrap.props.children[0];

    expect(fallbackView.type).toBe(View);
    expect(fallbackView.props.children[1].props.children).toBe('Camera access is required to scan the uplink code.');
  });

  it('triggers onClose when close button is pressed', () => {
    reactMock.init(QRScanner, { visible: true, onClose: mockOnClose, onScan: mockOnScan });
    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const headerRow = sheet.props.children[0];
    const closeBtn = headerRow.props.children[1];

    closeBtn.props.onPress();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('triggers permission request when GRANT CAMERA ACCESS is clicked on native fallback UI', () => {
    const mockRequest = vi.fn();
    vi.mocked(useCameraPermissions).mockReturnValue([{ granted: false } as any, mockRequest]);

    reactMock.init(QRScanner, { visible: true, onClose: mockOnClose, onScan: mockOnScan });

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const cameraWrap = sheet.props.children[2];
    const fallbackView = cameraWrap.props.children[0];
    const grantBtn = fallbackView.props.children[2];

    grantBtn.props.onPress();
    expect(mockRequest).toHaveBeenCalled();
  });

  it('resets scanned and error state when visibility changes from false to true, and handles toggling to false', () => {
    reactMock.init(QRScanner, { visible: false, onClose: mockOnClose, onScan: mockOnScan });

    // Toggle visible to true
    reactMock.rerender({ visible: true, onClose: mockOnClose, onScan: mockOnScan });
    expect(reactMock.stateValues[0]).toBe(false); // scanned
    expect(reactMock.stateValues[1]).toBeNull(); // error

    // Toggle visible to false
    reactMock.rerender({ visible: false, onClose: mockOnClose, onScan: mockOnScan });
  });
});
