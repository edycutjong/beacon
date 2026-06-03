# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# 📡 Beacon — Agent Instructions

## Project
Offline P2P field assistant that delegates heavy AI inference from a phone to a nearby laptop via QVAC's peer-to-peer compute mesh. No cloud, no internet — just local Wi-Fi Direct.

## Hackathon
**QVAC Hackathon I – Unleash Edge AI** (DoraHacks) — Mobile Track + Build in Public. $21,000 USDT pool.

## Structure
- `src/core/qvac.ts` — Shared QVAC SDK wrapper (loadModel, completion, RAG, TTS, P2P)
- `src/core/p2p.ts` — P2P host/pair lifecycle (startBeaconHost, pairWithProvider)
- `src/core/router.ts` — Local-vs-delegate routing decision engine with fallback
- `src/node/provider.ts` — Laptop-side provider daemon
- `scripts/` — bench.py, verify_offline.py, seed.py, check_submission_readiness.py
- `e2e/` — Playwright E2E specs
- `App.tsx` — Expo entry point (React Native)

## Tech Stack
| Layer | Technology |
|---|---|
| **Mobile App** | Expo 56, React Native 0.85, React 19 |
| **AI Engine** | @qvac/sdk (completion, RAG, TTS, P2P) |
| **Provider** | Node.js daemon (laptop-side) |
| **Testing** | Playwright (E2E) |

## Key Rules
- **All inference** must go through `@qvac/sdk` — zero cloud APIs
- **P2P delegation** uses `startQVACProvider` + `delegate` param on `loadModel`
- **Fallback**: if peer drops, route to on-device small model automatically
- **Evidence bundle**: `verify_offline.py` must pass with Wi-Fi router unplugged
- **Colors**: Cyan (#06b6d4) for connected, Green (#22c55e) for local, Amber (#f59e0b) for delegating, Red (#ef4444) for offline/error
- **Test target**: 100+ tests stated in README

## Critical Patterns
- Router decision: `shouldDelegate(query, isImage, hasPeer)` — heavy queries + peer available → delegate
- Model lifecycle: always `unloadModel` after inference to free RAM
- P2P pairing: Ed25519 64-char hex public key validation
- `CompletionParams.images` field for multimodal inference
