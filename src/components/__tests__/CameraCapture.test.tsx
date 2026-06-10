import { describe, it, expect, vi, beforeEach } from 'vitest';
import { View, TouchableOpacity, Platform } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import CameraCapture from '../CameraCapture';
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
  const TouchableOpacityComponent = ({ children, style, onPress, disabled }: any) => ({ type: 'TouchableOpacity', props: { style, onPress, disabled, children } });
  const ModalComponent = ({ children, visible, onRequestClose }: any) => ({ type: 'Modal', props: { visible, onRequestClose, children } });
  const ImageComponent = ({ source, style }: any) => ({ type: 'Image', props: { source, style } });
  const ActivityIndicatorComponent = ({ color }: any) => ({ type: 'ActivityIndicator', props: { color } });

  const StyleSheet = {
    create: (s: any) => s,
    absoluteFill: 'absoluteFill',
  };

  return {
    View: ViewComponent,
    Text: TextComponent,
    TouchableOpacity: TouchableOpacityComponent,
    Modal: ModalComponent,
    Image: ImageComponent,
    ActivityIndicator: ActivityIndicatorComponent,
    StyleSheet,
    Platform: {
      OS: 'ios',
    },
  };
});

// Mock expo-camera
vi.mock('expo-camera', () => {
  const CameraViewComponent = ({ children, style }: any) => ({ type: 'CameraView', props: { style, children } });
  const mockRequestPermission = vi.fn();
  const useCameraPermissionsMock = vi.fn().mockReturnValue([{ granted: true }, mockRequestPermission]);
  return {
    CameraView: CameraViewComponent,
    useCameraPermissions: useCameraPermissionsMock,
  };
});

