import React, { useEffect, useState } from 'react';
import {
  Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { cancelNfc, readProviderKeyViaNfc } from '../core/nfc';

const C = {
  bg: 'rgba(2, 6, 23, 0.97)',
  sheet: '#0a101f',
  cyan: '#06b6d4',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  text: '#f8fafc',
  text2: '#94a3b8',
  border: '#1e293b',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onScan: (providerKey: string) => void;
}

type State = 'waiting' | 'found' | 'error';

export default function NfcPairModal({ visible, onClose, onScan }: Props) {
  const [state, setState] = useState<State>('waiting');
  const [message, setMessage] = useState('');
  
  // Use lazy initial state for stable Animated.Value objects to avoid accessing refs during render
  const [wave1] = useState(() => new Animated.Value(0));
  const [wave2] = useState(() => new Animated.Value(0));

  const [prevVisible, setPrevVisible] = useState(() => visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setState('waiting');
      setMessage('');
    }
  }

  // Concentric pulsing waves while waiting for a tap.
  useEffect(() => {
    if (!visible) return;
    const mk = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: false }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: false }),
        ])
      );
    const a = mk(wave1, 0);
    const b = mk(wave2, 800);
    a.start();
    b.start();
    return () => { a.stop(); b.stop(); };
  }, [visible, wave1, wave2]);

  // Start a reader session whenever the modal opens.
  useEffect(() => {
    if (!visible) return;
    let active = true;
    (async () => {
      try {
        const key = await readProviderKeyViaNfc();
        if (!active) return;
        if (key) {
          setState('found');
          setTimeout(() => active && onScan(key), 500);
        } else {
          setState('error');
          setMessage('That tag had no valid uplink key.');
        }
      } catch (e: unknown) {
        if (!active) return;
        setState('error');
        setMessage(e instanceof Error ? e.message : 'NFC read failed.');
      }
    })();
    return () => { active = false; cancelNfc(); };
  }, [visible, onScan]);

  const ring = (v: Animated.Value, color: string) => ({
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.2] }) }],
    opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.6, 0] }),
    borderColor: color,
  });

  const accent = state === 'found' ? C.green : state === 'error' ? C.amber : C.cyan;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet}>
          <View style={st.headerRow}>
            <Text style={st.title}>◈ TAP TO PAIR</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}><Text style={st.close}>✕</Text></TouchableOpacity>
          </View>

          <View style={st.stage}>
            {state === 'waiting' && (
              <>
                <Animated.View style={[st.wave, ring(wave1, C.cyan)]} />
                <Animated.View style={[st.wave, ring(wave2, C.cyan)]} />
              </>
            )}
            <View style={[st.core, { borderColor: accent, backgroundColor: `${accent}15` }]}>
              <Text style={st.coreIcon}>{state === 'found' ? '✓' : state === 'error' ? '!' : '📶'}</Text>
            </View>
          </View>

          <Text style={[st.status, { color: accent }]}>
            {state === 'found' ? 'KEY ACQUIRED' : state === 'error' ? 'TAP FAILED' : 'HOLD NEAR PROVIDER NODE'}
          </Text>
          <Text style={st.sub}>
            {state === 'error'
              ? message
              : state === 'found'
                ? 'Establishing uplink…'
                : 'Touch the top of your phone to the provider’s NFC tag.'}
          </Text>

          {state === 'error' && (
            <TouchableOpacity style={st.retry} onPress={() => setState('waiting')}>
              <Text style={st.retryText}>RETRY TAP</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 420, backgroundColor: C.sheet, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 24, alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  title: { fontSize: 15, fontWeight: '900', color: C.cyan, letterSpacing: 2, fontFamily: 'monospace' },
  close: { fontSize: 20, color: C.text2, fontWeight: '700' },

  stage: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center', marginVertical: 18 },
  wave: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2 },
  core: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  coreIcon: { fontSize: 38, color: C.text },

  status: { fontSize: 13, fontWeight: '900', letterSpacing: 2, fontFamily: 'monospace', marginTop: 4 },
  sub: { fontSize: 12, color: C.text2, textAlign: 'center', lineHeight: 18, marginTop: 8, paddingHorizontal: 10 },

  retry: { marginTop: 18, borderWidth: 1, borderColor: C.cyan, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: C.cyan, fontWeight: '800', fontSize: 12, letterSpacing: 1.5, fontFamily: 'monospace' },
});
