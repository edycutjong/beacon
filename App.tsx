import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Easing, Image, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import CameraCapture from './src/components/CameraCapture';
import Markdown from './src/components/Markdown';
import NfcPairModal from './src/components/NfcPairModal';
import QRScanner from './src/components/QRScanner';
import { isNfcAvailable } from './src/core/nfc';
import { extractProviderKey } from './src/core/pairingLink';
import { clearPairing, getPairedProviderKey, pairWithProvider } from './src/core/p2p';
import { runRoute, type RouteResult } from './src/core/router';
import { ensureMicPermission, isVoiceAvailable, speak, startRecording, type VoiceRecorder } from './src/core/voice';

// ── Colors ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#050914',
  card: '#0a101f',
  border: '#1e293b',
  cyan: '#06b6d4',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  text: '#f8fafc',
  text2: '#94a3b8',
  muted: '#475569',
  glass: 'rgba(15, 23, 42, 0.75)',
};

type HostStatus = 'inactive' | 'pairing' | 'active';

interface HistoryEntry {
  id: number;
  query: string;
  result: RouteResult;
}

interface SourceStats {
  runs: number;
  avgLatencyMs: number;
  avgTokensPerSec: number | null;
}

interface PerfReport {
  local: SourceStats | null;
  delegated: SourceStats | null;
  /** How many times faster the mesh is than on-device (latency ratio), when both exist. */
  latencySpeedup: number | null;
  /** Throughput multiplier mesh vs on-device, when both report tok/s. */
  throughputGain: number | null;
}

function aggregate(entries: HistoryEntry[], source: RouteResult['source']): SourceStats | null {
  const rows = entries.filter((e) => e.result.source === source);
  if (rows.length === 0) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const tps = rows.map((r) => r.result.tokensPerSec).filter((n): n is number => n != null && n > 0);
  return {
    runs: rows.length,
    avgLatencyMs: Math.round(avg(rows.map((r) => r.result.latencyMs))),
    avgTokensPerSec: tps.length ? avg(tps) : null,
  };
}

function buildPerfReport(entries: HistoryEntry[]): PerfReport {
  const local = aggregate(entries, 'local');
  const delegated = aggregate(entries, 'delegated');
  const latencySpeedup =
    local && delegated && delegated.avgLatencyMs > 0 ? local.avgLatencyMs / delegated.avgLatencyMs : null;
  const throughputGain =
    local?.avgTokensPerSec && delegated?.avgTokensPerSec
      ? delegated.avgTokensPerSec / local.avgTokensPerSec
      : null;
  return { local, delegated, latencySpeedup, throughputGain };
}

const QUICK_PROMPTS = [
  { label: '⛑ Trauma triage', text: 'Patient has a deep bleeding leg wound in the field. What are the immediate triage steps?' },
  { label: '🧭 Navigation', text: 'How do I navigate to safety at night without GPS using only a compass and the stars?' },
  { label: '📻 Comms', text: 'My radio is not transmitting. Walk me through a field troubleshooting checklist.' },
];

