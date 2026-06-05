import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ScrollView, StatusBar, Alert, Animated, Easing
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { runRoute, type RouteResult } from './src/core/router';
import { pairWithProvider, getPairedProviderKey, clearPairing } from './src/core/p2p';

// ── Colors ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#050914',
  card: '#0a101f',
  cardActive: '#0f172a',
  border: '#1e293b',
  borderGlow: '#38bdf8',
  cyan: '#06b6d4',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  text: '#f8fafc',
  text2: '#94a3b8',
  muted: '#475569',
  white: '#ffffff',
  glass: 'rgba(15, 23, 42, 0.75)'
};

export default function App() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<RouteResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [providerKey, setProviderKey] = useState('');
  const [paired, setPaired] = useState<string | null>(getPairedProviderKey());
  
  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
      ])
    ).start();
  }, [pulseAnim]);

  useEffect(() => {
    if (result) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [result, fadeAnim]);

  const handlePair = useCallback(() => {
    try {
      pairWithProvider(providerKey.trim());
      setPaired(getPairedProviderKey());
    } catch (e: unknown) {
      Alert.alert('Pairing failed', e instanceof Error ? e.message : 'Invalid provider key.');
    }
  }, [providerKey]);

  const handleDisconnect = useCallback(() => {
    clearPairing();
    setPaired(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setProcessing(true);
    setResult(null);
    try {
      const r = await runRoute(q);
      setResult(r);
    } catch (e: unknown) {
      Alert.alert('Inference failed', e instanceof Error ? e.message : 'Is QVAC runtime available?');
    } finally {
      setProcessing(false);
    }
  }, [query]);

  const delegateReady = paired !== null;
  const modeColor = delegateReady ? C.cyan : C.green;
  const modeLabel = delegateReady ? 'LINK ESTABLISHED' : 'LOCAL SANDBOX';

  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.container}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        
        {/* Header Dashboard */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <Text style={s.logoIcon}>📡</Text>
            <View>
              <Text style={s.title}>BEACON</Text>
              <Text style={s.subtitle}>P2P FIELD ASSISTANT_v1.0</Text>
            </View>
          </View>
          <View style={[s.pill, { borderColor: `${C.green}50`, backgroundColor: `${C.green}15` }]}>
            <View style={[s.dot, { backgroundColor: C.green }]} />
            <Text style={[s.pillText, { color: C.green }]}>SYS: OFFLINE · QVAC</Text>
          </View>
        </View>

        {/* Topology Matrix */}
        <Animated.View style={[s.topoBadge, { borderColor: `${modeColor}50`, backgroundColor: `${modeColor}10`, transform: [{ scale: delegateReady ? pulseAnim : 1 }] }]}>
          <View style={s.topoIconWrapper}>
            <Text style={s.topoIcon}>{delegateReady ? '📡' : '📱'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.topoLabel, { color: modeColor }]}>{modeLabel}</Text>
            <Text style={s.topoSub}>
              {delegateReady ? 'Heavy compute routed to external node' : 'All operations restricted to internal logic'}
            </Text>
          </View>
        </Animated.View>

        {/* Uplink Controls */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>[ NETWORK UPLINK ]</Text>
          {!paired ? (
            <View style={s.glassCard}>
              <TextInput
                style={s.inputMono}
                placeholder="AWAITING PUBLIC KEY HEX [64-CHAR]..."
                placeholderTextColor={C.muted}
                value={providerKey}
                onChangeText={setProviderKey}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[s.btn, { backgroundColor: C.cyan }, !providerKey.trim() && { opacity: 0.3 }]}
                onPress={handlePair}
                disabled={!providerKey.trim()}
              >
                <Text style={[s.btnText, { color: C.bg }]}>INITIALIZE PAIRING</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[s.glassCard, { borderColor: C.cyan }]}>
              <View style={s.peerInfo}>
                <Text style={s.peerStatus}>UPLINK SECURED</Text>
                <Text style={s.peerKey} numberOfLines={1}>{paired}</Text>
              </View>
              <TouchableOpacity style={s.btnDanger} onPress={handleDisconnect}>
                <Text style={s.btnDangerText}>SEVER CONNECTION</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Data Query */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>[ QUERY CONSOLE ]</Text>
          <View style={s.glassCard}>
            <TextInput
              style={s.inputArea}
              placeholder="Enter analysis parameters..."
              placeholderTextColor={C.muted}
              value={query}
              onChangeText={setQuery}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[
                s.btn, 
                { backgroundColor: processing ? C.amber : C.green }, 
                (!query.trim() || processing) && { opacity: 0.5 }
              ]}
              onPress={handleSubmit}
              disabled={!query.trim() || processing}
            >
              <Text style={[s.btnText, { color: C.bg }]}>
                {processing ? 'EXECUTING PROTOCOL...' : 'EXECUTE QUERY'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Results Stream */}
        {result && (
          <Animated.View style={[s.section, { opacity: fadeAnim }]}>
            <Text style={s.sectionTitle}>[ OUTPUT DATA ]</Text>
            <View style={[s.resultCard, { borderColor: result.source === 'delegated' ? C.cyan : C.green }]}>
              <View style={s.resultHeader}>
                <View style={s.resultSourcePill}>
                  <Text style={[s.resultMode, { color: result.source === 'delegated' ? C.cyan : C.green }]}>
                    SRC: {result.source === 'delegated' ? 'EXTERNAL' : 'INTERNAL'}
                  </Text>
                </View>
                <Text style={s.latency}>{result.latencyMs}ms</Text>
              </View>
              <Text style={s.resultText}>{result.text}</Text>
              {result.tokensPerSec != null && (
                <View style={s.telemetry}>
                  <Text style={s.telemetryText}>
                    ⏱ {result.latencyMs}ms · {result.tokenCount ?? 0} tok · {result.tokensPerSec.toFixed(1)} tok/s
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

      </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 60 },
  
  header: { marginBottom: 30, marginTop: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  logoIcon: { fontSize: 42, marginRight: 12, textShadowColor: C.cyan, textShadowOffset: {width: 0, height: 0}, textShadowRadius: 10 },
  title: { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: 4, fontFamily: 'monospace' },
  subtitle: { fontSize: 12, color: C.cyan, fontWeight: '700', letterSpacing: 2, fontFamily: 'monospace' },
  
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 2, fontFamily: 'monospace' },

  topoBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 24, shadowColor: C.cyan, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 10 },
  topoIconWrapper: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  topoIcon: { fontSize: 20 },
  topoLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 2, fontFamily: 'monospace', marginBottom: 4 },
  topoSub: { fontSize: 11, color: C.text2, lineHeight: 16 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.text2, letterSpacing: 2, fontFamily: 'monospace', marginBottom: 12 },
  
  glassCard: { backgroundColor: C.glass, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16 },
  
  inputMono: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: '#334155', borderRadius: 8, padding: 14, color: C.cyan, fontSize: 11, fontFamily: 'monospace', marginBottom: 16 },
  inputArea: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: '#334155', borderRadius: 8, padding: 16, color: C.text, fontSize: 14, minHeight: 100, lineHeight: 22, marginBottom: 16 },
  
  btn: { borderRadius: 8, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '900', letterSpacing: 2, fontFamily: 'monospace' },
  
  btnDanger: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: C.red, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  btnDangerText: { color: C.red, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, fontFamily: 'monospace' },

  peerInfo: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  peerStatus: { fontSize: 11, color: C.cyan, fontWeight: '800', letterSpacing: 2, fontFamily: 'monospace', marginBottom: 6 },
  peerKey: { fontSize: 10, color: C.text2, fontFamily: 'monospace' },

  resultCard: { backgroundColor: C.glass, borderWidth: 1, borderRadius: 12, padding: 16, borderLeftWidth: 4 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 12 },
  resultSourcePill: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  resultMode: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, fontFamily: 'monospace' },
  latency: { fontSize: 11, color: C.amber, fontFamily: 'monospace', fontWeight: '700' },
  resultText: { fontSize: 14, color: C.text, lineHeight: 24 },
  telemetry: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  telemetryText: { fontSize: 11, color: C.text2, fontFamily: 'monospace', letterSpacing: 0.5 }
});
