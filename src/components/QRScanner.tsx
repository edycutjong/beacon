import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useState } from 'react';
import {
  Animated, Easing, Modal, Platform, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { extractProviderKey } from '../core/pairingLink';

const C = {
  bg: 'rgba(2, 6, 23, 0.97)',
  cyan: '#06b6d4',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  text: '#f8fafc',
  text2: '#94a3b8',
  border: '#1e293b',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onScan: (providerKey: string) => void;
}

const FRAME = 240;

export default function QRScanner({ visible, onClose, onScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use lazy initial state for stable Animated.Value to avoid ref-related rendering issues
  const [scanLine] = useState(() => new Animated.Value(0));

  const [prevVisible, setPrevVisible] = useState(() => visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setScanned(false);
      setError(null);
    }
  }

  useEffect(() => {
    if (visible) {
      if (permission && !permission.granted) {
        requestPermission();
      }
    }
  }, [visible, permission, requestPermission]);

  // Animated scan line sweeping the framing box.
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(scanLine, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, scanLine]);

  const handleScan = (data: string) => {
    const key = extractProviderKey(data);
    if (!key) {
      setError('No valid 64-char uplink key found in this code.');
      return;
    }
    setScanned(true);
    setError(null);
    onScan(key);
  };

  const translateY = scanLine.interpolate({ inputRange: [0, 1], outputRange: [8, FRAME - 8] });
  const webUnsupported = Platform.OS === 'web' && !('mediaDevices' in (globalThis.navigator ?? {}));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet}>
          <View style={st.headerRow}>
            <Text style={st.title}>◈ SCAN UPLINK CODE</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={st.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={st.subtitle}>Point at the provider&apos;s pairing QR to establish the mesh link.</Text>

          <View style={st.cameraWrap}>
            {permission?.granted && !webUnsupported ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={scanned ? undefined : (r) => handleScan(r.data)}
              />
            ) : (
              <View style={st.permFallback}>
                <Text style={st.permIcon}>📷</Text>
                <Text style={st.permText}>
                  {webUnsupported
                    ? 'Camera scanning is unavailable here — paste the key manually instead.'
                    : 'Camera access is required to scan the uplink code.'}
                </Text>
                {!webUnsupported && (
                  <TouchableOpacity style={st.permBtn} onPress={requestPermission}>
                    <Text style={st.permBtnText}>GRANT CAMERA ACCESS</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Framing reticle + animated scan line */}
            <View pointerEvents="none" style={st.reticle}>
              <View style={[st.corner, st.tl]} />
              <View style={[st.corner, st.tr]} />
              <View style={[st.corner, st.bl]} />
              <View style={[st.corner, st.br]} />
              {permission?.granted && !webUnsupported && (
                <Animated.View style={[st.scanLine, { transform: [{ translateY }] }]} />
              )}
              {scanned && (
                <View style={st.lockBadge}>
                  <Text style={st.lockText}>✓ KEY LOCKED</Text>
                </View>
              )}
            </View>
          </View>

          {error && <Text style={st.error}>⚠ {error}</Text>}

          <Text style={st.hint}>
            Tip: a provider exposes its key via{' '}
            <Text style={st.hintMono}>beacon://pair?key=…</Text>
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.bg, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0a101f', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: C.border, padding: 22, paddingBottom: 40,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '900', color: C.cyan, letterSpacing: 2, fontFamily: 'monospace' },
  close: { fontSize: 20, color: C.text2, fontWeight: '700' },
  subtitle: { fontSize: 12, color: C.text2, marginTop: 8, marginBottom: 18, lineHeight: 18 },

  cameraWrap: {
    width: '100%', aspectRatio: 1, maxHeight: 360, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#020617', alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },
  reticle: { position: 'absolute', width: FRAME, height: FRAME },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: C.cyan },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  scanLine: {
    position: 'absolute', left: 6, right: 6, height: 2, backgroundColor: C.cyan,
    boxShadow: `0px 0px 12px ${C.cyan}`,
  },
  lockBadge: {
    position: 'absolute', alignSelf: 'center', top: '45%',
    backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1, borderColor: C.green,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  lockText: { color: C.green, fontWeight: '800', fontFamily: 'monospace', letterSpacing: 1 },

  permFallback: { padding: 24, alignItems: 'center' },
  permIcon: { fontSize: 40, marginBottom: 12 },
  permText: { color: C.text2, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  permBtn: { backgroundColor: C.cyan, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12 },
  permBtnText: { color: '#020617', fontWeight: '900', fontSize: 12, letterSpacing: 1, fontFamily: 'monospace' },

  error: { color: C.amber, fontSize: 12, marginTop: 14, fontFamily: 'monospace' },
  hint: { color: C.text2, fontSize: 11, marginTop: 16, lineHeight: 16 },
  hintMono: { fontFamily: 'monospace', color: C.cyan },
});
