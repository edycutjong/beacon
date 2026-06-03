<div align="center">
  <h1>Beacon 📡</h1>
  <p><em>Offline P2P field assistant — delegates heavy AI inference from a phone to a nearby laptop via QVAC's peer-to-peer compute mesh. No cloud, no internet, just local Wi-Fi Direct.</em></p>
  <img src="docs/readme-hero.png" alt="Beacon" width="100%">

  <br/>

  [![Built for QVAC Hackathon](https://img.shields.io/badge/DoraHacks-QVAC%20Edge%20AI-8b5cf6?style=for-the-badge)](https://dorahacks.io)
  [![Track](https://img.shields.io/badge/Track-Mobile-06b6d4?style=for-the-badge)](https://dorahacks.io)

  <br/>

  ![Expo](https://img.shields.io/badge/Expo_56-000020?style=flat&logo=expo&logoColor=white)
  ![React Native](https://img.shields.io/badge/React_Native_0.85-61DAFB?style=flat&logo=react&logoColor=black)
  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
  ![QVAC](https://img.shields.io/badge/@qvac/sdk-06b6d4?style=flat)
  [![CI](https://github.com/edycutjong/beacon/actions/workflows/ci.yml/badge.svg)](https://github.com/edycutjong/beacon/actions/workflows/ci.yml)

</div>

---

## 💡 The Problem & Solution

In field conditions — disaster zones, remote construction sites, wilderness — AI assistants are useless because there's no internet. Even if you have a phone, its small model can't handle complex queries.

**Beacon** solves this by creating a **P2P compute mesh** between a phone and a nearby laptop:

**Key Features:**
- 📡 **P2P Delegation** — Heavy queries offloaded to laptop via Wi-Fi Direct
- 🔄 **Auto Fallback** — If peer drops, routes to on-device small model instantly
- 🔐 **Ed25519 Pairing** — Secure peer authentication without cloud PKI
- 📊 **Topology Indicator** — Shows "LOCAL" vs "DELEGATED → Laptop-01"
- 🔇 **100% Offline** — No internet required, ever

## 🏗️ Architecture & Tech Stack

```
[Phone App] ←── Wi-Fi Direct ──→ [Laptop Provider]
     ↓                                    ↓
  @qvac/sdk                         @qvac/sdk
  (small model)                    (large model)
     ↓                                    ↓
  Local fallback              Heavy inference (delegate)
```

| Layer | Technology |
|---|---|
| **Mobile App** | Expo 56, React Native 0.85, React 19 |
| **AI Engine** | @qvac/sdk (completion, RAG, TTS, P2P) |
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

```bash
git clone https://github.com/edycutjong/beacon.git
cd beacon
npm install
python3 scripts/seed.py

# Start laptop provider
node src/node/provider.ts

# Start phone app
npx expo start
```

## 📊 Benchmarks

Run `python3 scripts/bench.py` to reproduce. Results on iPhone 15 + MacBook Pro M2:

| Metric | Local (Phone) | Delegated (Laptop) | Budget |
|---|---|---|---|
| TTFT | ~800ms | ~120ms | <2,000ms |
| Tokens/sec | ~12 | ~45 | >5 |
| Fallback Switch | ~200ms | — | <500ms |
| Peak RAM (phone) | ~1.1GB | ~0.3GB | <2,048MB |

> *Simulated timings — run `python3 scripts/bench.py` on your hardware for real @qvac/sdk measurements.*

## 🧪 Testing & CI

**3 E2E suites + offline verification checks = 10+ test assertions.** Target: 100+ with unit tests.

**5-stage pipeline:** Quality → Security → Build → Offline Verify → Deploy

```bash
# ── Evidence Bundle ─────────────────────────
python3 scripts/verify_offline.py
python3 scripts/bench.py
python3 scripts/check_submission_readiness.py
```

| Layer | Tool | Status |
|---|---|---|
| Code Quality | TypeScript strict | ✅ |
| Security (SAST) | CodeQL | ✅ |
| Security (SCA) | Dependabot + npm audit | ✅ |
| Secret Scanning | TruffleHog | ✅ |
| Offline Verification | verify_offline.py | ✅ |

## 📁 Project Structure
```
beacon/
├── docs/               # README assets
├── e2e/                # Playwright E2E specs
├── scripts/            # seed, bench, verify, readiness
├── src/
│   ├── core/
│   │   ├── qvac.ts     # @qvac/sdk wrapper
│   │   ├── p2p.ts      # P2P host/pair lifecycle
│   │   └── router.ts   # Local vs delegate routing
│   └── node/
│       └── provider.ts # Laptop-side daemon
├── App.tsx             # Expo UI (pairing + query)
├── .github/            # CI/CD + CodeQL + Dependabot
└── README.md
```

## ⚠️ Honest Limitations

1. P2P pairing requires same local network
2. No QR pairing flow (manual key exchange)
3. Limited to text queries in current UI
4. Provider daemon is a stub

## 📄 License
[MIT](LICENSE) © 2026 Edy Cu

## 🙏 Acknowledgments
Built for **QVAC Hackathon I — Unleash Edge AI** (DoraHacks). Edge AI isn't about one device — it's about a mesh. QVAC makes that possible.