export default function App() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<RouteResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [providerKey, setProviderKey] = useState('');
  const [paired, setPaired] = useState<string | null>(getPairedProviderKey());
  const [pairing, setPairing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [nfcOpen, setNfcOpen] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const voiceSupported = isVoiceAvailable();
  const perf = useMemo(() => buildPerfReport(history), [history]);

  // Probe NFC hardware once so the tap-to-pair button only shows when usable.
  useEffect(() => {
    let active = true;
    isNfcAvailable().then((ok) => { if (active) setNfcSupported(ok); });
    return () => { active = false; };
  }, []);

  // ── Voice input: tap to record, tap again to stop + transcribe on-device ────
  const handleMic = useCallback(async () => {
    if (recording) {
      setRecording(false);
      setTranscribing(true);
      try {
        const text = await recorderRef.current?.stopAndTranscribe();
        if (text) setQuery((q) => (q.trim() ? `${q.trim()} ${text}` : text));
      } catch (e: unknown) {
        Alert.alert('Transcription failed', e instanceof Error ? e.message : 'Could not transcribe audio.');
      } finally {
        setTranscribing(false);
        recorderRef.current = null;
      }
      return;
    }
    const ok = await ensureMicPermission();
    if (!ok) { Alert.alert('Microphone needed', 'Grant microphone access to dictate queries.'); return; }
    try {
      recorderRef.current = await startRecording();
      setRecording(true);
    } catch (e: unknown) {
      Alert.alert('Mic error', e instanceof Error ? e.message : 'Could not start recording.');
    }
  }, [recording]);

  const hostStatus: HostStatus = paired ? 'active' : pairing ? 'pairing' : 'inactive';

  // Animations
  const pulse = useRef(new Animated.Value(1)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: false })
    ).start();
  }, [pulse, sweep]);

  useEffect(() => {
    if (result) {
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: false }).start();
    }
  }, [result, fade]);

  // ── Pairing ────────────────────────────────────────────────────────────────
  const doPair = useCallback(async (key: string) => {
    if (!key) return;
    setPairing(true);
    setScannerOpen(false);
    setNfcOpen(false);
    try {
      await pairWithProvider(key.trim());
      setPaired(getPairedProviderKey());
      setProviderKey('');
    } catch (e: unknown) {
      Alert.alert('Pairing failed', e instanceof Error ? e.message : 'Invalid provider key.');
    } finally {
      setPairing(false);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    clearPairing();
    setPaired(null);
    setResult(null);
  }, []);

  // ── Deeplink: beacon://pair?key=<hex> auto-pairs the uplink ─────────────────
  const incomingUrl = Linking.useURL();
  useEffect(() => {
    const tryLink = (url: string | null) => {
      const key = extractProviderKey(url);
      if (key && !getPairedProviderKey()) doPair(key);
    };
    Linking.getInitialURL().then(tryLink).catch(() => {});
    if (incomingUrl) tryLink(incomingUrl);
  }, [incomingUrl, doPair]);

  // ── Query ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const q = query.trim();
    if (!q && !imageUri) return;
    setProcessing(true);
    setResult(null);
    try {
      const r = await runRoute(q, !!imageUri, imageUri ?? undefined);
      setResult(r);
      const label = q || '📷 Image analysis';
      setHistory((h) => [{ id: Date.now(), query: label, result: r }, ...h].slice(0, 8));
      setImageUri(null);
    } catch (e: unknown) {
      Alert.alert('Inference failed', e instanceof Error ? e.message : 'Is QVAC runtime available?');
    } finally {
      setProcessing(false);
    }
  }, [query, imageUri]);

  const modeColor = paired ? C.cyan : C.green;
  const modeLabel = paired ? 'LINK ESTABLISHED' : 'LOCAL SANDBOX';
  const rotate = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const HOST = {
    inactive: { color: C.red, label: 'P2P HOST · INACTIVE' },
    pairing: { color: C.amber, label: 'P2P HOST · SYNCING' },
    active: { color: C.green, label: 'P2P HOST · ACTIVE' },
  }[hostStatus];

  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.container}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerTop}>
              <Text style={s.logoIcon}>📡</Text>
              <View>
                <Text style={s.title}>BEACON</Text>
                <Text style={s.subtitle}>P2P FIELD ASSISTANT_v1.0</Text>
              </View>
            </View>
            <Animated.View style={[
              s.pill,
              { borderColor: `${HOST.color}55`, backgroundColor: `${HOST.color}15` },
              hostStatus === 'pairing' && { transform: [{ scale: pulse }] },
            ]}>
              <View style={[s.dot, { backgroundColor: HOST.color }]} />
              <Text style={[s.pillText, { color: HOST.color }]}>{HOST.label}</Text>
            </Animated.View>
          </View>

          {/* Radar / Topology */}
          <Animated.View style={[
            s.topoBadge,
            { borderColor: `${modeColor}55`, backgroundColor: `${modeColor}10` },
            paired && { transform: [{ scale: pulse }] },
          ]}>
            <View style={s.radar}>
              <View style={[s.radarRing, { borderColor: `${modeColor}40` }]} />
              <View style={[s.radarRingInner, { borderColor: `${modeColor}30` }]} />
              <Animated.View style={[s.radarSweep, { backgroundColor: modeColor, transform: [{ rotate }] }]} />
              <Text style={s.radarIcon}>{paired ? '📡' : '📱'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.topoLabel, { color: modeColor }]}>{modeLabel}</Text>
              <Text style={s.topoSub}>
                {paired
                  ? 'Heavy compute routed to external mesh node'
                  : 'All operations restricted to on-device logic'}
              </Text>
            </View>
          </Animated.View>

          {/* Network Uplink */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>[ NETWORK UPLINK ]</Text>

            {paired ? (
              <View style={[s.glassCard, { borderColor: C.cyan }]}>
                <View style={s.peerInfo}>
                  <View style={s.peerStatusRow}>
                    <View style={[s.dot, { backgroundColor: C.green }]} />
                    <Text style={s.peerStatus}>UPLINK SECURED</Text>
                  </View>
                  <Text style={s.peerKey} numberOfLines={1}>{paired}</Text>
                </View>
                <TouchableOpacity style={s.btnDanger} onPress={handleDisconnect}>
                  <Text style={s.btnDangerText}>✕ DISCONNECT UPLINK</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.glassCard}>
                {/* Primary: scan QR */}
                <TouchableOpacity
                  style={[s.scanBtn, pairing && { opacity: 0.5 }]}
                  onPress={() => setScannerOpen(true)}
                  disabled={pairing}
                >
                  <Text style={s.scanIcon}>⛶</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.scanTitle}>SCAN PAIRING QR</Text>
                    <Text style={s.scanSub}>Point at a provider node to initialize pairing</Text>
                  </View>
                  <Text style={s.scanChevron}>›</Text>
                </TouchableOpacity>

                {nfcSupported && (
                  <TouchableOpacity
                    style={[s.nfcBtn, pairing && { opacity: 0.5 }]}
                    onPress={() => setNfcOpen(true)}
                    disabled={pairing}
                  >
                    <Text style={s.nfcIcon}>📶</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.nfcTitle}>TAP TO PAIR · NFC</Text>
                      <Text style={s.scanSub}>Touch your phone to a provider node</Text>
                    </View>
                    <Text style={s.scanChevron}>›</Text>
                  </TouchableOpacity>
                )}

                <View style={s.dividerRow}>
                  <View style={s.divLine} /><Text style={s.divText}>OR ENTER KEY</Text><View style={s.divLine} />
                </View>

                <TextInput
                  style={s.inputMono}
                  placeholder="PUBLIC KEY HEX [64-CHAR]..."
                  placeholderTextColor={C.muted}
                  value={providerKey}
                  onChangeText={setProviderKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!pairing}
                />
                <TouchableOpacity
                  style={[s.btn, { backgroundColor: C.cyan }, (!providerKey.trim() || pairing) && { opacity: 0.3 }]}
                  onPress={() => doPair(providerKey)}
                  disabled={!providerKey.trim() || pairing}
                >
                  <Text style={[s.btnText, { color: C.bg }]}>
                    {pairing ? 'ESTABLISHING LINK...' : 'INITIALIZE PAIRING'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Query Console — gated behind a successful pairing */}
          {paired ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>[ QUERY CONSOLE ]</Text>
              <View style={s.glassCard}>
                <View style={s.chipRow}>
                  {QUICK_PROMPTS.map((p) => (
                    <TouchableOpacity key={p.label} style={s.quickChip} onPress={() => setQuery(p.text)}>
                      <Text style={s.quickChipText}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
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

                {/* Action Row: Voice & Image Attachment */}
                <View style={s.actionRow}>
                  {voiceSupported && (
                    <TouchableOpacity
                      style={[s.voiceBtn, s.actionBtn, recording && s.voiceBtnActive, transcribing && { opacity: 0.6 }]}
                      onPress={handleMic}
                      disabled={transcribing}
                    >
                      <Text style={[s.voiceIcon, recording && { color: C.red }]}>{recording ? '⏹' : '🎙'}</Text>
                      <Text style={[s.voiceText, s.actionBtnText, recording && { color: C.red }]} numberOfLines={1} adjustsFontSizeToFit>
                        {transcribing ? 'TRANSCRIBING…' : recording ? 'RECORDING' : 'DICTATE'}
                      </Text>
                      {recording && <View style={s.recDot} />}
                    </TouchableOpacity>
                  )}

                  {!imageUri && (
                    <TouchableOpacity style={[s.attachBtn, s.actionBtn]} onPress={() => setCaptureOpen(true)}>
                      <Text style={s.attachIcon}>📷</Text>
                      <Text style={[s.attachBtnText, s.actionBtnText]} numberOfLines={1} adjustsFontSizeToFit>ATTACH PHOTO</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Selected Image Thumbnail */}
                {imageUri && (
                  <View style={s.attachRow}>
                    <Image source={{ uri: imageUri }} style={s.attachThumb} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.attachLabel}>IMAGE ATTACHED</Text>
                      <Text style={s.attachSub}>{paired ? 'Will delegate vision to peer' : 'Will run vision on-device'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setImageUri(null)} hitSlop={10}>
                      <Text style={s.attachRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={[s.btn, { backgroundColor: processing ? C.amber : C.green }, (!query.trim() && !imageUri || processing) && { opacity: 0.5 }]}
                  onPress={handleSubmit}
                  disabled={(!query.trim() && !imageUri) || processing}
                >
                  <Text style={[s.btnText, { color: C.bg }]}>
                    {processing ? 'EXECUTING PROTOCOL...' : imageUri ? 'ANALYZE SCENE' : 'EXECUTE QUERY'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={s.section}>
              <Text style={s.sectionTitle}>[ QUERY CONSOLE ]</Text>
              <View style={s.lockedCard}>
                <Text style={s.lockedIcon}>🔒</Text>
                <Text style={s.lockedTitle}>CONSOLE LOCKED</Text>
                <Text style={s.lockedSub}>Establish a network uplink to unlock the query console.</Text>
              </View>
            </View>
          )}

          {/* Output */}
          {result && (
            <Animated.View style={[s.section, { opacity: fade }]}>
              <Text style={s.sectionTitle}>[ OUTPUT DATA ]</Text>
              <ResultCard result={result} canSpeak={voiceSupported} />
            </Animated.View>
          )}

          {/* Delegation performance — local vs mesh, from real session telemetry */}
          {perf.delegated && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>[ DELEGATION PERFORMANCE ]</Text>
              <View style={s.glassCard}>
                {perf.latencySpeedup != null && perf.latencySpeedup >= 1 && (
                  <View style={s.perfHeadline}>
                    <Text style={s.perfHeadlineNum}>{perf.latencySpeedup.toFixed(1)}×</Text>
                    <Text style={s.perfHeadlineLabel}>
                      FASTER ON MESH{perf.throughputGain ? ` · ${perf.throughputGain.toFixed(1)}× THROUGHPUT` : ''}
                    </Text>
                  </View>
                )}
                <View style={s.perfCols}>
                  <PerfColumn label="ON-DEVICE" color={C.green} stats={perf.local} />
                  <View style={s.perfDivider} />
                  <PerfColumn label="EXTERNAL MESH" color={C.amber} stats={perf.delegated} />
                </View>
                <Text style={s.perfFootnote}>
                  Measured on-device · {(perf.local?.runs ?? 0) + (perf.delegated?.runs ?? 0)} run(s) this session
                </Text>
              </View>
            </View>
          )}

          {/* Session log */}
          {history.length > 1 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>[ SESSION LOG ]</Text>
              {history.slice(1).map((h) => (
                <TouchableOpacity key={h.id} style={s.logRow} onPress={() => { setQuery(h.query); setResult(h.result); }}>
                  <View style={[s.logDot, { backgroundColor: h.result.source === 'delegated' ? C.amber : C.green }]} />
                  <Text style={s.logText} numberOfLines={1}>{h.query}</Text>
                  <Text style={s.logLatency}>{h.result.latencyMs}ms</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

        </ScrollView>

        <QRScanner visible={scannerOpen} onClose={() => setScannerOpen(false)} onScan={doPair} />
        <NfcPairModal visible={nfcOpen} onClose={() => setNfcOpen(false)} onScan={doPair} />
        <CameraCapture
          visible={captureOpen}
          onClose={() => setCaptureOpen(false)}
          onCapture={(uri) => { setImageUri(uri); setCaptureOpen(false); }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ── Result card with markdown body ──────────────────────────────────────────
function ResultCard({ result, canSpeak }: { result: RouteResult; canSpeak: boolean }) {
  const accent = result.source === 'delegated' ? C.amber : C.green;
  const [speaking, setSpeaking] = useState(false);

  const handleSpeak = useCallback(async () => {
    if (speaking) return;
    setSpeaking(true);
    try {
      await speak(result.text);
    } catch (e: unknown) {
      Alert.alert('Playback failed', e instanceof Error ? e.message : 'Could not synthesize speech.');
    } finally {
      setSpeaking(false);
    }
  }, [result.text, speaking]);

  return (
    <View style={[s.resultCard, { borderColor: accent }]}>
      <View style={s.resultHeader}>
        <View style={s.resultSourcePill}>
          <Text style={[s.resultMode, { color: accent }]}>
            SRC: {result.source === 'delegated' ? 'EXTERNAL MESH' : 'ON-DEVICE'}
          </Text>
        </View>
        <View style={s.resultHeaderRight}>
          {canSpeak && (
            <TouchableOpacity style={s.speakBtn} onPress={handleSpeak} disabled={speaking} hitSlop={8}>
              <Text style={[s.speakText, speaking && { color: accent }]}>{speaking ? '🔊 …' : '🔊 SPEAK'}</Text>
            </TouchableOpacity>
          )}
          <Text style={s.latency}>{result.latencyMs}ms</Text>
        </View>
      </View>

      <View style={s.modelRow}>
        <View style={[s.modelChip, { borderColor: result.domain === 'medical' ? `${C.cyan}80` : '#334155' }]}>
          <Text style={[s.modelChipText, { color: result.domain === 'medical' ? C.cyan : C.text2 }]}>⬡ {result.model}</Text>
        </View>
        {result.domain === 'medical' && (
          <View style={[s.modelChip, { borderColor: `${C.cyan}80`, backgroundColor: `${C.cyan}10` }]}>
            <Text style={[s.modelChipText, { color: C.cyan }]}>MEDICAL TRIAGE</Text>
          </View>
        )}
      </View>

      {/* Markdown-rendered model output */}
      <Markdown>{result.text}</Markdown>

      {result.citations.length > 0 && (
        <View style={s.sources}>
          <Text style={s.sourcesTitle}>📑 SOURCES · OFFLINE FIELD MANUAL</Text>
          {result.citations.map((c) => (
            <View key={c.id} style={s.citation}>
              <Text style={s.citationPage}>p.{c.page}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.citationTitle}>{c.title}</Text>
                <Text style={s.citationSnippet} numberOfLines={2}>{c.snippet}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {result.tokensPerSec != null && (
        <View style={s.telemetry}>
          <Text style={s.telemetryText}>
            ⏱ {result.latencyMs}ms · {result.tokenCount ?? 0} tok · {result.tokensPerSec.toFixed(1)} tok/s
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Delegation performance column ───────────────────────────────────────────
function PerfColumn({ label, color, stats }: { label: string; color: string; stats: SourceStats | null }) {
  return (
    <View style={s.perfCol}>
      <View style={s.perfColHead}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={[s.perfColLabel, { color }]}>{label}</Text>
      </View>
      {stats ? (
        <>
          <Text style={s.perfMetric}>{stats.avgLatencyMs}<Text style={s.perfUnit}>ms</Text></Text>
          <Text style={s.perfMetricSub}>avg latency</Text>
          <Text style={s.perfMetric2}>
            {stats.avgTokensPerSec != null ? stats.avgTokensPerSec.toFixed(1) : '—'}
            <Text style={s.perfUnit}> tok/s</Text>
          </Text>
          <Text style={s.perfRuns}>{stats.runs} run{stats.runs === 1 ? '' : 's'}</Text>
        </>
      ) : (
        <Text style={s.perfEmpty}>No runs yet</Text>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 60 },

  header: { marginBottom: 26, marginTop: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  logoIcon: { fontSize: 42, marginRight: 12, textShadowColor: C.cyan, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  title: { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: 4, fontFamily: 'monospace' },
  subtitle: { fontSize: 12, color: C.cyan, fontWeight: '700', letterSpacing: 2, fontFamily: 'monospace' },

  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 2, fontFamily: 'monospace' },

  topoBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 24, boxShadow: `0px 0px 14px ${C.cyan}22` },
  radar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 16, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.35)' },
  radarRing: { position: 'absolute', width: 52, height: 52, borderRadius: 26, borderWidth: 1 },
  radarRingInner: { position: 'absolute', width: 32, height: 32, borderRadius: 16, borderWidth: 1 },
  radarSweep: { position: 'absolute', width: 26, height: 2, left: 26, top: 25, transformOrigin: 'left center', opacity: 0.7 },
  radarIcon: { fontSize: 18 },
  topoLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 2, fontFamily: 'monospace', marginBottom: 4 },
  topoSub: { fontSize: 11, color: C.text2, lineHeight: 16 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.text2, letterSpacing: 2, fontFamily: 'monospace', marginBottom: 12 },

  glassCard: { backgroundColor: C.glass, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16 },

  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: `${C.cyan}12`, borderWidth: 1, borderColor: `${C.cyan}55`, borderRadius: 10, padding: 16 },
  scanIcon: { fontSize: 26, color: C.cyan },
  scanTitle: { fontSize: 13, fontWeight: '900', color: C.cyan, letterSpacing: 1.5, fontFamily: 'monospace' },
  scanSub: { fontSize: 11, color: C.text2, marginTop: 3 },
  scanChevron: { fontSize: 26, color: C.cyan, fontWeight: '300' },

  nfcBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: `${C.green}10`, borderWidth: 1, borderColor: `${C.green}45`, borderRadius: 10, padding: 16, marginTop: 12 },
  nfcIcon: { fontSize: 24 },
  nfcTitle: { fontSize: 13, fontWeight: '900', color: C.green, letterSpacing: 1.5, fontFamily: 'monospace' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  divLine: { flex: 1, height: 1, backgroundColor: C.border },
  divText: { fontSize: 9, color: C.muted, letterSpacing: 1.5, fontFamily: 'monospace' },

  inputMono: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: '#334155', borderRadius: 8, padding: 14, color: C.cyan, fontSize: 11, fontFamily: 'monospace', marginBottom: 16 },
  inputArea: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: '#334155', borderRadius: 8, padding: 16, color: C.text, fontSize: 14, minHeight: 100, lineHeight: 22, marginBottom: 16 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  quickChip: { borderWidth: 1, borderColor: '#334155', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.3)' },
  quickChipText: { fontSize: 11, color: C.text2, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  actionBtn: { flex: 1, marginBottom: 0, paddingVertical: 14, gap: 6 },
  actionBtnText: { fontSize: 11, letterSpacing: 1 },

  attachBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: `${C.cyan}45`, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 12, marginBottom: 16, backgroundColor: `${C.cyan}08` },
  attachIcon: { fontSize: 16 },
  attachBtnText: { fontSize: 12, fontWeight: '800', color: C.cyan, letterSpacing: 1, fontFamily: 'monospace' },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: `${C.cyan}55`, borderRadius: 8, padding: 10, marginBottom: 16, backgroundColor: 'rgba(0,0,0,0.3)' },
  attachThumb: { width: 48, height: 48, borderRadius: 6, backgroundColor: '#020617' },
  attachLabel: { fontSize: 11, fontWeight: '800', color: C.cyan, letterSpacing: 1, fontFamily: 'monospace' },
  attachSub: { fontSize: 11, color: C.text2, marginTop: 2 },
  attachRemove: { fontSize: 18, color: C.text2, fontWeight: '700', paddingHorizontal: 4 },

  voiceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: `${C.green}45`, borderRadius: 8, paddingVertical: 11, marginBottom: 12, backgroundColor: `${C.green}08` },
  voiceBtnActive: { borderColor: C.red, backgroundColor: `${C.red}12` },
  voiceIcon: { fontSize: 15, color: C.green },
  voiceText: { fontSize: 12, fontWeight: '800', color: C.green, letterSpacing: 1, fontFamily: 'monospace' },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red },

  btn: { borderRadius: 8, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '900', letterSpacing: 2, fontFamily: 'monospace' },

  btnDanger: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: C.red, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  btnDangerText: { color: C.red, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, fontFamily: 'monospace' },

  peerInfo: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
  peerStatusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  peerStatus: { fontSize: 11, color: C.cyan, fontWeight: '800', letterSpacing: 2, fontFamily: 'monospace' },
  peerKey: { fontSize: 10, color: C.text2, fontFamily: 'monospace' },

  lockedCard: { backgroundColor: C.glass, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', borderRadius: 12, padding: 28, alignItems: 'center' },
  lockedIcon: { fontSize: 30, marginBottom: 10, opacity: 0.7 },
  lockedTitle: { fontSize: 12, fontWeight: '800', color: C.text2, letterSpacing: 2, fontFamily: 'monospace', marginBottom: 6 },
  lockedSub: { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 18 },

  resultCard: { backgroundColor: C.glass, borderWidth: 1, borderRadius: 12, padding: 16, borderLeftWidth: 4 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 12 },
  resultHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultSourcePill: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  resultMode: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, fontFamily: 'monospace' },
  speakBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  speakText: { fontSize: 10, fontWeight: '800', color: C.text2, letterSpacing: 1, fontFamily: 'monospace' },
  latency: { fontSize: 11, color: C.amber, fontFamily: 'monospace', fontWeight: '700' },

  modelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  modelChip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.3)' },
  modelChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, fontFamily: 'monospace' },

  sources: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  sourcesTitle: { fontSize: 10, fontWeight: '800', color: C.cyan, letterSpacing: 1.5, fontFamily: 'monospace', marginBottom: 10 },
  citation: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  citationPage: { fontSize: 10, fontWeight: '800', color: C.amber, fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, overflow: 'hidden' },
  citationTitle: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 2 },
  citationSnippet: { fontSize: 11, color: C.text2, lineHeight: 16 },

  telemetry: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  telemetryText: { fontSize: 11, color: C.text2, fontFamily: 'monospace', letterSpacing: 0.5 },

  perfHeadline: { alignItems: 'center', marginBottom: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  perfHeadlineNum: { fontSize: 40, fontWeight: '900', color: C.amber, fontFamily: 'monospace', letterSpacing: 1, textShadowColor: `${C.amber}66`, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16 },
  perfHeadlineLabel: { fontSize: 10, fontWeight: '800', color: C.text2, letterSpacing: 2, fontFamily: 'monospace', marginTop: 4 },
  perfCols: { flexDirection: 'row', alignItems: 'stretch' },
  perfCol: { flex: 1, alignItems: 'center' },
  perfColHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  perfColLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, fontFamily: 'monospace' },
  perfDivider: { width: 1, backgroundColor: C.border, marginHorizontal: 8 },
  perfMetric: { fontSize: 26, fontWeight: '900', color: C.text, fontFamily: 'monospace' },
  perfMetric2: { fontSize: 20, fontWeight: '800', color: C.text, fontFamily: 'monospace', marginTop: 8 },
  perfUnit: { fontSize: 12, fontWeight: '700', color: C.text2 },
  perfMetricSub: { fontSize: 9, color: C.muted, letterSpacing: 1, fontFamily: 'monospace', marginTop: 2 },
  perfRuns: { fontSize: 9, color: C.muted, letterSpacing: 1, fontFamily: 'monospace', marginTop: 6 },
  perfEmpty: { fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 16 },
  perfFootnote: { fontSize: 9, color: C.muted, letterSpacing: 1, fontFamily: 'monospace', textAlign: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },

  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  logDot: { width: 7, height: 7, borderRadius: 4 },
  logText: { flex: 1, fontSize: 12, color: C.text2 },
  logLatency: { fontSize: 10, color: C.muted, fontFamily: 'monospace' },
});