describe('CameraCapture.tsx tests', () => {
  let reactMock: ReturnType<typeof createReactHookMock>;
  const mockOnClose = vi.fn();
  const mockOnCapture = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    reactMock = createReactHookMock();
    currentUseState = reactMock.useState;
    currentUseEffect = reactMock.useEffect;
    currentUseRef = reactMock.useRef;
    Platform.OS = 'ios';
    vi.mocked(useCameraPermissions).mockReturnValue([{ granted: true } as any, vi.fn()]);
    vi.useFakeTimers();
  });

  it('renders correctly and requests camera permission if not granted', () => {
    const mockRequest = vi.fn();
    vi.mocked(useCameraPermissions).mockReturnValue([{ granted: false } as any, mockRequest]);

    reactMock.init(CameraCapture, { visible: true, onClose: mockOnClose, onCapture: mockOnCapture });
    reactMock.runEffects();

    expect(mockRequest).toHaveBeenCalled();
  });

  it('does not request permission if not visible', () => {
    const mockRequest = vi.fn();
    vi.mocked(useCameraPermissions).mockReturnValue([{ granted: false } as any, mockRequest]);

    reactMock.init(CameraCapture, { visible: false, onClose: mockOnClose, onCapture: mockOnCapture });
    reactMock.runEffects();

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('handles shoot callback successfully and triggers state change', async () => {
    reactMock.init(CameraCapture, { visible: true, onClose: mockOnClose, onCapture: mockOnCapture });
    reactMock.runEffects();

    const mockTakePicture = vi.fn().mockResolvedValue({ uri: 'ph-123' });
    reactMock.refs[0].current = { takePictureAsync: mockTakePicture };

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const shutter = sheet.props.children[3]; // Shutter button is at index 3

    expect(shutter.type).toBe(TouchableOpacity);

    // Call shutter press
    shutter.props.onPress();
    expect(reactMock.stateValues[1]).toBe(true); // busy state (index 1) is true

    // Wait for promise
    await vi.runAllTimersAsync();

    expect(mockTakePicture).toHaveBeenCalledWith({ quality: 0.6 });
    expect(reactMock.stateValues[0]).toBe('ph-123'); // photoUri (index 0) is set
    expect(reactMock.stateValues[1]).toBe(false); // busy state (index 1) resets to false
  });

  it('handles shoot callback failing gracefully without setting photoUri', async () => {
    reactMock.init(CameraCapture, { visible: true, onClose: mockOnClose, onCapture: mockOnCapture });
    reactMock.runEffects();

    const mockTakePicture = vi.fn().mockRejectedValue(new Error('Capture failed'));
    reactMock.refs[0].current = { takePictureAsync: mockTakePicture };

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const shutter = sheet.props.children[3];

    shutter.props.onPress();
    await vi.runAllTimersAsync();

    expect(reactMock.stateValues[0]).toBeNull(); // photoUri remains null
    expect(reactMock.stateValues[1]).toBe(false); // busy is false
  });

  it('handles shoot callback returning null without setting photoUri', async () => {
    reactMock.init(CameraCapture, { visible: true, onClose: mockOnClose, onCapture: mockOnCapture });
    reactMock.runEffects();

    const mockTakePicture = vi.fn().mockResolvedValue(null);
    reactMock.refs[0].current = { takePictureAsync: mockTakePicture };

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const shutter = sheet.props.children[3];

    shutter.props.onPress();
    await vi.runAllTimersAsync();

    expect(reactMock.stateValues[0]).toBeNull(); // photoUri remains null
    expect(reactMock.stateValues[1]).toBe(false); // busy is false
  });

  it('does not call takePictureAsync if ref is not set or busy is true', async () => {
    reactMock.init(CameraCapture, { visible: true, onClose: mockOnClose, onCapture: mockOnCapture });
    reactMock.runEffects();

    // Set busy state to true
    reactMock.stateSetters[1](true);

    const mockTakePicture = vi.fn();
    reactMock.refs[0].current = { takePictureAsync: mockTakePicture };

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const shutter = sheet.props.children[3];

    shutter.props.onPress();
    await vi.runAllTimersAsync();

    expect(mockTakePicture).not.toHaveBeenCalled();
  });

  it('allows retaking the photo', () => {
    reactMock.init(CameraCapture, { visible: true, onClose: mockOnClose, onCapture: mockOnCapture });
    reactMock.runEffects();

    // Mock photo uri is set (index 0)
    reactMock.stateSetters[0]('ph-123');

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const row = sheet.props.children[3]; // Row with retake/use is index 3 when photoUri is truthy
    const retakeBtn = row.props.children[0];

    expect(retakeBtn.type).toBe(TouchableOpacity);
    retakeBtn.props.onPress();

    expect(reactMock.stateValues[0]).toBeNull(); // photoUri is reset to null
  });

  it('allows using the photo and calls onCapture', () => {
    reactMock.init(CameraCapture, { visible: true, onClose: mockOnClose, onCapture: mockOnCapture });
    reactMock.runEffects();

    reactMock.stateSetters[0]('ph-123');

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const row = sheet.props.children[3];
    const useBtn = row.props.children[1];

    expect(useBtn.type).toBe(TouchableOpacity);
    useBtn.props.onPress();

    expect(mockOnCapture).toHaveBeenCalledWith('ph-123');
  });

  it('renders web unsupported fallback UI', () => {
    Platform.OS = 'web';
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    reactMock.init(CameraCapture, { visible: true, onClose: mockOnClose, onCapture: mockOnCapture });

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const stage = sheet.props.children[2];
    const fallbackView = stage.props.children[0];

    expect(fallbackView.type).toBe(View);
    expect(fallbackView.props.children[1].props.children).toBe('Camera capture is unavailable here.');

    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('renders normal fallback UI and allows requesting permissions', () => {
    const mockRequest = vi.fn();
    vi.mocked(useCameraPermissions).mockReturnValue([{ granted: false } as any, mockRequest]);

    reactMock.init(CameraCapture, { visible: true, onClose: mockOnClose, onCapture: mockOnCapture });

    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const stage = sheet.props.children[2];
    const fallbackView = stage.props.children[0];
    const grantBtn = fallbackView.props.children[2];

    grantBtn.props.onPress();
    expect(mockRequest).toHaveBeenCalled();
  });

  it('triggers onClose when close button is pressed', () => {
    reactMock.init(CameraCapture, { visible: true, onClose: mockOnClose, onCapture: mockOnCapture });
    const modalContent = reactMock.element;
    const backdrop = modalContent.props.children;
    const sheet = backdrop.props.children;
    const headerRow = sheet.props.children[0];
    const closeBtn = headerRow.props.children[1];

    closeBtn.props.onPress();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('resets photoUri and busy state when visibility changes from false to true, and handles toggling to false', () => {
    reactMock.init(CameraCapture, { visible: false, onClose: mockOnClose, onCapture: mockOnCapture });

    // Toggle visible to true
    reactMock.rerender({ visible: true, onClose: mockOnClose, onCapture: mockOnCapture });
    expect(reactMock.stateValues[0]).toBeNull(); // photoUri (index 0)
    expect(reactMock.stateValues[1]).toBe(false); // busy (index 1)

    // Toggle visible to false
    reactMock.rerender({ visible: false, onClose: mockOnClose, onCapture: mockOnCapture });
  });
});
