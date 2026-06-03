import React, { useState, useCallback } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ScrollView, SafeAreaView, StatusBar, Alert, Dimensions,
} from 'react-native';

// ── Types ───────────────────────────────────────────────────────────────────

type ComputeMode = 'local' | 'delegated' | 'searching';
type ConnectionStatus = 'disconnected' | 'paired' | 'connecting';

interface PeerInfo {
  name: string;
  publicKey: string;
}

interface QueryResult {
  answer: string;
  mode: ComputeMode;
  latencyMs: number;
}

// ── Colors ──────────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0e1a', card: '#111827', border: '#1e293b',
  cyan: '#06b6d4', green: '#22c55e', amber: '#f59e0b', red: '#ef4444',
  text: '#f1f5f9', text2: '#94a3b8', muted: '#64748b', white: '#fff',
};

// ── Mock ────────────────────────────────────────────────────────────────────

function mockQuery(text: string, mode: ComputeMode): QueryResult {
  return {
    answer: mode === 'delegated'
      ? `[Delegated to Laptop-01] Based on local RAG search: ${text.length > 30 ? text.slice(0, 30) + '...' : text} — The field manual recommends assessing the situation and following standard protocol. Cross-referenced with 3 local documents.`
      : `[Local inference] Quick assessment: ${text.length > 30 ? text.slice(0, 30) + '...' : text} — Using on-device small model for rapid response. Limited depth due to phone constraints.`,
    mode,
    latencyMs: mode === 'delegated' ? 340 : 820,
  };
}

// ── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [mode, setMode] = useState<ComputeMode>('local');
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');
  const [peer, setPeer] = useState<PeerInfo | null>(null);

  const handlePair = useCallback(() => {
    setConnection('connecting');
    setTimeout(() => {
      setPeer({ name: 'Laptop-01', publicKey: 'ed25519:a1b2c3d4e5f6...' });
      setConnection('paired');
      setMode('delegated');
    }, 1200);
  }, []);

  const handleDisconnect = useCallback(() => {
    setPeer(null);
    setConnection('disconnected');
    setMode('local');
    Alert.alert('Fallback', 'Peer disconnected. Routing to local model.');
  }, []);

  const handleSubmit = useCallback(() => {
    if (!query.trim()) return;
    setProcessing(true);
    setTimeout(() => {
      setResult(mockQuery(query, mode));
      setProcessing(false);
    }, mode === 'delegated' ? 600 : 1200);
  }, [query, mode]);

  const modeColor = mode === 'delegated' ? C.cyan : mode === 'local' ? C.green : C.amber;
  const modeLabel = mode === 'delegated' ? `DELEGATED → ${peer?.name}` : 'LOCAL';

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
          <Text style={[s.topoIcon, { color: modeColor }]}>{mode === 'delegated' ? '📡' : '📱'}</Text>
          <View>
            <Text style={[s.topoLabel, { color: modeColor }]}>{modeLabel}</Text>
            <Text style={s.topoSub}>
              {mode === 'delegated' ? 'Heavy queries → laptop via P2P mesh' : 'All inference on-device'}
            </Text>
          </View>
        </View>

        {/* P2P Controls */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>P2P Compute Mesh</Text>
          {connection === 'disconnected' && (
            <TouchableOpacity style={[s.btn, { backgroundColor: C.cyan }]} onPress={handlePair}>
              <Text style={s.btnText}>🔗 Pair with Laptop Provider</Text>
            </TouchableOpacity>
          )}
          {connection === 'connecting' && (
            <View style={[s.btn, { backgroundColor: `${C.amber}20`, borderWidth: 1, borderColor: `${C.amber}40` }]}>
              <Text style={[s.btnText, { color: C.amber }]}>⏳ Searching for peers...</Text>
            </View>
          )}
          {connection === 'paired' && peer && (
            <View>
              <View style={s.peerCard}>
                <View>
                  <Text style={s.peerName}>✅ {peer.name}</Text>
                  <Text style={s.peerKey}>{peer.publicKey}</Text>
                </View>
                <TouchableOpacity onPress={handleDisconnect}>
                  <Text style={{ color: C.red, fontWeight: '700' }}>Disconnect</Text>
                </TouchableOpacity>
              </View>
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
            style={[s.btn, { backgroundColor: C.cyan, marginTop: 12 }, !query.trim() && { opacity: 0.4 }]}
            onPress={handleSubmit}
            disabled={!query.trim() || processing}
          >
            <Text style={s.btnText}>{processing ? '🔄 Processing...' : '🔍 Submit Query'}</Text>
          </TouchableOpacity>
        </View>

        {/* Result */}
        {result && (
          <View style={s.section}>
            <View style={s.resultCard}>
              <View style={s.resultHeader}>
                <Text style={[s.resultMode, { color: result.mode === 'delegated' ? C.cyan : C.green }]}>
                  {result.mode === 'delegated' ? '📡 DELEGATED' : '📱 LOCAL'}
                </Text>
                <Text style={s.latency}>{result.latencyMs}ms</Text>
              </View>
              <Text style={s.resultText}>{result.answer}</Text>
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
