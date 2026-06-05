import React, { useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ScrollView, SafeAreaView, StatusBar, Alert,
} from 'react-native';
import { runRoute, type RouteResult } from './src/core/router';
import { pairWithProvider, getPairedProviderKey, clearPairing } from './src/core/p2p';

// ── Colors ──────────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0e1a', card: '#111827', border: '#1e293b',
  cyan: '#06b6d4', green: '#22c55e', amber: '#f59e0b', red: '#ef4444',
  text: '#f1f5f9', text2: '#94a3b8', muted: '#64748b', white: '#fff',
};

// ── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<RouteResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [providerKey, setProviderKey] = useState('');
  const [paired, setPaired] = useState<string | null>(getPairedProviderKey());

  // Pair with a laptop provider using its Ed25519 public key (printed by the
  // provider daemon). Real validation lives in p2p.pairWithProvider().
  const handlePair = useCallback(() => {
    try {
      pairWithProvider(providerKey.trim());
      setPaired(getPairedProviderKey());
    } catch (e: unknown) {
      Alert.alert('Pairing failed', e instanceof Error ? e.message : 'Invalid provider key (64-char hex required).');
    }
  }, [providerKey]);

  const handleDisconnect = useCallback(() => {
    clearPairing();
    setPaired(null);
    Alert.alert('Unpaired', 'Heavy queries will now run on-device (local fallback).');
  }, []);

  // Real inference: the router decides local vs. delegated and falls back
  // automatically if the peer is unreachable.
  const handleSubmit = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setProcessing(true);
    setResult(null);
    try {
      const r = await runRoute(q);
      setResult(r);
    } catch (e: unknown) {
      Alert.alert('Inference failed', e instanceof Error ? e.message : 'Could not run inference. Is the QVAC runtime available on this device?');
    } finally {
      setProcessing(false);
    }
  }, [query]);

  const delegateReady = paired !== null;
  const modeColor = delegateReady ? C.cyan : C.green;
  const modeLabel = delegateReady ? 'DELEGATE READY' : 'LOCAL ONLY';

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={s.header}>
          <Text style={{ fontSize: 48 }}>📡</Text>
          <Text style={s.title}>Beacon</Text>
          <Text style={s.subtitle}>P2P Field Assistant</Text>
          <View style={[s.pill, { borderColor: `${C.green}50`, backgroundColor: `${C.green}15` }]}>
            <View style={[s.dot, { backgroundColor: C.green }]} />
            <Text style={[s.pillText, { color: C.green }]}>OFFLINE · QVAC</Text>
          </View>
        </View>

        {/* Topology Badge */}
        <View style={[s.topoBadge, { backgroundColor: `${modeColor}15`, borderColor: `${modeColor}40` }]}>
          <Text style={[s.topoIcon, { color: modeColor }]}>{delegateReady ? '📡' : '📱'}</Text>
          <View>
            <Text style={[s.topoLabel, { color: modeColor }]}>{modeLabel}</Text>
            <Text style={s.topoSub}>
              {delegateReady ? 'Heavy queries route to the laptop peer' : 'All inference on-device'}
            </Text>
          </View>
        </View>

        {/* P2P Controls */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>P2P Compute Mesh</Text>
          {!paired && (
            <>
              <TextInput
                style={[s.input, { minHeight: 0, fontFamily: 'monospace', fontSize: 12 }]}
                placeholder="Paste the laptop provider's public key (64-char hex)"
                placeholderTextColor={C.muted}
                value={providerKey}
                onChangeText={setProviderKey}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[s.btn, { backgroundColor: C.cyan, marginTop: 12 }, !providerKey.trim() && { opacity: 0.4 }]}
                onPress={handlePair}
                disabled={!providerKey.trim()}
              >
                <Text style={s.btnText}>🔗 Pair with Laptop Provider</Text>
              </TouchableOpacity>
            </>
          )}
          {paired && (
            <View style={s.peerCard}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.peerName}>✅ Paired</Text>
                <Text style={s.peerKey} numberOfLines={1}>{paired}</Text>
              </View>
              <TouchableOpacity onPress={handleDisconnect}>
                <Text style={{ color: C.red, fontWeight: '700' }}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Query Input */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Ask a Question</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. What's the protocol for water contamination?"
            placeholderTextColor={C.muted}
            value={query}
            onChangeText={setQuery}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[s.btn, { backgroundColor: C.cyan, marginTop: 12 }, (!query.trim() || processing) && { opacity: 0.4 }]}
            onPress={handleSubmit}
            disabled={!query.trim() || processing}
          >
            <Text style={s.btnText}>{processing ? '🔄 Processing…' : '🔍 Submit Query'}</Text>
          </TouchableOpacity>
        </View>

        {/* Result */}
        {result && (
          <View style={s.section}>
            <View style={s.resultCard}>
              <View style={s.resultHeader}>
                <Text style={[s.resultMode, { color: result.source === 'delegated' ? C.cyan : C.green }]}>
                  {result.source === 'delegated' ? '📡 DELEGATED' : '📱 LOCAL'}
                </Text>
                <Text style={s.latency}>{result.latencyMs}ms</Text>
              </View>
              <Text style={s.resultText}>{result.text}</Text>
            </View>
          </View>
        )}

        {/* Model Info */}
        <View style={{ alignItems: 'center', paddingTop: 20 }}>
          <Text style={{ fontSize: 11, color: C.muted }}>
            Local: Llama 3.2 1B · Delegate: Llama 3.2 via P2P · RAG: GTE-Large-FP16
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 32, fontWeight: '800', color: C.white, letterSpacing: 1 },
  subtitle: { fontSize: 14, color: C.text2, marginTop: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, marginTop: 12, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },

  topoBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 20, gap: 14 },
  topoIcon: { fontSize: 28 },
  topoLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  topoSub: { fontSize: 12, color: C.text2, marginTop: 2 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 10 },

  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700', color: C.bg },

  peerCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14 },
  peerName: { fontSize: 15, color: C.green, fontWeight: '700' },
  peerKey: { fontSize: 11, color: C.muted, marginTop: 2, fontFamily: 'monospace' },

  input: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16, color: C.text, fontSize: 15, minHeight: 80, lineHeight: 22 },

  resultCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 18 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  resultMode: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  latency: { fontSize: 11, color: C.muted, fontFamily: 'monospace' },
  resultText: { fontSize: 14, color: C.text, lineHeight: 22 },
});
