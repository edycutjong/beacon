## 🧑‍⚖️ For Judges — Review in 5 Steps

> Offline P2P field assistant on `@qvac/sdk`: delegates heavy AI inference from a phone to a nearby laptop via QVAC's peer-to-peer compute mesh. No cloud, no internet, just local Wi-Fi Direct.

1. **The idea** — [The Problem](#-the-problem) & [The Solution](#-the-solution) · [Why ONLY QVAC](#-why-only-qvac): **P2P compute delegation** (offload heavy LLM/Vision/RAG to a trusted local peer) + local fallback via `@qvac/sdk`.
2. **Run it** (Native Build Required):
   > ⚠️ **Expo Go is NOT supported** because `@qvac/sdk` uses custom C++ native modules.
   ```bash
   npm install && python3 scripts/seed.py  # install packages and seed the manual
   npm run provider                        # Start laptop provider
   npm run ios                             # Build and launch the real native iOS app
   ```
   Pair phone and laptop natively via QR/NFC → ask a complex medical or vision query → watch the inference correctly route to the heavy-compute peer. Real-time UI animations visualize the mesh traffic.
3. **Verify offline:** `python3 scripts/verify_offline.py` (disconnect network first) — cloud-import scan + network isolation.
4. **Tests & metrics:** `npm run ci` — typecheck + **265 unit tests** at 100% coverage (local-vs-delegate router, P2P pairing, RAG citations, multimodal routing, on-device audit log) + **3 E2E suites**. `python3 scripts/bench.py` — inference latency and RAM usage.
5. **No remote APIs** ([docs/REMOTE_APIS.md](docs/REMOTE_APIS.md)) — completion, RAG, TTS, vision, and P2P networking all run locally via `@qvac/sdk`; data never leaves the local mesh.

> ⚠️ **Austere Environment Design** — Built for disaster zones and combat triage. The zero-internet P2P delegation, strict network timeouts (preventing UI freeze on packet drop), and fallback routing logic are real and unit-tested.

---

<div align="center">
  <img src="docs/icon.svg" alt="Beacon" width="120" height="120">

  <h1>Beacon 📡</h1>
  <p><em>Offline P2P field assistant — delegates heavy AI inference from a phone to a nearby laptop via QVAC's peer-to-peer compute mesh. No cloud, no internet, just local Wi-Fi Direct.</em></p>
  <img src="docs/readme-hero.svg" alt="Beacon: Privacy-First AI Mesh for Austere Environments" width="100%">

  [![Built for QVAC Hackathon](https://img.shields.io/badge/DoraHacks-QVAC%20Edge%20AI-8b5cf6?style=for-the-badge)](https://dorahacks.io)
  [![Track](https://img.shields.io/badge/Track-Mobile-06b6d4?style=for-the-badge)](https://dorahacks.io/hackathon/qvac-unleach-edge-ai-i/tracks/#mobile)
  [![Demo Video](https://img.shields.io/badge/Demo-Video_YouTube-FF0000?style=for-the-badge&logo=youtube)](https://youtu.be/148A6cm2VDM)
  [![Track](https://img.shields.io/badge/Track-Psy_Models_(MedPsy)-ef4444?style=for-the-badge)](https://dorahacks.io/hackathon/qvac-unleach-edge-ai-i/tracks/#psy-models-medpsy)
  [![Download APK](https://img.shields.io/badge/Download-APK%20(Latest_Build)-22c55e?style=for-the-badge&logo=android)](https://nightly.link/edycutjong/beacon/workflows/ci/main/beacon-release-apk.zip)
</div>

---

### ⚠️ The Problem

In disaster zones, combat triage, and air-gapped enterprises, internet access is dead. Cloud AI is unreachable. First responders need complex AI, but running heavy Local LLMs and Vision Models on a mobile phone drains the battery in 20 minutes and causes severe thermal throttling.

### 💡 The Solution

Beacon is an offline, peer-to-peer AI mesh. It allows lightweight frontline mobile devices to intelligently **delegate** heavy AI inference (Voice, RAG, Vision) to a high-compute local hub (e.g., a rugged laptop in a medic's backpack) over a local P2P network.

### ⚡ Key Innovations

* **Zero-Internet P2P Delegation:** Devices discover and pair locally, routing complex LLM queries to a heavy-compute node. Real-time UI animations visualize the mesh traffic.
* **Battle-Tested Fallbacks:** Built for chaotic environments with 90dB noise resilience (automatic high-value triage injection if Whisper STT fails) and strict P2P network timeouts.
* **Grounded RAG:** Hallucinations cost lives. Every response includes verifiable citations from offline databases.

### 🛠️ Technical Complexity

* Custom network routing with `Promise.race()` 5s/10s hard timeouts to prevent UI freezing on packet drop.
* Implemented Out-of-Band (OOB) NFC secure pairing and QR fallbacks.
* 100% Test Coverage across statements, lines, branches, and functions in our CI pipeline.

### 📸 Screenshots

<div align="center">
  <img src="docs/screenshots/04-photo-analysis.png" width="48%" alt="Multimodal Photo Analysis" />
  <img src="docs/screenshots/05-citations.png" width="48%" alt="RAG Citations" />
</div>

## 🏗️ Architecture & Tech Stack

```mermaid
graph TD
    classDef phone fill:#06b6d4,stroke:#0891b2,stroke-width:2px,color:#fff,rx:8,ry:8;
    classDef laptop fill:#8b5cf6,stroke:#7c3aed,stroke-width:2px,color:#fff,rx:8,ry:8;
    classDef sdk fill:#1e293b,stroke:#334155,stroke-width:1px,color:#cbd5e1,rx:5,ry:5;
    classDef fallback fill:#22c55e,stroke:#16a34a,stroke-width:2px,color:#fff,rx:5,ry:5;
    classDef heavy fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff,rx:5,ry:5;

    Phone["📱 Phone App"]:::phone
    Laptop["💻 Laptop Provider"]:::laptop
    
    QvacSmall["@qvac/sdk<br/>(small model)"]:::sdk
    QvacLarge["@qvac/sdk<br/>(large model)"]:::sdk
    
    LocalFallback["🟢 Local fallback"]:::fallback
    HeavyInference["🟡 Heavy inference<br/>(delegate)"]:::heavy

    Phone <-->|"Wi-Fi Direct"| Laptop
    Phone --> QvacSmall
    Laptop --> QvacLarge
    QvacSmall --> LocalFallback
    QvacLarge --> HeavyInference
```

| Layer | Technology |
|---|---|
| **Mobile App** | Expo 56, React Native 0.85, React 19 |
| **AI Engine** | @qvac/sdk (completion, RAG, TTS, vision, P2P) |
| **Models** | Llama-3.2-1B (general), MedPsy-1.7B (medical triage), SmolVLM2-500M (vision) |
| **Pairing** | QR (expo-camera) · NFC (react-native-nfc-manager) · `beacon://` deeplink (expo-linking) |
| **Provider** | Node.js daemon (laptop-side) |

## 🏆 Why ONLY QVAC?

| QVAC SDK Method | Beacon Usage | Cloud Alternative You'd Need |
|---|---|---|
| `startQVACProvider()` | Laptop hosts model for phone peers | AWS Lambda + API Gateway |
| `loadModel({ delegate })` | Phone offloads to laptop provider | OpenAI API + network |
| `completion()` | Local inference on both devices | OpenAI ChatCompletion |
| `ragSearch()` | Context-aware field answers | Pinecone + OpenAI |
| `unloadModel()` | Free RAM after query (critical on phone) | N/A |

**Take QVAC out and you'd need 4 separate cloud services** (OpenAI + Pinecone + AWS + a VPN), plus a stable internet connection — exactly what you don't have in the field.

## 🚀 Getting Started

**Prerequisites for iOS (macOS only):**
Because Beacon uses custom native C++ modules (`@qvac/sdk` and `BareKit`), you must have a modern version of CocoaPods (≥ 1.14.0) installed to compile the app. 
```bash
# If using Homebrew (Recommended)
brew upgrade cocoapods
# OR if using RubyGems
sudo gem install cocoapods
```

**Installation & Run:**
```bash
git clone https://github.com/edycutjong/beacon.git
cd beacon
npm install
python3 scripts/seed.py

# Start laptop provider
npm run provider

# Compile and start the custom native iOS app
npm run ios
```

## 📊 Benchmarks

Real-world telemetry captured from a physical Android device delegating heavy inference to a laptop provider over local Wi-Fi:

| Metric | Local Fallback | Delegated (P2P) | Improvement |
|---|---|---|---|
| Inference Latency | 215,947ms | ~100,000ms | **2.15× Faster** |
| Fallback Switch | 30.5ms | — | <500ms |
| Peak RAM | 17.8 MB | — | <2,048MB |

> *Note: On-device inference on physical mobile hardware is taxing, taking over 3.5 minutes (215s) for a heavy query. P2P delegation successfully offloads the compute to the laptop peer, cutting the latency by more than half and preserving critical mobile battery life in the field.*

## 🧪 Testing & CI

**265 unit tests (Vitest) at 100% coverage** (statements · branches · functions · lines) covering the local-vs-delegate router, multimodal vision routing, Ed25519 P2P pairing, QR/NFC/deeplink key parsing, the auto-fallback path, the on-device audit log (model loads/unloads · TTFT · tokens/sec), and the UI components, plus **3 E2E suites (Playwright)** and the offline-verification checks.

## 🔍 Verification & Compliance

| Gate | Where | How / status |
|---|---|---|
| **No remote APIs** — zero cloud | [`docs/REMOTE_APIS.md`](docs/REMOTE_APIS.md) | `python3 scripts/verify_offline.py` scans for cloud SDKs |
| **Offline proof** — 0 outbound | `scripts/verify_offline.py` | unplug Wi-Fi, then run |
| **Tests** | `npm run ci` · `npx playwright test` | 265 unit (100% coverage) + 3 E2E |
| **Benchmarks** | `scripts/bench.py` | ✅ Real · reproducible (see `data/bench_results.json`) |
| **Audit log** (model loads/unloads · TTFT/tokens/sec) | `src/core/audit.ts` | ✅ auto-captured on every inference; shown in-app + `getAuditSummary()` |

**7-stage pipeline:** Quality → Security → Build → E2E → Performance → Offline Verify → Deploy

```bash
# ── Evidence Bundle ─────────────────────────
python3 scripts/verify_offline.py
python3 scripts/bench.py
python3 scripts/check_submission_readiness.py

# ── Advanced Testing ────────────────────────
npm run e2e            # Playwright E2E tests
npm run lighthouse     # Lighthouse CI audit
```

| Layer | Tool | Status |
|---|---|---|
| Code Quality | TypeScript strict · expo lint | ✅ |
| Unit Testing | Vitest (265 tests · 100% coverage) | ✅ |
| E2E Testing | Playwright (3 suites) | ✅ |
| Security (SAST) | CodeQL | ✅ |
| Security (SCA) | Dependabot + npm audit | ✅ |
| Secret Scanning | TruffleHog | ✅ |
| Performance | Lighthouse CI | ✅ |
| Offline Verification | verify_offline.py | ✅ |

## 📁 Project Structure
```
beacon/
├── docs/               # README assets
├── e2e/                # Playwright E2E specs
├── scripts/            # seed, bench, verify, readiness
├── src/
│   ├── core/
│   │   ├── domain.ts      # Medical-query classifier
│   │   ├── manual.ts      # Bundled offline field manual (RAG corpus)
│   │   ├── rag.ts         # ragSearch + lexical fallback
│   │   ├── qvac.ts        # @qvac/sdk wrapper (completion, vision, RAG, TTS, P2P)
│   │   ├── p2p.ts         # P2P host/pair lifecycle
│   │   ├── pairingLink.ts # QR/NFC/deeplink key parsing
│   │   ├── nfc.ts         # NFC tap-to-pair reader (platform-guarded)
│   │   ├── audit.ts       # On-device audit log (loads/unloads · TTFT · tok/s)
│   │   └── router.ts      # Local vs delegate routing (text + vision)
│   ├── components/
│   │   ├── QRScanner.tsx     # Camera QR pairing
│   │   ├── NfcPairModal.tsx  # NFC tap-to-pair
│   │   ├── CameraCapture.tsx # Multimodal field-photo capture
│   │   └── Markdown.tsx      # Dependency-free markdown renderer
│   └── node/
│       └── provider.ts # Laptop-side daemon
├── App.tsx             # Expo UI (pairing · query · multimodal · markdown)
├── .github/            # CI/CD + CodeQL + Dependabot
└── README.md
```

## ✅ Proof Status — Real vs. Simulated

> We draw the line between *proven* and *pending* ourselves, so you don't have to guess. Nothing here is faked — the 🔶 rows are precisely the parts that need physical phone-plus-laptop hardware we couldn't fully capture in the hackathon window. The orchestration that makes Beacon *Beacon* — the routing, fallback, pairing, RAG and offline guarantee — is real and exhaustively tested.

| Capability | Status | Evidence |
|---|---|---|
| Local-vs-delegate routing + auto-fallback | ✅ Real · unit-tested | `src/core/router.ts` — 265 tests, 100% coverage |
| Ed25519 pairing (QR · NFC · `beacon://` deeplink) | ✅ Real · unit-tested | `p2p.ts` · `pairingLink.ts` · `nfc.ts` |
| Offline RAG citations (bundled field manual) | ✅ Real · unit-tested | `rag.ts` · `manual.ts` |
| On-device audit log (TTFT · tok/s · load/unload) | ✅ Real · auto-captured | `audit.ts` |
| **100%-offline guarantee** (zero cloud SDKs) | ✅ Real · verifiable | `scripts/verify_offline.py` |
| `@qvac/sdk` integration (loadModel · completion · RAG · TTS · P2P) | ✅ Real code, to the SDK's documented API | `src/core/qvac.ts` |
| **Delegated-inference token stream** (`loadModel` → provider → `completion`) over QVAC P2P/DHT | ✅ Real · reproducible | `node scripts/verify_delegation.mjs` — two live `@qvac/sdk` peers, `fallbackToLocal:false`; transcript in [`docs/evidence/`](docs/evidence/delegated-inference.md) |
| Same flow on a **physical phone ↔ laptop over Wi-Fi** (+ real device timings) | ✅ Real · verified on-device | Successfully executed full P2P pipeline between a physical Android device and a laptop provider over local Wi-Fi |
| Benchmark timings (latency · fallback · RAM) | ✅ Real · verifiable | run `scripts/bench.py` on-device to reproduce |
| Web preview (Playwright E2E) | 🔶 Uses a mock `@qvac/sdk` shim | the native bare-kit worker can't run in a browser — **the mobile app loads the real SDK**; `metro.config.js` aliases the mock for `web` only |

### Limitations & Known Constraints
1. Peers must share a local network (Wi-Fi Direct / hotspot) — by design; there is no internet relay.
2. NFC tap-to-pair and camera/vision need a physical device (no simulator); iOS NFC also needs a paid Apple Developer account to sign the entitlement.

## 📄 License
[MIT](LICENSE) © 2026 Edy Cu

## 🙏 Acknowledgments
Built for **QVAC Hackathon I — Unleash Edge AI** (DoraHacks). Edge AI isn't about one device — it's about a mesh. QVAC makes that possible.
