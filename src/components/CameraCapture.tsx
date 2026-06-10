import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Platform, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';

const C = {
  bg: 'rgba(2, 6, 23, 0.97)',
  sheet: '#0a101f',
  cyan: '#06b6d4',
  green: '#22c55e',
  red: '#ef4444',
  text: '#f8fafc',
  text2: '#94a3b8',
  border: '#1e293b',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onCapture: (uri: string) => void;
}

export default function CameraCapture({ visible, onClose, onCapture }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const camRef = useRef<CameraView>(null);

  const [prevVisible, setPrevVisible] = useState(() => visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setPhotoUri(null);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (visible) {
      if (permission && !permission.granted) {
        requestPermission();
      }
    }
  }, [visible, permission, requestPermission]);

  const shoot = async () => {
    if (!camRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await camRef.current.takePictureAsync({ quality: 0.6 });
      if (photo?.uri) setPhotoUri(photo.uri);
    } catch {
      /* capture failed — let the user retry */
    } finally {
      setBusy(false);
    }
  };

  const webUnsupported = Platform.OS === 'web' && !('mediaDevices' in (globalThis.navigator ?? {}));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet}>
          <View style={st.headerRow}>
            <Text style={st.title}>◈ FIELD CAPTURE</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}><Text style={st.close}>✕</Text></TouchableOpacity>
          </View>
          <Text style={st.subtitle}>Snap the scene — heavy vision inference is delegated to your peer node.</Text>

          <View style={st.stage}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : permission?.granted && !webUnsupported ? (
              <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />
            ) : (
              <View style={st.permFallback}>
                <Text style={st.permIcon}>📷</Text>
                <Text style={st.permText}>
                  {webUnsupported ? 'Camera capture is unavailable here.' : 'Camera access is required to capture a scene.'}
                </Text>
                {!webUnsupported && (
                  <TouchableOpacity style={st.permBtn} onPress={requestPermission}>
                    <Text style={st.permBtnText}>GRANT CAMERA ACCESS</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <View pointerEvents="none" style={st.reticle}>
              <View style={[st.corner, st.tl]} /><View style={[st.corner, st.tr]} />
              <View style={[st.corner, st.bl]} /><View style={[st.corner, st.br]} />
            </View>
          </View>

          {/* Controls */}
          {photoUri ? (
            <View style={st.row}>
              <TouchableOpacity style={[st.action, st.retake]} onPress={() => setPhotoUri(null)}>
                <Text style={[st.actionText, { color: C.text2 }]}>↺ RETAKE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.action, st.use]} onPress={() => onCapture(photoUri)}>
                <Text style={[st.actionText, { color: '#020617' }]}>✓ USE PHOTO</Text>
              </TouchableOpacity>
            </View>
          ) : (
            permission?.granted && !webUnsupported && (
              <TouchableOpacity style={st.shutter} onPress={shoot} disabled={busy}>
                {busy ? <ActivityIndicator color={C.cyan} /> : <View style={st.shutterInner} />}
              </TouchableOpacity>
            )
          )}
        </View>
      </View>
    </Modal>
  );
}

const FRAME = 240;
const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.bg, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.sheet, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.border, padding: 22, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '900', color: C.cyan, letterSpacing: 2, fontFamily: 'monospace' },
  close: { fontSize: 20, color: C.text2, fontWeight: '700' },
  subtitle: { fontSize: 12, color: C.text2, marginTop: 8, marginBottom: 18, lineHeight: 18 },

  stage: { width: '100%', aspectRatio: 1, maxHeight: 360, borderRadius: 16, overflow: 'hidden', backgroundColor: '#020617', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  reticle: { position: 'absolute', width: FRAME, height: FRAME },
  corner: { position: 'absolute', width: 32, height: 32, borderColor: C.cyan },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },

  permFallback: { padding: 24, alignItems: 'center' },
  permIcon: { fontSize: 40, marginBottom: 12 },
  permText: { color: C.text2, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  permBtn: { backgroundColor: C.cyan, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12 },
  permBtnText: { color: '#020617', fontWeight: '900', fontSize: 12, letterSpacing: 1, fontFamily: 'monospace' },

  shutter: { alignSelf: 'center', marginTop: 20, width: 68, height: 68, borderRadius: 34, borderWidth: 3, borderColor: C.cyan, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: C.cyan },

  row: { flexDirection: 'row', gap: 12, marginTop: 20 },
  action: { flex: 1, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  retake: { borderWidth: 1, borderColor: C.border, backgroundColor: 'rgba(0,0,0,0.3)' },
  use: { backgroundColor: C.green },
  actionText: { fontSize: 13, fontWeight: '900', letterSpacing: 1.5, fontFamily: 'monospace' },
});
